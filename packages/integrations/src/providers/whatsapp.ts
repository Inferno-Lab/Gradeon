import { createHmac, timingSafeEqual } from 'node:crypto';
import { call } from '../http.js';
import { ProviderError, e164, type Adapter, type Ctx, type InboundRequest, type OutMessage } from '../types.js';

const s = (c: Ctx, k: string) => String(c.route[k] ?? c.settings[k] ?? '');
const body = (r: InboundRequest): any => { try { return JSON.parse(r.raw.toString('utf8')); } catch { return null; } };
const header = (r: InboundRequest, k: string) => { const v = r.headers[k]; return Array.isArray(v) ? v[0] : v; };
// WhatsApp business messages start only from an approved template; its variables go in the order the template lists them.
const ordered = (m: OutMessage) => Object.values(m.vars);
const needsTemplate = (m: OutMessage, who: string) => {
  if (!m.templateId) throw new ProviderError(`${who} sends only approved WhatsApp templates: map “${m.messageKey ?? 'this message'}” under Integrations → Templates.`, true);
};
const STATUS: Record<string, 'sent' | 'delivered' | 'read' | 'failed'> = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed', enqueued: 'sent' };

/** Meta's WhatsApp Cloud API: templates by name and language, statuses by webhook (signed with the app secret). */
export const metaCloud: Adapter = {
  async whatsapp(c, m) {
    needsTemplate(m, 'WhatsApp');
    const params = ordered(m).map((text) => ({ type: 'text', text }));
    const r = await call(`https://graph.facebook.com/v21.0/${s(c, 'phoneNumberId')}/messages`, {
      method: 'POST', headers: { authorization: `Bearer ${c.secrets.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: e164(m.to), type: 'template',
        template: { name: m.templateId, language: { code: m.language ?? 'en' }, components: params.length ? [{ type: 'body', parameters: params }] : [] } }),
    });
    return { providerId: r.json?.messages?.[0]?.id ?? null };
  },
  /** Approved templates at Meta: {{1}}, {{2}}… in the body become the message's values in order. */
  async templates(c) {
    if (!c.settings.businessAccountId) throw new ProviderError('Add the WhatsApp Business account ID to import templates.', true);
    const r = await call(`https://graph.facebook.com/v21.0/${String(c.settings.businessAccountId)}/message_templates?fields=name,language,status,components&limit=200`, { headers: { authorization: `Bearer ${c.secrets.accessToken}` } });
    return ((r.json?.data ?? []) as { name: string; language: string; status: string; components?: { type: string; text?: string }[] }[])
      .map((t) => ({ id: t.name, name: t.name, language: t.language, status: t.status, text: t.components?.find((x) => x.type === 'BODY')?.text ?? '' }));
  },
  async test(c, input) {
    const r = await call(`https://graph.facebook.com/v21.0/${s(c, 'phoneNumberId')}?fields=display_phone_number,verified_name,quality_rating`, { headers: { authorization: `Bearer ${c.secrets.accessToken}` } }).catch((e: Error) => e);
    if (r instanceof Error) return { ok: false, detail: r.message };
    return { ok: true, detail: `${r.json?.verified_name ?? 'The number'} (${r.json?.display_phone_number ?? s(c, 'phoneNumberId')}) is reachable, quality ${r.json?.quality_rating ?? 'unknown'}.${input.to ? ' Send a mapped template to test delivery.' : ''}` };
  },
  async inbound(c, req) {
    // Meta checks the address once with a GET before it sends anything.
    if (req.query['hub.mode'] === 'subscribe') {
      const ok = !!s(c, 'verifyToken') && req.query['hub.verify_token'] === s(c, 'verifyToken');
      return { ok, summary: ok ? 'Webhook verified' : 'Verify token did not match', reply: { status: ok ? 200 : 403, body: ok ? (req.query['hub.challenge'] ?? '') : 'forbidden' } };
    }
    if (c.secrets.appSecret) {
      const want = `sha256=${createHmac('sha256', c.secrets.appSecret).update(req.raw).digest('hex')}`;
      const got = header(req, 'x-hub-signature-256') ?? '';
      if (got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) return { ok: false, summary: 'Signature did not match', reply: { status: 401, body: 'bad signature' } };
    }
    const b = body(req);
    const statuses: any[] = (b?.entry ?? []).flatMap((e: any) => (e.changes ?? []).flatMap((ch: any) => ch.value?.statuses ?? []));
    const deliveries = statuses.filter((x) => STATUS[x.status]).map((x) => ({ providerId: String(x.id), status: STATUS[x.status]!, error: x.errors?.[0]?.title }));
    return { ok: true, summary: `${deliveries.length} status updates`, deliveries };
  },
};

/** Gupshup's WhatsApp API: template sends by ID with an ordered params list. */
export const gupshupWa: Adapter = {
  async whatsapp(c, m) {
    needsTemplate(m, 'Gupshup');
    const r = await call('https://api.gupshup.io/wa/api/v1/template/msg', {
      method: 'POST', headers: { apikey: c.secrets.apiKey!, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ channel: 'whatsapp', source: s(c, 'source'), destination: e164(m.to), 'src.name': s(c, 'appName'),
        template: JSON.stringify({ id: m.templateId, params: ordered(m) }) }).toString(),
    });
    if (r.json?.status === 'error') throw new ProviderError(`Gupshup: ${r.json.message}`, true);
    return { providerId: r.json?.messageId ?? null };
  },
  async templates(c) {
    const r = await call(`https://api.gupshup.io/sm/api/v1/template/list/${encodeURIComponent(String(c.settings.appName))}`, { headers: { apikey: c.secrets.apiKey! } });
    return ((r.json?.templates ?? []) as { id: string; elementName: string; languageCode: string; status: string; data: string }[])
      .map((t) => ({ id: t.id, name: t.elementName, language: t.languageCode, status: t.status, text: t.data }));
  },
  async test(c) {
    const r = await call(`https://api.gupshup.io/wa/app/${encodeURIComponent(s(c, 'appName'))}/template`, { headers: { apikey: c.secrets.apiKey! } }).catch((e: Error) => e);
    if (r instanceof Error) return { ok: false, detail: r.message };
    return { ok: true, detail: `Gupshup accepted the key: ${(r.json?.templates ?? []).length} templates on “${s(c, 'appName')}”.` };
  },
  async inbound(_c, req) {
    const b = body(req);
    if (b?.type !== 'message-event') return { ok: true, summary: `Ignored ${b?.type ?? 'unknown'} event` };
    const p = b.payload ?? {};
    const st = STATUS[p.type];
    return { ok: true, summary: `${p.type} ${p.gsId ?? p.id ?? ''}`, deliveries: st ? [{ providerId: String(p.gsId ?? p.id), status: st, error: p.payload?.reason }] : [] };
  },
};

/** Interakt: template sends by name, the values in order. */
export const interakt: Adapter = {
  async whatsapp(c, m) {
    needsTemplate(m, 'Interakt');
    const n = e164(m.to);
    const r = await call('https://api.interakt.ai/v1/public/message/', {
      method: 'POST', headers: { authorization: `Basic ${c.secrets.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ countryCode: `+${n.slice(0, n.length - 10)}`, phoneNumber: n.slice(-10), type: 'Template',
        template: { name: m.templateId, languageCode: m.language ?? 'en', bodyValues: ordered(m) } }),
    });
    if (r.json?.result === false) throw new ProviderError(`Interakt: ${r.json.message}`, true);
    return { providerId: r.json?.id ?? null };
  },
  async test(_c, input) {
    if (!input.to) return { ok: false, detail: 'Type a phone number, then send a mapped template to test.' };
    return { ok: false, detail: 'Interakt has no read-only check: map a template, then send a real message to test.' };
  },
  async inbound(_c, req) {
    const b = body(req);
    const d = b?.data?.message ?? b?.data;
    const st = { message_api_sent: 'sent', message_api_delivered: 'delivered', message_api_read: 'read', message_api_failed: 'failed' }[String(b?.type)] as 'sent' | 'delivered' | 'read' | 'failed' | undefined;
    if (!d?.id || !st) return { ok: true, summary: `Ignored ${b?.type ?? 'unknown'} event` };
    return { ok: true, summary: `${b.type} ${d.id}`, deliveries: [{ providerId: String(d.id), status: st, error: d.channel_failure_reason }] };
  },
};
