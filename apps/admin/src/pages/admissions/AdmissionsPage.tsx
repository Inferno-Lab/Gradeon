import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, istToday, type EnquiryPatch, type EnquiryRow, type EnquiryStage } from '@tangent/contracts';
import { DateField, Dialog, Field, SelectField, useShake, EmptyState } from '@tangent/web-ui';
import { useApp } from '../../app/context';
import { Page, useToast } from '../../app/Page';
import { AddBtn, AreaField, Avatar, dateLabel, problem, useGrades, useSetting } from '../../app/kit';

const COLUMNS: { stage: EnquiryStage; label: string; hint: string; next: string }[] = [
  { stage: 'enquiry', label: 'Enquiry', hint: 'Asked about a seat', next: 'Back to enquiry' },
  { stage: 'applied', label: 'Applied', hint: 'Form received', next: 'Mark applied' },
  { stage: 'test', label: 'Test', hint: 'Entrance test booked', next: 'Book test' },
  { stage: 'offer', label: 'Offer', hint: 'Seat offered; the family is told', next: 'Make offer' },
  { stage: 'enrolled', label: 'Enrolled', hint: 'Now a student', next: 'Enrol' },
];
const label = (s: EnquiryStage) => COLUMNS.find((c) => c.stage === s)?.label ?? 'Declined';
/** A source as stored (older rows keep a key like `walk-in`), shown as words. */
const sourceLabel = (s: string) => (s.includes(' ') || /[A-Z]/.test(s) ? s : s.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()));
const refresh = (qc: ReturnType<typeof useQueryClient>) => void qc.invalidateQueries({ predicate: (q) => ['admissions', 'students', 'shell', 'dashboard', 'classes'].includes(String(q.queryKey[0])) });

