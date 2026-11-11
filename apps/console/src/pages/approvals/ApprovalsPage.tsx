import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HttpError } from '@gradeon/api-client';
import { ACTION_LABELS, SETTINGS_META, type ActionRow } from '@gradeon/contracts';
import { AreaField, Dialog, EmptyCard, Select, useShake } from '@gradeon/web-ui';
import { Card, Page, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { ago, when } from '../../app/format';

const TONE: Record<ActionRow['status'], string> = { pending_approval: 'a', running: 'v', done: 'g', failed: 'c', rejected: 'n' };
const LABEL: Record<ActionRow['status'], string> = { pending_approval: 'Waiting for approval', running: 'Running', done: 'Done', failed: 'Failed', rejected: 'Rejected' };
const name = (r: ActionRow) => `${ACTION_LABELS[r.action] ?? r.action}${r.schoolName ? ` · ${r.schoolName}` : ''}`;
/** A setting's value in words: on and off, a list joined, nothing as a dash. */
const shown = (v: unknown) => (v == null || v === '' ? '–' : typeof v === 'boolean' ? (v ? 'On' : 'Off') : Array.isArray(v) ? v.join(', ') || '–' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** The console team's own queue: risky changes wait here for a second person, who sees exactly what would change. */
export function ApprovalsPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [rejecting, setRejecting] = useState<ActionRow | null>(null);
  const [show, setShow] = useState<'all' | ActionRow['status']>('all');
  const list = useQuery({ queryKey: ['actions'], queryFn: app.api.actions.list, refetchInterval: 8000 });
  const done = () => void qc.invalidateQueries({ predicate: (q) => ['actions', 'schools', 'fleet', 'school'].includes(String(q.queryKey[0])) });
  const approve = useMutation({
    mutationFn: (id: string) => app.api.actions.approve(id),
    onSuccess: (r) => { done(); say(r.status === 'failed' ? `It did not work: ${r.summary}` : 'Approved and carried out.', r.status === 'failed' ? 'bad' : 'ok'); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  const rows = list.data ?? [];
  const waiting = rows.filter((r) => r.status === 'pending_approval');
  const past = rows.filter((r) => r.status !== 'pending_approval' && (show === 'all' || r.status === show));
  const mayDecide = app.can('schools.danger');
  return (
    <Page title="Approvals" sub={waiting.length ? `${waiting.length} waiting for a second person` : 'Risky changes need a second person to say yes'} toast={toast} loading={list.isLoading} error={list.isError ? { message: (list.error as Error).message, retry: () => void list.refetch() } : null}
      overlays={rejecting && <Reject row={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); done(); say('Rejected. Nothing was changed, and the reason is kept with the request.'); }} />}>
      <section className="grid">
        <Card title="Waiting" chip={<span className={`chip ${waiting.length ? 'a' : 'g'}`}>{waiting.length}</span>} span="s12">
          {waiting.length === 0 && (
            <EmptyCard title="Waiting" chip={{ text: 'All clear', tone: 'g' }} scene="checklist" heading="Nothing needs approving" body="Erasing a school, restoring a backup and other risky changes land here for a second person. Which ones is set under Console settings. You can’t approve your own." />
          )}
          {waiting.map((r) => {
            const own = r.requestedBy === app.user.email;
            return (
              <div key={r.id} style={{ padding: '12px 0', borderTop: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <span style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <b style={{ display: 'block', font: '700 15px var(--fb)' }}>{name(r)}</b>
                    <span style={{ display: 'block', font: '600 14px var(--fb)', color: 'var(--ink2)', marginTop: 4 }}>{r.asked}</span>
                    <small style={{ color: 'var(--ink3)' }}>Asked by {r.requestedBy} · {ago(r.createdAt)}{r.note ? ` · “${r.note}”` : ''}</small>
                  </span>
                  <span className="tgrow">
                    <button className="btn sm" disabled={!mayDecide} onClick={() => setRejecting(r)}>Reject</button>
                    <button className="btn pri sm" disabled={!mayDecide || own || approve.isPending} data-tip={own ? 'A second person has to approve this' : undefined} onClick={() => approve.mutate(r.id)}>Approve</button>
                  </span>
                </div>
                {r.changes.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    {r.changes.map((c) => (
                      <div key={c.key} className="kv" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <span>{SETTINGS_META[c.key as keyof typeof SETTINGS_META]?.label ?? c.key}</span>
                        <b style={{ textAlign: 'right' }}><span style={{ color: 'var(--ink3)', textDecoration: 'line-through' }}>{shown(c.before)}</span> → {shown(c.after)}</b>
                      </div>
                    ))}
                  </div>
                )}
                {own && <div className="help">You asked for this, so someone else has to approve it.</div>}
              </div>
            );
          })}
        </Card>
        <Card title="Decided" span="s12" chip={<Select compact aria-label="Show" value={show} onChange={(v) => setShow(v as typeof show)} options={[{ value: 'all', label: 'Everything' }, { value: 'done', label: 'Done' }, { value: 'failed', label: 'Failed' }, { value: 'rejected', label: 'Rejected' }, { value: 'running', label: 'Running' }]} />}>
          {past.length === 0 && <div className="help">Finished requests show up here. The full history is each school’s Audit tab.</div>}
          {past.map((r) => (
            <div key={r.id} className="kv" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 260px', minWidth: 0 }}>
                {name(r)}
                <small style={{ display: 'block', color: 'var(--ink3)' }}>
                  {r.dryRun ? 'Rehearsal · ' : ''}Asked by {r.requestedBy}{r.approvedBy ? ` · ${r.status === 'rejected' ? 'rejected' : 'approved'} by ${r.approvedBy}` : ''} · {when(r.finishedAt ?? r.createdAt)}
                </small>
                {(r.status === 'rejected' ? r.decisionNote : r.summary !== r.asked ? r.summary : '') && <small style={{ display: 'block', color: r.status === 'failed' ? 'var(--c)' : 'var(--ink2)' }}>{r.status === 'rejected' ? `Why: ${r.decisionNote}` : r.summary}</small>}
              </span>
              <b><span className={`st ${TONE[r.status]}`}><i></i>{LABEL[r.status]}</span></b>
            </div>
          ))}
        </Card>
      </section>
    </Page>
  );
}

function Reject({ row, onClose, onDone }: { row: ActionRow; onClose: () => void; onDone: () => void }) {
  const app = useApp();
  const shake = useShake();
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const go = useMutation({
    mutationFn: () => app.api.actions.reject(row.id, note.trim()),
    onSuccess: onDone,
    onError: (e) => { setErr(e instanceof HttpError ? (e.fields.note ?? e.message) : (e as Error).message); shake.hit(); },
  });
  return (
    <Dialog title="Reject this request" tag={{ text: ACTION_LABELS[row.action] ?? row.action, tone: 'a' }} onClose={onClose} width={480} shake={shake.cls}>
      <p style={{ marginTop: 0 }}>{row.asked}</p>
      <AreaField label="Why" value={note} onChange={(v) => { setNote(v); setErr(''); }} error={err} rows={3} maxLength={500} placeholder="For example: wait until the school’s term ends" />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn dngf" disabled={go.isPending} onClick={() => { if (note.trim().length < 5) { setErr('Say why, so the person who asked knows what to change.'); shake.hit(); } else go.mutate(); }}>Reject</button>
      </div>
    </Dialog>
  );
}
