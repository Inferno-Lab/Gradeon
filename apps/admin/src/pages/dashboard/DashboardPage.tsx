import { useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inr, lakhs, type ApprovalRow, type DashboardData } from '@gradeon/contracts';
import { Dialog, EmptyCard, IC, PageScope, TONES, rollDigits, tintFor, useIsPhone } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { useShellChrome } from '../../app/Layout';
import { DashboardView } from './dashboard.view';
import { DashboardSkeleton } from './DashboardSkeleton';
import { PhoneDashboard } from '../phone/PhoneDashboard';

const RANGES: [string, number][] = [['Today', 1], ['This week', 6], ['This term', 24], ['This year', 24]];
const TABS: [string, 'attendance' | 'fees' | 'homework', number][] = [['Attendance', 'attendance', 104], ['Fees', 'fees', 72], ['Homework', 'homework', 104]];
// The last item of each row is the module it needs: a school without it does not see it.
const NEWS: [string, string, string, string, string][] = [
  ['Add student', 'stu', 'N S', '/students?add=1', 'people'], ['Collect a fee', 'fee', 'N F', '/students?pay=1', 'fees'], ['Post a notice', 'notice', 'N N', '/notices', 'notices'],
  ['Mark attendance', 'att', 'N A', '/attendance', 'attendance'], ['Schedule an exam', 'ex', 'N E', '/exams', 'exams'],
];
const WIDGETS: [string, string, string, string][] = [['rolls', 'Class rolls', 'Attendance of each class today', 'attendance'], ['fees', 'Fees by type', 'What each kind of fee has collected', 'fees'], ['day', 'Today at school', 'The timeline of the school day', 'events']];
const H = 236;
const UP = 'M7 17L17 7M9 7h8v8';
const DOWN = 'M7 7l10 10M17 9v8H9';

