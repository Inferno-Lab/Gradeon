import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { catalogueName, changeEntitlement, type EntitlementChange } from '@gradeon/config-engine';
import { PlanSave, type EntitlementDoc, type EntitlementRow, type PlanRow } from '@gradeon/contracts';
import { HttpError } from '@gradeon/api-client';
import { Checkbox, DateField, Dialog, EmptyCard, ErrorLine, Field, NumberField, Select, SelectField, useShake, Icon } from '@gradeon/web-ui';
import type { CatalogDoc } from '@gradeon/api-client';
import { Card, Page, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { url } from '../../app/base';
import { usePageTabs } from '../../app/tabs';
import { count } from '../../app/format';

type Say = (text: string, tone?: 'ok' | 'bad') => void;
type Mod = CatalogDoc['modules'][number];
interface Push { schoolId: string; name: string; cur: EntitlementDoc; change: EntitlementChange }

export const docOf = (r: Pick<EntitlementRow, 'plan' | 'modules' | 'features' | 'dates' | 'trialUntil' | 'limits' | 'locks'>): EntitlementDoc => ({
  plan: r.plan, modules: r.modules, features: r.features, dates: r.dates, ...(r.trialUntil ? { trialUntil: r.trialUntil } : {}), limits: r.limits, locks: r.locks, overrides: {}, version: 0,
});

/** What a push would change, in a form that ignores key order. */
export const sig = (x: EntitlementDoc) => JSON.stringify([x.plan, [...x.modules].sort(), Object.entries(x.features ?? {}).sort(), Object.entries(x.dates ?? {}).sort().map(([k, v]) => [k, v.from ?? '', v.until ?? '']), x.trialUntil ?? '', x.limits]);

/** Sends each push, one school at a time. Anything taken away waits in Approvals for a second person. */
function usePush(onDone: (m: string) => void, onFail: (m: string) => void) {
  const app = useApp();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (list: Push[]) => {
      let done = 0;
      let waiting = 0;
      for (const p of list) {
        const r = await app.api.actions.request({ action: 'entitlements.push', schoolId: p.schoolId, params: p.change as Record<string, unknown> });
        if (r.status === 'pending_approval') waiting++; else if (r.status === 'done') done++; else throw new Error(`${p.name}: ${r.summary}`);
      }
      return { done, waiting };
    },
    onSuccess: ({ done, waiting }) => {
      void qc.invalidateQueries({ queryKey: ['entitlements'] });
      void qc.invalidateQueries({ queryKey: ['school'] });
      void qc.invalidateQueries({ queryKey: ['actions'] });
      onDone([done ? `${done} ${done === 1 ? 'school' : 'schools'} updated. It applies within 15 seconds.` : '', waiting ? `${waiting} waiting for a second person in Approvals.` : ''].filter(Boolean).join(' '));
    },
    onError: (e) => onFail((e as Error).message),
  });
}

/** What each push gives and takes, before anything is sent. */
export function ReviewDialog({ list, onClose, onDone }: { list: Push[]; onClose: () => void; onDone: (m: string) => void }) {
  const [err, setErr] = useState('');
  const push = usePush(onDone, setErr);
  const rows = list.map((p) => ({ p, r: changeEntitlement(p.cur, p.change) }));
  const problems = rows.flatMap(({ p, r }) => r.problems.map((m) => `${p.name}: ${m}`));
  const takes = rows.some(({ r }) => r.removed.length);
  return (
    <Dialog title="Review the change" tag={{ text: `${list.length} ${list.length === 1 ? 'school' : 'schools'}`, tone: takes ? 'a' : 'v' }} onClose={onClose} width={560}>
      <div className="stack" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
        {rows.map(({ p, r }) => (
          <div key={p.schoolId} style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
            <b style={{ font: '700 14px var(--fb)' }}>{p.name}</b>
            <div className="tgrow" style={{ marginTop: 6 }}>
              {r.added.map((k) => <span key={k} className="chip g">+ {catalogueName(k)}</span>)}
              {r.removed.map((k) => <span key={k} className="chip c">− {catalogueName(k)}</span>)}
              {!r.added.length && !r.removed.length && <span className="help" style={{ margin: 0 }}>Limits, dates or plan only</span>}
            </div>
          </div>
        ))}
      </div>
      {takes && <p className="help">Taking something away needs a second person: it waits in Approvals. The school’s data is kept and comes back if the module does.</p>}
      {problems.length > 0 && <ErrorLine>{problems.join(' ')}</ErrorLine>}
      {err && <ErrorLine>{err}</ErrorLine>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
        <button className="btn" onClick={onClose}>Keep editing</button>
        <button className="btn pri" disabled={push.isPending || problems.length > 0} onClick={() => push.mutate(list)}>{push.isPending ? 'Sending' : 'Push'}</button>
      </div>
    </Dialog>
  );
}

const dot = (on: boolean, until?: string, paused?: boolean) => (
  <span data-tip={paused ? 'Paused by Gradeon' : on ? (until ? `Until ${until}` : 'On') : 'Off'} aria-label={paused ? 'Paused' : on ? (until ? `On until ${until}` : 'On') : 'Off'}
    style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 999, background: paused ? 'var(--bad)' : on ? (until ? 'var(--warn)' : 'var(--ok)') : 'transparent', boxShadow: on || paused ? 'none' : 'inset 0 0 0 2px var(--line)' }} />
);

