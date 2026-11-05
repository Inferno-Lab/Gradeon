import { consoleApi, createHttp, type Tokens } from '@gradeon/api-client';
import type { ConsoleTokens } from '@gradeon/contracts';

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
const KEY = 'gradeon.console';

export interface Stored {
  user: ConsoleTokens['user'];
}

let access: string | null = null;

export const session = {
  read(): Stored | null {
    try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stored | null; } catch { return null; }
  },
  write(s: Stored | null): void {
    try {
      if (s) localStorage.setItem(KEY, JSON.stringify({ user: s.user }));
      else { localStorage.removeItem(KEY); access = null; }
    } catch { /* storage can be blocked */ }
  },
  /** In memory only: a reload gets a new one from the httpOnly refresh cookie. */
  access(): string | null {
    return access;
  },
  setAccess(token: string | null): void {
    access = token;
  },
};

/** The school admin's address for a school, used when a support session opens it. */

/** One client for the console. A 401 refreshes the tokens once, then signs out. */
export function makeClient(onSignedOut: () => void) {
  const http = createHttp({
    baseUrl: API,
    tokens: {
      get: () => {
        const token = session.access();
        return token ? { accessToken: token } : null;
      },
      set: (t: Tokens | null) => {
        if (!t) session.write(null);
        else session.setAccess(t.accessToken);
      },
    },
    refreshPath: '/console/v1/auth/refresh',
    cookieRefresh: true,
    onSignedOut: () => { session.write(null); onSignedOut(); },
  });
  return { http, api: consoleApi(http) };
}

export type Client = ReturnType<typeof makeClient>;
