import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OnlinePaymentRow, RefundRow } from '@gradeon/contracts';
import { Dialog, EmptyCard, Field, NumberField, Segmented, useShake } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { Card, Page, useToast } from '../../app/Page';
import { dateLabel, openPdf, problem, stamp } from '../../app/kit';

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const REFUND: Record<RefundRow['status'], { text: string; tone: string }> = {
  requested: { text: 'Needs a second person', tone: 'a' }, sent: { text: 'Sent to the bank', tone: 'v' }, done: { text: 'Refunded', tone: 'g' }, failed: { text: 'Failed', tone: 'c' }, rejected: { text: 'Declined', tone: '' },
};

export function OnlinePaymentsPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [tab, setTab] = useState<'payments' | 'refunds' | 'recon'>('payments');
  const [refund, setRefund] = useState<OnlinePaymentRow | null>(null);
  const perms = app.user.permissions;
  const canRefund = perms.includes('fees.refund');
  const payments = useQuery({ queryKey: ['online', 'payments'], queryFn: app.api.online.payments });
  const refunds = useQuery({ queryKey: ['online', 'refunds'], queryFn: app.api.online.refunds, retry: false });
  const recon = useQuery({ queryKey: ['online', 'recon'], queryFn: app.api.online.reconciliation });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['online'] });
  const decide = useMutation({ mutationFn: ({ id, yes }: { id: string; yes: boolean }) => app.api.online.decide(id, yes), onSuccess: (r) => { refresh(); say(r.status === 'rejected' ? 'Refund declined.' : r.status === 'failed' ? `The bank refused: ${r.error}` : `Refund of ${rupees(r.amount)} sent.`); }, onError: (e) => say((e as Error).message, 'bad') });
  const resolve = useMutation({ mutationFn: app.api.online.resolve, onSuccess: () => { refresh(); say('Marked as sorted out.'); }, onError: (e) => say((e as Error).message, 'bad') });
  const list = payments.data ?? [];
  const open = (recon.data ?? []).filter((r) => !r.resolved);
  const waiting = (refunds.data ?? []).filter((r) => r.status === 'requested');
  return (
    <Page title="Online payments" sub="What families paid in the app, refunds, and the daily check against what the provider settled" toast={toast}
      loading={payments.isLoading && !payments.data} error={payments.isError && !payments.data ? { message: (payments.error as Error).message, retry: () => void payments.refetch() } : null}
      overlays={refund && <RefundDialog p={refund} onClose={() => setRefund(null)} onDone={(m) => { setRefund(null); refresh(); say(m); }} />}>
      <Segmented label="Online payments" value={tab} onChange={setTab} options={[
        { value: 'payments', label: 'Payments', count: list.length }, { value: 'refunds', label: 'Refunds', count: waiting.length || undefined, countTone: waiting.length ? 'a' : undefined },
        { value: 'recon', label: 'Reconciliation', count: open.length || undefined, countTone: open.length ? 'c' : undefined },
      ]} />
      {tab === 'payments' && (!list.length ? (
        <div><EmptyCard title="Online payments" chip={{ text: '0 payments', tone: 'v' }} scene="receipt" heading="Nobody has paid online yet" body="When a family pays a fee in the app, the payment and its receipt appear here, ready to print or refund." /></div>
      ) : (
        <Card style={{ padding: 0 }}>
          <div className="tbl scroll-x"><div style={{ minWidth: 720 }} className="lscroll">
            <div className="grd th" style={{ '--cols': '140px minmax(0,1.4fr) minmax(0,1.4fr) 110px 100px 190px' } as React.CSSProperties}><span>Receipt</span><span>Student</span><span>Fee</span><span>Amount</span><span>Paid</span><span></span></div>
            {list.map((p) => (
              <div key={p.id} className="grd rw" style={{ '--cols': '140px minmax(0,1.4fr) minmax(0,1.4fr) 110px 100px 190px', height: 'auto', minHeight: 52, padding: '8px 20px' } as React.CSSProperties}>
                <b className="num" style={{ font: '700 13px var(--fb)' }} data-tip={p.providerPaymentId}>{p.receiptNo}</b>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.student}</span>
                <span className="help" style={{ margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-tip={p.title}>{p.title}</span>
                <span className="num">{rupees(p.amount)}{p.refunded ? <small className="help" style={{ display: 'block' }}>−{rupees(p.refunded)}</small> : null}</span>
                <span className="num">{dateLabel(p.paidOn)}</span>
                <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button className="btn sm" onClick={() => void openPdf(app.api.online.receipt(p.id)).catch((e: Error) => say(e.message, 'bad'))}>Receipt</button>
                  {canRefund && p.amount - p.refunded > 0 && <button className="btn sm" onClick={() => setRefund(p)}>Refund</button>}
                </span>
              </div>
            ))}
          </div></div>
        </Card>
      ))}
      {tab === 'refunds' && (
        <Card style={{ padding: 0 }}>
          {refunds.isError ? <div className="help" style={{ padding: 20 }}>{(refunds.error as Error).message}</div>
            : !(refunds.data ?? []).length ? <div className="help" style={{ padding: 20 }}>No refunds yet. Refund a payment from the Payments list; above the school’s limit a second person approves it here.</div>
            : refunds.data!.map((r) => (
              <div key={r.id} className="rw" style={{ display: 'flex', gap: 10, alignItems: 'center', height: 'auto', minHeight: 56, padding: '10px 20px', flexWrap: 'wrap' }}>
                <span className={`chip ${REFUND[r.status].tone}`} data-tip={r.error ?? undefined}>{REFUND[r.status].text}</span>
                <b className="num" style={{ font: '700 13px var(--fb)' }}>{rupees(r.amount)}</b>
                <span style={{ flex: 1, minWidth: 180 }}>{r.student} · {r.receiptNo}<small className="help" style={{ display: 'block' }}>{r.reason} · asked by {r.requestedBy ?? 'someone'} {stamp(r.createdAt)}{r.approvedBy ? ` · ${r.status === 'rejected' ? 'declined' : 'approved'} by ${r.approvedBy}` : ''}</small></span>
                {canRefund && r.status === 'requested' && <span style={{ display: 'flex', gap: 6 }}>
                  <button className="btn sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, yes: false })}>Decline</button>
                  <button className="btn sm pri" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, yes: true })}>Approve</button>
                </span>}
              </div>
            ))}
        </Card>
      )}
      {tab === 'recon' && (
        <Card style={{ padding: 0 }}>
          <div className="help" style={{ padding: '16px 20px 8px' }}>Each morning yesterday’s payments at the provider are matched to receipts. Anything that does not match is listed here once.</div>
          {!(recon.data ?? []).length ? <div className="help" style={{ padding: '0 20px 20px' }}>Everything has matched so far.</div>
            : recon.data!.map((r) => (
              <div key={r.id} className="rw" style={{ display: 'flex', gap: 10, alignItems: 'center', height: 'auto', minHeight: 56, padding: '10px 20px', flexWrap: 'wrap', opacity: r.resolved ? 0.6 : 1 }}>
                <span className={`chip ${r.resolved ? 'g' : 'c'}`}>{r.resolved ? 'Sorted out' : dateLabel(r.day)}</span>
                <span style={{ flex: 1, minWidth: 200 }}>{r.problem}<small className="help" style={{ display: 'block' }}>{r.providerPaymentId} · provider {r.providerAmount == null ? '–' : rupees(r.providerAmount)} · receipt {r.receiptAmount == null ? '–' : rupees(r.receiptAmount)}</small></span>
                {!r.resolved && perms.includes('fees.collect') && <button className="btn sm" disabled={resolve.isPending} onClick={() => resolve.mutate(r.id)}>Sorted out</button>}
              </div>
            ))}
        </Card>
      )}
    </Page>
  );
}

