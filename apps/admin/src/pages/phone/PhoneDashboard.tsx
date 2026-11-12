import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lakhs, type ApprovalRow } from '@gradeon/contracts';
import { EmptyCard, PageScope, TONES, useToast } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { useShellChrome } from '../../app/Layout';
import { PhoneView } from './phone.view';

const money = (n: number) => (n >= 100000 ? `₹${lakhs(n)}` : n >= 1000 ? `₹${Math.round(n / 1000)}k` : `₹${n}`);
const hello = () => { const h = ((new Date().getUTCHours() * 60 + new Date().getUTCMinutes() + 330) / 60) % 24; return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

/** The phone's home: the day at a glance and what needs you, from the same numbers as the desktop dashboard. */
export function PhoneDashboard() {
  const app = useApp();
  const chrome = useShellChrome();
  const qc = useQueryClient();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const { toast, say } = useToast();
  const q = useQuery({ queryKey: ['dashboard', 6], queryFn: () => app.api.dashboard(6), refetchInterval: 20_000, placeholderData: keepPreviousData });
  const decide = useMutation({
    mutationFn: async (a: { n: ApprovalRow; decision: 'approve' | 'undo' }) => (a.n.kind === 'attendance' ? app.api.attendance.remind() : app.api.approvals.decide(a.n.id, { decision: a.decision })),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['dashboard'] }),
  });
  const d = q.data;

  if (q.isError && !d) {
    return (
      <PageScope page="status">
        <main className="mn"><header className="hd"><div><h1>Home</h1></div></header>
          <EmptyCard error title="Dashboard" chip={{ text: 'Couldn’t load', tone: 'c' }} icon="warning" heading="That didn’t load" body={(q.error as Error).message} actions={<button className="btn pri" onClick={() => void q.refetch()}>Try again</button>} />
        </main>
      </PageScope>
    );
  }
  if (!d) {
    return <PageScope page="phone"><div className="ph" aria-busy="true"><div className="top"><div className="skc" style={{ height: 44, flex: 1, borderRadius: 12 }} /></div><div className="sc"><div className="skc" style={{ height: 120, borderRadius: 24 }} /><div className="skc" style={{ height: 200, borderRadius: 24 }} /></div></div></PageScope>;
  }

  const items = d.needsYou.map((n) => {
    const tone = TONES[n.tone] ?? TONES.violet!;
    const isDone = !!done[n.id];
    return {
      id: n.id, i: n.initials, t: n.title, s: n.subtitle, bg: tone.bg, fg: tone.fg, cls: isDone ? 'gone' : '', l: isDone ? 'Undo' : n.action,
      go: () => {
        const next = !isDone;
        setDone((s) => ({ ...s, [n.id]: next }));
        decide.mutate({ n, decision: next ? 'approve' : 'undo' });
        if (next) say(n.doneText);
      },
    };
  });
  const left = items.filter((i) => !done[i.id]).length;
  const pts = d.charts.fees.points;
  const max = Math.max(1, ...pts.map((p) => p.amount));
  const peak = pts.reduce((m, p) => (p.amount > m ? p.amount : m), 0);
  const absent = Math.max(0, d.present.total - d.present.value);
  const v = {
    ...chrome, has: { fees: d.modules.includes('fees') && app.user.permissions.includes('fees.read'), attendance: d.modules.includes('attendance') && app.user.permissions.includes('attendance.read') }, logo: chrome.shell?.school.logoText ?? '', dayLine: d.day.isToday ? d.day.label : `${d.day.label} · last school day`,
    greeting: `${hello()}, ${app.user.name.split(' ')[0]}`, pending: left, openApprovals: () => app.go('/approvals'), goto: app.go,
    present: d.present.value, total: d.present.total, feeMonth: d.fees.monthLabel, fees: money(d.fees.collected),
    headline: left ? `${left} ${left === 1 ? 'thing needs' : 'things need'} you` : 'You’re all caught up',
    subline: d.modules.includes('attendance') ? `${absent} not marked present · ${d.term.examsLabel}` : d.term.examsLabel,
    left, items, clear: items.length === 0 || left === 0,
    barsTitle: 'Fees collected each day', barsEmpty: peak === 0, barsAlt: `Fees collected over the last ${pts.length} school days`,
    bars: pts.map((p) => ({ h: Math.max(8, (p.amount / max) * 100), n: p.label.slice(0, 1), c: p.amount === peak && peak > 0 ? 'var(--brand)' : 'color-mix(in srgb,var(--on-deep) 34%,transparent)' })),
    toast,
  };
  return <PhoneView v={v} />;
}
