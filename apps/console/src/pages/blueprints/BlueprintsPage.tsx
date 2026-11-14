import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HttpError } from '@tangent/api-client';
import { PERMISSION_CATALOG, ROLE_TEMPLATES, STEP_LABELS, type BlueprintRow, type RoleTemplate, DEPLOY_TARGET_LABELS } from '@tangent/contracts';
import { Checkbox, Dialog, ErrorLine, Field, SelectField, useShake, Icon, EmptyState, EmptyNote } from '@tangent/web-ui';
import { Card, Page, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { ago } from '../../app/format';
import { ApplyDialog } from '../school/ConfigTab';

const REQUIRED = ['database', 'migrate-seed', 'admin'];
const TARGET: Record<string, string> = DEPLOY_TARGET_LABELS;

/**
 * The recipe a new school is set up with, per place it can run: which set-up steps run, saved as versions and switched on as a
 * second step; and the roles every new school starts with. Rules for risky changes are under Console settings, how a release
 * rolls out under Releases.
 */
export function BlueprintsPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const bps = useQuery({ queryKey: ['blueprints'], queryFn: app.api.blueprints.list });
  const [open, setOpen] = useState('');
  const [draft, setDraft] = useState<Record<string, BlueprintRow['steps']>>({});
  const [adding, setAdding] = useState(false);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['blueprints'] });
  const save = useMutation({
    mutationFn: (bp: BlueprintRow) => app.api.blueprints.save({ key: bp.key, name: bp.name, target: bp.target, plan: bp.plan, steps: draft[bp.id] ?? bp.steps }),
    onSuccess: (r) => { refresh(); setDraft({}); say(`Saved as version ${r.version}. Switch it on when it should be used for new schools.`); },
    onError: (e) => say(e instanceof HttpError ? e.message : (e as Error).message, 'bad'),
  });
  const activate = useMutation({
    mutationFn: (bp: BlueprintRow) => app.api.blueprints.activate(bp.id),
    onSuccess: (_, bp) => { refresh(); say(`Version ${bp.version} of ${bp.name} is on. New schools use it from now.`); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  const canBp = app.can('blueprints.write');
  const all = bps.data ?? [];
  const keys = [...new Set(all.map((b) => b.key))];
  return (
    <Page title="Blueprints" sub="How a new school is set up, and the roles it starts with" toast={toast} loading={bps.isLoading} error={bps.isError ? { message: (bps.error as Error).message, retry: () => void bps.refetch() } : null}
      actions={canBp ? <button className="btn pri" onClick={() => setAdding(true)}><Icon name="plus" />New blueprint</button> : undefined}
      overlays={adding && <NewBlueprint from={all.filter((b) => b.active)} onClose={() => setAdding(false)} onDone={(m) => { setAdding(false); refresh(); say(m); }} />}>
      <section className="grid">
        <div className="s12" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(320px,100%),1fr))', gap: 16, alignItems: 'start', minWidth: 0 }}>
          {keys.length === 0 && <EmptyState scene="blueprints" onAction={canBp ? () => setAdding(true) : undefined} />}
          {keys.map((k) => {
            const versions = all.filter((b) => b.key === k).sort((x, y) => y.version - x.version);
            const on = versions.find((b) => b.active);
            const newest = versions[0]!;
            const bp = on ?? newest;
            const waiting = newest !== on ? newest : null;
            const steps = draft[bp.id] ?? bp.steps;
            const isOpen = open === bp.id;
            return (
              <Card key={k} title={bp.name} chip={<span className={`chip ${on ? 'v' : 'a'}`}>{TARGET[bp.target] ?? bp.target} · {on ? `v${on.version} on` : 'not on'}</span>}>
                <div className="help">{bp.plan ? `Only for the ${bp.plan} plan. ` : ''}By {bp.createdBy} · {ago(bp.createdAt)}. {steps.filter((s) => s.enabled).length} of {steps.length} steps on.</div>
                {waiting && (
                  <div className="kv" style={{ marginTop: 8 }}>
                    <span>Version {waiting.version} saved {ago(waiting.createdAt)} by {waiting.createdBy}, not on yet</span>
                    {canBp && <b><button className="btn sm pri" disabled={activate.isPending} onClick={() => activate.mutate(waiting)}>Switch it on</button></b>}
                  </div>
                )}
                <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setOpen(isOpen ? '' : bp.id)} aria-expanded={isOpen}>{isOpen ? 'Hide steps' : 'Show steps'}</button>
                {isOpen && (
                  <div style={{ marginTop: 10 }}>
                    {steps.map((s, i) => {
                      const must = REQUIRED.includes(s.key);
                      return (
                        <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderTop: '1px solid var(--line)' }}>
                          <span className="av" style={{ width: 28, height: 28, fontSize: 12, background: 'var(--s2)', color: 'var(--ink3)', boxShadow: 'none' }}>{i + 1}</span>
                          <span style={{ flex: 1, minWidth: 0 }}><b style={{ font: '700 14px var(--fb)', display: 'block' }}>{STEP_LABELS[s.key]}</b><small style={{ color: 'var(--ink3)', font: '400 12px var(--fb)' }}>{must ? 'Always runs' : s.optional ? 'Optional: can be skipped if it stops' : 'Runs unless switched off'}</small></span>
                          <button className={`sw ${s.enabled ? 'on' : ''}`} role="switch" aria-checked={s.enabled} aria-label={STEP_LABELS[s.key]} disabled={must || !canBp} onClick={() => setDraft({ ...draft, [bp.id]: steps.map((x) => (x.key === s.key ? { ...x, enabled: !x.enabled } : x)) })}></button>
                        </div>
                      );
                    })}
                    {canBp && draft[bp.id] && <div className="tgrow" style={{ marginTop: 12 }}><button className="btn pri" disabled={save.isPending} onClick={() => save.mutate(bp)}>Save as a new version</button><button className="btn" onClick={() => setDraft({})}>Discard</button></div>}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
        <StartingRoles say={say} />
        <SetupTemplates say={say} />
      </section>
    </Page>
  );
}

/** Saved setups (a school's settings and roles, never who it is), applied to many schools at once. Saved from a school's Configuration. */
function SetupTemplates({ say }: { say: (m: string, tone?: 'ok' | 'bad') => void }) {
  const app = useApp();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['config-templates'], queryFn: app.api.config.templates });
  const [applying, setApplying] = useState(false);
  const rows = list.data ?? [];
  return (
    <Card title="Setup templates" chip={<span className="chip">{rows.length}</span>} span="s12">
      <div className="help" style={{ marginTop: 0 }}>Saved from a school’s Configuration. Applying one gives each school chosen a new configuration version, which can be rolled back.</div>
      {rows.length === 0 && <EmptyNote icon="blueprints" title="No blueprints yet" body="Save one from a school’s Configuration tab, then start new schools from it." />}
      {rows.map((t) => <div key={t.id} className="kv">{t.name}<b>{t.keys} settings · {t.roles} roles · {ago(t.createdAt)}</b></div>)}
      {app.can('schools.configure') && rows.length > 0 && <button className="btn pri" style={{ marginTop: 12 }} onClick={() => setApplying(true)}>Apply to schools…</button>}
      {applying && <ApplyDialog onClose={() => setApplying(false)} onDone={(n) => { setApplying(false); void qc.invalidateQueries({ queryKey: ['config'] }); say(`Applied to ${n} ${n === 1 ? 'school' : 'schools'}.`); }} />}
    </Card>
  );
}

/** The roles every new school starts with (decision D6). Built-in ones can be renamed and changed, not removed; more can be added. */
function StartingRoles({ say }: { say: (m: string, tone?: 'ok' | 'bad') => void }) {
  const app = useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['role-templates'], queryFn: app.api.roleTemplates.get });
  const [list, setList] = useState<RoleTemplate[] | null>(null);
  const [sel, setSel] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { if (q.data) { setList(q.data); setSel((s) => s || q.data[0]?.key || ''); } }, [q.data]);
  const groups = useMemo(() => [...new Set(PERMISSION_CATALOG.map((p) => p.area))].map((a) => ({ area: a, items: PERMISSION_CATALOG.filter((p) => p.area === a) })), []);
  const save = useMutation({
    mutationFn: () => app.api.roleTemplates.set(list!),
    onSuccess: (r) => { qc.setQueryData(['role-templates'], r); setList(r); say('Starting roles saved. Schools set up from now start with them; schools already running keep theirs.'); },
    onError: (e) => setErr(e instanceof HttpError ? e.message : (e as Error).message),
  });
  const can = app.can('blueprints.write');
  if (!list) return <div className="skc s12" style={{ height: 240, borderRadius: 24 }} />;
  const cur = list.find((r) => r.key === sel);
  const put = (r: RoleTemplate) => { setList(list.map((x) => (x.key === r.key ? r : x))); setErr(''); };
  const dirty = JSON.stringify(list) !== JSON.stringify(q.data);
  const builtIn = (k: string) => ROLE_TEMPLATES.some((t) => t.key === k);
  const add = () => { let n = 1; while (list.some((r) => r.key === `role_${n}`)) n++; const r = { key: `role_${n}`, name: 'New role', description: '', permissions: [] }; setList([...list, r]); setSel(r.key); };
  return (
    <Card title="Starting roles" chip={<span className="chip">{list.length}</span>} span="s12">
      <div className="help" style={{ marginTop: 0 }}>Every new school starts with these roles. A school’s own roles are changed on its Roles tab; these do not reach schools already running.</div>
      <div className="tgrow" style={{ marginTop: 12 }}>
        {list.map((r) => <button key={r.key} type="button" className={`chip ${r.key === sel ? 'v' : ''}`} aria-pressed={r.key === sel} onClick={() => setSel(r.key)} style={{ cursor: 'pointer' }}>{r.name}</button>)}
        {can && <button type="button" className="chip" onClick={add} style={{ cursor: 'pointer' }}>+ Add a role</button>}
      </div>
      {cur && (
        <div style={{ marginTop: 12 }}>
          <div className="two">
            <Field label="Role name" value={cur.name} onChange={(v) => put({ ...cur, name: v })} disabled={!can} maxLength={40} />
            <Field label="What it is for" value={cur.description} onChange={(v) => put({ ...cur, description: v })} disabled={!can} maxLength={160} />
          </div>
          {cur.key === 'principal' ? <div className="help">The principal always has everything.</div> : (
            <div className="rolh2" style={{ marginTop: 12 }}>
              {groups.map((g) => (
                <fieldset key={g.area} style={{ border: 0, padding: 0, margin: '0 0 10px' }}>
                  <legend className="lbl" style={{ marginBottom: 6 }}>{g.area}</legend>
                  {g.items.map((p) => (
                    <label key={p.key} className="hwc" style={{ display: 'flex', whiteSpace: 'normal', alignItems: 'flex-start', padding: '4px 0' }}>
                      <Checkbox checked={cur.permissions.includes(p.key)} disabled={!can} onChange={(c) => put({ ...cur, permissions: c ? [...cur.permissions, p.key] : cur.permissions.filter((x) => x !== p.key) })} />
                      <span>{p.label}{p.sensitive && <span className="chip a" style={{ marginLeft: 6, height: 20, padding: '0 8px' }}>careful</span>}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          )}
          {can && !builtIn(cur.key) && <button className="btn sm dng" onClick={() => { setList(list.filter((x) => x.key !== cur.key)); setSel(list[0]?.key ?? ''); }}>Remove this role</button>}
        </div>
      )}
      {err && <ErrorLine>{err}</ErrorLine>}
      {can && <div className="tgrow" style={{ marginTop: 12 }}><button className="btn pri" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>Save starting roles</button><button className="btn" disabled={!dirty} onClick={() => setList(q.data!)}>Discard</button></div>}
    </Card>
  );
}

function NewBlueprint({ from, onClose, onDone }: { from: BlueprintRow[]; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const [f, setF] = useState({ name: '', key: '', target: from[0]?.target ?? 'free-test', plan: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const shake = useShake();
  const plans = useQuery({ queryKey: ['plans'], queryFn: app.api.plans });
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErr((e) => ({ ...e, [k]: '', _: '' })); };
  const make = useMutation({
    mutationFn: () => {
      const base = from.find((b) => b.target === f.target)?.steps ?? from[0]!.steps;
      return app.api.blueprints.save({ key: f.key.trim(), name: f.name.trim(), target: f.target as 'local', plan: f.plan || null, steps: base });
    },
    onSuccess: (r) => onDone(`${r.name} is saved. Check its steps, then switch it on for schools on ${TARGET[r.target] ?? r.target}${r.plan ? ` with the ${r.plan} plan` : ''}.`),
    onError: (e) => { setErr(e instanceof HttpError && Object.keys(e.fields).length ? e.fields : { _: (e as Error).message }); shake.hit(); },
  });
  const go = () => {
    const p: Record<string, string> = {};
    if (f.name.trim().length < 3) p.name = 'Give it a name.';
    if (!/^[a-z][a-z0-9-]{2,40}$/.test(f.key.trim())) p.key = 'Use 3 to 41 lowercase letters, numbers or dashes.';
    if (from.some((b) => b.key === f.key.trim())) p.key = 'A blueprint with that key exists. Edit it instead to make a new version.';
    setErr(p);
    if (Object.keys(p).length) shake.hit(); else make.mutate();
  };
  return (
    <Dialog title="New blueprint" onClose={onClose} width={500} shake={shake.cls}>
      <div className="stack">
        <div className="help">It starts as a copy of the blueprint now used for that place. Change its steps afterwards.</div>
        <Field label="Name" value={f.name} onChange={set('name')} error={err.name} placeholder="Small schools, free test" />
        <Field label="Key" value={f.key} onChange={set('key')} error={err.key} placeholder="small-schools" />
        <div className="two">
          <SelectField label="Place" value={f.target} onChange={set('target')} options={Object.entries(TARGET).map(([value, label]) => ({ value, label }))} />
          <SelectField label="Only for the plan" value={f.plan} onChange={set('plan')} options={[{ value: '', label: 'Every plan' }, ...(plans.data ?? []).map((p) => ({ value: p.key, label: p.name }))]} />
        </div>
        {err._ && <div className="emsg" role="alert">{err._}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={make.isPending} onClick={go}>{make.isPending ? 'Saving…' : 'Create'}</button>
      </div>
    </Dialog>
  );
}
