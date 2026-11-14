import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HttpError } from '@tangent/api-client';
import { CONSOLE_ROLES, CONSOLE_ROLE_INFO, type ConsoleUserRow } from '@tangent/contracts';
import { Dialog, Field, tintFor, useShake, Icon, EmptyState } from '@tangent/web-ui';
import { Card, Page, Tiles, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { initials, ago } from '../../app/format';
import { roleLabel } from '../../app/useChrome';


export function TeamPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<ConsoleUserRow | null>(null);
  const [link, setLink] = useState<{ name: string; link: string } | null>(null);
  const team = useQuery({ queryKey: ['team'], queryFn: app.api.team.list });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['team'] });
  const change = useMutation({ mutationFn: (b: { id: string; roles?: string[]; status?: string; resetAuthenticator?: boolean }) => app.api.team.change(b.id, b), onSuccess: () => { refresh(); setEdit(null); say('Saved.'); }, onError: (e) => say((e as Error).message, 'bad') });
  const reinvite = useMutation({ mutationFn: (r: ConsoleUserRow) => app.api.team.invite(r.id), onSuccess: (x, r) => { setLink({ name: r.name, link: x.link }); }, onError: (e) => say((e as Error).message, 'bad') });
  const remove = useMutation({ mutationFn: (r: ConsoleUserRow) => app.api.team.remove(r.id), onSuccess: (_, r) => { refresh(); say(`${r.name} was removed.`); }, onError: (e) => say((e as Error).message, 'bad') });
  const rows = team.data ?? [];
  const canWrite = app.can('team.write');
  return (
    <Page title="Team" sub="Who can do what in the console" toast={toast} loading={team.isLoading} error={team.isError ? { message: (team.error as Error).message, retry: () => void team.refetch() } : null}
      actions={canWrite ? <button className="btn pri" onClick={() => setAdding(true)}><Icon name="plus" />Invite a person</button> : undefined}
      overlays={<>
        {adding && <AddDialog onClose={() => setAdding(false)} onDone={(name, l) => { setAdding(false); refresh(); setLink({ name, link: l }); }} />}
        {link && (
          <Dialog title={`${link.name} is invited`} tag={{ text: 'Link works for 7 days', tone: 'v' }} onClose={() => setLink(null)} width={520}>
            <p style={{ marginTop: 0 }}>The link went to their email. If it does not arrive, send them this one yourself: they choose their own password with it, and add an authenticator at their first sign-in.</p>
            <div className="card" style={{ padding: 12, background: 'var(--s2)', boxShadow: 'none', font: '600 13px var(--fb)', overflowWrap: 'anywhere' }}>{link.link}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button className="btn" onClick={() => void navigator.clipboard.writeText(link.link).then(() => say('Link copied.'))}>Copy the link</button>
              <button className="btn pri" onClick={() => setLink(null)}>Done</button>
            </div>
          </Dialog>
        )}
        {edit && <EditDialog row={edit} self={edit.email === app.user.email} onClose={() => setEdit(null)} onSave={(b) => change.mutate({ id: edit.id, ...b })} busy={change.isPending} />}
      </>}>
      {rows.length > 0 && <Tiles items={[
        { label: 'People', value: rows.length, note: `${rows.filter((r) => r.status === 'active').length} active`, tone: 'v' },
        { label: 'Super admins', value: rows.filter((r) => r.roles.includes('super_admin')).length, note: 'can change anything', tone: 'a' },
        { label: 'Never signed in', value: rows.filter((r) => !r.lastSeenAt).length, note: 'invited, not yet joined', tone: 'i' },
      ]} />}
      {rows.length === 0 ? <div><EmptyState scene="team" onAction={canWrite ? () => setAdding(true) : undefined} /></div> : (
        <Card style={{ padding: 0 }}>
          <div className="tbl scroll-x"><div style={{ minWidth: 620 }}>
            <div className="grd th" style={{ '--cols': 'minmax(0,2fr) minmax(0,2fr) 120px 170px' } as React.CSSProperties}><span>Person</span><span>Roles</span><span>Last seen</span><span></span></div>
            {rows.map((r) => {
              const t = tintFor(r.name);
              return (
                <div key={r.id} className="grd rw" style={{ '--cols': 'minmax(0,2fr) minmax(0,2fr) 120px 170px' } as React.CSSProperties}>
                  <span style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                    <span className="av" style={{ width: 34, height: 34, fontSize: 11, background: t.bg, color: t.fg, boxShadow: 'none' }}>{initials(r.name)}</span>
                    <span style={{ minWidth: 0 }}><b style={{ display: 'block', font: '700 14px var(--fb)' }}>{r.name}</b><small style={{ color: 'var(--ink3)' }}>{r.email}</small></span>
                  </span>
                  <span className="tgrow">{r.roles.map((x) => <span key={x} className="chip v">{roleLabel(x)}</span>)}{r.status !== 'active' && <span className="chip a">{r.status === 'invited' ? 'Invited' : 'Switched off'}</span>}{r.status === 'active' && !r.authenticator && <span className="chip i">No authenticator yet</span>}</span>
                  <span style={{ color: 'var(--ink3)', font: '600 13px var(--fb)' }}>{ago(r.lastSeenAt)}</span>
                  <span className="tgrow">{canWrite && (r.status === 'invited'
                    ? <><button className="btn sm" disabled={reinvite.isPending} onClick={() => reinvite.mutate(r)}>New link</button>{!r.lastSeenAt && <button className="btn sm dng" disabled={remove.isPending} onClick={() => remove.mutate(r)}>Remove</button>}</>
                    : <button className="btn sm" onClick={() => setEdit(r)}>Change</button>)}</span>
                </div>
              );
            })}
          </div></div>
        </Card>
      )}
      <Card title="What each role can do">
        <div className="rolh">
          {CONSOLE_ROLES.map((r) => <div key={r}><b>{roleLabel(r)}</b><small>{CONSOLE_ROLE_INFO[r].help}</small></div>)}
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
            <span className="rd"><Icon name="check" /></span>
            <span><b>{roleLabel(r)}</b><small>{CONSOLE_ROLE_INFO[r].help}</small></span>
          </button>
        );
      })}
    </div>
  );
}

