import { describe, expect, it, vi } from 'vitest';
import { HttpError, createHttp, type Tokens } from './http';

const json = (status: number, body: unknown) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function setup(handler: (url: string, init: RequestInit) => Response) {
  let tokens: Tokens | null = { accessToken: 'old', refreshToken: 'r1' };
  const calls: string[] = [];
  const onSignedOut = vi.fn();
  const http = createHttp({
    baseUrl: 'http://api.test/', refreshPath: '/v1/auth/refresh', headers: () => ({ 'x-school': 'greenfield' }), onSignedOut,
    tokens: { get: () => tokens, set: (t) => { tokens = t; } },
    fetch: (async (url: string, init: RequestInit) => { calls.push(`${init.method} ${url.replace('http://api.test', '')} ${(init.headers as Record<string, string>)?.authorization ?? ''}`); return handler(url, init); }) as typeof fetch,
  });
  return { http, calls, onSignedOut, tokens: () => tokens };
}

describe('createHttp', () => {
  it('sends the token and the school header, and drops empty query values', async () => {
    const s = setup(() => json(200, { ok: true }));
    await s.http.get('/v1/students', { q: 'aarav', page: 2, house: '', none: undefined });
    expect(s.calls[0]).toBe('GET /v1/students?q=aarav&page=2 Bearer old');
  });

  it('refreshes once on a 401, retries with the new token, and keeps the new tokens', async () => {
    let first = true;
    const s = setup((url) => {
      if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 'new', refreshToken: 'r2' });
      if (first) { first = false; return json(401, { code: 'unauthenticated', message: 'expired' }); }
      return json(200, { n: 1 });
    });
    expect(await s.http.get('/v1/me')).toEqual({ n: 1 });
    expect(s.calls.map((c) => c.split(' ').slice(0, 2).join(' '))).toEqual(['GET /v1/me', 'POST /v1/auth/refresh', 'GET /v1/me']);
    expect(s.calls[2]).toContain('Bearer new');
    expect(s.tokens()).toEqual({ accessToken: 'new', refreshToken: 'r2' });
  });

  it('signs out when the refresh is refused', async () => {
    const s = setup((url) => (url.endsWith('/auth/refresh') ? json(401, {}) : json(401, { code: 'unauthenticated', message: 'expired' })));
    await expect(s.http.get('/v1/me')).rejects.toBeInstanceOf(HttpError);
    expect(s.onSignedOut).toHaveBeenCalledOnce();
    expect(s.tokens()).toBeNull();
  });

  it('does not try to refresh a failed sign-in', async () => {
    const s = setup(() => json(401, { code: 'unauthenticated', message: 'Wrong password', attemptsLeft: 2, fields: { password: 'No.' } }));
    const err = (await s.http.post('/v1/auth/login', { identifier: 'a', password: 'b' }).catch((e: unknown) => e)) as HttpError;
    expect(err).toBeInstanceOf(HttpError);
    expect(err.attemptsLeft).toBe(2);
    expect(err.fields.password).toBe('No.');
    expect(s.calls).toHaveLength(1);
    expect(s.onSignedOut).not.toHaveBeenCalled();
  });

  it('turns a network failure into a plain message', async () => {
    const http = createHttp({ baseUrl: 'http://x', refreshPath: '/r', tokens: { get: () => null, set: () => undefined }, fetch: (async () => { throw new TypeError('failed'); }) as typeof fetch });
    await expect(http.get('/v1/x')).rejects.toMatchObject({ status: 0, message: expect.stringContaining('cannot reach') });
  });

  it('returns nothing for 204', async () => {
    const s = setup(() => json(204, null));
    expect(await s.http.del('/v1/x')).toBeUndefined();
  });

  it('sends cookies, CSRF, and client=web when cookieRefresh is on', async () => {
    vi.stubGlobal('document', { cookie: 'gd_csrf=tok' });
    let init: RequestInit | undefined;
    const http = createHttp({
      baseUrl: 'http://api.test', refreshPath: '/v1/auth/refresh', cookieRefresh: true,
      tokens: { get: () => ({ accessToken: 'a' }), set: () => undefined },
      fetch: (async (_url: string, i?: RequestInit) => { init = i; return json(200, { ok: true }); }) as typeof fetch,
    });
    await http.post('/v1/auth/refresh', {});
    expect(init?.credentials).toBe('include');
    expect((init?.headers as Record<string, string>)['x-csrf']).toBe('tok');
    expect(JSON.parse(String(init?.body)).client).toBe('web');
    vi.unstubAllGlobals();
  });
});
