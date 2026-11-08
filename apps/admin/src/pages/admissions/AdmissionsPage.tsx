import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ENQUIRY_STAGES, addDays, istToday, type EnquiryRow, type EnquiryStage } from '@gradeon/contracts';
import { DateField, Dialog, EmptyCard, Field, SelectField, useShake } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { Page, useToast } from '../../app/Page';
import { AddBtn, AreaField, Avatar, dateLabel, problem } from '../../app/kit';

const COLUMNS: { stage: EnquiryStage; label: string; hint: string }[] = [
  { stage: 'enquiry', label: 'Enquiry', hint: 'Asked about a seat' },
  { stage: 'applied', label: 'Applied', hint: 'Form received' },
  { stage: 'test', label: 'Test', hint: 'Entrance test booked' },
  { stage: 'offer', label: 'Offer', hint: 'Seat offered' },
  { stage: 'enrolled', label: 'Enrolled', hint: 'Now a student' },
];
const SOURCE: Record<string, string> = { 'walk-in': 'Walk-in', phone: 'Phone', website: 'Website', referral: 'Referral', event: 'Event' };
const NEXT: Partial<Record<EnquiryStage, { to: EnquiryStage; label: string }>> = {
  enquiry: { to: 'applied', label: 'Mark applied' }, applied: { to: 'test', label: 'Book test' }, test: { to: 'offer', label: 'Make offer' }, offer: { to: 'enrolled', label: 'Enrol' },
};
const refresh = (qc: ReturnType<typeof useQueryClient>) => void qc.invalidateQueries({ predicate: (q) => ['admissions', 'students', 'shell', 'dashboard', 'classes'].includes(String(q.queryKey[0])) });

