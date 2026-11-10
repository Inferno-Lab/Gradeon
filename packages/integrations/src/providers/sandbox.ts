import { randomBytes } from 'node:crypto';
import { readLink, signLink } from '../token.js';
import type { Adapter, Ctx, OutMessage } from '../types.js';

const id = (p: string) => `${p}_${randomBytes(9).toString('base64url')}`;

async function inbox(c: Ctx, channel: string, m: OutMessage): Promise<{ providerId: string; delivered: true }> {
  const msgId = id('msg');
  await c.pool.query('insert into sandbox_messages (id, school_slug, channel, to_addr, subject, body) values ($1,$2,$3,$4,$5,$6)', [msgId, c.schoolSlug, channel, m.to, m.subject ?? null, m.text]);
  return { providerId: msgId, delivered: true };
}

/**
 * The test track's provider for everything: messages land in the console's Test inbox, files are kept in the registry database,
 * payments open a test checkout that says no money moves, and travel times are estimated from the distance. Never used for
 * real families: in live mode a capability without a real connection fails instead (see Hub.resolve).
 */
export const sandbox: Adapter = {
  sms: (c, m) => inbox(c, 'sms', m),
  whatsapp: (c, m) => inbox(c, 'whatsapp', m),
  email: (c, m) => inbox(c, 'email', m),
  async push(c, m) {
    await inbox(c, 'push', { to: m.tokens.join(', '), subject: m.title, text: m.body, vars: {} });
    return { sent: m.tokens.length, failedTokens: [] };
  },
  async webhook(c, e) {
    return inbox(c, 'webhook', { to: e.type, subject: e.type, text: JSON.stringify(e.data), vars: {} });
  },
  payments: {
    async createLink(c, input) {
      const linkId = id('sbl');
      const token = signLink(c.signKey, { p: 'pay', linkId, ref: input.reference, amount: input.amountPaise, desc: input.description, back: input.callbackUrl, conn: c.connectionId }, 24 * 3600);
      return { linkId, url: `${c.baseUrl}/hooks/sandbox-pay/${token}` };
    },
    async refund() { return { refundId: id('sbr') }; },
    async settlements() { return []; },
  },
  storage: {
    async presignPut(c, key, mime, maxBytes) {
      return { url: `${c.baseUrl}/hooks/sandbox-storage/${signLink(c.signKey, { p: 'put', key, mime, max: maxBytes }, 600)}`, method: 'PUT', headers: { 'content-type': mime } };
    },
    async presignGet(c, key, seconds, filename) {
      return `${c.baseUrl}/hooks/sandbox-storage/${signLink(c.signKey, { p: 'get', key, name: filename ?? null }, seconds)}`;
    },
    async put(c, key, body, mime) {
      await c.pool.query('insert into sandbox_files (key, mime, data) values ($1,$2,$3) on conflict (key) do update set mime = excluded.mime, data = excluded.data, at = now()', [key, mime, body]);
    },
    async get(c, key) {
      const { rows } = await c.pool.query('select data from sandbox_files where key = $1', [key]);
      if (!rows[0]) throw new Error('That file is not in storage.');
      return rows[0].data as Buffer;
    },
    async remove(c, key) { await c.pool.query('delete from sandbox_files where key = $1', [key]); },
    async usage(c, prefix) {
      const { rows } = await c.pool.query("select coalesce(sum(octet_length(data)), 0)::bigint n from sandbox_files where key like $1 || '%'", [prefix]);
      return Number(rows[0]?.n ?? 0);
    },
  },
  maps: {
    // Straight-line distance at a town bus's 18 km/h, a third longer for the roads: an estimate, said as one in the app.
    async eta(_c, from, to) {
      const rad = (d: number) => (d * Math.PI) / 180;
      const [la1, lo1] = from;
      const [la2, lo2] = to;
      const a = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
      const meters = Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.33);
      return { meters, minutes: Math.max(1, Math.round(meters / 300)) };
    },
    async staticMap() { return null; },
  },
  async test(c, input) {
    await inbox(c, 'sms', { to: input.to || 'test', subject: 'Test', text: 'A test from the Integrations Hub.', vars: {} });
    return { ok: true, detail: 'Filed a test message in the Test inbox.' };
  },
};

/** For the server's sandbox routes: what a signed sandbox link allows. */
export const sandboxLink = <T extends Record<string, unknown>>(signKey: string, token: string) => readLink<T>(signKey, token);
