import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inr, lakhs, type StudentDetail } from '@gradeon/contracts';
import { Dialog, EmptyCard, Segmented, tintFor } from '@gradeon/web-ui';
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
      {s && (
        <section className="grid">
          <div className="tile t-v s4 rise"><span className="lbl">Collected in {s.monthLabel}</span><div className="big" style={{ marginTop: 8 }}>{money(s.collected)}</div><div style={{ font: '600 13px var(--fb)', opacity: .8 }}>of {money(s.due)} due</div></div>
          <div className="tile t-a s4 rise" style={{ '--d': '.05s' } as React.CSSProperties}><span className="lbl">Not yet due</span><div className="big" style={{ marginTop: 8 }}>{money(s.pending)}</div><div style={{ font: '600 13px var(--fb)', opacity: .75 }}>not yet due</div></div>
          <div className="tile t-p s4 rise" style={{ '--d': '.1s' } as React.CSSProperties}><span className="lbl">Overdue</span><div className="big" style={{ marginTop: 8, color: 'var(--bad)' }}>{money(s.overdue)}</div><div style={{ font: '600 13px var(--fb)', color: 'var(--ink3)' }}>{s.overdueFamilies} {s.overdueFamilies === 1 ? 'family' : 'families'}</div></div>
          <div className="card s12 rise" style={{ '--d': '.14s' } as React.CSSProperties}>
            <div className="ch"><h2>Collected by type</h2></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(220px,100%),1fr))', gap: '16px 24px', marginTop: 16, alignContent: 'start' }}>
              {s.byHead.map((h) => (
                <div className="us" key={h.head} data-tip={`${h.label}\n${h.pct}% collected\n${money(h.collected)} of ${money(h.due)}`}>
                  <div className="r">{h.label}<b>{money(h.collected)} of {money(h.due)}</b></div>
                  <div className="bar" style={{ height: 18 }}><i style={{ width: `${h.pct}%` }}></i></div>
                </div>
              ))}
              {s.byHead.length === 0 && <div className="help">Fees by type appear once fees are assigned to students.</div>}
            </div>
          </div>
          <div className="card tbl s12 rise" style={{ '--d': '.18s', padding: 0 } as React.CSSProperties}>
            <div className="ch" style={{ padding: '24px 24px 16px' }}>
              <h2>Overdue families</h2>
              <span className="chip c">{overdue.data?.total ?? 0}</span>
              {rows.length > 0 && app.user.permissions.includes('fees.read') && (confirmRemind
                ? <span className="tgrow"><span className="help">Remind all {overdue.data?.total ?? 0} overdue families?</span><button className="btn sm pri" disabled={remind.isPending} onClick={() => remind.mutate()}>Yes, remind them</button><button className="btn sm" onClick={() => setConfirmRemind(false)}>Not now</button></span>
                : <button className="btn sm" onClick={() => setConfirmRemind(true)}>Remind every overdue family</button>)}
            </div>
            {rows.length === 0 && !overdue.isLoading && (
              <div style={{ padding: '0 24px 24px' }}><EmptyCard title="Overdue" chip={{ text: 'None', tone: 'g' }} scene="receipt" heading="Nobody is overdue" body="Families with an unpaid fee past its due date are listed here, largest first." /></div>
            )}
            <div className="scroll-x" data-fill="">
              <div style={{ minWidth: 520 }}>
                {rows.map((r) => {
                  const t = tintFor(r.name);
                  return (
                    <div className="grd rw" key={r.id} role="button" tabIndex={0} style={{ '--cols': 'minmax(0,1.6fr) 70px 110px 110px', cursor: 'pointer' } as React.CSSProperties}
                      onClick={() => app.go(`/students?open=${r.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') app.go(`/students?open=${r.id}`); }} aria-label={`Open ${r.name}`}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <span className="av" style={{ width: 34, height: 34, fontSize: 11, background: t.bg, color: t.fg, boxShadow: 'none', flex: 'none' }}>{r.initials}</span>
                        <span style={{ minWidth: 0 }}><b data-tip={r.name} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', font: '700 14px/1.25 var(--fb)' }}>{r.name}</b><small style={{ color: 'var(--ink3)', font: '600 12px var(--fb)' }}>{r.guardianName}</small></span>
                      </span>
                      <span className="chip">{r.className}</span>
                      <b className="num" style={{ font: '700 14px var(--fb)', color: 'var(--bad)' }}>₹{inr(r.amountDue)}</b>
                      <span>{canPay && <button className="btn sm" disabled={open.isPending} onClick={(e) => { e.stopPropagation(); open.mutate(r.id); }}>Collect</button>}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {(overdue.data?.total ?? 0) > 25 && (
              <div className="tfoot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px 20px' }}>
                <span className="help">{(page - 1) * 25 + 1}–{(page - 1) * 25 + rows.length} of {overdue.data!.total}</span>
                <span className="tgrow"><button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button className="btn sm" disabled={page * 25 >= overdue.data!.total} onClick={() => setPage(page + 1)}>Next</button></span>
              </div>
            )}
          </div>
        </section>
      )}
    </Page>
  );
}
