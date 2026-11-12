import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inr, lakhs, type StudentDetail } from '@gradeon/contracts';
import { Dialog, EmptyState, Icon, Segmented } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { Page, useToast } from '../../app/Page';
import { StudentPick } from '../../app/kit';
import { usePageTabs } from '../../app/tabs';
import { CollectFeeDialog } from './CollectFee';
import { FeeStructure } from './FeeStructure';
import { InvoicesPage } from './InvoicesPage';
import { OnlinePaymentsPage } from './OnlinePaymentsPage';

const money = (n: number) => (n >= 100000 ? `₹${lakhs(n)}` : `₹${inr(Math.round(n))}`);

/** Fees: one page whose tabs the fees module defines (overview, invoices, receipts, online payments, the fee structure). */
export function FeesPage() {
  const { tab, tabs } = usePageTabs('/fees');
  if (tab === 'invoices' || tab === 'receipts') return <InvoicesPage view={tab} tabs={tabs} />;
  if (tab === 'online') return <OnlinePaymentsPage tabs={tabs} />;
  if (tab === 'structure') return <FeeStructure tabs={tabs} />;
  return <Overview tabs={tabs} />;
}

// Kinds of fee take spectrum colours in order, as the board's payment methods do.
const HEAD_COLOURS = ['blue', 'pink', 'lime', 'orange', 'teal', 'violet'] as const;