/** A new person gets an invitation link and chooses their own password: nobody else ever knows it. */
function AddDialog({ onClose, onDone }: { onClose: () => void; onDone: (name: string, link: string) => void }) {
  const app = useApp();
  const [f, setF] = useState({ name: '', email: '' });
  const [roles, setRoles] = useState<string[]>(['support']);
  const [err, setErr] = useState<Record<string, string>>({});
  const shake = useShake();
  const add = useMutation({
    mutationFn: () => app.api.team.add({ name: f.name.trim(), email: f.email.trim(), roles }),
    onSuccess: (r) => onDone(f.name.trim(), r.link),
    onError: (e) => { setErr(e instanceof HttpError && Object.keys(e.fields).length ? e.fields : { _: (e as Error).message }); shake.hit(); },
  });
  const go = () => {
    const p: Record<string, string> = {};
    if (f.name.trim().length < 2) p.name = 'Enter their name.';
    if (!/^\S+@\S+\.\S+$/.test(f.email)) p.email = 'Enter a work email.';
    if (!roles.length) p.roles = 'Pick at least one role.';
    setErr(p);
    if (Object.keys(p).length) shake.hit(); else add.mutate();
  };
  return (
    <Dialog title="Invite a person" onClose={onClose} width={560} shake={shake.cls}>
      <Field label="Name" value={f.name} onChange={(name) => setF({ ...f, name })} error={err.name} />
      <Field label="Work email" value={f.email} onChange={(email) => setF({ ...f, email })} error={err.email} type="email" hint="The invitation link goes here. They choose their password with it." />
      <div className="lbl" style={{ margin: '4px 0 8px' }}>Roles</div>
      <RoleChoice value={roles} onChange={(r) => { setRoles(r); setErr({ ...err, roles: '' }); }} />
      {err.roles && <div className="emsg" role="alert" style={{ marginTop: 8 }}>{err.roles}</div>}
      {err._ && <div className="emsg" role="alert" style={{ marginTop: 8 }}>{err._}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" onClick={go} disabled={add.isPending}>Send the invitation</button></div>
    </Dialog>
  );
}

function EditDialog({ row, self, onClose, onSave, busy }: { row: ConsoleUserRow; self: boolean; onClose: () => void; onSave: (b: { roles: string[]; status: string; resetAuthenticator?: boolean }) => void; busy: boolean }) {
  const [roles, setRoles] = useState<string[]>(row.roles);
  const [status, setStatus] = useState<string>(row.status);
  const [resetAuth, setResetAuth] = useState(false);
  return (
    <Dialog title={row.name} onClose={onClose} width={560}>
      <RoleChoice value={roles} onChange={setRoles} />
      <div className="tgrow" style={{ marginTop: 16 }}>
        <button className={`btn ${status === 'disabled' ? 'dng' : ''}`} disabled={self} data-tip={self ? 'You can’t switch yourself off' : undefined} onClick={() => setStatus(status === 'disabled' ? 'active' : 'disabled')}>{status === 'disabled' ? 'Switched off · tap to switch on' : 'Switch this person off'}</button>
      </div>
      {self && <div className="help" style={{ marginTop: 8 }}>You can’t switch yourself off or remove your own super admin role in one go.</div>}
      <div className="help" style={{ marginTop: 12 }}>A forgotten password is changed by the person themself, with “Forgot it?” on the sign-in page.</div>
      {row.authenticator && (
        <div className="tgrow" style={{ marginTop: 4 }}>
          <button className={`btn ${resetAuth ? 'dng' : ''}`} aria-pressed={resetAuth} onClick={() => setResetAuth(!resetAuth)}>{resetAuth ? 'Authenticator will be reset · tap to keep it' : 'Reset their authenticator (lost phone)'}</button>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" disabled={busy || !roles.length} onClick={() => onSave({ roles, status, ...(resetAuth ? { resetAuthenticator: true } : {}) })}>Save</button></div>
    </Dialog>
  );
}
