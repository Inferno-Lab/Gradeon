import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyCard } from '@gradeon/web-ui';
import type { InvoiceRowC } from '@gradeon/contracts';
import { Card, Page, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { rupees } from '../../app/format';

const TONE: Record<InvoiceRowC['status'], string> = { draft: 'n', sent: 'b', paid: 'g', overdue: 'r' };
const NEXT: Record<InvoiceRowC['status'], InvoiceRowC['status']> = { draft: 'sent', sent: 'paid', paid: 'paid', overdue: 'paid' };
const NEXT_LABEL: Record<InvoiceRowC['status'], string> = { draft: 'Mark sent', sent: 'Mark paid', paid: '', overdue: 'Mark paid' };

export function BillingPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const inv = useQuery({ queryKey: ['invoices'], queryFn: app.api.billing.invoices, enabled: app.can('billing.read') });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['invoices'] });
  const gen = useMutation({ mutationFn: () => app.api.billing.generate(period), onSuccess: (r) => { refresh(); say(r.created ? `${r.created} ${r.created === 1 ? 'invoice' : 'invoices'} created for ${period}.` : `Every live school already has an invoice for ${period}.`); }, onError: (e) => say((e as Error).message, 'bad') });
  const set = useMutation({ mutationFn: (b: { id: string; status: string }) => app.api.billing.setStatus(b.id, b.status), onSuccess: refresh, onError: (e) => say((e as Error).message, 'bad') });
  if (!app.can('billing.read')) {
    return (
      <Page active="bill" title="Billing" sub="Invoices for every school">
        <div><EmptyCard title="Billing" chip={{ text: 'Not for your role', tone: 'a' }} scene="padlock" heading="Billing is for the finance team" body="Ask a super admin to add the Finance role if you need to see invoices." /></div>
      </Page>
    );
  }
  const rows = inv.data ?? [];
  const total = rows.reduce((n, r) => n + r.amount, 0);
  const paid = rows.filter((r) => r.status === 'paid').reduce((n, r) => n + r.amount, 0);
  const canWrite = app.can('billing.write');
  return (
    <Page active="bill" title="Billing" sub="One invoice per live school each month: students times the plan’s yearly price, divided by twelve" toast={toast} loading={inv.isLoading} error={inv.isError ? { message: (inv.error as Error).message, retry: () => void inv.refetch() } : null}
      actions={canWrite ? (
        <span className="tgrow">
          <label className="inp" style={{ width: 150, height: 44 }}><input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Month" /></label>
          <button className="btn pri" onClick={() => gen.mutate()} disabled={gen.isPending || !period}>Create invoices</button>
        </span>
      ) : undefined}>
      <section className="grid">
        <div className="tile t-v s4 rise"><span className="lbl" style={{ color: 'rgba(255,255,255,.7)' }}>Invoiced</span><div className="fd" style={{ fontSize: 34, letterSpacing: '-.04em', marginTop: 8 }}>{rupees(total)}</div><div style={{ opacity: .75, font: '600 13px var(--fb)' }}>{rows.length} invoices</div></div>
        <div className="tile t-g s4 rise" style={{ '--d': '.05s' } as React.CSSProperties}><span className="lbl" style={{ color: 'rgba(255,255,255,.75)' }}>Paid</span><div className="fd" style={{ fontSize: 34, letterSpacing: '-.04em', marginTop: 8 }}>{rupees(paid)}</div><div style={{ opacity: .8, font: '600 13px var(--fb)' }}>{rows.filter((r) => r.status === 'paid').length} paid</div></div>
        <div className="tile t-a s4 rise" style={{ '--d': '.1s' } as React.CSSProperties}><span className="lbl" style={{ color: 'rgba(20,17,31,.6)' }}>Still to collect</span><div className="fd" style={{ fontSize: 34, letterSpacing: '-.04em', marginTop: 8 }}>{rupees(total - paid)}</div><div style={{ opacity: .75, font: '600 13px var(--fb)' }}>{rows.filter((r) => r.status === 'overdue').length} overdue</div></div>
      </section>
      {rows.length === 0 ? (
        <div><EmptyCard title="Invoices" chip={{ text: '0 invoices', tone: 'v' }} scene="receipt" heading="No invoices yet" body="Create the month’s invoices above once a school is live. Running it twice never double-bills." /></div>
      ) : (
        <Card title="Invoices" chip={<span className="chip">{rows.length}</span>} style={{ padding: 0 }}>
          <div className="scroll-x tbl">
            <div style={{ minWidth: 640 }}>
              <div className="grd th" style={{ '--cols': 'minmax(0,2fr) 110px 130px 120px 130px' } as React.CSSProperties}><span>School</span><span>Month</span><span>Amount</span><span>Status</span><span></span></div>
              {rows.map((r) => (
                <div key={r.id} className="grd rw" style={{ '--cols': 'minmax(0,2fr) 110px 130px 120px 130px' } as React.CSSProperties}>
                  <b style={{ font: '700 14px var(--fb)' }}>{r.schoolName}</b><span>{r.period}</span><span className="num" style={{ font: '700 14px var(--fb)' }} data-tip={r.lines.length ? r.lines.map((l) => `${l.label}: ${rupees(l.amount)}`).join(' · ') : undefined}>{rupees(r.amount)}</span>
                  <span className={`st ${TONE[r.status]}`}><i></i>{r.status}</span>
                  <span>{canWrite && NEXT_LABEL[r.status] && <button className="btn sm" disabled={set.isPending} onClick={() => set.mutate({ id: r.id, status: NEXT[r.status] })}>{NEXT_LABEL[r.status]}</button>}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </Page>
  );
}