function RefundDialog({ p, onClose, onDone }: { p: OnlinePaymentRow; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const shake = useShake();
  const left = p.amount - p.refunded;
  const [amount, setAmount] = useState(String(left));
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const send = useMutation({
    mutationFn: () => app.api.online.refund({ paymentId: p.id, amount: Number(amount), reason: reason.trim() }),
    onSuccess: (r) => onDone(r.status === 'requested' ? `${rupees(r.amount)} is above the school’s limit: a second person approves it under Refunds.` : r.status === 'failed' ? `The bank refused: ${r.error}` : `Refund of ${rupees(r.amount)} sent. The family is told.`),
    onError: (e) => { setErr(problem(e)); shake.hit(); },
  });
  return (
    <Dialog title={`Refund ${p.receiptNo}`} tag={{ text: p.student, tone: 'v' }} onClose={onClose} width={480} shake={shake.cls}>
      <div className="stack">
        <NumberField label={`Amount (up to ${rupees(left)})`} value={amount} onChange={(x) => { setAmount(x); setErr({}); }} min={1} max={left} error={err.amount} />
        <Field label="Why" value={reason} onChange={(x) => { setReason(x); setErr({}); }} error={err.reason} placeholder="Paid twice" />
        <div className="help">The money goes back to the account the family paid from, and the receipt shows the refund.</div>
        {err._ && <div className="emsg" role="alert">{err._}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={send.isPending || !(Number(amount) > 0) || reason.trim().length < 3} onClick={() => send.mutate()}>{send.isPending ? 'Sending…' : 'Refund'}</button>
      </div>
    </Dialog>
  );
}
