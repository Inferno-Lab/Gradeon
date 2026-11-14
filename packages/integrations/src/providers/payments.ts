import { createHmac, timingSafeEqual } from 'node:crypto';
import { basic, call } from '../http.js';
import type { Adapter, Ctx, InboundRequest, PaymentEvent } from '../types.js';

const s = (c: Ctx, k: string) => String(c.route[k] ?? c.settings[k] ?? '');
const header = (r: InboundRequest, k: string) => { const v = r.headers[k]; return Array.isArray(v) ? v[0] : v; };
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const json = (r: InboundRequest): any => { try { return JSON.parse(r.raw.toString('utf8')); } catch { return null; } };

const rzpAuth = (c: Ctx) => basic(s(c, 'keyId'), c.secrets.keySecret!);

/** Razorpay Payment Links: the family pays on Razorpay's page; a signed webhook says it is paid. */
export const razorpay: Adapter = {
  payments: {
    async createLink(c, i) {
      const r = await call('https://api.razorpay.com/v1/payment_links', {
        method: 'POST', headers: { authorization: rzpAuth(c), 'content-type': 'application/json' },
        body: JSON.stringify({ amount: i.amountPaise, currency: 'INR', reference_id: i.reference, description: i.description.slice(0, 2048),
          customer: { name: i.customer.name, contact: i.customer.phone, email: i.customer.email }, notify: { sms: false, email: false }, reminder_enable: false,
          callback_url: i.callbackUrl, callback_method: 'get', ...(i.expiresAt ? { expire_by: Math.floor(i.expiresAt.getTime() / 1000) } : {}) }),
      });
      return { linkId: r.json.id, url: r.json.short_url };
    },
    async refund(c, paymentId, amountPaise, note) {
      const r = await call(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
        method: 'POST', headers: { authorization: rzpAuth(c), 'content-type': 'application/json' }, body: JSON.stringify({ amount: amountPaise, notes: { reason: note.slice(0, 250) } }),
      });
      return { refundId: r.json.id };
    },
    async settlements(c, from, to) {
      const out: { providerPaymentId: string; amountPaise: number }[] = [];
      for (let skip = 0; ; skip += 100) {
        const q = new URLSearchParams({ from: String(Math.floor(from.getTime() / 1000)), to: String(Math.floor(to.getTime() / 1000)), count: '100', skip: String(skip) });
        const r = await call(`https://api.razorpay.com/v1/payments?${q}`, { headers: { authorization: rzpAuth(c) } });
        const items: any[] = r.json?.items ?? [];
        for (const p of items) if (p.status === 'captured') out.push({ providerPaymentId: p.id, amountPaise: Number(p.amount) });
        if (items.length < 100) return out;
      }
    },
  },
  async test(c) {
    try {
      const r = await call('https://api.razorpay.com/v1/payment_links', { method: 'POST', headers: { authorization: rzpAuth(c), 'content-type': 'application/json' },
        body: JSON.stringify({ amount: 100, currency: 'INR', description: 'Tangent connection test', notify: { sms: false, email: false } }) });
      await call(`https://api.razorpay.com/v1/payment_links/${r.json.id}/cancel`, { method: 'POST', headers: { authorization: rzpAuth(c) } });
      return { ok: true, detail: `Razorpay (${s(c, 'keyId').startsWith('rzp_live') ? 'live' : 'test'} keys) made a ₹1 link and cancelled it.` };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  },
  async inbound(c, req) {
    const want = createHmac('sha256', c.secrets.webhookSecret ?? '').update(req.raw).digest('hex');
    if (!c.secrets.webhookSecret || !same(header(req, 'x-razorpay-signature') ?? '', want)) return { ok: false, summary: 'Signature did not match', reply: { status: 401, body: 'bad signature' } };
    const b = json(req);
    const pay = b?.payload?.payment?.entity;
    const link = b?.payload?.payment_link?.entity;
    const refund = b?.payload?.refund?.entity;
    const payments: PaymentEvent[] = [];
    if (b?.event === 'payment_link.paid' && link && pay) payments.push({ kind: 'paid', reference: link.reference_id, providerPaymentId: pay.id, amountPaise: Number(pay.amount), method: pay.method });
    if (b?.event === 'payment.failed' && pay?.notes?.reference) payments.push({ kind: 'failed', reference: pay.notes.reference, providerPaymentId: pay.id, amountPaise: Number(pay.amount), method: pay.method });
    if (b?.event === 'refund.processed' && refund) payments.push({ kind: 'refunded', reference: '', providerPaymentId: refund.payment_id, amountPaise: Number(refund.amount), refundId: refund.id });
    return { ok: true, summary: `${b?.event ?? 'event'}${payments[0] ? ` ${payments[0].providerPaymentId}` : ''}`, payments };
  },
};

