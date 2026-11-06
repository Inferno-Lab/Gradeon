import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HttpError } from '@gradeon/api-client';
import { inr, istToday, type ClassInfo, type StudentDetail } from '@gradeon/contracts';
import { Dialog, ErrorLine, Field, SelectField, useShake } from '@gradeon/web-ui';
import { useApp } from '../../app/context';

type Done = (message: string, openId?: string) => void;
const fieldsOf = (e: unknown): Record<string, string> => (e instanceof HttpError ? e.fields : {});
const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');

function Actions({ onClose, busy, label, danger }: { onClose: () => void; busy: boolean; label: string; danger?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
      <button type="button" className="btn" onClick={onClose}>Cancel</button>
      <button type="submit" className={`btn ${danger ? 'dngf' : 'pri'}`} disabled={busy}>{busy && <span className="spin" aria-hidden="true" />}{label}</button>
    </div>
  );
}

export function AddStudentDialog({ classes, defaultClass, onClose, onDone }: { classes: ClassInfo[]; defaultClass?: string; onClose: () => void; onDone: Done }) {
  const { api } = useApp();
  const shake = useShake();
  const [f, setF] = useState({ name: '', classId: defaultClass ?? classes[0]?.id ?? '', rollNo: '', dob: '', guardianName: '', guardianPhone: '', bloodGroup: '', address: '' });
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
      const s = await api.students.create({ ...f, rollNo: f.rollNo || undefined, bloodGroup: f.bloodGroup || undefined, address: f.address || undefined });
      onDone(`${s.name} was added to ${s.className}`, s.id);
    } catch (x) {
      setBusy(false); setErr(fieldsOf(x)); setGeneral(Object.keys(fieldsOf(x)).length ? '' : messageOf(x)); shake.hit();
    }
  };
  return (
    <Dialog title="Add a student" onClose={onClose} shake={shake.cls} width={520}>
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Full name" value={f.name} onChange={set('name')} error={err.name} autoComplete="off" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <SelectField label="Class" value={f.classId} onChange={set('classId')} options={classes.map((c) => ({ value: c.id, label: c.name }))} error={err.classId} />
          <Field label="Roll no. (optional)" value={f.rollNo} onChange={set('rollNo')} maxLength={10} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Date of birth" type="date" value={f.dob} onChange={set('dob')} error={err.dob} max={istToday()} />
          <Field label="Blood group (optional)" value={f.bloodGroup} onChange={set('bloodGroup')} maxLength={4} placeholder="B+" />
        </div>
        <Field label="Guardian" value={f.guardianName} onChange={set('guardianName')} error={err.guardianName} />
        <Field label="Guardian’s phone" value={f.guardianPhone} onChange={set('guardianPhone')} error={err.guardianPhone} type="tel" placeholder="+91 98220 11002" />
        <Field label="Address (optional)" value={f.address} onChange={set('address')} />
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
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number; errors: { line: number; message: string }[] } | null>(null);
  const file = useRef<HTMLInputElement>(null);
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
          <ul style={{ margin: '0 0 8px', paddingLeft: 18, font: '600 13.5px/1.7 var(--fb)', color: 'var(--ink2)', maxHeight: 180, overflow: 'auto' }}>
            {result.errors.slice(0, 20).map((x) => <li key={x.line}>Line {x.line}: {x.message}</li>)}
          </ul>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}><button className="btn pri" onClick={done}>Done</button></div>
      </Dialog>
    );
  }
  return (
    <Dialog title="Import students" onClose={onClose} shake={shake.cls} width={560}>
      <p>Use a CSV file with the columns <b>name, class, dob, guardian, phone</b> (and <b>roll</b> or <b>admission number</b> if you have them), or an export from your old system. Dates look like 2012-04-18 or 18/04/2012 and classes like 8 A. A student already here is updated, not added twice.</p>
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="fld">
          <label htmlFor="csv">Your sheet</label>
          <div className={`inp ${err ? 'err shake' : ''}`} style={{ height: 'auto', padding: 12, alignItems: 'stretch' }}>
            <textarea id="csv" value={csv} onChange={(e) => { setCsv(e.target.value); setErr(''); }} rows={7} placeholder={'name,class,dob,guardian,phone\nAarav Sharma,8 A,2012-04-18,Priya Sharma,+91 98220 11002'} style={{ width: '100%', resize: 'vertical', font: '600 13.5px/1.5 ui-monospace,Consolas,monospace' }} />
          </div>
          {err && <ErrorLine>{err}</ErrorLine>}
        </div>
        <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then((t) => { setCsv(t); setErr(''); }); }} />
        <div><button type="button" className="btn sm" onClick={() => file.current?.click()}>Choose a file</button></div>
        <Actions onClose={onClose} busy={busy} label="Import" />
      </form>
    </Dialog>
  );
}

