import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { customHttp } from './providers/generic.js';
import { razorpay } from './providers/payments.js';
import { metaCloud } from './providers/whatsapp.js';
import { readLink, signLink } from './token.js';
import { e164, fill, segments, type Ctx } from './types.js';

const ctx = (settings: Record<string, unknown> = {}, secrets: Record<string, string> = {}): Ctx =>
  ({ connectionId: 'con_1', settings, secrets, route: {}, pool: { query: async () => ({ rows: [], rowCount: 0 }) }, schoolSlug: 'greenfield', baseUrl: 'http://x', signKey: 'k'.repeat(32) });
const req = (body: string, headers: Record<string, string> = {}, query: Record<string, string> = {}) => ({ raw: Buffer.from(body), headers, query });

describe('message helpers', () => {
  it('counts SMS parts the way carriers bill them', () => {
    expect(segments('a'.repeat(160))).toBe(1);
    expect(segments('a'.repeat(161))).toBe(2);
    expect(segments('क'.repeat(70))).toBe(1);
    expect(segments('क'.repeat(71))).toBe(2);
  });
  it('fills placeholders, escaping for JSON bodies', () => {
    expect(fill('Hi {name}, {vars.code}', { name: 'Asha', code: '42' })).toBe('Hi Asha, 42');
    expect(fill('{"t":"{text}"}', { text: 'say "hi"' }, true)).toBe('{"t":"say \\"hi\\""}');
    expect(fill('{missing}', {})).toBe('{missing}');
    expect(e164('98220 11002')).toBe('919822011002');
  });
  it('signs links that expire and cannot be forged', () => {
    const t = signLink('key', { p: 'get', key: 'a' }, 60);
    expect(readLink('key', t)).toMatchObject({ p: 'get', key: 'a' });
    expect(readLink('other', t)).toBeNull();
    expect(readLink('key', `${t.split('.')[0]}x.${t.split('.')[1]}`)).toBeNull();
    expect(readLink('key', signLink('key', { p: 'get' }, -1))).toBeNull();
  });
});

describe('webhooks', () => {
  it('accepts a Razorpay payment only with the right signature', async () => {
    const body = JSON.stringify({ event: 'payment_link.paid', payload: { payment: { entity: { id: 'pay_1', amount: 120000, method: 'upi' } }, payment_link: { entity: { reference_id: 'greenfield:ord_1' } } } });
    const c = ctx({}, { webhookSecret: 'whsec' });
    const bad = await razorpay.inbound!(c, req(body, { 'x-razorpay-signature': 'nope' }));
    expect(bad.ok).toBe(false);
    expect(bad.reply?.status).toBe(401);
    const good = await razorpay.inbound!(c, req(body, { 'x-razorpay-signature': createHmac('sha256', 'whsec').update(body).digest('hex') }));
    expect(good.payments).toEqual([{ kind: 'paid', reference: 'greenfield:ord_1', providerPaymentId: 'pay_1', amountPaise: 120000, method: 'upi' }]);
  });
  it('answers Meta’s verify challenge and checks its signature', async () => {
    const c = ctx({ verifyToken: 'vt' }, { appSecret: 'app' });
    expect((await metaCloud.inbound!(c, req('', {}, { 'hub.mode': 'subscribe', 'hub.verify_token': 'vt', 'hub.challenge': '123' }))).reply).toEqual({ status: 200, body: '123' });
    expect((await metaCloud.inbound!(c, req('', {}, { 'hub.mode': 'subscribe', 'hub.verify_token': 'no', 'hub.challenge': '123' }))).reply?.status).toBe(403);
    const body = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'read' }] } }] }] });
    expect((await metaCloud.inbound!(c, req(body, { 'x-hub-signature-256': 'sha256=bad' }))).ok).toBe(false);
    const ok = await metaCloud.inbound!(c, req(body, { 'x-hub-signature-256': `sha256=${createHmac('sha256', 'app').update(body).digest('hex')}` }));
    expect(ok.deliveries).toEqual([{ providerId: 'wamid.1', status: 'read', error: undefined }]);
  });
  it('reads a custom provider’s delivery reports through its mapping', async () => {
    const c = ctx({ statusWebhook: true, statusIdPath: 'msg.id', statusPath: 'state', statusMap: '{"DELIVRD":"delivered","UNDELIV":"failed"}' });
    const r = await customHttp.inbound!(c, req(JSON.stringify([{ msg: { id: 'a' }, state: 'DELIVRD' }, { msg: { id: 'b' }, state: 'UNDELIV' }, { msg: { id: 'c' }, state: 'WEIRD' }])));
    expect(r.deliveries).toEqual([{ providerId: 'a', status: 'delivered' }, { providerId: 'b', status: 'failed' }]);
  });
});
