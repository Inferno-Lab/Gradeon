import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { catalogueName, changeEntitlement, type EntitlementChange } from '@gradeon/config-engine';
import type { EntitlementDoc, EntitlementRow, SchoolDetail } from '@gradeon/contracts';
import { Checkbox, DateField, Dialog, EmptyCard, ErrorLine, Field, SelectField } from '@gradeon/web-ui';
import type { CatalogDoc } from '@gradeon/api-client';
import { Card, Page, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { url } from '../../app/base';

type Say = (text: string, tone?: 'ok' | 'bad') => void;
type Mod = CatalogDoc['modules'][number];
interface Push { schoolId: string; name: string; cur: EntitlementDoc; change: EntitlementChange }

const docOf = (r: Pick<EntitlementRow, 'plan' | 'modules' | 'features' | 'dates' | 'trialUntil' | 'limits' | 'locks'>): EntitlementDoc => ({
  plan: r.plan, modules: r.modules, features: r.features, dates: r.dates, ...(r.trialUntil ? { trialUntil: r.trialUntil } : {}), limits: r.limits, locks: r.locks, overrides: {}, version: 0,
});

/** What a push would change, in a form that ignores key order. */
const sig = (x: EntitlementDoc) => JSON.stringify([x.plan, [...x.modules].sort(), Object.entries(x.features ?? {}).sort(), Object.entries(x.dates ?? {}).sort().map(([k, v]) => [k, v.from ?? '', v.until ?? '']), x.trialUntil ?? '', x.limits]);

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
function ReviewDialog({ list, onClose, onDone }: { list: Push[]; onClose: () => void; onDone: (m: string) => void }) {
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
              {r.removed.map((k) => <span key={k} className="chip r">− {catalogueName(k)}</span>)}
              {!r.added.length && !r.removed.length && <span className="help" style={{ margin: 0 }}>Limits, dates or plan only</span>}
            </div>
          </div>
        ))}
      </div>
      {takes && <p className="help">Taking something away needs a second person: it waits in Approvals. The school’s data is kept and comes back if the module does.</p>}
      {problems.length > 0 && <ErrorLine>{problems.join(' ')}</ErrorLine>}
      {err && <ErrorLine>{err}</ErrorLine>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
        <button className="btn" onClick={onClose}>Keep editing</button>
        <button className="btn pri" disabled={push.isPending || problems.length > 0} onClick={() => push.mutate(list)}>{push.isPending ? 'Sending' : 'Push'}</button>
      </div>
    </Dialog>
  );
}

const dot = (on: boolean, until?: string) => (
  <span data-tip={on ? (until ? `Until ${until}` : 'On') : 'Off'} aria-label={on ? (until ? `On until ${until}` : 'On') : 'Off'}
    style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 99, background: on ? (until ? 'var(--a)' : 'var(--g)') : 'transparent', boxShadow: on ? 'none' : 'inset 0 0 0 2px var(--line)' }} />
);

