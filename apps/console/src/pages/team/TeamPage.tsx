import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HttpError } from '@gradeon/api-client';
import { CONSOLE_ROLES, type ConsoleRole, type ConsoleUserRow } from '@gradeon/contracts';
import { Dialog, EmptyCard, Field, tintFor, useShake } from '@gradeon/web-ui';
import { Card, Page, Tiles, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { initials, ago } from '../../app/format';
import { roleLabel } from '../../app/useChrome';

const ROLE_HELP: Record<ConsoleRole, string> = {
  super_admin: 'Everything, including team and policy', implementation: 'Set schools up: configuration, roles and requests', support: 'Look inside schools, read-only', release_manager: 'Releases, migrations and builds',
  finance: 'Billing and invoices', compliance: 'Erasure and data requests', auditor: 'Read everything, change nothing',
};

export function TeamPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<ConsoleUserRow | null>(null);
  const team = useQuery({ queryKey: ['team'], queryFn: app.api.team.list });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['team'] });
  const change = useMutation({ mutationFn: (b: { id: string; roles?: string[]; status?: string; password?: string; resetAuthenticator?: boolean }) => app.api.team.change(b.id, b), onSuccess: () => { refresh(); setEdit(null); say('Saved.'); }, onError: (e) => say((e as Error).message, 'bad') });
  const rows = team.data ?? [];
  const canWrite = app.can('team.write');
  return (
    <Page title="Team" sub="Who can do what in the console" toast={toast} loading={team.isLoading} error={team.isError ? { message: (team.error as Error).message, retry: () => void team.refetch() } : null}
      actions={canWrite ? <button className="btn pri" onClick={() => setAdding(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d="M12 5v14M5 12h14"></path></svg>Add a person</button> : undefined}
      overlays={<>
        {adding && <AddDialog onClose={() => setAdding(false)} onDone={() => { setAdding(false); refresh(); say('Added. At their first sign-in they set up an authenticator app with the password you chose.'); }} />}
        {edit && <EditDialog row={edit} self={edit.email === app.user.email} onClose={() => setEdit(null)} onSave={(b) => change.mutate({ id: edit.id, ...b })} busy={change.isPending} />}
      </>}>
      {rows.length > 0 && <Tiles items={[
        { label: 'People', value: rows.length, note: `${rows.filter((r) => r.status === 'active').length} active`, tone: 'v' },
        { label: 'Super admins', value: rows.filter((r) => r.roles.includes('super_admin')).length, note: 'can change anything', tone: 'a' },
        { label: 'Never signed in', value: rows.filter((r) => !r.lastSeenAt).length, note: 'invited, not yet joined', tone: 'i' },
      ]} />}
      {rows.length === 0 ? <div><EmptyCard title="Team" chip={{ text: '0 people', tone: 'v' }} scene="register" heading="Just you so far" body="Add the people who will run releases, support schools and handle billing." /></div> : (
        <Card style={{ padding: 0 }}>
          <div className="tbl scroll-x"><div style={{ minWidth: 620 }}>
            <div className="grd th" style={{ '--cols': 'minmax(0,2fr) minmax(0,2fr) 120px 110px' } as React.CSSProperties}><span>Person</span><span>Roles</span><span>Last seen</span><span></span></div>
            {rows.map((r) => {
              const t = tintFor(r.name);
              return (
                <div key={r.id} className="grd rw" style={{ '--cols': 'minmax(0,2fr) minmax(0,2fr) 120px 110px' } as React.CSSProperties}>
                  <span style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                    <span className="av" style={{ width: 34, height: 34, fontSize: 11, background: t.bg, color: t.fg, boxShadow: 'none' }}>{initials(r.name)}</span>
                    <span style={{ minWidth: 0 }}><b style={{ display: 'block', font: '700 14px var(--fb)' }}>{r.name}</b><small style={{ color: 'var(--ink3)' }}>{r.email}</small></span>
                  </span>
                  <span className="tgrow">{r.roles.map((x) => <span key={x} className="chip v">{roleLabel(x)}</span>)}{r.status !== 'active' && <span className="chip a">{r.status}</span>}{r.status === 'active' && !r.authenticator && <span className="chip i">No authenticator yet</span>}</span>
                  <span style={{ color: 'var(--ink3)', font: '600 13px var(--fb)' }}>{ago(r.lastSeenAt)}</span>
                  <span>{canWrite && <button className="btn sm" onClick={() => setEdit(r)}>Change</button>}</span>
                </div>
              );
            })}
          </div></div>
        </Card>
      )}
      <Card title="What each role can do">
        <div className="rolh">
          {CONSOLE_ROLES.map((r) => <div key={r}><b>{roleLabel(r)}</b><small>{ROLE_HELP[r]}</small></div>)}
        </div>
      </Card>
    </Page>
  );
}

function RoleChoice({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="two" role="group" aria-label="Roles">
      {CONSOLE_ROLES.map((r) => {
        const on = value.includes(r);
        return (
          <button key={r} type="button" className={`opt ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== r) : [...value, r])} style={{ padding: 12 }}>
            <span className="rd"><svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d="M5 12.5l4.5 4.5L19 7.5" style={{ strokeWidth: 3 }}></path></svg></span>
            <span><b>{roleLabel(r)}</b><small>{ROLE_HELP[r]}</small></span>
          </button>
        );
      })}
    </div>
  );
}

function AddDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const app = useApp();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [roles, setRoles] = useState<string[]>(['support']);
  const [err, setErr] = useState<Record<string, string>>({});
  const shake = useShake();
  const add = useMutation({
    mutationFn: () => app.api.team.add({ ...f, roles }),
    onSuccess: onDone,
    onError: (e) => { setErr(e instanceof HttpError && Object.keys(e.fields).length ? e.fields : { _: (e as Error).message }); shake.hit(); },
  });
  const go = () => {
    const p: Record<string, string> = {};
    if (f.name.trim().length < 2) p.name = 'Enter their name.';
    if (!/^\S+@\S+\.\S+$/.test(f.email)) p.email = 'Enter a work email.';
    if (f.password.length < 10) p.password = 'Use at least 10 characters. They can change it after signing in.';
    if (!roles.length) p.roles = 'Pick at least one role.';
    setErr(p);
    if (Object.keys(p).length) shake.hit(); else add.mutate();
  };
  return (
    <Dialog title="Add a person" onClose={onClose} width={560} shake={shake.cls}>
      <Field label="Name" value={f.name} onChange={(name) => setF({ ...f, name })} error={err.name} />
      <Field label="Work email" value={f.email} onChange={(email) => setF({ ...f, email })} error={err.email} type="email" />
      <Field label="First password" value={f.password} onChange={(password) => setF({ ...f, password })} error={err.password} type="password" hint="Share it in person. At their first sign-in they add Gradeon to an authenticator app." />
      <div className="lbl" style={{ margin: '4px 0 8px' }}>Roles</div>
      <RoleChoice value={roles} onChange={(r) => { setRoles(r); setErr({ ...err, roles: '' }); }} />
      {err.roles && <div className="emsg" role="alert" style={{ marginTop: 8 }}>{err.roles}</div>}
      {err._ && <div className="emsg" role="alert" style={{ marginTop: 8 }}>{err._}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" onClick={go} disabled={add.isPending}>Add</button></div>
    </Dialog>
  );
}

function EditDialog({ row, self, onClose, onSave, busy }: { row: ConsoleUserRow; self: boolean; onClose: () => void; onSave: (b: { roles: string[]; status: string; password?: string; resetAuthenticator?: boolean }) => void; busy: boolean }) {
  const [roles, setRoles] = useState<string[]>(row.roles);
  const [status, setStatus] = useState<string>(row.status);
  const [password, setPassword] = useState('');
  const [resetAuth, setResetAuth] = useState(false);
  return (
    <Dialog title={row.name} onClose={onClose} width={560}>
      <RoleChoice value={roles} onChange={setRoles} />
      <div className="tgrow" style={{ marginTop: 16 }}>
        <button className={`btn ${status === 'disabled' ? 'dng' : ''}`} disabled={self} title={self ? 'You can’t switch yourself off' : undefined} onClick={() => setStatus(status === 'disabled' ? 'active' : 'disabled')}>{status === 'disabled' ? 'Switched off · tap to switch on' : 'Switch this person off'}</button>
      </div>
      {self && <div className="help" style={{ marginTop: 8 }}>You can’t switch yourself off or remove your own super admin role in one go.</div>}
      <div style={{ marginTop: 16 }}>
        <Field label="New password" value={password} onChange={setPassword} type="password" hint="Leave empty to keep theirs. At least 10 characters; share it in person." error={password && password.length < 10 ? 'At least 10 characters.' : undefined} />
      </div>
      {row.authenticator && (
        <div className="tgrow" style={{ marginTop: 4 }}>
          <button className={`btn ${resetAuth ? 'dng' : ''}`} aria-pressed={resetAuth} onClick={() => setResetAuth(!resetAuth)}>{resetAuth ? 'Authenticator will be reset · tap to keep it' : 'Reset their authenticator (lost phone)'}</button>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" disabled={busy || !roles.length || (!!password && password.length < 10)} onClick={() => onSave({ roles, status, ...(password ? { password } : {}), ...(resetAuth ? { resetAuthenticator: true } : {}) })}>Save</button></div>
    </Dialog>
  );
}
