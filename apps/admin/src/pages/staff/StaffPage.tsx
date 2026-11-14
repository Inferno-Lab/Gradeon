import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StaffRow } from '@tangent/contracts';
import { Dialog, Field, Segmented, Select, SelectField, useShake, EmptyState, EmptyNote } from '@tangent/web-ui';
import { useApp } from '../../app/context';
import { Card, Page, useToast } from '../../app/Page';
import { AddBtn, Avatar, Ico, problem, useSchoolConfig } from '../../app/kit';
import { ImportDialog } from '../students/StudentDialogs';

const refresh = (qc: ReturnType<typeof useQueryClient>) => void qc.invalidateQueries({ predicate: (q) => ['staff', 'dashboard', 'shell', 'roles', 'activation'].includes(String(q.queryKey[0])) });
const SEARCH = 'search';
type Show = 'all' | 'active' | 'waiting' | 'off';
/** Where a person stands: switched off, or active and signed in, invited, or not invited yet. */
const standing = (r: StaffRow) => r.status !== 'active' ? { label: 'Off', tone: 'n' } : r.access === 'signed_in' ? { label: 'Active', tone: 'g' } : r.access === 'invited' ? { label: 'Invited', tone: 'a' } : { label: 'Not invited', tone: 'a' };
const names = (list: string[]) => list.length > 3 ? `${list.slice(0, 3).join(', ')} and ${list.length - 3} more` : list.join(', ');

