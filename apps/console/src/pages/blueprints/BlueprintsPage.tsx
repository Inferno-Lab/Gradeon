import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HttpError } from '@gradeon/api-client';
import { STEP_LABELS, type BlueprintRow, type PolicyDoc, type StepKey } from '@gradeon/contracts';
import { Dialog, EmptyCard, Field, Select, SelectField, useShake } from '@gradeon/web-ui';
import { Card, Page, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { ago } from '../../app/format';

const REQUIRED = ['database', 'migrate-seed', 'admin'];
const TARGET: Record<string, string> = { local: 'This computer', 'free-test': 'Free test track', 'aws-cell': 'AWS cell' };
const ACTION: Record<string, string> = {
  'school.suspend': 'Suspend a school', 'school.resume': 'Bring a school back', 'school.erase': 'Erase a school', 'entitlements.push': 'Send plan changes',
  'migration.run': 'Run database changes', 'domain.set': 'Change an address', 'build.app': 'Build the app', 'backup.take': 'Take a backup', 'school.move': 'Move a school to another cell',
};
const WAVE_KINDS = [['internal', 'Our own schools'], ['pilot', 'Pilot schools'], ['rest', 'Everyone else']] as const;

export function BlueprintsPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const bps = useQuery({ queryKey: ['blueprints'], queryFn: app.api.blueprints.list });
  const policy = useQuery({ queryKey: ['policy'], queryFn: app.api.policy.get });
  const [open, setOpen] = useState('');
  const [draft, setDraft] = useState<Record<string, BlueprintRow['steps']>>({});
  const [pol, setPol] = useState<PolicyDoc | null>(null);
  const [adding, setAdding] = useState(false);
  const [params, setParams] = useState<{ bp: string; key: StepKey } | null>(null);
  useEffect(() => { if (policy.data) setPol(policy.data); }, [policy.data]);

  const save = useMutation({
    mutationFn: async (bp: BlueprintRow) => { const row = await app.api.blueprints.save({ key: bp.key, name: bp.name, target: bp.target, plan: bp.plan, steps: draft[bp.id] ?? bp.steps }); await app.api.blueprints.activate(row.id); return row; },
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['blueprints'] }); setDraft({}); say(`Saved as version ${r.version} and switched on. New schools use it from now.`); },
    onError: (e) => say(e instanceof HttpError ? e.message : (e as Error).message, 'bad'),
  });
  const savePolicy = useMutation({
    mutationFn: (p: PolicyDoc) => app.api.policy.set(p),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['policy'] }); say('Rules saved.'); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  const canBp = app.can('blueprints.write');
  const canPol = app.can('policy.write');
  const rows = (bps.data ?? []).filter((b) => b.active);
  const wavesOk = !!pol && pol.waves.length > 0 && pol.waves.at(-1)!.matches === 'rest' && pol.waves.every((w) => w.name.trim().length > 0 && w.batch >= 1);
  const dirtyPol = pol && policy.data && JSON.stringify(pol) !== JSON.stringify(policy.data);

  return (
    <Page active="bp" title="Blueprints and rules" sub="The recipe every new school is set up with, and the rules for risky changes" toast={toast} loading={bps.isLoading || policy.isLoading} error={bps.isError || policy.isError ? { message: ((bps.error ?? policy.error) as Error).message, retry: () => { void bps.refetch(); void policy.refetch(); } } : null}
      actions={canBp ? <button className="btn pri" onClick={() => setAdding(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d="M12 5v14M5 12h14"></path></svg>New blueprint</button> : undefined}
      overlays={<>
        {adding && <NewBlueprint from={rows} onClose={() => setAdding(false)} onDone={(m) => { setAdding(false); void qc.invalidateQueries({ queryKey: ['blueprints'] }); say(m); }} />}
        {params && <StepParams bp={rows.find((b) => b.id === params.bp)!} stepKey={params.key} initial={(draft[params.bp] ?? rows.find((b) => b.id === params.bp)!.steps).find((s) => s.key === params.key)!.params} onClose={() => setParams(null)}
          onSave={(v) => { const bp = rows.find((b) => b.id === params.bp)!; setDraft({ ...draft, [bp.id]: (draft[bp.id] ?? bp.steps).map((x) => (x.key === params.key ? { ...x, params: v } : x)) }); setParams(null); }} />}
      </>}>
      <section className="grid">
        <div className="s12" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(320px,100%),1fr))', gap: 18, alignItems: 'start', minWidth: 0 }}>
          {rows.length === 0 && <EmptyCard title="Blueprints" chip={{ text: 'None', tone: 'v' }} scene="checklist" heading="No blueprint is active" body="The platform creates one for each place schools can run when it first starts." />}
          {rows.map((bp) => {
            const steps = draft[bp.id] ?? bp.steps;
            const isOpen = open === bp.id;
            return (
              <Card key={bp.id} title={bp.name} chip={<span className="chip v">{TARGET[bp.target] ?? bp.target} · v{bp.version}</span>}>
                <div className="help">By {bp.createdBy} · {ago(bp.createdAt)}. {steps.filter((s) => s.enabled).length} of {steps.length} steps on.</div>
                <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setOpen(isOpen ? '' : bp.id)} aria-expanded={isOpen}>{isOpen ? 'Hide steps' : 'Show steps'}</button>
                {isOpen && (
                  <div style={{ marginTop: 10 }}>
                    {steps.map((s, i) => {
                      const must = REQUIRED.includes(s.key);
                      return (
                        <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderTop: '1px solid var(--line)' }}>
                          <span className="av" style={{ width: 28, height: 28, fontSize: 12, background: 'var(--sunk)', color: 'var(--ink3)', boxShadow: 'none' }}>{i + 1}</span>
                          <span style={{ flex: 1, minWidth: 0 }}><b style={{ font: '700 14px var(--fb)', display: 'block' }}>{STEP_LABELS[s.key]}</b><small style={{ color: 'var(--ink3)', font: '500 12.5px var(--fb)' }}>{must ? 'Always runs' : s.optional ? 'Optional' : 'Runs unless switched off'}{Object.keys(s.params).length ? ` · ${Object.entries(s.params).map(([k, v]) => `${k}: ${String(v)}`).join(', ')}` : ''}</small></span>
                          {canBp && <button className="btn sm" onClick={() => setParams({ bp: bp.id, key: s.key })} aria-label={`Parameters of ${STEP_LABELS[s.key]}`}>Parameters</button>}
                          <button className={`sw ${s.enabled ? 'on' : ''}`} role="switch" aria-checked={s.enabled} aria-label={STEP_LABELS[s.key]} disabled={must || !canBp} onClick={() => setDraft({ ...draft, [bp.id]: steps.map((x) => (x.key === s.key ? { ...x, enabled: !x.enabled } : x)) })}></button>
                        </div>
                      );
                    })}
                    {canBp && draft[bp.id] && <div className="tgrow" style={{ marginTop: 14 }}><button className="btn pri" disabled={save.isPending} onClick={() => save.mutate(bp)}>Save as a new version</button><button className="btn" onClick={() => setDraft({})}>Discard</button></div>}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
        <Card title="Rules for risky changes" span="s12">
          {pol && (
            <>
              <div className="lbl" style={{ marginBottom: 4 }}>Needs a second person</div>
              <div className="rolh2">
              {Object.keys(ACTION).map((a) => (
                <div key={a} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
                  <span style={{ flex: 1, font: '600 14px var(--fb)' }}>{ACTION[a]}</span>
                  <button className={`sw ${pol.approvals[a]?.needed ? 'on' : ''}`} role="switch" aria-checked={!!pol.approvals[a]?.needed} aria-label={ACTION[a]} disabled={!canPol} onClick={() => setPol({ ...pol, approvals: { ...pol.approvals, [a]: { roles: pol.approvals[a]?.roles ?? ['super_admin'], needed: !pol.approvals[a]?.needed } } })}></button>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderTop: '1px solid var(--line)' }}>
                <span style={{ flex: 1 }}><b style={{ font: '700 14px var(--fb)', display: 'block' }}>Freeze changes</b><small style={{ color: 'var(--ink3)', font: '500 12.5px var(--fb)' }}>Blocks everything except suspending a school</small></span>
                <button className={`sw ${pol.freeze ? 'on' : ''}`} role="switch" aria-checked={pol.freeze} aria-label="Freeze changes" disabled={!canPol} onClick={() => setPol({ ...pol, freeze: !pol.freeze })}></button>
              </div>
              </div>
              <div className="two" style={{ marginTop: 6 }}>
                <label className="fld"><span className="lbl">Stop a rollout above (error %)</span><span className="inp"><input type="number" min={0} max={100} value={pol.halt.errorRatePct} disabled={!canPol} onChange={(e) => setPol({ ...pol, halt: { ...pol.halt, errorRatePct: Number(e.target.value) } })} /></span></label>
                <label className="fld"><span className="lbl">…or when p95 passes (ms)</span><span className="inp"><input type="number" min={0} value={pol.halt.p95Ms} disabled={!canPol} onChange={(e) => setPol({ ...pol, halt: { ...pol.halt, p95Ms: Number(e.target.value) } })} /></span></label>
              </div>
              {canPol && <button className="btn pri" style={{ marginTop: 16 }} disabled={!dirtyPol || savePolicy.isPending} onClick={() => savePolicy.mutate(pol)}>Save rules</button>}
            </>
          )}
        </Card>
        {pol && (
          <Card title="How a release rolls out" span="s12">
            <div className="help">A release updates one wave at a time and stops by itself if a wave looks unhealthy. The last wave must be everyone else.</div>
            <div className="lscroll" style={{ marginTop: 12 }}>
              {pol.waves.map((w, i) => (
                <div key={i} className="wvr">
                  <span className="av" style={{ width: 28, height: 28, fontSize: 12, background: 'var(--sunk)', color: 'var(--ink3)', boxShadow: 'none' }}>{i + 1}</span>
                  <input className="hws wide" style={{ width: 'auto', textAlign: 'left', padding: '0 12px', flex: '1 1 160px' }} aria-label={`Name of wave ${i + 1}`} value={w.name} disabled={!canPol} onChange={(e) => setPol({ ...pol, waves: pol.waves.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                  <Select compact aria-label={`Who is in wave ${i + 1}`} value={w.matches} disabled={!canPol} onChange={(v) => setPol({ ...pol, waves: pol.waves.map((x, j) => (j === i ? { ...x, matches: v as 'rest' } : x)) })} options={WAVE_KINDS.map(([value, label]) => ({ value, label }))} />
                  <label className="hwc" style={{ whiteSpace: 'nowrap' }}>Schools at a time<input className="hws" type="number" min={1} max={100} value={w.batch} disabled={!canPol} onChange={(e) => setPol({ ...pol, waves: pol.waves.map((x, j) => (j === i ? { ...x, batch: Math.max(1, Number(e.target.value) || 1) } : x)) })} /></label>
                  {canPol && <button className="btn sm dng" disabled={pol.waves.length < 2} aria-label={`Remove wave ${i + 1}`} onClick={() => setPol({ ...pol, waves: pol.waves.filter((_, j) => j !== i) })}>Remove</button>}
                </div>
              ))}
            </div>
            {!wavesOk && <div className="emsg" role="alert" style={{ marginTop: 10 }}>The last wave must be “Everyone else”, and every wave needs a name and a batch size.</div>}
            <div className="two" style={{ marginTop: 14 }}>
              <Field label="Maintenance window" value={pol.maintenanceWindow} onChange={(v) => setPol({ ...pol, maintenanceWindow: v })} disabled={!canPol} hint="Shown to schools. Releases prefer this time." />
              <Field label="App bundle prefix" value={pol.naming.bundlePrefix} onChange={(v) => setPol({ ...pol, naming: { ...pol.naming, bundlePrefix: v.trim() } })} disabled={!canPol} hint="Each school’s app id starts with this." />
            </div>
            <div className="tgrow" style={{ marginTop: 14 }}>
              {canPol && <button className="btn" onClick={() => setPol({ ...pol, waves: [...pol.waves.slice(0, -1), { name: 'Next group', matches: 'pilot', batch: 5 }, pol.waves.at(-1)!] })}>Add a wave</button>}
              {canPol && <button className="btn pri" disabled={!dirtyPol || !wavesOk || savePolicy.isPending} onClick={() => savePolicy.mutate(pol)}>Save rollout rules</button>}
            </div>
          </Card>
        )}
      </section>
    </Page>
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
    mutationFn: async () => {
      const base = from.find((b) => b.target === f.target)?.steps ?? from[0]!.steps;
      const row = await app.api.blueprints.save({ key: f.key.trim(), name: f.name.trim(), target: f.target as 'local', plan: f.plan || null, steps: base });
      await app.api.blueprints.activate(row.id);
      return row;
    },
    onSuccess: (r) => onDone(`${r.name} is on. Schools on ${TARGET[r.target] ?? r.target}${r.plan ? ` with the ${r.plan} plan` : ''} use it from now.`),
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
        <button className="btn pri" disabled={make.isPending} onClick={go}>{make.isPending ? 'Saving…' : 'Create and switch on'}</button>
      </div>
    </Dialog>
  );
}

/** A step's settings, as JSON. Only a plain object of values is accepted. */
function StepParams({ bp, stepKey, initial, onClose, onSave }: { bp: BlueprintRow; stepKey: BlueprintRow['steps'][number]['key']; initial: Record<string, unknown>; onClose: () => void; onSave: (v: Record<string, unknown>) => void }) {
  const [text, setText] = useState(JSON.stringify(initial, null, 2));
  const [err, setErr] = useState('');
  const shake = useShake();
  const go = () => {
    try {
      const v = JSON.parse(text || '{}') as unknown;
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Use a JSON object, like { "poolSize": 5 }.');
      onSave(v as Record<string, unknown>);
    } catch (e) { setErr(e instanceof SyntaxError ? 'That is not valid JSON. Check the commas and quotes.' : (e as Error).message); shake.hit(); }
  };
  return (
    <Dialog title={STEP_LABELS[stepKey]} tag={{ text: bp.name, tone: 'v' }} onClose={onClose} width={500} shake={shake.cls}>
      <div className="fld">
        <label htmlFor="bp-params">Parameters</label>
        <div className={`inp ${err ? 'err shake' : ''}`} style={{ height: 'auto' }}><textarea id="bp-params" className="mono" rows={8} value={text} onChange={(e) => { setText(e.target.value); setErr(''); }} style={{ width: '100%', border: 0, outline: 0, background: 'none', padding: '12px 0', color: 'var(--ink)', resize: 'vertical' }} spellCheck={false} /></div>
        {err && <div className="emsg" role="alert">{err}</div>}
        <div className="help">These values reach the step’s driver. Nothing is saved until you save the blueprint as a new version.</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" onClick={go}>Keep these</button>
      </div>
    </Dialog>
  );
}
