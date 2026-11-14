import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OnlinePaymentRow, ReconRow, RefundRow } from '@gradeon/contracts';
import { Dialog, Field, NumberField, Segmented, useShake, EmptyState, EmptyNote } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { Card, Page, useToast } from '../../app/Page';
import { AreaField, dateLabel, openPdf, problem, stamp, useOpenParam } from '../../app/kit';

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const REFUND: Record<RefundRow['status'], { text: string; tone: string }> = {
  requested: { text: 'Needs a second person', tone: 'a' }, sent: { text: 'Sent to the bank', tone: 'v' }, done: { text: 'Refunded', tone: 'g' }, failed: { text: 'Failed', tone: 'c' }, rejected: { text: 'Declined', tone: '' },
};

export function OnlinePaymentsPage({ tabs }: { tabs?: React.ReactNode }) {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  // Which list is shown is in the address (?show=refunds), so a link from Approvals or a reload lands on it.
  const [show, setShow] = useOpenParam('show');
  const tab = (show === 'refunds' || show === 'recon' ? show : 'payments') as 'payments' | 'refunds' | 'recon';
  const setTab = (v: 'payments' | 'refunds' | 'recon') => setShow(v === 'payments' ? null : v);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [deciding, setDeciding] = useState<{ r: RefundRow; yes: boolean } | null>(null);
  const [sorting, setSorting] = useState<ReconRow | null>(null);
  const [refund, setRefund] = useState<OnlinePaymentRow | null>(null);
  const perms = app.user.permissions;
  const canRefund = perms.includes('fees.refund');
  const payments = useQuery({ queryKey: ['online', 'payments'], queryFn: app.api.online.payments });
  const refunds = useQuery({ queryKey: ['online', 'refunds'], queryFn: app.api.online.refunds, retry: false });
  const recon = useQuery({ queryKey: ['online', 'recon'], queryFn: app.api.online.reconciliation });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['online'] });
  const decide = useMutation({ mutationFn: ({ id, yes, note }: { id: string; yes: boolean; note: string }) => app.api.online.decide(id, yes, note), onSuccess: (r) => { setDeciding(null); refresh(); say(r.status === 'rejected' ? 'Refund declined.' : r.status === 'failed' ? `The bank refused: ${r.error}` : `Refund of ${rupees(r.amount)} sent.`); }, onError: (e) => say((e as Error).message, 'bad') });
  const resolve = useMutation({ mutationFn: ({ id, note }: { id: string; note: string }) => app.api.online.resolve(id, note), onSuccess: () => { setSorting(null); refresh(); say('Marked as sorted out.'); }, onError: (e) => say((e as Error).message, 'bad') });
  const all = payments.data ?? [];
  const term = q.trim().toLowerCase();
  const found = all.filter((p) => !term || `${p.receiptNo} ${p.student} ${p.title} ${p.providerPaymentId}`.toLowerCase().includes(term));
  const list = found.slice((page - 1) * 25, page * 25);
  const open = (recon.data ?? []).filter((r) => !r.resolved);
  const waiting = (refunds.data ?? []).filter((r) => r.status === 'requested');
  return (
    <Page title="Fees" sub="What families paid in the app, refunds, and the daily check against what the provider settled" toast={toast} tabs={tabs}
      loading={payments.isLoading && !payments.data} error={payments.isError && !payments.data ? { message: (payments.error as Error).message, retry: () => void payments.refetch() } : null}
      overlays={<>
        {refund && <RefundDialog p={refund} onClose={() => setRefund(null)} onDone={(m) => { setRefund(null); refresh(); say(m); }} />}
        {deciding && <NoteDialog title={deciding.yes ? `Send ${rupees(deciding.r.amount)} back to ${deciding.r.student}?` : `Decline the refund for ${deciding.r.student}`}
          label={deciding.yes ? 'A note (optional)' : 'Why (the person who asked reads it)'} need={!deciding.yes} action={deciding.yes ? 'Yes, send it' : 'Decline'} busy={decide.isPending}
          help={deciding.yes ? 'The money goes back to the account the family paid from. This cannot be undone.' : undefined}
          onClose={() => setDeciding(null)} onSend={(note) => decide.mutate({ id: deciding.r.id, yes: deciding.yes, note })} />}
        {sorting && <NoteDialog title="Sorted out" label="What was done" need action="Mark sorted out" busy={resolve.isPending} onClose={() => setSorting(null)} onSend={(note) => resolve.mutate({ id: sorting.id, note })} />}
      </>}>
      <Segmented label="Online payments" value={tab} onChange={setTab} options={[
        { value: 'payments', label: 'Payments', count: all.length }, { value: 'refunds', label: 'Refunds', count: waiting.length || undefined, countTone: waiting.length ? 'a' : undefined },
        { value: 'recon', label: 'Reconciliation', count: open.length || undefined, countTone: open.length ? 'c' : undefined },
      ]} />
      {tab === 'payments' && all.length > 0 && <div style={{ maxWidth: 360, margin: '12px 0' }}><Field label="Search payments" value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Receipt, student or fee" /></div>}
      {tab === 'payments' && (!all.length ? (
        <div><EmptyState scene="payments" onAction={() => app.go('/fees/invoices')} /></div>
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
          {found.length > 25 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 20px 16px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <span className="help">{(page - 1) * 25 + 1}–{(page - 1) * 25 + list.length} of {found.length}</span>
              <span style={{ display: 'flex', gap: 8 }}><button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button className="btn sm" disabled={page * 25 >= found.length} onClick={() => setPage(page + 1)}>Next</button></span>
            </div>
          )}
          {term && !found.length && <EmptyNote icon="search" title={`No payment matches “${q}”`} body="Search by the family’s name, the student or the payment reference." />}
        </Card>
      ))}
      {tab === 'refunds' && (
        <Card style={{ padding: 0 }}>
          {refunds.isError ? <div className="help" style={{ padding: 20 }}>{(refunds.error as Error).message}</div>
            : !(refunds.data ?? []).length ? <EmptyNote icon="undo" title="No refunds yet" body="Refund a payment from the Payments list. Above the school’s limit a second person approves it here." />
            : refunds.data!.map((r) => (
              <div key={r.id} className="rw" style={{ display: 'flex', gap: 10, alignItems: 'center', height: 'auto', minHeight: 56, padding: '10px 20px', flexWrap: 'wrap' }}>
                <span className={`chip ${REFUND[r.status].tone}`} data-tip={r.error ?? undefined}>{REFUND[r.status].text}</span>
                <b className="num" style={{ font: '700 13px var(--fb)' }}>{rupees(r.amount)}</b>
                <span style={{ flex: 1, minWidth: 180 }}>{r.student} · {r.receiptNo}<small className="help" style={{ display: 'block' }}>{r.reason} · asked by {r.requestedBy ?? 'someone'} {stamp(r.createdAt)}{r.approvedBy ? ` · ${r.status === 'rejected' ? 'declined' : 'approved'} by ${r.approvedBy}` : ''}{r.decisionNote ? ` · “${r.decisionNote}”` : ''}</small></span>
                {canRefund && r.status === 'requested' && <span style={{ display: 'flex', gap: 6 }}>
                  <button className="btn sm" disabled={decide.isPending} onClick={() => setDeciding({ r, yes: false })}>Decline</button>
                  <button className="btn sm pri" disabled={decide.isPending} onClick={() => setDeciding({ r, yes: true })}>Approve</button>
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
                <span style={{ flex: 1, minWidth: 200 }}>{r.problem}<small className="help" style={{ display: 'block' }}>{r.providerPaymentId} · provider {r.providerAmount == null ? '–' : rupees(r.providerAmount)} · receipt {r.receiptAmount == null ? '–' : rupees(r.receiptAmount)}{r.note ? ` · ${r.note}` : ''}</small></span>
                {!r.resolved && perms.includes('fees.collect') && <button className="btn sm" disabled={resolve.isPending} onClick={() => setSorting(r)}>Sorted out</button>}
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

/** A decision that needs a few words: why a refund is declined, what was done about a finding, a note on sending money. */
function NoteDialog({ title, label, need, action, busy, help, onClose, onSend }: { title: string; label: string; need?: boolean; action: string; busy: boolean; help?: string; onClose: () => void; onSend: (note: string) => void }) {
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const shake = useShake();
  const go = () => { if (need && note.trim().length < 3) { setErr('Write a few words.'); shake.hit(); } else onSend(note.trim()); };
  return (
    <Dialog title={title} onClose={onClose} width={480} shake={shake.cls}>
      <div className="stack">
        {help && <p className="help" style={{ margin: 0 }}>{help}</p>}
        <AreaField label={label} value={note} onChange={(v) => { setNote(v); setErr(''); }} error={err} rows={3} maxLength={300} />
        <div className="tgrow" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn pri" disabled={busy} onClick={go}>{busy ? 'Working…' : action}</button>
        </div>
      </div>
    </Dialog>
  );
}
