import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HttpError, uploadFile } from '@gradeon/api-client';
import type { NoticeRow } from '@gradeon/contracts';
import { Dialog, EmptyCard, Field, SelectField, useShake } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { Page, useToast } from '../../app/Page';
import { Attach } from '../../app/kit';

const TONE: Record<NoticeRow['status'], string> = { draft: 'n', pending: 'a', published: 'g' };
const LABEL: Record<NoticeRow['status'], string> = { draft: 'Draft', pending: 'Waiting for approval', published: 'Sent' };
const AUDIENCE: Record<string, string> = { everyone: 'Everyone', parents: 'Parents', staff: 'Staff', class: 'One class' };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export function NoticesPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [composing, setComposing] = useState(false);
  const list = useQuery({ queryKey: ['notices'], queryFn: app.api.notices.list });
  const rows = list.data ?? [];
  const canWrite = app.user.permissions.includes('notices.write');
  return (
    <Page title="Notices" sub="What the school tells families and staff" toast={toast} loading={list.isLoading}
      error={list.isError && !list.data ? { message: (list.error as Error).message, retry: () => void list.refetch() } : null}
      actions={canWrite ? <button className="btn pri" onClick={() => setComposing(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d="M12 5v14M5 12h14"></path></svg>New notice</button> : undefined}
      overlays={composing && <Compose onClose={() => setComposing(false)} onDone={(msg) => { setComposing(false); void qc.invalidateQueries({ predicate: (q) => ['notices', 'dashboard', 'shell'].includes(String(q.queryKey[0])) }); say(msg); }} />}>
      {rows.length === 0 ? (
        <div><EmptyCard title="Notices" chip={{ text: '0 notices', tone: 'v' }} scene="noticeboard" heading="Nothing has been posted yet" body="Write a notice for everyone, for parents, for staff or for one class. It goes to the app, and to people’s phones." actions={canWrite ? <button className="btn pri" onClick={() => setComposing(true)}>Write the first notice</button> : undefined} /></div>
      ) : (
        <section className="card rise">
          {rows.map((n) => (
            <article className="ntc" key={n.id}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <b>{n.title}</b>
                <span className={`st ${TONE[n.status]}`}><i></i>{LABEL[n.status]}</span>
                <span className="chip">{AUDIENCE[n.audience] ?? n.audience}</span>
                <span style={{ marginLeft: 'auto', font: '600 12px var(--fb)', color: 'var(--ink3)' }}>{n.author} · {when(n.publishedAt ?? n.createdAt)}</span>
              </div>
              <p>{n.body}</p>
            </article>
          ))}
        </section>
      )}
    </Page>
  );
}

function Compose({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const app = useApp();
  const classes = useQuery({ queryKey: ['classes'], queryFn: app.api.classes, staleTime: 5 * 60_000 });
  const [f, setF] = useState({ title: '', body: '', audience: 'everyone', classId: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const shake = useShake();
  const canPublish = app.user.permissions.includes('notices.publish');
  const [files, setFiles] = useState<File[]>([]);
  const create = useMutation({
    mutationFn: async (publish: boolean) => {
      const n = await app.api.notices.create({ title: f.title.trim(), body: f.body.trim(), audience: f.audience as 'everyone', classId: f.audience === 'class' ? f.classId : undefined, publish });
      const failed: string[] = [];
      for (const file of files) await uploadFile(app.api, 'notice_attachment', n.id, file).catch(() => failed.push(file.name));
      return { n, failed };
    },
    onSuccess: ({ n, failed }) => onDone(`${n.status === 'published' ? 'Sent to everyone it is for.' : n.status === 'pending' ? 'Saved and sent for approval.' : 'Saved as a draft.'}${failed.length ? ` ${failed.join(', ')} could not be attached.` : ''}`),
    onError: (e) => { setErr(e instanceof HttpError && Object.keys(e.fields).length ? e.fields : { _: (e as Error).message }); shake.hit(); },
  });
  const go = (publish: boolean) => {
    const p: Record<string, string> = {};
    if (f.title.trim().length < 3) p.title = 'Give the notice a title.';
    if (f.body.trim().length < 3) p.body = 'Write the notice.';
    if (f.audience === 'class' && !f.classId) p.classId = 'Pick the class.';
    setErr(p);
    if (Object.keys(p).length) shake.hit(); else create.mutate(publish);
  };
  return (
    <Dialog title="New notice" onClose={onClose} width={560} shake={shake.cls}>
      <div className="stack">
        <Field label="Title" value={f.title} onChange={(title) => { setF({ ...f, title }); setErr({ ...err, title: '' }); }} error={err.title} maxLength={120} />
        <div className="fld">
          <label htmlFor="ntc-body">Notice</label>
          <div className={`inp ${err.body ? 'err shake' : ''}`} style={{ height: 'auto' }}>
            <textarea id="ntc-body" className="ta" value={f.body} onChange={(e) => { setF({ ...f, body: e.target.value }); setErr({ ...err, body: '' }); }} maxLength={4000} aria-invalid={!!err.body} />
          </div>
          {err.body && <div className="emsg" role="alert">{err.body}</div>}
        </div>
        <div className="two">
          <SelectField label="Who it is for" value={f.audience} onChange={(audience) => setF({ ...f, audience })} options={Object.entries(AUDIENCE).map(([value, label]) => ({ value, label }))} />
          {f.audience === 'class' && <SelectField label="Class" value={f.classId} onChange={(classId) => setF({ ...f, classId })} options={[{ value: '', label: 'Pick a class' }, ...(classes.data ?? []).map((c) => ({ value: c.id, label: `Class ${c.name}` }))]} error={err.classId} />}
        </div>
        <Attach files={files} onChange={setFiles} />
        {err._ && <div className="emsg" role="alert">{err._}</div>}
        {!canPublish && <div className="help">Notices to families wait for the principal’s approval before they send.</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={create.isPending} onClick={() => go(false)}>Save as draft</button>
        <button className="btn pri" disabled={create.isPending} onClick={() => go(true)}>{canPublish ? 'Send now' : 'Send for approval'}</button>
      </div>
    </Dialog>
  );
}
