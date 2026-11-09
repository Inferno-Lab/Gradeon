import { Inject, Injectable } from '@nestjs/common';
import { newId } from '@gradeon/db';
import { resolveConfig } from '@gradeon/config-engine';
import { MESSAGE_EVENTS, istMinutes, type AuditRow, type EffectiveConfig, type SettingsDoc } from '@gradeon/contracts';
import type { Registry } from '@gradeon/tenancy';
import { REGISTRY, type TenantCtx } from '../tenancy/tenant.js';

@Injectable()
export class AuditService {
  async record(t: TenantCtx, e: { actorId?: string | null; actorName?: string; action: string; entity: string; entityId?: string; detail?: Record<string, unknown> }): Promise<void> {
    await t.pool.query(
      'insert into audit_log (id, actor_id, actor_name, action, entity, entity_id, detail) values ($1,$2,$3,$4,$5,$6,$7)',
      [newId('aud'), e.actorId ?? null, e.actorName ?? 'System', e.action, e.entity, e.entityId ?? null, JSON.stringify(e.detail ?? {})],
    );
  }

  async list(t: TenantCtx, limit = 50): Promise<AuditRow[]> {
    const { rows } = await t.pool.query<{ id: string; at: Date; actor_name: string; action: string; entity: string; detail: Record<string, unknown> }>(
      'select id, at, actor_name, action, entity, detail from audit_log order by at desc limit $1', [limit]);
    return rows.map((r) => ({ id: r.id, at: r.at.toISOString(), actor: r.actor_name, action: r.action, entity: r.entity, detail: Object.entries(r.detail).map(([k, v]) => `${k}: ${String(v)}`).join(' · ') }));
  }
}

@Injectable()
export class SettingsService {
  private readonly cache = new Map<string, { at: number; doc: SettingsDoc }>();

  // Read-only here: only the console writes a school's settings.

  async doc(t: TenantCtx): Promise<SettingsDoc> {
    const hit = this.cache.get(t.info.slug);
    if (hit && Date.now() - hit.at < 5000) return hit.doc;
    const [rows, meta] = await Promise.all([
      t.pool.query<{ key: string; value: unknown; updated_at: Date }>('select key, value, updated_at from settings'),
      t.pool.query<{ value: number }>("select value from meta where key = 'settings.version'"),
    ]);
    const values: Record<string, unknown> = {};
    let updated: Date | null = null;
    for (const r of rows.rows) {
      values[r.key] = r.value;
      if (!updated || r.updated_at > updated) updated = r.updated_at;
    }
    const doc: SettingsDoc = { version: meta.rows[0]?.value ?? 1, values, locked: t.info.entitlement.locks, updatedAt: updated?.toISOString() ?? null };
    this.cache.set(t.info.slug, { at: Date.now(), doc });
    return doc;
  }

  /** The weekdays (0 is Sunday) the school is closed every week (console: Academic year → Closed every week on). */
  async offDays(t: TenantCtx): Promise<number[]> {
    const names = await this.value<string[]>(t, 'calendar.weeklyOff', ['sun']);
    return names.map((n) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(n)).filter((i) => i >= 0);
  }

  async value<T>(t: TenantCtx, key: string, fallback: T): Promise<T> {
    const v = (await this.doc(t)).values[key];
    return (v === undefined ? fallback : v) as T;
  }

  async effective(t: TenantCtx, permissions?: string[]): Promise<EffectiveConfig> {
    return resolveConfig({ settings: await this.doc(t), entitlement: t.info.entitlement, audience: permissions ? { permissions } : undefined, flags: t.info.flags });
  }
}

/** Sends messages. Only the sandbox exists today: it files them in the console's inbox instead of sending them. */
@Injectable()
export class Messenger {
  constructor(
    @Inject(REGISTRY) private readonly registry: Registry,
    private readonly settings: SettingsService,
  ) {}

  async send(t: TenantCtx, m: { channel: 'sms' | 'email' | 'whatsapp' | 'push'; to: string; subject?: string; body: string }): Promise<void> {
    await this.registry.pool.query(
      'insert into sandbox_messages (id, school_slug, channel, to_addr, subject, body) values ($1,$2,$3,$4,$5,$6)',
      [newId('msg'), t.info.slug, m.channel, m.to, m.subject ?? null, m.body],
    );
  }

  /** Texts sent by one school since the start of this month, for the plan card. */
  async smsThisMonth(slug: string): Promise<number> {
    const { rows } = await this.registry.pool.query<{ n: string }>(
      "select count(*) n from sandbox_messages where school_slug = $1 and channel = 'sms' and created_at >= date_trunc('month', now())", [slug]);
    return Number(rows[0]?.n ?? 0);
  }

  async sendMany(t: TenantCtx, list: { channel: 'sms' | 'email' | 'whatsapp' | 'push'; to: string; subject?: string; body: string }[]): Promise<void> {
    for (const m of list) await this.send(t, m);
  }

  /**
   * Sends one of the school's own messages: the wording comes from Message templates, the channels from Notifications, and outside
   * quiet hours only. Messages sent in quiet hours are filed as held until morning (the sandbox has no real queue).
   * Returns how many recipients were reached on at least one channel.
   */
  async notify(t: TenantCtx, key: string, who: { to: string; email?: string | null; vars: Record<string, string | number> }[]): Promise<number> {
    const ev = MESSAGE_EVENTS.find((e) => e.key === key);
    if (!ev) throw new Error(`Unknown message ${key}`);
    // A school without the module or feature a message belongs to never gets it (fee reminders without Fees, and so on).
    if (ev.needs) {
      const cfg = await this.settings.effective(t);
      if (!cfg.modules.includes(ev.needs) && !cfg.features.includes(ev.needs)) return 0;
    }
    const doc = (await this.settings.doc(t)).values;
    const rule = ((doc['notify.rules'] as Record<string, { push: boolean; sms: boolean; email: boolean }> | undefined) ?? {})[key] ?? ev.defaults;
    const custom = ((doc['templates.messages'] as Record<string, string> | undefined) ?? {})[key];
    const text = custom?.trim() ? custom : ev.text;
    const [qf, qt] = [String(doc['notify.quietFrom'] ?? '21:00'), String(doc['notify.quietTo'] ?? '07:00')];
    const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
    const now = istMinutes();
    const quiet = !ev.urgent && (mins(qf) > mins(qt) ? now >= mins(qf) || now < mins(qt) : now >= mins(qf) && now < mins(qt));
    const school = String(doc['school.shortName'] ?? t.info.shortName);
    let reached = 0;
    for (const w of who) {
      const body = text.replace(/\{(\w+)\}/g, (_, k: string) => String((k === 'school' ? w.vars.school ?? school : w.vars[k]) ?? ''));
      const subject = quiet ? `Held until ${qt}` : undefined;
      let any = false;
      if (rule.push) { await this.send(t, { channel: 'push', to: w.to, subject, body }); any = true; }
      if (rule.sms) { await this.send(t, { channel: 'sms', to: w.to, subject, body }); any = true; }
      if (rule.email && w.email) { await this.send(t, { channel: 'email', to: w.email, subject: subject ?? ev.label, body }); any = true; }
      if (any) reached++;
    }
    return reached;
  }
}
