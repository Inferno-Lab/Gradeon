import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, EmptyCard, Shell, tintFor } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { url } from '../../app/base';
import { useChrome } from '../../app/useChrome';
import { curve, initials, statusOf } from '../../app/format';
import { FleetView } from './fleet.view';

const TICKS = 60;
const STATE: Record<string, string> = { draft: 'Ready to start', rolling: 'Rolling out', paused: 'Paused', halted: 'Halted', done: 'Finished', rolled_back: 'Rolled back' };

export function FleetPage() {
  const app = useApp();
  const chrome = useChrome('fleet');
  const qc = useQueryClient();
  const [ci, setCi] = useState(-1);
  const [dismissed, setDismissed] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [alerts, setAlerts] = useState(false);
  const [error, setError] = useState('');
  const fleet = useQuery({ queryKey: ['fleet'], queryFn: app.api.fleet, refetchInterval: (q) => (q.state.data?.release?.status === 'rolling' ? 4000 : 30_000) });
  const schools = chrome.schools;
  const f = fleet.data;

  const refresh = () => void qc.invalidateQueries({ predicate: (q) => ['fleet', 'schools', 'releases'].includes(String(q.queryKey[0])) });
  const pause = useMutation({ mutationFn: (b: { id: string; paused: boolean }) => app.api.releases.pause(b.id, b.paused), onSuccess: refresh, onError: (e) => setError((e as Error).message) });
  const rollback = useMutation({ mutationFn: (id: string) => app.api.releases.rollback(id), onSuccess: () => { setConfirm(false); refresh(); }, onError: (e) => setError((e as Error).message) });
  const probe = useMutation({ mutationFn: app.api.probe, onSuccess: refresh });

  useEffect(() => { if (f && ci < 0) setCi(Math.min(23, new Date().getHours())); }, [f, ci]);

  if (fleet.isError && !f) {
    return (
      <Shell page="fleet" theme={chrome.themeCls} aside={chrome.aside}>
        <main className="mn"><header className="hd"><div><h1>Fleet</h1></div></header>
          <div><EmptyCard error title="Fleet" chip={{ text: 'Couldn’t load', tone: 'r' }} scene="plug" heading="That didn’t load" body={(fleet.error as Error).message} actions={<button className="btn pri" onClick={() => void fleet.refetch()}>Try again</button>} /></div>
        </main>
      </Shell>
    );
  }
  if (!f) {
    return (
      <Shell page="fleet" theme={chrome.themeCls} aside={chrome.aside} overlays={<>{chrome.palette}</>}>
        <main className="mn" aria-busy="true"><header className="hd"><div><h1>Fleet</h1><p>&nbsp;</p></div></header>
          <div className="skc" style={{ height: 240, borderRadius: 28 }} />
        </main>
      </Shell>
    );
  }

  const rel = f.release;
  const relSchools = rel?.waves.flatMap((w) => w.schools) ?? [];
  const done = relSchools.filter((s) => s.state === 'done').length;
  const total = relSchools.length;
  const on = total ? Math.round((done / total) * TICKS) : 0;
  const rolling = rel?.status === 'rolling';
  const paused = rel?.status === 'paused';
  const live = rel && ['rolling', 'paused', 'halted'].includes(rel.status);
  const prevOf = new Map(relSchools.map((s) => [s.id, s]));
  const wave = rel ? Math.max(1, rel.waves.findIndex((w) => w.status === 'rolling' || w.status === 'halted') + 1 || rel.waves.filter((w) => w.status === 'done').length) : 0;

  const hours = Array.from({ length: 24 }, (_, h) => f.requests24h.find((r) => r.hour === h) ?? { hour: h, value: 0, previous: 0 });
  const today = hours.map((h) => h.value);
  const before = hours.map((h) => h.previous);
  const max = Math.max(1, ...today, ...before);
  const at = Math.max(0, Math.min(23, ci < 0 ? 0 : ci));
  const cy = 228 - (today[at]! / max) * 190;
  const delta = today[at]! - before[at]!;
  const peak = hours.reduce((m, h) => (h.value > m.value ? h : m), hours[0]!);
  const place = (clientX: number, box: HTMLElement) => {
    const r = box.getBoundingClientRect();
    setCi(Math.max(0, Math.min(23, Math.round(((clientX - r.left) / r.width) * 23))));
  };

  const list = [...(schools.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const cellRows = f.cells.map((c) => {
    const here = list.filter((s) => s.cell === c.key);
    const pct = c.max ? Math.round((c.schools / c.max) * 100) : 0;
    const bad = here.some((s) => s.health === 'degraded' || s.health === 'down');
    const upd = here.some((s) => prevOf.get(s.id)?.state === 'rolling');
    const st = bad ? { t: 'Elevated', c: 'a', col: 'var(--a)' } : upd ? { t: 'Updating', c: 'b', col: 'var(--b)' } : { t: 'Healthy', c: 'g', col: 'var(--g)' };
    return { n: `Cell ${c.key}`, s: c.schools, p: pct, st: st.t, cc: st.c, col: st.col, off: (138 * (1 - Math.min(100, pct) / 100)).toFixed(1) };
  });
  const rows = list.map((s, i) => {
    const t = tintFor(s.name);
    const r = prevOf.get(s.id);
    const newer = r?.state === 'done';
    const st = statusOf(s);
    return {
      id: s.id, n: s.name, cell: s.cell, ini: initials(s.name), bg: t.bg, fg: t.fg, from: r?.prev ?? s.versions.api, to: rel?.version ?? s.versions.api, vy: newer ? -26 : 0,
      up: newer && i < 3 ? 'up' : '', st: st.text, cc: st.tone, p: s.healthMs != null ? `${s.healthMs} ms` : '–',
      href: url(`/schools/${s.id}`), open: (e: React.MouseEvent) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); app.go(`/schools/${s.id}`); },
    };
  });
  const month = new Date().toISOString().slice(0, 7);
  const incident = f.incident && dismissed !== f.incident.id ? f.incident : null;
  const incSchool = incident?.schoolName ? list.find((s) => s.name === incident.schoolName) : undefined;
  const hOk = f.healthy, hWarn = f.degraded, hBad = Math.max(0, f.live - f.healthy - f.degraded);
  const upcoming = f.upcoming;

  const v = {
    ...chrome, pending: chrome.pending,
    subtitle: `${f.schools} ${f.schools === 1 ? 'school' : 'schools'} in ${f.cells.length} ${f.cells.length === 1 ? 'cell' : 'cells'} · updated ${fleet.isFetching ? 'now' : 'just now'}`,
    openApprovals: () => setAlerts(true), onboard: () => app.go('/onboarding/new'), openReleases: () => app.go('/releases'), openCells: () => app.go('/cells'),
    pausedCls: paused ? 'paused' : '', relState: rel ? STATE[rel.status] : 'No release yet', relVersion: rel?.version ?? '–',
    relLine: rel ? `${rel.waves.length ? `Wave ${wave} of ${rel.waves.length} · ` : ''}${done} of ${total} schools` : 'Create a release to update every school in waves.',
    hasRelease: !!rel, done, total, ticks: Array.from({ length: TICKS }, (_, k) => ({ c: k < on - 1 ? 'on' : k === on - 1 && rolling ? 'now' : k < on ? 'on' : '' })),
    waves: (rel?.waves ?? []).map((w) => ({ c: w.status === 'done' ? 'd' : w.status === 'rolling' || w.status === 'halted' ? 'c' : '' })),
    canPause: !!live && rel?.status !== 'halted', canRollback: !!live, relCta: rel ? 'Open releases' : 'Create a release', busy: pause.isPending || rollback.isPending,
    pauseLabel: paused ? 'Resume wave' : 'Pause wave', pauseIc: paused ? 'M7 4l12 8-12 8z' : 'M7 5h4v14H7zM13 5h4v14h-4z',
    pause: () => rel && pause.mutate({ id: rel.id, paused: !paused }), rollback: () => setConfirm(true),
    live: f.live, newThisMonth: (schools.data ?? []).filter((s) => s.createdAt.startsWith(month)).length,
    soon: f.onboarding ? `${f.onboarding} ${f.onboarding === 1 ? 'is' : 'are'} still being set up` : 'None waiting to start',
    p95: f.p95Ms ? `p95 ${f.p95Ms} ms` : 'p95 not measured yet', hOk, hWarn, hBad,
    p1: curve(today, max), p2: curve(before, max), pArea: curve(today, max, true),
    // The bubble stays inside the chart near the ends of the day; the dot and the line still sit on the hour.
    tx: Math.min(86, Math.max(14, (at / 23) * 100)).toFixed(2),
    cx: ((at / 23) * 100).toFixed(2), cy: cy.toFixed(1), ty: Math.max(84, cy).toFixed(1), cv: today[at]!.toLocaleString('en-IN'),
    ct: `${String(at).padStart(2, '0')}:00 · ${delta >= 0 ? '+' : ''}${delta.toLocaleString('en-IN')} vs yesterday`,
    chartLabel: `Requests per minute across the day, highest around ${String(peak.hour).padStart(2, '0')}:00 at ${peak.value.toLocaleString('en-IN')}`,
    cmove: (e: React.MouseEvent<HTMLElement>) => place(e.clientX, e.currentTarget), ctouch: (e: React.TouchEvent<HTMLElement>) => place(e.touches[0]!.clientX, e.currentTarget),
    cells: cellRows, rows, loading: schools.isLoading,
    inc: incident ? {
      cls: incident.state === 'resolved' ? 'ok' : '', chip: incident.state === 'resolved' ? 'g' : 'r', tag: incident.state === 'resolved' ? 'Resolved' : `Incident${incident.schoolName ? ` · ${incident.schoolName}` : ''}`,
      title: incident.title, body: incident.body, dismiss: () => setDismissed(incident.id), open: incSchool ? () => app.go(`/schools/${incSchool.id}`) : undefined,
    } : null,
    recheck: () => probe.mutate(),
    up: upcoming.length
      ? { title: `${upcoming.length} ${upcoming.length === 1 ? 'school starts' : 'schools start'} soon`, body: `${upcoming.map((u) => u.name).slice(0, 2).join(' and ')} ${upcoming.length === 1 ? 'is' : 'are'} being set up for the first admin.` }
      : { title: 'No schools waiting', body: 'Onboard a school and it shows up here while it is being set up.' },
    alertsDialog: alerts && (
      <Dialog title="Alerts" tag={{ text: chrome.pending || (f.degraded && f.degraded > 0) || incident?.state === 'open' ? 'Needs you' : 'All clear', tone: chrome.pending || incident?.state === 'open' ? 'a' : 'g' }} onClose={() => setAlerts(false)} width={460}>
        <div className="stack">
          {incident?.state === 'open' && <div className="kv" style={{ alignItems: 'flex-start' }}><span><b style={{ color: 'var(--ink)' }}>{incident.title}</b><br /><small style={{ color: 'var(--ink3)' }}>{incident.body}</small></span><b><span className="st r"><i></i>Open</span></b></div>}
          {chrome.pending > 0 && <div className="kv"><span>{chrome.pending} {chrome.pending === 1 ? 'request is' : 'requests are'} waiting for a second person</span><b><button className="btn sm" onClick={() => { setAlerts(false); app.go('/approvals'); }}>Review</button></b></div>}
          {f.degraded > 0 && <div className="kv"><span>{f.degraded} {f.degraded === 1 ? 'school is' : 'schools are'} answering slowly</span><b><button className="btn sm" onClick={() => { setAlerts(false); app.go('/health'); }}>Open health</button></b></div>}
          {!chrome.pending && !f.degraded && incident?.state !== 'open' && <div className="help">Nothing needs you right now. Approvals, incidents and slow schools appear here.</div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}><button className="btn pri" onClick={() => setAlerts(false)}>Done</button></div>
      </Dialog>
    ),
    dialog: confirm && rel ? (
      <Dialog title={`Roll back ${rel.version}?`} tag={{ text: 'Goes back one version', tone: 'a' }} onClose={() => setConfirm(false)} width={460}>
        <p>Every school already on {rel.version} returns to the version it had before. Schools not reached yet stay as they are.</p>
        {error && <div className="emsg" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn" onClick={() => setConfirm(false)}>Keep rolling</button>
          <button className="btn dngf" disabled={rollback.isPending} onClick={() => rollback.mutate(rel.id)}>Roll back</button>
        </div>
      </Dialog>
    ) : null,
  };
  return <FleetView v={v} />;
}