const cfBase = (c: Ctx) => (s(c, 'environment') === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg');
const cfHeaders = (c: Ctx) => ({ 'x-client-id': s(c, 'appId'), 'x-client-secret': c.secrets.secretKey!, 'x-api-version': '2023-08-01', 'content-type': 'application/json' });

/** Cashfree Payment Links, the same flow as Razorpay's. */
export const cashfree: Adapter = {
  payments: {
    async createLink(c, i) {
      const r = await call(`${cfBase(c)}/links`, { method: 'POST', headers: cfHeaders(c),
        body: JSON.stringify({ link_id: i.reference.replace(/[^\w-]/g, '_').slice(0, 50), link_amount: i.amountPaise / 100, link_currency: 'INR', link_purpose: i.description.slice(0, 500),
          customer_details: { customer_name: i.customer.name, customer_phone: (i.customer.phone ?? '').replace(/\D/g, '').slice(-10) || '9999999999', customer_email: i.customer.email },
          link_meta: { return_url: i.callbackUrl }, link_notify: { send_sms: false, send_email: false }, link_notes: { reference: i.reference },
          ...(i.expiresAt ? { link_expiry_time: i.expiresAt.toISOString() } : {}) }) });
      return { linkId: r.json.link_id, url: r.json.link_url };
    },
    async refund(c, paymentId, amountPaise, note) {
      // Cashfree refunds by order: the payment ID we keep is "<order>:<payment>".
      const [order] = paymentId.split(':');
      const refundId = `rf_${Date.now()}`;
      await call(`${cfBase(c)}/orders/${order}/refunds`, { method: 'POST', headers: cfHeaders(c), body: JSON.stringify({ refund_amount: amountPaise / 100, refund_id: refundId, refund_note: note.slice(0, 100) }) });
      return { refundId };
    },
  },
  async test(c) {
    try {
      const id = `tangent_test_${Date.now()}`;
      await call(`${cfBase(c)}/links`, { method: 'POST', headers: cfHeaders(c), body: JSON.stringify({ link_id: id, link_amount: 1, link_currency: 'INR', link_purpose: 'Tangent connection test',
        customer_details: { customer_phone: '9999999999' }, link_notify: { send_sms: false, send_email: false } }) });
      await call(`${cfBase(c)}/links/${id}/cancel`, { method: 'POST', headers: cfHeaders(c) });
      return { ok: true, detail: `Cashfree (${s(c, 'environment') === 'production' ? 'live' : 'test'}) made a ₹1 link and cancelled it.` };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  },
  async inbound(c, req) {
    const ts = header(req, 'x-webhook-timestamp') ?? '';
    const want = createHmac('sha256', c.secrets.secretKey ?? '').update(ts + req.raw.toString('utf8')).digest('base64');
    if (!same(header(req, 'x-webhook-signature') ?? '', want)) return { ok: false, summary: 'Signature did not match', reply: { status: 401, body: 'bad signature' } };
    const b = json(req);
    const d = b?.data ?? {};
    const payments: PaymentEvent[] = [];
    if (b?.type === 'PAYMENT_LINK_EVENT' && d.link_status === 'PAID') {
      const order = d.order ?? {};
      payments.push({ kind: 'paid', reference: d.link_notes?.reference ?? d.link_id, providerPaymentId: `${order.order_id ?? ''}:${order.transaction_id ?? ''}`, amountPaise: Math.round(Number(d.link_amount_paid ?? order.order_amount ?? 0) * 100) });
    }
    if (b?.type === 'REFUND_STATUS_WEBHOOK' && d.refund?.refund_status === 'SUCCESS') {
      payments.push({ kind: 'refunded', reference: '', providerPaymentId: `${d.refund.order_id}:${d.refund.cf_payment_id ?? ''}`, amountPaise: Math.round(Number(d.refund.refund_amount) * 100), refundId: d.refund.refund_id });
    }
    return { ok: true, summary: `${b?.type ?? 'event'}`, payments };
  },
};
