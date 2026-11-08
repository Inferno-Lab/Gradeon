import type { ReactNode } from 'react';
import { EvenRows } from '../EvenRows';
import { Tooltips } from '../Tip';

export interface ShellProps {
  /** "dark" or "". */
  theme?: string;
  aside: ReactNode;
  /** Things that float over every page: the search box, the phone menu. */
  overlays?: ReactNode;
  children: ReactNode;
}

/**
 * The floating frame and the menu, mounted once by each app's signed-in layout and kept while pages change, so the menu
 * keeps its scroll and open menus, and nothing replays. Pages render inside it with `PageScope`.
 */
export function Shell({ theme, aside, overlays, children }: ShellProps) {
  return (
    <div className={`nest ${theme ?? ''}`} style={{ width: '100%', minHeight: '100dvh', padding: 12 }}>
      <div className="fr" style={{ minHeight: 'calc(100dvh - 24px)' }}>
        <div className="app" style={{ minHeight: 'calc(100dvh - 24px)' }}>
          {aside}
          {children}
        </div>
        {overlays}
      </div>
      <Tooltips />
      <EvenRows />
    </div>
  );
}

/**
 * One page inside the shell: its stylesheet's scope (`pg-<page>`), its content and its own overlays (dialogs, toasts).
 * It adds no box of its own, so the page's `<main>` still sits beside the menu.
 */
export function PageScope({ page, className, overlays, children }: { page: string; className?: string; overlays?: ReactNode; children: ReactNode }) {
  return (
    <div className={`pg-${page} ${className ?? ''}`} style={{ display: 'contents' }}>
      {children}
      {overlays}
    </div>
  );
}
