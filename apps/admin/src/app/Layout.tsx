import { createContext, useContext, type ReactNode } from 'react';
import type { ShellData } from '@gradeon/contracts';
import { Shell } from '@gradeon/web-ui';
import { useChrome } from './useChrome';

interface ShellChrome { openSearch: () => void; shell: ShellData | undefined; themeCls: string }
const Chrome = createContext<ShellChrome | null>(null);

/** What a page may need from the shell around it: the search box, the school's shell data, the theme. */
export function useShellChrome(): ShellChrome {
  const c = useContext(Chrome);
  if (!c) throw new Error('useShellChrome is only available inside the signed-in layout.');
  return c;
}

/** The one shell of the signed-in admin: the menu, search and phone dock stay mounted while pages change below them. */
export function AppLayout({ children }: { children: ReactNode }) {
  const v = useChrome();
  return (
    <Chrome.Provider value={{ openSearch: v.openSearch, shell: v.shell, themeCls: v.themeCls }}>
      <Shell theme={v.themeCls} aside={v.aside} overlays={v.overlays}>{children}</Shell>
    </Chrome.Provider>
  );
}