export function MessageDialog({ ids, label, onClose, onDone }: { ids: string[]; label: string; onClose: () => void; onDone: Done }) {
  const { api } = useApp();
  const shake = useShake();
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState('sms');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (body.trim().length < 2) { setErr('Write the message.'); shake.hit(); return; }
    setBusy(true);
    try { const r = await api.students.message({ ids, body, channel: channel as 'sms' }); onDone(`Sent to ${r.sent} ${r.sent === 1 ? 'guardian' : 'guardians'}`); }
    catch (x) { setBusy(false); setErr(messageOf(x)); shake.hit(); }
  };
  return (
    <Dialog title="Message guardians" onClose={onClose} shake={shake.cls}>
      <p>To the primary guardian of {label}.</p>
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SelectField label="Send by" value={channel} onChange={setChannel} options={[{ value: 'sms', label: 'SMS' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'push', label: 'App notification' }]} />
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
  const [f, setF] = useState({ head: 'tuition', title: '', amount: '', dueOn: '' });
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
    try { const r = await api.students.assignFee({ ids, head: f.head as 'tuition', title: f.title, amount: Math.round(Number(f.amount)), dueOn: f.dueOn }); onDone(`${f.title} added for ${r.created} ${r.created === 1 ? 'student' : 'students'}`); }
    catch (x) { setBusy(false); setErr({ ...fieldsOf(x), title: fieldsOf(x).title ?? (Object.keys(fieldsOf(x)).length ? '' : messageOf(x)) }); shake.hit(); }
  };
  return (
    <Dialog title="Assign a fee" onClose={onClose} shake={shake.cls}>
      <p>For {label}. It appears in each family’s fees straight away.</p>
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SelectField label="Type" value={f.head} onChange={set('head')} options={[{ value: 'tuition', label: 'Tuition' }, { value: 'transport', label: 'Transport' }, { value: 'activities', label: 'Activities' }, { value: 'lab', label: 'Lab' }]} />
        <Field label="Name of the fee" value={f.title} onChange={set('title')} error={err.title} placeholder="Annual day costume" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Amount (₹)" value={f.amount} onChange={set('amount')} error={err.amount} inputMode="numeric" />
          <Field label="Due on" type="date" value={f.dueOn} onChange={set('dueOn')} error={err.dueOn} />
        </div>
        <Actions onClose={onClose} busy={busy} label="Assign fee" />
      </form>
    </Dialog>
  );
}

export function CollectFeeDialog({ student, onClose, onDone }: { student: StudentDetail; onClose: () => void; onDone: Done }) {
  const { api } = useApp();
  const shake = useShake();
  const inv = useQuery({ queryKey: ['invoices', student.id], queryFn: () => api.fees.invoices(student.id) });
  const open = (inv.data ?? []).filter((i) => i.paid < i.amount);
  const [pick, setPick] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [ref, setRef] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const chosen = open.find((i) => i.id === (pick || open[0]?.id));
  useEffect(() => { if (chosen) setAmount(String(chosen.amount - chosen.paid)); }, [chosen?.id]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen) return;
    const n = Math.round(Number(amount));
    if (!(n > 0)) { setErr({ amount: 'Enter an amount.' }); shake.hit(); return; }
    setBusy(true);
    try { const r = await api.fees.pay({ studentId: student.id, invoiceId: chosen.id, amount: n, method: method as 'cash', reference: ref || undefined }); onDone(`Receipt ${r.receiptNo} recorded for ₹${inr(n)}`); }
    catch (x) { setBusy(false); setErr({ amount: fieldsOf(x).amount ?? messageOf(x) }); shake.hit(); }
  };
  return (
    <Dialog title={`Collect a fee from ${student.name}`} onClose={onClose} shake={shake.cls}>
      {inv.isLoading ? <div className="skc" style={{ height: 120 }} /> : open.length === 0 ? (
        <>
          <p>Nothing is due for {student.name}. Every invoice is paid.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn pri" onClick={onClose}>Close</button></div>
        </>
      ) : (
        <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SelectField label="Invoice" value={chosen?.id ?? ''} onChange={setPick} options={open.map((i) => ({ value: i.id, label: `${i.title} · ₹${inr(i.amount - i.paid)} due ${i.dueOn.slice(5)}` }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Amount (₹)" value={amount} onChange={(v) => { setAmount(v); setErr({}); }} error={err.amount} inputMode="numeric" />
            <SelectField label="Paid by" value={method} onChange={setMethod} options={[{ value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' }, { value: 'netbanking', label: 'Net banking' }, { value: 'cheque', label: 'Cheque' }]} />
          </div>
          {method !== 'cash' && <Field label="Reference (optional)" value={ref} onChange={setRef} maxLength={60} />}
          <Actions onClose={onClose} busy={busy} label="Record payment" />
        </form>
      )}
    </Dialog>
  );
}
