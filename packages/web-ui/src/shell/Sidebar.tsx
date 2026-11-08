import { useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Menu } from '../Menu';
import { GradeonIcon } from '../GradeonIcon';

export interface NavItem {
  id: string;
  label: string;
  /** SVG path data. */
  icon: string;
  /** The keyboard shortcut shown beside it, like "G D". */
  keys: string;
  href: string;
  /** A small count beside the label. */
  count?: string;
}
export interface NavGroup {
  name: string;
  items: NavItem[];
}

export interface SidebarProps {
  label: string;
  collapsed: boolean;
  groups: NavGroup[];
  active: string;
  onNavigate: (href: string) => void;
  /** The top block: the school (admin) or the workspace switcher (console). */
  header: ReactNode;
  /** The contextual card above the person. */
  promo?: ReactNode;
  me: { initials: string; name: string; role: string; bg: string; fg: string };
  /** Pushes the person block to the bottom when there is no promo card. */
  pushDown?: boolean;
  /** Actions under the person's name, like signing out. */
  meMenu?: { label: string; onPress: () => void }[];
}

const HAS_MODIFIER = (e: MouseEvent) => e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;

/** The collapsible menu. Markup and class names are the design's; every item is a link so it works with the keyboard and a new tab. */
export function Sidebar({ label, collapsed, groups, active, onNavigate, header, promo, me, pushDown, meMenu }: SidebarProps) {
  const [menu, setMenu] = useState(false);
  const meBtn = useRef<HTMLButtonElement>(null);
  return (
    <aside className={`sb ${collapsed ? 'col' : ''}`} aria-label={label}>
      {header}
      {groups.map((g) => (
        <div key={g.name} style={{ display: 'contents' }}>
          <div className="sl fade">{g.name}</div>
          {g.items.map((n) => (
            <a
              key={n.id}
              className={`nv ${n.id === active ? 'on' : ''}`}
              href={n.href}
              aria-label={n.label}
              data-tip={collapsed ? (n.count ? `${n.label}\n${n.count} waiting` : n.label) : undefined}
              data-tip-side="right"
              aria-current={n.id === active ? 'page' : undefined}
              onClick={(e) => {
                if (HAS_MODIFIER(e)) return;
                e.preventDefault();
                onNavigate(n.href);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d={n.icon}></path></svg>
              <span className="fade">{n.label}</span>
              {n.count ? <span className="ct fade">{n.count}</span> : <span className="kb">{n.keys}</span>}
            </a>
          ))}
        </div>
      ))}
      {promo}
      <div className="me" style={{ ...(pushDown ? { marginTop: 'auto' } : {}), position: 'relative' }}>
        {/* Beside the button when the menu is collapsed, above it otherwise, so the narrow menu can never clip it. */}
        {meMenu && (
          <Menu open={menu} anchor={meBtn} onClose={() => setMenu(false)} side={collapsed ? 'right' : 'auto'} label="Account">
            {meMenu.map((m) => <button key={m.label} role="menuitem" onClick={() => { setMenu(false); m.onPress(); }}>{m.label}</button>)}
          </Menu>
        )}
        {meMenu ? (
          <button ref={meBtn} className="mebtn" aria-haspopup="menu" aria-expanded={menu} data-tip={collapsed && !menu ? `${me.name}\n${me.role}` : undefined} data-tip-side="right" onClick={() => setMenu((o) => !o)}>
            <span className="av" style={{ background: me.bg, color: me.fg }}>{me.initials}</span>
            <div className="fade"><div style={{ font: '700 14px var(--fb)' }}>{me.name}</div><div style={{ font: '600 12.5px var(--fb)', color: 'var(--ink3)' }}>{me.role}</div></div>
          </button>
        ) : (
          <>
            <span className="av" style={{ background: me.bg, color: me.fg }}>{me.initials}</span>
            <div className="fade"><div style={{ font: '700 14px var(--fb)' }}>{me.name}</div><div style={{ font: '600 12.5px var(--fb)', color: 'var(--ink3)' }}>{me.role}</div></div>
          </>
        )}
      </div>
    </aside>
  );
}

/** The school block at the top of the admin menu, and the button that collapses the menu. */
export function SchoolHeader({ logo, name, place, onToggle, collapsed }: { logo: string; name: string; place: string; onToggle: () => void; collapsed: boolean }) {
  return (
    <div className="ws">
      <span className="lg">{logo}</span>
      <div className="fade"><b>{name}</b><small>{place}</small></div>
      <button className="colb" onClick={onToggle} aria-label={collapsed ? 'Expand the menu' : 'Collapse the menu'}>
        <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path className="i" d="M4 5h16v14H4zM9.5 5v14"></path></svg>
      </button>
    </div>
  );
}

/** The workspace block at the top of the console menu, with the environment marked. */
export function WorkspaceHeader({ env, onToggle, collapsed, envClass }: { env: string; onToggle: () => void; collapsed: boolean; envClass?: string }) {
  return (
    <div className="wsw">
      <span className="lg" style={{ background: 'none' }}><GradeonIcon /></span>
      <div className="fade"><b>Gradeon</b><small><span className={`pdot ${envClass ?? ''}`}></span>{env}</small></div>
      <button className="colb" onClick={onToggle} aria-label={collapsed ? 'Expand the menu' : 'Collapse the menu'}>
        <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path className="i" d="M4 5h16v14H4zM9.5 5v14"></path></svg>
      </button>
    </div>
  );
}
