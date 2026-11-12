import { useMemo, useState } from 'react';
import { dashboardPieces } from '@gradeon/config-engine';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inr, lakhs, type ApprovalRow, type DashboardData } from '@gradeon/contracts';
import { Dialog, EmptyCard, IC, type PageIcon, PageScope, TONES, rollDigits, tintFor, useIsPhone, useToast, EmptyState } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { useShellChrome } from '../../app/Layout';
import { DashboardView } from './dashboard.view';
import { DashboardSkeleton } from './DashboardSkeleton';
import { PhoneDashboard } from '../phone/PhoneDashboard';

// Only ranges the dashboard can count truly: a day and a school week.
const RANGES: [string, number][] = [['Today', 1], ['This week', 6]];
// Each chart needs its module and the person's right to see it (a teacher does not see fee totals).
const TABS: [string, 'attendance' | 'fees' | 'homework', string][] = [['Attendance', 'attendance', 'attendance.read'], ['Fees', 'fees', 'fees.read'], ['Homework', 'homework', 'homework.read']];
const KIND_WORD: Record<string, [string, string]> = { leave: ['leave request', 'leave requests'], fee_waiver: ['fee waiver', 'fee waivers'], notice: ['notice', 'notices'], admission: ['admission', 'admissions'], photo: ['new photo', 'new photos'], receipt_cancel: ['receipt to cancel', 'receipts to cancel'] };
const H = 236;
const UP = 'upRight';
const DOWN = 'downRight';

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
  // The widgets this person hid, kept with their account so the choice follows them to any computer.
  const prefs = useQuery({ queryKey: ['prefs'], queryFn: app.api.prefs.get, staleTime: 5 * 60_000 });
  const hidden = (prefs.data?.['dashboard.widgets'] as string[] | undefined) ?? [];
  const setHide = (id: string, off: boolean) => {
    const n = off ? [...new Set([...hidden, id])] : hidden.filter((x) => x !== id);
    qc.setQueryData(['prefs'], { ...prefs.data, 'dashboard.widgets': n });
    void app.api.prefs.put('dashboard.widgets', n).catch(() => say('Your choice could not be saved. Try again.', 'bad'));
  };
  const { toast, say, clear } = useToast();
  const days = RANGES[range]![1];

  const q = useQuery({ queryKey: ['dashboard', days], queryFn: () => app.api.dashboard(days), refetchInterval: 20_000, placeholderData: keepPreviousData });


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
    const may = (p: string) => app.user.permissions.includes(p as never);
    const has = (m: string) => d.modules.includes(m);
    // Widgets and the New menu come from the module definitions: what the school has and what this person may do.
    const pieces = dashboardPieces({ modules: d.modules, features: chrome.shell?.features ?? [] }, app.user.permissions);
    const widgetsOn = pieces.filter((p) => p.kind === 'widget');
    const tabsOn = TABS.filter((x) => has(x[1]) && may(x[2]));
    const T = tabsOn[tab] ?? tabsOn[0] ?? TABS[0]!;
    // The board has a slot for each of these; a slot whose widget the school or person lacks stays hidden.
    const off = ['rolls', 'fees', 'day'].filter((k) => !widgetsOn.some((w) => w.key === k));
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
        c: 'var(--brand-line)', today: p.isToday ? 'today' : '',
      };
    });
    const grid = [0, 1, 2, 3, 4].map((g) => ({ b: 30 + (g / 4) * H, l: kind === 'fees' ? (g === 0 ? '0' : money((max / 4) * g)) : `${(max / 4) * g}%` }));
    // Requests to decide first, then reminders (a class not marked yet): two kinds of thing, never mixed in one order.
    const needs = [...d.needsYou].sort((a, b) => Number(a.kind === 'attendance') - Number(b.kind === 'attendance')).map((n) => {
      const tone = TONES[n.tone] ?? TONES.violet!;
      const isDone = !!done[n.id];
      return {
        t: n.title, s: n.kind === 'attendance' ? `Reminder · ${n.subtitle}` : n.subtitle, ini: n.initials, bg: tone.bg, fg: tone.fg, a: n.action, open: !isDone, done: isDone ? 'done' : '',
        view: n.kind === 'attendance' ? () => app.go('/attendance') : () => app.go('/approvals'),
        act: () => {
          setDone((s) => ({ ...s, [n.id]: true }));
          decide.mutate({ n, decision: 'approve' });
          say(n.doneText, 'ok', n.id === 'att_reminder' ? undefined : {
            label: 'Undo',
            onPress: () => { setDone((s) => ({ ...s, [n.id]: false })); clear(); if (n.kind !== 'attendance') decide.mutate({ n, decision: 'undo' }); },
          });
        },
      };
    });
    const left = needs.filter((n) => n.open).length;
    const me = tintFor(app.user.name);
    const t = d.timeline;
    return {
      ...chrome, goto: app.go, hidden: [...hidden, ...off], openWidgets: () => setWidgets(true),
      has: { attendance: has('attendance') && may('attendance.read'), fees: has('fees') && may('fees.read'), chat: has('chat') && may('messages.read') }, showChart: tabsOn.length > 0,
      approvalKinds: (() => {
        const by = new Map<string, number>();
        for (const n of d.needsYou) if (n.kind !== 'attendance') by.set(n.kind, (by.get(n.kind) ?? 0) + 1);
        return [...by].map(([k, c]) => `${c} ${(KIND_WORD[k] ?? [k, k])[c === 1 ? 0 : 1]}`).join(', ') || 'Nothing waiting';
      })(),
      widgetsDialog: widgets && (
        <Dialog title="Dashboard widgets" onClose={() => setWidgets(false)} width={460}>
          <p className="help" style={{ margin: '0 0 12px' }}>Choose what this dashboard shows for you. Other people keep their own choice.</p>
          <div className="stack">
            {widgetsOn.map(({ key: id, label: name, blurb }) => (
              <div className="tgl" key={id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderTop: '1px solid var(--line)' }}>
                <div style={{ flex: 1 }}><b style={{ font: '700 14px var(--fb)' }}>{name}</b><div className="help">{blurb}</div></div>
                <button className={`sw ${hidden.includes(id) ? '' : 'on'}`} role="switch" aria-checked={!hidden.includes(id)} aria-label={name} onClick={() => setHide(id, !hidden.includes(id))}></button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}><button className="btn pri" onClick={() => setWidgets(false)}>Done</button></div>
        </Dialog>
      ), me: { name: app.user.name, initials: app.user.initials, role: app.user.roleNames[0] ?? 'Staff', ...me }, schoolName: chrome.shell?.school.shortName ?? d.schoolName,
      greeting: greeting(), subtitle: has('attendance') && may('attendance.read') ? `${d.term.name ? `${d.term.name} · ` : ''}${d.subtitle.marked} of ${d.subtitle.classes} classes have marked attendance` : d.term.name,
      rangeOpen, rangeLabel: RANGES[range]![0], setRangeOpen: (o: boolean) => { setRangeOpen(o); setNewOpen(false); },
      ranges: RANGES.map((r, i) => ({ t: r[0], on: i === range, sel: i === range ? 'true' : 'false', d: 50 + i * 45, pick: () => { setRange(i); setRangeOpen(false); } })),
      newOpen, setNewOpen: (o: boolean) => { setNewOpen(o); setRangeOpen(false); },
      news: pieces.filter((p) => p.kind === 'new').map((n, i) => ({ t: n.label, ic: ((n.icon && n.icon in IC ? n.icon : 'dashboard') as PageIcon), k: n.keys ?? '', d: 50 + i * 45, go: () => { setNewOpen(false); app.go(n.to ?? '/'); } })),
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
      toast,
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
          <div><EmptyCard error title="Dashboard" chip={{ text: 'Couldn’t load', tone: 'c' }} icon="warning" heading="That didn’t load" body={(q.error as Error).message} actions={<button className="btn pri" onClick={() => void q.refetch()}>Try again</button>} /></div>
        </main>
      </PageScope>
    );
  }
  // A school with no students yet: the dashboard has nothing to show, so it says how to start.
  if (d && d.present.total === 0) {
    return (
      <PageScope page="dashboard">
        <main className="mn"><header className="hd"><div><h1>Dashboard</h1></div></header>
          <EmptyState scene="dashboard" onAction={() => app.go('/year/classes')} onLink={() => app.go('/staff')} />
        </main>
      </PageScope>
    );
  }
  if (!v) return <DashboardSkeleton />;
  return <DashboardView v={v} />;
}
