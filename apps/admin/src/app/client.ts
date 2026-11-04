import { createHttp, schoolApi, type Tokens } from '@gradeon/api-client';
import type { SessionUser } from '@gradeon/contracts';

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

const profileKey = (slug: string) => `gradeon.admin.${slug}`;
const supportKey = (slug: string) => `gradeon.admin.${slug}.support`;

export interface Stored {
  user: SessionUser;
  /** Set for a console support session: it ends at this time and cannot change anything. */
  support?: { until: number };
}

const access = new Map<string, string>();

function readJson<T>(storage: Storage, key: string): T | null {
  try { return JSON.parse(storage.getItem(key) ?? 'null') as T | null; } catch { return null; }
}

export const session = {
  read(slug: string): Stored | null {
    const support = readJson<Stored>(sessionStorage, supportKey(slug));
    if (support) return support;
    return readJson<Stored>(localStorage, profileKey(slug));
  },
  write(slug: string, s: Stored | null): void {
    try {
      if (!s) {
        localStorage.removeItem(profileKey(slug));
        sessionStorage.removeItem(supportKey(slug));
        access.delete(slug);
        return;
      }
      if (s.support) sessionStorage.setItem(supportKey(slug), JSON.stringify(s));
      else localStorage.setItem(profileKey(slug), JSON.stringify({ user: s.user }));
    } catch { /* storage can be blocked */ }
  },
  access(slug: string): string | null {
    return access.get(slug)
      ?? readJson<Stored & { accessToken?: string }>(sessionStorage, supportKey(slug))?.accessToken
      ?? readJson<Stored & { accessToken?: string }>(localStorage, profileKey(slug))?.accessToken
      ?? null;
  },
  setAccess(slug: string, token: string | null): void {
    if (token) access.set(slug, token);
    else access.delete(slug);
  },
};

/** A support session arrives from the console as `#support=<token>`: read-only, short, for one school. */
export function readSupportHash(slug: string): boolean {
  const m = /[#&]support=([^&]+)/.exec(window.location.hash);
  if (!m) return false;
  const payload = JSON.parse(atob(m[1]!.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { name: string; exp: number; perms: string[] };
  session.write(slug, { support: { until: payload.exp * 1000 }, user: { id: 'support', name: payload.name, email: null, phone: null, initials: 'GS', roles: ['support'], roleNames: ['Gradeon support'], permissions: payload.perms as SessionUser['permissions'] } });
  session.setAccess(slug, m[1]!);
  try { sessionStorage.setItem(supportKey(slug), JSON.stringify({ ...session.read(slug), accessToken: m[1]! })); } catch { /* ignore */ }
  history.replaceState(null, '', window.location.pathname + window.location.search);
  return true;
}

export function supportUntil(slug: string): number | null {
  return session.read(slug)?.support?.until ?? null;
}

/** One client per school. A 401 refreshes the tokens once, then signs out. */
export function makeClient(slug: string, onSignedOut: () => void) {
  const http = createHttp({
    baseUrl: API,
    headers: () => ({ 'x-school': slug }),
    tokens: {
      get: () => {
        const token = session.access(slug);
        return token ? { accessToken: token } : null;
      },
      set: (t: Tokens | null) => {
        if (!t) session.write(slug, null);
        else session.setAccess(slug, t.accessToken);
      },
    },
    refreshPath: '/v1/auth/refresh',
    cookieRefresh: true,
    onSignedOut: () => { session.write(slug, null); onSignedOut(); },
  });
  return { http, api: schoolApi(http) };
}

export type Client = ReturnType<typeof makeClient>;
