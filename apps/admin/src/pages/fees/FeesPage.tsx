import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inr, lakhs, type StudentDetail } from '@gradeon/contracts';
import { EmptyCard, tintFor } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { Page, useToast } from '../../app/Page';
import { CollectFeeDialog } from '../students/StudentDialogs';

const money = (n: number) => (n >= 100000 ? `₹${lakhs(n)}` : `₹${inr(Math.round(n))}`);
const HEAD: Record<string, string> = { tuition: 'var(--v)', transport: 'var(--b)', activities: 'var(--c)', lab: 'var(--a)' };

export function FeesPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [paying, setPaying] = useState<StudentDetail | null>(null);
  const summary = useQuery({ queryKey: ['fee-summary'], queryFn: app.api.fees.summary });
  const overdue = useQuery({ queryKey: ['students', 'overdue'], queryFn: () => app.api.students.list({ feeStatus: 'overdue', sort: 'due', dir: 'desc', limit: 30 }) });
  const refresh = () => void qc.invalidateQueries({ predicate: (q) => ['fee-summary', 'students', 'dashboard'].includes(String(q.queryKey[0])) });
  const open = useMutation({ mutationFn: (id: string) => app.api.students.detail(id), onSuccess: setPaying, onError: (e) => say((e as Error).message, 'bad') });
  const remind = useMutation({
    mutationFn: (ids: string[]) => app.api.fees.remind(ids),
    onSuccess: (r) => say(r.sent ? `Reminder sent to ${r.sent} ${r.sent === 1 ? 'family' : 'families'}.` : 'No family on this list has a phone number to text.'),
    onError: (e) => say((e as Error).message, 'bad'),
  });
  const s = summary.data;
  const rows = overdue.data?.items ?? [];
  const canPay = app.user.permissions.includes('fees.collect');
  const err = [summary, overdue].find((q) => q.isError && !q.data);
  return (
    <Page active="fee" title="Fees" sub={s ? `${s.monthLabel} · ${s.pct}% of what is due has been collected` : 'Collections and dues'} toast={toast} loading={summary.isLoading}
      error={err ? { message: (err.error as Error).message, retry: () => void err.refetch() } : null}
      overlays={paying && <CollectFeeDialog student={paying} onClose={() => setPaying(null)} onDone={(m) => { setPaying(null); refresh(); say(m); }} />}>
      {s && (
        <section className="grid">
          <div className="tile t-v s4 rise"><span className="lbl" style={{ color: 'rgba(255,255,255,.7)' }}>Collected in {s.monthLabel}</span><div className="big" style={{ marginTop: 8 }}>{money(s.collected)}</div><div style={{ font: '600 13px var(--fb)', opacity: .8 }}>of {money(s.due)} due</div></div>
          <div className="tile t-a s4 rise" style={{ '--d': '.05s' } as React.CSSProperties}><span className="lbl" style={{ color: 'rgba(20,17,31,.6)' }}>Still to come in</span><div className="big" style={{ marginTop: 8 }}>{money(s.pending)}</div><div style={{ font: '600 13px var(--fb)', opacity: .75 }}>not yet due or in part</div></div>
          <div className="tile t-p s4 rise" style={{ '--d': '.1s' } as React.CSSProperties}><span className="lbl">Overdue</span><div className="big" style={{ marginTop: 8, color: 'var(--r)' }}>{money(s.overdue)}</div><div style={{ font: '600 13px var(--fb)', color: 'var(--ink3)' }}>{s.overdueFamilies} {s.overdueFamilies === 1 ? 'family' : 'families'}</div></div>
          <div className="card s12 rise" style={{ '--d': '.14s' } as React.CSSProperties}>
            <div className="ch"><h2>Collected by type</h2></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(220px,100%),1fr))', gap: '18px 28px', marginTop: 16, alignContent: 'start' }}>
              {s.byHead.map((h) => (
                <div className="us" key={h.head} data-tip={`${h.label}\n${h.pct}% collected\n${money(h.collected)} of ${money(h.due)}`}>
                  <div className="r">{h.label}<b>{money(h.collected)} of {money(h.due)}</b></div>
                  <div className="bar" style={{ height: 18 }}><i style={{ width: `${h.pct}%`, background: HEAD[h.head] ?? 'var(--v)' }}></i></div>
                </div>
              ))}
              {s.byHead.length === 0 && <div className="help">Fees by type appear once fees are assigned to students.</div>}
            </div>
          </div>
          <div className="card tbl s12 rise" style={{ '--d': '.18s', padding: 0 } as React.CSSProperties}>
            <div className="ch" style={{ padding: '22px 22px 14px' }}>
              <h2>Overdue families</h2>
              <span className="chip r">{overdue.data?.total ?? 0}</span>
              {rows.length > 0 && <button className="btn sm" disabled={remind.isPending} onClick={() => remind.mutate(rows.map((r) => r.id))}>Text everyone on this list</button>}
            </div>
            {rows.length === 0 && !overdue.isLoading && (
              <div style={{ padding: '0 22px 22px' }}><EmptyCard title="Overdue" chip={{ text: 'None', tone: 'g' }} scene="receipt" heading="Nobody is overdue" body="Families with an unpaid fee past its due date are listed here, largest first." /></div>
            )}
            <div className="scroll-x" data-fill="">
              <div style={{ minWidth: 520 }}>
                {rows.map((r) => {
                  const t = tintFor(r.name);
                  return (
                    <div className="grd rw" key={r.id} style={{ '--cols': 'minmax(0,1.6fr) 70px 110px 110px' } as React.CSSProperties}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <span className="av" style={{ width: 34, height: 34, fontSize: 11, background: t.bg, color: t.fg, boxShadow: 'none', flex: 'none' }}>{r.initials}</span>
                        <span style={{ minWidth: 0 }}><b title={r.name} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', font: '700 14px/1.25 var(--fb)' }}>{r.name}</b><small style={{ color: 'var(--ink3)', font: '600 12px var(--fb)' }}>{r.guardianName}</small></span>
                      </span>
                      <span className="chip">{r.className}</span>
                      <b className="num" style={{ font: '700 14px var(--fb)', color: 'var(--r)' }}>₹{inr(r.amountDue)}</b>
                      <span>{canPay && <button className="btn sm" disabled={open.isPending} onClick={() => open.mutate(r.id)}>Collect</button>}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}
    </Page>
  );
}