export function StaffPage() {
  const app = useApp();
  const qc = useQueryClient();
  const cfg = useSchoolConfig();
  const { toast, say } = useToast();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [editing, setEditing] = useState<StaffRow | 'new' | 'import' | null>(null);
  const list = useQuery({ queryKey: ['staff'], queryFn: () => app.api.staff.list() });
  const canWrite = app.user.permissions.includes('staff.write');
  // Periods a week come from the timetable, so the column is there only when the school has it.
  const periods = !!cfg?.modules.includes('timetable');
  const all = list.data ?? [];
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((r) => (!role || r.roles.some((x) => x.id === role))
      && (show === 'all' || (show === 'off' ? r.status !== 'active' : r.status === 'active' && (show === 'active' || r.access !== 'signed_in')))
      && (!t || [r.name, r.email ?? '', r.designation, r.department ?? '', ...r.subjects.map((s) => s.name), ...r.roles.map((x) => x.name)].some((x) => x.toLowerCase().includes(t))));
  }, [all, q, role, show]);
  const roles = [...new Map(all.flatMap((r) => r.roles).map((r) => [r.id, r.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const waiting = all.filter((r) => r.status === 'active' && r.access !== 'signed_in');
  const notInvited = waiting.filter((r) => r.access === 'none').length;
  const invite = useMutation({
    mutationFn: (remind: boolean) => app.api.movingIn.inviteStaff(remind),
    onSuccess: (r, remind) => {
      refresh(qc);
      const sent = r.sent ? `${remind ? 'Sent a new first password to' : 'Invited'} ${r.sent} ${r.sent === 1 ? 'person' : 'people'}.` : remind ? 'Everyone invited has signed in.' : 'Everyone has been invited.';
      say(r.skipped.length ? `${sent} ${names(r.skipped)} ${r.skipped.length === 1 ? 'has' : 'have'} no email or phone: add one, then invite again.` : sent, r.skipped.length ? 'bad' : undefined);
    },
    onError: (e) => say(Object.values(problem(e))[0] ?? 'Something went wrong.', 'bad'),
  });
  const download = async () => {
    try {
      const csv = await app.api.staff.exportCsv();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
      a.download = 'staff.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { say((e as Error).message, 'bad'); }
  };
  const cols = `minmax(0,1.7fr) minmax(0,1.3fr) 160px ${periods ? '120px ' : ''}110px`;
  return (
    <Page title="Staff" sub={all.length ? `${all.filter((s) => s.status === 'active').length} active · ${all.length} in all` : 'Teachers and office staff'} toast={toast} loading={list.isLoading && !list.data}
      error={list.isError && !list.data ? { message: (list.error as Error).message, retry: () => void list.refetch() } : null}
      actions={<>
        {canWrite && <button className="btn" onClick={() => setEditing('import')}>Import</button>}
        {all.length > 0 && <button className="btn" onClick={() => void download()}>Export</button>}
        {canWrite && <AddBtn onClick={() => setEditing('new')}>Add staff</AddBtn>}
      </>}
      overlays={<>
        {editing === 'import' && <ImportDialog kind="staff" onClose={() => setEditing(null)} onDone={(msg) => { setEditing(null); refresh(qc); if (msg) say(msg); }} />}
        {editing && editing !== 'import' && <StaffDialog person={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={(msg) => { setEditing(null); refresh(qc); say(msg); }} />}
      </>}>
      {all.length === 0 ? (
        <div><EmptyState scene="staff" onAction={canWrite ? () => setEditing('new') : undefined} onLink={canWrite ? () => setEditing('import') : undefined} /></div>
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          {canWrite && waiting.length > 0 && (
            <Card title="Not signed in yet" chip={<span className="chip a">{waiting.length}</span>}>
              <p className="help" style={{ marginTop: 0 }}>{notInvited ? `${notInvited} ${notInvited === 1 ? 'person has' : 'people have'} not been invited. ` : ''}{waiting.length - notInvited ? `${waiting.length - notInvited} invited ${waiting.length - notInvited === 1 ? 'has' : 'have'} not signed in. ` : ''}An invite carries a first password by email (or text, without an email); they choose their own after signing in.</p>
              <div className="tgrow">
                {notInvited > 0 && <button className="btn pri" disabled={invite.isPending} onClick={() => invite.mutate(false)}>Invite {notInvited === 1 ? 'them' : `all ${notInvited}`}</button>}
                {waiting.length > notInvited && <button className="btn" disabled={invite.isPending} onClick={() => invite.mutate(true)}>Remind those invited</button>}
                <button className="btn" onClick={() => setShow('waiting')}>Show who</button>
              </div>
            </Card>
          )}
          <section className="card tbl rise" style={{ padding: 0 }}>
            <div className="ch" style={{ padding: '24px 24px 16px', flexWrap: 'wrap', gap: 10 }}>
              <h2>Everyone</h2>
              <span className="grow"></span>
              <Segmented label="Show" value={show} onChange={setShow} options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'waiting', label: 'Not signed in', count: waiting.length }, { value: 'off', label: 'Off' }]} />
              {roles.length > 1 && <Select compact aria-label="Role" value={role} onChange={setRole} options={[{ value: '', label: 'Every role' }, ...roles.map(([id, name]) => ({ value: id, label: name }))]} />}
              <div className="srch" style={{ minWidth: 220, height: 38 }}><Ico d={SEARCH} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, subject or role" aria-label="Search staff" style={{ border: 0, outline: 0, background: 'none', font: '600 13px var(--fb)', color: 'var(--ink)', flex: 1, minWidth: 0 }} /></div>
            </div>
            {rows.length === 0 ? <div style={{ padding: '0 24px 24px' }}><EmptyNote icon={q ? 'search' : 'people'} title={q ? `No one matches “${q}”` : 'No one here'} body={q ? 'Search by name, subject or phone.' : 'People in this group show here once they are added.'} /></div> : (
              <div className="scroll-x lscroll" data-fill="">
                <div className="stfw" style={{ minWidth: periods ? 780 : 660 }}>
                  <div className="grd th stf" style={{ '--cols': cols } as React.CSSProperties}><span>Person</span><span className="hs">Teaches</span><span>Role</span>{periods && <span className="hs">Periods a week</span>}<span className="hs">Status</span></div>
                  {rows.map((r) => {
                    const st = standing(r);
                    return (
                      <button className="rowbtn" key={r.id} onClick={() => setEditing(r)} aria-label={`Open ${r.name}`}>
                        <div className="grd rw stf" style={{ '--cols': cols } as React.CSSProperties}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                            <Avatar name={r.name} />
                            <span style={{ minWidth: 0 }}><b data-tip={r.name} style={{ font: '700 14px var(--fb)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.name}</b><small style={{ color: 'var(--ink3)', font: '600 12px var(--fb)' }}>{r.designation}{r.department ? ` · ${r.department}` : ''}</small></span>
                          </span>
                          <span className="tgrow hs" style={{ gap: 6 }}>{r.subjects.length ? r.subjects.map((s) => <span className="chip" key={s.id}>{s.name}</span>) : <span style={{ color: 'var(--ink3)', font: '600 13px var(--fb)' }}>–</span>}</span>
                          <span className="tgrow" style={{ gap: 6 }}>{r.roles.length ? r.roles.map((x) => <span className="chip v" key={x.id}>{x.name}</span>) : <span className="chip">No role</span>}</span>
                          {periods && <span className="us hs" style={{ gap: 4 }}><div className="bar" style={{ height: 12 }}><i style={{ width: `${Math.min(100, Math.round((r.periodsPerWeek / Math.max(1, r.maxPeriods)) * 100))}%` }}></i></div><small style={{ font: '700 11px var(--fb)', color: 'var(--ink3)' }}>{r.periodsPerWeek} of {r.maxPeriods}</small></span>}
                          <span className={`st hs ${st.tone}`}><i></i>{st.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </Page>
  );
}

function StaffDialog({ person, onClose, onDone }: { person: StaffRow | null; onClose: () => void; onDone: (msg: string) => void }) {
  const app = useApp();
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: app.api.subjects, staleTime: 10 * 60_000 });
  const roles = useQuery({ queryKey: ['roles'], queryFn: app.api.roles.list, staleTime: 60_000 });
  const me = person?.id === app.user.id;
  const [f, setF] = useState({ name: person?.name ?? '', email: person?.email ?? '', phone: person?.phone ?? '', designation: person?.designation ?? 'Teacher', department: person?.department ?? '', roleId: person?.roles[0]?.id ?? '' });
  // A new person starts as a teacher where the school has that role, else in the first one.
  const roleId = f.roleId || (roles.data?.find((r) => r.key === 'teacher') ?? roles.data?.[0])?.id || '';
  const [subs, setSubs] = useState<string[]>(person?.subjects.map((s) => s.id) ?? []);
  const [err, setErr] = useState<Record<string, string>>({});
  const shake = useShake();
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErr((e) => ({ ...e, [k]: '', _: '' })); };
  const fail = (e: unknown) => { setErr(problem(e)); shake.hit(); };
  const save = useMutation({
    mutationFn: () => {
      if (!person) return app.api.staff.create({ name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), designation: f.designation.trim() || 'Teacher', department: f.department.trim() || undefined, subjectIds: subs, roleId });
      // Only what changed: a person with two roles keeps both unless the role is changed here.
      const changed = <T,>(now: T, was: T) => (now !== was ? now : undefined);
      return app.api.staff.patch(person.id, {
        name: changed(f.name.trim(), person.name), email: changed(f.email.trim().toLowerCase(), person.email ?? ''), phone: changed(f.phone.trim(), person.phone ?? ''),
        designation: f.designation.trim(), department: f.department.trim() || null, subjectIds: subs, ...(me || roleId === person.roles[0]?.id ? {} : { roleId }),
      });
    },
    onSuccess: (r) => onDone(person ? `${r.name} was updated.` : `${r.name} was added. Invite sent to ${r.email}.`),
    onError: fail,
  });
  const toggle = useMutation({
    mutationFn: () => app.api.staff.patch(person!.id, { status: person!.status === 'active' ? 'inactive' : 'active' }),
    onSuccess: (r) => onDone(r.status === 'active' ? `${r.name} can sign in again.` : `${r.name} was switched off and signed out.`),
    onError: fail,
  });
  const resend = useMutation({ mutationFn: () => app.api.staff.invite(person!.id), onSuccess: (r) => onDone(`Invite sent to ${r.to}.`), onError: fail });
  const go = () => {
    const p: Record<string, string> = {};
    if (f.name.trim().length < 2) p.name = 'Enter the name.';
    if ((!person || f.email.trim()) && !/^\S+@\S+\.\S+$/.test(f.email.trim())) p.email = 'Enter a valid email.';
    if ((!person || f.phone.trim()) && f.phone.trim().length < 8) p.phone = 'Enter a phone number.';
    if (f.designation.trim().length < 2) p.designation = 'Enter what they do, like Teacher.';
    setErr(p);
    if (Object.keys(p).length) shake.hit(); else save.mutate();
  };
  const st = person && standing(person);
  return (
    <Dialog title={person ? person.name : 'Add staff'} tag={st ? { text: st.label, tone: st.tone === 'g' ? 'g' : 'a' } : undefined} onClose={onClose} width={580} shake={shake.cls}>
      <div className="stack">
        <Field label="Full name" value={f.name} onChange={set('name')} error={err.name} maxLength={80} />
        <div className="two">
          <Field label="Email" type="email" value={f.email} onChange={set('email')} error={err.email} hint="They sign in with this." />
          <Field label="Phone" value={f.phone} onChange={set('phone')} error={err.phone} />
        </div>
        <div className="two">
          <Field label="Designation" value={f.designation} onChange={set('designation')} error={err.designation} maxLength={60} />
          <Field label="Department (optional)" value={f.department} onChange={set('department')} maxLength={60} />
        </div>
        <SelectField label="Role" value={roleId} onChange={set('roleId')} disabled={me} error={err.roleId} options={(roles.data ?? []).map((r) => ({ value: r.id, label: r.name }))} />
        {me && <div className="help">You cannot change your own role. Ask another administrator.</div>}
        {person && person.roles.length > 1 && !me && <div className="help">Also: {person.roles.slice(1).map((r) => r.name).join(', ')}. Choosing a role here replaces them all.</div>}
        <div className="fld">
          <label>Teaches</label>
          <div className="tgrow">
            {(subjects.data ?? []).map((s) => {
              const on = subs.includes(s.id);
              return <button type="button" key={s.id} className={`fp ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setSubs(on ? subs.filter((x) => x !== s.id) : [...subs, s.id])}>{s.name}</button>;
            })}
          </div>
        </div>
        {person && person.status === 'active' && person.access !== 'signed_in' && !me && (
          <div className="help" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: '1 1 240px' }}>{person.access === 'invited' ? 'Invited, not signed in yet. A new invite replaces the first password.' : 'Not invited yet.'}</span>
            <button className="btn sm" disabled={resend.isPending} onClick={() => resend.mutate()}>{person.access === 'invited' ? 'Send a new invite' : 'Send the invite'}</button>
          </div>
        )}
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
