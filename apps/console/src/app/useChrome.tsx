import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { CONSOLE_ROLE_INFO, type ConsoleRole } from '@tangent/contracts';
import { Dialog, Dock, Field, MoreSheet, Presence, SearchDialog, Sidebar, WorkspaceHeader, tintFor, useShake, useTheme, type DockTab, type PaletteHit, Icon } from '@tangent/web-ui';
import { PAGES, SCHOOL_TABS, activeNav, consoleNav, shortcutTargets } from './nav';
import { HttpError } from '@tangent/api-client';
import { useApp } from './context';
import { path } from './base';

const COLLAPSE_KEY = 'tangent.console.menu.collapsed';

/** What every console page shares: theme, menu, shortcuts and the search box. Called once, by the signed-in layout. */
export function useChrome() {
  const { api, user, go, can, signOut } = useApp();
  const theme = useTheme();
  const active = activeNav(path(useRouterState({ select: (s) => s.location.pathname })));
  const about = useQuery({ queryKey: ['about'], queryFn: api.about, staleTime: Infinity, retry: false });
  const schools = useQuery({ queryKey: ['schools'], queryFn: () => api.schools(), staleTime: 20_000 });
  const actions = useQuery({ queryKey: ['actions'], queryFn: api.actions.list, staleTime: 20_000 });
  const requests = useQuery({ queryKey: ['change-requests', 'open'], queryFn: () => api.changeRequests.list('open'), staleTime: 20_000 });
  const policy = useQuery({ queryKey: ['policy'], queryFn: api.policy.get, staleTime: 60_000 });
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } });
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [account, setAccount] = useState(false);
  const [q, setQ] = useState('');
  // Search also finds the team and connections: loaded only once the box is open.
  const team = useQuery({ queryKey: ['team'], queryFn: api.team.list, staleTime: 60_000, enabled: open });
  const links = useQuery({ queryKey: ['integrations'], queryFn: api.integrations.view, staleTime: 60_000, enabled: open && can('integrations.read') });

  const pending = (actions.data ?? []).filter((a) => a.status === 'pending_approval').length;
  const onboarding = (schools.data ?? []).filter((s) => s.status === 'onboarding').length;
  const asked = (requests.data ?? []).length;
  const groups = useMemo(() => consoleNav(can, { onboarding, approvals: pending, requests: asked }), [can, onboarding, pending, asked]);
  const targets = useMemo(() => shortcutTargets(groups), [groups]);
  const goRef = useRef(go);
  goRef.current = go;

  useEffect(() => {
    // "Search" on the not-found page lands here with ?search=1.
    const u = new URL(window.location.href);
    if (!u.searchParams.has('search')) return;
    setOpen(true);
    u.searchParams.delete('search');
    window.history.replaceState(window.history.state, '', u);
  }, []);

  useEffect(() => {
    let armed = 0;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); return; }
      if (e.key === 'Escape') { setOpen(false); setMore(false); return; }
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
    const has = (...v: string[]) => v.some((x) => x.toLowerCase().includes(needle));
    const shown = new Set(groups.flatMap((g) => g.items.map((i) => i.id)));
    // Pages and their tabs ("Releases · Database changes"); the shortcut is listed beside each page, which is how it is learnt.
    const pages = PAGES.filter((p) => shown.has(p.id)).flatMap((p) => [
      { group: 'Go to', title: p.label, hint: '', href: p.to, keys: p.keys },
      ...(p.tabs ?? []).slice(1).filter((t) => !t.needs || can(t.needs)).map((t) => ({ group: 'Go to', title: `${p.label} · ${t.label}`, hint: '', href: `${p.to}/${t.key}` })),
    ]).filter((h) => !needle || has(h.title));
    if (!needle) return pages.filter((h) => 'keys' in h).slice(0, 12);
    // "greenfield roles" opens that school's Roles tab.
    const words = needle.split(/\s+/);
    const schoolHits = (schools.data ?? []).flatMap((s) => {
      const tab = SCHOOL_TABS.find((t) => words.length > 1 && t.label.toLowerCase().startsWith(words[words.length - 1]!) && (!t.needs || can(t.needs)));
      const name = tab ? words.slice(0, -1).join(' ') : needle;
      if (!s.name.toLowerCase().includes(name) && !s.slug.includes(name)) return [];
      return [tab ? { group: 'Schools', title: `${s.name} · ${tab.label}`, hint: s.slug, href: `/schools/${s.id}/${tab.key}` } : { group: 'Schools', title: s.name, hint: `${s.slug} · cell ${s.cell}`, href: `/schools/${s.id}` }];
    }).slice(0, 6);
    const people = (team.data ?? []).filter((p) => has(p.name, p.email)).slice(0, 4).map((p) => ({ group: 'Team', title: p.name, hint: p.email, href: '/team' }));
    const conns = (links.data?.connections ?? []).filter((c) => has(c.name, c.provider)).slice(0, 4).map((c) => ({ group: 'Connections', title: c.name, hint: c.provider, href: '/integrations' }));
    const reqs = (requests.data ?? []).filter((r) => has(r.schoolName, r.area, r.message)).slice(0, 4).map((r) => ({ group: 'Open requests', title: `${r.schoolName}: ${r.area}`, hint: r.message.slice(0, 60), href: '/requests' }));
    return [...schoolHits, ...pages, ...reqs, ...people, ...conns].slice(0, 16);
  }, [q, groups, can, schools.data, team.data, links.data, requests.data]);

  const close = () => { setOpen(false); setQ(''); };
  const t = tintFor(user.name);
  const env = about.data?.environment ?? '';

  // On a phone: what is opened from a phone, the rest under More.
  const dockTabs: DockTab[] = [
    { id: 'fleet', label: 'Fleet', icon: 'fleet', onPress: () => goRef.current('/') },
    { id: 'appr', label: 'Approvals', icon: 'approvals', onPress: () => goRef.current('/approvals') },
    { id: 'health', label: 'Health', icon: 'health', onPress: () => goRef.current('/health') },
    { id: 'more', label: 'More', icon: 'more', onPress: () => setMore(true) },
  ];
  const dockActive = ['fleet', 'appr', 'health'].includes(active) ? active : 'more';
  const aside: ReactNode = (
    <>
    <Sidebar
      label="Console menu" collapsed={collapsed} groups={groups} active={active}
      onNavigate={(href) => goRef.current(path(href))}
      header={<WorkspaceHeader env={env} envClass={env === 'Production' ? '' : 'safe'} collapsed={collapsed} onToggle={() => setCollapsed((c) => { try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* ignore */ } return !c; })} />}
      me={{ initials: user.initials, name: user.name, role: roleLabel(user.roles[0]), bg: t.bg, fg: t.fg }}
      meMenu={[{ label: 'My account', onPress: () => setAccount(true) }, { label: theme.theme === 'dark' ? 'Switch to light' : 'Switch to dark', onPress: theme.toggle }, { label: 'Sign out', onPress: signOut }]}
    />
    <Dock tabs={dockTabs} active={dockActive} />
    </>
  );

  const overlays: ReactNode = (
    <>
    <Presence>{open && <SearchDialog hits={hits} query={q} onQuery={setQ} onPick={(h) => { close(); goRef.current(path(h.href)); }} onClose={close} placeholder="Find a school, a page, a person or a connection" empty={`No matches for “${q}”. Try a school name, “greenfield roles”, or a page like Releases.`} />}</Presence>
    <Presence>{account && <AccountDialog onClose={() => setAccount(false)} />}</Presence>
    {/* While changes are frozen every page says so, with the reason and where it is lifted. */}
    {policy.data?.freeze && (
      <div className="sbar" role="status" style={{ position: 'fixed' }}>
        Changes are frozen: {policy.data.freezeReason || 'no reason given'}
        <button onClick={() => goRef.current('/settings/rules')}>{can('policy.write') ? 'Lift' : 'Why'}</button>
      </div>
    )}
    <Presence>{more && (
      <MoreSheet title="Menu" onClose={() => setMore(false)}>
        {groups.map((g) => (
          <div key={g.name}>
            <div className="sl">{g.name}</div>
            {g.items.map((n) => (
              <a key={n.id} className={`nvm ${n.id === active ? 'on' : ''}`} href={n.href} onClick={(e) => { e.preventDefault(); setMore(false); goRef.current(path(n.href)); }}>
                <Icon name={n.icon} />{n.label}
              </a>
            ))}
          </div>
        ))}
        <button className="btn" style={{ width: '100%', marginTop: 12 }} onClick={() => { setMore(false); setAccount(true); }}>My account</button>
        <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={() => { setMore(false); signOut(); }}>Sign out</button>
      </MoreSheet>
    )}</Presence>
    </>
  );

  return { themeCls: theme.cls, aside, overlays, openSearch: () => setOpen(true), schools, actions, pending };
}

