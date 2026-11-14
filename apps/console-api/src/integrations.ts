import { Body, Controller, Delete, Get, HttpCode, Inject, Injectable, Param, Post, Put, Query, type OnModuleInit } from '@nestjs/common';
import {
  ActivityQuery, CAPABILITY_LABELS, ConnectionInput, ConnectionPatch, MESSAGE_EVENTS, PLATFORM_CAPABILITIES, RouteInput, SYSTEM_MESSAGES, TemplateInput, fieldProblem, providerDef, type Capability, type ActionRow, type ActivityView, type ConnectionRow, type DeliveryRow, type HookEventRow,
  type IntegrationsView, type RouteRow, type TemplateRow,
} from '@tangent/contracts';
import { newId, scheduleJob } from '@tangent/db';
import { Hub } from '@tangent/integrations';
import { ApiError, ZodPipe, alert, notFound } from '@tangent/nest-kit';
import { randomToken } from '@tangent/security';
import { z } from 'zod';
import { Actions } from './actions.js';
import { Db, Me, Needs, type ConsoleUser } from './core.js';
import { ENV, type Env } from './env.js';
import { PlatformHub } from './platform-hub.js';

export { PlatformHub };

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
// Payment checks make and cancel a link each time: their health comes from webhooks and real payments instead.
const NO_HEALTH_PROBE = new Set(['razorpay', 'cashfree', 'sandbox']);

/** Connections, routes and templates for every third party, all from the console (schools configure nothing). */
@Injectable()
export class Integrations implements OnModuleInit {
  readonly hub: Hub;

  constructor(
    private readonly db: Db,
    private readonly actions: Actions,
    @Inject(ENV) private readonly env: Env,
    platform: PlatformHub,
  ) {
    this.hub = platform.hub;
  }

  onModuleInit(): void {
    this.actions.handle('integration.mode', async (_school, _params, by) => {
      const gaps = await this.liveGaps();
      if (gaps.length) throw new Error(`Not ready for live messages: ${gaps.join(' ')}`);
      await this.saveSettings({ mode: 'live' }, by);
      return 'Live: every school’s messages, files and payments now go through live connections only.';
    });
    this.actions.handle('integration.live', async (_school, params, by) => {
      const c = await this.raw(String(params.connectionId ?? ''));
      if (!c.health_ok) throw new Error(`${c.name} has not passed its test. Run Test again, then ask for approval.`);
      await this.db.pool.query("update integration_connections set state = 'live', updated_by = $2, updated_at = now() where id = $1", [c.id, by]);
      return `${c.name} is live: it now serves real families wherever it is routed.`;
    });
    if (this.env.NODE_ENV !== 'test') scheduleJob(this.db.pool, 'integrations-health', 15 * 60_000, () => this.healthPass(), () => undefined);
  }

  private async raw(id: string): Promise<Record<string, any>> {
    const { rows } = await this.db.pool.query('select * from integration_connections where id = $1', [id]);
    if (!rows[0]) throw notFound('That connection');
    return rows[0];
  }

