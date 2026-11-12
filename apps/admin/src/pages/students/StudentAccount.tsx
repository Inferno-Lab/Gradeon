import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StudentDetail } from '@gradeon/contracts';
import { Field } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { problem, stamp, useSchoolConfig } from '../../app/kit';

/**
 * A student's own app account, when Gradeon has the school use the app for students: signed in with the student's own phone or
 * email by a code, seeing only themselves. Shown in the student's drawer.
 */
export function StudentAccount({ s, say }: { s: StudentDetail; say: (m: string) => void }) {
  const app = useApp();
  const qc = useQueryClient();
  const cfg = useSchoolConfig();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ phone: '', email: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const send = useMutation({
    mutationFn: () => app.api.students.appAccount(s.id, { ...(f.phone.trim() ? { phone: f.phone.trim() } : {}), ...(f.email.trim() ? { email: f.email.trim() } : {}) }),
    onSuccess: () => { setOpen(false); setF({ phone: '', email: '' }); void qc.invalidateQueries({ queryKey: ['student', s.id] }); say(`${s.name.split(' ')[0]} is told how to sign in.`); },
    onError: (e) => setErr(problem(e)),
  });
  if (!cfg?.app.roles.includes('student')) return null;
  const a = s.appAccount;
  const canWrite = app.user.permissions.includes('students.write');
  return (
    <div style={{ marginTop: 16 }}>
      <h3>The student’s own app</h3>
      {a ? (
        <div className="kv"><span>Signs in with {[a.phone, a.email].filter(Boolean).join(' or ')}</span><b>{a.lastSignIn ? `Last in ${stamp(a.lastSignIn)}` : 'Not signed in yet'}</b></div>
      ) : <p className="help" style={{ margin: 0 }}>{s.name.split(' ')[0]} has no account of their own. Families still see everything from theirs.</p>}
      {canWrite && !open && <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>{a ? 'Change how they sign in' : 'Give them the app'}</button>}
      {open && (
        <div className="stack" style={{ marginTop: 8 }}>
          <div className="two">
            <Field label="Their own phone" value={f.phone} onChange={(phone) => { setF({ ...f, phone }); setErr({}); }} error={err.phone} maxLength={20} />
            <Field label="Or their email" type="email" value={f.email} onChange={(email) => { setF({ ...f, email }); setErr({}); }} error={err.email} maxLength={120} />
          </div>
          {err._ && <div className="emsg" role="alert">{err._}</div>}
          <div className="tgrow">
            <button className="btn" onClick={() => { setOpen(false); setErr({}); }}>Cancel</button>
            <button className="btn pri" disabled={send.isPending} onClick={() => { if (!f.phone.trim() && !f.email.trim()) setErr({ phone: 'Give the student’s own phone or email.' }); else send.mutate(); }}>{send.isPending ? 'Sending…' : 'Send the sign-in details'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
