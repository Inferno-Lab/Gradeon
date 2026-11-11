import { createSign } from 'node:crypto';
import { call } from '../http.js';
import { ProviderError, type Adapter, type Ctx } from '../types.js';

const tokens = new Map<string, { token: string; until: number }>();

/** A file field's text: files are kept base64-encoded; a key pasted as text before files existed is kept as it was. */
export function fileText(c: Ctx, key: string): string {
  const v = (c.secrets[key] ?? '').trim();
  return !v || v.startsWith('{') || v.startsWith('-----') ? v : Buffer.from(v, 'base64').toString('utf8');
}

/** A Google OAuth token from a service account file (an RS256 JWT exchanged once an hour), for the scope asked. */
export async function googleToken(c: Ctx, field: string, scope: string): Promise<string> {
  const cacheKey = `${c.connectionId}:${scope}`;
  const hit = tokens.get(cacheKey);
  if (hit && hit.until > Date.now() + 60_000) return hit.token;
  let sa: { client_email: string; private_key: string; token_uri?: string };
  try { sa = JSON.parse(fileText(c, field)); } catch { throw new ProviderError('The service account key is not a valid JSON key file: add the file Google gave you.', true); }
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const aud = sa.token_uri ?? 'https://oauth2.googleapis.com/token';
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope, aud, iat: now, exp: now + 3600 })}`;
  const jwt = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url')}`;
  const r = await call(aud, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }).toString() });
  tokens.set(cacheKey, { token: r.json.access_token, until: Date.now() + Number(r.json.expires_in ?? 3600) * 1000 });
  return r.json.access_token;
}

const accessToken = (c: Ctx) => googleToken(c, 'serviceAccount', 'https://www.googleapis.com/auth/firebase.messaging');

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
      // The app files must belong to the same project, or phones register with one project and are sent to from another.
      const project = String(c.settings.projectId);
      const android = fileText(c, 'androidConfig');
      if (android && (JSON.parse(android) as { project_info?: { project_id?: string } }).project_info?.project_id !== project) return { ok: false, detail: `google-services.json is for another Firebase project, not “${project}”.` };
      const ios = fileText(c, 'iosConfig');
      if (ios && !ios.replace(/\s+/g, '').includes(`<key>PROJECT_ID</key><string>${project}</string>`)) return { ok: false, detail: `GoogleService-Info.plist is for another Firebase project, not “${project}”.` };
      if (!android || !ios) return { ok: false, detail: 'Google answered, but the app files are missing: add google-services.json and GoogleService-Info.plist so app builds can receive notifications.' };
      return { ok: true, detail: `Google issued an access token for project “${project}”, and both app files belong to it.` };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  },
};
