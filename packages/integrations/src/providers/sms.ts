import { basic, call, form } from '../http.js';
import { ProviderError, e164, segments, type Adapter, type Ctx, type InboundRequest, type InboundResult, type OutMessage } from '../types.js';

const s = (c: Ctx, k: string) => String(c.route[k] ?? c.settings[k] ?? '');
const text = (r: InboundRequest) => r.raw.toString('utf8');
const params = (r: InboundRequest): Record<string, string> => {
  const t = text(r);
  return { ...r.query, ...(t && !t.trimStart().startsWith('{') && !t.trimStart().startsWith('[') ? Object.fromEntries(new URLSearchParams(t)) : {}) };
};
const json = (r: InboundRequest): any => { try { return JSON.parse(text(r)); } catch { return null; } };
const testMessage = (to: string): OutMessage => ({ to, text: 'A test from Gradeon: this connection can send texts.', vars: {}, messageKey: 'test' });
const needsTemplate = (m: OutMessage, who: string) => {
  if (!m.templateId) throw new ProviderError(`${who} sends only DLT-approved templates: map “${m.messageKey ?? 'this message'}” under Integrations → Templates.`, true);
};

/** MSG91's Flow API: an approved flow (template) per message, its variables by name. */
export const msg91: Adapter = {
  async sms(c, m) {
    needsTemplate(m, 'MSG91');
    const r = await call('https://control.msg91.com/api/v5/flow/', {
      method: 'POST', headers: { authkey: c.secrets.authKey!, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ template_id: m.templateId, short_url: '0', recipients: [{ mobiles: e164(m.to), ...m.vars }] }),
    });
    if (r.json?.type === 'error') throw new ProviderError(`MSG91: ${r.json.message}`, true);
    return { providerId: String(r.json?.message ?? r.json?.request_id ?? ''), segments: segments(m.text) };
  },
  async test(c, input) {
    if (!input.to) return { ok: false, detail: 'Type a phone number to send the test to.' };
    const r = await call(`https://control.msg91.com/api/v5/report/balance?type=4`, { headers: { authkey: c.secrets.authKey! } }).catch((e: Error) => ({ json: null, error: e.message }));
    if ('error' in r) return { ok: false, detail: r.error as string };
    return { ok: true, detail: `MSG91 accepted the key. Balance: ${JSON.stringify(r.json?.balance ?? r.json ?? 'unknown')}. Texts need an approved template to send.` };
  },
  async inbound(_c, req) {
    // MSG91 posts data=[{ requestId, report: [{ status, number, desc }] }] (form or JSON).
    const raw = params(req).data ?? text(req);
    let items: any[] = [];
    try { items = JSON.parse(raw); } catch { return { ok: false, summary: 'Not a MSG91 delivery report' }; }
    const deliveries = (Array.isArray(items) ? items : [items]).flatMap((i: any) => (i.report ?? [i]).map((x: any) => ({
      providerId: String(i.requestId ?? i.request_id ?? ''), status: String(x.status) === '1' ? 'delivered' as const : 'failed' as const, error: x.desc,
    })));
    return { ok: true, summary: `${deliveries.length} delivery reports`, deliveries };
  },
};

/** Gupshup Enterprise SMS: one GET per text, the DLT template and entity IDs sent with it. */
export const gupshup: Adapter = {
  async sms(c, m) {
    needsTemplate(m, 'Gupshup');
    const q = form({ method: 'SendMessage', send_to: e164(m.to), msg: m.text, msg_type: 'TEXT', userid: s(c, 'userId'), auth_scheme: 'plain', password: c.secrets.password, v: '1.1', format: 'text',
      mask: s(c, 'senderId'), principalEntityId: s(c, 'dltEntityId'), dltTemplateId: m.dltTemplateId ?? m.templateId });
    const r = await call(`https://enterprise.smsgupshup.com/GatewayAPI/rest?${q}`);
    const [state, , detail] = r.text.split('|').map((x) => x.trim());
    if (state !== 'success') throw new ProviderError(`Gupshup: ${detail ?? r.text}`, true);
    return { providerId: detail ?? null, segments: segments(m.text) };
  },
  async test(_c, input) {
    if (!input.to) return { ok: false, detail: 'Type a phone number to send the test to.' };
    return { ok: false, detail: 'Gupshup sends only approved templates: map one under Templates, then send a real message to test.' };
  },
  async inbound(_c, req): Promise<InboundResult> {
    const p = params(req);
    if (!p.externalId) return { ok: false, summary: 'Not a Gupshup delivery report' };
    return { ok: true, summary: `${p.status} for ${p.phoneNo ?? ''}`, deliveries: [{ providerId: p.externalId, status: p.status === 'SUCCESS' ? 'delivered' : 'failed', error: p.cause }] };
  },
};

