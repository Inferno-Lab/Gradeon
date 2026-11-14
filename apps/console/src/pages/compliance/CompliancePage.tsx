import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HttpError } from '@gradeon/api-client';
import { breachNotice, istToday, type ComplianceRow } from '@gradeon/contracts';
import { AreaField, DateField, Dialog, EmptyCard, Field, FilePick, SelectField, useShake, EmptyState } from '@gradeon/web-ui';
import { Card, Page, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { ago, when } from '../../app/format';
import { url } from '../../app/base';
import { usePageTabs } from '../../app/tabs';

const KIND = { dpa: 'Agreement', breach: 'Breach' } as const;

/** Time left on a breach's 72-hour clock, in words. */
function clock(deadline: string | null): { text: string; late: boolean } | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  const h = Math.floor(Math.abs(ms) / 3_600_000);
  return { text: ms >= 0 ? `${h} h left to tell the school` : `${h} h past the 72-hour limit`, late: ms < 0 };
}

/** Agreements with each school, breaches and their 72-hour clock, who else handles the data, and data requests across schools. */
export function CompliancePage() {
  const app = useApp();
  const qc = useQueryClient();
  const { tab, tabs } = usePageTabs('/compliance');
  const { toast, say } = useToast();
  const [adding, setAdding] = useState<'dpa' | 'breach' | null>(null);
  const [signing, setSigning] = useState<ComplianceRow | null>(null);
  const [telling, setTelling] = useState<ComplianceRow | null>(null);
  const q = useQuery({ queryKey: ['compliance'], queryFn: app.api.compliance.list });
  const requests = useQuery({ queryKey: ['compliance-requests'], queryFn: app.api.compliance.requests, enabled: tab === 'requests' && app.can('audit.read') });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['compliance'] });
  const close = useMutation({ mutationFn: (id: string) => app.api.compliance.update(id, { status: 'closed', note: '' }), onSuccess: () => { refresh(); say('Closed.'); }, onError: (e) => say((e as Error).message, 'bad') });
  const canWrite = app.can('compliance.write');
  const items = q.data?.items ?? [];
  const agreements = items.filter((i) => i.kind === 'dpa');
  const breaches = items.filter((i) => i.kind === 'breach');
  const download = (r: ComplianceRow) => void app.api.compliance.file(r.id).then((b) => { const x = document.createElement('a'); x.href = URL.createObjectURL(b); x.download = r.fileName ?? 'agreement'; x.click(); URL.revokeObjectURL(x.href); });
  return (
    <Page title="Compliance" sub="Agreements with each school, and what to do when something goes wrong" toast={toast} loading={q.isLoading}
      error={q.isError ? { message: (q.error as Error).message, retry: () => void q.refetch() } : null}
      tabs={tabs} actions={<>{canWrite && tab === 'agreements' && <button className="btn pri" onClick={() => setAdding('dpa')}>Add an agreement</button>}{canWrite && tab === 'breaches' && <button className="btn pri" onClick={() => setAdding('breach')}>Log a breach</button>}</>}
      overlays={<>
        {adding && <Add kind={adding} onClose={() => setAdding(null)} onDone={(m) => { setAdding(null); refresh(); say(m); }} />}
        {signing && <Sign r={signing} onClose={() => setSigning(null)} onDone={() => { setSigning(null); refresh(); say('Agreement signed, with its file.'); }} />}
        {telling && <Tell r={telling} onClose={() => setTelling(null)} onDone={(m) => { setTelling(null); refresh(); say(m); }} />}
      </>}>
      {tab === 'breaches' && (
        <Card title="Breaches" chip={<span className={`chip ${breaches.some((b) => b.status !== 'closed') ? 'c' : 'g'}`}>{breaches.filter((b) => b.status !== 'closed').length} open</span>}>
          {breaches.length === 0 ? <EmptyCard title="Breaches" chip={{ text: 'None', tone: 'g' }} icon="lock" heading="No breaches logged" body="If personal data may have reached the wrong person, log it here. The school must be told within 72 hours so it can meet its own duty." />
            : breaches.map((b) => <Row key={b.id} r={b} canWrite={canWrite} busy={close.isPending} onTell={() => setTelling(b)} onClose={() => close.mutate(b.id)} />)}
        </Card>
      )}
      {tab === 'agreements' && (
        <Card title="Agreements" chip={<span className="chip">{agreements.filter((x) => x.status === 'open').length} to sign</span>}>
          {agreements.length === 0 ? <EmptyState scene="compliance" label="Add an agreement" onAction={canWrite ? () => setAdding('dpa') : undefined} />
            : agreements.map((x) => <Row key={x.id} r={x} canWrite={canWrite} busy={false} onSign={() => setSigning(x)} onFile={() => download(x)} />)}
        </Card>
      )}
      {tab === 'processors' && (
        <Card title="Who else handles the data" chip={<span className="chip">{q.data?.subprocessors.length ?? 0}</span>}>
          <div className="help" style={{ marginTop: 0 }}>Every provider with a live connection under Integrations, and what it does. This is the list a school’s agreement names.</div>
          {(q.data?.subprocessors ?? []).length === 0 && <div className="help">No connection is live yet.</div>}
          {(q.data?.subprocessors ?? []).map((x, i) => <div className="kv" key={`${x.name}${i}`}><span><b style={{ color: 'var(--ink)', textAlign: 'left' }}>{x.name}</b><br /><small style={{ color: 'var(--ink3)' }}>{x.purpose} · {x.serves}</small></span><b style={{ whiteSpace: 'nowrap' }}>{x.region}</b></div>)}
        </Card>
      )}
      {tab === 'requests' && (
        <Card title="Data requests at every school" chip={<span className="chip">{requests.data?.length ?? 0} open</span>}>
          <div className="help" style={{ marginTop: 0 }}>Asked for by families and staff in the app or at the office. Each school answers its own under Privacy; erasure past retention is on the school’s Data tab.</div>
          {!app.can('audit.read') ? <div className="help">Your role does not include data requests.</div>
            : requests.isLoading ? <div className="skc" style={{ height: 160, borderRadius: 16 }} />
              : !(requests.data ?? []).length ? <div className="help">Nothing open.</div>
                : requests.data!.map((r) => (
                  <div key={`${r.schoolId}${r.id}`} className="kv" style={{ alignItems: 'flex-start' }}>
                    <span><b style={{ color: 'var(--ink)' }}>{r.subjectName}</b> · {r.kind}<br /><small style={{ color: 'var(--ink3)' }}><a href={url(`/schools/${r.schoolId}/data`)} onClick={(e) => { e.preventDefault(); app.go(`/schools/${r.schoolId}/data`); }} style={{ color: 'inherit', fontWeight: 700 }}>{r.schoolName}</a> · {r.requestedBy || 'the office'} · {ago(r.createdAt)}</small></span>
                    <b>{when(r.createdAt)}</b>
                  </div>
                ))}
        </Card>
      )}
    </Page>
  );
}