  async view(): Promise<IntegrationsView> {
    const [conns, usage, routes, templates] = await Promise.all([
      this.db.pool.query('select c.*, s.name school_name from integration_connections c left join schools s on s.id = c.school_id order by c.scope, c.name'),
      this.db.pool.query("select connection_id, count(*)::int n, coalesce(sum(cost_paise), 0)::int cost from message_log where created_at >= date_trunc('month', now()) and status not in ('refused','queued','held') group by connection_id"),
      this.db.pool.query('select r.*, s.name school_name from integration_routes r left join schools s on s.id = r.school_id order by r.capability, r.school_id nulls first'),
      this.db.pool.query('select * from integration_templates order by message_key, language'),
    ]);
    const used = new Map(usage.rows.map((u) => [u.connection_id, u]));
    const month = new Date().toISOString().slice(0, 7);
    const connections: ConnectionRow[] = conns.rows.map((c) => ({
      id: c.id, provider: c.provider, name: c.name, scope: c.scope, schoolId: c.school_id, schoolName: c.school_name, state: c.state, settings: c.settings,
      secretsSet: Object.entries(c.secret_hints as Record<string, string>).map(([key, ending]) => ({ key, ending })),
      health: { ok: c.health_ok, checkedAt: iso(c.health_checked_at), error: c.health_error },
      usage: { month, count: used.get(c.id)?.n ?? 0, costPaise: used.get(c.id)?.cost ?? 0 },
      webhookUrl: providerDef(c.provider)?.webhooks ? this.hub.webhookUrl({ id: c.id, hookToken: c.hook_token }) : null,
      createdBy: c.created_by, updatedAt: iso(c.updated_at)!,
    }));
    return {
      connections,
      routes: routes.rows.map((r): RouteRow => ({ id: r.id, capability: r.capability, schoolId: r.school_id, schoolName: r.school_name, connectionId: r.connection_id, fallbackId: r.fallback_id,
        settings: r.settings, updatedBy: r.updated_by, updatedAt: iso(r.updated_at)! })),
      templates: templates.rows.map((t): TemplateRow => ({ id: t.id, connectionId: t.connection_id, messageKey: t.message_key, language: t.language, providerTemplateId: t.provider_template_id,
        dltTemplateId: t.dlt_template_id ?? undefined, approvedText: t.approved_text })),
      allowList: await this.hub.allowList(),
      mode: await this.hub.mode(),
    };
  }

  /** Every field is filled where needed and has the shape its provider expects: settings in `settings`, secrets and files in `secrets` (or already stored). */
  private check(provider: string, settings: Record<string, unknown>, secrets: Record<string, string>, stored: string[] = []): void {
    const def = providerDef(provider);
    if (!def || provider === 'sandbox') throw new ApiError('validation', 'Choose a provider.');
    const fields: Record<string, string> = {};
    for (const f of def.fields) {
      const sealed = f.kind === 'secret' || f.kind === 'file';
      const v = sealed ? (secrets[f.key] ?? (stored.includes(f.key) ? null : '')) : settings[f.key];
      if (v === null) continue; // kept as it was
      const problem = fieldProblem(f, v);
      if (problem) fields[f.key] = problem;
    }
    if (Object.keys(fields).length) throw new ApiError('validation', 'Some fields need a look.', { fields });
  }

