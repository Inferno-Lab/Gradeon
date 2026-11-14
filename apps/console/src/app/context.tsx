import { createContext, useContext } from 'react';
import type { ConsoleTokens } from '@tangent/contracts';
import type { Client } from './client';

export interface AppCtx {
  api: Client['api'];
  user: ConsoleTokens['user'];
  can: (permission: string) => boolean;
  signOut: () => void;
  go: (path: string) => void;
}

export const AppContext = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(AppContext);
  if (!c) throw new Error('useApp must be used inside the signed-in console.');
  return c;
}