/** Every school against every module: give or take a module or a feature for many schools at once, with a review before anything is sent. */
export function ModulesPage() {
  const app = useApp();
  const { toast, say } = useToast();
  const cat = useQuery({ queryKey: ['catalog'], queryFn: app.api.catalog, staleTime: 10 * 60_000 });
  const q = useQuery({ queryKey: ['entitlements'], queryFn: app.api.entitlements });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState('');
  const [until, setUntil] = useState('');
  const [review, setReview] = useState<Push[] | null>(null);
  const can = app.can('schools.write');
  const built = (cat.data?.modules ?? []).filter((m) => m.state !== 'planned' && !m.core);
  const planned = (cat.data?.modules ?? []).filter((m) => m.state === 'planned');
  const options = (cat.data?.modules ?? []).filter((m) => m.state !== 'planned').flatMap((m) => [
    ...(m.core ? [] : [{ value: m.key, label: m.name }]),
    ...m.features.filter((f) => f.state !== 'planned').map((f) => ({ value: f.key, label: `${m.name}: ${f.name}` })),
  ]);
  const rows = q.data ?? [];
  const all = rows.length > 0 && rows.every((r) => picked.has(r.id));

  const plan = (give: boolean): Push[] => rows.filter((r) => picked.has(r.id)).map((r) => {
    const cur = docOf(r);
    const isFeature = target.includes('.');
    const change: EntitlementChange = isFeature
      ? { features: { [target]: give } }
      : give ? { modules: [...r.modules, target], ...(until ? { dates: { [target]: { until } } } : {}) } : { modules: r.modules.filter((k) => k !== target) };
    return { schoolId: r.id, name: r.name, cur, change };
  }).filter((p) => { const c = changeEntitlement(p.cur, p.change); return c.added.length || c.removed.length || c.problems.length || (give && until); });

  const open = (give: boolean) => {
    if (!target) { say('Choose a module or feature first.', 'bad'); return; }
    const list = plan(give);
    if (!list.length) { say(give ? 'The chosen schools already have it.' : 'None of the chosen schools has it.', 'bad'); return; }
    setReview(list);
  };

  return (
    <Page title="Modules" sub="Which school has which module and feature. Choose schools, then give or take; every change is reviewed first, and taking away needs a second person." toast={toast}
      loading={q.isLoading || cat.isLoading} error={q.isError ? { message: (q.error as Error).message, retry: () => void q.refetch() } : null}
      overlays={review && <ReviewDialog list={review} onClose={() => setReview(null)} onDone={(m) => { setReview(null); setPicked(new Set()); say(m); }} />}>
      {rows.length === 0 ? (
        <div><EmptyCard title="Modules" chip={{ text: '0 schools', tone: 'v' }} scene="notebooks" heading="No schools yet" body="Once a school is onboarded, its modules appear here against every other school’s." /></div>
      ) : (
        <>
          {can && (
            <Card title="Change many schools" chip={<span className="chip">{picked.size} chosen</span>}>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
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
            <div style={{ overflowX: 'auto' }}>
              <div role="table" aria-label="Modules by school" style={{ display: 'grid', gridTemplateColumns: `40px minmax(190px,1.6fr) repeat(${built.length}, minmax(72px,1fr))`, minWidth: 260 + built.length * 72, alignItems: 'stretch' }}>
                <div role="row" style={{ display: 'contents' }}>
                  <span role="columnheader" style={{ padding: '14px 0 14px 18px', display: 'flex', alignItems: 'center' }}>
                    {can && <Checkbox aria-label="Choose every school" checked={all} onChange={() => setPicked(all ? new Set() : new Set(rows.map((r) => r.id)))} />}
                  </span>
                  <span role="columnheader" className="help" style={{ margin: 0, padding: '14px 8px', fontWeight: 700, display: 'flex', alignItems: 'center' }}>School</span>
                  {built.map((m) => <span key={m.key} role="columnheader" className="help" style={{ margin: 0, padding: '14px 4px', fontWeight: 700, textAlign: 'center', lineHeight: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{m.name}</span>)}
                </div>
                {rows.map((r) => (
                  <div key={r.id} role="row" style={{ display: 'contents' }}>
                    <span role="cell" style={{ padding: '12px 0 12px 18px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center' }}>
                      {can && <Checkbox aria-label={`Choose ${r.name}`} checked={picked.has(r.id)} onChange={() => { const n = new Set(picked); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); setPicked(n); }} />}
                    </span>
                    <span role="cell" style={{ padding: '12px 8px', borderTop: '1px solid var(--line)', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <a href={url(`/schools/${r.id}`)} onClick={(e) => { e.preventDefault(); app.go(`/schools/${r.id}`); }} style={{ font: '700 14px var(--fb)', color: 'inherit', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</a>
                      <small style={{ color: 'var(--ink3)' }}>{r.plan}{r.trialUntil ? ` · trial until ${r.trialUntil}` : ''}</small>
                    </span>
                    {built.map((m) => <span key={m.key} role="cell" style={{ padding: '12px 4px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{dot(r.active.includes(m.key), r.dates[m.key]?.until)}</span>)}
                  </div>
                ))}
              </div>
            </div>
          </Card>
          <Card title="Not built yet" chip={<span className="chip">{planned.length} planned</span>}>
            <div className="help" style={{ marginTop: 0 }}>From the features master. Their switches exist so plans can name them, and turn on once each is built.</div>
            <div className="tgrow" style={{ marginTop: 10 }}>{planned.map((m) => <span key={m.key} className="chip" data-tip={m.blurb}>{m.name}</span>)}</div>
          </Card>
        </>
      )}
    </Page>
  );
}

/** One school's plan, modules, features, dates and limits, edited here and pushed after a review. */
export function PlanEditor({ d, say }: { d: SchoolDetail; say: Say }) {
  const app = useApp();
  const cat = useQuery({ queryKey: ['catalog'], queryFn: app.api.catalog, staleTime: 10 * 60_000 });
  const plans = useQuery({ queryKey: ['plans'], queryFn: app.api.plans, staleTime: 10 * 60_000 });
  const e = d.entitlement;
  const cur = useMemo(() => docOf(e), [e]);
  const [plan, setPlan] = useState(e.plan);
  const [mods, setMods] = useState<Set<string>>(new Set(e.modules));
  const [features, setFeatures] = useState<Record<string, boolean>>(e.features);
  const [dates, setDates] = useState(e.dates);
  const [trial, setTrial] = useState(e.trialUntil ?? '');
  const [limits, setLimits] = useState({ students: String(e.limits.students), staff: String(e.limits.staff ?? ''), storageGb: String(e.limits.storageGb), smsPerMonth: String(e.limits.smsPerMonth) });
  const [review, setReview] = useState(false);
  const can = app.can('schools.write');
  const list = (cat.data?.modules ?? []) as Mod[];

  const choosePlan = (k: string) => {
    setPlan(k);
    const p = plans.data?.find((x) => x.key === k);
    if (!p) return;
    // A plan is the starting bundle: its modules and limits, which can then be changed for this school.
    setMods(new Set(p.modules));
    setLimits({ students: String(p.limits.students), staff: String(p.limits.staff ?? ''), storageGb: String(p.limits.storageGb), smsPerMonth: String(p.limits.smsPerMonth) });
  };
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
  const change: EntitlementChange = {
    plan, modules: [...mods], features, trialUntil: trial || null,
    dates: Object.fromEntries(Object.entries(dates).map(([k, v]) => [k, { ...(v.from ? { from: v.from } : {}), ...(v.until ? { until: v.until } : {}) }])),
    limits: { students: num(limits.students) ?? 0, ...(num(limits.staff) !== undefined ? { staff: num(limits.staff) } : {}), storageGb: num(limits.storageGb) ?? 0, smsPerMonth: num(limits.smsPerMonth) ?? 0 },
  };
  const preview = changeEntitlement(cur, change);
  const dirty = sig(preview.next) !== sig(cur);
  const setDate = (k: string, field: 'from' | 'until', v: string) => setDates((x) => ({ ...x, [k]: { ...x[k], [field]: v || undefined } }));

  return (
    <section className="grid">
      {review && <ReviewDialog list={[{ schoolId: d.id, name: d.name, cur, change }]} onClose={() => setReview(false)} onDone={(m) => { setReview(false); say(m); }} />}
      <Card title="Plan and limits" span="s12" chip={<span className="chip">Version {e.version}</span>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
          <SelectField label="Plan" value={plan} onChange={choosePlan} disabled={!can} options={(plans.data ?? []).map((p) => ({ value: p.key, label: p.name }))} />
          <Field label="Students" inputMode="numeric" value={limits.students} onChange={(v) => setLimits({ ...limits, students: v })} disabled={!can} />
          <Field label="Staff accounts" inputMode="numeric" placeholder="No limit" value={limits.staff} onChange={(v) => setLimits({ ...limits, staff: v })} disabled={!can} />
          <Field label="File storage (GB)" inputMode="numeric" value={limits.storageGb} onChange={(v) => setLimits({ ...limits, storageGb: v })} disabled={!can} />
          <Field label="SMS a month" inputMode="numeric" value={limits.smsPerMonth} onChange={(v) => setLimits({ ...limits, smsPerMonth: v })} disabled={!can} />
          <DateField label="Free until (trial)" value={trial} onChange={setTrial} disabled={!can} hint="No invoice until this day." />
        </div>
      </Card>
      <Card title="Modules and features" span="s12" chip={<span className="chip">{e.active.length} on today</span>}>
        <div className="help" style={{ marginTop: 0 }}>A module outside its dates is off everywhere: the app, the admin, messages and reports. Its data is kept.</div>
        {list.filter((m) => m.state !== 'planned').map((m) => {
          const on = m.core || mods.has(m.key);
          return (
            <div key={m.key} style={{ padding: '14px 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" className={`sw ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={m.name} disabled={!can || m.core}
                  onClick={() => { const n = new Set(mods); if (n.has(m.key)) n.delete(m.key); else n.add(m.key); setMods(n); }} />
                <span style={{ flex: '1 1 200px', minWidth: 0 }}><b style={{ font: '700 14.5px var(--fb)' }}>{m.name}</b>{m.core && <span className="chip" style={{ marginLeft: 8 }}>Always on</span>}<div className="help" style={{ margin: 0 }}>{m.blurb}</div></span>
                {on && !m.core && (
                  <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ width: 160 }}><DateField label="From" value={dates[m.key]?.from ?? ''} onChange={(v) => setDate(m.key, 'from', v)} disabled={!can} /></span>
                    <span style={{ width: 160 }}><DateField label="Until" value={dates[m.key]?.until ?? ''} onChange={(v) => setDate(m.key, 'until', v)} disabled={!can} /></span>
                  </span>
                )}
              </div>
              {on && m.features.length > 0 && (
                <div className="tgrow" style={{ marginTop: 10, paddingLeft: 52 }}>
                  {m.features.map((f) => f.state === 'planned'
                    ? <span key={f.key} className="chip" data-tip="Not built yet">{f.name} · planned</span>
                    : (
                      <Fragment key={f.key}>
                        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', font: '600 13.5px var(--fb)' }}>
                          <button type="button" className={`sw ${features[f.key] !== false ? 'on' : ''}`} role="switch" aria-checked={features[f.key] !== false} aria-label={f.name} disabled={!can}
                            onClick={() => setFeatures({ ...features, [f.key]: features[f.key] === false })} />
                          {f.name}
                        </label>
                      </Fragment>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </Card>
      <Card title="Send to the school" span="s12">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="help" style={{ flex: 1, minWidth: 220, margin: 0 }}>
            {preview.problems.length ? preview.problems.join(' ') : dirty ? `${preview.added.length} to give, ${preview.removed.length} to take away. Review before it is sent.` : 'Nothing has changed yet.'}
          </div>
          <button className="btn pri" disabled={!can || !dirty || preview.problems.length > 0} onClick={() => setReview(true)}>Review changes</button>
        </div>
      </Card>
    </section>
  );
}