/** Twilio Messaging: a form post per text; status callbacks arrive at our webhook address. */
export const twilio: Adapter = {
  async sms(c, m) {
    const hook = String(c.route.hookUrl ?? c.settings.hookUrl ?? '');
    const r = await call(`https://api.twilio.com/2010-04-01/Accounts/${s(c, 'accountSid')}/Messages.json`, {
      method: 'POST', headers: { authorization: basic(s(c, 'accountSid'), c.secrets.authToken!), 'content-type': 'application/x-www-form-urlencoded' },
      body: form({ To: `+${e164(m.to)}`, From: s(c, 'from'), Body: m.text, StatusCallback: hook || undefined }),
    });
    return { providerId: r.json?.sid ?? null, segments: Number(r.json?.num_segments) || segments(m.text) };
  },
  async test(c, input) {
    const r = await call(`https://api.twilio.com/2010-04-01/Accounts/${s(c, 'accountSid')}.json`, { headers: { authorization: basic(s(c, 'accountSid'), c.secrets.authToken!) } }).catch((e: Error) => e);
    if (r instanceof Error) return { ok: false, detail: r.message };
    if (input.to) await twilio.sms!(c, testMessage(input.to));
    return { ok: true, detail: `Twilio account “${r.json?.friendly_name ?? s(c, 'accountSid')}” is ${r.json?.status ?? 'reachable'}.${input.to ? ' A test text was sent.' : ''}` };
  },
  async inbound(_c, req) {
    const p = params(req);
    if (!p.MessageSid) return { ok: false, summary: 'Not a Twilio status callback' };
    const map: Record<string, 'sent' | 'delivered' | 'failed' | 'read'> = { sent: 'sent', delivered: 'delivered', undelivered: 'failed', failed: 'failed', read: 'read' };
    const status = map[p.MessageStatus ?? ''];
    return { ok: true, summary: `${p.MessageStatus} ${p.MessageSid}`, deliveries: status ? [{ providerId: p.MessageSid, status, error: p.ErrorCode ? `Error ${p.ErrorCode}` : undefined }] : [] };
  },
};

/** Kaleyra: transactional texts with the DLT template ID; delivery reports by callback. */
export const kaleyra: Adapter = {
  async sms(c, m) {
    needsTemplate(m, 'Kaleyra');
    const r = await call(`https://api.kaleyra.io/v1/${s(c, 'sid')}/messages`, {
      method: 'POST', headers: { 'api-key': c.secrets.apiKey!, 'content-type': 'application/x-www-form-urlencoded' },
      body: form({ to: `+${e164(m.to)}`, sender: s(c, 'sender'), body: m.text, type: m.messageKey?.startsWith('auth.') ? 'OTP' : 'TXN', template_id: m.dltTemplateId ?? m.templateId,
        callback: c.route.hookUrl ? JSON.stringify({ url: c.route.hookUrl, method: 'POST' }) : undefined }),
    });
    return { providerId: r.json?.data?.[0]?.message_id ?? r.json?.id ?? null, segments: segments(m.text) };
  },
  async test(_c, input) {
    if (!input.to) return { ok: false, detail: 'Type a phone number to send the test to.' };
    return { ok: false, detail: 'Kaleyra sends only approved templates: map one under Templates, then send a real message to test.' };
  },
  async inbound(_c, req) {
    const b = json(req) ?? params(req);
    const id = b?.message_id ?? b?.id;
    if (!id) return { ok: false, summary: 'Not a Kaleyra delivery report' };
    const st = String(b.status ?? '').toUpperCase();
    return { ok: true, summary: `${st} ${id}`, deliveries: [{ providerId: String(id), status: st.startsWith('DELIV') ? 'delivered' : st === 'SENT' ? 'sent' : 'failed', error: b.error ?? undefined }] };
  },
};
