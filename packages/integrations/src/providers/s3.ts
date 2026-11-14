import { call } from '../http.js';
import { presign, signHeaders, type AwsCreds } from '../sigv4.js';
import type { Adapter, Ctx } from '../types.js';

const creds = (c: Ctx): AwsCreds => ({ accessKeyId: String(c.settings.accessKeyId), secretAccessKey: c.secrets.secretAccessKey!, region: String(c.settings.region || 'us-east-1') });
const prefix = (c: Ctx) => String(c.route.prefix ?? '');

/** The object's address: virtual-hosted on AWS, path-style when asked (MinIO, some providers). */
function url(c: Ctx, key = ''): URL {
  const bucket = String(c.settings.bucket);
  const endpoint = String(c.settings.endpoint || `https://s3.${creds(c).region}.amazonaws.com`).replace(/\/$/, '');
  const k = `${prefix(c)}${key}`;
  if (c.settings.pathStyle) return new URL(`${endpoint}/${bucket}/${k}`);
  const e = new URL(endpoint);
  return new URL(`${e.protocol}//${bucket}.${e.host}/${k}`);
}

async function signed(c: Ctx, method: string, u: URL, body: Buffer | string = '', headers: Record<string, string> = {}) {
  return call(u.toString(), { method, headers: signHeaders(creds(c), 's3', method, u, body, headers), body: method === 'GET' || method === 'DELETE' ? undefined : typeof body === 'string' ? body : new Uint8Array(body) });
}

/** Any S3-compatible bucket (AWS, Cloudflare R2, MinIO, DigitalOcean Spaces), signed by hand. */
export const s3: Adapter = {
  storage: {
    async presignPut(c, key, mime) {
      return { url: presign(creds(c), 's3', 'PUT', url(c, key), 600), method: 'PUT', headers: { 'content-type': mime } };
    },
    async presignGet(c, key, seconds, filename) {
      const u = url(c, key);
      if (filename) u.searchParams.set('response-content-disposition', `attachment; filename="${filename.replace(/["\\]/g, '')}"`);
      return presign(creds(c), 's3', 'GET', u, seconds);
    },
    async put(c, key, body, mime) { await signed(c, 'PUT', url(c, key), body, { 'content-type': mime }); },
    async get(c, key) {
      const u = url(c, key);
      const res = await fetch(u, { headers: signHeaders(creds(c), 's3', 'GET', u, ''), signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`Storage said ${res.status} for that file.`);
      return Buffer.from(await res.arrayBuffer());
    },
    async remove(c, key) { await signed(c, 'DELETE', url(c, key)); },
    async usage(c, p) {
      let total = 0;
      let token: string | undefined;
      do {
        const u = url(c);
        u.searchParams.set('list-type', '2');
        u.searchParams.set('prefix', `${prefix(c)}${p}`);
        if (token) u.searchParams.set('continuation-token', token);
        const r = await signed(c, 'GET', u);
        for (const m of r.text.matchAll(/<Size>(\d+)<\/Size>/g)) total += Number(m[1]);
        token = /<IsTruncated>true<\/IsTruncated>/.test(r.text) ? /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(r.text)?.[1] : undefined;
      } while (token);
      return total;
    },
  },
  async test(c) {
    const key = `.tangent-test-${Date.now()}`;
    try {
      await s3.storage!.put(c, key, Buffer.from('ok'), 'text/plain');
      const back = (await s3.storage!.get(c, key)).toString();
      await s3.storage!.remove(c, key);
      return back === 'ok' ? { ok: true, detail: `Wrote, read and deleted a file in “${String(c.settings.bucket)}”.` } : { ok: false, detail: 'The file read back differently.' };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  },
};
