import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HttpError, uploadFile } from '@tangent/api-client';
import type { Category, NoticeRow } from '@tangent/contracts';
import { Checkbox, DateField, Dialog, Field, SelectField, TimeField, useShake, Icon, EmptyState } from '@tangent/web-ui';
import { useApp } from '../../app/context';
import { Page, useToast } from '../../app/Page';
import { Attach, useSetting } from '../../app/kit';

const TONE: Record<NoticeRow['status'], string> = { draft: 'n', pending: 'a', scheduled: 'v', published: 'g' };
const LABEL: Record<NoticeRow['status'], string> = { draft: 'Draft', pending: 'Waiting for approval', scheduled: 'Scheduled', published: 'Sent' };
const AUDIENCE: Record<string, string> = { everyone: 'Everyone', parents: 'Parents', students: 'Students', staff: 'Staff', class: 'One class' };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

/**
 * What the school tells families, students and staff: written here or by teachers in the app, sent now or at a set time,
 * approved where the school asks, corrected or taken down later. Each sent notice shows how many opened it and, when it asked,
 * who has not acknowledged it yet.
 */
export function NoticesPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [dlg, setDlg] = useState<{ kind: 'new' } | { kind: 'edit'; n: NoticeRow } | { kind: 'down'; n: NoticeRow } | { kind: 'acks'; n: NoticeRow } | null>(() =>
    new URLSearchParams(window.location.search).get('new') ? { kind: 'new' } : null);
  const list = useQuery({ queryKey: ['notices'], queryFn: app.api.notices.list });
  const cats = useSetting<Category[]>('notices.categories', []);
  const rows = list.data ?? [];
  const canWrite = app.user.permissions.includes('notices.write');
  const mayChange = (n: NoticeRow) => canWrite && (n.authorId === app.user.id || app.user.permissions.includes('notices.publish'));
  const done = (msg: string) => { setDlg(null); void qc.invalidateQueries({ predicate: (q) => ['notices', 'dashboard', 'shell'].includes(String(q.queryKey[0])) }); say(msg); };
  return (
    <Page title="Notices" sub="What the school tells families, students and staff" toast={toast} loading={list.isLoading}
      error={list.isError && !list.data ? { message: (list.error as Error).message, retry: () => void list.refetch() } : null}
      actions={canWrite ? <button className="btn pri" onClick={() => setDlg({ kind: 'new' })}><Icon name="plus" />New notice</button> : undefined}
      overlays={<>
        {(dlg?.kind === 'new' || dlg?.kind === 'edit') && <Compose n={dlg.kind === 'edit' ? dlg.n : undefined} onClose={() => setDlg(null)} onDone={done} />}
        {dlg?.kind === 'down' && <TakeDown n={dlg.n} onClose={() => setDlg(null)} onDone={done} />}
        {dlg?.kind === 'acks' && <NotAcked n={dlg.n} onClose={() => setDlg(null)} />}
      </>}>
      {rows.length === 0 ? (
        <div><EmptyState scene="notices" onAction={canWrite ? () => setDlg({ kind: 'new' }) : undefined} /></div>
      ) : (
        <section className="card rise">
          {rows.map((n) => {
            const cat = cats.find((c) => c.key === n.category);
            return (
              <article className="ntc" key={n.id}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  {n.pinned && <span className="chip k">Pinned</span>}
                  <b>{n.title}</b>
                  <span className={`st ${TONE[n.status]}`}><i></i>{LABEL[n.status]}{n.status === 'scheduled' ? ` · ${when(n.publishAt)}` : ''}</span>
                  {cat && <span className={`chip ${cat.tone}`}>{cat.name}</span>}
                  <span className="chip">{n.audience === 'class' ? `Class ${n.className ?? ''}` : AUDIENCE[n.audience] ?? n.audience}</span>
                  <span style={{ marginLeft: 'auto', font: '600 12px var(--fb)', color: 'var(--ink3)' }}>{n.author} · {when(n.publishedAt ?? n.createdAt)}{n.editedAt ? ' · edited' : ''}</span>
                </div>
                <p>{n.body}</p>
                {n.files.length > 0 && <div className="help" style={{ margin: 0 }}>Attached: {n.files.map((f) => f.name).join(', ')}</div>}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                  {n.status === 'published' && <span className="help" style={{ margin: 0 }}>Opened by {n.reach.read} of {n.reach.audience}{n.needsAck ? ` · acknowledged by ${n.reach.acked}` : ''}</span>}
                  <span style={{ flex: 1 }} />
                  {n.status === 'published' && n.needsAck && n.reach.acked < n.reach.audience && <button className="btn sm" onClick={() => setDlg({ kind: 'acks', n })}>Who has not acknowledged</button>}
                  {mayChange(n) && <button className="btn sm" onClick={() => setDlg({ kind: 'edit', n })}>{n.status === 'published' ? 'Correct' : 'Change'}</button>}
                  {mayChange(n) && <button className="btn sm" onClick={() => setDlg({ kind: 'down', n })}>{n.status === 'published' ? 'Take down' : 'Delete'}</button>}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </Page>
  );
}

/** Today in IST as YYYY-MM-DD, for the earliest day a notice can be scheduled. */
const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

function Compose({ n, onClose, onDone }: { n?: NoticeRow; onClose: () => void; onDone: (msg: string) => void }) {
  const app = useApp();
  const classes = useQuery({ queryKey: ['classes'], queryFn: app.api.classes, staleTime: 5 * 60_000 });
  const cats = useSetting<Category[]>('notices.categories', []);
  const canPublish = app.user.permissions.includes('notices.publish');
  const canPin = app.user.permissions.includes('notices.pin');
  const at = n?.publishAt ? new Date(new Date(n.publishAt).getTime() + 5.5 * 3600_000).toISOString() : '';
  const [f, setF] = useState({
    title: n?.title ?? '', body: n?.body ?? '', audience: n?.audience ?? (canPublish ? 'everyone' : 'class'), classId: n?.classId ?? '', category: n?.category ?? cats[0]?.key ?? 'academic',
    pinned: n?.pinned ?? false, needsAck: n?.needsAck ?? false, later: !!n?.publishAt, day: at.slice(0, 10), time: at.slice(11, 16) || '08:00', tellAgain: false,
  });
  const [err, setErr] = useState<Record<string, string>>({});
  const shake = useShake();
  const [files, setFiles] = useState<File[]>([]);
  const published = n?.status === 'published';
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => { setF((x) => ({ ...x, [k]: v })); setErr((e) => ({ ...e, [k]: '', _: '' })); };
  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const body = {
        title: f.title.trim(), body: f.body.trim(), audience: f.audience as 'everyone', classId: f.audience === 'class' ? f.classId : undefined, category: f.category || cats[0]?.key || 'academic',
        pinned: f.pinned, needsAck: f.needsAck, publish, publishAt: f.later && !published ? new Date(`${f.day}T${f.time}:00+05:30`).toISOString() : null, fileIds: [],
      };
      const saved = n ? await app.api.notices.update(n.id, { ...body, tellAgain: f.tellAgain }) : await app.api.notices.create(body);
      const failed: string[] = [];
      for (const file of files) await uploadFile(app.api, 'notice_attachment', saved.id, file).catch(() => failed.push(file.name));
      return { saved, failed };
    },
    onSuccess: ({ saved, failed }) => onDone(`${published ? (f.tellAgain ? 'Corrected, and everyone it is for was told again.' : 'Corrected. It shows as edited.')
      : saved.status === 'published' ? 'Sent to everyone it is for.' : saved.status === 'pending' ? 'Saved and sent for approval.' : saved.status === 'scheduled' ? `Scheduled for ${when(saved.publishAt)}.` : 'Saved as a draft.'}${failed.length ? ` ${failed.join(', ')} could not be attached.` : ''}`),
    onError: (e) => { setErr(e instanceof HttpError && Object.keys(e.fields).length ? e.fields : { _: (e as Error).message }); shake.hit(); },
  });
  const go = (publish: boolean) => {
    const p: Record<string, string> = {};
    if (f.title.trim().length < 3) p.title = 'Give the notice a title.';
    if (f.body.trim().length < 3) p.body = 'Write the notice.';
    if (f.audience === 'class' && !f.classId) p.classId = 'Pick the class.';
    if (f.later && !published && (!f.day || new Date(`${f.day}T${f.time}:00+05:30`) <= new Date())) p.day = 'Choose a time that has not passed yet.';
    setErr(p);
    if (Object.keys(p).length) shake.hit(); else save.mutate(publish);
  };
  const audiences = Object.entries(AUDIENCE).filter(([k]) => canPublish || k === 'class');
  return (
    <Dialog title={n ? (published ? 'Correct a notice' : 'Change a notice') : 'New notice'} onClose={onClose} width={600} shake={shake.cls}>
      <div className="stack">
        <Field label="Title" value={f.title} onChange={set('title')} error={err.title} maxLength={120} />
        <div className="fld">
          <label htmlFor="ntc-body">Notice</label>
          <div className={`inp ${err.body ? 'err shake' : ''}`} style={{ height: 'auto' }}>
            <textarea id="ntc-body" className="ta" value={f.body} onChange={(e) => set('body')(e.target.value)} maxLength={4000} aria-invalid={!!err.body} />
          </div>
          {err.body && <div className="emsg" role="alert">{err.body}</div>}
        </div>
        <div className="two">
          <SelectField label="Who it is for" value={f.audience} onChange={set('audience')} options={audiences.map(([value, label]) => ({ value, label }))} />
          {f.audience === 'class' && <SelectField label="Class" value={f.classId} onChange={set('classId')} options={[{ value: '', label: 'Pick a class' }, ...(classes.data ?? []).map((c) => ({ value: c.id, label: `Class ${c.name}` }))]} error={err.classId} />}
        </div>
        {!canPublish && <div className="help">You write to the classes you teach. A notice for the whole school comes from the office.</div>}
        <SelectField label="Category" value={f.category} onChange={set('category')} error={err.category} options={cats.map((c) => ({ value: c.key, label: c.name }))} />
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {canPin && <Checkbox checked={f.pinned} onChange={set('pinned')} label="Pin to the top" />}
          <Checkbox checked={f.needsAck} onChange={set('needsAck')} label="Ask families to acknowledge it" />
          {!published && <Checkbox checked={f.later} onChange={set('later')} label="Send it later" />}
          {published && <Checkbox checked={f.tellAgain} onChange={set('tellAgain')} label="Tell everyone again" />}
        </div>
        {f.later && !published && <div className="two"><DateField label="Day" value={f.day} min={today()} onChange={set('day')} error={err.day} /><TimeField label="Time" value={f.time} onChange={set('time')} /></div>}
        <Attach files={files} onChange={setFiles} />
        {n && n.files.length > 0 && <div className="help">Already attached: {n.files.map((x) => x.name).join(', ')}</div>}
        {err._ && <div className="emsg" role="alert">{err._}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        {!published && <button className="btn" disabled={save.isPending} onClick={() => go(false)}>Save as draft</button>}
        <button className="btn pri" disabled={save.isPending} onClick={() => go(true)}>{published ? 'Save the correction' : f.later ? (canPublish ? 'Schedule' : 'Schedule, after approval') : canPublish ? 'Send now' : 'Send for approval'}</button>
      </div>
    </Dialog>
  );
}

function TakeDown({ n, onClose, onDone }: { n: NoticeRow; onClose: () => void; onDone: (msg: string) => void }) {
  const app = useApp();
  const go = useMutation({ mutationFn: () => app.api.notices.remove(n.id), onSuccess: () => onDone(n.status === 'published' ? `“${n.title}” was taken down. It no longer shows in the app.` : `“${n.title}” was deleted.`) });
  return (
    <Dialog title={n.status === 'published' ? 'Take this notice down?' : 'Delete this notice?'} onClose={onClose} width={460}>
      <p className="help" style={{ margin: 0 }}>{n.status === 'published' ? 'It leaves every phone at once. People who already read it keep what they saw; the audit log keeps the record.' : 'It was never sent, so nobody has seen it.'}</p>
      {go.isError && <div className="emsg" role="alert" style={{ marginTop: 12 }}>{(go.error as Error).message}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Keep it</button>
        <button className="btn dng" disabled={go.isPending} onClick={() => go.mutate()}>{n.status === 'published' ? 'Take down' : 'Delete'}</button>
      </div>
    </Dialog>
  );
}

function NotAcked({ n, onClose }: { n: NoticeRow; onClose: () => void }) {
  const app = useApp();
  const q = useQuery({ queryKey: ['notice-acks', n.id], queryFn: () => app.api.notices.notAcknowledged(n.id) });
  return (
    <Dialog title="Who has not acknowledged" tag={{ text: `${(q.data ?? []).length} people`, tone: 'a' }} onClose={onClose} width={480}>
      <div className="help" style={{ marginTop: 0 }}>{n.title}</div>
      <div style={{ maxHeight: 360, overflow: 'auto' }}>
        {q.isLoading ? <div className="help">Loading…</div> : (q.data ?? []).map((p) => <div key={p.id} className="kv">{p.name}<b className="num">{p.phone ?? '–'}</b></div>)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}><button className="btn" onClick={onClose}>Close</button></div>
    </Dialog>
  );
}
