import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dock, IC, MoreSheet, Palette, Sidebar, WorkspaceHeader, tintFor, useTheme, type DockTab, type PaletteHit } from '@gradeon/web-ui';
import { consoleNav, shortcutTargets } from './nav';
import { useApp } from './context';
import { path, url } from './base';

const COLLAPSE_KEY = 'gradeon.console.menu.collapsed';
const ENV = (import.meta.env.VITE_ENV_LABEL as string | undefined) ?? (/^(localhost|127\.)/.test(window.location.hostname) ? 'Local' : 'Test track');

/** What every console page shares: theme, menu, shortcuts and the search box. Merge it into the page's values. */
export function useChrome(active: string) {
  const { api, user, go, signOut } = useApp();
  const theme = useTheme();
  const schools = useQuery({ queryKey: ['schools'], queryFn: () => api.schools(), staleTime: 20_000 });
  const actions = useQuery({ queryKey: ['actions'], queryFn: api.actions.list, staleTime: 20_000 });
  const requests = useQuery({ queryKey: ['change-requests', 'open'], queryFn: () => api.changeRequests.list('open'), staleTime: 20_000 });
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } });
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [q, setQ] = useState('');

  const pending = (actions.data ?? []).filter((a) => a.status === 'pending_approval').length;
  const onboarding = (schools.data ?? []).filter((s) => s.status === 'onboarding').length;
  const asked = (requests.data ?? []).length;
  const groups = useMemo(() => consoleNav({ onboarding, approvals: pending, requests: asked }), [onboarding, pending, asked]);
  const targets = useMemo(() => shortcutTargets(groups), [groups]);
  const goRef = useRef(go);
  goRef.current = go;

  useEffect(() => {
    let armed = 0;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); return; }
      if (e.key === 'Escape') { setOpen(false); return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '/') { e.preventDefault(); setOpen(true); return; }
      if (Date.now() - armed < 1200) {
        const to = targets.get(e.key.toLowerCase());
        armed = 0;
        if (to) { e.preventDefault(); goRef.current(path(to)); }
      } else if (e.key.toLowerCase() === 'g') armed = Date.now();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [targets]);

  const hits = useMemo<PaletteHit[]>(() => {
    const needle = q.trim().toLowerCase();
    const pages = groups.flatMap((g) => g.items).filter((i) => !needle || i.label.toLowerCase().includes(needle)).map((i) => ({ group: 'Go to', title: i.label, hint: '', href: i.href, keys: i.keys }));
    const found = needle ? (schools.data ?? []).filter((s) => s.name.toLowerCase().includes(needle) || s.slug.includes(needle)).slice(0, 6).map((s) => ({ group: 'Schools', title: s.name, hint: `${s.slug} · cell ${s.cell}`, href: `/schools/${s.id}` })) : [];
    return [...found, ...pages].slice(0, 12);
  }, [q, groups, schools.data]);

  const close = () => { setOpen(false); setQ(''); };
  const t = tintFor(user.name);

  const dockTabs: DockTab[] = [
    { id: 'fleet', label: 'Fleet', icon: IC.fleet, onPress: () => goRef.current('/') },
    { id: 'onb', label: 'Onboard', icon: IC.onb, onPress: () => goRef.current('/onboarding') },
    { id: 'rel', label: 'Releases', icon: IC.rel, onPress: () => goRef.current('/releases') },
    { id: 'more', label: 'More', icon: 'M5 12h.01M12 12h.01M19 12h.01', onPress: () => setMore(true) },
  ];
  const dockActive = ['fleet', 'onb', 'rel'].includes(active) ? active : 'more';
  const aside: ReactNode = (
    <>
    <Sidebar
      label="Console menu" collapsed={collapsed} groups={groups} active={active}
      onNavigate={(href) => goRef.current(path(href))}
      header={<WorkspaceHeader env={ENV} envClass={ENV === 'Production' ? '' : 'safe'} collapsed={collapsed} onToggle={() => setCollapsed((c) => { try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* ignore */ } return !c; })} />}
      promo={(
        <div className="sbc">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`chip ${pending ? 'a' : 'g'}`}>{pending ? 'Needs you' : 'All clear'}</span>
          </div>
          <div className="fd" style={{ fontSize: 20, letterSpacing: '-.03em' }}>{pending ? `${pending} ${pending === 1 ? 'request' : 'requests'} to approve` : 'Nothing waiting'}</div>
          <button className="btn wht sm" style={{ alignSelf: 'flex-start' }} onClick={() => goRef.current('/approvals')}>{pending ? 'Review' : 'Open approvals'}<svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d="M5 12h14M13 6l6 6-6 6"></path></svg></button>
        </div>
      )}
      me={{ initials: user.initials, name: user.name, role: roleLabel(user.roles[0]), bg: t.bg, fg: t.fg }}
      meMenu={[{ label: theme.theme === 'dark' ? 'Switch to light' : 'Switch to dark', onPress: theme.toggle }, { label: 'Sign out', onPress: signOut }]}
    />
    <Dock tabs={dockTabs} active={dockActive} />
    {more && (
      <MoreSheet title="Menu" onClose={() => setMore(false)}>
        {groups.map((g) => (
          <div key={g.name}>
            <div className="sl">{g.name}</div>
            {g.items.map((n) => (
              <a key={n.id} className={`nvm ${n.id === active ? 'on' : ''}`} href={n.href} onClick={(e) => { e.preventDefault(); setMore(false); goRef.current(path(n.href)); }}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d={n.icon}></path></svg>{n.label}
              </a>
            ))}
          </div>
        ))}
        <button className="btn" style={{ width: '100%', marginTop: 14 }} onClick={() => { setMore(false); signOut(); }}>Sign out</button>
      </MoreSheet>
    )}
    </>
  );

  const palette: ReactNode = open && (
    <>
      <div className="scrim" onClick={close}></div>
      <div className="mod" style={{ top: '18%', transform: 'translate(-50%, 0)', width: 'min(560px, calc(100% - 32px))' }}>
        <Palette hits={hits} query={q} onQuery={setQ} onPick={(h) => { close(); goRef.current(path(h.href)); }} onClose={close} placeholder="Find a school or go to a page" empty={`No matches for “${q}”. Try a school name or a page like Releases.`} />
      </div>
    </>
  );

  return { themeCls: theme.cls, rmCls: '', aside, palette, openSearch: () => setOpen(true), schools, actions, pending };
}

export function roleLabel(role: string | undefined): string {
  return ({ super_admin: 'Super admin', implementation: 'Implementation', support: 'Support', release_manager: 'Release manager', finance: 'Finance', compliance: 'Compliance', auditor: 'Auditor' } as Record<string, string>)[role ?? ''] ?? 'Team';
}
