import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HttpError } from '@gradeon/api-client';
import type { ComplianceRow } from '@gradeon/contracts';
import { Dialog, EmptyCard, Field, SelectField, useShake } from '@gradeon/web-ui';
import { Card, Page, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { ago } from '../../app/format';

const KIND = { dpa: 'Agreement', breach: 'Breach' } as const;

/** Time left on a breach's 72-hour clock, in words. */
function clock(deadline: string | null): { text: string; late: boolean } | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  const h = Math.floor(Math.abs(ms) / 3_600_000);
  return { text: ms >= 0 ? `${h} h left to tell the school` : `${h} h past the 72-hour limit`, late: ms < 0 };
}

export function CompliancePage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [adding, setAdding] = useState<'dpa' | 'breach' | null>(null);
  const q = useQuery({ queryKey: ['compliance'], queryFn: app.api.compliance.list });
  const update = useMutation({
    mutationFn: (b: { id: string; status: ComplianceRow['status'] }) => app.api.compliance.update(b.id, { status: b.status, note: '' }),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['compliance'] }); say(r.status === 'notified' ? `${r.schoolName} was told. The notice is in the test inbox.` : r.status === 'signed' ? 'Agreement signed.' : 'Closed.'); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  const canWrite = app.can('compliance.write');
  const items = q.data?.items ?? [];
  const agreements = items.filter((i) => i.kind === 'dpa');
  const breaches = items.filter((i) => i.kind === 'breach');
  return (
    <Page title="Compliance" sub="Agreements with each school, and what to do when something goes wrong" toast={toast} loading={q.isLoading}
      error={q.isError ? { message: (q.error as Error).message, retry: () => void q.refetch() } : null}
      actions={canWrite ? <><button className="btn" onClick={() => setAdding('dpa')}>Add an agreement</button><button className="btn pri" onClick={() => setAdding('breach')}>Log a breach</button></> : undefined}
      overlays={adding && <Add kind={adding} onClose={() => setAdding(null)} onDone={(m) => { setAdding(null); void qc.invalidateQueries({ queryKey: ['compliance'] }); say(m); }} />}>
      <section className="grid">
        <Card title="Breaches" chip={<span className={`chip ${breaches.some((b) => b.status !== 'closed') ? 'r' : 'g'}`}>{breaches.filter((b) => b.status !== 'closed').length} open</span>} span="s12">
          {breaches.length === 0 ? <EmptyCard title="Breaches" chip={{ text: 'None', tone: 'g' }} scene="padlock" heading="No breaches logged" body="If personal data may have reached the wrong person, log it here. The school must be told within 72 hours so it can meet its own duty." /> : (
            <div className="lscroll" style={{ maxHeight: 520 }}>
              {breaches.map((b) => <Row key={b.id} r={b} canWrite={canWrite} busy={update.isPending} onStatus={(status) => update.mutate({ id: b.id, status })} />)}
            </div>
          )}
        </Card>
        <div className="s12" style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <Card title="Agreements" chip={<span className="chip">{agreements.filter((a) => a.status === 'open').length} to sign</span>}>
            {agreements.length === 0 ? <div className="help">Add the data processing agreement each school has to sign. It stays here until it is signed.</div> : (
              <div className="lscroll" style={{ maxHeight: 300 }}>
                {agreements.map((a) => <Row key={a.id} r={a} canWrite={canWrite} busy={update.isPending} onStatus={(status) => update.mutate({ id: a.id, status })} />)}
              </div>
            )}
          </Card>
          <Card title="Who else handles the data">
            {(q.data?.subprocessors ?? []).map((s) => <div className="kv" key={s.name}><span><b style={{ color: 'var(--ink)', textAlign: 'left' }}>{s.name}</b><br /><small style={{ color: 'var(--ink3)' }}>{s.purpose}</small></span><b style={{ whiteSpace: 'nowrap' }}>{s.region}</b></div>)}
            <div className="help" style={{ marginTop: 10 }}>These are the services behind this test deployment. A production list is kept with each school’s agreement.</div>
          </Card>
        </div>
      </section>
    </Page>
  );
}