export function roleLabel(role: string | undefined): string {
  return CONSOLE_ROLE_INFO[role as ConsoleRole]?.label ?? 'Team';
}

/** My account: my own password and authenticator. Anyone else's are changed under Team by a super admin. */
function AccountDialog({ onClose }: { onClose: () => void }) {
  const { api, user, signOut } = useApp();
  const shake = useShake();
  const [f, setF] = useState({ current: '', next: '', again: '', password: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [done, setDone] = useState('');
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErr((e) => ({ ...e, [k]: '', _: '' })); };
  const fail = (e: unknown) => { setErr(e instanceof HttpError && Object.keys(e.fields).length ? e.fields : { _: (e as Error).message }); shake.hit(); };
  const pass = useMutation({ mutationFn: () => api.changePassword({ current: f.current, next: f.next }), onSuccess: () => { setF({ ...f, current: '', next: '', again: '' }); setDone('Password changed. Your other sessions were signed out.'); }, onError: fail });
  const totp = useMutation({ mutationFn: () => api.resetAuthenticator(f.password), onSuccess: () => { setDone('Done. Sign in again to add the new phone to your authenticator.'); setTimeout(signOut, 1800); }, onError: fail });
  const change = () => {
    const p: Record<string, string> = {};
    if (!f.current) p.current = 'Type your current password.';
    if (f.next.length < 10) p.next = 'Use at least 10 characters.';
    else if (f.next !== f.again) p.again = 'The two do not match.';
    setErr(p);
    if (Object.keys(p).length) shake.hit(); else pass.mutate();
  };
  return (
    <Dialog title="My account" tag={{ text: user.email, tone: 'v' }} onClose={onClose} width={520} shake={shake.cls}>
      <div className="stack">
        <h3 style={{ margin: 0 }}>Password</h3>
        <Field label="Current password" type="password" value={f.current} onChange={set('current')} error={err.current} autoComplete="current-password" />
        <div className="two">
          <Field label="New password" type="password" value={f.next} onChange={set('next')} error={err.next} autoComplete="new-password" hint="At least 10 characters." />
          <Field label="New password again" type="password" value={f.again} onChange={set('again')} error={err.again} autoComplete="new-password" />
        </div>
        <div><button className="btn pri" disabled={pass.isPending} onClick={change}>{pass.isPending ? 'Saving…' : 'Change password'}</button></div>
        <h3 style={{ margin: '12px 0 0' }}>Authenticator</h3>
        <div className="help" style={{ marginTop: 0 }}>A new phone? Drop the old key here; the next sign-in shows a new one to scan.</div>
        <Field label="Your password" type="password" value={f.password} onChange={set('password')} error={err.password} autoComplete="current-password" />
        <div><button className="btn" disabled={totp.isPending || !f.password} onClick={() => totp.mutate()}>Set up a new authenticator</button></div>
        {err._ && <div className="emsg" role="alert">{err._}</div>}
        {done && <div className="help" role="status" style={{ color: 'var(--ok)' }}>{done}</div>}
      </div>
    </Dialog>
  );
}
