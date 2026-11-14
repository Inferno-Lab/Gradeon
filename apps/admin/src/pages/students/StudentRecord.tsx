import { useState } from 'react';
import { GENDERS, istToday, type ClassInfo, type GuardianRow, type StudentDetail } from '@tangent/contracts';
import { Checkbox, DateField, Dialog, ErrorLine, Field, SelectField, useShake } from '@tangent/web-ui';
import { useApp } from '../../app/context';
import { AreaField, problem, useSetting } from '../../app/kit';

export type Rec = { gender: string; house: string; admissionNo: string; bloodGroup: string; address: string };
export const emptyRec: Rec = { gender: '', house: '', admissionNo: '', bloodGroup: '', address: '' };
const GENDER_LABEL: Record<string, string> = { female: 'Female', male: 'Male', other: 'Other' };

/**
 * The parts of a student's record beyond name, class and birth date. Which of them the school must fill is the console's
 * `students.required`; the rest say "optional". Houses are offered only when the school has them.
 */
export function RecordFields({ f, set, err, adding }: { f: Rec; set: (k: keyof Rec) => (v: string) => void; err: Record<string, string>; adding?: boolean }) {
  const need = useSetting<string[]>('students.required', []);
  const houses = useSetting<{ key: string; name: string }[]>('people.houses', []);
  const opt = (k: keyof Rec, label: string) => (need.includes(k) ? label : `${label} (optional)`);
  return (
    <>
      <div className="two">
        <SelectField label={opt('gender', 'Gender')} value={f.gender} onChange={set('gender')} error={err.gender} options={[{ value: '', label: 'Not given' }, ...GENDERS.map((g) => ({ value: g, label: GENDER_LABEL[g]! }))]} />
        {houses.length > 0 && <SelectField label={opt('house', 'House')} value={f.house} onChange={set('house')} error={err.house} options={[{ value: '', label: 'No house' }, ...houses.map((h) => ({ value: h.name, label: h.name }))]} />}
      </div>
      <div className="two">
        <Field label={adding && !need.includes('admissionNo') ? 'Admission number (blank: Tangent numbers it)' : opt('admissionNo', 'Admission number')} value={f.admissionNo} onChange={set('admissionNo')} error={err.admissionNo} maxLength={30} />
        <Field label={opt('bloodGroup', 'Blood group')} value={f.bloodGroup} onChange={set('bloodGroup')} error={err.bloodGroup} maxLength={4} placeholder="B+" />
      </div>
      <Field label={opt('address', 'Address')} value={f.address} onChange={set('address')} error={err.address} maxLength={200} />
    </>
  );
}