function Row({ r, canWrite, busy, onTell, onClose, onSign, onFile }: { r: ComplianceRow; canWrite: boolean; busy: boolean; onTell?: () => void; onClose?: () => void; onSign?: () => void; onFile?: () => void }) {
  const c = r.status === 'closed' || r.status === 'signed' ? null : clock(r.deadlineAt);
  const done = r.status === 'closed' || r.status === 'signed';
  return (
    <div className="kv" style={{ alignItems: 'flex-start', gap: 12 }}>
      <span style={{ minWidth: 0 }}>
        <b style={{ color: 'var(--ink)', display: 'block', textAlign: 'left' }}>{r.title}</b>
        <small style={{ color: 'var(--ink3)' }}>{r.schoolName} · {KIND[r.kind]} · {ago(r.createdAt)} by {r.createdBy}</small>
        {r.note && <small style={{ display: 'block', color: 'var(--ink2)', marginTop: 4 }}>{r.note}</small>}
        {r.signedOn && <small style={{ display: 'block', color: 'var(--ink2)', marginTop: 4 }}>Signed on {r.signedOn} by {r.signedBy}</small>}
        {c && <small className={`chip ${c.late ? 'c' : 'a'}`} style={{ marginTop: 6 }}>{c.text}</small>}
      </span>
      <span style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
        <span className={`st ${done ? 'g' : r.status === 'notified' ? 'v' : 'a'}`}><i></i>{({ open: 'Open', signed: 'Signed', notified: 'School told', closed: 'Closed' } as const)[r.status]}</span>
        {r.fileName && onFile && <button className="btn sm" onClick={onFile}>Signed file</button>}
        {canWrite && !done && r.kind === 'dpa' && onSign && <button className="btn sm" onClick={onSign}>Signed…</button>}
        {canWrite && !done && r.kind === 'breach' && r.status === 'open' && onTell && <button className="btn sm" onClick={onTell}>Tell the school…</button>}
        {canWrite && !done && r.kind === 'breach' && r.status === 'notified' && onClose && <button className="btn sm" disabled={busy} onClick={onClose}>Close</button>}
      </span>
    </div>
  );
}

