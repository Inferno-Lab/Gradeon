import { createContext, useContext } from 'react';
import type { SessionUser } from '@tangent/contracts';
import type { Client } from './client';

export interface AppCtx {
  slug: string;
  /** The router's base path, `/s/<slug>` on a shared address and empty on a school's own. */
  base: string;
  api: Client['api'];
  user: SessionUser;
  signOut: () => void;
  go: (path: string) => void;
}

export const AppContext = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(AppContext);
  if (!c) throw new Error('useApp must be used inside the signed-in app.');
  return c;
}