/** Edits a student's record; a new class keeps their marks and attendance. */
export function EditStudentDialog({ s, classes, onClose, onDone }: { s: StudentDetail; classes: ClassInfo[]; onClose: () => void; onDone: (m: string) => void }) {
  const { api } = useApp();
  const shake = useShake();
  const [f, setF] = useState({ name: s.name, classId: classes.find((c) => c.name === s.className)?.id ?? '', rollNo: s.rollNo, dob: s.dob, gender: s.gender ?? '', house: s.house ?? '', admissionNo: s.admissionNo, bloodGroup: s.bloodGroup ?? '', address: s.address ?? '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErr((e) => ({ ...e, [k]: '' })); };
  const save = async () => {
    if (f.name.trim().length < 2) { setErr({ name: 'Enter the full name.' }); shake.hit(); return; }
    setBusy(true);
    try {
      const next = await api.students.update(s.id, { ...f, gender: (f.gender || undefined) as StudentDetail['gender'] & string | undefined });
      onDone(next.className !== s.className ? `${next.name} moved to ${next.className}. Their marks and attendance stay with them.` : `${next.name}’s record was saved.`);
    } catch (e) { setBusy(false); setErr(problem(e)); shake.hit(); }
  };
  return (
    <Dialog title={`Edit ${s.name}`} onClose={onClose} width={560} shake={shake.cls}>
      <div className="stack">
        <Field label="Full name" value={f.name} onChange={set('name')} error={err.name} maxLength={80} />
        <div className="two">
          <SelectField label="Class" value={f.classId} onChange={set('classId')} error={err.classId} options={classes.map((c) => ({ value: c.id, label: c.name }))} />
          <Field label="Roll number" value={f.rollNo} onChange={set('rollNo')} error={err.rollNo} maxLength={10} />
        </div>
        <DateField label="Date of birth" value={f.dob} onChange={set('dob')} error={err.dob} max={istToday()} />
        <RecordFields f={f} set={set} err={err} />
        {err._ && <ErrorLine>{err._}</ErrorLine>}
        <div className="tgrow" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn pri" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </Dialog>
  );
}

type G = Omit<GuardianRow, 'hasApp'> & { key: string };

/** Every guardian of a student: who to contact first, and who may collect the child from school. */
export function GuardiansDialog({ s, onClose, onDone }: { s: StudentDetail; onClose: () => void; onDone: (m: string) => void }) {
  const { api } = useApp();
  const shake = useShake();
  const [list, setList] = useState<G[]>(s.guardians.map((g) => ({ ...g, key: g.id })));
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const upd = (i: number, p: Partial<G>) => { setList(list.map((g, j) => (j === i ? { ...g, ...p } : p.isPrimary ? { ...g, isPrimary: false } : g))); setErr({}); };
  const save = async () => {
    setBusy(true);
    try {
      await api.students.setGuardians(s.id, { guardians: list.map(({ key: _k, ...g }) => ({ ...g, id: g.id || undefined })) });
      onDone(`${s.name}’s guardians were saved.`);
    } catch (e) { setBusy(false); setErr(problem(e)); shake.hit(); }
  };
  return (
    <Dialog title={`Guardians of ${s.name}`} onClose={onClose} width={620} shake={shake.cls}>
      <div className="stack">
        <p className="help" style={{ margin: 0 }}>Each guardian signs in to the app with their own phone. A brother’s or sister’s guardian with the same phone is joined, not added twice.</p>
        {list.map((g, i) => (
          <div key={g.key} className="card" style={{ padding: 16, display: 'grid', gap: 10 }}>
            <div className="two">
              <Field label="Name" value={g.name} onChange={(name) => upd(i, { name })} maxLength={80} />
              <Field label="Relation" value={g.relation} onChange={(relation) => upd(i, { relation })} maxLength={30} placeholder="Mother" />
            </div>
            <div className="two">
              <Field label="Phone" type="tel" value={g.phone} onChange={(phone) => upd(i, { phone })} maxLength={20} hint={g.id ? 'Shown hidden; type a new number to change it.' : undefined} />
              <Field label="Email (optional)" type="email" value={g.email} onChange={(email) => upd(i, { email })} maxLength={120} />
            </div>
            <div className="tgrow">
              <Checkbox checked={g.isPrimary} onChange={(c) => c && upd(i, { isPrimary: true })} label="Contact first" />
              <Checkbox checked={g.canCollect} onChange={(canCollect) => upd(i, { canCollect })} label="May collect from school" />
              <span className="grow"></span>
              <button className="btn sm" disabled={list.length === 1} onClick={() => { const n = list.filter((_, j) => j !== i); if (g.isPrimary && n[0]) n[0] = { ...n[0], isPrimary: true }; setList(n); }}>Remove</button>
            </div>
          </div>
        ))}
        {list.length < 4 && <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setList([...list, { key: `new-${Date.now()}`, id: '', name: '', phone: '', email: '', relation: '', canCollect: true, isPrimary: false }])}>Add a guardian</button>}
        {Object.values(err)[0] && <ErrorLine>{Object.values(err)[0]}</ErrorLine>}
        <div className="tgrow" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn pri" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save guardians'}</button>
        </div>
      </div>
    </Dialog>
  );
}

/** Records that a student left: off the rolls and fee runs, records kept for the school's retention period, undone from Academic year. */
export function LeaveDialog({ s, onClose, onDone }: { s: StudentDetail; onClose: () => void; onDone: (m: string) => void }) {
  const { api } = useApp();
  const shake = useShake();
  const [f, setF] = useState({ leftOn: istToday(), reason: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (f.reason.trim().length < 2) { setErr({ reason: 'Say why, for the record.' }); shake.hit(); return; }
    setBusy(true);
    try { await api.year.leaver({ studentId: s.id, leftOn: f.leftOn, reason: f.reason.trim() }); onDone(`${s.name} is recorded as left. Academic year → Year-end can bring them back.`); }
    catch (e) { setBusy(false); setErr(problem(e)); shake.hit(); }
  };
  return (
    <Dialog title={`${s.name} is leaving`} onClose={onClose} width={480} shake={shake.cls}>
      <div className="stack">
        <DateField label="Last day" value={f.leftOn} onChange={(leftOn) => setF({ ...f, leftOn })} error={err.leftOn} />
        <AreaField label="Why" value={f.reason} onChange={(reason) => { setF({ ...f, reason }); setErr({}); }} error={err.reason} rows={3} maxLength={200} placeholder="Moved to another city" />
        {err._ && <ErrorLine>{err._}</ErrorLine>}
        <div className="tgrow" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn dng" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Record as left'}</button>
        </div>
      </div>
    </Dialog>
  );
}
