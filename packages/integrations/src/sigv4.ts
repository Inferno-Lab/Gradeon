import { createHash, createHmac } from 'node:crypto';

// AWS Signature Version 4, for S3-compatible storage and SES: about sixty lines instead of the AWS SDK.

const sha = (d: string | Buffer) => createHash('sha256').update(d).digest('hex');
const hmac = (k: Buffer | string, d: string) => createHmac('sha256', k).update(d).digest();
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encPath = (p: string) => p.split('/').map(enc).join('/');

export interface AwsCreds { accessKeyId: string; secretAccessKey: string; region: string }

function signingKey(c: AwsCreds, date: string, service: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${c.secretAccessKey}`, date), c.region), service), 'aws4_request');
}

const stamp = (now: Date) => now.toISOString().replace(/[:-]|\.\d{3}/g, '');

/** Headers for a signed request (SES, S3 server-side calls). */
export function signHeaders(c: AwsCreds, service: string, method: string, url: URL, body: string | Buffer, headers: Record<string, string> = {}, now = new Date()): Record<string, string> {
  const amz = stamp(now);
  const date = amz.slice(0, 8);
  const payloadHash = sha(body);
  const all: Record<string, string> = { ...headers, host: url.host, 'x-amz-date': amz, 'x-amz-content-sha256': payloadHash };
  const names = Object.keys(all).map((k) => k.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(all).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const query = [...url.searchParams].map(([k, v]) => `${enc(k)}=${enc(v)}`).sort().join('&');
  const canonical = [method, encPath(url.pathname), query, names.map((n) => `${n}:${lower[n]}\n`).join(''), names.join(';'), payloadHash].join('\n');
  const scope = `${date}/${c.region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, sha(canonical)].join('\n');
  const signature = createHmac('sha256', signingKey(c, date, service)).update(toSign).digest('hex');
  const { host: _host, ...rest } = all;
  return { ...rest, authorization: `AWS4-HMAC-SHA256 Credential=${c.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

/** A presigned address (the client uploads or downloads straight from storage). Only `host` is signed, so any body works. */
export function presign(c: AwsCreds, service: string, method: string, url: URL, seconds: number, now = new Date()): string {
  const amz = stamp(now);
  const date = amz.slice(0, 8);
  const scope = `${date}/${c.region}/${service}/aws4_request`;
  url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  url.searchParams.set('X-Amz-Credential', `${c.accessKeyId}/${scope}`);
  url.searchParams.set('X-Amz-Date', amz);
  url.searchParams.set('X-Amz-Expires', String(seconds));
  url.searchParams.set('X-Amz-SignedHeaders', 'host');
  const query = [...url.searchParams].map(([k, v]) => `${enc(k)}=${enc(v)}`).sort().join('&');
  const canonical = [method, encPath(url.pathname), query, `host:${url.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, sha(canonical)].join('\n');
  const signature = createHmac('sha256', signingKey(c, date, service)).update(toSign).digest('hex');
  return `${url.origin}${encPath(url.pathname)}?${query}&X-Amz-Signature=${signature}`;
}
