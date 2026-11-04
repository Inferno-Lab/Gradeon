import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inr, lakhs, type InvoiceListQuery, type ReceiptRow, type StudentDetail } from '@gradeon/contracts';
import { Dialog, EmptyCard, Segmented, Select } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { Page, useToast } from '../../app/Page';
import { Avatar, Ico, dateLabel } from '../../app/kit';
import { CollectFeeDialog } from '../students/StudentDialogs';

const money = (n: number) => (n >= 100000 ? `₹${lakhs(n)}` : `₹${inr(Math.round(n))}`);
const STATUS: Record<string, { tone: string; label: string }> = { paid: { tone: 'g', label: 'Paid' }, partial: { tone: 'b', label: 'Part paid' }, due: { tone: 'a', label: 'Due' }, overdue: { tone: 'r', label: 'Overdue' } };
const SEARCH = 'M4.5 11a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0M20 20l-4.2-4.2';
type Filter = 'all' | 'overdue' | 'due' | 'partial' | 'paid';

export function InvoicesPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [view, setView] = useState<'invoices' | 'receipts'>('invoices');
  const [status, setStatus] = useState<Filter>('all');
  const [head, setHead] = useState('');
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const [paying, setPaying] = useState<StudentDetail | null>(null);
  const [receipt, setReceipt] = useState<ReceiptRow | null>(null);
  useEffect(() => { const t = setTimeout(() => { setTerm(q); setPage(1); }, 250); return () => clearTimeout(t); }, [q]);
  const query: Partial<InvoiceListQuery> = { status: status === 'all' ? undefined : status, head: (head || undefined) as 'tuition' | undefined, query: term || undefined, page, limit: 25 };
  const inv = useQuery({ queryKey: ['invoices', query], queryFn: () => app.api.invoices.list(query), placeholderData: (p) => p, enabled: view === 'invoices' });
  const rec = useQuery({ queryKey: ['receipts', term], queryFn: () => app.api.invoices.receipts(term || undefined), enabled: view === 'receipts' });
  const open = useMutation({ mutationFn: (id: string) => app.api.students.detail(id), onSuccess: setPaying, onError: (e) => say((e as Error).message, 'bad') });
  const canPay = app.user.permissions.includes('fees.collect');
  const s = inv.data?.summary;
  const pages = Math.max(1, Math.ceil((inv.data?.total ?? 0) / 25));
  const cur = view === 'invoices' ? inv : rec;
  return (
    <Page active="inv" title="Invoices" sub="Every fee billed, and every receipt given" toast={toast} loading={cur.isLoading && !cur.data}
      error={cur.isError && !cur.data ? { message: (cur.error as Error).message, retry: () => void cur.refetch() } : null}
      actions={<Segmented value={view} onChange={(v) => { setView(v); setPage(1); }} label="Invoices or receipts" options={[{ value: 'invoices', label: 'Invoices' }, { value: 'receipts', label: 'Receipts' }]} />}
      overlays={<>
        {paying && <CollectFeeDialog student={paying} onClose={() => setPaying(null)} onDone={(m) => { setPaying(null); void qc.invalidateQueries({ predicate: (x) => ['invoices', 'receipts', 'fee-summary', 'students', 'dashboard'].includes(String(x.queryKey[0])) }); say(m); }} />}
        {receipt && <ReceiptSheet r={receipt} onClose={() => setReceipt(null)} />}
      </>}>
      <section className="grid">
        {view === 'invoices' && s && <>
          <div className="tile t-v s4 rise"><span className="lbl" style={{ color: 'rgba(255,255,255,.7)' }}>Billed</span><div className="big" style={{ marginTop: 8 }}>{money(s.billed)}</div><div style={{ font: '600 13px var(--fb)', opacity: 0.8 }}>{s.count.toLocaleString('en-IN')} {s.count === 1 ? 'invoice' : 'invoices'} in view</div></div>
          <div className="tile t-a s4 rise" style={{ '--d': '.05s' } as React.CSSProperties}><span className="lbl" style={{ color: 'rgba(20,17,31,.6)' }}>Collected</span><div className="big" style={{ marginTop: 8 }}>{money(s.collected)}</div><div style={{ font: '600 13px var(--fb)', opacity: 0.75 }}>{s.billed ? Math.round((s.collected / s.billed) * 100) : 0}% of what was billed</div></div>
          <div className="tile t-p s4 rise" style={{ '--d': '.1s' } as React.CSSProperties}><span className="lbl">Still to pay</span><div className="big" style={{ marginTop: 8, color: s.outstanding ? 'var(--r)' : undefined }}>{money(s.outstanding)}</div><div style={{ font: '600 13px var(--fb)', color: 'var(--ink3)' }}>across the invoices in view</div></div>
        </>}
        <div className="card tbl s12 rise" style={{ '--d': '.14s', padding: 0 } as React.CSSProperties}>
          <div className="ch" style={{ padding: '22px 22px 6px', flexWrap: 'wrap', rowGap: 12 }}>
            <h2>{view === 'invoices' ? 'Invoices' : 'Receipts'}</h2>
            <div className="srch" style={{ minWidth: 240, height: 38 }}><Ico d={SEARCH} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={view === 'invoices' ? 'Student or fee' : 'Student or receipt number'} aria-label="Search" style={{ border: 0, outline: 0, background: 'none', font: '600 13.5px var(--fb)', color: 'var(--ink)', flex: 1, minWidth: 0 }} /></div>
          </div>
          {view === 'invoices' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '8px 22px 14px', alignItems: 'center' }}>
              <Segmented value={status} onChange={(v) => { setStatus(v); setPage(1); }} label="Status" options={[{ value: 'all', label: 'All' }, { value: 'overdue', label: 'Overdue' }, { value: 'due', label: 'Due' }, { value: 'partial', label: 'Part paid' }, { value: 'paid', label: 'Paid' }]} />
              <Select compact aria-label="Kind of fee" value={head} onChange={(v) => { setHead(v); setPage(1); }} options={[{ value: '', label: 'All fees' }, { value: 'tuition', label: 'Tuition' }, { value: 'transport', label: 'Transport' }, { value: 'activities', label: 'Activities' }, { value: 'lab', label: 'Lab' }]} />
            </div>
          )}
          {view === 'invoices' ? (
            (inv.data?.items.length ?? 0) === 0 ? (
              <div style={{ padding: '0 22px 22px' }}><EmptyCard title="Invoices" chip={{ text: '0', tone: 'v' }} scene={term || status !== 'all' || head ? 'search-paper' : 'receipt'} heading={term || status !== 'all' || head ? 'No invoice matches' : 'Nothing has been billed yet'} body={term || status !== 'all' || head ? 'Try another word or clear the filters.' : 'Assign a fee from the Students page and the invoices appear here.'} actions={term || status !== 'all' || head ? <button className="btn" onClick={() => { setQ(''); setStatus('all'); setHead(''); }}>Clear filters</button> : undefined} /></div>
            ) : (
              <>
                <div className="scroll-x lscroll" data-fill="">
                  <div className="inw" style={{ minWidth: 820 }}>
                    <div className="grd th inv" style={{ '--cols': 'minmax(0,1.6fr) minmax(0,1.3fr) 90px 100px 100px 100px 90px' } as React.CSSProperties}><span>Student</span><span className="hs">Fee</span><span className="hs">Due</span><span style={{ textAlign: 'right' }}>Billed</span><span className="hs" style={{ textAlign: 'right' }}>Paid</span><span>Status</span><span></span></div>
                    {inv.data!.items.map((r) => (
                      <div className="grd rw inv" key={r.id} style={{ '--cols': 'minmax(0,1.6fr) minmax(0,1.3fr) 90px 100px 100px 100px 90px' } as React.CSSProperties}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}><Avatar name={r.studentName} size={30} /><span style={{ minWidth: 0 }}><b title={r.studentName} style={{ font: '700 14px var(--fb)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.studentName}</b><small style={{ color: 'var(--ink3)', font: '600 12px var(--fb)' }}>Class {r.className}</small></span></span>
                        <span className="hs" title={r.title} style={{ font: '600 13.5px var(--fb)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.title}</span>
                        <span className="hs" style={{ font: '600 13px var(--fb)', color: 'var(--ink2)' }}>{dateLabel(r.dueOn)}</span>
                        <b className="num" style={{ font: '700 13.5px var(--fb)', textAlign: 'right' }}>₹{inr(r.amount - r.waived)}</b>
                        <span className="num hs" style={{ font: '600 13.5px var(--fb)', textAlign: 'right', color: 'var(--ink2)' }}>₹{inr(r.paid)}</span>
                        <span className={`st ${STATUS[r.status]!.tone}`}><i></i>{STATUS[r.status]!.label}</span>
                        <span>{canPay && r.outstanding > 0 && <button className="btn sm" disabled={open.isPending} onClick={() => open.mutate(r.studentId)}>Collect</button>}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 22px 18px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
                  <span className="help">Page {page} of {pages} · {inv.data!.total.toLocaleString('en-IN')} invoices</span>
                  <span style={{ display: 'flex', gap: 8 }}><button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></span>
                </div>
              </>
            )
          ) : (rec.data?.length ?? 0) === 0 ? (
            <div style={{ padding: '0 22px 22px' }}><EmptyCard title="Receipts" chip={{ text: '0', tone: 'v' }} scene="receipt" heading={term ? 'No receipt matches' : 'No payments yet'} body={term ? 'Check the spelling or the receipt number.' : 'Every payment gets a numbered receipt. They are listed here, newest first.'} /></div>
          ) : (
            <div className="scroll-x lscroll" data-fill="">
              <div style={{ minWidth: 720 }}>
                {rec.data!.map((r) => (
                  <button className="rowbtn" key={r.id} onClick={() => setReceipt(r)} aria-label={`Open receipt ${r.receiptNo}`}>
                    <div className="grd rw" style={{ '--cols': '150px minmax(0,1.5fr) minmax(0,1.2fr) 100px 100px' } as React.CSSProperties}>
                      <b className="num" style={{ font: '700 13px var(--fb)' }}>{r.receiptNo}</b>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}><Avatar name={r.studentName} size={28} /><b title={r.studentName} style={{ font: '700 14px var(--fb)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.studentName}</b></span>
                      <span className="hs" title={r.title} style={{ font: '600 13.5px var(--fb)', color: 'var(--ink2)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.title}</span>
                      <span style={{ font: '600 13px var(--fb)', color: 'var(--ink3)' }}>{dateLabel(r.paidOn)}</span>
                      <b className="num" style={{ font: '700 14px var(--fb)', textAlign: 'right' }}>₹{inr(r.amount)}</b>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </Page>
  );
}

function ReceiptSheet({ r, onClose }: { r: ReceiptRow; onClose: () => void }) {
  const print = () => {
    const w = window.open('', '_blank', 'width=520,height=640');
    if (!w) return;
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    w.document.write(`<!doctype html><title>${esc(r.receiptNo)}</title><body style="font:15px/1.6 system-ui,sans-serif;max-width:420px;margin:32px auto;color:#14111F"><h2 style="margin:0">Fee receipt</h2><p style="margin:2px 0 18px;color:#575270">${esc(r.receiptNo)}</p><table style="width:100%;border-collapse:collapse">${[['Student', `${r.studentName}, Class ${r.className}`], ['For', r.title], ['Paid on', dateLabel(r.paidOn)], ['Method', r.method.toUpperCase()], ['Reference', r.reference ?? 'None'], ['Received by', r.recordedBy]].map(([k, v]) => `<tr><td style="padding:6px 0;color:#575270">${k}</td><td style="padding:6px 0;text-align:right"><b>${esc(String(v))}</b></td></tr>`).join('')}<tr><td style="padding:14px 0;border-top:2px solid #14111F">Amount</td><td style="padding:14px 0;border-top:2px solid #14111F;text-align:right;font-size:22px"><b>₹${inr(r.amount)}</b></td></tr></table><script>window.onload=()=>print()</script>`);
    w.document.close();
  };
  return (
    <Dialog title={r.receiptNo} tag={{ text: 'Receipt', tone: 'g' }} onClose={onClose} width={460}>
      <div className="stack">
        <div className="kv"><span>Student</span><b>{r.studentName} · Class {r.className}</b></div>
        <div className="kv"><span>For</span><b>{r.title}</b></div>
        <div className="kv"><span>Paid on</span><b>{dateLabel(r.paidOn)}</b></div>
        <div className="kv"><span>Method</span><b>{r.method.toUpperCase()}{r.reference ? ` · ${r.reference}` : ''}</b></div>
        <div className="kv"><span>Received by</span><b>{r.recordedBy}</b></div>
        <div className="kv"><span>Amount</span><b style={{ fontSize: 20 }}>₹{inr(r.amount)}</b></div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Close</button>
        <button className="btn pri" onClick={print}>Print receipt</button>
      </div>
    </Dialog>
  );
}
