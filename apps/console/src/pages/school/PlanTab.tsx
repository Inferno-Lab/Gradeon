import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { changeEntitlement, type EntitlementChange } from '@gradeon/config-engine';
import type { SchoolDetail } from '@gradeon/contracts';
import { DateField, Dialog, NumberField, SelectField } from '@gradeon/web-ui';
import type { CatalogDoc } from '@gradeon/api-client';
import { Card } from '../../app/Page';
import { useApp } from '../../app/context';
import { ReviewDialog, docOf, sig } from '../modules/ModulesPage';

type Say = (text: string, tone?: 'ok' | 'bad') => void;
type Mod = CatalogDoc['modules'][number];
const asText = (l: SchoolDetail['entitlement']['limits']) => ({ students: String(l.students), staff: l.staff == null ? '' : String(l.staff), storageGb: String(l.storageGb), smsPerMonth: String(l.smsPerMonth) });

/**
 * One school's plan and modules: the only place a school's modules are chosen. Edited here, reviewed, then sent; taking anything
 * away waits for a second person.
 */
export function PlanTab({ d, say }: { d: SchoolDetail; say: Say }) {
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
  const [limits, setLimits] = useState(asText(e.limits));
  const [review, setReview] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const can = app.can('schools.write');
  const list = (cat.data?.modules ?? []) as Mod[];

  // A plan is the starting bundle: taking one resets the modules, features and limits to it, so it is said first.
  const takePlan = (k: string) => {
    const p = plans.data?.find((x) => x.key === k);
    setPlan(k);
    setAsking(null);
    if (!p) return;
    setMods(new Set(p.modules));
    setFeatures({ ...p.features });
    setLimits(asText(p.limits));
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
  const next = asking ? plans.data?.find((p) => p.key === asking) : undefined;

  return (
    <section className="grid">
      {review && <ReviewDialog list={[{ schoolId: d.id, name: d.name, cur, change }]} onClose={() => setReview(false)} onDone={(m) => { setReview(false); say(m); }} />}
      {next && (
        <Dialog title={`Move to ${next.name}?`} tag={{ text: 'Resets modules and limits', tone: 'a' }} onClose={() => setAsking(null)} width={480}>
          <p style={{ marginTop: 0 }}>The modules, features and limits below change to the {next.name} plan’s: {next.modules.length} modules, up to {next.limits.students.toLocaleString('en-IN')} students. You can change them for this school afterwards; nothing is sent until you review it.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn" onClick={() => setAsking(null)}>Keep {plans.data?.find((p) => p.key === plan)?.name ?? 'this plan'}</button>
            <button className="btn pri" onClick={() => takePlan(next.key)}>Use {next.name}</button>
          </div>
        </Dialog>
      )}
      <Card title="Plan and limits" span="s12" chip={<span className="chip">Version {e.version}</span>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
          <SelectField label="Plan" value={plan} onChange={(k) => (k !== plan ? setAsking(k) : undefined)} disabled={!can} options={(plans.data ?? []).map((p) => ({ value: p.key, label: p.name }))} />
          <NumberField label="Students" min={1} value={limits.students} onChange={(v) => setLimits({ ...limits, students: v })} disabled={!can} />
          <NumberField label="Staff accounts" min={0} value={limits.staff} onChange={(v) => setLimits({ ...limits, staff: v })} disabled={!can} hint="Empty: no limit." />
          <NumberField label="File storage (GB)" min={1} value={limits.storageGb} onChange={(v) => setLimits({ ...limits, storageGb: v })} disabled={!can} />
          <NumberField label="Texts a month" min={0} step={100} value={limits.smsPerMonth} onChange={(v) => setLimits({ ...limits, smsPerMonth: v })} disabled={!can} />
          <DateField label="Free until (trial)" value={trial} onChange={setTrial} disabled={!can} hint="No invoice until this day." />
        </div>
      </Card>
      <Card title="Modules and features" span="s12" chip={<span className="chip">{e.active.length} on today</span>}>
        <div className="help" style={{ marginTop: 0 }}>A module outside its dates is off everywhere: the app, the admin, messages and reports. Its data is kept.</div>
        {list.filter((m) => m.state !== 'planned').map((m) => {
          const on = m.core || mods.has(m.key);
          return (
            <div key={m.key} style={{ padding: '16px 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" className={`sw ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={m.name} disabled={!can || m.core}
                  onClick={() => { const n = new Set(mods); if (n.has(m.key)) n.delete(m.key); else n.add(m.key); setMods(n); }} />
                <span style={{ flex: '1 1 200px', minWidth: 0 }}><b style={{ font: '700 14px var(--fb)' }}>{m.name}</b>{m.core && <span className="chip" style={{ marginLeft: 8 }}>Always on</span>}<div className="help" style={{ margin: 0 }}>{m.blurb}</div></span>
                {on && !m.core && (
                  <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ width: 160 }}><DateField label="From" value={dates[m.key]?.from ?? ''} onChange={(v) => setDate(m.key, 'from', v)} disabled={!can} /></span>
                    <span style={{ width: 160 }}><DateField label="Until" value={dates[m.key]?.until ?? ''} onChange={(v) => setDate(m.key, 'until', v)} disabled={!can} /></span>
                  </span>
                )}
              </div>
              {on && m.features.length > 0 && (
                <div className="tgrow" style={{ marginTop: 10, paddingLeft: 56 }}>
                  {m.features.map((f) => f.state === 'planned'
                    ? <span key={f.key} className="chip" data-tip="Planned: not built yet">{f.name} · planned</span>
                    : (
                      <Fragment key={f.key}>
                        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', font: '600 13px var(--fb)' }}>
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
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="help" style={{ flex: 1, minWidth: 220, margin: 0 }}>
            {preview.problems.length ? preview.problems.join(' ') : dirty ? `${preview.added.length} to give, ${preview.removed.length} to take away. Review before it is sent.` : 'Nothing has changed yet.'}
          </div>
          <button className="btn pri" disabled={!can || !dirty || preview.problems.length > 0} onClick={() => setReview(true)}>Review changes</button>
        </div>
      </Card>
    </section>
  );
}
