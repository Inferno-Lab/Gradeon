import { useEffect, useState } from 'react';
import { istToday, type ClassInfo } from '@gradeon/contracts';
import { DateField, Dialog, ErrorLine, Field, FilePick, SelectField, useShake } from '@gradeon/web-ui';
import { DialogActions as Actions, fieldsOf, messageOf, useFeeHeads } from '../../app/kit';
import { useApp } from '../../app/context';
import { RecordFields, emptyRec } from './StudentRecord';

type Done = (message: string, openId?: string) => void;

export function AddStudentDialog({ classes, defaultClass, onClose, onDone }: { classes: ClassInfo[]; defaultClass?: string; onClose: () => void; onDone: Done }) {
  const { api } = useApp();
  const shake = useShake();
  const [f, setF] = useState({ name: '', classId: defaultClass ?? classes[0]?.id ?? '', rollNo: '', dob: '', guardianName: '', guardianPhone: '', ...emptyRec });
  // Opened before the classes arrived: take the first one when they do, as if it had been there.
  useEffect(() => { if (classes[0]) setF((s) => (s.classId ? s : { ...s, classId: classes[0]!.id })); }, [classes]);
  const [err, setErr] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => { setF((s) => ({ ...s, [k]: v })); setErr((e) => ({ ...e, [k]: '' })); };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (f.name.trim().length < 2) local.name = 'Enter the full name.';
    if (!f.classId) local.classId = 'Choose a class.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.dob)) local.dob = 'Choose the date of birth.';
    if (f.guardianName.trim().length < 2) local.guardianName = 'Enter the guardian’s name.';
    if (f.guardianPhone.trim().length < 8) local.guardianPhone = 'Enter a phone number.';
    if (Object.keys(local).length) { setErr(local); shake.hit(); return; }
    setBusy(true);
    try {
      const s = await api.students.create({ ...f, rollNo: f.rollNo || undefined, bloodGroup: f.bloodGroup || undefined, address: f.address || undefined, gender: (f.gender || undefined) as 'female' | undefined, house: f.house || undefined, admissionNo: f.admissionNo || undefined });
      onDone(`${s.name} was added to ${s.className}`, s.id);
    } catch (x) {
      setBusy(false); setErr(fieldsOf(x)); setGeneral(Object.keys(fieldsOf(x)).length ? '' : messageOf(x)); shake.hit();
    }
  };
  return (
    <Dialog title="Add a student" onClose={onClose} shake={shake.cls} width={520}>
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Full name" value={f.name} onChange={set('name')} error={err.name} autoComplete="off" />
        <div className="two">
          <SelectField label="Class" value={f.classId} onChange={set('classId')} options={classes.map((c) => ({ value: c.id, label: c.name }))} error={err.classId} />
          <Field label="Roll no. (optional)" value={f.rollNo} onChange={set('rollNo')} maxLength={10} />
        </div>
        <div className="two">
          <DateField label="Date of birth" value={f.dob} onChange={set('dob')} error={err.dob} max={istToday()} />
        </div>
        <RecordFields f={f} set={set} err={err} adding />
        <Field label="Guardian" value={f.guardianName} onChange={set('guardianName')} error={err.guardianName} />
        <Field label="Guardian’s phone" value={f.guardianPhone} onChange={set('guardianPhone')} error={err.guardianPhone} type="tel" hint="They sign in to the app with it. More guardians can be added on the student’s record." />
        {general && <ErrorLine>{general}</ErrorLine>}
        <Actions onClose={onClose} busy={busy} label="Add student" />
      </form>
    </Dialog>
  );
}

export function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: Done }) {
  const { api } = useApp();
  const shake = useShake();
  const [csv, setCsv] = useState('');
  const [file, setFile] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number; errors: { line: number; message: string }[] } | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (csv.trim().length < 10) { setErr('Paste your sheet here, or choose a file.'); shake.hit(); return; }
    setBusy(true);
    try { setResult(await api.students.import(csv)); setBusy(false); } catch (x) { setBusy(false); setErr(messageOf(x)); shake.hit(); }
  };
  if (result) {
    const done = () => onDone(result.created || result.updated ? `Imported ${result.created + result.updated} students` : '');
    return (
      <Dialog title={result.created ? `${result.created} ${result.created === 1 ? 'student was' : 'students were'} added` : result.updated ? `${result.updated} ${result.updated === 1 ? 'student was' : 'students were'} updated` : 'No one was added'} onClose={done} width={520}>
        <p>{result.created && result.updated ? `${result.updated} already here ${result.updated === 1 ? 'was' : 'were'} updated. ` : ''}{result.skipped ? `${result.skipped} ${result.skipped === 1 ? 'line was' : 'lines were'} skipped. Fix them and import again.` : 'Every line was imported.'}</p>
        {result.errors.length > 0 && (
          <ul style={{ margin: '0 0 8px', paddingLeft: 20, font: '600 13px/1.7 var(--fb)', color: 'var(--ink2)', maxHeight: 180, overflow: 'auto' }}>
            {result.errors.slice(0, 20).map((x) => <li key={x.line}>Line {x.line}: {x.message}</li>)}
          </ul>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}><button className="btn pri" onClick={done}>Done</button></div>
      </Dialog>
    );
  }
  return (
    <Dialog title="Import students" onClose={onClose} shake={shake.cls} width={560}>
      <p>Choose an Excel sheet (.xlsx) or a CSV with the columns <b>name, class, dob, guardian, phone</b> (and <b>roll</b> or <b>admission number</b> if you have them), or an export from your old system. Start from the template if you have nothing yet. A student already here is updated, not added twice.</p>
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="fld">
          <label htmlFor="csv">Your sheet</label>
          <div className={`inp ${err ? 'err shake' : ''}`} style={{ height: 'auto', padding: 12, alignItems: 'stretch' }}>
            <textarea id="csv" value={file ? `${file} is ready to import.` : csv} readOnly={!!file} onChange={(e) => { setCsv(e.target.value); setErr(''); }} rows={7} placeholder={'name,class,dob,guardian,phone\nSam Taylor,8 A,2012-04-18,Alex Taylor,+44 7700 900123'} style={{ width: '100%', resize: 'vertical', font: '600 13px/1.5 ui-monospace,Consolas,monospace' }} />
          </div>
          {err && <ErrorLine>{err}</ErrorLine>}
        </div>
        <div className="tgrow">
          <FilePick className="btn sm" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onPick={(f) => {
            // An .xlsx goes as the file itself (the import engine reads it); a CSV as its text, so it shows here to check.
            if (/\.xlsx$/i.test(f.name)) { const r = new FileReader(); r.onload = () => { setCsv(String(r.result)); setFile(f.name); setErr(''); }; r.readAsDataURL(f); }
            else void f.text().then((t) => { setCsv(t); setFile(''); setErr(''); });
          }}>Choose a file</FilePick>
          <button type="button" className="btn sm" onClick={() => void api.students.template().then((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'students-template.xlsx'; a.click(); URL.revokeObjectURL(a.href); })}>Download the template</button>
          {file && <span className="chip v">{file}</span>}
        </div>
        <Actions onClose={onClose} busy={busy} label="Import" />
      </form>
    </Dialog>
  );
}

