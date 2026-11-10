import { createHmac, timingSafeEqual } from 'node:crypto';

// Short-lived signed links for the sandbox (uploads, downloads, test checkout): the link carries what it is for, and expires.

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function signLink(key: string, data: Record<string, unknown>, seconds: number): string {
  const body = b64(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + seconds }));
  return `${body}.${b64(createHmac('sha256', key).update(body).digest())}`;
}

export function readLink<T extends Record<string, unknown>>(key: string, token: string): T | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = createHmac('sha256', key).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { exp: number };
  return data.exp >= Date.now() / 1000 ? data : null;
}
