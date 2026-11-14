import { call } from '../http.js';
import { signHeaders } from '../sigv4.js';
import { smtpSend } from '../smtp.js';
import type { Adapter, Ctx, OutMessage } from '../types.js';

const s = (c: Ctx, k: string) => String(c.route[k] ?? c.settings[k] ?? '');
const testMail = (to: string): OutMessage => ({ to, subject: 'A test from Tangent', text: 'This connection can send email.', vars: {}, messageKey: 'test' });

/** Amazon SES v2, signed with SigV4 (no SDK). */
export const ses: Adapter = {
  async email(c, m) {
    const url = new URL(`https://email.${s(c, 'region')}.amazonaws.com/v2/email/outbound-emails`);
    const body = JSON.stringify({ FromEmailAddress: s(c, 'from'), Destination: { ToAddresses: [m.to] },
      Content: { Simple: { Subject: { Data: m.subject ?? '', Charset: 'UTF-8' }, Body: { Text: { Data: m.text, Charset: 'UTF-8' }, ...(m.html ? { Html: { Data: m.html, Charset: 'UTF-8' } } : {}) } } } });
    const headers = signHeaders({ accessKeyId: s(c, 'accessKeyId'), secretAccessKey: c.secrets.secretAccessKey!, region: s(c, 'region') }, 'ses', 'POST', url, body, { 'content-type': 'application/json' });
    const r = await call(url.toString(), { method: 'POST', headers, body });
    return { providerId: r.json?.MessageId ?? null };
  },
  async test(c, input) {
    const url = new URL(`https://email.${s(c, 'region')}.amazonaws.com/v2/email/account`);
    const headers = signHeaders({ accessKeyId: s(c, 'accessKeyId'), secretAccessKey: c.secrets.secretAccessKey!, region: s(c, 'region') }, 'ses', 'GET', url, '');
    const r = await call(url.toString(), { headers }).catch((e: Error) => e);
    if (r instanceof Error) return { ok: false, detail: r.message };
    if (input.to) await ses.email!(c, testMail(input.to));
    const q = r.json?.SendQuota;
    return { ok: true, detail: `SES ${r.json?.ProductionAccessEnabled ? 'is out of the sandbox' : 'is still in its sandbox (only verified addresses)'}; ${q ? `${q.SentLast24Hours}/${q.Max24HourSend} sent today` : ''}.${input.to ? ' A test email was sent.' : ''}` };
  },
};

export const smtp: Adapter = {
  async email(c, m) {
    const id = await smtpSend({ host: s(c, 'host'), port: Number(s(c, 'port')) || 465, security: s(c, 'security') === 'starttls' ? 'starttls' : 'tls', user: s(c, 'user'), password: c.secrets.password! },
      s(c, 'from'), m.to, m.subject ?? '', m.text, m.html);
    return { providerId: id };
  },
  async test(c, input) {
    if (!input.to) return { ok: false, detail: 'Type an address to send the test to.' };
    try {
      await smtp.email!(c, testMail(input.to));
      return { ok: true, detail: `The mail server accepted a test for ${input.to}.` };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  },
};

export const resend: Adapter = {
  async email(c, m) {
    const r = await call('https://api.resend.com/emails', {
      method: 'POST', headers: { authorization: `Bearer ${c.secrets.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: s(c, 'from'), to: [m.to], subject: m.subject ?? '', text: m.text, ...(m.html ? { html: m.html } : {}) }),
    });
    return { providerId: r.json?.id ?? null };
  },
  async test(c, input) {
    const r = await call('https://api.resend.com/domains', { headers: { authorization: `Bearer ${c.secrets.apiKey}` } }).catch((e: Error) => e);
    if (r instanceof Error) return { ok: false, detail: r.message };
    if (input.to) await resend.email!(c, testMail(input.to));
    const domains = (r.json?.data ?? []).map((d: any) => `${d.name} (${d.status})`).join(', ');
    return { ok: true, detail: `Resend accepted the key. Domains: ${domains || 'none yet'}.${input.to ? ' A test email was sent.' : ''}` };
  },
};
