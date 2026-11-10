import { Injectable } from '@nestjs/common';
import { newId } from '@gradeon/db';
import { resolveConfig } from '@gradeon/config-engine';
import { MESSAGE_EVENTS, istMinutes, type AuditRow, type EffectiveConfig, type SettingsDoc } from '@gradeon/contracts';
import type { TenantCtx } from '../tenancy/tenant.js';
import { HubService } from './hub.service.js';

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

type Channel = 'sms' | 'email' | 'whatsapp' | 'push';
export interface OutMsg { channel: Channel; to: string; subject?: string; body: string; key?: string; vars?: Record<string, string>; sendAfter?: Date | null; now?: boolean }

// Where a notification opens in the app (the app's own routes).
const OPENS: Record<string, string> = {
  'attendance.absent': '/attendance', 'fees.reminder': '/fees', 'fees.receipt': '/fees', 'fees.refunded': '/fees', 'homework.new': '/homework', 'exam.results': '/results',
  'notice.published': '/notices', 'event.created': '/events', 'leave.decided': '/leave', 'bus.near': '/transport', 'library.ready': '/library', 'timetable.published': '/timetable',
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** One email layout for every school: its name across the top in its brand colour, the message, and who sent it. */
export function emailHtml(school: string, color: string, body: string): string {
  // An email is not a page: mail clients need literal colours, so the school's brand colour is written in.
  const c = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#3D5AFE';
  return `<!doctype html><html><body style="margin:0;background:#f4f4f6;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:${c};color:#ffffff;padding:16px 24px;font-size:18px;font-weight:600">${esc(school)}</td></tr>
<tr><td style="padding:24px;color:#1d1d22;font-size:15px;line-height:1.55">${esc(body).replace(/\n/g, '<br>')}</td></tr>
<tr><td style="padding:0 24px 20px;color:#6b6b76;font-size:12px">Sent by ${esc(school)} with Gradeon.</td></tr>
</table></td></tr></table></body></html>`;
}

/**
 * Sends messages through the Integrations Hub: every message is a row in message_log, routed to the school's connection (or the
 * Test inbox on the test track), held in quiet hours, retried when a provider fails, and refused past the plan's SMS limit.
 */
@Injectable()
export class Messenger {
  constructor(
    private readonly hubs: HubService,
    private readonly settings: SettingsService,
  ) {}

  async send(t: TenantCtx, m: OutMsg): Promise<void> {
    await this.sendMany(t, [m]);
  }

  /** Texts (parts) sent by one school since the start of this month, for the plan card. */
  smsThisMonth(slug: string): Promise<number> {
    return this.hubs.hub.smsThisMonth(slug);
  }

  /** Many messages at once (a notice to every family): the plan's text limit counted across them, then recorded in bulk. */
  async sendMany(t: TenantCtx, list: OutMsg[]): Promise<void> {
    if (!list.length) return;
    const limit = t.info.entitlement.limits.smsPerMonth;
    // Sign-in codes are never refused: a family locked out of the app is worse than a text over the plan.
    const counted = (m: OutMsg) => m.channel === 'sms' && limit > 0 && !m.key?.startsWith('auth.');
    let used = list.some(counted) ? await this.hubs.hub.smsThisMonth(t.info.slug) : 0;
    const doc = list.some((m) => m.channel === 'email') ? (await this.settings.doc(t)).values : {};
    const out = list.map((m) => {
      const refuse = counted(m) && used++ >= limit ? `This month's ${limit} texts are used up. Gradeon can raise the limit in the console.` : undefined;
      const html = m.channel === 'email' ? emailHtml(String(doc['school.name'] ?? t.info.name), String(doc['brand.color'] ?? ''), m.body) : undefined;
      return {
        schoolId: t.info.id, schoolSlug: t.info.slug, channel: m.channel, to: m.to, body: m.body, subject: m.subject, html, messageKey: m.key,
        vars: { ...(m.vars ?? {}), ...(m.key && OPENS[m.key] ? { route: OPENS[m.key]! } : {}) }, sendAfter: m.sendAfter, now: m.now, refuse,
      };
    });
    // A sign-in code goes alone and at once, and its failure reaches the person waiting for it.
    if (out.length === 1 && out[0]!.now) await this.hubs.hub.send(out[0]!);
    else await this.hubs.hub.sendMany(out);
  }

  /**
   * Sends one of the school's own messages: the wording comes from Message templates, the channels from Notifications, and outside
   * quiet hours only: in quiet hours a message is held until they end, then the dispatcher sends it.
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
    const sendAfter = quiet ? new Date(Date.now() + (((mins(qt) - now + 1440) % 1440) || 1440) * 60_000) : null;
    let reached = 0;
    const out: OutMsg[] = [];
    for (const w of who) {
      const vars = Object.fromEntries(Object.entries({ ...w.vars, school: w.vars.school ?? school }).map(([k, v]) => [k, String(v)]));
      const body = text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
      const m = { key, vars, body, sendAfter };
      const before = out.length;
      if (rule.push) out.push({ ...m, channel: 'push', to: w.to, subject: school });
      if (rule.sms) out.push({ ...m, channel: 'sms', to: w.to });
      if (rule.email && w.email) out.push({ ...m, channel: 'email', to: w.email, subject: ev.label });
      if (out.length > before) reached++;
    }
    await this.sendMany(t, out);
    return reached;
  }
}