export function MessageDialog({ ids, label, onClose, onDone }: { ids: string[]; label: string; onClose: () => void; onDone: Done }) {
  const { api } = useApp();
  const shake = useShake();
  const [body, setBody] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (body.trim().length < 2) { setErr('Write the message.'); shake.hit(); return; }
    setBusy(true);
    try { const r = await api.students.message({ ids, body }); onDone(`Sent to ${r.sent} ${r.sent === 1 ? 'guardian' : 'guardians'}`); }
    catch (x) { setBusy(false); setErr(messageOf(x)); shake.hit(); }
  };
  return (
    <Dialog title="Message guardians" onClose={onClose} shake={shake.cls}>
      <p>To the primary guardian of {label}.</p>
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="help" style={{ marginTop: 0 }}>It reaches them the way Gradeon set for your school’s messages (the app, a text, WhatsApp or email).</div>
        <div className="fld">
          <label htmlFor="msg">Message</label>
          <div className={`inp ${err ? 'err shake' : ''}`} style={{ height: 'auto', padding: 12, alignItems: 'stretch' }}>
            <textarea id="msg" value={body} maxLength={500} rows={4} onChange={(e) => { setBody(e.target.value); setErr(''); }} style={{ width: '100%', resize: 'vertical', font: '600 15px/1.5 var(--fb)' }} />
          </div>
          {err ? <ErrorLine>{err}</ErrorLine> : <div className="help">{500 - body.length} characters left</div>}
        </div>
        <Actions onClose={onClose} busy={busy} label="Send" />
      </form>
    </Dialog>
  );
}

export function AssignFeeDialog({ ids, label, onClose, onDone }: { ids: string[]; label: string; onClose: () => void; onDone: Done }) {
  const { api } = useApp();
  const shake = useShake();
  const heads = useFeeHeads();
  const [f, setF] = useState({ head: '', title: '', amount: '', dueOn: '' });
  const head = f.head || heads[0]?.value || '';
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => { setF((s) => ({ ...s, [k]: v })); setErr((e) => ({ ...e, [k]: '' })); };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (f.title.trim().length < 3) local.title = 'Name the fee.';
    if (!(Number(f.amount) > 0)) local.amount = 'Enter an amount.';
    if (!f.dueOn) local.dueOn = 'Choose the due date.';
    if (Object.keys(local).length) { setErr(local); shake.hit(); return; }
    setBusy(true);
    try { const r = await api.students.assignFee({ ids, head, title: f.title, amount: Math.round(Number(f.amount)), dueOn: f.dueOn }); onDone(`${f.title} added for ${r.created} ${r.created === 1 ? 'student' : 'students'}`); }
    catch (x) { setBusy(false); setErr({ ...fieldsOf(x), title: fieldsOf(x).title ?? (Object.keys(fieldsOf(x)).length ? '' : messageOf(x)) }); shake.hit(); }
  };
  return (
    <Dialog title="Assign a fee" onClose={onClose} shake={shake.cls}>
      <p>For {label}. It appears in each family’s fees straight away.</p>
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SelectField label="Kind of fee" value={head} onChange={set('head')} options={heads} />
        <Field label="Name of the fee" value={f.title} onChange={set('title')} error={err.title} placeholder="Annual day costume" />
        <div className="two">
          <Field label="Amount (₹)" value={f.amount} onChange={set('amount')} error={err.amount} inputMode="numeric" />
          <DateField label="Due on" value={f.dueOn} onChange={set('dueOn')} error={err.dueOn} />
        </div>
        <Actions onClose={onClose} busy={busy} label="Assign fee" />
      </form>
    </Dialog>
  );
}