function Row({ r, canWrite, busy, onStatus }: { r: ComplianceRow; canWrite: boolean; busy: boolean; onStatus: (s: ComplianceRow['status']) => void }) {
  const c = r.status === 'closed' || r.status === 'signed' ? null : clock(r.deadlineAt);
  const done = r.status === 'closed' || r.status === 'signed';
  return (
    <div className="kv" style={{ alignItems: 'flex-start', gap: 12 }}>
      <span style={{ minWidth: 0 }}>
        <b style={{ color: 'var(--ink)', display: 'block', textAlign: 'left' }}>{r.title}</b>
        <small style={{ color: 'var(--ink3)' }}>{r.schoolName} · {KIND[r.kind]} · {ago(r.createdAt)} by {r.createdBy}</small>
        {r.note && <small style={{ display: 'block', color: 'var(--ink2)', marginTop: 4 }}>{r.note}</small>}
        {c && <small className={`chip ${c.late ? 'r' : 'a'}`} style={{ marginTop: 6 }}>{c.text}</small>}
      </span>
      <span style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
        <span className={`st ${done ? 'g' : r.status === 'notified' ? 'b' : 'a'}`}><i></i>{({ open: 'Open', signed: 'Signed', notified: 'School told', closed: 'Closed' } as const)[r.status]}</span>
        {canWrite && !done && r.kind === 'dpa' && <button className="btn sm" disabled={busy} onClick={() => onStatus('signed')}>Mark signed</button>}
        {canWrite && !done && r.kind === 'breach' && r.status === 'open' && <button className="btn sm" disabled={busy} onClick={() => onStatus('notified')}>Tell the school</button>}
        {canWrite && !done && r.kind === 'breach' && r.status === 'notified' && <button className="btn sm" disabled={busy} onClick={() => onStatus('closed')}>Close</button>}
      </span>
    </div>
  );
}

function Add({ kind, onClose, onDone }: { kind: 'dpa' | 'breach'; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const schools = useQuery({ queryKey: ['schools'], queryFn: () => app.api.schools() });
  const [f, setF] = useState({ schoolId: '', title: kind === 'dpa' ? 'Data processing agreement' : '', note: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const shake = useShake();
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErr((e) => ({ ...e, [k]: '', _: '' })); };
  const make = useMutation({
    mutationFn: () => app.api.compliance.create({ schoolId: f.schoolId, kind, title: f.title.trim(), note: f.note.trim() }),
    onSuccess: (r) => onDone(kind === 'breach' ? `Breach logged. Tell ${r.schoolName} within 72 hours.` : `Agreement added for ${r.schoolName}.`),
    onError: (e) => { setErr(e instanceof HttpError && Object.keys(e.fields).length ? e.fields : { _: (e as Error).message }); shake.hit(); },
  });
  const go = () => {
    const p: Record<string, string> = {};
    if (!f.schoolId) p.schoolId = 'Choose a school.';
    if (f.title.trim().length < 3) p.title = 'Say what this is.';
    setErr(p);
    if (Object.keys(p).length) shake.hit(); else make.mutate();
  };
  return (
    <Dialog title={kind === 'dpa' ? 'Add an agreement' : 'Log a breach'} tag={kind === 'breach' ? { text: '72-hour clock starts', tone: 'r' } : undefined} onClose={onClose} width={500} shake={shake.cls}>
      <div className="stack">
        <SelectField label="School" value={f.schoolId} onChange={set('schoolId')} error={err.schoolId} options={[{ value: '', label: 'Choose a school' }, ...(schools.data ?? []).map((s) => ({ value: s.id, label: s.name }))]} />
        <Field label={kind === 'dpa' ? 'Agreement' : 'What happened'} value={f.title} onChange={set('title')} error={err.title} maxLength={120} />
        <Field label="Details (optional)" value={f.note} onChange={set('note')} maxLength={600} />
        {err._ && <div className="emsg" role="alert">{err._}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={make.isPending} onClick={go}>{make.isPending ? 'Saving…' : kind === 'dpa' ? 'Add agreement' : 'Log breach'}</button>
      </div>
    </Dialog>
  );
}
