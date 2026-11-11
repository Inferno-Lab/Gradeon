import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookRow, LoanRow } from '@gradeon/contracts';
import { DateField, Dialog, EmptyCard, Field, NumberField, Segmented, SelectField, useShake } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { Card, Page, useToast } from '../../app/Page';
import { AddBtn, SEARCH, StudentPick, dateLabel, problem, stamp } from '../../app/kit';
import { usePageTabs } from '../../app/tabs';

type Tab = 'books' | 'loans' | 'waiting';
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function LibraryPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const { tab: at, tabs } = usePageTabs('/library');
  const tab = (at || 'books') as Tab;
  const [q, setQ] = useState('');
  const [dlg, setDlg] = useState<{ kind: 'book'; book: BookRow | null } | { kind: 'issue'; book: BookRow } | { kind: 'return'; loan: LoanRow } | null>(null);
  const view = useQuery({ queryKey: ['library'], queryFn: app.api.library.view });
  const canWrite = app.user.permissions.includes('library.write');
  const refresh = () => void qc.invalidateQueries({ queryKey: ['library'] });
  const done = (m: string) => { setDlg(null); refresh(); say(m); };
  const cancel = useMutation({ mutationFn: app.api.library.cancel, onSuccess: () => { refresh(); say('Reservation cancelled.'); }, onError: (e) => say((e as Error).message, 'bad') });
  const v = view.data;
  const books = useMemo(() => (v?.books ?? []).filter((b) => !q.trim() || `${b.title} ${b.author} ${b.isbn} ${b.category}`.toLowerCase().includes(q.trim().toLowerCase())), [v, q]);
  const overdue = (v?.loans ?? []).filter((l) => l.overdueDays > 0);
  return (
    <Page title="Library" sub="The catalogue, who has which book, and who is waiting" toast={toast} loading={view.isLoading && !v}
      error={view.isError && !v ? { message: (view.error as Error).message, retry: () => void view.refetch() } : null}
      actions={<>{tabs}{canWrite && <AddBtn onClick={() => setDlg({ kind: 'book', book: null })}>Add a book</AddBtn>}</>}
      overlays={<>
        {dlg?.kind === 'book' && <BookDialog book={dlg.book} onClose={() => setDlg(null)} onDone={done} />}
        {dlg?.kind === 'issue' && <IssueDialog book={dlg.book} loanDays={v?.rules.loanDays ?? 14} onClose={() => setDlg(null)} onDone={done} />}
        {dlg?.kind === 'return' && <ReturnDialog loan={dlg.loan} onClose={() => setDlg(null)} onDone={done} />}
      </>}>
      {v && (v.books.length === 0 && v.loans.length === 0 ? (
        <div><EmptyCard title="Library" chip={{ text: '0 books', tone: 'v' }} scene="notebooks" heading="The shelves are empty"
          body="Add books one by one, or bring the whole catalogue in from a spreadsheet under Moving in. Families then see what is on the shelf and can reserve from the app."
          actions={canWrite ? <AddBtn onClick={() => setDlg({ kind: 'book', book: null })}>Add a book</AddBtn> : undefined} /></div>
      ) : <>
        <section className="grid">
          {[
            { label: 'Titles', value: v.books.length, note: `${v.books.reduce((n, b) => n + b.copies, 0)} copies`, tone: 'v' },
            { label: 'Out on loan', value: v.loans.length, note: `${v.reservations.length} waiting for a copy`, tone: 'i' },
            { label: 'Overdue', value: overdue.length, note: overdue.length ? `${rupees(overdue.reduce((n, l) => n + l.fine, 0))} in fines so far` : `fine ${rupees(v.rules.finePerDay)} a day`, tone: overdue.length ? 'a' : 'g' },
          ].map((t, i) => (
            <div key={t.label} className={`tile t-${t.tone} s4 rise`} style={{ '--d': `${i * 0.05}s` } as React.CSSProperties}>
              <span className="lbl">{t.label}</span>
              <div className="fd" style={{ fontSize: 34, letterSpacing: '-.04em', marginTop: 8 }}>{t.value}</div>
              <div style={{ opacity: 0.75, font: '600 13px var(--fb)' }}>{t.note}</div>
            </div>
          ))}
        </section>
        {tab === 'books' && <div className="rise" style={{ maxWidth: 360 }}><Field label="Search the catalogue" value={q} onChange={setQ} icon={SEARCH} placeholder="Title, author or ISBN" /></div>}
        {tab === 'books' && (
          <Card style={{ padding: 0 }}>
            {!books.length ? <div className="help" style={{ padding: 20 }}>No book matches “{q}”.</div> : (
              <div className="tbl scroll-x"><div style={{ minWidth: 680 }} className="lscroll">
                <div className="grd th" style={{ '--cols': 'minmax(0,2.4fr) minmax(0,1fr) 90px 110px 170px' } as React.CSSProperties}><span>Book</span><span>Category</span><span>Shelf</span><span>On the shelf</span><span></span></div>
                {books.map((b) => (
                  <div key={b.id} className="grd rw" style={{ '--cols': 'minmax(0,2.4fr) minmax(0,1fr) 90px 110px 170px', height: 'auto', minHeight: 56, padding: '8px 20px' } as React.CSSProperties}>
                    <span style={{ minWidth: 0 }}><b style={{ font: '700 14px/1.3 var(--fb)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-tip={b.title}>{b.title}</b><small className="help">{b.author || 'Author not given'}{b.isbn ? ` · ${b.isbn}` : ''}</small></span>
                    <span className="help" style={{ margin: 0 }}>{b.category}</span>
                    <span className="help" style={{ margin: 0 }}>{b.shelf || '–'}</span>
                    <span><span className={`chip ${b.copies - b.out > 0 ? 'g' : 'a'}`}>{b.copies - b.out} of {b.copies}</span>{b.waiting > 0 && <span className="chip v" style={{ marginLeft: 4 }} data-tip="Families waiting">{b.waiting} waiting</span>}</span>
                    <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {canWrite && <button className="btn sm" disabled={b.copies - b.out <= 0} onClick={() => setDlg({ kind: 'issue', book: b })}>Issue</button>}
                      {canWrite && <button className="btn sm" onClick={() => setDlg({ kind: 'book', book: b })}>Edit</button>}
                    </span>
                  </div>
                ))}
              </div></div>
            )}
          </Card>
        )}
        {tab === 'loans' && (
          <Card style={{ padding: 0 }}>
            {!v.loans.length ? <div className="help" style={{ padding: 20 }}>No book is out. Issue one from the catalogue.</div> : (
              <div className="tbl scroll-x"><div style={{ minWidth: 660 }} className="lscroll">
                <div className="grd th" style={{ '--cols': 'minmax(0,2fr) minmax(0,1.4fr) 110px 150px 130px' } as React.CSSProperties}><span>Book</span><span>Student</span><span>Due</span><span>Status</span><span></span></div>
                {v.loans.map((l) => (
                  <div key={l.id} className="grd rw" style={{ '--cols': 'minmax(0,2fr) minmax(0,1.4fr) 110px 150px 130px', height: 'auto', minHeight: 56, padding: '8px 20px' } as React.CSSProperties}>
                    <b style={{ font: '700 14px/1.3 var(--fb)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-tip={l.title}>{l.title}</b>
                    <span style={{ minWidth: 0 }}><b style={{ font: '600 13px var(--fb)' }}>{l.student}</b><small className="help" style={{ display: 'block' }}>{l.className}</small></span>
                    <span className="num">{dateLabel(l.dueOn)}</span>
                    <span>{l.overdueDays > 0 ? <span className="chip c" data-tip={`${l.overdueDays} days late`}>Late · {rupees(l.fine)}</span> : <span className="chip g">On time</span>}</span>
                    <span style={{ display: 'flex', justifyContent: 'flex-end' }}>{canWrite && <button className="btn sm" onClick={() => setDlg({ kind: 'return', loan: l })}>Take back</button>}</span>
                  </div>
                ))}
              </div></div>
            )}
          </Card>
        )}
        {tab === 'waiting' && (
          <Card style={{ padding: 0 }}>
            {!v.reservations.length ? <div className="help" style={{ padding: 20 }}>Nobody is waiting. Families reserve books from the app; the first in line is told when a copy comes back.</div>
              : v.reservations.map((r) => (
                <div key={r.id} className="rw" style={{ display: 'flex', gap: 10, alignItems: 'center', height: 'auto', minHeight: 52, padding: '10px 20px', flexWrap: 'wrap' }}>
                  <span className={`chip ${r.status === 'ready' ? 'g' : 'v'}`}>{r.status === 'ready' ? 'Ready at the desk' : 'Waiting'}</span>
                  <b style={{ flex: 1, minWidth: 160, font: '700 13px/1.35 var(--fb)' }}>{r.title}</b>
                  <span className="help" style={{ margin: 0 }}>{r.student} · since {stamp(r.createdAt)}</span>
                  {canWrite && <button className="btn sm" disabled={cancel.isPending} onClick={() => cancel.mutate(r.id)}>Cancel</button>}
                </div>
              ))}
          </Card>
        )}
      </>)}
    </Page>
  );
}

function BookDialog({ book, onClose, onDone }: { book: BookRow | null; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const shake = useShake();
  const [f, setF] = useState({ title: book?.title ?? '', author: book?.author ?? '', isbn: book?.isbn ?? '', category: book?.category ?? 'General', shelf: book?.shelf ?? '', copies: String(book?.copies ?? 1) });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (x: string) => { setF((o) => ({ ...o, [k]: x })); setErr((e) => ({ ...e, [k]: '', _: '' })); };
  const body = () => ({ title: f.title.trim(), author: f.author.trim(), isbn: f.isbn.trim(), category: f.category.trim() || 'General', shelf: f.shelf.trim(), copies: Number(f.copies || 0) });
  const save = useMutation({ mutationFn: () => (book ? app.api.library.save(book.id, body()) : app.api.library.add(body())), onSuccess: (b) => onDone(`${b.title} ${book ? 'was saved' : 'is in the catalogue'}.`), onError: (e) => { setErr(problem(e)); shake.hit(); } });
  const del = useMutation({ mutationFn: () => app.api.library.remove(book!.id), onSuccess: () => onDone(`${book!.title} was taken out of the catalogue.`), onError: (e) => { setErr(problem(e)); shake.hit(); } });
  return (
    <Dialog title={book ? 'Edit book' : 'Add a book'} onClose={onClose} width={520} shake={shake.cls}>
      <div className="stack">
        <Field label="Title" value={f.title} onChange={set('title')} error={err.title} placeholder="Wings of Fire" />
        <div className="two"><Field label="Author" value={f.author} onChange={set('author')} placeholder="A. P. J. Abdul Kalam" /><Field label="ISBN" value={f.isbn} onChange={set('isbn')} placeholder="9788173711466" /></div>
        <div className="two"><Field label="Category" value={f.category} onChange={set('category')} placeholder="Biography" /><Field label="Shelf" value={f.shelf} onChange={set('shelf')} placeholder="B-3" /></div>
        <NumberField label="Copies" value={f.copies} onChange={set('copies')} min={0} max={500} error={err.copies} />
        {err._ && <div className="emsg" role="alert">{err._}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        {book && <button className="btn" style={{ marginRight: 'auto' }} disabled={del.isPending} onClick={() => del.mutate()}>Remove from catalogue</button>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={save.isPending || !f.title.trim()} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : book ? 'Save' : 'Add book'}</button>
      </div>
    </Dialog>
  );
}

function IssueDialog({ book, loanDays, onClose, onDone }: { book: BookRow; loanDays: number; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const shake = useShake();
  const [to, setTo] = useState<'student' | 'staff'>('student');
  const [student, setStudent] = useState<{ id: string; name: string; className: string } | null>(null);
  const [staffId, setStaffId] = useState('');
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => app.api.staff.list(), enabled: to === 'staff' });
  const [due, setDue] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const issue = useMutation({
    mutationFn: () => app.api.library.issue({ bookId: book.id, studentId: to === 'student' ? student!.id : null, staffUserId: to === 'staff' ? staffId : null, dueOn: due || undefined }),
    onSuccess: (l) => onDone(`${book.title} is with ${l.student} until ${dateLabel(l.dueOn)}.`), onError: (e) => { setErr(problem(e)); shake.hit(); },
  });
  return (
    <Dialog title={`Issue ${book.title}`} onClose={onClose} width={500} shake={shake.cls}>
      <div className="stack">
        <Segmented label="Who is borrowing" value={to} onChange={(v) => { setTo(v); setErr({}); }} options={[{ value: 'student', label: 'A student' }, { value: 'staff', label: 'Staff' }]} />
        {to === 'student'
          ? <StudentPick label="To" value={student} onChange={(s) => { setStudent(s); setErr({}); }} error={err.studentId} />
          : <SelectField label="To" value={staffId} onChange={setStaffId} error={err.staffUserId} options={[{ value: '', label: 'Choose a member of staff' }, ...(staff.data ?? []).filter((p) => p.status === 'active').map((p) => ({ value: p.id, label: p.name }))]} />}
        <DateField label={`Due back (blank: in ${loanDays} days)`} value={due} onChange={setDue} />
        {err._ && <div className="emsg" role="alert">{err._}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={issue.isPending || (to === 'student' ? !student : !staffId)} onClick={() => issue.mutate()}>{issue.isPending ? 'Issuing…' : 'Issue'}</button>
      </div>
    </Dialog>
  );
}

function ReturnDialog({ loan, onClose, onDone }: { loan: LoanRow; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const back = useMutation({ mutationFn: () => app.api.library.giveBack(loan.id), onSuccess: (r) => onDone(r.fine ? `${loan.title} is back. Fine: ${rupees(r.fine)}.` : `${loan.title} is back on the shelf.`) });
  return (
    <Dialog title={`Take back ${loan.title}?`} onClose={onClose} width={460}>
      <p className="help" style={{ margin: 0 }}>From {loan.student}, {loan.className}. {loan.overdueDays > 0 ? `It is ${loan.overdueDays} days late: the fine is ${rupees(loan.fine)}.` : 'It is on time.'} If a family is waiting for it, they are told it is ready.</p>
      {back.isError && <div className="emsg" role="alert" style={{ marginTop: 12 }}>{(back.error as Error).message}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={back.isPending} onClick={() => back.mutate()}>{back.isPending ? 'Saving…' : 'Take back'}</button>
      </div>
    </Dialog>
  );
}