export function AdmissionsPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [adding, setAdding] = useState(false);
  const [dlg, setDlg] = useState<{ kind: 'test' | 'enrol' | 'view'; row: EnquiryRow } | null>(null);
  const [showDeclined, setShowDeclined] = useState(false);
  const list = useQuery({ queryKey: ['admissions'], queryFn: app.api.admissions.list });
  const grades = useGrades();
  const grade = (g: number) => grades.find((x) => x.value === String(g))?.label ?? `Grade ${g}`;
  // The school's stages (console: admissions.stages), with any stage that still holds a card after it was switched off.
  const used = useSetting<string[]>('admissions.stages', ['applied', 'test', 'offer']);
  const columns = COLUMNS.filter((c) => c.stage === 'enquiry' || c.stage === 'enrolled' || used.includes(c.stage) || (list.data ?? []).some((r) => r.stage === c.stage));
  const flow = columns.filter((c) => c.stage === 'enquiry' || c.stage === 'enrolled' || used.includes(c.stage)).map((c) => c.stage);
  const step = (s: EnquiryStage, by: 1 | -1) => { const i = flow.indexOf(s); return i < 0 ? (by > 0 ? flow[1] : undefined) : flow[i + by]; };
  const canWrite = app.user.permissions.includes('admissions.write');
  const rows = list.data ?? [];
  const move = useMutation({
    mutationFn: (v: { id: string; stage: EnquiryStage; testOn?: string }) => app.api.admissions.patch(v.id, { stage: v.stage, testOn: v.testOn }),
    onSuccess: (r) => { refresh(qc); say(r.stage === 'offer' ? `Offer made. ${r.guardianName} is told.` : `${r.childName} moved to ${label(r.stage)}.`); setDlg(null); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  const act = (r: EnquiryRow, to: EnquiryStage) => {
    if (to === 'test') setDlg({ kind: 'test', row: r });
    else if (to === 'enrolled') setDlg({ kind: 'enrol', row: r });
    else move.mutate({ id: r.id, stage: to });
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
        {dlg?.kind === 'view' && <Details row={dlg.row} canWrite={canWrite} back={dlg.row.stage === 'declined' ? undefined : step(dlg.row.stage, -1)} onClose={() => setDlg(null)} onMove={(stage) => move.mutate({ id: dlg.row.id, stage })} onSaved={() => { refresh(qc); setDlg(null); say('Saved.'); }} />}
      </>}>
      {rows.length === 0 ? (
        <div><EmptyState scene="admissions" onAction={canWrite ? () => setAdding(true) : undefined} /></div>
      ) : (
        <>
          <div className="adm" role="list">
            {columns.map((c) => {
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
                          <span style={{ minWidth: 0 }}><b data-tip={r.childName}>{r.childName}</b><small>{grade(r.gradeSought)} · {r.guardianName}</small></span>
                        </button>
                        <div className="tgrow" style={{ gap: 6 }}>
                          <span className="chip">{sourceLabel(r.source)}</span>
                          {r.testOn && <span className="chip a">Test {dateLabel(r.testOn)}</span>}
                          {r.studentId && <span className="chip g">Student</span>}
                        </div>
                        {canWrite && (() => { const to = step(r.stage, 1); return to && <button className="btn sm" disabled={move.isPending} onClick={() => act(r, to)}>{COLUMNS.find((x) => x.stage === to)!.next}</button>; })()}
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
              {showDeclined && <div className="tgrow" style={{ marginTop: 12 }}>{declined.map((r) => <button key={r.id} className="fp" onClick={() => setDlg({ kind: 'view', row: r })}>{r.childName} · {grade(r.gradeSought)}</button>)}</div>}
            </section>
          )}
        </>
      )}
    </Page>
  );
}

function NewEnquiry({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const app = useApp();
  const grades = useGrades();
  const sources = useSetting<string[]>('admissions.sources', ['Walk-in']);
  const [f, setF] = useState({ childName: '', gradeSought: '', guardianName: '', phone: '', email: '', source: '', note: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const shake = useShake();
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErr((e) => ({ ...e, [k]: '', _: '' })); };
  const make = useMutation({
    mutationFn: () => app.api.admissions.create({ childName: f.childName.trim(), gradeSought: Number(f.gradeSought || grades[0]?.value || 1), guardianName: f.guardianName.trim(), phone: f.phone.trim(), email: f.email.trim(), source: f.source || sources[0] || 'Walk-in', note: f.note.trim() }),
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
          <SelectField label="Grade wanted" value={f.gradeSought || grades[0]?.value || ''} onChange={set('gradeSought')} options={grades} />
        </div>
        <Field label="Guardian’s name" value={f.guardianName} onChange={set('guardianName')} error={err.guardianName} maxLength={80} />
        <div className="two">
          <Field label="Phone" value={f.phone} onChange={set('phone')} error={err.phone} />
          <Field label="Email (optional)" type="email" value={f.email} onChange={set('email')} error={err.email} />
        </div>
        <SelectField label="How they found us" value={f.source || sources[0] || ''} onChange={set('source')} options={sources.map((s) => ({ value: s, label: s }))} />
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
  const grades = useGrades();
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
    <Dialog title={`Enrol ${row.childName}`} tag={{ text: grades.find((x) => x.value === String(row.gradeSought))?.label ?? `Grade ${row.gradeSought}`, tone: 'v' }} onClose={onClose} width={460} shake={shake.cls}>
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

function Details({ row, canWrite, back, onClose, onMove, onSaved }: { row: EnquiryRow; canWrite: boolean; back?: EnquiryStage; onClose: () => void; onMove: (s: EnquiryStage) => void; onSaved: () => void }) {
  const app = useApp();
  const grades = useGrades();
  const sources = useSetting<string[]>('admissions.sources', ['Walk-in']);
  const locked = row.stage === 'enrolled' || !canWrite;
  const [f, setF] = useState({ childName: row.childName, gradeSought: String(row.gradeSought), guardianName: row.guardianName, phone: row.phone, email: row.email ?? '', source: row.source, note: row.note });
  const [err, setErr] = useState<Record<string, string>>({});
  const shake = useShake();
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErr((e) => ({ ...e, [k]: '', _: '' })); };
  const was = { childName: row.childName, gradeSought: String(row.gradeSought), guardianName: row.guardianName, phone: row.phone, email: row.email ?? '', source: row.source, note: row.note };
  const dirty = (Object.keys(f) as (keyof typeof f)[]).some((k) => f[k].trim() !== was[k]);
  const save = useMutation({
    mutationFn: () => {
      const b: EnquiryPatch = {};
      if (f.childName.trim() !== was.childName) b.childName = f.childName.trim();
      if (f.gradeSought !== was.gradeSought) b.gradeSought = Number(f.gradeSought);
      if (f.guardianName.trim() !== was.guardianName) b.guardianName = f.guardianName.trim();
      if (f.phone.trim() !== was.phone) b.phone = f.phone.trim();
      if (f.email.trim() !== was.email) b.email = f.email.trim();
      if (f.source !== was.source) b.source = f.source;
      if (f.note.trim() !== was.note) b.note = f.note.trim();
      return app.api.admissions.patch(row.id, b);
    },
    onSuccess: onSaved, onError: (e) => { setErr(problem(e)); shake.hit(); },
  });
  const go = () => {
    const p: Record<string, string> = {};
    if (f.childName.trim().length < 2) p.childName = 'Enter the child’s name.';
    if (f.guardianName.trim().length < 2) p.guardianName = 'Enter the guardian’s name.';
    if (f.phone.trim().length < 8) p.phone = 'Enter a phone number.';
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) p.email = 'Enter a valid email or leave it empty.';
    setErr(p);
    if (Object.keys(p).length) shake.hit(); else save.mutate();
  };
  // A source the school has since removed stays choosable on the enquiry that has it.
  const sourceOptions = [...new Set([...sources, row.source])].map((s) => ({ value: s, label: sourceLabel(s) }));
  return (
    <Dialog title={row.childName} tag={{ text: label(row.stage), tone: row.stage === 'declined' ? 'a' : 'v' }} onClose={onClose} width={560} shake={shake.cls}>
      <div className="stack">
        {locked ? <>
          <div className="kv"><span>Grade</span><b>{grades.find((x) => x.value === f.gradeSought)?.label ?? `Grade ${f.gradeSought}`}</b></div>
          <div className="kv"><span>Guardian</span><b>{row.guardianName}</b></div>
          <div className="kv"><span>Phone</span><b>{row.phone || 'Not given'}</b></div>
          {row.email && <div className="kv"><span>Email</span><b>{row.email}</b></div>}
          <div className="kv"><span>Found us through</span><b>{sourceLabel(row.source)}</b></div>
          {row.testOn && <div className="kv"><span>Entrance test</span><b>{dateLabel(row.testOn)}</b></div>}
          {row.note && <div className="kv"><span>Note</span><b>{row.note}</b></div>}
          {row.stage === 'enrolled' && <div className="help">Enrolled: change their details on the Students page.</div>}
        </> : <>
          <div className="two">
            <Field label="Child’s name" value={f.childName} onChange={set('childName')} error={err.childName} maxLength={80} />
            <SelectField label="Grade wanted" value={f.gradeSought} onChange={set('gradeSought')} options={grades.some((g) => g.value === f.gradeSought) ? grades : [{ value: f.gradeSought, label: `Grade ${f.gradeSought}` }, ...grades]} />
          </div>
          <Field label="Guardian’s name" value={f.guardianName} onChange={set('guardianName')} error={err.guardianName} maxLength={80} />
          <div className="two">
            <Field label="Phone" value={f.phone} onChange={set('phone')} error={err.phone} />
            <Field label="Email (optional)" type="email" value={f.email} onChange={set('email')} error={err.email} />
          </div>
          <SelectField label="How they found us" value={f.source} onChange={set('source')} options={sourceOptions} />
          {row.testOn && <div className="kv"><span>Entrance test</span><b>{dateLabel(row.testOn)}</b></div>}
          <AreaField label="Note" value={f.note} onChange={set('note')} rows={3} maxLength={400} />
          {err._ && <div className="emsg" role="alert">{err._}</div>}
        </>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {!locked && (row.stage === 'declined' ? <button className="btn" onClick={() => onMove('enquiry')}>Reopen</button> : <button className="btn dng" onClick={() => onMove('declined')}>Decline</button>)}
          {!locked && back && <button className="btn" onClick={() => onMove(back)}>Back to {label(back).toLowerCase()}</button>}
        </span>
        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn" onClick={onClose}>{locked ? 'Close' : 'Cancel'}</button>
          {!locked && <button className="btn pri" disabled={!dirty || save.isPending} onClick={go}>{save.isPending ? 'Saving…' : 'Save'}</button>}
        </span>
      </div>
    </Dialog>
  );
}
