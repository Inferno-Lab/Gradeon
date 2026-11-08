import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HttpError } from '@gradeon/api-client';
import { Dialog, EmptyCard, Field, useShake } from '@gradeon/web-ui';
import type { ReleaseRow } from '@gradeon/contracts';
import { Card, Page, Tiles, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { ago } from '../../app/format';

const TONE: Record<ReleaseRow['status'], string> = { draft: 'n', rolling: 'v', paused: 'a', halted: 'c', done: 'g', rolled_back: 'a' };
const LABEL: Record<ReleaseRow['status'], string> = { draft: 'Ready to start', rolling: 'Rolling out', paused: 'Paused', halted: 'Halted', done: 'Finished', rolled_back: 'Rolled back' };
const SCHOOL: Record<string, string> = { pending: 'n', rolling: 'v', done: 'g', failed: 'c', rolled_back: 'a' };

export function ReleasesPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
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
    <Page title="Releases" sub="Every school runs the code deployed last, and its database is updated when the server starts. A release signs schools off in waves: your own first, then a pilot group, then everyone else" toast={toast} loading={list.isLoading} error={list.isError ? { message: (list.error as Error).message, retry: () => void list.refetch() } : null}
      actions={canWrite ? <button className="btn pri" onClick={() => setCreating(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d="M12 5v14M5 12h14"></path></svg>New release</button> : undefined}
      overlays={<>
        {creating && <CreateDialog onClose={() => setCreating(false)} onDone={() => { setCreating(false); refresh(); say('Release created. Start it when you are ready.'); }} />}
        {back && (
          <Dialog title={`Roll back ${back.version}?`} tag={{ text: 'Goes back one version', tone: 'a' }} onClose={() => setBack(null)} width={460}>
            <p>Schools already signed off on {back.version} are marked with the version they had before. This does not change the code they run: to undo a code change, redeploy the earlier version.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}><button className="btn" onClick={() => setBack(null)}>Keep it</button><button className="btn dngf" disabled={rollback.isPending} onClick={() => rollback.mutate(back.id)}>Roll back</button></div>
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
                  <div className="lbl" style={{ marginBottom: 6 }}>{w.name} · {w.status}</div>
                  <div className="tgrow">{w.schools.map((s) => <span key={s.id} className={`st ${SCHOOL[s.state]}`}><i></i>{s.name}</span>)}{w.schools.length === 0 && <span className="help">No schools match.</span>}</div>
                </div>
              ))}
            </div>
            {canWrite && (
              <div className="tgrow" style={{ marginTop: 16 }}>
                {r.status === 'draft' && <button className="btn pri" onClick={() => start.mutate(r.id)} disabled={start.isPending}>Start rollout</button>}
                {(r.status === 'rolling' || r.status === 'paused') && <button className="btn" onClick={() => pause.mutate({ id: r.id, paused: r.status === 'rolling' })} disabled={pause.isPending}>{r.status === 'rolling' ? 'Pause' : 'Resume'}</button>}
                {live && r.status !== 'rolled_back' && <button className="btn dng" onClick={() => setBack(r)}>Roll back</button>}
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