/** Plans and modules: which school has what, the plans schools start from, and what is planned. */
export function ModulesPage() {
  const { tab, tabs } = usePageTabs('/modules');
  const { toast, say } = useToast();
  return (
    <Page title="Plans and modules" sub={tab === 'plans' ? 'What a school starts from, and its price' : tab === 'planned' ? 'Modules on the way' : 'Which school has which module and feature'} toast={toast} actions={tabs}>
      {tab === 'plans' ? <Plans say={say} /> : tab === 'planned' ? <Planned /> : <Schools say={say} />}
    </Page>
  );
}

/** Every school against every module (or one module's features): give or take for many schools at once, reviewed first; pause a module. */
function Schools({ say }: { say: Say }) {
  const app = useApp();
  const qc = useQueryClient();
  const cat = useQuery({ queryKey: ['catalog'], queryFn: app.api.catalog, staleTime: 10 * 60_000 });
  const q = useQuery({ queryKey: ['entitlements'], queryFn: app.api.entitlements });
  const flags = useQuery({ queryKey: ['flags'], queryFn: app.api.flags.list });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState('');
  const [until, setUntil] = useState('');
  const [review, setReview] = useState<Push[] | null>(null);
  const [find, setFind] = useState('');
  const [plan, setPlan] = useState('');
  const [focus, setFocus] = useState('');
  const [pausing, setPausing] = useState<Mod | null>(null);
  const can = app.can('schools.write');
  const mods = (cat.data?.modules ?? []).filter((m) => m.state !== 'planned' && !m.core);
  const focused = mods.find((m) => m.key === focus);
  // A module's column opens its features; the matrix then shows those.
  const cols = focused ? focused.features.filter((f) => f.state !== 'planned').map((f) => ({ key: f.key, name: f.name, feature: true })) : mods.map((m) => ({ key: m.key, name: m.name, feature: false }));
  const options = (cat.data?.modules ?? []).filter((m) => m.state !== 'planned').flatMap((m) => [
    ...(m.core ? [] : [{ value: m.key, label: m.name }]),
    ...m.features.filter((f) => f.state !== 'planned').map((f) => ({ value: f.key, label: `${m.name}: ${f.name}` })),
  ]);
  const paused = (k: string, school?: string) => (flags.data ?? []).some((f) => f.key === `kill.${k}` && f.enabled && (f.scope === 'fleet' || f.schoolId === school));
  const all = q.data ?? [];
  const rows = all.filter((r) => (!find.trim() || r.name.toLowerCase().includes(find.trim().toLowerCase())) && (!plan || r.plan === plan));
  const every = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const has = (r: EntitlementRow, k: string, feature: boolean) => (feature ? r.active.includes(k.split('.')[0]!) && r.features[k] !== false : r.active.includes(k));

  const planOf = (give: boolean): Push[] => all.filter((r) => picked.has(r.id)).map((r) => {
    const cur = docOf(r);
    const isFeature = target.includes('.');
    const change: EntitlementChange = isFeature
      ? { features: { [target]: give } }
      : give ? { modules: [...r.modules, target], ...(until ? { dates: { [target]: { until } } } : {}) } : { modules: r.modules.filter((k) => k !== target) };
    return { schoolId: r.id, name: r.name, cur, change };
  }).filter((p) => { const c = changeEntitlement(p.cur, p.change); return c.added.length || c.removed.length || c.problems.length || (give && until); });

  const open = (give: boolean) => {
    if (!target) { say('Choose a module or feature first.', 'bad'); return; }
    const list = planOf(give);
    if (!list.length) { say(give ? 'The chosen schools already have it.' : 'None of the chosen schools has it.', 'bad'); return; }
    setReview(list);
  };
  const lift = useMutation({
    mutationFn: async (k: string) => { for (const f of (flags.data ?? []).filter((x) => x.key === `kill.${k}` && x.enabled)) await app.api.flags.remove(f.key, f.schoolId); },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['flags'] }); say('Lifted. It comes back within a few seconds.'); },
    onError: (e) => say((e as Error).message, 'bad'),
  });

  if (q.isLoading || cat.isLoading) return <div className="skc" style={{ height: 320, borderRadius: 28 }} />;
  if (q.isError) return <div><EmptyCard error title="Schools" chip={{ text: 'Couldn’t load', tone: 'c' }} icon="warning" heading="That didn’t load" body={(q.error as Error).message} actions={<button className="btn pri" onClick={() => void q.refetch()}>Try again</button>} /></div>;
  if (!all.length) return <div><EmptyCard title="Plans and modules" chip={{ text: '0 schools', tone: 'v' }} icon="homework" heading="No schools yet" body="Once a school is onboarded, its modules appear here against every other school’s." /></div>;
  return (
    <>
      {review && <ReviewDialog list={review} onClose={() => setReview(null)} onDone={(m) => { setReview(null); setPicked(new Set()); say(m); }} />}
      {pausing && <PauseDialog mod={pausing} onClose={() => setPausing(null)} onDone={(m) => { setPausing(null); void qc.invalidateQueries({ queryKey: ['flags'] }); say(m); }} />}
      {can && (
        <Card title="Change many schools" chip={<span className="chip">{picked.size} chosen</span>}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '2 1 240px' }}><SelectField label="Module or feature" value={target} onChange={setTarget} options={[{ value: '', label: 'Choose…' }, ...options]} /></div>
            <div style={{ flex: '1 1 160px' }}><DateField label="Until (optional, a trial)" value={until} onChange={setUntil} disabled={target.includes('.')} /></div>
            <div style={{ display: 'flex', gap: 10, paddingBottom: 2 }}>
              <button className="btn pri" disabled={!picked.size} onClick={() => open(true)}>Give</button>
              <button className="btn dng" disabled={!picked.size} onClick={() => open(false)}>Take away</button>
            </div>
          </div>
        </Card>
      )}
      <Card style={{ padding: 0 }}>
        <div className="ch" style={{ padding: '20px 20px 4px', flexWrap: 'wrap', gap: 10 }}>
          <div className="srch" style={{ minWidth: 200, height: 38, flex: '1 1 200px', maxWidth: 320 }}>
            <Icon name="search" />
            <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a school" aria-label="Find a school" style={{ border: 0, outline: 0, background: 'none', font: '600 13px var(--fb)', color: 'var(--ink)', flex: 1, minWidth: 0 }} />
          </div>
          <Select compact aria-label="Plan" value={plan} onChange={setPlan} options={[{ value: '', label: 'Every plan' }, ...[...new Set(all.map((r) => r.plan))].map((p) => ({ value: p, label: p }))]} />
          <span className="grow"></span>
          {focused && (
            <>
              <b style={{ font: '700 14px var(--fb)' }}>{focused.name}: features</b>
              {app.can('flags.write') && (paused(focused.key) ? <button className="btn sm" disabled={lift.isPending} onClick={() => lift.mutate(focused.key)}>Lift the pause</button> : <button className="btn sm dng" onClick={() => setPausing(focused)}>Pause…</button>)}
              <button className="btn sm" onClick={() => setFocus('')}>Back to every module</button>
            </>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div role="table" aria-label={focused ? `${focused.name} features by school` : 'Modules by school'} style={{ display: 'grid', gridTemplateColumns: `40px minmax(190px,1.6fr) repeat(${Math.max(1, cols.length)}, minmax(84px,1fr))`, minWidth: 260 + Math.max(1, cols.length) * 84, alignItems: 'stretch' }}>
            <div role="row" style={{ display: 'contents' }}>
              <span role="columnheader" style={{ padding: '16px 0 16px 20px', display: 'flex', alignItems: 'center' }}>
                {can && <Checkbox aria-label="Choose every school shown" checked={every} onChange={() => setPicked(every ? new Set() : new Set(rows.map((r) => r.id)))} />}
              </span>
              <span role="columnheader" className="help" style={{ margin: 0, padding: '16px 8px', fontWeight: 700, display: 'flex', alignItems: 'center' }}>School · {rows.length}</span>
              {cols.length === 0 && <span role="columnheader" className="help" style={{ margin: 0, padding: 16 }}>No features to choose</span>}
              {cols.map((c) => (
                <span key={c.key} role="columnheader" style={{ padding: '10px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {c.feature ? <span className="help" style={{ margin: 0, fontWeight: 700, textAlign: 'center', lineHeight: 1.25 }}>{c.name}</span>
                    : <button className="fp" style={{ font: '700 12px/1.25 var(--fb)', whiteSpace: 'normal', textAlign: 'center' }} data-tip={paused(c.key) ? 'Paused for every school. Open to lift it.' : 'Open its features'} onClick={() => setFocus(c.key)}>{c.name}{paused(c.key) ? ' · paused' : ''}</button>}
                </span>
              ))}
            </div>
            {rows.map((r) => (
              <div key={r.id} role="row" style={{ display: 'contents' }}>
                <span role="cell" style={{ padding: '12px 0 12px 20px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center' }}>
                  {can && <Checkbox aria-label={`Choose ${r.name}`} checked={picked.has(r.id)} onChange={() => { const n = new Set(picked); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); setPicked(n); }} />}
                </span>
                <span role="cell" style={{ padding: '12px 8px', borderTop: '1px solid var(--line)', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <a href={url(`/schools/${r.id}/plan`)} onClick={(e) => { e.preventDefault(); app.go(`/schools/${r.id}/plan`); }} style={{ font: '700 14px var(--fb)', color: 'inherit', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</a>
                  <small style={{ color: 'var(--ink3)' }}>{r.plan}{r.trialUntil ? ` · trial until ${r.trialUntil}` : ''}</small>
                </span>
                {cols.map((c) => <span key={c.key} role="cell" style={{ padding: '12px 4px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{dot(has(r, c.key, c.feature), c.feature ? undefined : r.dates[c.key]?.until, !c.feature && paused(c.key, r.id))}</span>)}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </>
  );
}

/** A pause takes a module away from the apps and refuses its requests within seconds, for every school or one; the data is kept. */
function PauseDialog({ mod, onClose, onDone }: { mod: Mod; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const schools = useQuery({ queryKey: ['schools'], queryFn: () => app.api.schools() });
  const [school, setSchool] = useState('');
  const go = useMutation({
    mutationFn: () => app.api.flags.set(`kill.${mod.key}`, { enabled: true, schoolId: school || null, label: `${mod.name} paused` }),
    onSuccess: () => onDone(`${mod.name} is paused${school ? ` at ${schools.data?.find((s) => s.id === school)?.name ?? 'that school'}` : ' for every school'}. It takes effect within a few seconds.`),
  });
  return (
    <Dialog title={`Pause ${mod.name}?`} tag={{ text: 'Takes effect at once', tone: 'a' }} onClose={onClose} width={480}>
      <p style={{ marginTop: 0 }}>For a fault that cannot wait for a release. {mod.name} leaves the apps and the admin and its requests are refused; nothing is deleted. Lift the pause here.</p>
      <SelectField label="For" value={school} onChange={setSchool} options={[{ value: '', label: 'Every school' }, ...(schools.data ?? []).map((s) => ({ value: s.id, label: s.name }))]} />
      {go.isError && <ErrorLine>{(go.error as Error).message}</ErrorLine>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn dngf" disabled={go.isPending} onClick={() => go.mutate()}>Pause it</button>
      </div>
    </Dialog>
  );
}

/** The plans a school can start from: the price per student a year, the modules it brings, the features it leaves out, its limits. */
function Plans({ say }: { say: Say }) {
  const app = useApp();
  const qc = useQueryClient();
  const plans = useQuery({ queryKey: ['plans'], queryFn: app.api.plans });
  const [editing, setEditing] = useState<PlanRow | 'new' | null>(null);
  const can = app.can('billing.write');
  const remove = useMutation({
    mutationFn: (key: string) => app.api.plan.remove(key),
    onSuccess: (list) => { qc.setQueryData(['plans'], list); say('Plan removed.'); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  if (plans.isLoading) return <div className="skc" style={{ height: 320, borderRadius: 28 }} />;
  return (
    <>
      {editing && <PlanDialog plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={(list, m) => { qc.setQueryData(['plans'], list); setEditing(null); say(m); }} />}
      <Card title="Plans" chip={can ? <button className="btn sm pri" onClick={() => setEditing('new')}>New plan</button> : undefined}>
        <div className="help" style={{ marginTop: 0 }}>A new school starts from a plan. Changing a plan changes its price on the next invoices and what new schools get; schools already on it keep their modules until they are changed on their own Plan and modules tab.</div>
        {(plans.data ?? []).map((p) => (
          <div key={p.key} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
            <span style={{ flex: '1 1 260px', minWidth: 0 }}>
              <b style={{ font: '700 15px var(--fb)' }}>{p.name}</b> <span className="chip">{p.schools ?? 0} {p.schools === 1 ? 'school' : 'schools'}</span>
              <small style={{ display: 'block', color: 'var(--ink3)' }}>₹{count(p.perStudentYear)} a student a year · {p.modules.length} modules · up to {count(p.limits.students)} students · {count(p.limits.storageGb)} GB · {count(p.limits.smsPerMonth)} texts a month</small>
            </span>
            {can && <span className="tgrow"><button className="btn sm" onClick={() => setEditing(p)}>Change</button><button className="btn sm dng" disabled={!!p.schools || remove.isPending} data-tip={p.schools ? 'Move its schools to another plan first' : undefined} onClick={() => remove.mutate(p.key)}>Remove</button></span>}
          </div>
        ))}
      </Card>
    </>
  );
}

function PlanDialog({ plan, onClose, onDone }: { plan: PlanRow | null; onClose: () => void; onDone: (list: PlanRow[], m: string) => void }) {
  const app = useApp();
  const cat = useQuery({ queryKey: ['catalog'], queryFn: app.api.catalog, staleTime: 10 * 60_000 });
  const shake = useShake();
  const [f, setF] = useState({ key: plan?.key ?? '', name: plan?.name ?? '', price: String(plan?.perStudentYear ?? ''), students: String(plan?.limits.students ?? 500), staff: plan?.limits.staff == null ? '' : String(plan.limits.staff), storage: String(plan?.limits.storageGb ?? 5), sms: String(plan?.limits.smsPerMonth ?? 1000) });
  const [mods, setMods] = useState<Set<string>>(new Set(plan?.modules ?? []));
  const [off, setOff] = useState<Record<string, boolean>>(plan?.features ?? {});
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErr((e) => ({ ...e, [k]: '', _: '' })); };
  const list = (cat.data?.modules ?? []).filter((m) => m.state !== 'planned' && !m.core);
  const save = useMutation({
    mutationFn: () => {
      const body = PlanSave.parse({
        key: f.key.trim(), name: f.name.trim(), perStudentYear: Number(f.price || 0), modules: [...mods], features: Object.fromEntries(Object.entries(off).filter(([, v]) => v === false)),
        limits: { students: Number(f.students), ...(f.staff.trim() ? { staff: Number(f.staff) } : {}), storageGb: Number(f.storage), smsPerMonth: Number(f.sms) },
      });
      return plan ? app.api.plan.save(plan.key, body) : app.api.plan.add(body);
    },
    onSuccess: (l) => onDone(l, plan ? `${f.name.trim()} saved. New invoices use the new price.` : `${f.name.trim()} added.`),
    onError: (e) => {
      const issues = (e as { issues?: { path: (string | number)[]; message: string }[] }).issues;
      setErr(issues ? Object.fromEntries(issues.map((i) => [String(i.path.at(-1) === 'perStudentYear' ? 'price' : i.path.at(-1)), i.message])) : e instanceof HttpError && Object.keys(e.fields).length ? e.fields : { _: (e as Error).message });
      shake.hit();
    },
  });
  return (
    <Dialog title={plan ? `Change ${plan.name}` : 'New plan'} tag={plan?.schools ? { text: `${plan.schools} on it`, tone: 'a' } : undefined} onClose={onClose} width={620} shake={shake.cls}>
      <div className="stack">
        <div className="two">
          <Field label="Name" value={f.name} onChange={set('name')} error={err.name} maxLength={40} placeholder="Standard" />
          <Field label="Key" value={f.key} onChange={set('key')} error={err.key} disabled={!!plan} hint={plan ? 'Schools are on it by this key: it does not change.' : 'Lowercase, used in addresses and records.'} placeholder="standard" />
        </div>
        <div className="two">
          <NumberField label="Price per student a year (₹)" min={0} step={10} value={f.price} onChange={set('price')} error={err.price} />
          <NumberField label="Students" min={1} step={50} value={f.students} onChange={set('students')} error={err.students} />
        </div>
        <div className="two">
          <NumberField label="Staff accounts" min={0} value={f.staff} onChange={set('staff')} hint="Empty: no limit." />
          <NumberField label="File storage (GB)" min={1} value={f.storage} onChange={set('storage')} error={err.storageGb} />
        </div>
        <NumberField label="Texts a month" min={0} step={500} value={f.sms} onChange={set('sms')} error={err.smsPerMonth} />
        <div className="fld">
          <label>Modules it brings</label>
          {err.modules && <ErrorLine>{err.modules}</ErrorLine>}
          {list.map((m) => {
            const on = mods.has(m.key);
            return (
              <div key={m.key} style={{ padding: '8px 0', borderTop: '1px solid var(--line)' }}>
                <label style={{ display: 'flex', gap: 10, alignItems: 'center', font: '700 14px var(--fb)' }}>
                  <button type="button" className={`sw ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={m.name} onClick={() => { const n = new Set(mods); if (on) n.delete(m.key); else n.add(m.key); setMods(n); setErr((x) => ({ ...x, modules: '' })); }} />{m.name}
                </label>
                {on && m.features.some((x) => x.state !== 'planned') && (
                  <div className="tgrow" style={{ marginTop: 6, paddingLeft: 56 }}>
                    {m.features.filter((x) => x.state !== 'planned').map((x) => {
                      const has = off[x.key] !== false;
                      return <button key={x.key} type="button" className={`fp ${has ? 'on' : ''}`} aria-pressed={has} onClick={() => setOff({ ...off, [x.key]: !has ? true : false })}>{x.name}</button>;
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {err._ && <ErrorLine>{err._}</ErrorLine>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : plan ? 'Save plan' : 'Add plan'}</button>
      </div>
    </Dialog>
  );
}

/** Modules on the way, from the module definition: plans can name them, and their switches turn on once each is built. */
function Planned() {
  const app = useApp();
  const cat = useQuery({ queryKey: ['catalog'], queryFn: app.api.catalog, staleTime: 10 * 60_000 });
  const planned = (cat.data?.modules ?? []).filter((m) => m.state === 'planned');
  const features = (cat.data?.modules ?? []).filter((m) => m.state !== 'planned').flatMap((m) => m.features.filter((f) => f.state === 'planned').map((f) => ({ ...f, module: m.name })));
  if (cat.isLoading) return <div className="skc" style={{ height: 240, borderRadius: 28 }} />;
  return (
    <>
      <Card title="Planned modules" chip={<span className="chip">{planned.length}</span>}>
        {planned.length === 0 && <div className="help">Nothing planned right now.</div>}
        {planned.map((m) => <div key={m.key} className="kv" style={{ alignItems: 'flex-start' }}><span><b style={{ color: 'var(--ink)' }}>{m.name}</b><br /><small style={{ color: 'var(--ink3)' }}>{m.blurb}</small></span></div>)}
      </Card>
      {features.length > 0 && (
        <Card title="Planned features" chip={<span className="chip">{features.length}</span>}>
          {features.map((f) => <div key={f.key} className="kv"><span>{f.name}</span><b>{f.module}</b></div>)}
        </Card>
      )}
    </>
  );
}
