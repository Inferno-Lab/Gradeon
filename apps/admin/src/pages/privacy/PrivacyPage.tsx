import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DATA_REQUEST_KINDS, type DataRequestRow } from '@tangent/contracts';
import { Dialog, Field, SelectField, useShake, useToast, EmptyState } from '@tangent/web-ui';
import { useApp } from '../../app/context';
import { AddBtn, AreaField, problem } from '../../app/kit';
import { Page } from '../../app/Page';

const KIND = { access: 'Copy of their data', correction: 'Correction', erasure: 'Erasure' } as const;
const when = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** Families' requests about their data: those sent from the app and those the office logs, each answered and closed once. */
export function PrivacyPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const reqs = useQuery({ queryKey: ['privacy', 'requests'], queryFn: app.api.privacy.requests });
  const [adding, setAdding] = useState(false);
  const [deciding, setDeciding] = useState<DataRequestRow | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['privacy'] });
  const rows = reqs.data ?? [];
  const open = rows.filter((r) => r.status === 'open').length;
  return (
    <Page title="Privacy requests" sub={open ? `${open} waiting for an answer` : 'Requests for a copy of data, a correction or erasure'} toast={toast} loading={reqs.isLoading}
      error={reqs.isError && !reqs.data ? { message: (reqs.error as Error).message, retry: () => void reqs.refetch() } : null}
      actions={<AddBtn onClick={() => setAdding(true)}>Log a request</AddBtn>}
      overlays={<>
        {adding && <LogDialog onClose={() => setAdding(false)} onDone={() => { setAdding(false); refresh(); say('Request logged.'); }} />}
        {deciding && <AnswerDialog r={deciding} onClose={() => setDeciding(null)} onDone={(m) => { setDeciding(null); refresh(); say(m); }} />}
      </>}>
      {!rows.length ? (
        <EmptyState scene="privacy" onAction={() => app.go('/profile/privacy')} />
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {rows.map((r) => (
            <div key={r.id} className="exr" style={{ alignItems: 'flex-start', padding: '16px 20px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ font: '700 15px var(--fb)', display: 'block' }}>{KIND[r.kind]} · {r.subjectName}</b>
                <small style={{ display: 'block' }}>{r.requestedBy ? `Asked by ${r.requestedBy} · ` : ''}{when(r.createdAt)}{r.fromApp ? ' · from the app' : ''}</small>
                {r.note && <small style={{ display: 'block' }}>“{r.note}”</small>}
                {r.answer && <small style={{ display: 'block' }}>Answer: {r.answer}</small>}
              </div>
              {r.status === 'open'
                ? <button className="btn sm pri" onClick={() => setDeciding(r)}>Answer</button>
                : <span className={`chip ${r.status === 'done' ? 'g' : ''}`}>{r.status === 'done' ? 'Done' : 'Declined'}</span>}
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}

function LogDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const app = useApp();
  const [f, setF] = useState({ kind: 'access', subjectName: '', requestedBy: '', note: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const shake = useShake();
  const make = useMutation({
    mutationFn: () => app.api.privacy.create({ kind: f.kind as 'access', subjectName: f.subjectName.trim(), requestedBy: f.requestedBy.trim(), note: f.note.trim() }),
    onSuccess: onDone, onError: (e) => { setErr(problem(e)); shake.hit(); },
  });
  const go = () => { if (f.subjectName.trim().length < 2) { setErr({ subjectName: 'Whose data is this about?' }); shake.hit(); } else make.mutate(); };
  return (
    <Dialog title="Log a data request" onClose={onClose} width={500} shake={shake.cls}>
      <div className="stack">
        <SelectField label="What do they want" value={f.kind} onChange={(kind) => setF({ ...f, kind })} options={DATA_REQUEST_KINDS.map((k) => ({ value: k, label: KIND[k] }))} />
        <Field label="Whose data" value={f.subjectName} onChange={(subjectName) => { setF({ ...f, subjectName }); setErr({}); }} error={err.subjectName} maxLength={80} />
        <Field label="Asked by (optional)" value={f.requestedBy} onChange={(requestedBy) => setF({ ...f, requestedBy })} maxLength={80} />
        <AreaField label="Details (optional)" value={f.note} onChange={(note) => setF({ ...f, note })} rows={3} maxLength={400} />
        {err._ && <div className="emsg" role="alert">{err._}</div>}
        <div className="tgrow" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn pri" disabled={make.isPending} onClick={go}>{make.isPending ? 'Saving…' : 'Log request'}</button>
        </div>
      </div>
    </Dialog>
  );
}

/** The answer goes back to a family that asked from the app, so a decline always says why. */
function AnswerDialog({ r, onClose, onDone }: { r: DataRequestRow; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const shake = useShake();
  const go = useMutation({
    mutationFn: (status: 'done' | 'declined') => app.api.privacy.decide(r.id, { status, note: note.trim() }),
    onSuccess: (x) => onDone(x.status === 'done' ? `Closed as done.${r.fromApp ? ' The family is told.' : ''}` : `Declined.${r.fromApp ? ' The family is told why.' : ''}`),
    onError: (e) => { setErr((e as Error).message); shake.hit(); },
  });
  const decline = () => { if (!note.trim()) { setErr('Say why, so the family knows.'); shake.hit(); } else go.mutate('declined'); };
  return (
    <Dialog title={`${KIND[r.kind]} · ${r.subjectName}`} onClose={onClose} width={500} shake={shake.cls}>
      <div className="stack">
        <AreaField label={r.fromApp ? 'Your answer (the family reads it in the app)' : 'What was done'} value={note} onChange={(v) => { setNote(v); setErr(''); }} error={err} rows={3} maxLength={400} />
        <div className="tgrow" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn dng" disabled={go.isPending} onClick={decline}>Decline</button>
          <button className="btn pri" disabled={go.isPending} onClick={() => go.mutate('done')}>Mark done</button>
        </div>
      </div>
    </Dialog>
  );
}
