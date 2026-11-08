import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HttpError } from '@gradeon/api-client';
import { PERMISSION_CATALOG, permissionAvailable, type RoleDef } from '@gradeon/contracts';
import { Checkbox, EmptyCard, ErrorLine, Field, Select, useShake } from '@gradeon/web-ui';
import { useApp } from '../../app/context';

type Say = (text: string, tone?: 'ok' | 'bad') => void;

/** Roles at one school: what each can open and do, made and changed only here; and who holds which role. */
export function RolesTab({ schoolId, say }: { schoolId: string; say: Say }) {
  const app = useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['config', schoolId], queryFn: () => app.api.config.get(schoolId) });
  const can = app.can('schools.configure');
  const [sel, setSel] = useState<string>('');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<Record<string, string>>({});
  const [sure, setSure] = useState(false);
  const shake = useShake();
  const roles = q.data?.roles ?? [];
  const cur: RoleDef | undefined = roles.find((r) => r.id === sel);
  useEffect(() => { if (!sel && roles[0]) setSel(roles[0].id); }, [roles, sel]);
  useEffect(() => { if (cur) { setName(cur.name); setDesc(cur.description); setPerms(new Set(cur.permissions)); setErr({}); setSure(false); } }, [cur?.id, q.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  // Only permissions of modules the school has; a role keeps the others (unseen) so they come back with the module.
  const offered = useMemo(() => PERMISSION_CATALOG.filter((p) => permissionAvailable(p.key, { modules: q.data?.entitled ?? [], features: q.data?.features ?? [] })), [q.data]);
  const groups = useMemo(() => [...new Set(offered.map((p) => p.area))].map((a) => ({ area: a, items: offered.filter((p) => p.area === a) })), [offered]);
  const after = (m: string, r: RoleDef[], pick?: string) => { qc.setQueryData(['config', schoolId], { ...q.data!, roles: r }); void qc.invalidateQueries({ queryKey: ['config', schoolId] }); if (pick) setSel(pick); say(m); };
  const fail = (e: unknown) => { setErr(e instanceof HttpError && Object.keys(e.fields).length ? e.fields : { _: (e as Error).message }); shake.hit(); };
  const body = () => ({ name: name.trim(), description: desc.trim(), permissions: [...perms] });
  const save = useMutation({
    mutationFn: () => (sel === 'new' ? app.api.config.createRole(schoolId, body()) : app.api.config.saveRole(schoolId, sel, body())),
    onSuccess: (r) => after(sel === 'new' ? `${name.trim()} was made. Put people in it below.` : `${name.trim()} was saved. People in it get the change within a minute.`, r, sel === 'new' ? r.find((x) => x.name === name.trim())?.id : undefined),
    onError: fail,
  });
  const remove = useMutation({ mutationFn: () => app.api.config.deleteRole(schoolId, sel), onSuccess: (r) => after('Role deleted.', r, r[0]?.id ?? ''), onError: fail });
  const assign = useMutation({
    mutationFn: (b: { userId: string; roleId: string }) => app.api.config.setStaffRole(schoolId, b.userId, b.roleId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['config', schoolId] }); say('Role changed. They get it within a minute.'); },
    onError: (e) => say((e as Error).message, 'bad'),
  });

  if (q.isLoading) return <div className="skc" style={{ height: 420, borderRadius: 26 }} />;
  if (q.isError || !q.data) return <EmptyCard error title="Roles" chip={{ text: 'Couldn’t load', tone: 'c' }} scene="padlock" heading="Roles didn’t load" body={(q.error as Error)?.message ?? ''} actions={<button className="btn pri" onClick={() => void q.refetch()}>Try again</button>} />;
  const readOnly = !can || !!cur?.locked;
  const startNew = () => { setSel('new'); setName(''); setDesc(''); setPerms(new Set(['students.read'])); setErr({}); };
  const options = roles.map((r) => ({ value: r.id, label: r.name }));
  return (
    <section className="grid">
      <div className={`card s12 rise ${shake.cls}`}>
        <div className="ch"><h2>Roles</h2><span className="chip">{roles.length}</span></div>
        <div className="help">A role decides which modules a person can open and what they can do inside each. The school cannot make or change roles.</div>
        <div className="tgrow" style={{ marginTop: 12 }}>
          {roles.map((r) => <button key={r.id} type="button" className={`chip ${r.id === sel ? 'v' : ''}`} aria-pressed={r.id === sel} onClick={() => setSel(r.id)} style={{ cursor: 'pointer' }}>{r.name} · {r.people}</button>)}
          {sel === 'new' && <span className="chip v">{name.trim() || 'New role'}</span>}
          {can && sel !== 'new' && <button type="button" className="chip" onClick={startNew} style={{ cursor: 'pointer' }}>+ New role</button>}
        </div>
        {(cur || sel === 'new') && (
          <>
            <div className="two" style={{ marginTop: 12 }}>
              <Field label="Role name" value={name} onChange={(v) => { setName(v); setErr({}); }} error={err.name} disabled={readOnly} maxLength={40} />
              <Field label="What it is for" value={desc} onChange={setDesc} disabled={readOnly} maxLength={160} />
            </div>
            {cur?.locked && <div className="help">The principal role always has everything and cannot be changed.</div>}
            <div className="rolh2" style={{ marginTop: 12 }}>
              {groups.map((g) => (
                <fieldset key={g.area} style={{ border: 0, padding: 0, margin: '0 0 10px' }}>
                  <legend className="lbl" style={{ marginBottom: 6 }}>{g.area}</legend>
                  {g.items.map((p) => (
                    <label key={p.key} className="hwc" style={{ display: 'flex', whiteSpace: 'normal', alignItems: 'flex-start', padding: '3px 0' }}>
                      <Checkbox checked={perms.has(p.key)} disabled={readOnly} onChange={(c) => { const n = new Set(perms); if (c) n.add(p.key); else n.delete(p.key); setPerms(n); }} />
                      <span>{p.label}{p.sensitive && <span className="chip a" style={{ marginLeft: 6, height: 20, padding: '0 8px' }}>careful</span>}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
            {err._ && <ErrorLine>{err._}</ErrorLine>}
            {!readOnly && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                {cur && !cur.people ? (sure
                  ? <span style={{ display: 'flex', gap: 8 }}><button className="btn sm dng" onClick={() => remove.mutate()}>Yes, delete</button><button className="btn sm" onClick={() => setSure(false)}>Keep</button></span>
                  : <button className="btn dng" onClick={() => setSure(true)}>Delete role</button>) : <span className="help">{cur?.people ? `${cur.people} ${cur.people === 1 ? 'person has' : 'people have'} this role.` : ''}</span>}
                <span style={{ display: 'flex', gap: 10 }}>
                  {sel === 'new' && <button className="btn" onClick={() => setSel(roles[0]?.id ?? '')}>Cancel</button>}
                  <button className="btn pri" disabled={save.isPending} onClick={() => { if (name.trim().length < 2) { setErr({ name: 'Name the role.' }); shake.hit(); } else save.mutate(); }}>{save.isPending ? 'Saving…' : 'Save role'}</button>
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card s12 rise">
        <div className="ch"><h2>Who has which role</h2><span className="chip">{q.data.staff.length} staff</span></div>
        <div className="help">Whether the school may also do this itself is under Configuration → People.</div>
        {q.data.staff.map((s) => (
          <div key={s.id} className="kv" style={{ gap: 12 }}>
            <span style={{ minWidth: 0 }}>{s.name}<small style={{ display: 'block', color: 'var(--ink3)' }}>{s.designation}</small></span>
            <b style={{ minWidth: 200 }}>
              <Select value={s.roleId ?? ''} onChange={(roleId) => assign.mutate({ userId: s.id, roleId })} disabled={!can || assign.isPending} aria-label={`Role for ${s.name}`}
                options={[...(s.roleId ? [] : [{ value: '', label: 'No role yet' }]), ...options]} />
            </b>
          </div>
        ))}
      </div>
    </section>
  );
}
