import type { ReactNode } from 'react';
import { leavingProps, useLeaving, useReturnFocus } from '../Presence';

export interface DockTab { id: string; label: string; icon: string; onPress: () => void }

/** The floating pill menu a phone uses in place of the side menu. The current tab opens to show its name. */
export function Dock({ tabs, active }: { tabs: DockTab[]; active: string }) {
  return (
    <nav className="dock" aria-label="Main">
      {tabs.map((t) => (
        <button key={t.id} className={t.id === active ? 'on' : ''} onClick={t.onPress} aria-label={t.label} aria-current={t.id === active ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d={t.icon}></path></svg>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

/** The full menu, from the dock's last tab. A sheet that rises from the bottom; the scrim and Escape close it. Render it inside `<Presence>`. */
export function MoreSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const leaving = useLeaving();
  useReturnFocus(leaving);
  return (
    <>
      <div className="scrim" onClick={leaving ? undefined : onClose} {...leavingProps(leaving)}></div>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} {...leavingProps(leaving)}>
        <div className="grab" aria-hidden="true"></div>
        <div className="ch" style={{ marginBottom: 6 }}><h2 style={{ fontSize: 22 }}>{title}</h2><button className="xb" onClick={onClose} aria-label="Close"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path className="i" d="M6 6l12 12M18 6 6 18"></path></svg></button></div>
        {children}
      </div>
    </>
  );
}
