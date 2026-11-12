import { randomBytes } from 'node:crypto';
import { CAPABILITY_LABELS, providerDef, type Capability, type DeliveryStatus } from '@gradeon/contracts';
import { seal, unseal } from '@gradeon/security';
import { ADAPTERS } from './providers/index.js';
import { ProviderError, segments, fill, type Adapter, type Ctx, type InboundRequest, type InboundResult, type MessageCapability } from './types.js';

type Q = Ctx['pool'];
const id = (p: string) => `${p}_${randomBytes(10).toString('base64url')}`;
const MAX_ATTEMPTS = 3;
const CACHE_MS = 10_000;

export interface HubOptions {
  pool: Q;
  secretsKey: string;
  /** The server's public address: webhook addresses and sandbox links start with it. */
  baseUrl: string;
  /** Phone tokens for a person (the school app registers them); push needs them. */
  pushTokens?: (schoolSlug: string, to: string) => Promise<string[]>;
  /** Tokens the provider says no longer exist (the app was uninstalled). */
  forgetTokens?: (schoolSlug: string, tokens: string[]) => Promise<void>;
}

export interface Conn {
  id: string;
  provider: string;
  name: string;
  scope: 'platform' | 'school';
  schoolId: string | null;
  state: 'draft' | 'test' | 'live' | 'paused';
  settings: Record<string, unknown>;
  secrets: Record<string, string>;
  hookToken: string;
}

/** What a capability resolves to for one school: the adapter and its context, and the connection to try when it fails. */
export interface Resolved { conn: Conn | null; adapter: Adapter; ctx: Ctx; fallback: Resolved | null; sandbox: boolean }

export interface SendInput {
  schoolId: string | null;
  schoolSlug: string;
  channel: MessageCapability | 'push';
  to: string;
  body: string;
  subject?: string;
  html?: string;
  messageKey?: string;
  vars?: Record<string, string>;
  language?: string;
  /** Held until then (quiet hours). */
  sendAfter?: Date | null;
  /** Deliver before returning (sign-in codes): the person is waiting for it. */
  now?: boolean;
  /** Recorded as refused with this reason, never sent (a limit was reached). */
  refuse?: string;
}

const SANDBOX: Conn = { id: 'sandbox', provider: 'sandbox', name: 'Test inbox', scope: 'platform', schoolId: null, state: 'live', settings: {}, secrets: {}, hookToken: '' };

/**
 * The one way the platform reaches a third party. A capability (sms, payments, storage…) resolves to the school's route, then the
 * platform's route, then the fallback connection; the sandbox stands in for all of them on the test track. Every message is a row
 * in message_log: sent now, held for quiet hours, or queued for `dispatch()` with retries.
 */
export class Hub {
  constructor(readonly o: HubOptions) {}

  /**
   * sandbox: messages go to the Test inbox except to allow-listed recipients. live: every capability needs a live connection.
   * Set in the console (Integrations → Mode, a second person to go live), kept in the registry so every server agrees.
   */
  async mode(): Promise<'sandbox' | 'live'> {
    return this.remember('mode', async () => {
      const { rows } = await this.o.pool.query("select value from console_settings where key = 'integrations'");
      return rows[0]?.value?.mode === 'live' ? 'live' : 'sandbox';
    });
  }

  // ── Connections ─────────────────────────────────────────────────────────────

  async connection(connId: string): Promise<Conn | null> {
    if (connId === 'sandbox') return SANDBOX;
    const { rows } = await this.o.pool.query('select * from integration_connections where id = $1', [connId]);
    const r = rows[0];
    if (!r) return null;
    return { id: r.id, provider: r.provider, name: r.name, scope: r.scope, schoolId: r.school_id, state: r.state, settings: r.settings ?? {},
      secrets: r.secrets_sealed ? JSON.parse(unseal(r.secrets_sealed, this.o.secretsKey)) : {}, hookToken: r.hook_token };
  }

  /** Seals a connection's secrets: the values, and the last four characters of each to show which key is set. */
  sealSecrets(secrets: Record<string, string>): { sealed: string | null; hints: Record<string, string> } {
    const kept = Object.fromEntries(Object.entries(secrets).filter(([, v]) => v !== ''));
    return { sealed: Object.keys(kept).length ? seal(JSON.stringify(kept), this.o.secretsKey) : null, hints: Object.fromEntries(Object.entries(kept).map(([k, v]) => [k, v.slice(-4)])) };
  }

