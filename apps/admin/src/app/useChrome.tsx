import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardPieces } from '@gradeon/config-engine';
import { useRouterState } from '@tanstack/react-router';
import { Dock, MoreSheet, Presence, SchoolHeader, SearchDialog, Sidebar, tintFor, useTheme, useHue, type DockTab, type PaletteHit, Icon } from '@gradeon/web-ui';
import type { ShellData } from '@gradeon/contracts';
import { activeNav, adminNav, shortcutTargets } from './nav';
import { useApp } from './context';

const COLLAPSE_KEY = 'gradeon.admin.menu.collapsed';

/** What every page shares: the theme, the menu, the shortcuts and the search box. Called once, by the signed-in layout. */
export function useChrome() {
  const { api, base, slug, user, go, signOut } = useApp();
  const theme = useTheme();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = activeNav(base && pathname.startsWith(base) ? pathname.slice(base.length) || '/' : pathname);
  // The last menu this browser saw for the school stands in while the real one loads, so the menu does not jump on arrival.
  const shellKey = `gradeon.admin.${slug}.shell`;
  const shell = useQuery({ queryKey: ['shell'], queryFn: api.shell, staleTime: 30_000, placeholderData: () => { try { return (JSON.parse(localStorage.getItem(shellKey) ?? 'null') as ShellData | null) ?? undefined; } catch { return undefined; } } });
  useEffect(() => { if (shell.data && !shell.isPlaceholderData) try { localStorage.setItem(shellKey, JSON.stringify(shell.data)); } catch { /* storage can be blocked */ } }, [shell.data, shell.isPlaceholderData, shellKey]);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } });
  const [open, setOpen] = useState(false);
  // "Search" on the not-found page lands here with ?search=1: open the box, and take the flag out of the address.
  useEffect(() => {
    const u = new URL(window.location.href);
    if (!u.searchParams.has('search')) return;
    setOpen(true);
    u.searchParams.delete('search');
    window.history.replaceState(window.history.state, '', u);
  }, []);
  const [more, setMore] = useState(false);
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  useEffect(() => { const t = setTimeout(() => setDq(q), 140); return () => clearTimeout(t); }, [q]);
  const hits = useQuery({ queryKey: ['search', dq], queryFn: () => api.search(dq), enabled: open, placeholderData: (p) => p });

  const data = shell.data;
  useHue(data?.hue);
  const groups = useMemo(() => adminNav(data?.menu ?? [], base, data?.badges), [data, base]);
  const targets = useMemo(() => shortcutTargets(groups), [groups]);
  // `N` then a letter starts something new (the dashboard's New menu shows the same keys), from the module definitions.
  const news = useMemo(() => new Map(dashboardPieces({ modules: data?.modules ?? [], features: data?.features ?? [] }, user.permissions)
    .filter((p) => p.kind === 'new' && p.keys && p.to).map((p) => [p.keys!.replace('N ', '').toLowerCase(), p.to!])), [data, user.permissions]);
  const goRef = useRef(go);
  goRef.current = go;

  useEffect(() => {
    let armed = 0;
    let mode: 'g' | 'n' = 'g';
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); return; }
      if (e.key === 'Escape') { setOpen(false); setMore(false); return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '/') { e.preventDefault(); setOpen(true); return; }
      if (Date.now() - armed < 1200) {
        const to = mode === 'n' ? news.get(e.key.toLowerCase()) : targets.get(e.key.toLowerCase());
        armed = 0;
        if (to) { e.preventDefault(); goRef.current(to.startsWith(base) && base ? to.slice(base.length) || '/' : to); }
      } else if (e.key.toLowerCase() === 'g' || e.key.toLowerCase() === 'n') { armed = Date.now(); mode = e.key.toLowerCase() as 'g' | 'n'; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [targets, news, base]);

  const close = () => { setOpen(false); setQ(''); };
  const pick = (h: PaletteHit) => {
    close();
    if (h.href.startsWith('action:')) { window.dispatchEvent(new CustomEvent('gradeon:action', { detail: h.href.slice(7) })); return; }
    goRef.current(h.href);
  };

  const t = tintFor(user.name);
  const has = (id: string) => groups.some((g) => g.items.some((i) => i.id === id));
  // The phone dock: Home, then the first page of the person's own work (a teacher's Teach group before People and Money), then More.
  const DOCK_GROUPS = ['Teach', 'People', 'Money', 'Care', 'Reach', 'Campus'];
  const picks = DOCK_GROUPS.map((n) => groups.find((g) => g.name === n)).filter((g) => !!g && g.items.length).slice(0, 2).map((g) => ({ group: g!, item: g!.items[0]! }));
  const dockTabs: DockTab[] = [
    { id: 'home', label: 'Dashboard', icon: 'home', onPress: () => goRef.current('/') },
    ...picks.map(({ group, item }) => ({ id: group.name, label: item.label, icon: item.icon, onPress: () => goRef.current(item.href.replace(base, '') || '/') })),
    { id: 'more', label: 'More', icon: 'more', onPress: () => setMore(true) },
  ];
  const dockActive = active === 'dash' ? 'home' : picks.find((p) => p.group.items.some((i) => i.id === active))?.group.name ?? 'more';

  const aside: ReactNode = (
    <>
    <Sidebar
      label="Main menu" collapsed={collapsed} groups={groups} active={active}
      onNavigate={(href) => goRef.current(base && href.startsWith(base) ? href.slice(base.length) || '/' : href)}
      header={<SchoolHeader logo={data?.school.logoText ?? ''} logoUrl={data?.school.logoUrl} name={data?.school.shortName ?? ''} place={data?.school.place ?? ''} color={data?.school.color} collapsed={collapsed} onToggle={() => setCollapsed((c) => { try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* ignore */ } return !c; })} />}
      promo={data && has('ex') && data.term.daysToGo !== null && (
        <div className="sbc">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: '700 12px var(--fb)', color: 'var(--ink2)' }}>{data.term.name && <span className="chip a">{data.term.name}</span>}{data.term.examsLabel}</div>
          <div className="fd" style={{ fontSize: 22, letterSpacing: '-.03em' }}>{data.term.daysToGo === 0 ? 'Starts today' : `${data.term.daysToGo} ${data.term.daysToGo === 1 ? 'day' : 'days'} to go`}</div>
          <div style={{ height: 10, borderRadius: 7, background: 'var(--s2)' }}><div style={{ width: `${data.term.progress}%`, height: '100%', borderRadius: 7, background: 'var(--brand)' }} /></div>
          {has('ex') && <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => goRef.current('/exams')}>See the exam schedule<Icon name="next" /></button>}
        </div>
      )}
      me={{ initials: user.initials, name: user.name, role: user.roleNames.length > 1 ? `${user.roleNames[0]} and ${user.roleNames.length - 1} more` : user.roleNames[0] ?? 'Staff', bg: t.bg, fg: t.fg }}
      meMenu={[{ label: 'My account', onPress: () => goRef.current('/account') }, { label: theme.theme === 'dark' ? 'Switch to light' : 'Switch to dark', onPress: theme.toggle }, { label: 'Sign out', onPress: signOut }]}
    />
    <Dock tabs={dockTabs} active={dockActive} />
    </>
  );

  const overlays: ReactNode = (
    <>
      <Presence>{open && <SearchDialog hits={hits.data ?? []} query={q} onQuery={setQ} onPick={pick} onClose={close} empty={`No matches for “${q}”. Try part of a name, an admission number or a class.`} />}</Presence>
      <Presence>{more && (
        <MoreSheet title="Menu" onClose={() => setMore(false)}>
          {groups.map((g) => (
            <div key={g.name}>
              <div className="sl">{g.name}</div>
              {g.items.map((n) => (
                <a key={n.id} className={`nvm ${n.id === active ? 'on' : ''}`} href={n.href} onClick={(e) => { e.preventDefault(); setMore(false); goRef.current(base && n.href.startsWith(base) ? n.href.slice(base.length) || '/' : n.href); }}>
                  <Icon name={n.icon} />{n.label}
                </a>
              ))}
            </div>
          ))}
          <div className="sl">You</div>
          <a className={`nvm ${pathname.endsWith('/account') ? 'on' : ''}`} href={`${base}/account`} onClick={(e) => { e.preventDefault(); setMore(false); goRef.current('/account'); }}>My account</a>
          <button className="btn" style={{ width: '100%', marginTop: 12 }} onClick={theme.toggle}>{theme.theme === 'dark' ? 'Switch to light' : 'Switch to dark'}</button>
          <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={() => { setMore(false); signOut(); }}>Sign out</button>
        </MoreSheet>
      )}</Presence>
    </>
  );

  return { themeCls: theme.cls, aside, overlays, openSearch: () => setOpen(true), shell: data };
}