/** Signing records the signed file, the day and who signed for the school; without them an agreement proves nothing. */
function Sign({ r, onClose, onDone }: { r: ComplianceRow; onClose: () => void; onDone: () => void }) {
  const app = useApp();
  const shake = useShake();
  const [f, setF] = useState({ on: istToday(), by: '' });
  const [file, setFile] = useState<{ name: string; data: string } | null>(null);
  const [err, setErr] = useState('');
  const go = useMutation({
    mutationFn: () => app.api.compliance.update(r.id, { status: 'signed', note: '', signedOn: f.on, signedBy: f.by.trim(), file: file! }),
    onSuccess: onDone,
    onError: (e) => { setErr((e as Error).message); shake.hit(); },
  });
  return (
    <Dialog title={`${r.schoolName} signed`} tag={{ text: r.title, tone: 'v' }} onClose={onClose} width={480} shake={shake.cls}>
      <div className="stack">
        <div className="two">
          <DateField label="Signed on" value={f.on} max={istToday()} onChange={(v) => setF({ ...f, on: v })} />
          <Field label="Signed by (for the school)" value={f.by} onChange={(v) => { setF({ ...f, by: v }); setErr(''); }} maxLength={80} placeholder="Name and title" />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <FilePick accept="application/pdf,image/png,image/jpeg" className="btn sm" onPick={(x) => {
            if (x.size > 5 * 1024 * 1024) { setErr('The signed file must be 5 MB or smaller.'); return; }
            const rd = new FileReader(); rd.onload = () => { setFile({ name: x.name, data: String(rd.result).split(',')[1] ?? '' }); setErr(''); }; rd.readAsDataURL(x);
          }}>{file ? 'Choose another' : 'Attach the signed file'}</FilePick>
          {file && <span className="chip g">{file.name}</span>}
        </div>
        {err && <div className="emsg" role="alert">{err}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={go.isPending} onClick={() => { if (!file || f.by.trim().length < 2 || !f.on) { setErr('Attach the signed file and say who signed it.'); shake.hit(); } else go.mutate(); }}>Save as signed</button>
      </div>
    </Dialog>
  );
}

/** The notice is shown as the school will read it, then sent. */
function Tell({ r, onClose, onDone }: { r: ComplianceRow; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const [note, setNote] = useState(r.note);
  const go = useMutation({ mutationFn: () => app.api.compliance.update(r.id, { status: 'notified', note: note.trim() }), onSuccess: () => onDone(`${r.schoolName} was told, through Gradeon’s email.`) });
  return (
    <Dialog title={`Tell ${r.schoolName}`} tag={{ text: 'Sent by email to its contact', tone: 'a' }} onClose={onClose} width={540}>
      <AreaField label="What happened, in words for the school" value={note} onChange={setNote} rows={3} maxLength={600} />
      <div className="lbl" style={{ margin: '12px 0 6px' }}>The school receives</div>
      <div className="card" style={{ padding: 16, whiteSpace: 'pre-wrap', font: '400 14px/1.5 var(--fb)', background: 'var(--s2)', boxShadow: 'none' }}>{breachNotice(r.schoolName, r.title, note.trim())}</div>
      {go.isError && <div className="emsg" role="alert" style={{ marginTop: 10 }}>{(go.error as Error).message}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={go.isPending} onClick={() => go.mutate()}>Send it</button>
      </div>
    </Dialog>
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
    <Dialog title={kind === 'dpa' ? 'Add an agreement' : 'Log a breach'} tag={kind === 'breach' ? { text: '72-hour clock starts', tone: 'c' } : undefined} onClose={onClose} width={500} shake={shake.cls}>
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