const money = (n: number) => (n >= 100000 ? `₹${lakhs(n)}` : `₹${Math.round(n / 1000)}k`);
/** A round top for the chart so the gridlines fall on friendly numbers. */
function niceMax(v: number): number {
  const steps = [20000, 40000, 100000, 200000, 400000, 1000000, 2000000, 4000000, 10000000];
  return steps.find((s) => s >= v) ?? Math.ceil(v / 1000000) * 1000000;
}
const trend = (pct: number) => ({ cls: pct >= 0 ? 'up' : 'dn', icon: pct >= 0 ? UP : DOWN, text: `${Math.abs(pct)}%` });
const greeting = () => { const h = (new Date().getUTCHours() * 60 + new Date().getUTCMinutes() + 330) / 60 % 24; return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

/** A phone gets its own home screen; everything wider gets the dashboard. */
export function DashboardPage() {
  return useIsPhone() ? <PhoneDashboard /> : <DashboardDesktop />;
}

function DashboardDesktop() {
  const app = useApp();
  const chrome = useShellChrome();
  const qc = useQueryClient();
  const [range, setRange] = useState(1);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [widgets, setWidgets] = useState(false);
  const [hidden, setHidden] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(`gradeon.dash.hidden.${app.user.id}`) ?? '[]') as string[]; } catch { return []; } });
  const setHide = (id: string, off: boolean) => setHidden((h) => { const n = off ? [...new Set([...h, id])] : h.filter((x) => x !== id); try { localStorage.setItem(`gradeon.dash.hidden.${app.user.id}`, JSON.stringify(n)); } catch { /* private window: the choice lasts until the page closes */ } return n; });
  const [toast, setToast] = useState<{ text: string; id: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const days = RANGES[range]![1];

  const q = useQuery({ queryKey: ['dashboard', days], queryFn: () => app.api.dashboard(days), refetchInterval: 20_000, placeholderData: keepPreviousData });

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const decide = useMutation({
    mutationFn: async (a: { n: ApprovalRow; decision: 'approve' | 'undo' }) => {
      if (a.n.kind === 'attendance') return app.api.attendance.remind();
      return app.api.approvals.decide(a.n.id, { decision: a.decision });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['dashboard'] }),
  });

  const d: DashboardData | undefined = q.data;
  const v = useMemo(() => (d ? build(d) : null), [d, range, tab, rangeOpen, newOpen, done, toast, chrome.shell, hidden, widgets]);

  function build(d: DashboardData) {
    const has = (m: string) => d.modules.includes(m);
    const tabsOn = TABS.filter((x) => has(x[1]));
    const T = tabsOn[tab] ?? tabsOn[0] ?? TABS[0]!;
    const off = WIDGETS.filter((w) => !has(w[3])).map((w) => w[0]);
    const kind = T[1];
    const pts = kind === 'attendance' ? d.charts.attendance.points : kind === 'fees' ? d.charts.fees.points : d.charts.homework.points;
    const values = pts.map((p) => ('pct' in p ? p.pct : p.amount));
    const goal = d.charts[kind].goal;
    const max = kind === 'fees' ? niceMax(Math.max(goal, ...values) * 1.1) : 100;
    const fmt = (x: number) => (kind === 'fees' ? money(x) : `${x}%`);
    const dense = pts.length > 8;
    const cols = pts.map((p, i) => {
      const x = values[i]!;
      const prev = kind === 'attendance' ? (p as { previousPct: number | null }).previousPct : null;
      return {
        n: dense ? (i % 3 === 0 || p.isToday ? String(Number(p.date.slice(8))) : '') : p.label,
        v: fmt(x), full: kind === 'attendance' ? `${p.date}` : (p as { full: string }).full ?? p.date, prev: prev !== null ? fmt(prev) : '',
        h: Math.max(6, (x / max) * H), gh: prev !== null ? Math.max(6, (prev / max) * H) : 0,
        c: 'var(--v2)', today: p.isToday ? 'today' : '', hover: () => undefined,
      };
    });
    const grid = [0, 1, 2, 3, 4].map((g) => ({ b: 30 + (g / 4) * H, l: kind === 'fees' ? (g === 0 ? '0' : money((max / 4) * g)) : `${(max / 4) * g}%` }));
    const needs = d.needsYou.map((n) => {
      const tone = TONES[n.tone] ?? TONES.violet!;
      const isDone = !!done[n.id];
      return {
        t: n.title, s: n.subtitle, ini: n.initials, bg: tone.bg, fg: tone.fg, a: n.action, open: !isDone, done: isDone ? 'done' : '',
        act: () => {
          setDone((s) => ({ ...s, [n.id]: true }));
          decide.mutate({ n, decision: 'approve' });
          clearTimeout(toastTimer.current);
          setToast({ text: n.doneText, id: n.id });
          toastTimer.current = setTimeout(() => setToast(null), 5000);
        },
      };
    });
    const left = needs.filter((n) => n.open).length;
    const me = tintFor(app.user.name);
    const t = d.timeline;
    return {
      ...chrome, goto: app.go, hidden: [...hidden, ...off], openWidgets: () => setWidgets(true),
      has: { attendance: has('attendance'), fees: has('fees') }, showChart: tabsOn.length > 0,
      showNeeds: () => document.getElementById('need')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      widgetsDialog: widgets && (
        <Dialog title="Dashboard widgets" onClose={() => setWidgets(false)} width={460}>
          <p className="help" style={{ margin: '0 0 12px' }}>Choose what this dashboard shows for you. Other people keep their own choice.</p>
          <div className="stack">
            {WIDGETS.filter((w) => has(w[3])).map(([id, name, blurb]) => (
              <div className="tgl" key={id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderTop: '1px solid var(--line)' }}>
                <div style={{ flex: 1 }}><b style={{ font: '700 14.5px var(--fb)' }}>{name}</b><div className="help">{blurb}</div></div>
                <button className={`sw ${hidden.includes(id) ? '' : 'on'}`} role="switch" aria-checked={!hidden.includes(id)} aria-label={name} onClick={() => setHide(id, !hidden.includes(id))}></button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}><button className="btn pri" onClick={() => setWidgets(false)}>Done</button></div>
        </Dialog>
      ), me: { name: app.user.name, initials: app.user.initials, role: app.user.roleNames[0] ?? 'Staff', ...me }, schoolName: chrome.shell?.school.shortName ?? d.schoolName,
      greeting: greeting(), subtitle: `${d.term.name} · ${d.subtitle.marked} of ${d.subtitle.classes} classes have marked attendance`,
      hasAlerts: left > 0,
      rangeOpen, rangeLabel: RANGES[range]![0], setRangeOpen: (o: boolean) => { setRangeOpen(o); setNewOpen(false); },
      ranges: RANGES.map((r, i) => ({ t: r[0], on: i === range, sel: i === range ? 'true' : 'false', d: 50 + i * 45, pick: () => { setRange(i); setRangeOpen(false); } })),
      newOpen, setNewOpen: (o: boolean) => { setNewOpen(o); setRangeOpen(false); },
      news: NEWS.filter((n) => has(n[4])).map((n, i) => ({ t: n[0], ic: IC[n[1] as keyof typeof IC], k: n[2], d: 50 + i * 45, go: () => { setNewOpen(false); app.go(n[3]); } })),
      dayLine: d.day.isToday ? `${d.day.label} · ${d.day.clock}` : `${d.day.label} · last school day`,
      kPresent: rollDigits(inr(d.present.value)), totalStudents: inr(d.present.total),
      presentTrend: trend(d.present.deltaPct), presentVersus: d.present.versus,
      kFees: rollDigits(inr(d.fees.collected)), feeMonth: d.fees.monthLabel, feePct: d.fees.pct, feeDue: inr(d.fees.due), feeTrend: trend(d.fees.deltaPct),
      overdueLine: `${d.fees.overdueFamilies} ${d.fees.overdueFamilies === 1 ? 'family' : 'families'} overdue`,
      kLeft: rollDigits(String(left)), avatars: d.approvals.avatars.map((a) => ({ initials: a.initials, ...(TONES[a.tone] ?? TONES.violet!) })), moreAvatars: Math.max(0, d.approvals.count - 3),
      chartTitle: kind === 'attendance' ? `Attendance, last ${pts.length} school ${pts.length === 1 ? 'day' : 'days'}` : kind === 'fees' ? 'Fees collected each day' : 'Homework handed in on time',
      chartAlt: `${T[0]} for the last ${pts.length} school days.`,
      tabs: tabsOn.map((x, i) => ({ n: x[0], on: x === T ? 'on' : '', sel: x === T ? 'true' : 'false', pick: () => setTab(i) })),
      grid, goalB: 30 + (goal / max) * H, goalL: kind === 'fees' ? `Daily target ${money(goal)}` : `Goal ${goal}%`, cols,
      chartEmpty: values.every((x) => x === 0),
      chartEmptyText: kind === 'attendance' ? 'Attendance appears here after the first roll call is marked.' : kind === 'fees' ? 'Payments appear here as fees are collected.' : 'Homework appears here once teachers set it and students hand it in.',
      needs, leftLabel: left ? `${left} open` : 'Clear', allDone: left === 0,
      toastOn: !!toast, toastText: toast?.text ?? '', canUndo: !!toast && toast.id !== 'att_reminder',
      undo: () => {
        if (!toast) return;
        const n = d.needsYou.find((x) => x.id === toast.id);
        setDone((s) => ({ ...s, [toast.id]: false }));
        setToast(null);
        if (n && n.kind !== 'attendance') decide.mutate({ n, decision: 'undo' });
      },
      rolls: d.classRolls.map((r) => ({
        n: r.name, pct: r.unmarked === r.size ? 'Not yet' : `${r.pct}%`,
        segs: [{ k: 'p', n: r.present }, { k: 'l', n: r.late }, { k: 'a', n: r.absent }, { k: 'u', n: r.unmarked }].filter((s) => s.n > 0),
        aria: `${r.name}: ${r.present} present, ${r.late} late, ${r.absent} absent${r.unmarked ? `, ${r.unmarked} not marked` : ''}`,
      })),
      heads: d.feeHeads.map((h) => ({ n: h.label, pct: h.pct, fill: h.due ? Math.max(h.pct, 2) : 0, amt: h.due ? `${money(h.collected)} of ${money(h.due)}` : 'Nothing due' })),
      nowLabel: d.day.isToday ? `Now · ${d.day.clock}` : 'Earlier', prog: d.timelineProgress,
      events: t.map((e) => ({ t: e.time, n: e.title, s: e.subtitle, cls: e.state === 'done' ? 'past' : e.state === 'now' ? 'now' : '' })),
    };
  }

  if (q.isError && !d) {
    return (
      <PageScope page="dashboard">
        <main className="mn"><header className="hd"><div><h1>Dashboard</h1></div></header>
          <div><EmptyCard error title="Dashboard" chip={{ text: 'Couldn’t load', tone: 'r' }} scene="plug" heading="That didn’t load" body={(q.error as Error).message} actions={<button className="btn pri" onClick={() => void q.refetch()}>Try again</button>} /></div>
        </main>
      </PageScope>
    );
  }
  if (!v) return <DashboardSkeleton />;
  return <DashboardView v={v} />;
}
