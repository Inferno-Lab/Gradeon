import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChangeRequestRow } from '@gradeon/contracts';
import { Dialog, EmptyCard, ErrorLine, Segmented, tintFor, useShake } from '@gradeon/web-ui';
import { Card, Page, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { url } from '../../app/base';
import { ago, initials } from '../../app/format';

/** What schools ask Gradeon to change ("Ask Gradeon to change this" in their School setup). */
export function RequestsPage() {
  const app = useApp();
  const { toast, say } = useToast();
  const [show, setShow] = useState<'open' | 'all'>('open');
  const [answering, setAnswering] = useState<ChangeRequestRow | null>(null);
  const q = useQuery({ queryKey: ['change-requests', show], queryFn: () => app.api.changeRequests.list(show) });
  const rows = q.data ?? [];
  return (
    <Page title="Requests" sub="Changes schools have asked for. Make the change under the school’s Configuration or Roles, then answer here." toast={toast}
      loading={q.isLoading} error={q.isError ? { message: (q.error as Error).message, retry: () => void q.refetch() } : null}
      actions={<Segmented options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} value={show} onChange={(v) => setShow(v as 'open' | 'all')} label="Which requests" />}
      overlays={answering && <AnswerDialog r={answering} onClose={() => setAnswering(null)} onDone={(m) => { setAnswering(null); say(m); }} />}>
      {rows.length === 0 ? (
        <div><EmptyCard title="Requests" chip={{ text: show === 'open' ? '0 open' : '0', tone: 'v' }} scene="envelope" heading={show === 'open' ? 'Nothing waiting' : 'No requests yet'} body="When a school asks for a change to its setup, it appears here with who asked and why." /></div>
      ) : (
        <Card style={{ padding: 0 }}>
          {rows.map((r) => {
            const t = tintFor(r.schoolName);
            return (
              <div key={r.id} className="rw" style={{ height: 'auto', padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <span className="av" style={{ width: 34, height: 34, fontSize: 11, background: t.bg, color: t.fg, boxShadow: 'none', flex: 'none' }}>{initials(r.schoolName)}</span>
                <span style={{ flex: 1, minWidth: 220 }}>
                  <a href={url(`/schools/${r.schoolId}`)} onClick={(e) => { e.preventDefault(); app.go(`/schools/${r.schoolId}`); }} style={{ font: '700 14px var(--fb)', color: 'inherit' }}>{r.schoolName}</a>
                  <span className="chip" style={{ marginLeft: 8 }}>{r.area}</span>
                  <p style={{ margin: '6px 0 0', font: '500 14px/1.5 var(--fb)' }}>{r.message}</p>
                  <small style={{ color: 'var(--ink3)' }}>{r.requestedBy} · {ago(r.createdAt)}{r.answer ? ` · answered: ${r.answer}` : ''}</small>
                </span>
                {r.status === 'open'
                  ? (app.can('schools.configure') && <button className="btn sm pri" onClick={() => setAnswering(r)}>Answer</button>)
                  : <span className={`chip ${r.status === 'done' ? 'g' : 'c'}`}>{r.status === 'done' ? 'Done' : 'Declined'}</span>}
              </div>
            );
          })}
        </Card>
      )}
    </Page>
  );
}

function AnswerDialog({ r, onClose, onDone }: { r: ChangeRequestRow; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const qc = useQueryClient();
  const [answer, setAnswer] = useState('');
  const [err, setErr] = useState('');
  const shake = useShake();
  const go = useMutation({
    mutationFn: (status: 'done' | 'declined') => app.api.changeRequests.answer(r.id, { status, answer: answer.trim() }),
    onSuccess: (_, status) => { void qc.invalidateQueries({ queryKey: ['change-requests'] }); onDone(status === 'done' ? 'Marked done. The school sees your answer.' : 'Declined. The school sees your answer.'); },
    onError: (e) => { setErr((e as Error).message); shake.hit(); },
  });
  const send = (status: 'done' | 'declined') => { if (answer.trim().length < 2) { setErr('Write a short answer for the school.'); shake.hit(); } else go.mutate(status); };
  return (
    <Dialog title={`Answer ${r.schoolName}`} tag={{ text: r.area, tone: 'v' }} onClose={onClose} width={540} shake={shake.cls}>
      <p style={{ margin: '0 0 12px', font: '500 14px/1.5 var(--fb)' }}>{r.message}</p>
      <div className="fld">
        <label htmlFor="req-answer">Your answer</label>
        <div className={`inp ${err ? 'err' : ''}`} style={{ height: 'auto' }}>
          <textarea id="req-answer" value={answer} onChange={(e) => { setAnswer(e.target.value); setErr(''); }} maxLength={600} placeholder="For example: done, Fees is now in the app’s bottom tabs."
            style={{ width: '100%', minHeight: 100, resize: 'vertical', border: 0, outline: 0, background: 'none', font: '500 14px/1.5 var(--fb)', color: 'var(--ink)', padding: '10px 0' }} />
        </div>
        {err && <ErrorLine>{err}</ErrorLine>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn dng" disabled={go.isPending} onClick={() => send('declined')}>Decline</button>
        <button className="btn pri" disabled={go.isPending} onClick={() => send('done')}>Mark done</button>
      </div>
    </Dialog>
  );
}
