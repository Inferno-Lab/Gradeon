import type { ApiErrorBody, ErrorCode } from '@gradeon/contracts';

/** A failed call, with what the server said. `message` is always safe to show a person. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly fields: Record<string, string>;
  readonly attemptsLeft?: number;
  readonly retryAfter?: number;

  constructor(status: number, body: Partial<ApiErrorBody>) {
    super(body.message ?? 'Something went wrong. Try again in a moment.');
    this.status = status;
    this.code = body.code ?? 'internal';
    this.fields = body.fields ?? {};
    this.attemptsLeft = body.attemptsLeft;
    this.retryAfter = body.retryAfter;
  }
}

export interface Tokens {
  accessToken: string;
  refreshToken?: string;
}

export interface HttpOptions {
  baseUrl: string;
  /** Headers sent with every call, such as X-School. */
  headers?: () => Record<string, string>;
  tokens: { get: () => Tokens | null; set: (t: Tokens | null) => void };
  /** Where a refresh goes. A 401 triggers one refresh and one retry. */
  refreshPath: string;
  onSignedOut?: () => void;
  fetch?: typeof fetch;
  /** Browser clients: send cookies, CSRF, and `client: web` on sign-in and refresh. */
  cookieRefresh?: boolean;
}

export type Query = Record<string, string | number | boolean | undefined | null>;

export interface Http {
  get<T>(path: string, query?: Query): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  del<T>(path: string): Promise<T>;
  text(path: string, query?: Query): Promise<string>;
  /** A file to save, such as a ZIP export. */
  blob(path: string, query?: Query): Promise<Blob>;
  /** Reload the access token from the refresh cookie after a page load. */
  restore(): Promise<boolean>;
}

const CSRF_COOKIE = 'gd_csrf';
const CSRF_HEADER = 'x-csrf';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

export function createHttp(opts: HttpOptions): Http {
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  let refreshing: Promise<boolean> | null = null;
  let access = opts.tokens.get()?.accessToken ?? null;

  const url = (path: string, query?: Query) => {
    const q = Object.entries(query ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
    return `${opts.baseUrl.replace(/\/$/, '')}${path}${q ? `?${q}` : ''}`;
  };

  const write = (t: Tokens | null) => {
    access = t?.accessToken ?? null;
    opts.tokens.set(t);
  };

  async function refresh(): Promise<boolean> {
    const t = opts.tokens.get();
    if (!opts.cookieRefresh && !t?.refreshToken && !access) return false;
    refreshing ??= (async () => {
      try {
        const headers: Record<string, string> = { 'content-type': 'application/json', ...opts.headers?.() };
        if (opts.cookieRefresh) {
          const csrf = readCookie(CSRF_COOKIE);
          if (csrf) headers[CSRF_HEADER] = csrf;
        }
        const body = opts.cookieRefresh ? { client: 'web' } : { refreshToken: t?.refreshToken };
        const res = await doFetch(url(opts.refreshPath), {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          credentials: opts.cookieRefresh ? 'include' : 'same-origin',
        });
        if (!res.ok) return false;
        const next = (await res.json()) as Tokens;
        write({ accessToken: next.accessToken, refreshToken: next.refreshToken ?? t?.refreshToken });
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => { refreshing = null; }, 0);
      }
    })();
    return refreshing;
  }

  async function send(method: string, path: string, body: unknown, query: Query | undefined, retry: boolean): Promise<Response> {
    const t = opts.tokens.get();
    const token = access ?? t?.accessToken;
    let res: Response;
    const headers: Record<string, string> = {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token && !path.includes('/auth/login') && !path.includes('/auth/verify') && !path.includes('/auth/refresh') ? { authorization: `Bearer ${token}` } : {}),
      ...opts.headers?.(),
    };
    if (opts.cookieRefresh && (path.includes('/auth/refresh') || path.includes('/auth/logout'))) {
      const csrf = readCookie(CSRF_COOKIE);
      if (csrf) headers[CSRF_HEADER] = csrf;
    }
    let payload = body;
    if (opts.cookieRefresh && payload && typeof payload === 'object' && (path.endsWith('/auth/login') || path.endsWith('/auth/verify') || path.endsWith('/auth/refresh'))) {
      payload = { ...(payload as Record<string, unknown>), client: 'web' };
    }
    try {
      res = await doFetch(url(path, query), {
        method,
        headers,
        body: payload !== undefined ? JSON.stringify(payload) : undefined,
        credentials: opts.cookieRefresh ? 'include' : 'same-origin',
      });
    } catch {
      throw new HttpError(0, { code: 'school_unavailable', message: 'We cannot reach the server. Check your connection and try again.' });
    }
    if (res.status === 401 && retry && (token || opts.cookieRefresh) && !path.includes('/auth/')) {
      if (await refresh()) return send(method, path, body, query, false);
      write(null);
      opts.onSignedOut?.();
    }
    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as Partial<ApiErrorBody>;
      throw new HttpError(res.status, errBody);
    }
    return res;
  }

  const json = async <T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> => {
    const res = await send(method, path, body, query, true);
    if (res.status === 204) return undefined as T;
    const data = (await res.json()) as T;
    if (data && typeof data === 'object' && 'accessToken' in data) {
      const pair = data as Tokens;
      write({ accessToken: pair.accessToken, refreshToken: pair.refreshToken ?? opts.tokens.get()?.refreshToken });
    }
    if (data && typeof data === 'object' && 'step' in data && (data as { step?: string }).step === 'done' && 'tokens' in data) {
      const pair = (data as { tokens: Tokens }).tokens;
      write({ accessToken: pair.accessToken, refreshToken: pair.refreshToken ?? opts.tokens.get()?.refreshToken });
    }
    return data;
  };

  return {
    get: (path, query) => json('GET', path, undefined, query),
    post: (path, body) => json('POST', path, body ?? {}),
    put: (path, body) => json('PUT', path, body ?? {}),
    patch: (path, body) => json('PATCH', path, body ?? {}),
    del: (path) => json('DELETE', path),
    text: async (path, query) => (await send('GET', path, undefined, query, true)).text(),
    blob: async (path, query) => (await send('GET', path, undefined, query, true)).blob(),
    restore: () => (access ? Promise.resolve(true) : refresh()),
  };
}
