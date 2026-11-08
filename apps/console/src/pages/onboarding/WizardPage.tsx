import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { HttpError } from '@gradeon/api-client';
import { closeModules } from '@gradeon/config-engine';
import { DEFAULT_BRAND, readableOn, WizardAdmin, WizardBasics, WizardBranding, WizardData, WizardPayload, WizardPlacement, WizardPlan, type ProvisionRunRow, type WizardReview } from '@gradeon/contracts';
import { ColourField, Field, SelectField, useShake } from '@gradeon/web-ui';
import { Card, Page, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { count, rupees } from '../../app/format';

const STEPS = [
  { key: 'basics', label: 'The school', schema: WizardBasics },
  { key: 'plan', label: 'Plan and modules', schema: WizardPlan },
  { key: 'branding', label: 'Name and colours', schema: WizardBranding },
  { key: 'placement', label: 'Where it runs', schema: WizardPlacement },
  { key: 'admin', label: 'First admin', schema: WizardAdmin },
  { key: 'data', label: 'Starting data', schema: WizardData },
  { key: 'review', label: 'Review and launch', schema: null },
] as const;
type Key = 'basics' | 'plan' | 'branding' | 'placement' | 'admin' | 'data';
type Data = Record<Key, Record<string, unknown>>;

const DEFAULTS: Data = {
  basics: { name: '', shortName: '', slug: '', board: 'CBSE', address: '', city: '', contactName: '', contactPhone: '', contactEmail: '', gstin: '', language: 'en' },
  plan: { plan: '', modules: [], addOns: [], locks: [], students: 500 },
  branding: { color: DEFAULT_BRAND, logoText: '', appName: '', tagline: '' },
  placement: { target: '', cell: '', addressing: 'path', customDomain: '' },
  admin: { name: '', email: '', phone: '', invite: 'both', roles: ['principal'] },
  data: { start: 'demo' },
};
const TARGET: Record<string, string> = { local: 'This computer', 'free-test': 'Free test track', 'aws-cell': 'AWS cell' };
const slugify = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
/** The contracts carry their own friendly messages; the library's stock ones get a plain replacement. */
const friendly = (m: string) => (/^Too small/.test(m) ? 'Please fill this in.' : /^(Too big|Invalid)/.test(m) ? 'Please check this value.' : m);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function WizardPage() {
  const app = useApp();
  const { draft: draftParam } = useParams({ strict: false }) as { draft?: string };
  const { toast, say } = useToast();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Data>(DEFAULTS);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [draftId, setDraftId] = useState(draftParam ?? '');
  const [loaded, setLoaded] = useState(!draftParam);
  const [rehearsal, setRehearsal] = useState<ProvisionRunRow | null>(null);
  const shake = useShake();

  const plans = useQuery({ queryKey: ['plans'], queryFn: app.api.plans, staleTime: 5 * 60_000 });
  const cells = useQuery({ queryKey: ['cells'], queryFn: app.api.cells });
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: app.api.catalog, staleTime: 10 * 60_000 });
  const saved = useQuery({ queryKey: ['draft', draftParam], queryFn: () => app.api.wizard.draft(draftParam!), enabled: !!draftParam });

  useEffect(() => {
    if (!saved.data || loaded) return;
    const next: Data = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS) as Key[]) next[k] = { ...DEFAULTS[k], ...((saved.data.data[k] as Record<string, unknown>) ?? {}) };
    setData(next); setStep(Math.min(saved.data.step, STEPS.length - 1)); setLoaded(true);
    setTouched(new Set(['basics.shortName', 'basics.slug', 'branding.logoText', 'branding.appName']));
  }, [saved.data, loaded]);
  useEffect(() => {
    if (!plans.data?.length || data.plan.plan) return;
    const p = plans.data.find((x) => x.key === 'complete') ?? plans.data[plans.data.length - 1]!;
    setData((d) => ({ ...d, plan: { ...d.plan, plan: p.key, modules: p.modules } }));
  }, [plans.data, data.plan.plan]);
  useEffect(() => {
    if (!cells.data?.length || data.placement.cell) return;
    const c = cells.data.find((x) => x.target === 'free-test') ?? cells.data[0]!;
    setData((d) => ({ ...d, placement: { ...d.placement, cell: c.key, target: c.target } }));
  }, [cells.data, data.placement.cell]);

  // Save the draft a moment after the last change, so closing the tab never loses the form.
  const save = useRef<ReturnType<typeof setTimeout>>(undefined);
  const idRef = useRef(draftId);
  idRef.current = draftId;
  useEffect(() => {
    if (!loaded || step >= STEPS.length - 1) return;
    if (data.basics.name === '' && !idRef.current) return;
    clearTimeout(save.current);
    save.current = setTimeout(() => {
      const body = { name: str(data.basics.name) || 'New school', step, data };
      if (idRef.current) void app.api.wizard.saveDraft(idRef.current, body).catch(() => undefined);
      else void app.api.wizard.createDraft(body).then((d) => { idRef.current = d.id; setDraftId(d.id); }).catch(() => undefined);
    }, 900);
    return () => clearTimeout(save.current);
  }, [data, step, loaded, app.api.wizard]);

  const set = (k: Key, field: string, value: unknown) => {
    setErrs((e) => ({ ...e, [`${k}.${field}`]: '' }));
    setData((d) => {
      const next = { ...d, [k]: { ...d[k], [field]: value } } as Data;
      if (k === 'basics' && field === 'name') {
        const name = str(value);
        const short = name.split(/\s+/)[0] ?? '';
        if (!touched.has('basics.shortName')) next.basics.shortName = short.slice(0, 20);
        if (!touched.has('basics.slug')) next.basics.slug = slugify(name);
        if (!touched.has('branding.logoText')) next.branding.logoText = name.trim().charAt(0).toUpperCase();
        if (!touched.has('branding.appName')) next.branding.appName = short.slice(0, 30);
      }
      return next;
    });
    if (field !== 'name') setTouched((t) => new Set(t).add(`${k}.${field}`));
  };
  const f = (k: Key, field: string, label: string, extra: Record<string, unknown> = {}) => (
    <Field label={label} value={str(data[k][field])} onChange={(v) => set(k, field, v)} error={errs[`${k}.${field}`]} {...extra} />
  );

  const check = (k: Key): boolean => {
    const s = STEPS.find((x) => x.key === k)!;
    const r = s.schema!.safeParse(data[k]);
    const out: Record<string, string> = {};
    if (!r.success) for (const i of r.error.issues) out[`${k}.${String(i.path[0] ?? '')}`] ??= friendly(i.message);
    if (k === 'placement' && !data.placement.cell) out['placement.cell'] = 'Pick where this school should run.';
    setErrs((e) => ({ ...e, ...Object.fromEntries(Object.keys(e).filter((x) => x.startsWith(`${k}.`)).map((x) => [x, ''])), ...out }));
    if (Object.keys(out).length) shake.hit();
    return Object.keys(out).length === 0;
  };
  const next = () => { const k = STEPS[step]!.key; if (k === 'review' || check(k as Key)) setStep(step + 1); };
  const jump = (i: number) => { if (i <= step || (STEPS.slice(0, i).every((s) => s.key === 'review' || WIZARD_OK(s.key as Key)))) setStep(i); };
  const WIZARD_OK = (k: Key) => STEPS.find((x) => x.key === k)!.schema!.safeParse(data[k]).success;

  const payload = WizardPayload.safeParse(data);
  const review = useQuery({
    queryKey: ['review', JSON.stringify(data)], queryFn: () => app.api.wizard.review(payload.data!), enabled: step === STEPS.length - 1 && payload.success, staleTime: 0,
  });
  const launch = useMutation({
    mutationFn: (dryRun: boolean) => app.api.wizard.launch({ payload: payload.data!, dryRun, draftId: draftId || undefined }),
    onSuccess: (run, dry) => { if (dry) { setRehearsal(run); say('Rehearsal finished. Nothing was created.'); } else app.go(`/schools/${run.schoolId}`); },
    onError: (e) => { say(e instanceof HttpError ? (e.fields.review ?? e.message) : (e as Error).message, 'bad'); shake.hit(); },
  });

  const plan = plans.data?.find((p) => p.key === data.plan.plan);
  const mods = (data.plan.modules as string[]) ?? [];
  const body: ReactNode = (() => {
    switch (STEPS[step]!.key) {
      case 'basics': return (
        <>
          {f('basics', 'name', 'School name', { placeholder: 'Banyan Ridge School' })}
          <div className="two">{f('basics', 'shortName', 'Short name', { hint: 'Used in the menu and the app' })}{f('basics', 'slug', 'Address name', { hint: `Lives at …/s/${str(data.basics.slug) || 'name'}` })}</div>
          <div className="two">
            <SelectField label="Board" value={str(data.basics.board)} onChange={(v) => set('basics', 'board', v)} options={['CBSE', 'ICSE', 'State', 'IB', 'International', 'Other'].map((b) => ({ value: b, label: b }))} />
            <SelectField label="App language" value={str(data.basics.language)} onChange={(v) => set('basics', 'language', v)} options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिन्दी' }, { value: 'mr', label: 'मराठी' }]} />
          </div>
          <div className="two">{f('basics', 'city', 'Town or city')}{f('basics', 'gstin', 'GSTIN (optional)')}</div>
          {f('basics', 'address', 'Address (optional)')}
          <div className="lbl" style={{ margin: '8px 0' }}>Who we talk to</div>
          <div className="two">{f('basics', 'contactName', 'Contact name')}{f('basics', 'contactPhone', 'Phone', { type: 'tel' })}</div>
          {f('basics', 'contactEmail', 'Email', { type: 'email' })}
        </>
      );
      case 'plan': return (
        <>
          <div className="lbl" style={{ marginBottom: 8 }}>Plan</div>
          <div style={{ display: 'grid', gap: 10 }} role="radiogroup" aria-label="Plan">
            {(plans.data ?? []).map((p) => (
              <button key={p.key} type="button" role="radio" aria-checked={p.key === data.plan.plan} className={`opt ${p.key === data.plan.plan ? 'on' : ''}`} onClick={() => { set('plan', 'plan', p.key); set('plan', 'modules', p.modules); }}>
                <span className="rd"><svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d="M5 12.5l4.5 4.5L19 7.5" style={{ strokeWidth: 3 }}></path></svg></span>
                <span style={{ flex: 1 }}><b>{p.name} · {rupees(p.perStudentYear)} per student a year</b><small>{p.modules.length} modules · up to {count(p.limits.students)} students · {p.limits.storageGb} GB files · {count(p.limits.smsPerMonth)} texts a month</small></span>
              </button>
            ))}
          </div>
          <div className="lbl" style={{ margin: '20px 0 8px' }}>Modules</div>
          <div className="two">
            {(catalog.data?.modules ?? []).filter((m) => m.state !== 'planned').map((m) => {
              const inPlan = plan?.modules.includes(m.key) ?? false;
              const on = mods.includes(m.key);
              return (
                <button key={m.key} type="button" className={`opt ${on ? 'on' : ''}`} aria-pressed={on} disabled={!inPlan} style={{ padding: 12, opacity: inPlan ? 1 : 0.45 }}
                  onClick={() => set('plan', 'modules', on ? mods.filter((x) => x !== m.key) : closeModules([...mods, m.key]))}>
                  <span className="rd"><svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d="M5 12.5l4.5 4.5L19 7.5" style={{ strokeWidth: 3 }}></path></svg></span>
                  <span><b>{m.name}</b><small>{inPlan ? m.blurb : 'Not in this plan'}</small></span>
                </button>
              );
            })}
          </div>
          {errs['plan.modules'] && <div className="emsg" role="alert" style={{ marginTop: 8 }}>{errs['plan.modules']}</div>}
          <div style={{ marginTop: 18 }}>{f('plan', 'students', 'Students expected', { type: 'number', min: 1, hint: plan ? `Up to ${count(plan.limits.students)} on ${plan.name}` : undefined, value: String(data.plan.students ?? ''), onChange: (v: string) => set('plan', 'students', Number(v) || 0) })}</div>
        </>
      );
      case 'branding': return (
        <>
          <div className="two">{f('branding', 'appName', 'Name in the app', { hint: 'Shown on the home screen' })}{f('branding', 'logoText', 'Logo letters', { maxLength: 2, hint: 'One or two letters' })}</div>
          {f('branding', 'tagline', 'Tagline (optional)')}
          <div className="lbl" style={{ margin: '8px 0' }}>Brand colour</div>
          <ColourField label="Brand colour" value={String(data.branding.color)} onChange={(c) => set('branding', 'color', c)} />
          {errs['branding.color'] && <div className="emsg" role="alert" style={{ marginTop: 8 }}>{errs['branding.color']}</div>}
          <div style={{ marginTop: 18, borderRadius: 22, border: '1px solid var(--line)', overflow: 'hidden', maxWidth: 260, background: 'var(--sunk)' }} aria-label="App preview">
            <div style={{ padding: '14px 14px 18px', color: readableOn(str(data.branding.color)), background: str(data.branding.color), font: '700 13.5px var(--fb)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 26, height: 26, borderRadius: 9, background: 'color-mix(in srgb,var(--onCi) 28%,transparent)', display: 'grid', placeItems: 'center', font: '800 12px var(--fd)' }}>{str(data.branding.logoText) || '?'}</span>{str(data.branding.appName) || 'Your school'}
            </div>
            <div style={{ padding: 12, display: 'grid', gap: 8 }}><i style={{ display: 'block', height: 12, width: '70%', borderRadius: 6, background: 'var(--line2)' }}></i><i style={{ display: 'block', height: 12, width: '46%', borderRadius: 6, background: 'var(--line2)' }}></i><b style={{ display: 'block', height: 34, borderRadius: 12, background: str(data.branding.color), color: readableOn(str(data.branding.color)), textAlign: 'center', lineHeight: '34px', font: '700 12.5px var(--fb)' }}>Pay fees</b></div>
          </div>
        </>
      );
      case 'placement': return (
        <>
          <SelectField label="Where it runs" value={str(data.placement.cell)} error={errs['placement.cell']}
            onChange={(v) => { const c = cells.data?.find((x) => x.key === v); set('placement', 'cell', v); if (c) set('placement', 'target', c.target); }}
            options={(cells.data ?? []).map((c) => ({ value: c.key, label: `Cell ${c.key} · ${TARGET[c.target] ?? c.target} · ${c.schools} of ${c.maxSchools} used` }))} />
          <div className="lbl" style={{ margin: '16px 0 8px' }}>Address style</div>
          <div className="two">
            {([['path', 'A path on the shared site', 'Works with no domain: …/s/name'], ['subdomain', 'Its own subdomain', 'name.example.com, needs DNS']] as const).map(([v, t, h]) => (
              <button key={v} type="button" className={`opt ${data.placement.addressing === v ? 'on' : ''}`} onClick={() => set('placement', 'addressing', v)} aria-pressed={data.placement.addressing === v}>
                <span className="rd"><svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d="M5 12.5l4.5 4.5L19 7.5" style={{ strokeWidth: 3 }}></path></svg></span><span><b>{t}</b><small>{h}</small></span>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>{f('placement', 'customDomain', 'Custom domain (optional)', { placeholder: 'erp.banyanridge.in', hint: 'Leave empty to use the platform address' })}</div>
        </>
      );
      case 'admin': return (
        <>
          <div className="help" style={{ marginBottom: 12 }}>This person gets the principal role and is invited to sign in. They can add everyone else.</div>
          {f('admin', 'name', 'Name')}{f('admin', 'email', 'Email', { type: 'email' })}{f('admin', 'phone', 'Phone', { type: 'tel' })}
          <SelectField label="Send the invitation by" value={str(data.admin.invite)} onChange={(v) => set('admin', 'invite', v)} options={[{ value: 'both', label: 'Text and email' }, { value: 'sms', label: 'Text message' }, { value: 'email', label: 'Email' }]} />
        </>
      );
      case 'data': return (
        <div style={{ display: 'grid', gap: 10 }} role="radiogroup" aria-label="Starting data">
          {([['demo', 'The demo school', 'Classes, students, fees and a timetable, so everything can be tried straight away.'], ['empty', 'Empty', 'A brand-new school with nothing in it. Every page shows its empty state.'], ['import', 'Empty, then import', 'Starts empty and opens the student import first.']] as const).map(([v, t, h]) => (
            <button key={v} type="button" role="radio" aria-checked={data.data.start === v} className={`opt ${data.data.start === v ? 'on' : ''}`} onClick={() => set('data', 'start', v)}>
              <span className="rd"><svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d="M5 12.5l4.5 4.5L19 7.5" style={{ strokeWidth: 3 }}></path></svg></span><span><b>{t}</b><small>{h}</small></span>
            </button>
          ))}
        </div>
      );
      default: return <ReviewStep review={review.data} loading={review.isLoading} error={review.isError ? (review.error as Error).message : ''} payloadOk={payload.success} missing={STEPS.slice(0, 6).filter((s) => !WIZARD_OK(s.key as Key)).map((s) => s.label)} rehearsal={rehearsal} />;
    }
  })();

  const last = step === STEPS.length - 1;
  const problems = review.data?.problems ?? [];
  return (
    <Page title="Onboard a school" sub="Seven short steps. Nothing is created until you press Launch." toast={toast} back={{ label: 'Onboarding', to: '/onboarding', go: app.go }} loading={!loaded}>
      <div className="wiz">
        <nav className="wst" aria-label="Steps">
          {STEPS.map((s, i) => (
            <button key={s.key} className={i === step ? 'on' : i < step ? 'ok' : ''} aria-current={i === step ? 'step' : undefined} onClick={() => jump(i)}>
              <i>{i < step ? <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path className="i" d="M5 12.5l4.5 4.5L19 7.5" style={{ strokeWidth: 3 }}></path></svg> : i + 1}</i>{s.label}
            </button>
          ))}
        </nav>
        <div className={shake.cls} style={{ minWidth: 0 }}>
          <Card title={STEPS[step]!.label} chip={<span className="chip">{step + 1} of {STEPS.length}</span>}>
            <div className="stack">{body}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>Back</button>
              {last ? (
                <span className="tgrow">
                  <button className="btn" disabled={!payload.success || launch.isPending || problems.length > 0} onClick={() => launch.mutate(true)}>{launch.isPending && launch.variables ? 'Rehearsing…' : 'Rehearse'}</button>
                  <button className="btn pri" disabled={!payload.success || launch.isPending || problems.length > 0 || review.isLoading || !app.can('schools.write')} onClick={() => launch.mutate(false)}>{launch.isPending && !launch.variables ? 'Launching…' : 'Launch'}</button>
                </span>
              ) : <button className="btn pri" onClick={next}>Continue<svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d="M5 12h14M13 6l6 6-6 6"></path></svg></button>}
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function ReviewStep({ review, loading, error, payloadOk, missing, rehearsal }: { review?: WizardReview; loading: boolean; error: string; payloadOk: boolean; missing: string[]; rehearsal: ProvisionRunRow | null }) {
  if (!payloadOk) return <div className="emsg" role="alert">Finish these steps first: {missing.join(', ')}.</div>;
  if (loading) return <div className="skc" style={{ height: 240, borderRadius: 20 }} />;
  if (error) return <div className="emsg" role="alert">{error}</div>;
  if (!review) return null;
  return (
    <>
      {review.problems.map((p) => <div key={p} className="emsg" role="alert" style={{ marginBottom: 8 }}>{p}</div>)}
      {review.summary.map((s) => <div key={s.label} className="kv">{s.label}<b>{s.detail}</b></div>)}
      <div className="lbl" style={{ margin: '18px 0 4px' }}>Launch will</div>
      <div className="steps">
        {review.willDo.map((w, i) => (
          <div key={w.key} className="stp"><span className="dot">{i + 1}</span><div><b>{w.label}{w.optional ? ' (optional)' : ''}</b><small>{w.detail}</small></div><span></span></div>
        ))}
      </div>
      <div className="help" style={{ marginTop: 10 }}>Cell {review.capacity.cell} holds {review.capacity.schools} of {review.capacity.max} schools{review.capacity.ok ? '.' : ' and is full.'}</div>
      {rehearsal && (
        <div style={{ marginTop: 16 }}>
          <div className="lbl" style={{ marginBottom: 6 }}>Rehearsal result · {rehearsal.status}</div>
          {rehearsal.steps.map((s) => <div key={s.key} className="kv">{s.label}<b><span className={`st ${s.status === 'done' ? 'g' : s.status === 'failed' ? 'c' : 'n'}`}><i></i>{s.status}</span></b></div>)}
        </div>
      )}
    </>
  );
}