export function AdmissionsPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [adding, setAdding] = useState(false);
  const [dlg, setDlg] = useState<{ kind: 'test' | 'enrol' | 'view'; row: EnquiryRow } | null>(null);
  const [showDeclined, setShowDeclined] = useState(false);
  const list = useQuery({ queryKey: ['admissions'], queryFn: app.api.admissions.list });
  const canWrite = app.user.permissions.includes('admissions.write');
  const rows = list.data ?? [];
  const move = useMutation({
    mutationFn: (v: { id: string; stage: EnquiryStage; testOn?: string }) => app.api.admissions.patch(v.id, { stage: v.stage, testOn: v.testOn }),
    onSuccess: (r) => { refresh(qc); say(r.stage === 'offer' ? `Offer made. ${r.guardianName} is told.` : `${r.childName} moved to ${COLUMNS.find((c) => c.stage === r.stage)?.label ?? 'Declined'}.`); setDlg(null); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  const act = (r: EnquiryRow) => {
    const n = NEXT[r.stage];
    if (!n) return;
    if (n.to === 'test') setDlg({ kind: 'test', row: r });
    else if (n.to === 'enrolled') setDlg({ kind: 'enrol', row: r });
    else move.mutate({ id: r.id, stage: n.to });
  };
  const declined = rows.filter((r) => r.stage === 'declined');
  const open = rows.filter((r) => r.stage !== 'enrolled' && r.stage !== 'declined').length;
  return (
    <Page title="Admissions" sub={rows.length ? `${open} open · ${rows.filter((r) => r.stage === 'enrolled').length} enrolled` : 'From first enquiry to first day'} toast={toast} loading={list.isLoading && !list.data}
      error={list.isError && !list.data ? { message: (list.error as Error).message, retry: () => void list.refetch() } : null}
      actions={canWrite ? <AddBtn onClick={() => setAdding(true)}>New enquiry</AddBtn> : undefined}
      overlays={<>
        {adding && <NewEnquiry onClose={() => setAdding(false)} onDone={() => { setAdding(false); refresh(qc); say('Enquiry added.'); }} />}
        {dlg?.kind === 'test' && <TestDay row={dlg.row} onClose={() => setDlg(null)} onPick={(d) => move.mutate({ id: dlg.row.id, stage: 'test', testOn: d })} busy={move.isPending} />}
        {dlg?.kind === 'enrol' && <Enrol row={dlg.row} onClose={() => setDlg(null)} onDone={(name, adm) => { setDlg(null); refresh(qc); say(`${name} is enrolled. Admission number ${adm}.`); }} />}
        {dlg?.kind === 'view' && <Details row={dlg.row} canWrite={canWrite} onClose={() => setDlg(null)} onDecline={() => move.mutate({ id: dlg.row.id, stage: 'declined' })} onReopen={() => move.mutate({ id: dlg.row.id, stage: 'enquiry' })} onNote={(note) => app.api.admissions.patch(dlg.row.id, { note }).then(() => { refresh(qc); setDlg(null); say('Note saved.'); }).catch((e: Error) => say(e.message, 'bad'))} />}
      </>}>
      {rows.length === 0 ? (
        <div><EmptyCard title="Admissions" chip={{ text: '0 enquiries', tone: 'v' }} scene="calendar" heading="No enquiries yet" body="Add each family that asks about a seat. Move them from enquiry to application, entrance test and offer, then enrol the child in one step." actions={canWrite ? <AddBtn onClick={() => setAdding(true)}>New enquiry</AddBtn> : undefined} /></div>
      ) : (
        <>
          <div className="adm" role="list">
            {COLUMNS.map((c) => {
              const items = rows.filter((r) => r.stage === c.stage);
              return (
                <section className="admc rise" key={c.stage} role="listitem" aria-label={c.label}>
                  <header><b>{c.label}</b><span className="chip">{items.length}</span></header>
                  <small>{c.hint}</small>
                  <div className="lscroll admcl">
                    {items.length === 0 && <div className="admn">Nothing here</div>}
                    {items.map((r) => (
                      <article className="admk" key={r.id}>
                        <button className="admo" onClick={() => setDlg({ kind: 'view', row: r })} aria-label={`Open ${r.childName}`}>
                          <Avatar name={r.childName} size={32} />
                          <span style={{ minWidth: 0 }}><b data-tip={r.childName}>{r.childName}</b><small>Grade {r.gradeSought} · {r.guardianName}</small></span>
                        </button>
                        <div className="tgrow" style={{ gap: 6 }}>
                          <span className="chip">{SOURCE[r.source] ?? r.source}</span>
                          {r.testOn && <span className="chip a">Test {dateLabel(r.testOn)}</span>}
                          {r.studentId && <span className="chip g">Student</span>}
                        </div>
                        {canWrite && NEXT[r.stage] && <button className="btn sm" disabled={move.isPending} onClick={() => act(r)}>{NEXT[r.stage]!.label}</button>}
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
          {declined.length > 0 && (
            <section className="card rise">
              <div className="ch"><h2>Declined</h2><span className="chip">{declined.length}</span><button className="btn sm" onClick={() => setShowDeclined(!showDeclined)}>{showDeclined ? 'Hide' : 'Show'}</button></div>
              {showDeclined && <div className="tgrow" style={{ marginTop: 14 }}>{declined.map((r) => <button key={r.id} className="fp" onClick={() => setDlg({ kind: 'view', row: r })}>{r.childName} · Grade {r.gradeSought}</button>)}</div>}
            </section>
          )}
          <p className="help" style={{ margin: 0 }}>Stages: {ENQUIRY_STAGES.filter((s) => s !== 'declined').join(' → ')}. Making an offer sends the family a message.</p>
        </>
      )}
    </Page>
  );
}

function NewEnquiry({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const app = useApp();
  const [f, setF] = useState({ childName: '', gradeSought: '1', guardianName: '', phone: '', email: '', source: 'walk-in', note: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const shake = useShake();
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErr((e) => ({ ...e, [k]: '', _: '' })); };
  const make = useMutation({
    mutationFn: () => app.api.admissions.create({ childName: f.childName.trim(), gradeSought: Number(f.gradeSought), guardianName: f.guardianName.trim(), phone: f.phone.trim(), email: f.email.trim(), source: f.source as 'walk-in', note: f.note.trim() }),
    onSuccess: onDone, onError: (e) => { setErr(problem(e)); shake.hit(); },
  });
  const go = () => {
    const p: Record<string, string> = {};
    if (f.childName.trim().length < 2) p.childName = 'Enter the child’s name.';
    if (f.guardianName.trim().length < 2) p.guardianName = 'Enter the guardian’s name.';
    if (f.phone.trim().length < 8) p.phone = 'Enter a phone number.';
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) p.email = 'Enter a valid email or leave it empty.';
    setErr(p);
    if (Object.keys(p).length) shake.hit(); else make.mutate();
  };
  return (
    <Dialog title="New enquiry" onClose={onClose} width={560} shake={shake.cls}>
      <div className="stack">
        <div className="two">
          <Field label="Child’s name" value={f.childName} onChange={set('childName')} error={err.childName} maxLength={80} />
          <SelectField label="Grade wanted" value={f.gradeSought} onChange={set('gradeSought')} options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `Grade ${i + 1}` }))} />
        </div>
        <Field label="Guardian’s name" value={f.guardianName} onChange={set('guardianName')} error={err.guardianName} maxLength={80} />
        <div className="two">
          <Field label="Phone" value={f.phone} onChange={set('phone')} error={err.phone} />
          <Field label="Email (optional)" type="email" value={f.email} onChange={set('email')} error={err.email} />
        </div>
        <SelectField label="How they found us" value={f.source} onChange={set('source')} options={Object.entries(SOURCE).map(([value, label]) => ({ value, label }))} />
        <AreaField label="Note (optional)" value={f.note} onChange={set('note')} rows={2} maxLength={400} />
        {err._ && <div className="emsg" role="alert">{err._}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={make.isPending} onClick={go}>{make.isPending ? 'Adding…' : 'Add enquiry'}</button>
      </div>
    </Dialog>
  );
}

function TestDay({ row, onClose, onPick, busy }: { row: EnquiryRow; onClose: () => void; onPick: (d: string) => void; busy: boolean }) {
  const [d, setD] = useState(row.testOn ?? addDays(istToday(), 3));
  return (
    <Dialog title="Entrance test" tag={{ text: row.childName, tone: 'v' }} onClose={onClose} width={440}>
      <DateField label="Day of the test" value={d} min={istToday()} onChange={setD} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={busy || !d} onClick={() => onPick(d)}>{busy ? 'Saving…' : 'Book the test'}</button>
      </div>
    </Dialog>
  );
}

function Enrol({ row, onClose, onDone }: { row: EnquiryRow; onClose: () => void; onDone: (name: string, adm: string) => void }) {
  const app = useApp();
  const classes = useQuery({ queryKey: ['classes'], queryFn: app.api.classes, staleTime: 5 * 60_000 });
  const fit = (classes.data ?? []).filter((c) => c.grade === row.gradeSought);
  const [classId, setClassId] = useState('');
  const [dob, setDob] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const shake = useShake();
  const chosen = classId || fit[0]?.id || '';
  const enrol = useMutation({ mutationFn: () => app.api.admissions.enrol(row.id, { classId: chosen, dob }), onSuccess: (s) => onDone(s.name, s.admissionNo), onError: (e) => { setErr(problem(e)); shake.hit(); } });
  const go = () => {
    const p: Record<string, string> = {};
    if (!chosen) p.classId = 'Choose a class.';
    if (!dob) p.dob = 'Enter the date of birth.';
    setErr(p);
    if (Object.keys(p).length) shake.hit(); else enrol.mutate();
  };
  return (
    <Dialog title={`Enrol ${row.childName}`} tag={{ text: `Grade ${row.gradeSought}`, tone: 'v' }} onClose={onClose} width={460} shake={shake.cls}>
      <div className="stack">
        <SelectField label="Class" value={chosen} onChange={(v) => { setClassId(v); setErr({ ...err, classId: '' }); }} error={err.classId}
          options={(fit.length ? fit : classes.data ?? []).map((c) => ({ value: c.id, label: `Class ${c.name} · ${c.studentCount} students` }))} />
        <DateField label="Date of birth" value={dob} max={istToday()} onChange={(v) => { setDob(v); setErr({ ...err, dob: '' }); }} error={err.dob} />
        <div className="help">{row.guardianName} · {row.phone || 'no phone yet'} becomes the guardian on the student record.</div>
        {err._ && <div className="emsg" role="alert">{err._}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={enrol.isPending} onClick={go}>{enrol.isPending ? 'Enrolling…' : 'Enrol student'}</button>
      </div>
    </Dialog>
  );
}

function Details({ row, canWrite, onClose, onDecline, onReopen, onNote }: { row: EnquiryRow; canWrite: boolean; onClose: () => void; onDecline: () => void; onReopen: () => void; onNote: (n: string) => void }) {
  const [note, setNote] = useState(row.note);
  const locked = row.stage === 'enrolled';
  return (
    <Dialog title={row.childName} tag={{ text: `Grade ${row.gradeSought}`, tone: 'v' }} onClose={onClose} width={480}>
      <div className="stack">
        <div className="kv"><span>Guardian</span><b>{row.guardianName}</b></div>
        <div className="kv"><span>Phone</span><b>{row.phone || 'Not given'}</b></div>
        {row.email && <div className="kv"><span>Email</span><b>{row.email}</b></div>}
        <div className="kv"><span>Found us through</span><b>{SOURCE[row.source] ?? row.source}</b></div>
        {row.testOn && <div className="kv"><span>Entrance test</span><b>{dateLabel(row.testOn)}</b></div>}
        <AreaField label="Note" value={note} onChange={setNote} rows={3} maxLength={400} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        {canWrite && !locked ? (row.stage === 'declined' ? <button className="btn" onClick={onReopen}>Reopen</button> : <button className="btn dng" onClick={onDecline}>Decline</button>) : <span />}
        <span style={{ display: 'flex', gap: 10 }}>
          <button className="btn" onClick={onClose}>Close</button>
          {canWrite && !locked && <button className="btn pri" disabled={note === row.note} onClick={() => onNote(note)}>Save note</button>}
        </span>
      </div>
    </Dialog>
  );
}
