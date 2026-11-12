import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HttpError } from '@gradeon/api-client';
import { Dialog, EmptyCard, Field, NumberField, NumberInput, Select, useShake, Icon } from '@gradeon/web-ui';
import type { PolicyDoc, ReleaseRow } from '@gradeon/contracts';
import { Card, Page, Tiles, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { ago } from '../../app/format';
import { url } from '../../app/base';
import { usePageTabs } from '../../app/tabs';
import { MigrationsTab } from './MigrationsTab';

const TONE: Record<ReleaseRow['status'], string> = { draft: 'n', rolling: 'v', paused: 'a', halted: 'c', done: 'g', rolled_back: 'a' };
const LABEL: Record<ReleaseRow['status'], string> = { draft: 'Ready to start', rolling: 'Rolling out', paused: 'Paused', halted: 'Halted', done: 'Finished', rolled_back: 'Rolled back' };
const SCHOOL: Record<string, string> = { pending: 'n', rolling: 'v', done: 'g', failed: 'c', rolled_back: 'a' };
const WAVE: Record<string, string> = { pending: 'waiting', rolling: 'checking schools', done: 'signed off', halted: 'stopped', paused: 'paused', rolled_back: 'marked rolled back' };
const WAVE_KINDS = [['internal', 'Our own schools'], ['pilot', 'Pilot schools'], ['rest', 'Everyone else']] as const;

/** Releases, how they roll out, and the database changes they carry. */
export function ReleasesPage() {
  const { tab, tabs } = usePageTabs('/releases');
  const { toast, say } = useToast();
  if (tab === 'database') return <MigrationsTab tabs={tabs} />;
  if (tab === 'rules') return <Page title="Releases" sub="How a release rolls out" toast={toast} actions={tabs}><RolloutRules say={say} /></Page>;
  return <ReleasesList tabs={tabs} toast={toast} say={say} />;
}

function ReleasesList({ tabs, toast, say }: { tabs: React.ReactNode; toast: ReturnType<typeof useToast>['toast']; say: ReturnType<typeof useToast>['say'] }) {
  const app = useApp();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [back, setBack] = useState<ReleaseRow | null>(null);
  const list = useQuery({ queryKey: ['releases'], queryFn: app.api.releases.list, refetchInterval: (q) => (q.state.data?.some((r) => r.status === 'rolling') ? 3000 : 20_000) });
  const refresh = () => void qc.invalidateQueries({ predicate: (q) => ['releases', 'fleet', 'schools'].includes(String(q.queryKey[0])) });
  const start = useMutation({ mutationFn: (id: string) => app.api.releases.start(id), onSuccess: () => { refresh(); say('Checking schools in waves. It stops by itself if a school looks unhealthy.'); }, onError: (e) => say((e as Error).message, 'bad') });
  const pause = useMutation({ mutationFn: (b: { id: string; paused: boolean }) => app.api.releases.pause(b.id, b.paused), onSuccess: refresh, onError: (e) => say((e as Error).message, 'bad') });
  const rollback = useMutation({ mutationFn: (id: string) => app.api.releases.rollback(id), onSuccess: () => { setBack(null); refresh(); say('Marked as rolled back. To undo the code itself, redeploy the earlier version.'); }, onError: (e) => say((e as Error).message, 'bad') });
  const rows = list.data ?? [];
  const canWrite = app.can('releases.write');
  return (
    <Page title="Releases" sub="A release signs schools off on the deployed code, wave by wave" toast={toast} loading={list.isLoading} error={list.isError ? { message: (list.error as Error).message, retry: () => void list.refetch() } : null}
      actions={<>{tabs}{canWrite && <button className="btn pri" onClick={() => setCreating(true)}><Icon name="plus" />New release</button>}</>}
      overlays={<>
        {creating && <CreateDialog onClose={() => setCreating(false)} onDone={() => { setCreating(false); refresh(); say('Release created. Start it when you are ready.'); }} />}
        {back && (
          <Dialog title={`Mark ${back.version} as rolled back?`} tag={{ text: 'The code does not change', tone: 'a' }} onClose={() => setBack(null)} width={460}>
            <p>Schools signed off on {back.version} are marked with the version they had before, and the rollout stops. The code they run changes only when the earlier version is deployed again.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}><button className="btn" onClick={() => setBack(null)}>Keep it</button><button className="btn dngf" disabled={rollback.isPending} onClick={() => rollback.mutate(back.id)}>Mark as rolled back</button></div>
          </Dialog>
        )}
      </>}>
      {rows.length === 0 ? (
        <div><EmptyCard title="Releases" chip={{ text: '0 releases', tone: 'v' }} scene="notebooks" heading="No releases yet" body="A release is a named version. Create one after a deploy, then start it: each school's health is checked wave by wave, and it pauses itself if a school looks unhealthy." actions={canWrite ? <button className="btn pri" onClick={() => setCreating(true)}>Create the first release</button> : undefined} /></div>
      ) : [<Tiles key="tiles" items={[
        { label: 'Releases', value: rows.length, note: `${rows.filter((r) => r.status === 'rolling').length} rolling out now`, tone: 'v' },
        { label: 'Latest', value: rows[0]!.version, note: LABEL[rows[0]!.status], tone: 'a' },
        { label: 'Schools on it', value: `${rows[0]!.waves.flatMap((w) => w.schools).filter((s) => s.state === 'done').length} of ${rows[0]!.waves.flatMap((w) => w.schools).length}`, note: 'updated so far', tone: 'i' },
      ]} />, ...rows.map((r) => {
        const all = r.waves.flatMap((w) => w.schools);
        const done = all.filter((s) => s.state === 'done').length;
        const live = ['rolling', 'paused', 'halted', 'done'].includes(r.status);
        return (
          <Card key={r.id} title={r.version} chip={<span className={`st ${TONE[r.status]}`}><i></i>{LABEL[r.status]}</span>}>
            <div className="help">{r.notes || 'No notes.'} · by {r.createdBy} · {ago(r.createdAt)}</div>
            {r.haltReason && <div className="emsg" role="alert" style={{ marginTop: 10 }}>{r.haltReason}</div>}
            {all.length > 0 && (
              <div className="us" style={{ margin: '12px 0 4px' }}>
                <div className="r">Schools updated<b>{done} of {all.length}</b></div>
                <div className="bar"><i style={{ width: `${(done / all.length) * 100}%` }}></i></div>
              </div>
            )}
            <div className="grid" style={{ marginTop: 12 }}>
              {r.waves.map((w) => (
                <div key={w.name} className="s4" style={{ minWidth: 0 }}>
                  <div className="lbl" style={{ marginBottom: 6 }}>{w.name} · {WAVE[w.status] ?? w.status}</div>
                  <div className="tgrow">{w.schools.map((s) => <span key={s.id} className={`st ${SCHOOL[s.state]}`}><i></i>{s.name}</span>)}{w.schools.length === 0 && <span className="help">No schools match.</span>}</div>
                </div>
              ))}
            </div>
            {canWrite && (
              <div className="tgrow" style={{ marginTop: 16 }}>
                {r.status === 'draft' && <button className="btn pri" onClick={() => start.mutate(r.id)} disabled={start.isPending}>Start rollout</button>}
                {(r.status === 'rolling' || r.status === 'paused') && <button className="btn" onClick={() => pause.mutate({ id: r.id, paused: r.status === 'rolling' })} disabled={pause.isPending}>{r.status === 'rolling' ? 'Pause' : 'Resume'}</button>}
                {live && r.status !== 'rolled_back' && <button className="btn dng" onClick={() => setBack(r)}>Mark as rolled back…</button>}
              </div>
            )}
          </Card>
        );
      })]}
    </Page>
  );
}

function CreateDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const app = useApp();
  const now = new Date();
  const [version, setVersion] = useState(`${now.getFullYear()}.${now.getMonth() + 1}.1`);
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');
  const shake = useShake();
  const create = useMutation({
    mutationFn: () => app.api.releases.create({ version: version.trim(), notes: notes.trim() }),
    onSuccess: onDone,
    onError: (e) => { setErr(e instanceof HttpError ? (e.fields.version ?? e.message) : (e as Error).message); shake.hit(); },
  });
  return (
    <Dialog title="New release" onClose={onClose} width={480} shake={shake.cls}>
      <Field label="Version" value={version} onChange={(v) => { setVersion(v); setErr(''); }} error={err} hint="Year, month and a number, like 2026.10.3" />
      <Field label="What changed" value={notes} onChange={setNotes} placeholder="Faster attendance, fee receipts in Hindi" />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" disabled={create.isPending} onClick={() => create.mutate()}>Create</button></div>
    </Dialog>
  );
}

/** How a release rolls out: the waves, when it stops by itself, and the window it prefers. Moved here from Blueprints. */
function RolloutRules({ say }: { say: (m: string, tone?: 'ok' | 'bad') => void }) {
  const app = useApp();
  const qc = useQueryClient();
  const policy = useQuery({ queryKey: ['policy'], queryFn: app.api.policy.get });
  const [pol, setPol] = useState<PolicyDoc | null>(null);
  useEffect(() => { if (policy.data) setPol(policy.data); }, [policy.data]);
  const save = useMutation({ mutationFn: (p: PolicyDoc) => app.api.policy.set(p), onSuccess: (p) => { qc.setQueryData(['policy'], p); say('Rollout rules saved.'); }, onError: (e) => say((e as Error).message, 'bad') });
  const can = app.can('policy.write');
  if (!pol) return <div className="skc" style={{ height: 320, borderRadius: 28 }} />;
  const ok = pol.waves.length > 0 && pol.waves.at(-1)!.matches === 'rest' && pol.waves.every((w) => w.name.trim().length > 0 && w.batch >= 1);
  const dirty = JSON.stringify(pol) !== JSON.stringify(policy.data);
  return (
    <Card title="Waves">
      <div className="help" style={{ marginTop: 0 }}>A release signs schools off one wave at a time and stops by itself if a school looks unhealthy. The last wave must be everyone else. Pilot schools are chosen on each school’s Configuration.</div>
      <div className="lscroll" style={{ marginTop: 12 }}>
        {pol.waves.map((w, i) => (
          <div key={i} className="wvr">
            <span className="av" style={{ width: 28, height: 28, fontSize: 12, background: 'var(--s2)', color: 'var(--ink3)', boxShadow: 'none' }}>{i + 1}</span>
            <input className="hws wide" style={{ width: 'auto', textAlign: 'left', padding: '0 12px', flex: '1 1 160px' }} aria-label={`Name of wave ${i + 1}`} value={w.name} disabled={!can} onChange={(e) => setPol({ ...pol, waves: pol.waves.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
            <Select compact aria-label={`Who is in wave ${i + 1}`} value={w.matches} disabled={!can} onChange={(v) => setPol({ ...pol, waves: pol.waves.map((x, j) => (j === i ? { ...x, matches: v as 'rest' } : x)) })} options={WAVE_KINDS.map(([value, label]) => ({ value, label }))} />
            <label className="hwc" style={{ whiteSpace: 'nowrap' }}>Schools at a time<NumberInput min={1} max={100} value={String(w.batch)} disabled={!can} aria-label="Schools at a time" onChange={(v) => setPol({ ...pol, waves: pol.waves.map((x, j) => (j === i ? { ...x, batch: Math.max(1, Number(v) || 1) } : x)) })} /></label>
            {can && <button className="btn sm dng" disabled={pol.waves.length < 2} aria-label={`Remove wave ${i + 1}`} onClick={() => setPol({ ...pol, waves: pol.waves.filter((_, j) => j !== i) })}>Remove</button>}
          </div>
        ))}
      </div>
      {!ok && <div className="emsg" role="alert" style={{ marginTop: 10 }}>The last wave must be “Everyone else”, and every wave needs a name and a batch size.</div>}
      <div className="two" style={{ marginTop: 12 }}>
        <NumberField label="Stop a rollout above (error %)" min={0} max={100} value={String(pol.halt.errorRatePct)} disabled={!can} onChange={(v) => setPol({ ...pol, halt: { ...pol.halt, errorRatePct: Number(v) } })} />
        <NumberField label="…or when p95 passes (ms)" min={100} step={50} value={String(pol.halt.p95Ms)} disabled={!can} onChange={(v) => setPol({ ...pol, halt: { ...pol.halt, p95Ms: Number(v) } })} />
      </div>
      <Field label="Maintenance window" value={pol.maintenanceWindow} onChange={(v) => setPol({ ...pol, maintenanceWindow: v })} disabled={!can} hint="Shown to schools. Releases prefer this time." />
      <div className="help">The app bundle prefix is under <a href={url('/builds')} onClick={(e) => { e.preventDefault(); app.go('/builds'); }}>Mobile builds → Build settings</a>.</div>
      {can && (
        <div className="tgrow" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => setPol({ ...pol, waves: [...pol.waves.slice(0, -1), { name: 'Next group', matches: 'pilot', batch: 5 }, pol.waves.at(-1)!] })}>Add a wave</button>
          <button className="btn pri" disabled={!dirty || !ok || save.isPending} onClick={() => save.mutate(pol)}>Save rollout rules</button>
        </div>
      )}
    </Card>
  );
}