function Overview({ tabs }: { tabs: React.ReactNode }) {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [paying, setPaying] = useState<StudentDetail | null>(null);
  // "Collect a fee" (dashboard, or the N F keys) lands here with ?collect=1: pick the student, then record the payment.
  const asked = new URLSearchParams(window.location.search).get('collect');
  const [picking, setPicking] = useState(() => asked === '1');
  const [period, setPeriod] = useState<'month' | 'term' | 'year'>('month');
  const [page, setPage] = useState(1);
  const [confirmRemind, setConfirmRemind] = useState(false);
  const summary = useQuery({ queryKey: ['fee-summary', period], queryFn: () => app.api.fees.summary(period), placeholderData: (p) => p });
  const overdue = useQuery({ queryKey: ['students', 'overdue', page], queryFn: () => app.api.students.list({ feeStatus: 'overdue', sort: 'due', dir: 'desc', page, limit: 25 }), placeholderData: (p) => p });
  const refresh = () => void qc.invalidateQueries({ predicate: (q) => ['fee-summary', 'students', 'dashboard'].includes(String(q.queryKey[0])) });
  const open = useMutation({ mutationFn: (id: string) => app.api.students.detail(id), onSuccess: setPaying, onError: (e) => say((e as Error).message, 'bad') });
  // Every overdue family, not only the page shown; how it travels is the console's rule for the fee reminder.
  const remind = useMutation({
    mutationFn: () => app.api.fees.remindOverdue(),
    onSuccess: (r) => { setConfirmRemind(false); say(r.sent ? `Reminder sent to ${r.sent} ${r.sent === 1 ? 'family' : 'families'}.` : 'No overdue family has a phone number on record.'); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  const s = summary.data;
  const rows = overdue.data?.items ?? [];
  const canPay = app.user.permissions.includes('fees.collect');
  // From a student's record (?collect=<student>): their payment opens straight away.
  useEffect(() => {
    if (asked && asked !== '1' && canPay) { open.mutate(asked); history.replaceState(null, '', window.location.pathname); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const err = [summary, overdue].find((q) => q.isError && !q.data);
  return (
    <Page title="Fees" sub={s ? `${s.monthLabel} · ${s.pct}% of what is due has been collected` : 'Collections and dues'} toast={toast} loading={summary.isLoading}
      error={err ? { message: (err.error as Error).message, retry: () => void err.refetch() } : null}
      actions={<>{tabs}<Segmented label="Period" value={period} onChange={setPeriod} options={[{ value: 'month', label: 'This month' }, { value: 'term', label: 'This term' }, { value: 'year', label: 'This year' }]} />{canPay && <button className="btn pri" onClick={() => setPicking(true)}>Collect a fee</button>}</>}
      overlays={<>
        {paying && <CollectFeeDialog student={paying} onClose={() => setPaying(null)} onDone={(m) => { setPaying(null); refresh(); say(m); }} />}
        {picking && canPay && !paying && (
          <Dialog title="Collect a fee" onClose={() => { setPicking(false); history.replaceState(null, '', window.location.pathname); }} width={480}>
            <StudentPick label="Whose fee" value={null} onChange={(s) => { if (s) { setPicking(false); history.replaceState(null, '', window.location.pathname); open.mutate(s.id); } }} />
          </Dialog>
        )}
      </>}>
      {s && s.due === 0 && s.collected === 0 && !s.byHead.length ? <EmptyState scene="fees" onAction={() => app.go('/fees/structure')} /> : s && (
        // As the Fees board (design/hue/src/Fees.html): the month on the deep colour, what is due and overdue, each day, each kind of fee, who is late.
        <div className="hb" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="g" style={{ gridTemplateColumns: 'minmax(0,1.5fr) repeat(2,minmax(0,1fr))' }}>
            <section className="card deep">
              <span className="lbl">Collected in {s.monthLabel}</span>
              <div className="fig" style={{ fontSize: 64 }}>{money(s.collected)}</div>
              <div className="bar" style={{ height: 10, background: 'var(--deep3)' }}><i style={{ width: `${s.pct}%`, background: 'var(--bright)' }} /></div>
              <span className="lbl" style={{ fontWeight: 400 }}>{s.pct}% of {money(s.due)} · {money(Math.max(0, s.due - s.collected))} still to come</span>
            </section>
            <section className="card tint sp-blue">
              <span className="lbl">Not yet due</span>
              <b className="d" style={{ fontSize: 40, lineHeight: '44px' }}>{money(s.pending)}</b>
              <small className="t2" style={{ fontSize: 14 }}>falls due later {period === 'month' ? 'this month' : period === 'term' ? 'this term' : 'this year'}</small>
              {s.collectedDelta !== 0 && <span className={`tag ${s.collectedDelta > 0 ? 'ok' : 'bad'}`} style={{ alignSelf: 'flex-start', marginTop: 'auto' }}><Icon name={s.collectedDelta > 0 ? 'upRight' : 'downRight'} size={14} className="i" />{Math.abs(s.collectedDelta)}% on last {period}</span>}
            </section>
            <section className="card tint sp-rose">
              <span className="lbl">Overdue</span>
              <b className="d" style={{ fontSize: 40, lineHeight: '44px', color: 'var(--bad-i)' }}>{money(s.overdue)}</b>
              <small className="t2" style={{ fontSize: 14 }}>{s.overdueFamilies} {s.overdueFamilies === 1 ? 'family' : 'families'}</small>
              {s.overdueFamilies > 0 && app.user.permissions.includes('fees.read') && (confirmRemind
                ? <span className="fx" style={{ gap: 8, marginTop: 'auto', flexWrap: 'wrap' }}><button className="btn pri sm" disabled={remind.isPending} onClick={() => remind.mutate()}>Remind all {s.overdueFamilies}</button><button className="btn sm" onClick={() => setConfirmRemind(false)}>Not now</button></span>
                : <button className="btn ton sm" style={{ alignSelf: 'flex-start', marginTop: 'auto' }} onClick={() => setConfirmRemind(true)}>Send reminders</button>)}
            </section>
          </div>
          <div className="g" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)' }}>
            <section className="card">
              <div className="ch"><h2>Collected each day</h2><small>{s.dailyTarget ? `target ${money(s.dailyTarget)} a day` : 'this period'}</small></div>
              {s.daily.some((x) => x.amount > 0) ? (
                <div className="fx" role="img" aria-label="Fees collected each day" style={{ alignItems: 'flex-end', gap: 8, height: 180 }}>
                  {s.daily.slice(-14).map((x) => {
                    const top = Math.max(...s.daily.map((y) => y.amount), 1);
                    return (
                      <div key={x.date} className="vc" style={{ flex: 1, alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }} data-tip={`${x.full}: ${money(x.amount)}`}>
                        {x.amount > 0 && <b className="num" style={{ fontSize: 12 }}>{money(x.amount)}</b>}
                        <i style={{ display: 'block', width: '100%', height: `${Math.max(4, (x.amount / top) * 120)}px`, borderRadius: 7, background: x.isToday ? 'var(--bar-up)' : 'var(--bar-soft)' }} />
                        <small className="t3" style={{ fontSize: 12 }}>{x.label}</small>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="t2" style={{ fontSize: 14 }}>Payments appear here, day by day, as fees are collected.</p>}
            </section>
            <section className="card">
              <div className="ch"><h2>By kind of fee</h2><small>{s.monthLabel}</small></div>
              {s.byHead.length ? (
                <>
                  <div className="bar" style={{ height: 14, borderRadius: 7, gap: 3 }} aria-hidden="true">
                    {s.byHead.map((h, i) => <i key={h.head} className={`sp-${HEAD_COLOURS[i % HEAD_COLOURS.length]}`} style={{ flex: Math.max(h.collected, 1), background: 'var(--c)' }} />)}
                  </div>
                  <div className="vc" style={{ gap: 2 }}>
                    {s.byHead.map((h, i) => (
                      <div key={h.head} className="kv"><span className="fx" style={{ gap: 8 }}><i className={`dot sp-${HEAD_COLOURS[i % HEAD_COLOURS.length]}`} />{h.label}</span><b>{h.pct}%</b><span className="t2 num" style={{ minWidth: 92, textAlign: 'right' }}>{money(h.collected)}</span></div>
                    ))}
                  </div>
                </>
              ) : <p className="t2" style={{ fontSize: 14 }}>Fees by kind appear once fees are assigned to students.</p>}
            </section>
          </div>
          <section className="card flush">
            <div className="ch" style={{ padding: '20px 20px 8px' }}><h2>Overdue</h2><small>{overdue.data?.total ?? 0} {overdue.data?.total === 1 ? 'family' : 'families'} · largest first</small></div>
            {rows.length === 0 && !overdue.isLoading ? <p className="t2" style={{ fontSize: 14, padding: '0 20px 20px' }}>Nobody is overdue. Families with an unpaid fee past its due date appear here, largest first.</p> : (
              <div className="scroll-x" data-fill="">
                <div style={{ minWidth: 620 }}>
                  <div className="trow h" style={{ '--cols': 'minmax(0,1.6fr) 70px minmax(0,1.2fr) 110px 110px' } as React.CSSProperties}><span>Student</span><span>Class</span><span>Parent</span><span className="r">Amount</span><span /></div>
                  {rows.map((r) => (
                    <div key={r.id} className="trow" role="button" tabIndex={0} style={{ '--cols': 'minmax(0,1.6fr) 70px minmax(0,1.2fr) 110px 110px', cursor: 'pointer' } as React.CSSProperties}
                      onClick={() => app.go(`/students?open=${r.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') app.go(`/students?open=${r.id}`); }} aria-label={`Open ${r.name}`}>
                      <span className="fx" style={{ gap: 12, minWidth: 0 }}><span className="av sm">{r.initials}</span><b className="cut">{r.name}</b></span>
                      <span>{r.className}</span>
                      <span className="t2 cut">{r.guardianName}</span>
                      <b className="num r">₹{inr(r.amountDue)}</b>
                      <span className="r">{canPay && <button className="btn ton sm" disabled={open.isPending} onClick={(e) => { e.stopPropagation(); open.mutate(r.id); }}>Collect</button>}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(overdue.data?.total ?? 0) > 25 && (
              <div className="fx" style={{ justifyContent: 'space-between', padding: '12px 20px 20px', gap: 10 }}>
                <span className="t2" style={{ fontSize: 13 }}>{(page - 1) * 25 + 1}–{(page - 1) * 25 + rows.length} of {overdue.data!.total}</span>
                <span className="fx" style={{ gap: 8 }}><button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button className="btn sm" disabled={page * 25 >= overdue.data!.total} onClick={() => setPage(page + 1)}>Next</button></span>
              </div>
            )}
          </section>
        </div>
      )}
    </Page>
  );
}
