import { constantTimeEqual, randomToken } from '@tangent/security';
import { ApiError } from './errors.js';

export const CSRF_COOKIE = 'gd_csrf';
export const CSRF_HEADER = 'x-csrf';

export function schoolRefreshCookie(slug: string, production: boolean): string {
  const safe = slug.replace(/[^a-z0-9-]/g, '');
  return production ? `__Secure-gd_rt_${safe}` : `gd_rt_${safe}`;
}

export function consoleRefreshCookie(production: boolean): string {
  return production ? '__Secure-gd_crt' : 'gd_crt';
}

export interface CookieFlags {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict';
  path: string;
  maxAge: number;
}

export function refreshCookieFlags(path: string, maxAge: number, production: boolean): CookieFlags {
  return { httpOnly: true, secure: production, sameSite: 'strict', path, maxAge };
}

export function csrfCookieFlags(maxAge: number, production: boolean): CookieFlags {
  return { httpOnly: false, secure: production, sameSite: 'strict', path: '/', maxAge };
}

export function newCsrf(): string {
  return randomToken(24);
}

export function assertCsrf(cookie: string | undefined, header: string | string[] | undefined): void {
  const h = Array.isArray(header) ? header[0] : header;
  if (!cookie || !h || !constantTimeEqual(cookie, h)) {
    throw new ApiError('unauthenticated', 'Your session has ended. Sign in again.');
  }
}

/** When a browser sent Origin, it must be on the allow-list. Missing Origin is a same-origin or non-browser call. */
export function assertOrigin(origin: string | undefined, corsOrigins: string): void {
  if (!origin) return;
  if (corsOrigins === '*') return;
  const allowed = corsOrigins.split(',').map((s) => s.trim()).filter(Boolean);
  if (!allowed.includes(origin)) throw new ApiError('unauthenticated', 'Your session has ended. Sign in again.');
}

export interface CookieReply {
  setCookie: (name: string, value: string, opts: object) => unknown;
  clearCookie: (name: string, opts: object) => unknown;
}

export interface CookieRequest {
  cookies?: Record<string, string>;
  headers: { origin?: string | string[]; 'x-csrf'?: string | string[] };
}

function asCookieReply(reply: object): CookieReply {
  return reply as CookieReply;
}

function asCookieRequest(req: object): CookieRequest {
  return req as CookieRequest;
}

export function setSchoolRefreshCookie(reply: object, opts: { production: boolean; slug: string; token: string; maxAge: number }): void {
  const r = asCookieReply(reply);
  r.setCookie(schoolRefreshCookie(opts.slug, opts.production), opts.token, refreshCookieFlags('/v1/auth', opts.maxAge, opts.production));
  r.setCookie(CSRF_COOKIE, newCsrf(), csrfCookieFlags(opts.maxAge, opts.production));
}

export function setConsoleRefreshCookie(reply: object, opts: { production: boolean; token: string; maxAge: number }): void {
  const r = asCookieReply(reply);
  r.setCookie(consoleRefreshCookie(opts.production), opts.token, refreshCookieFlags('/console/v1/auth', opts.maxAge, opts.production));
  r.setCookie(CSRF_COOKIE, newCsrf(), csrfCookieFlags(opts.maxAge, opts.production));
}

export function clearSchoolRefreshCookie(reply: object, production: boolean, slug: string): void {
  const r = asCookieReply(reply);
  r.clearCookie(schoolRefreshCookie(slug, production), { path: '/v1/auth' });
  r.clearCookie(CSRF_COOKIE, { path: '/' });
}

export function clearConsoleRefreshCookie(reply: object, production: boolean): void {
  const r = asCookieReply(reply);
  r.clearCookie(consoleRefreshCookie(production), { path: '/console/v1/auth' });
  r.clearCookie(CSRF_COOKIE, { path: '/' });
}

export function schoolCookieToken(req: object, slug: string, production: boolean): string | undefined {
  return asCookieRequest(req).cookies?.[schoolRefreshCookie(slug, production)];
}

export function consoleCookieToken(req: object, production: boolean): string | undefined {
  return asCookieRequest(req).cookies?.[consoleRefreshCookie(production)];
}

export function checkCookieCsrf(req: object, corsOrigins: string): void {
  const r = asCookieRequest(req);
  const origin = Array.isArray(r.headers.origin) ? r.headers.origin[0] : r.headers.origin;
  assertOrigin(origin, corsOrigins);
  assertCsrf(r.cookies?.[CSRF_COOKIE], r.headers['x-csrf']);
}
