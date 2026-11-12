import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HttpError } from '@gradeon/api-client';
import { CAPABILITIES, CAPABILITY_LABELS, INTEGRATION_PROVIDERS, providerDef, type SchoolDetail } from '@gradeon/contracts';
import { Dialog, EmptyCard, Presence, useShake } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { ago } from '../../app/format';
import { url } from '../../app/base';

/** A phone number or address with only its end showing, until someone asks to see it. */
export const mask = (to: string) => (to.includes('@') ? to.replace(/^(.).*?(@.*)$/, '$1•••$2') : to.replace(/\d(?=(?:\D*\d){4})/g, '•'));

/** One school's view of the Hub: what serves each capability (its own route or the default), its own connections, its volume and failures. */
export function IntegrationsTab({ d }: { d: SchoolDetail }) {
  const app = useApp();
  const [shown, setShown] = useState<Set<string>>(new Set());
  const view = useQuery({ queryKey: ['integrations'], queryFn: app.api.integrations.view, enabled: app.can('integrations.read') });
  const fails = useQuery({ queryKey: ['activity', d.slug, '', 'failed'], queryFn: () => app.api.integrations.activity({ school: d.slug, status: 'failed', limit: 10 }), enabled: app.can('integrations.read') });
  if (!app.can('integrations.read')) return <EmptyCard title="Messaging" chip={{ text: 'Not for your role', tone: 'a' }} icon="lock" heading="Integrations are for implementation and support" body="Ask a super admin if you need to see how this school’s messages and payments are routed." />;
  if (view.isLoading) return <div className="skc" style={{ height: 240, borderRadius: 24 }} />;
  const v = view.data;
  if (!v) return <EmptyCard error title="Integrations" chip={{ text: 'Couldn’t load', tone: 'c' }} icon="warning" heading="That didn’t load" body={(view.error as Error)?.message ?? ''} actions={<button className="btn pri" onClick={() => void view.refetch()}>Try again</button>} />;
  const name = (id: string | null) => (id ? v.connections.find((c) => c.id === id)?.name ?? 'Deleted' : '');
  const caps = CAPABILITIES.filter((k) => INTEGRATION_PROVIDERS.some((p) => p.key !== 'sandbox' && p.capabilities.includes(k)));
  const own = v.connections.filter((c) => c.schoolId === d.id);
  return (
    <>
      <section className="grid" data-even="">
        <div className="card s7 rise">
          <div className="ch"><h2>What reaches this school’s families</h2><span className={`chip ${v.mode === 'live' ? 'g' : 'a'}`}>{v.mode === 'live' ? 'Live mode' : 'Sandbox mode'}</span></div>
          <div style={{ marginTop: 8 }}>
            {caps.map((k) => {
              const mine = v.routes.find((r) => r.capability === k && r.schoolId === d.id);
              const def = v.routes.find((r) => r.capability === k && !r.schoolId);
              const r = mine ?? def;
              return (
                <div key={k} className="kv" style={{ alignItems: 'center' }}>
                  <span>{CAPABILITY_LABELS[k]}</span>
                  <b style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {r ? <><span className={`chip ${mine ? 'v' : ''}`}>{mine ? 'Its own' : 'Gradeon default'}</span><span style={{ minWidth: 0 }}>{name(r.connectionId)}{r.fallbackId ? ` → ${name(r.fallbackId)}` : ''}</span></>
                      : <span style={{ color: 'var(--ink3)' }}>{v.mode === 'live' ? 'Not set up: fails' : 'Test inbox'}</span>}
                  </b>
                </div>
              );
            })}
          </div>
          <div className="help" style={{ marginTop: 10 }}>Change routes on <a href={url('/integrations/routing')} onClick={(e) => { e.preventDefault(); app.go('/integrations/routing'); }}>Integrations → Routing</a>. Texts used this month are on the Overview.</div>
        </div>
        <div className="card s5 rise">
          <div className="ch"><h2>Its own connections</h2><span className="chip">{own.length}</span></div>
          {!own.length ? <div className="help">None: it uses Gradeon’s.</div> : own.map((c) => (
            <div key={c.id} className="kv" style={{ alignItems: 'center' }}><span style={{ minWidth: 0 }}>{c.name}</span><b style={{ display: 'flex', gap: 6 }}><span className="chip">{providerDef(c.provider)?.name}</span><span className={`chip ${c.state === 'live' ? 'g' : c.state === 'paused' ? 'c' : 'a'}`}>{c.state}</span></b></div>
          ))}
        </div>
      </section>
      <section className="card rise">
        <div className="ch"><h2>Recent failures</h2><span className="chip">{fails.data?.rows.length ?? 0}</span></div>
        <div style={{ marginTop: 8 }}>
          {!(fails.data?.rows ?? []).length ? <div className="help">No message to this school’s families has failed lately.</div> : fails.data!.rows.map((m) => (
            <div key={m.id} className="kv" style={{ alignItems: 'center' }}>
              <span style={{ minWidth: 0 }}><b className="num">{shown.has(m.id) ? m.to : mask(m.to)}</b>{!shown.has(m.id) && <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => setShown(new Set(shown).add(m.id))}>Show</button>} · {CAPABILITY_LABELS[m.channel as keyof typeof CAPABILITY_LABELS] ?? m.channel}<br /><small style={{ color: 'var(--bad-i)', overflowWrap: 'anywhere' }}>{m.error}</small></span>
              <b style={{ whiteSpace: 'nowrap' }}>{ago(m.createdAt)}</b>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

/** Records of students who left, past the school's retention period: erased only after a second person approves. */
export function RecordsTab({ d, say }: { d: SchoolDetail; say: (m: string, tone?: 'ok' | 'bad') => void }) {
  const app = useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['retention', d.id], queryFn: () => app.api.retention(d.id), enabled: d.status !== 'onboarding' });
  const [open, setOpen] = useState(false);
  if (q.isLoading) return <div className="skc" style={{ height: 200, borderRadius: 24 }} />;
  const r = q.data;
  return (
    <section className="card s12 rise">
      <div className="ch"><h2>Students who left</h2><span className={`chip ${r?.due ? 'a' : 'g'}`}>{r ? `${r.due} past ${r.months} months` : 'Unknown'}</span></div>
      <p className="help" style={{ margin: '8px 0 0' }}>
        {q.isError ? (q.error as Error).message
          : r?.due ? `${r.due} ${r.due === 1 ? 'student' : 'students'} left more than ${r.months} months ago (the school’s retention period). Erasing removes their names, photos, documents and guardians; fee receipts stay, under “Erased student”, as the law asks.`
            : `Nobody is past the ${r?.months ?? 36}-month retention period. Leavers are recorded by the school under Year-end.`}
      </p>
      {app.can('schools.write') && !!r?.due && <div style={{ marginTop: 16 }}><button className="btn" onClick={() => setOpen(true)}>Request erasure</button></div>}
      <Presence>{open && r && <EraseLeavers d={d} due={r.due} onClose={() => setOpen(false)} onSent={(m) => { setOpen(false); void qc.invalidateQueries({ predicate: (x) => ['retention', 'actions'].includes(String(x.queryKey[0])) }); say(m); }} />}</Presence>
    </section>
  );
}

function EraseLeavers({ d, due, onClose, onSent }: { d: SchoolDetail; due: number; onClose: () => void; onSent: (m: string) => void }) {
  const app = useApp();
  const [typed, setTyped] = useState('');
  const [bad, setBad] = useState('');
  const shake = useShake();
  const send = useMutation({
    mutationFn: () => app.api.actions.request({ action: 'retention.erase', schoolId: d.id, confirmCode: typed.trim() }),
    onSuccess: (a) => onSent(a.status === 'pending_approval' ? 'Asked for approval. A second person approves it under Approvals.' : a.summary),
    onError: (e) => { setBad(e instanceof HttpError ? (e.fields.confirmCode ?? e.message) : (e as Error).message); shake.hit(); },
  });
  return (
    <Dialog dark title={`Erase ${due} leavers’ records?`} tag={{ text: 'Permanent · needs a second approver', tone: 'c' }} onClose={onClose} shake={shake.cls} width={480}>
      <p>Names, photos, documents and guardians of students who left {d.name} past its retention period are erased. Receipts stay, without a name.</p>
      <div>
        <label htmlFor="ret-in">Type <b style={{ color: 'var(--on-deep)' }}>{d.slug}</b> to continue</label>
        <input id="ret-in" className={`shake ${bad ? 'err' : ''}`} value={typed} onChange={(e) => { setTyped(e.target.value); setBad(''); }} autoComplete="off" aria-invalid={!!bad} />
      </div>
      {bad && <div className="emsg" role="alert" style={{ marginTop: 10 }}>{bad}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" style={{ background: 'transparent', color: 'var(--on-deep)', borderColor: 'color-mix(in srgb,var(--on-deep) 18%,transparent)' }} onClick={onClose}>Cancel</button>
        <button className="btn dngf" onClick={() => (typed.trim() === d.slug ? send.mutate() : (setBad('That isn’t the school code. Nothing was erased.'), shake.hit()))} disabled={send.isPending}>Request erasure</button>
      </div>
    </Dialog>
  );
}
