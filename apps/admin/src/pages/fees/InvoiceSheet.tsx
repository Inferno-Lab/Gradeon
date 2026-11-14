import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inr, type InvoiceDetail } from '@gradeon/contracts';
import { Dialog, ErrorLine, NumberField, Segmented, useShake, EmptyNote } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { AreaField, dateLabel, problem } from '../../app/kit';

/** Opens a receipt as the server's PDF (the same one families get), in a new tab to print or save. */
export function useReceiptPdf(say: (m: string, tone?: 'bad') => void) {
  const { api } = useApp();
  return (paymentId: string) => {
    const w = window.open('', '_blank');
    void api.online.receipt(paymentId).then((b) => { if (w) w.location.href = URL.createObjectURL(b); }).catch((e: Error) => { w?.close(); say(e.message, 'bad'); });
  };
}

/**
 * One invoice: what it is for, every payment against it with its receipt, and the two things a desk may ask a second person for:
 * waiving part of it (or cancelling what is left), and cancelling a receipt recorded by mistake.
 */
export function InvoiceSheet({ id, onClose, say, onCollect }: { id: string; onClose: () => void; say: (m: string, tone?: 'bad') => void; onCollect?: (studentId: string) => void }) {
  const app = useApp();
  const qc = useQueryClient();
  const shake = useShake();
  const q = useQuery({ queryKey: ['invoice', id], queryFn: () => app.api.invoices.one(id) });
  const pdf = useReceiptPdf(say);
  const [ask, setAsk] = useState<null | { kind: 'waive' | 'cancel' } | { kind: 'receipt'; paymentId: string; receiptNo: string }>(null);
  const [f, setF] = useState({ amount: '', reason: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const may = app.user.permissions.includes('fees.collect');
  const done = (d: InvoiceDetail, m: string) => {
    qc.setQueryData(['invoice', id], d);
    void qc.invalidateQueries({ predicate: (x) => ['invoices', 'receipts', 'approvals', 'shell'].includes(String(x.queryKey[0])) });
    setAsk(null); setF({ amount: '', reason: '' }); say(m);
  };
  const send = useMutation({
    mutationFn: () => {
      if (!ask) throw new Error('Nothing to send');
      if (ask.kind === 'receipt') return app.api.invoices.cancelReceipt(ask.paymentId, { reason: f.reason.trim() });
      return app.api.invoices.waive(id, { amount: ask.kind === 'cancel' ? 1 : Number(f.amount), reason: f.reason.trim(), cancel: ask.kind === 'cancel' });
    },
    onSuccess: (d) => done(d, 'Sent to Approvals. Someone who may approve it decides.'),
    onError: (e) => { setErr(problem(e)); shake.hit(); },
  });
  const go = () => {
    const p: Record<string, string> = {};
    if (f.reason.trim().length < 3) p.reason = 'Say why.';
    if (ask?.kind === 'waive' && !(Number(f.amount) > 0)) p.amount = 'Enter an amount.';
    setErr(p);
    if (Object.keys(p).length) shake.hit(); else send.mutate();
  };
  const d = q.data;
  return (
    <Dialog title={d ? d.title : 'Invoice'} tag={d ? { text: `${d.studentName} · Class ${d.className}`, tone: 'v' } : undefined} onClose={onClose} width={620} shake={shake.cls}>
      {!d ? <div className="skc" style={{ height: 240, borderRadius: 16 }} /> : (
        <div className="stack">
          <div>
            <div className="kv"><span>Kind of fee</span><b>{d.headName}</b></div>
            <div className="kv"><span>Due</span><b>{dateLabel(d.dueOn)}</b></div>
            <div className="kv"><span>Billed</span><b>₹{inr(d.amount)}</b></div>
            {d.waived > 0 && <div className="kv"><span>Waived</span><b>− ₹{inr(d.waived)}</b></div>}
            <div className="kv"><span>Paid</span><b>₹{inr(d.paid)}</b></div>
            <div className="kv"><span>Still to pay</span><b style={{ color: d.outstanding ? 'var(--bad)' : undefined }}>₹{inr(d.outstanding)}</b></div>
          </div>
          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>Payments</div>
            {!d.payments.length && <EmptyNote icon="payments" title="Nothing paid yet" body="Each payment against this invoice shows here with its receipt number." />}
            {d.payments.map((p) => (
              <div key={p.id} className="kv" style={{ alignItems: 'center', gap: 8 }}>
                <span style={{ minWidth: 0 }}>{p.receiptNo} · {dateLabel(p.paidOn)} · {p.method.toUpperCase()}{p.cancelled && <small style={{ display: 'block', color: 'var(--bad)' }}>Cancelled: {p.cancelReason}</small>}</span>
                <b style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  ₹{inr(p.amount)}
                  <button className="btn sm" onClick={() => pdf(p.id)}>Receipt</button>
                  {may && !p.cancelled && p.method !== 'online' && !d.pending && <button className="btn sm" onClick={() => setAsk({ kind: 'receipt', paymentId: p.id, receiptNo: p.receiptNo })}>Cancel</button>}
                </b>
              </div>
            ))}
          </div>
          {d.pending && <p className="help" style={{ margin: 0 }}>Waiting in Approvals: {d.pending.title}.</p>}
          {ask && (
            <div className="card" style={{ padding: 16, display: 'grid', gap: 10 }}>
              {ask.kind !== 'receipt' && <Segmented label="What to ask" value={ask.kind} onChange={(k) => setAsk({ kind: k })} options={[{ value: 'waive', label: 'Waive part of it' }, { value: 'cancel', label: `Cancel the ₹${inr(d.outstanding)} left` }]} />}
              {ask.kind === 'receipt' && <b style={{ font: '700 14px var(--fb)' }}>Cancel receipt {ask.receiptNo}</b>}
              {ask.kind === 'waive' && <NumberField label={`Amount to waive (at most ₹${inr(d.outstanding)})`} value={f.amount} onChange={(amount) => { setF({ ...f, amount }); setErr({}); }} error={err.amount} min={1} max={d.outstanding} />}
              <AreaField label="Why" value={f.reason} onChange={(reason) => { setF({ ...f, reason }); setErr({}); }} error={err.reason} rows={2} maxLength={300} placeholder={ask.kind === 'receipt' ? 'Recorded against the wrong student' : 'Sibling concession agreed with the principal'} />
              {err._ && <ErrorLine>{err._}</ErrorLine>}
              <div className="tgrow" style={{ justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => { setAsk(null); setErr({}); }}>Not now</button>
                <button className="btn pri" disabled={send.isPending} onClick={go}>{send.isPending ? 'Sending…' : 'Send for approval'}</button>
              </div>
            </div>
          )}
          <div className="tgrow">
            {may && !ask && !d.pending && d.outstanding > 0 && <button className="btn" onClick={() => setAsk({ kind: 'waive' })}>Waive or cancel</button>}
            <span className="grow"></span>
            <button className="btn" onClick={onClose}>Close</button>
            {onCollect && may && d.outstanding > 0 && <button className="btn pri" onClick={() => onCollect(d.studentId)}>Collect</button>}
          </div>
        </div>
      )}
    </Dialog>
  );
}
