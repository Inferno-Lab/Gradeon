import { createSign } from 'node:crypto';
import { call } from '../http.js';
import { ProviderError, type Adapter, type Ctx } from '../types.js';

const tokens = new Map<string, { token: string; until: number }>();

/** A Google OAuth token from the service account (an RS256 JWT exchanged once an hour). */
async function accessToken(c: Ctx): Promise<string> {
  const hit = tokens.get(c.connectionId);
  if (hit && hit.until > Date.now() + 60_000) return hit.token;
  let sa: { client_email: string; private_key: string; token_uri?: string };
  try { sa = JSON.parse(c.secrets.serviceAccount ?? ''); } catch { throw new ProviderError('The service account key is not valid JSON: paste the whole file.', true); }
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const aud = sa.token_uri ?? 'https://oauth2.googleapis.com/token';
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud, iat: now, exp: now + 3600 })}`;
  const jwt = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url')}`;
  const r = await call(aud, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }).toString() });
  tokens.set(c.connectionId, { token: r.json.access_token, until: Date.now() + Number(r.json.expires_in ?? 3600) * 1000 });
  return r.json.access_token;
}

/** Firebase Cloud Messaging HTTP v1: one request per phone; tokens Google calls unregistered come back to be forgotten. */
export const fcm: Adapter = {
  async push(c, m) {
    const auth = `Bearer ${await accessToken(c)}`;
    const failedTokens: string[] = [];
    let sent = 0;
    // ponytail: one request per token, fine for a school's few hundred phones; batch through topics if a send reaches thousands.
    for (const token of m.tokens) {
      try {
        await call(`https://fcm.googleapis.com/v1/projects/${String(c.settings.projectId)}/messages:send`, {
          method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, retries: 1,
          body: JSON.stringify({ message: { token, notification: { title: m.title, body: m.body }, data: m.data, android: { priority: 'high' } } }),
        });
        sent++;
      } catch (e) {
        if (e instanceof ProviderError && e.permanent) failedTokens.push(token); else throw e;
      }
    }
    return { sent, failedTokens };
  },
  async test(c) {
    try {
      await accessToken(c);
      return { ok: true, detail: `Google issued an access token for project “${String(c.settings.projectId)}”.` };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  },
};