  async create(me: ConsoleUser, b: ConnectionInput): Promise<string> {
    if (b.scope === 'school' && providerDef(b.provider)?.capabilities.every((c) => PLATFORM_CAPABILITIES.includes(c))) throw new ApiError('validation', 'This serves Tangent itself, so it is a Tangent-wide connection.', { fields: { scope: 'Tangent-wide only.' } });
    if (b.scope === 'school' && !b.schoolId) throw new ApiError('validation', 'Choose the school this connection belongs to.', { fields: { schoolId: 'Choose a school.' } });
    if (b.schoolId && !(await this.db.pool.query('select 1 from schools where id = $1 and deleted_at is null', [b.schoolId])).rowCount) throw notFound('That school');
    if (!b.draft) this.check(b.provider, b.settings, b.secrets ?? {});
    else if (!providerDef(b.provider) || b.provider === 'sandbox') throw new ApiError('validation', 'Choose a provider.');
    const { sealed, hints } = this.hub.sealSecrets(b.secrets ?? {});
    const id = newId('con');
    await this.db.pool.query(
      `insert into integration_connections (id, provider, name, scope, school_id, state, settings, secrets_sealed, secret_hints, hook_token, created_by, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
      [id, b.provider, b.name, b.scope, b.scope === 'school' ? b.schoolId : null, b.draft ? 'draft' : 'test', JSON.stringify(b.settings), sealed, JSON.stringify(hints), randomToken(18), me.email]);
    await this.db.audit(me.email, 'integration.created', 'integration', id, { provider: b.provider, scope: b.scope, schoolId: b.schoolId ?? null });
    return id;
  }

  /** Changing a live connection's keys or settings takes it back to test: it goes live again only through a second person. */
  async update(me: ConsoleUser, id: string, b: ConnectionPatch): Promise<void> {
    const c = await this.raw(id);
    const conn = (await this.hub.connection(id))!;
    const settings = { ...c.settings, ...(b.settings ?? {}) };
    const secrets = { ...conn.secrets, ...Object.fromEntries(Object.entries(b.secrets ?? {}).filter(([, v]) => v.trim() !== '')) };
    if (b.settings || b.secrets) this.check(c.provider, settings, b.secrets ?? {}, Object.keys(conn.secrets));
    const changed = !!b.settings || Object.values(b.secrets ?? {}).some((v) => v.trim() !== '');
    const { sealed, hints } = this.hub.sealSecrets(secrets);
    // A draft becomes a test connection once its fields are all filled in and pass their checks.
    const state = b.state ?? (changed && (c.state === 'live' || c.state === 'draft') ? 'test' : c.state);
    await this.db.pool.query(
      `update integration_connections set name = $2, settings = $3, secrets_sealed = $4, secret_hints = $5, secret_version = secret_version + $6, state = $7,
       health_ok = case when $8 then null else health_ok end, updated_by = $9, updated_at = now() where id = $1`,
      [id, b.name ?? c.name, JSON.stringify(settings), sealed, JSON.stringify(hints), b.secrets ? 1 : 0, state, changed, me.email]);
    await this.db.audit(me.email, 'integration.changed', 'integration', id, { name: b.name, settings: Object.keys(b.settings ?? {}), secrets: Object.keys(b.secrets ?? {}), state });
  }

  async remove(me: ConsoleUser, id: string): Promise<void> {
    const c = await this.raw(id);
    const used = await this.db.pool.query('select capability from integration_routes where connection_id = $1 or fallback_id = $1', [id]);
    if (used.rowCount) throw new ApiError('conflict', `${c.name} is routed for ${used.rows.map((r) => r.capability).join(', ')}. Change those routes first.`);
    await this.db.pool.query('delete from integration_connections where id = $1', [id]);
    await this.db.audit(me.email, 'integration.deleted', 'integration', id, { provider: c.provider, name: c.name });
  }

  async test(me: ConsoleUser, id: string, to?: string): Promise<{ ok: boolean; detail: string }> {
    await this.raw(id);
    const out = await this.hub.test(id, to?.trim() || undefined);
    await this.db.audit(me.email, 'integration.tested', 'integration', id, { ok: out.ok });
    return out;
  }

  async goLive(me: ConsoleUser, id: string): Promise<ActionRow> {
    const c = await this.raw(id);
    if (c.state === 'live') throw new ApiError('conflict', `${c.name} is already live.`);
    if (!c.health_ok) throw new ApiError('validation', `Run Test on ${c.name} first: only a connection that passed its test can go live.`);
    const def = providerDef(c.provider);
    if (def?.capabilities.some((x) => x === 'sms' || x === 'whatsapp')) {
      const missing = await this.missingTemplates(id);
      if (missing.length) throw new ApiError('validation', `${c.name} has no approved template for ${missing.length} ${missing.length === 1 ? 'message' : 'messages'} yet. Map them under Templates first.`);
    }
    return this.actions.request(me, { action: 'integration.live', schoolId: c.school_id ?? undefined, params: { connectionId: id, name: c.name }, dryRun: false });
  }

  async putRoute(me: ConsoleUser, b: RouteInput): Promise<void> {
    for (const [cid, role] of [[b.connectionId, 'connection'], [b.fallbackId, 'fallback']] as const) {
      if (!cid) continue;
      const c = await this.raw(cid);
      if (!providerDef(c.provider)?.capabilities.includes(b.capability)) throw new ApiError('validation', `${c.name} cannot do ${b.capability}.`, { fields: { [`${role}Id`]: 'This connection cannot do that.' } });
      if (c.scope === 'school' && c.school_id !== b.schoolId) throw new ApiError('validation', `${c.name} belongs to one school and can only be routed for it.`, { fields: { [`${role}Id`]: 'This connection belongs to another school.' } });
    }
    if (b.fallbackId && b.fallbackId === b.connectionId) throw new ApiError('validation', 'The fallback must be a different connection.', { fields: { fallbackId: 'Choose a different connection.' } });
    await this.db.pool.query(
      `insert into integration_routes (id, capability, school_id, connection_id, fallback_id, settings, updated_by) values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (capability, coalesce(school_id, '')) do update set connection_id = excluded.connection_id, fallback_id = excluded.fallback_id, settings = excluded.settings,
       updated_by = excluded.updated_by, updated_at = now()`,
      [newId('rte'), b.capability, b.schoolId, b.connectionId, b.fallbackId, JSON.stringify(b.settings), me.email]);
    this.hub.forget();
    await this.db.audit(me.email, 'integration.routed', 'integration', b.connectionId, { capability: b.capability, schoolId: b.schoolId, fallbackId: b.fallbackId });
  }

  async deleteRoute(me: ConsoleUser, id: string): Promise<void> {
    const { rows } = await this.db.pool.query('delete from integration_routes where id = $1 returning capability, school_id', [id]);
    if (!rows[0]) throw notFound('That route');
    this.hub.forget();
    await this.db.audit(me.email, 'integration.unrouted', 'integration', id, { capability: rows[0].capability, schoolId: rows[0].school_id });
  }

  async putTemplate(me: ConsoleUser, b: TemplateInput): Promise<void> {
    await this.raw(b.connectionId);
    await this.db.pool.query(
      `insert into integration_templates (id, connection_id, message_key, language, provider_template_id, dlt_template_id, approved_text) values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (connection_id, message_key, language) do update set provider_template_id = excluded.provider_template_id, dlt_template_id = excluded.dlt_template_id,
       approved_text = excluded.approved_text`,
      [newId('tpl'), b.connectionId, b.messageKey, b.language, b.providerTemplateId, b.dltTemplateId || null, b.approvedText]);
    await this.db.audit(me.email, 'integration.template', 'integration', b.connectionId, { messageKey: b.messageKey, language: b.language });
  }

  async deleteTemplate(me: ConsoleUser, id: string): Promise<void> {
    const { rows } = await this.db.pool.query('delete from integration_templates where id = $1 returning connection_id, message_key', [id]);
    if (!rows[0]) throw notFound('That template');
    await this.db.audit(me.email, 'integration.template.deleted', 'integration', rows[0].connection_id, { messageKey: rows[0].message_key });
  }

  async activity(q: ActivityQuery): Promise<ActivityView> {
    const { rows } = await this.db.pool.query(
      `select m.*, c.name connection_name from message_log m left join integration_connections c on c.id = m.connection_id
       where ($1::text is null or m.school_slug = $1) and ($2::text is null or m.channel = $2) and ($3::text is null or m.status = $3)
         and ($4::timestamptz is null or m.created_at >= $4) and ($5::timestamptz is null or m.created_at < $5)
       order by m.created_at desc limit $6`,
      [q.school || null, q.channel || null, q.status || null, q.from || null, q.before || null, q.limit]);
    const totals = await this.db.pool.query(
      `select school_slug, channel, to_char(date_trunc('month', created_at), 'YYYY-MM') mon, count(*)::int n, coalesce(sum(cost_paise), 0)::int cost
       from message_log where created_at >= date_trunc('month', now()) - interval '2 months' and status not in ('refused')
       group by 1, 2, 3 order by 3 desc, 1, 2`);
    return {
      rows: rows.map((m): DeliveryRow => ({
        id: m.id, schoolSlug: m.school_slug, channel: m.channel, to: m.to_addr, messageKey: m.message_key, subject: m.subject, body: m.body, connectionId: m.connection_id,
        connectionName: m.connection_id === 'sandbox' ? 'Test inbox' : m.connection_name, providerMessageId: m.provider_message_id, status: m.status, error: m.error, attempts: m.attempts,
        segments: m.segments, costPaise: m.cost_paise, sendAfter: iso(m.send_after), createdAt: iso(m.created_at)!, sentAt: iso(m.sent_at),
      })),
      totals: totals.rows.map((t) => ({ schoolSlug: t.school_slug, channel: t.channel, month: t.mon, count: t.n, costPaise: t.cost })),
    };
  }

  async retry(me: ConsoleUser, id: string): Promise<void> {
    const { rows } = await this.db.pool.query('select status from message_log where id = $1', [id]);
    if (!rows[0]) throw notFound('That message');
    if (rows[0].status !== 'failed') throw new ApiError('conflict', 'Only a failed message can be sent again.');
    await this.hub.retry(id);
    await this.db.audit(me.email, 'integration.retried', 'message', id);
  }

  async events(id: string): Promise<HookEventRow[]> {
    const { rows } = await this.db.pool.query('select * from integration_hook_events where connection_id = $1 order by at desc limit 50', [id]);
    return rows.map((e) => ({ id: e.id, connectionId: e.connection_id, at: iso(e.at)!, ok: e.ok, summary: e.summary }));
  }

  /** Merges into the Integrations settings (allow-list, mode): one record every server reads. */
  private async saveSettings(patch: Record<string, unknown>, by: string): Promise<void> {
    await this.db.pool.query(
      "insert into console_settings (key, value, updated_by) values ('integrations', $1, $2) on conflict (key) do update set value = console_settings.value || excluded.value, updated_by = excluded.updated_by, updated_at = now()",
      [JSON.stringify(patch), by]);
    this.hub.forget();
  }

  async setAllowList(me: ConsoleUser, list: string[]): Promise<string[]> {
    const clean = [...new Set(list.map((s) => s.trim()).filter(Boolean))];
    await this.saveSettings({ allowList: clean }, me.email);
    await this.db.audit(me.email, 'integration.allowlist', 'integration', 'allowlist', { count: clean.length });
    return clean;
  }

  /**
   * What stands between the test track and live messages: each family-facing capability needs a live Tangent-wide route, SMS and
   * WhatsApp connections need every message's approved template, and uploads need a virus scanner. Empty when ready.
   */
  async liveGaps(): Promise<string[]> {
    const gaps: string[] = [];
    const routes = (await this.db.pool.query<{ capability: string; state: string; provider: string; connection_id: string; name: string }>(
      'select r.capability, c.state, c.provider, c.id connection_id, c.name from integration_routes r join integration_connections c on c.id = r.connection_id where r.school_id is null')).rows;
    for (const cap of ['sms', 'email', 'push', 'storage', 'payments', 'scanning'] as Capability[]) {
      const r = routes.find((x) => x.capability === cap);
      if (!r) gaps.push(`${CAPABILITY_LABELS[cap]} has no Tangent-wide connection.`);
      else if (r.state !== 'live') gaps.push(`${r.name} (${CAPABILITY_LABELS[cap]}) is not live yet.`);
    }
    for (const r of routes.filter((x) => x.capability === 'sms' || x.capability === 'whatsapp')) {
      const missing = await this.missingTemplates(r.connection_id);
      if (missing.length) gaps.push(`${r.name} has no approved template for ${missing.length} ${missing.length === 1 ? 'message' : 'messages'}.`);
    }
    return gaps;
  }

  /** Messages (the platform's own and every school message) a text or WhatsApp connection has no approved template for. */
  async missingTemplates(connectionId: string): Promise<string[]> {
    const have = new Set((await this.db.pool.query<{ message_key: string }>('select message_key from integration_templates where connection_id = $1', [connectionId])).rows.map((r) => r.message_key));
    return [...SYSTEM_MESSAGES.map((m) => m.key), ...MESSAGE_EVENTS.map((m) => m.key)].filter((k) => !have.has(k));
  }

  /** Back to the test track at once (the safe way); to live only through a second person, and only when nothing is missing. */
  async setMode(me: ConsoleUser, mode: 'sandbox' | 'live'): Promise<{ mode: 'sandbox' | 'live'; action?: ActionRow }> {
    if (mode === 'sandbox') {
      await this.saveSettings({ mode: 'sandbox' }, me.email);
      await this.db.audit(me.email, 'integration.mode', 'integration', 'mode', { mode });
      return { mode };
    }
    const gaps = await this.liveGaps();
    if (gaps.length) throw new ApiError('validation', `Not ready for live messages: ${gaps.join(' ')}`);
    return { mode: await this.hub.mode(), action: await this.actions.request(me, { action: 'integration.mode', params: {}, dryRun: false }) };
  }

  /** Pulls the provider's approved templates and fills in those whose name matches a message (or keeps them for picking). */
  async importTemplates(me: ConsoleUser, id: string): Promise<{ imported: number; found: number }> {
    await this.raw(id);
    const list = (await this.hub.providerTemplates(id)).filter((t) => /^approved$/i.test(t.status));
    const keys = [...SYSTEM_MESSAGES.map((m) => m.key), ...MESSAGE_EVENTS.map((m) => m.key)];
    let imported = 0;
    for (const t of list) {
      // A template named like the message (attendance_absent for attendance.absent) is taken as its approved wording.
      const key = keys.find((k) => k.replace(/\./g, '_') === t.name.toLowerCase());
      if (!key) continue;
      let n = 0;
      const text = t.text.replace(/\{\{\d+\}\}/g, () => `{${(MESSAGE_EVENTS.find((e) => e.key === key)?.vars ?? SYSTEM_MESSAGES.find((e) => e.key === key)?.vars ?? [])[n++] ?? 'value'}}`);
      await this.putTemplate(me, { connectionId: id, messageKey: key, language: t.language.slice(0, 5) || 'en', providerTemplateId: t.id, approvedText: text });
      imported++;
    }
    return { imported, found: list.length };
  }

  /** Every 15 minutes: tests each live connection, and alerts when one fails or keeps failing to send. */
  async healthPass(): Promise<void> {
    const { rows } = await this.db.pool.query("select id, name, provider, health_ok from integration_connections where state = 'live'");
    for (const c of rows) {
      if (NO_HEALTH_PROBE.has(c.provider)) continue;
      const out = await this.hub.test(c.id);
      if (!out.ok && c.health_ok !== false) alert(`Integration “${c.name}” failed its check: ${out.detail}`);
    }
    const failing = await this.db.pool.query(
      `select c.name, count(*) filter (where m.status = 'failed')::int failed, count(*) filter (where m.status in ('sent','delivered','read'))::int ok
       from message_log m join integration_connections c on c.id = m.connection_id where m.updated_at > now() - interval '15 minutes' group by c.name`);
    for (const f of failing.rows) if (f.failed >= 5 && f.ok === 0) alert(`Integration “${f.name}”: ${f.failed} messages failed in the last 15 minutes and none went through.`);
  }
}

const TestBody = z.object({ to: z.string().max(200).optional() });
const AllowBody = z.object({ allowList: z.array(z.string().max(200)).max(200) });
const ModeBody = z.object({ mode: z.enum(['sandbox', 'live']) });

@Controller('console/v1/integrations')
export class IntegrationsController {
  constructor(private readonly integrations: Integrations) {}

  @Get() @Needs('integrations.read')
  view(): Promise<IntegrationsView> { return this.integrations.view(); }

  @Post('connections') @HttpCode(200) @Needs('integrations.write')
  async create(@Me() me: ConsoleUser, @Body(new ZodPipe(ConnectionInput)) b: ConnectionInput): Promise<{ id: string }> { return { id: await this.integrations.create(me, b) }; }

  @Put('connections/:id') @HttpCode(204) @Needs('integrations.write')
  update(@Me() me: ConsoleUser, @Param('id') id: string, @Body(new ZodPipe(ConnectionPatch)) b: ConnectionPatch): Promise<void> { return this.integrations.update(me, id, b); }

  @Delete('connections/:id') @HttpCode(204) @Needs('integrations.write')
  remove(@Me() me: ConsoleUser, @Param('id') id: string): Promise<void> { return this.integrations.remove(me, id); }

  @Post('connections/:id/test') @HttpCode(200) @Needs('integrations.write')
  test(@Me() me: ConsoleUser, @Param('id') id: string, @Body(new ZodPipe(TestBody)) b: z.infer<typeof TestBody>): Promise<{ ok: boolean; detail: string }> { return this.integrations.test(me, id, b.to); }

  @Post('connections/:id/live') @HttpCode(200) @Needs('integrations.write')
  live(@Me() me: ConsoleUser, @Param('id') id: string): Promise<ActionRow> { return this.integrations.goLive(me, id); }

  @Get('connections/:id/events') @Needs('integrations.read')
  events(@Param('id') id: string): Promise<HookEventRow[]> { return this.integrations.events(id); }

  @Put('routes') @HttpCode(204) @Needs('integrations.write')
  putRoute(@Me() me: ConsoleUser, @Body(new ZodPipe(RouteInput)) b: RouteInput): Promise<void> { return this.integrations.putRoute(me, b); }

  @Delete('routes/:id') @HttpCode(204) @Needs('integrations.write')
  deleteRoute(@Me() me: ConsoleUser, @Param('id') id: string): Promise<void> { return this.integrations.deleteRoute(me, id); }

  @Put('templates') @HttpCode(204) @Needs('integrations.write')
  putTemplate(@Me() me: ConsoleUser, @Body(new ZodPipe(TemplateInput)) b: TemplateInput): Promise<void> { return this.integrations.putTemplate(me, b); }

  @Delete('templates/:id') @HttpCode(204) @Needs('integrations.write')
  deleteTemplate(@Me() me: ConsoleUser, @Param('id') id: string): Promise<void> { return this.integrations.deleteTemplate(me, id); }

  @Get('activity') @Needs('integrations.read')
  async activity(@Me() me: ConsoleUser, @Query(new ZodPipe(ActivityQuery)) q: ActivityQuery): Promise<ActivityView> {
    const v = await this.integrations.activity(q);
    if (me.permissions.includes('integrations.write')) return v;
    // Families' numbers and what was said to them are for the people who run messaging; the rest see that it happened.
    const mask = (to: string) => (to.includes('@') ? to.replace(/^(.).*?(@.*)$/, '$1•••$2') : to.replace(/\d(?=(?:\D*\d){4})/g, '•'));
    return { ...v, rows: v.rows.map((r) => ({ ...r, to: mask(r.to), body: 'Hidden: only people who run messaging read it.' })) };
  }

  @Post('activity/:id/retry') @HttpCode(204) @Needs('integrations.write')
  retry(@Me() me: ConsoleUser, @Param('id') id: string): Promise<void> { return this.integrations.retry(me, id); }

  @Put('mode') @HttpCode(200) @Needs('integrations.write')
  mode(@Me() me: ConsoleUser, @Body(new ZodPipe(ModeBody)) b: z.infer<typeof ModeBody>) { return this.integrations.setMode(me, b.mode); }

  @Get('live-gaps') @Needs('integrations.read')
  async gaps(): Promise<{ gaps: string[] }> { return { gaps: await this.integrations.liveGaps() }; }

  @Post('connections/:id/import-templates') @HttpCode(200) @Needs('integrations.write')
  importTemplates(@Me() me: ConsoleUser, @Param('id') id: string) { return this.integrations.importTemplates(me, id); }

  @Get('connections/:id/missing-templates') @Needs('integrations.read')
  async missing(@Param('id') id: string): Promise<{ keys: string[] }> { return { keys: await this.integrations.missingTemplates(id) }; }

  @Put('allow-list') @HttpCode(200) @Needs('integrations.write')
  async allow(@Me() me: ConsoleUser, @Body(new ZodPipe(AllowBody)) b: z.infer<typeof AllowBody>): Promise<{ allowList: string[] }> { return { allowList: await this.integrations.setAllowList(me, b.allowList) }; }
}