  webhookUrl(c: { id: string; hookToken: string }): string { return `${this.o.baseUrl}/hooks/${c.id}/${c.hookToken}`; }

  ctx(conn: Conn, schoolSlug: string, route: Record<string, unknown> = {}): Ctx {
    return { connectionId: conn.id, settings: conn.settings, secrets: conn.secrets, route: { hookUrl: conn.hookToken ? this.webhookUrl(conn) : undefined, ...route },
      pool: this.o.pool, schoolSlug, baseUrl: this.o.baseUrl, signKey: this.o.secretsKey };
  }

  private adapter(conn: Conn): Adapter {
    const a = ADAPTERS[conn.provider];
    if (!a) throw new ProviderError(`No adapter for “${conn.provider}”.`, true);
    return a;
  }

  private sandbox(schoolSlug: string): Resolved {
    return { conn: SANDBOX, adapter: ADAPTERS.sandbox!, ctx: this.ctx(SANDBOX, schoolSlug), fallback: null, sandbox: true };
  }

  // Routes and the allow-list are read for every message; a few seconds' memory keeps a send to every family cheap.
  // ponytail: a change made in the console reaches another server within CACHE_MS; push an invalidation if that ever matters.
  private readonly memo = new Map<string, { at: number; value: Promise<unknown> }>();
  private remember<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const hit = this.memo.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as Promise<T>;
    const value = fn();
    this.memo.set(key, { at: Date.now(), value });
    value.catch(() => this.memo.delete(key));
    return value;
  }

  /** After the console changes routes or the allow-list: this server reads them afresh. */
  forget(): void { this.memo.clear(); }

  async allowList(): Promise<string[]> {
    return this.remember('allow', async () => {
      const { rows } = await this.o.pool.query("select value from console_settings where key = 'integrations'");
      return (rows[0]?.value?.allowList as string[] | undefined) ?? [];
    });
  }

  /**
   * Which connection serves a capability at a school. In sandbox mode messages reach the Test inbox unless the recipient is on the
   * allow-list; files, payments and maps use a routed connection in test or live state. In live mode only live connections serve,
   * and a capability without one fails with words saying so, never quietly falling back to the sandbox.
   */
  async resolve(capability: Capability, schoolId: string | null, schoolSlug: string, to?: string): Promise<Resolved> {
    const rows = await this.remember(`route:${capability}:${schoolId ?? ''}`, async () => (await this.o.pool.query(
      'select connection_id, fallback_id, settings from integration_routes where capability = $1 and (school_id = $2 or school_id is null) order by school_id is null limit 1',
      [capability, schoolId])).rows);
    const route = rows[0] as { connection_id: string; fallback_id: string | null; settings: Record<string, unknown> } | undefined;
    const message = capability === 'sms' || capability === 'whatsapp' || capability === 'email' || capability === 'push';
    const mode = await this.mode();
    const allowed = to ? (await this.allowList()).some((a) => norm(a) === norm(to)) : false;
    const usable = (c: Conn | null): c is Conn => !!c && (c.state === 'live' || (c.state === 'test' && (allowed || (!message && mode === 'sandbox'))));
    const build = async (connId: string | null): Promise<Resolved | null> => {
      if (!connId) return null;
      const conn = await this.connection(connId);
      if (!usable(conn)) return null;
      if (conn.provider === 'sandbox') return this.sandbox(schoolSlug);
      return { conn, adapter: this.adapter(conn), ctx: this.ctx(conn, schoolSlug, route?.settings ?? {}), fallback: null, sandbox: false };
    };
    if (mode === 'sandbox' && message && !allowed) return this.sandbox(schoolSlug);
    const main = await build(route?.connection_id ?? null);
    const fallback = await build(route?.fallback_id ?? null);
    if (main) return { ...main, fallback };
    if (fallback) return fallback;
    if (mode === 'sandbox') return this.sandbox(schoolSlug);
    throw new ProviderError(`${CAPABILITY_LABELS[capability]} has no live connection for this school. Set one up in the console under Integrations.`, true);
  }

  // ── The services Gradeon runs on ────────────────────────────────────────────

  /**
   * The connection Gradeon itself uses for a platform capability (alerts, builds, stores, databases, hosting, scanning): the
   * routed one, in test or live (these never reach families). Null when none is set up; the caller says what is missing.
   */
  async platform(capability: Capability): Promise<{ conn: Conn; adapter: Adapter; ctx: Ctx } | null> {
    const rows = await this.remember(`route:${capability}:`, async () => (await this.o.pool.query(
      'select connection_id, fallback_id, settings from integration_routes where capability = $1 and school_id is null limit 1', [capability])).rows);
    const route = rows[0] as { connection_id: string; settings: Record<string, unknown> } | undefined;
    const conn = route ? await this.connection(route.connection_id) : null;
    if (!conn || (conn.state !== 'live' && conn.state !== 'test')) return null;
    return { conn, adapter: this.adapter(conn), ctx: this.ctx(conn, '', route?.settings ?? {}) };
  }

  /** A specific connection (a cell's database server, a build's store) with its adapter, whatever its route. */
  async use(connId: string): Promise<{ conn: Conn; adapter: Adapter; ctx: Ctx }> {
    const conn = await this.connection(connId);
    if (!conn) throw new ProviderError('That connection no longer exists. Choose another in the console.', true);
    return { conn, adapter: this.adapter(conn), ctx: this.ctx(conn, '') };
  }

  /** Tells the Gradeon team (console: Integrations → Alerts to the Gradeon team). Without a route, only the server log has it. */
  async alert(title: string, text: string): Promise<boolean> {
    const p = await this.platform('alerts').catch(() => null);
    if (!p?.adapter.alert) return false;
    p.ctx.route.sendEmail = async (to: string, subject: string, body: string) => {
      const r = await this.resolve('email', null, 'gradeon', to);
      if (r.sandbox || !r.adapter.email) throw new ProviderError('The email connection is not live, so it cannot send alerts.', true);
      await r.adapter.email(r.ctx, { to, subject, text: body, vars: {}, messageKey: 'alert' });
    };
    await p.adapter.alert(p.ctx, { title, text });
    return true;
  }

  /** Scans an upload. Null when no scanner is set up (the caller decides: the test track allows, live mode refuses family uploads). */
  async scan(data: Buffer): Promise<{ clean: boolean; found: string | null } | null> {
    const p = await this.platform('scanning');
    if (!p?.adapter.scan) return null;
    return p.adapter.scan(p.ctx, data);
  }

  /** The templates a provider has approved, for importing (WhatsApp providers that can list them). */
  async providerTemplates(connId: string) {
    const { adapter, ctx } = await this.use(connId);
    if (!adapter.templates) throw new ProviderError('This provider cannot list its templates: type each one in.', true);
    return adapter.templates(ctx);
  }

  // ── Messages ────────────────────────────────────────────────────────────────

  /** Records a message and, when it can go now, sends it. Returns the message's ID. */
  async send(m: SendInput): Promise<string> {
    const msgId = id('msg');
    const held = m.sendAfter && m.sendAfter > new Date() ? m.sendAfter : null;
    const status: DeliveryStatus = m.refuse ? 'refused' : held ? 'held' : 'queued';
    await this.o.pool.query(
      `insert into message_log (id, school_slug, channel, to_addr, message_key, subject, body, vars, language, status, error, send_after)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [msgId, m.schoolSlug, m.channel, m.to, m.messageKey ?? null, m.subject ?? null, m.body, JSON.stringify({ ...(m.vars ?? {}), ...(m.html ? { __html: m.html } : {}) }), m.language ?? 'en', status, m.refuse ?? null, held]);
    if (status !== 'queued') return msgId;
    // Sign-in codes go now; so does anything bound for the Test inbox, so the test track shows it at once. The rest is dispatched.
    let r: Resolved | null = null;
    try { r = await this.resolve(m.channel, m.schoolId, m.schoolSlug, m.to); } catch (e) { await this.fail(msgId, e as Error, MAX_ATTEMPTS); if (m.now) throw e; return msgId; }
    if (m.now || r.sandbox) await this.deliver(msgId, r, m.now === true);
    return msgId;
  }

  /**
   * Many messages at once (a notice to every family): recorded in one statement per thousand, and those bound for the Test inbox
   * filed there in one more. Sign-in codes and allow-listed recipients go one by one through `send`.
   */
  async sendMany(list: SendInput[]): Promise<void> {
    if (!list.length) return;
    const allow = (await this.allowList()).map(norm);
    const sandboxMode = (await this.mode()) === 'sandbox';
    const bulk: SendInput[] = [];
    for (const m of list) {
      if (m.now || (sandboxMode && allow.includes(norm(m.to)))) await this.send(m);
      else bulk.push(m);
    }
    // Where each school's channel goes is the same for every recipient: worked out once.
    const where = new Map<string, Resolved | Error>();
    for (const m of bulk) {
      const k = `${m.schoolId ?? ''}|${m.channel}`;
      if (!where.has(k)) where.set(k, await this.resolve(m.channel, m.schoolId, m.schoolSlug).catch((e: Error) => e));
    }
    const now = new Date().toISOString();
    const rows = bulk.map((m) => {
      const r = where.get(`${m.schoolId ?? ''}|${m.channel}`)!;
      const held = m.sendAfter && m.sendAfter > new Date() ? m.sendAfter.toISOString() : null;
      const inbox = !m.refuse && !held && !(r instanceof Error) && r.sandbox;
      const status: DeliveryStatus = m.refuse ? 'refused' : held ? 'held' : r instanceof Error ? 'failed' : inbox ? 'delivered' : 'queued';
      const msgId = id('msg');
      return {
        id: msgId, school_slug: m.schoolSlug, channel: m.channel, to_addr: m.to, message_key: m.messageKey ?? null, subject: m.subject ?? null, body: m.body,
        vars: { ...(m.vars ?? {}), ...(m.html ? { __html: m.html } : {}) }, language: m.language ?? 'en', status,
        error: m.refuse ?? (r instanceof Error ? r.message.slice(0, 500) : null), send_after: held, attempts: inbox ? 1 : 0,
        connection_id: inbox ? 'sandbox' : null, provider_message_id: inbox ? msgId : null, sent_at: inbox ? now : null,
      };
    });
    for (let i = 0; i < rows.length; i += 1000) {
      const chunk = rows.slice(i, i + 1000);
      await this.o.pool.query(
        `insert into message_log (id, school_slug, channel, to_addr, message_key, subject, body, vars, language, status, error, send_after, attempts, connection_id, provider_message_id, sent_at)
         select id, school_slug, channel, to_addr, message_key, subject, body, vars, language, status, error, send_after, attempts, connection_id, provider_message_id, sent_at
         from jsonb_to_recordset($1::jsonb) as x(id text, school_slug text, channel text, to_addr text, message_key text, subject text, body text, vars jsonb, language text,
           status text, error text, send_after timestamptz, attempts int, connection_id text, provider_message_id text, sent_at timestamptz)`, [JSON.stringify(chunk)]);
      const inbox = chunk.filter((r) => r.status === 'delivered');
      if (inbox.length) {
        await this.o.pool.query(
          `insert into sandbox_messages (id, school_slug, channel, to_addr, subject, body)
           select id, school_slug, channel, to_addr, subject, body from jsonb_to_recordset($1::jsonb) as x(id text, school_slug text, channel text, to_addr text, subject text, body text)`,
          [JSON.stringify(inbox)]);
      }
    }
  }

  /** Sends due queued and held messages: claimed with SKIP LOCKED so two servers never send one twice. */
  async dispatch(limit = 50): Promise<number> {
    const { rows } = await this.o.pool.query(
      `update message_log set status = 'queued', send_after = now() + interval '5 minutes', updated_at = now()
       where id in (select id from message_log where status in ('queued','held') and coalesce(send_after, created_at) <= now() order by created_at limit $1 for update skip locked)
       returning id, school_slug, channel, to_addr`, [limit]);
    for (const row of rows) {
      const school = await this.o.pool.query('select id from schools where slug = $1', [row.school_slug]);
      try {
        await this.deliver(row.id, await this.resolve(row.channel, school.rows[0]?.id ?? null, row.school_slug, row.to_addr));
      } catch (e) {
        await this.fail(row.id, e as Error);
      }
    }
    return rows.length;
  }

  /** One attempt: the primary connection, then the fallback. A temporary failure is retried with backoff, a refusal is final. */
  private async deliver(msgId: string, r: Resolved, rethrow = false): Promise<void> {
    const { rows: [row] } = await this.o.pool.query('select * from message_log where id = $1', [msgId]);
    if (!row) return;
    let lastErr: Error | null = null;
    for (const target of [r, r.fallback].filter((x): x is Resolved => !!x)) {
      try {
        const res = await this.sendVia(target, row);
        const cost = Number(target.conn?.settings.costPaise ?? 0) * (res.segments ?? 1);
        await this.o.pool.query(
          `update message_log set status = $2, connection_id = $3, provider_message_id = $4, segments = $5, cost_paise = $6, attempts = attempts + 1, sent_at = now(), error = null,
           send_after = null, updated_at = now() where id = $1`,
          [msgId, res.delivered ? 'delivered' : 'sent', target.conn?.id ?? null, res.providerId, res.segments ?? null, cost || null]);
        return;
      } catch (e) {
        lastErr = e as Error;
      }
    }
    await this.fail(msgId, lastErr!);
    if (rethrow) throw lastErr;
  }

  private async sendVia(r: Resolved, row: Record<string, any>): Promise<{ providerId: string | null; segments?: number; delivered?: boolean }> {
    const channel = row.channel as MessageCapability | 'push';
    const vars: Record<string, string> = { ...(row.vars ?? {}) };
    const html = vars.__html;
    delete vars.__html;
    if (channel === 'push') {
      const tokens = r.sandbox ? [row.to_addr] : (await this.o.pushTokens?.(row.school_slug, row.to_addr)) ?? [];
      if (!tokens.length) throw new ProviderError('This person has no phone signed in to the app.', true);
      const res = await r.adapter.push!(r.ctx, { tokens, title: row.subject ?? 'Gradeon', body: row.body, data: { key: row.message_key ?? '', route: vars.route ?? '' } });
      if (res.failedTokens.length && !r.sandbox) await this.o.forgetTokens?.(row.school_slug, res.failedTokens);
      if (!res.sent) throw new ProviderError('No phone took the notification.', true);
      return { providerId: null, delivered: r.sandbox };
    }
    const fn = r.adapter[channel];
    if (!fn) throw new ProviderError(`${r.conn?.name ?? 'This connection'} cannot send ${channel}.`, true);
    // A mapped template (DLT, WhatsApp): its approved wording is what goes, filled with the message's values.
    const t = r.sandbox || !row.message_key ? null : (await this.o.pool.query(
      "select provider_template_id, dlt_template_id, approved_text from integration_templates where connection_id = $1 and message_key = $2 and language in ($3, 'en') order by language = $3 desc limit 1",
      [r.conn!.id, row.message_key, row.language])).rows[0];
    const text = t ? fill(t.approved_text, vars) : row.body;
    const res = await fn(r.ctx, { to: row.to_addr, text, subject: row.subject ?? undefined, html, messageKey: row.message_key ?? undefined, templateId: t?.provider_template_id,
      dltTemplateId: t?.dlt_template_id ?? undefined, language: row.language, vars });
    return { ...res, segments: res.segments ?? (channel === 'sms' ? segments(text) : undefined) };
  }

  private async fail(msgId: string, e: Error, attempts?: number): Promise<void> {
    const permanent = e instanceof ProviderError && e.permanent;
    // Retries: 1 minute, then 10, then given up.
    await this.o.pool.query(
      `update message_log set attempts = coalesce($3::int, attempts + 1), error = $2, updated_at = now(),
         status = case when $4::boolean or coalesce($3::int, attempts + 1) >= ${MAX_ATTEMPTS} then 'failed' else 'queued' end,
         send_after = case when $4::boolean or coalesce($3::int, attempts + 1) >= ${MAX_ATTEMPTS} then null else now() + make_interval(mins => power(10, coalesce($3::int, attempts + 1) - 1)::int) end
       where id = $1`, [msgId, e.message.slice(0, 500), attempts ?? null, permanent]);
  }

  /** Sends a failed message again from the console. */
  async retry(msgId: string): Promise<void> {
    await this.o.pool.query("update message_log set status = 'queued', attempts = 0, error = null, send_after = null, updated_at = now() where id = $1 and status = 'failed'", [msgId]);
    await this.dispatch(1);
  }

  /** Texts (parts) a school sent this month, for its limit. */
  async smsThisMonth(slug: string): Promise<number> {
    const { rows } = await this.o.pool.query(
      "select coalesce(sum(coalesce(segments, 1)), 0) n from message_log where school_slug = $1 and channel = 'sms' and status not in ('refused','failed') and created_at >= date_trunc('month', now())", [slug]);
    return Number(rows[0]?.n ?? 0);
  }

  // ── Everything else ─────────────────────────────────────────────────────────

  /** Runs a connection's test and records its health. */
  async test(connId: string, to?: string): Promise<{ ok: boolean; detail: string }> {
    const conn = await this.connection(connId);
    if (!conn) return { ok: false, detail: 'That connection no longer exists.' };
    let out: { ok: boolean; detail: string };
    try { out = await this.adapter(conn).test(this.ctx(conn, 'console'), { to }); } catch (e) { out = { ok: false, detail: (e as Error).message }; }
    if (conn.id !== 'sandbox') {
      await this.o.pool.query('update integration_connections set health_ok = $2, health_error = $3, health_checked_at = now() where id = $1', [conn.id, out.ok, out.ok ? null : out.detail.slice(0, 500)]);
    }
    return out;
  }

  /** A webhook from a provider: checks the token in the address, lets the adapter read it, applies delivery reports. */
  async inbound(connId: string, token: string, req: InboundRequest): Promise<InboundResult & { connection: Conn | null }> {
    const conn = await this.connection(connId);
    if (!conn || conn.id === 'sandbox' || conn.hookToken.length !== token.length || conn.hookToken !== token) return { ok: false, summary: 'Unknown webhook address', reply: { status: 404, body: 'not found' }, connection: null };
    const a = this.adapter(conn);
    let res: InboundResult;
    try { res = a.inbound ? await a.inbound(this.ctx(conn, 'webhook'), req) : { ok: false, summary: 'This provider sends no webhooks' }; } catch (e) { res = { ok: false, summary: `Could not read it: ${(e as Error).message}` }; }
    for (const d of res.deliveries ?? []) {
      await this.o.pool.query(
        `update message_log set status = $3::text, error = coalesce($4, error), updated_at = now() where connection_id = $1 and provider_message_id = $2
         and status <> 'read' and not (status = 'delivered' and $3::text = 'sent')`, [conn.id, d.providerId, d.status, d.error ?? null]);
    }
    await this.o.pool.query('insert into integration_hook_events (id, connection_id, ok, summary) values ($1,$2,$3,$4)', [id('hev'), conn.id, res.ok, res.summary.slice(0, 300)]);
    return { ...res, connection: conn };
  }

  /** An event to another system (an ERP): through the school's or the platform's webhook route, if there is one. */
  async event(schoolId: string | null, schoolSlug: string, type: string, data: Record<string, unknown>): Promise<void> {
    const { rows } = await this.o.pool.query("select 1 from integration_routes where capability = 'webhook' and (school_id = $1 or school_id is null) limit 1", [schoolId]);
    if (!rows.length) return;
    const r = await this.resolve('webhook', schoolId, schoolSlug).catch(() => null);
    await r?.adapter.webhook?.(r.ctx, { type, school: schoolSlug, at: new Date().toISOString(), data }).catch(() => undefined);
  }

  /** Whether a capability works for a school and through what, for the admin's School setup. */
  async describe(capability: Capability, schoolId: string, schoolSlug: string): Promise<{ provider: string | null; state: 'on' | 'test' | 'sandbox' }> {
    try {
      const r = await this.resolve(capability, schoolId, schoolSlug);
      if (r.sandbox) return { provider: null, state: 'sandbox' };
      return { provider: providerDef(r.conn!.provider)?.name ?? r.conn!.provider, state: r.conn!.state === 'live' ? 'on' : 'test' };
    } catch {
      return { provider: null, state: 'sandbox' };
    }
  }
}

const norm = (s: string) => (s.includes('@') ? s.trim().toLowerCase() : s.replace(/\D/g, '').slice(-10));
