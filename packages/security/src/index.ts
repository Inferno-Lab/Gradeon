import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
/** ~32 MiB, about 80 ms. Older hashes (N=16384) are accepted and rewritten on the next sign-in. Node's default maxmem is 32 MiB, which is exactly this cost, so we allow a little more. */
export const SCRYPT = { N: 32768, r: 8, p: 1 } as const;
const SCRYPT_MEM = 64 * 1024 * 1024;

export const JWT_ISSUER = 'gradeon';

/** scrypt hash in the form `scrypt$N$r$p$salt$hash` (all base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32, { ...SCRYPT, maxmem: SCRYPT_MEM });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [kind, n, r, p, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT_MEM });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** True when the stored hash uses older scrypt parameters than we write today. */
export function passwordNeedsRehash(stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [kind, n, r, p] = stored.split('$');
  return kind !== 'scrypt' || Number(n) !== SCRYPT.N || Number(r) !== SCRYPT.r || Number(p) !== SCRYPT.p;
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** A random URL-safe token, `bytes` of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** A random numeric code of `digits` length, without modulo bias. */
export function randomCode(digits = 6): string {
  let out = '';
  while (out.length < digits) {
    const b = randomBytes(1)[0]!;
    if (b < 250) out += String(b % 10);
  }
  return out;
}

export function constantTimeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function keyFrom(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

/** Signing key bound to one audience, so a school token cannot be checked as a console token. */
export function jwtKey(secret: string, aud: string): Buffer {
  return createHmac('sha256', secret).update(`aud:${aud}`).digest();
}

/** AES-256-GCM seal: used for database connection strings and other secrets at rest. Format `v1.iv.tag.data`. */
export function seal(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function unseal(sealed: string, secret: string): string {
  const [v, iv, tag, data] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Sealed value is not in a known format.');
  const d = createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

export function signJwt(claims: Record<string, unknown>, secret: string, ttlSeconds: number): string {
  const aud = claims.aud;
  if (typeof aud !== 'string' || !aud) throw new Error('JWT claims must include aud');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ iss: JWT_ISSUER, ...claims, iat: now, exp: now + ttlSeconds });
  const sig = createHmac('sha256', jwtKey(secret, aud)).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

export function verifyJwt<T extends Record<string, unknown>>(
  token: string,
  secret: string,
  previous?: string | null,
): (T & { exp: number; iat: number; iss: string; aud: string }) | null {
  const [head, body, sig] = token.split('.');
  if (!head || !body || !sig) return null;
  let header: { alg?: unknown; typ?: unknown };
  try {
    header = JSON.parse(Buffer.from(head, 'base64url').toString('utf8')) as { alg?: unknown; typ?: unknown };
  } catch {
    return null;
  }
  if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;
  let claims: T & { exp: number; iat: number; iss?: unknown; aud?: unknown };
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { exp: number; iat: number; iss?: unknown; aud?: unknown };
  } catch {
    return null;
  }
  if (claims.iss !== JWT_ISSUER || typeof claims.aud !== 'string' || !claims.aud) return null;
  if (typeof claims.exp !== 'number' || claims.exp <= Math.floor(Date.now() / 1000)) return null;
  const secrets = [secret, previous].filter((s): s is string => !!s);
  for (const s of secrets) {
    const expected = createHmac('sha256', jwtKey(s, claims.aud)).update(`${head}.${body}`).digest('base64url');
    if (constantTimeEqual(sig, expected)) return claims as T & { exp: number; iat: number; iss: string; aud: string };
  }
  return null;
}

export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  return d.length < 6 ? '••••' : `+${d.slice(0, 2)} ${d.slice(2, 4)}••• ••${d.slice(-3)}`;
}

export function maskEmail(email: string): string {
  const [u, d] = email.split('@');
  return u && d ? `${u.slice(0, 2)}••••@${d}` : '••••';
}
