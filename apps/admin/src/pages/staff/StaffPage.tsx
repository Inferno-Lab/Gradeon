import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StaffRow } from '@gradeon/contracts';
import { Dialog, EmptyCard, Field, SelectField, useShake } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { Page, useToast } from '../../app/Page';
import { AddBtn, Avatar, Ico, problem } from '../../app/kit';

const refresh = (qc: ReturnType<typeof useQueryClient>) => void qc.invalidateQueries({ predicate: (q) => ['staff', 'dashboard', 'shell', 'roles'].includes(String(q.queryKey[0])) });
const SEARCH = 'M4.5 11a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0M20 20l-4.2-4.2';

export function StaffPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<StaffRow | 'new' | null>(null);
  const list = useQuery({ queryKey: ['staff'], queryFn: () => app.api.staff.list() });
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (list.data ?? []).filter((r) => !t || [r.name, r.designation, r.department ?? '', ...r.subjects.map((s) => s.name), ...r.roles.map((x) => x.name)].some((x) => x.toLowerCase().includes(t)));
  }, [list.data, q]);
  const canWrite = app.user.permissions.includes('staff.write');
  const all = list.data ?? [];
  return (
    <Page title="Staff" sub={all.length ? `${all.filter((s) => s.status === 'active').length} active · ${all.length} in all` : 'Teachers and office staff'} toast={toast} loading={list.isLoading && !list.data}
      error={list.isError && !list.data ? { message: (list.error as Error).message, retry: () => void list.refetch() } : null}
      actions={canWrite ? <AddBtn onClick={() => setEditing('new')}>Add staff</AddBtn> : undefined}
      overlays={editing && <StaffDialog person={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={(msg) => { setEditing(null); refresh(qc); say(msg); }} />}>
      {all.length === 0 ? (
        <div><EmptyCard title="Staff" chip={{ text: '0 people', tone: 'v' }} scene="register" heading="Nobody has been added yet" body="Add teachers and office staff. Each gets an invite to sign in, and a role that decides what they can do." actions={canWrite ? <AddBtn onClick={() => setEditing('new')}>Add staff</AddBtn> : undefined} /></div>
      ) : (
        <section className="card tbl rise" style={{ padding: 0 }}>
          <div className="ch" style={{ padding: '24px 24px 16px' }}>
            <h2>Everyone</h2>
            <div className="srch" style={{ minWidth: 260, height: 38 }}><Ico d={SEARCH} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, subject or role" aria-label="Search staff" style={{ border: 0, outline: 0, background: 'none', font: '600 13px var(--fb)', color: 'var(--ink)', flex: 1, minWidth: 0 }} /></div>
          </div>
          {rows.length === 0 ? <div className="help" style={{ padding: '0 24px 24px' }}>No one matches “{q}”.</div> : (
            <div className="scroll-x lscroll" data-fill="">
              <div className="stfw" style={{ minWidth: 760 }}>
                <div className="grd th stf" style={{ '--cols': 'minmax(0,1.7fr) minmax(0,1.3fr) 140px 120px 90px' } as React.CSSProperties}><span>Person</span><span className="hs">Teaches</span><span>Role</span><span className="hs">Periods a week</span><span className="hs">Status</span></div>
                {rows.map((r) => (
                  <button className="rowbtn" key={r.id} onClick={() => setEditing(r)} aria-label={`Open ${r.name}`}>
                    <div className="grd rw stf" style={{ '--cols': 'minmax(0,1.7fr) minmax(0,1.3fr) 140px 120px 90px' } as React.CSSProperties}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <Avatar name={r.name} />
                        <span style={{ minWidth: 0 }}><b data-tip={r.name} style={{ font: '700 14px var(--fb)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.name}</b><small style={{ color: 'var(--ink3)', font: '600 12px var(--fb)' }}>{r.designation}{r.department ? ` · ${r.department}` : ''}</small></span>
                      </span>
                      <span className="tgrow hs" style={{ gap: 6 }}>{r.subjects.length ? r.subjects.map((s) => <span className="chip" key={s.id}>{s.name}</span>) : <span style={{ color: 'var(--ink3)', font: '600 13px var(--fb)' }}>–</span>}</span>
                      <span className="chip v">{r.roles[0]?.name ?? 'No role'}</span>
                      <span className="us hs" style={{ gap: 4 }}><div className="bar" style={{ height: 12 }}><i style={{ width: `${Math.min(100, Math.round((r.periodsPerWeek / r.maxPeriods) * 100))}%` }}></i></div><small style={{ font: '700 11px var(--fb)', color: 'var(--ink3)' }}>{r.periodsPerWeek} of {r.maxPeriods}</small></span>
                      <span className={`st hs ${r.status === 'active' ? 'g' : 'n'}`}><i></i>{r.status === 'active' ? 'Active' : 'Off'}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </Page>
  );
}

function StaffDialog({ person, onClose, onDone }: { person: StaffRow | null; onClose: () => void; onDone: (msg: string) => void }) {
  const app = useApp();
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: app.api.subjects, staleTime: 10 * 60_000 });
  const roles = useQuery({ queryKey: ['roles'], queryFn: app.api.roles.list, staleTime: 60_000 });
  const me = person?.id === app.user.id;
  const [f, setF] = useState({ name: person?.name ?? '', email: person?.email ?? '', phone: person?.phone ?? '', designation: person?.designation ?? 'Teacher', department: person?.department ?? '', roleId: person?.roles[0]?.id ?? 'role_teacher' });
  const [subs, setSubs] = useState<string[]>(person?.subjects.map((s) => s.id) ?? []);
  const [err, setErr] = useState<Record<string, string>>({});
  const shake = useShake();
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErr((e) => ({ ...e, [k]: '', _: '' })); };
  const save = useMutation({
    mutationFn: () => person
      ? app.api.staff.patch(person.id, { designation: f.designation.trim(), department: f.department.trim() || null, subjectIds: subs, ...(me ? {} : { roleId: f.roleId }) })
      : app.api.staff.create({ name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), designation: f.designation.trim() || 'Teacher', department: f.department.trim() || undefined, subjectIds: subs, roleId: f.roleId }),
    onSuccess: (r) => onDone(person ? `${r.name} was updated.` : `${r.name} was added. Their invite is in the test inbox.`),
    onError: (e) => { setErr(problem(e)); shake.hit(); },
  });
  const toggle = useMutation({
    mutationFn: () => app.api.staff.patch(person!.id, { status: person!.status === 'active' ? 'inactive' : 'active' }),
    onSuccess: (r) => onDone(r.status === 'active' ? `${r.name} can sign in again.` : `${r.name} was switched off and signed out.`),
    onError: (e) => { setErr(problem(e)); shake.hit(); },
  });
  const go = () => {
    const p: Record<string, string> = {};
    if (!person) {
      if (f.name.trim().length < 2) p.name = 'Enter the name.';
      if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) p.email = 'Enter a valid email.';
      if (f.phone.trim().length < 8) p.phone = 'Enter a phone number.';
    }
    if (f.designation.trim().length < 2) p.designation = 'Enter what they do, like Teacher.';
    setErr(p);
    if (Object.keys(p).length) shake.hit(); else save.mutate();
  };
  return (
    <Dialog title={person ? person.name : 'Add staff'} tag={person ? { text: person.status === 'active' ? 'Active' : 'Switched off', tone: person.status === 'active' ? 'g' : 'a' } : undefined} onClose={onClose} width={580} shake={shake.cls}>
      <div className="stack">
        {!person && <>
          <Field label="Full name" value={f.name} onChange={set('name')} error={err.name} maxLength={80} />
          <div className="two">
            <Field label="Email" type="email" value={f.email} onChange={set('email')} error={err.email} hint="They sign in with this." />
            <Field label="Phone" value={f.phone} onChange={set('phone')} error={err.phone} />
          </div>
        </>}
        {person && <div className="help">{person.email} · {person.phone}</div>}
        <div className="two">
          <Field label="Designation" value={f.designation} onChange={set('designation')} error={err.designation} maxLength={60} />
          <Field label="Department (optional)" value={f.department} onChange={set('department')} maxLength={60} />
        </div>
        <SelectField label="Role" value={f.roleId} onChange={set('roleId')} disabled={me} error={err.roleId} options={(roles.data ?? []).map((r) => ({ value: r.id, label: r.name }))} />
        {me && <div className="help">You cannot change your own role. Ask another administrator.</div>}
        <div className="fld">
          <label>Teaches</label>
          <div className="tgrow">
            {(subjects.data ?? []).map((s) => {
              const on = subs.includes(s.id);
              return <button type="button" key={s.id} className={`fp ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setSubs(on ? subs.filter((x) => x !== s.id) : [...subs, s.id])}>{s.name}</button>;
            })}
          </div>
        </div>
        {err._ && <div className="emsg" role="alert">{err._}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        {person && !me ? <button className={`btn ${person.status === 'active' ? 'dng' : ''}`} disabled={toggle.isPending} onClick={() => toggle.mutate()}>{person.status === 'active' ? 'Switch off' : 'Switch on'}</button> : <span />}
        <span style={{ display: 'flex', gap: 10 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn pri" disabled={save.isPending} onClick={go}>{save.isPending ? 'Saving…' : person ? 'Save' : 'Add and send invite'}</button>
        </span>
      </div>
    </Dialog>
  );
}
