import { createHmac } from 'node:crypto';
import { call } from '../http.js';
import type { DeliveryStatus } from '@gradeon/contracts';
import { ProviderError, at, fill, type Adapter, type Ctx, type InboundRequest, type OutMessage, type SendResult } from '../types.js';

const s = (c: Ctx, k: string) => String(c.route[k] ?? c.settings[k] ?? '');
const parse = (v: unknown): Record<string, string> => {
  if (!v) return {};
  if (typeof v === 'object') return v as Record<string, string>;
  try { return JSON.parse(String(v)); } catch { return {}; }
};

/** Any provider with an HTTP API, set up in the console: the body is a template, the reply is read by paths. */
async function send(c: Ctx, m: OutMessage): Promise<SendResult> {
  const values: Record<string, string> = { to: m.to, text: m.text, subject: m.subject ?? '', templateId: m.templateId ?? '', dltTemplateId: m.dltTemplateId ?? '', language: m.language ?? 'en', ...m.vars };
  for (const [k, v] of Object.entries(c.secrets)) values[`secret.${k}`] = v;
  const method = s(c, 'method') || 'POST';
  const headers = Object.fromEntries(Object.entries(parse(c.settings.headers)).map(([k, v]) => [k, fill(String(v), values)]));
  const raw = s(c, 'body');
  const isJson = raw.trimStart().startsWith('{') || raw.trimStart().startsWith('[');
  const body = fill(raw, values, isJson);
  let url = fill(s(c, 'url'), Object.fromEntries(Object.entries(values).map(([k, v]) => [k, encodeURIComponent(v)])));
  if (method === 'GET' && body) url += (url.includes('?') ? '&' : '?') + body;
  const r = await call(url, { method, headers: { ...(isJson ? { 'content-type': 'application/json' } : { 'content-type': 'application/x-www-form-urlencoded' }), ...headers }, body: method === 'GET' ? undefined : body });
  const path = s(c, 'successPath');
  if (path) {
    const got = at(r.json, path);
    const want = s(c, 'successValue');
    if (want ? String(got ?? '') !== want : got == null) throw new ProviderError(`The provider did not report success: ${r.text.slice(0, 200)}`, true);
  }
  const id = s(c, 'messageIdPath') ? at(r.json, s(c, 'messageIdPath')) : null;
  return { providerId: id == null ? null : String(id) };
}

export const customHttp: Adapter = {
  sms: send,
  whatsapp: send,
  email: send,
  async test(c, input) {
    if (!input.to) return { ok: false, detail: 'Type a number or address to send the test to.' };
    try {
      const r = await send(c, { to: input.to, text: 'A test from Gradeon: this connection can send.', subject: 'A test from Gradeon', vars: {}, messageKey: 'test' });
      return { ok: true, detail: `The provider accepted it${r.providerId ? ` (ID ${r.providerId})` : ''}.` };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  },
  async inbound(c, req: InboundRequest) {
    if (!c.settings.statusWebhook) return { ok: false, summary: 'Delivery reports are switched off for this connection' };
    const text = req.raw.toString('utf8');
    let b: unknown;
    try { b = JSON.parse(text); } catch { b = { ...req.query, ...Object.fromEntries(new URLSearchParams(text)) }; }
    const items = Array.isArray(b) ? b : [b];
    const map = parse(c.settings.statusMap);
    const deliveries = items.flatMap((i) => {
      const id = at(i, s(c, 'statusIdPath') || 'id');
      const word = String(at(i, s(c, 'statusPath') || 'status') ?? '');
      const status = (map[word] ?? word.toLowerCase()) as DeliveryStatus;
      return id != null && ['sent', 'delivered', 'read', 'failed'].includes(status) ? [{ providerId: String(id), status }] : [];
    });
    return { ok: true, summary: `${deliveries.length} delivery reports`, deliveries };
  },
};

/** Events to another system (an ERP, a parent portal): a signed JSON post per event. */
export const webhook: Adapter = {
  async webhook(c, e) {
    const body = JSON.stringify(e);
    const sig = createHmac('sha256', c.secrets.secret ?? '').update(body).digest('hex');
    const r = await call(String(c.settings.url), { method: 'POST', headers: { 'content-type': 'application/json', 'x-gradeon-event': e.type, 'x-gradeon-signature': `sha256=${sig}` }, body });
    return { providerId: `${r.status}` };
  },
  async test(c) {
    try {
      await webhook.webhook!(c, { type: 'test', school: c.schoolSlug, at: new Date().toISOString(), data: { hello: 'from Gradeon' } });
      return { ok: true, detail: 'The address accepted a test event.' };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  },
};
