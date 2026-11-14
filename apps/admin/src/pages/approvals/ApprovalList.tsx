import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApprovalKind, ApprovalRow } from '@gradeon/contracts';
import { Dialog, EmptyCard, useShake, EmptyState } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { AreaField, Avatar, problem } from '../../app/kit';

export type ApprovalView = 'waiting' | 'sent' | 'decided';

const STATUS: Record<ApprovalRow['status'], { text: string; tone: string }> = {
  pending: { text: 'Waiting', tone: 'a' }, approved: { text: 'Approved', tone: 'g' }, rejected: { text: 'Declined', tone: 'c' }, withdrawn: { text: 'Withdrawn', tone: '' },
};
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/**
 * Requests for one view (waiting for me, sent by me, decided), optionally of one kind; approve, or decline saying why. Returns the
 * list and its dialog, which the page puts in its overlays.
 */
export function useApprovalList(view: ApprovalView, kind: ApprovalKind | undefined, say: (text: string, tone?: 'bad') => void, enabled = true): { list: React.ReactNode; overlay: React.ReactNode } {
  const app = useApp();
  const qc = useQueryClient();
  const may = app.user.permissions.includes('approvals.decide');
  const list = useQuery({ queryKey: ['approvals', view, kind ?? ''], queryFn: () => app.api.approvals.list(view, kind), enabled });
  const [declining, setDeclining] = useState<ApprovalRow | null>(null);
  const decide = useMutation({
    mutationFn: (a: { row: ApprovalRow; decision: 'approve' | 'reject' | 'undo'; note?: string }) => app.api.approvals.decide(a.row.id, { decision: a.decision, note: a.note }),
    onSuccess: (r, a) => {
      setDeclining(null);
      void qc.invalidateQueries({ predicate: (q) => ['approvals', 'dashboard', 'shell', 'attendance-day'].includes(String(q.queryKey[0])) });
      say(a.decision === 'undo' ? 'Back to waiting.' : r.doneText || (a.decision === 'approve' ? 'Approved.' : 'Declined. They are told why.'));
    },
    onError: (e) => say(Object.values(problem(e))[0] ?? 'That did not go through. Try again.', 'bad'),
  });

  const overlay = declining && <Decline row={declining} busy={decide.isPending} onClose={() => setDeclining(null)} onDecline={(note) => decide.mutate({ row: declining, decision: 'reject', note })} />;
  if (list.isLoading) return { list: <div className="skc" style={{ height: 240, borderRadius: 16 }} />, overlay };
  if (list.isError) return { overlay, list: <EmptyCard error title="Approvals" chip={{ text: 'Couldn’t load', tone: 'c' }} icon="warning" heading="That didn’t load" body={(list.error as Error).message} actions={<button className="btn pri" onClick={() => void list.refetch()}>Try again</button>} /> };
  const rows = list.data ?? [];
  // Each view has its own scene: nothing waiting, nothing sent, nothing decided, no leave asked for.
  if (!rows.length && view === 'waiting') return { overlay, list: kind === 'leave'
    ? <EmptyState scene="leave" onAction={() => app.go('/attendance')} />
    : <EmptyState scene="approvals" onAction={() => app.go('/approvals/decided')} /> };
  if (!rows.length) return { overlay, list: view === 'sent'
    ? <EmptyState scene="sent" onAction={() => app.go('/fees')} />
    : <EmptyState scene="decided" onAction={() => app.go(kind === 'leave' ? '/attendance/leave' : '/approvals')} /> };
  return { overlay, list: (
    <div className="card" style={{ padding: 0 }}>
      {rows.map((r) => (
        <div key={r.id} className="exr" style={{ alignItems: 'flex-start', padding: '16px 20px' }}>
          <Avatar name={r.requesterName || r.title} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ font: '700 15px var(--fb)', display: 'block', overflowWrap: 'anywhere' }}>{r.title}</b>
            <small style={{ display: 'block' }}>{r.subtitle}</small>
            <small style={{ display: 'block' }}>{r.requesterName ? `Asked by ${r.requesterName} · ` : ''}{when(r.createdAt)}</small>
            {r.decidedAt && <small style={{ display: 'block' }}>{STATUS[r.status].text}{r.decidedByName ? ` by ${r.decidedByName}` : ''} · {when(r.decidedAt)}{r.decisionNote ? ` · “${r.decisionNote}”` : ''}</small>}
          </div>
          <span className={`chip ${STATUS[r.status].tone}`}>{STATUS[r.status].text}</span>
          {may && r.status === 'pending' && view === 'waiting' && (
            <span className="tgrow">
              <button className="btn sm pri" disabled={decide.isPending} onClick={() => decide.mutate({ row: r, decision: 'approve' })}>{r.action || 'Approve'}</button>
              <button className="btn sm" disabled={decide.isPending} onClick={() => setDeclining(r)}>Decline</button>
            </span>
          )}
          {may && view === 'decided' && (r.status === 'approved' || r.status === 'rejected') && (
            <button className="btn sm" disabled={decide.isPending} data-tip="Put it back in the waiting list" onClick={() => decide.mutate({ row: r, decision: 'undo' })}>Undo</button>
          )}
        </div>
      ))}
    </div>
  ) };
}

function Decline({ row, busy, onClose, onDecline }: { row: ApprovalRow; busy: boolean; onClose: () => void; onDecline: (note: string) => void }) {
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const shake = useShake();
  const go = () => { if (!note.trim()) { setErr('Say why, so the person who asked knows what to do next.'); shake.hit(); return; } onDecline(note.trim()); };
  return (
    <Dialog title={`Decline: ${row.title}`} onClose={onClose} width={520} shake={shake.cls}>
      <div className="stack">
        <AreaField label="Why" value={note} onChange={(v) => { setNote(v); setErr(''); }} error={err} maxLength={300} rows={3} placeholder="The dates clash with the exams. Ask again for the week after." />
        <div className="tgrow" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn pri" disabled={busy} onClick={go}>{busy ? 'Declining…' : 'Decline'}</button>
        </div>
      </div>
    </Dialog>
  );
}
