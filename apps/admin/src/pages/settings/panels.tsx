import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { APP_CATALOG } from '@gradeon/config-engine';
import { DATA_REQUEST_KINDS, MESSAGE_EVENTS, PERMISSION_CATALOG, SchoolSettingsSchema, permissionAvailable, type DataRequestRow, type SettingsResponse } from '@gradeon/contracts';
import { Checkbox, Dialog, EmptyCard, Field, SelectField, TimeField, useShake } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { AreaField, Ico, problem } from '../../app/kit';

type Say = (text: string) => void;
interface PanelProps { doc: SettingsResponse; say: Say }

const dflt = (k: string): unknown => (SchoolSettingsSchema.shape as Record<string, { safeParse: (v: unknown) => { data?: unknown } }>)[k]!.safeParse(undefined).data;

/** A few settings edited together: shows the saved value or the platform default, keeps edits until saved, and saves only what changed. */
function useKeys(doc: SettingsResponse, keys: string[], _say: Say) {
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [err, setErr] = useState<Record<string, string>>({});
  const shake = useShake();
  // Gradeon sets the school up from the console; here every setting is shown, none is changed.
  const canWrite = false;
  const saved = (k: string): unknown => (doc.values[k] !== undefined ? doc.values[k] : dflt(k));
  const get = <T,>(k: string): T => (k in edits ? edits[k] : saved(k)) as T;
  const changed = keys.filter((k) => k in edits && JSON.stringify(edits[k]) !== JSON.stringify(saved(k)));
  const locked = (k: string) => !canWrite || doc.locked.includes(k);
  return { get, set: (k: string, v: unknown) => { setEdits((x) => ({ ...x, [k]: v })); setErr({}); }, changed, err, shake, canWrite, locked, discard: () => { setEdits({}); setErr({}); } };
}

function SaveRow(_: { s: ReturnType<typeof useKeys> }) {
  return <div className="help" style={{ marginTop: 16 }}>Gradeon sets this up for your school. To change something, use “Ask Gradeon to change this” at the top.</div>;
}

const Sw = ({ on, label, disabled, onClick }: { on: boolean; label: string; disabled?: boolean; onClick: () => void }) => <button className={`sw ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick}></button>;
const Head = ({ title, sub }: { title: string; sub: string }) => <h2 className="sec">{title}<small>{sub}</small></h2>;

// Roles and access

export function RolesPanel(_: Pick<PanelProps, 'say'>) {
  const app = useApp();
  const canManage = false;
  const roles = useQuery({ queryKey: ['roles'], queryFn: app.api.roles.list });
  const cfg = useQuery({ queryKey: ['config'], queryFn: app.api.config, staleTime: 60_000 });
  const [sel, setSel] = useState<string | 'new'>('');
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const shake = useShake();
  const list = roles.data ?? [];
  const cur = list.find((r) => r.id === sel);
  useEffect(() => { if (!sel && list[0]) setSel(list[0].id); }, [list, sel]);
  useEffect(() => { if (cur) { setPerms(new Set(cur.permissions)); setName(cur.name); setDesc(cur.description); setErr({}); } }, [cur?.id, roles.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  // Only what the school has: a role does not list permissions of modules outside the plan.
  const offered = useMemo(() => PERMISSION_CATALOG.filter((p) => !cfg.data || permissionAvailable(p.key, cfg.data)), [cfg.data]);
  const groups = useMemo(() => [...new Set(offered.map((p) => p.area))].map((a) => ({ area: a, items: offered.filter((p) => p.area === a) })), [offered]);
  const readOnly = !canManage || (cur?.locked ?? false);
  if (roles.isLoading) return <div className="skc" style={{ height: 320, borderRadius: 24 }} />;
  if (roles.isError) return <EmptyCard error title="Roles" chip={{ text: 'Couldn’t load', tone: 'c' }} scene="padlock" heading="You can’t see roles" body={(roles.error as Error).message} actions={<button className="btn pri" onClick={() => void roles.refetch()}>Try again</button>} />;
  return (
    <section className="rise">
      <Head title="Roles and access" sub="What each kind of person can see and do. Gradeon makes and changes roles for your school." />
      <div className="rls">
        <div className="rlc" role="tablist" aria-label="Roles">
          {list.map((r) => (
            <button key={r.id} role="tab" aria-selected={r.id === sel} className={`rlb ${r.id === sel ? 'on' : ''}`} onClick={() => setSel(r.id)}>
              <b>{r.name}</b><small>{r.people} {r.people === 1 ? 'person' : 'people'}{r.locked ? ' · fixed' : ''}</small>
            </button>
          ))}
          {sel === 'new' && <button role="tab" aria-selected className="rlb on"><b>{name.trim() || 'New role'}</b><small>Not saved yet</small></button>}
        </div>
        <div className={`rlm ${shake.cls}`}>
          {(cur || sel === 'new') && <>
            <div className="two">
              <Field label="Role name" value={name} onChange={(v) => { setName(v); setErr({ ...err, name: '' }); }} error={err.name} disabled={readOnly || (!!cur && !cur.key.startsWith('custom_') && sel !== 'new')} maxLength={40} />
              <Field label="What it is for" value={desc} onChange={setDesc} disabled={readOnly} maxLength={160} />
            </div>
            {cur?.locked && <div className="help" style={{ marginTop: 10 }}>The principal role always has everything and cannot be changed.</div>}
            <div className="rlg">
              {groups.map((g) => (
                <fieldset key={g.area} className="rlf">
                  <legend>{g.area}</legend>
                  {g.items.map((p) => (
                    <label key={p.key} className="hwc" style={{ whiteSpace: 'normal', alignItems: 'flex-start' }}>
                      <Checkbox checked={perms.has(p.key)} disabled={readOnly || (!app.user.permissions.includes(p.key))} onChange={(c) => { const n = new Set(perms); if (c) n.add(p.key); else n.delete(p.key); setPerms(n); }} />
                      <span>{p.label}{p.sensitive && <span className="chip a" style={{ marginLeft: 6, height: 20, padding: '0 8px' }}>careful</span>}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
            {err._ && <div className="emsg" role="alert" style={{ marginTop: 12 }}>{err._}</div>}
            {!canManage && <div className="help" style={{ marginTop: 12 }}>Gradeon makes and changes roles. To change one, use “Ask Gradeon to change this” at the top.</div>}
          </>}
        </div>
      </div>
    </section>
  );
}

// App layout

const ORDERS = [
  { key: 'app.dock', cat: 'dock', title: 'Tabs along the bottom', help: 'Up to four. Families and students reach them with one tap.', max: 4 },
  { key: 'app.home', cat: 'home', title: 'Home screen', help: 'The cards on the first screen, in this order.', max: 12 },
  { key: 'app.quick', cat: 'quick', title: 'Quick buttons', help: 'Shortcuts at the top of the home screen.', max: 6 },
] as const;

export function AppLayoutPanel({ doc, say }: PanelProps) {
  const s = useKeys(doc, ORDERS.map((o) => o.key), say);
  const entitled = useMemo(() => new Set(doc.modules.filter((m) => m.entitled).map((m) => m.key)), [doc.modules]);
  const enabled = useMemo(() => { const e = doc.values['modules.enabled']; return Array.isArray(e) && e.length ? new Set(e as string[]) : entitled; }, [doc.values, entitled]);
  const move = (key: string, i: number, d: -1 | 1) => { const l = [...s.get<string[]>(key)]; const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j]!, l[i]!]; s.set(key, l); };
  const dock = s.get<string[]>('app.dock');
  const home = s.get<string[]>('app.home');
  const label = (cat: 'dock' | 'home' | 'quick', k: string) => APP_CATALOG[cat].find((c) => c.key === k)?.label ?? k;
  return (
    <section className="rise">
      <Head title="App layout" sub="Choose what the school’s app shows, and in what order. Only features your school has switched on are offered." />
      <div className="apl">
        <div className="grp" style={{ padding: '6px 24px' }}>
          {ORDERS.map((o) => {
            const chosen = s.get<string[]>(o.key);
            const options = APP_CATALOG[o.cat].filter((c) => enabled.has(c.module) && entitled.has(c.module));
            return (
              <fieldset key={o.key} className="apo">
                <legend>{o.title}<small>{o.help}</small></legend>
                <div className="tgrow">
                  {options.map((c) => {
                    const on = chosen.includes(c.key);
                    const full = !on && chosen.length >= o.max;
                    return <button key={c.key} type="button" className={`fp ${on ? 'on' : ''}`} aria-pressed={on} disabled={s.locked(o.key) || full} data-tip={full ? `At most ${o.max}` : undefined} onClick={() => s.set(o.key, on ? chosen.filter((x) => x !== c.key) : [...chosen, c.key])}>{c.label}</button>;
                  })}
                </div>
                {chosen.length > 1 && (
                  <ol className="apr">
                    {chosen.map((k, i) => (
                      <li key={k}><span className="rn">{i + 1}</span><b>{label(o.cat, k)}</b>
                        <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                          <button className="btn sm" aria-label={`Move ${label(o.cat, k)} up`} disabled={i === 0 || s.locked(o.key)} onClick={() => move(o.key, i, -1)}><Ico d="M6 15l6-6 6 6" /></button>
                          <button className="btn sm" aria-label={`Move ${label(o.cat, k)} down`} disabled={i === chosen.length - 1 || s.locked(o.key)} onClick={() => move(o.key, i, 1)}><Ico d="M6 9l6 6 6-6" /></button>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </fieldset>
            );
          })}
        </div>
        <div className="aph" aria-label="Preview of the app">
          <div className="apc">
            <div className="apt">Home</div>
            <div className="apq">{s.get<string[]>('app.quick').map((k) => <span key={k}>{label('quick', k)}</span>)}</div>
            {home.slice(0, 5).map((k) => <div className="aps" key={k}>{label('home', k)}</div>)}
            {home.length > 5 && <div className="help" style={{ textAlign: 'center' }}>and {home.length - 5} more below</div>}
            <nav className="apd">{dock.map((k, i) => <span key={k} className={i === 0 ? 'on' : ''}>{label('dock', k)}</span>)}</nav>
          </div>
          <div className="help" style={{ textAlign: 'center', marginTop: 10 }}>A sketch of the layout. The real app uses its own look.</div>
        </div>
      </div>
      <SaveRow s={s} />
    </section>
  );
}

// Notifications

const CHANNELS = [['push', 'App'], ['sms', 'Text'], ['email', 'Email']] as const;

export function NotificationsPanel({ doc, say }: PanelProps) {
  const s = useKeys(doc, ['notify.rules', 'notify.quietFrom', 'notify.quietTo'], say);
  const rules = s.get<Record<string, { push: boolean; sms: boolean; email: boolean }>>('notify.rules');
  const flip = (key: string, ch: 'push' | 'sms' | 'email', def: { push: boolean; sms: boolean; email: boolean }) => { const r = rules[key] ?? def; s.set('notify.rules', { ...rules, [key]: { ...r, [ch]: !r[ch] } }); };
  const used = doc.usage;
  return (
    <section className="rise">
      <Head title="Notifications" sub="Choose which messages go out, and where. Texts count against your plan’s credits." />
      <div className="grp" style={{ marginTop: 16, padding: '6px 24px' }}>
        <div className="nth"><span>Message</span>{CHANNELS.map(([, l]) => <span key={l}>{l}</span>)}</div>
        {MESSAGE_EVENTS.map((e) => {
          const r = rules[e.key] ?? e.defaults;
          return (
            <div className="ntr" key={e.key}>
              <div><b>{e.label}</b><small>To {e.to === 'families' ? 'families' : 'staff'}{e.urgent ? ' · sent even in quiet hours' : ''}</small></div>
              {CHANNELS.map(([c, l]) => <span key={c} className="ntc2"><Sw on={r[c]} label={`${e.label} by ${l.toLowerCase()}`} disabled={s.locked('notify.rules')} onClick={() => flip(e.key, c, e.defaults)} /></span>)}
            </div>
          );
        })}
      </div>
      <div className="grp" style={{ marginTop: 16 }}>
        <div className="rw2"><div><b>Quiet hours</b><small>Families are not texted or pinged between these times, except for urgent messages. Held messages go out in the morning.</small></div>
          <div className="two">
            <TimeField label="From" value={s.get<string>('notify.quietFrom')} onChange={(v) => s.set('notify.quietFrom', v)} disabled={s.locked('notify.quietFrom')} />
            <TimeField label="Until" value={s.get<string>('notify.quietTo')} onChange={(v) => s.set('notify.quietTo', v)} disabled={s.locked('notify.quietTo')} />
          </div>
        </div>
        <div className="rw2"><div><b>Text credits</b><small>This month.</small></div><div className="help" style={{ alignSelf: 'center' }}>{used.smsUsed.toLocaleString('en-IN')} used of {used.smsLimit.toLocaleString('en-IN')}</div></div>
      </div>
      <SaveRow s={s} />
    </section>
  );
}

// Message templates

const SAMPLE: Record<string, string> = { student: 'Aarav', status: 'absent', school: 'Greenfield', teacher: 'Kavita', receipt: 'RCPT-2026-08812', amount: '₹18,500', title: 'Term 2 tuition', subject: 'Maths', due: '19 Oct', exam: 'Unit test 1', date: '28 Oct', child: 'Anvi', name: 'Pooja', password: 'k3x9-4821' };
const fill = (t: string) => t.replace(/\{(\w+)\}/g, (_, k: string) => SAMPLE[k] ?? `{${k}}`);

export function TemplatesPanel({ doc, say }: PanelProps) {
  const s = useKeys(doc, ['templates.messages'], say);
  const all = s.get<Record<string, string>>('templates.messages');
  const [key, setKey] = useState(MESSAGE_EVENTS[0]!.key);
  const ev = MESSAGE_EVENTS.find((e) => e.key === key)!;
  const text = all[key]?.trim() ? all[key]! : ev.text;
  const custom = !!all[key]?.trim();
  const set = (v: string) => { const n = { ...all }; if (v === ev.text || !v.trim()) delete n[key]; else n[key] = v; s.set('templates.messages', n); };
  const unknown = [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).filter((v) => !ev.vars.includes(v));
  const segs = Math.max(1, Math.ceil(fill(text).length / 160));
  return (
    <section className="rise">
      <Head title="Message templates" sub="The words families and staff receive. Use the placeholders to put names and amounts in." />
      <div className="rls" style={{ marginTop: 16 }}>
        <div className="rlc" role="tablist" aria-label="Messages">
          {MESSAGE_EVENTS.map((e) => <button key={e.key} role="tab" aria-selected={e.key === key} className={`rlb ${e.key === key ? 'on' : ''}`} onClick={() => setKey(e.key)}><b>{e.label}</b><small>{all[e.key]?.trim() ? 'Your wording' : 'Standard wording'}</small></button>)}
        </div>
        <div className="rlm">
          <AreaField label={`${ev.label}: the message`} value={text} onChange={set} rows={4} maxLength={320} error={unknown.length ? `{${unknown[0]}} is not available in this message.` : undefined} />
          <div className="tgrow" style={{ marginTop: 10 }}>
            <span className="help">Add:</span>
            {ev.vars.map((v) => <button type="button" key={v} className="fp" disabled={s.locked('templates.messages')} onClick={() => set(`${text.replace(/\s+$/, '')} {${v}}`)}>{`{${v}}`}</button>)}
          </div>
          <div className="apc flat" style={{ marginTop: 16, minHeight: 0 }}>
            <div className="lbl">What they will read</div>
            <p style={{ margin: '8px 0 0', font: '500 15px/1.5 var(--fb)' }}>{fill(text)}</p>
            <div className="help" style={{ marginTop: 8 }}>{fill(text).length} characters · {segs} {segs === 1 ? 'text' : 'texts'} · sample names shown</div>
          </div>
          {custom && !s.locked('templates.messages') && <button className="btn sm" style={{ marginTop: 12 }} onClick={() => { const n = { ...all }; delete n[key]; s.set('templates.messages', n); }}>Use the standard wording</button>}
        </div>
      </div>
      <SaveRow s={s} />
    </section>
  );
}

// Privacy and consent

const RETENTION = [12, 24, 36, 60, 84, 120];
const KIND_LABEL = { access: 'Copy of data', correction: 'Correction', erasure: 'Erasure' } as const;

export function PrivacyPanel({ doc, say }: PanelProps) {
  const app = useApp();
  const qc = useQueryClient();
  const s = useKeys(doc, ['privacy.notice', 'privacy.officerName', 'privacy.officerEmail', 'privacy.officerPhone', 'privacy.retentionMonths', 'privacy.photoConsent', 'privacy.consentRequired'], say);
  const reqs = useQuery({ queryKey: ['privacy', 'requests'], queryFn: app.api.privacy.requests });
  const [adding, setAdding] = useState(false);
  const [deciding, setDeciding] = useState<DataRequestRow | null>(null);
  // Data requests are the school's daily work (privacy.manage); the privacy settings above are Gradeon's.
  const canWrite = app.user.permissions.includes('privacy.manage');
  const refresh = () => void qc.invalidateQueries({ queryKey: ['privacy'] });
  return (
    <section className="rise">
      <Head title="Privacy and consent" sub="What families are told, who they can contact, and how long records are kept." />
      <div className="grp" style={{ marginTop: 16 }}>
        <div className="rw2"><div><b>Privacy notice</b><small>Shown to families in the app before they sign in.</small></div>
          <AreaField label="Notice" value={s.get<string>('privacy.notice')} onChange={(v) => s.set('privacy.notice', v)} rows={5} maxLength={4000} placeholder="How the school collects, uses and protects children’s information." />
        </div>
        <div className="rw2"><div><b>Grievance officer</b><small>The person a family can write to about their data.</small></div>
          <div className="stack">
            <Field label="Name" value={s.get<string>('privacy.officerName')} onChange={(v) => s.set('privacy.officerName', v)} disabled={s.locked('privacy.officerName')} maxLength={80} />
            <div className="two"><Field label="Email" type="email" value={s.get<string>('privacy.officerEmail')} onChange={(v) => s.set('privacy.officerEmail', v)} disabled={s.locked('privacy.officerEmail')} /><Field label="Phone" value={s.get<string>('privacy.officerPhone')} onChange={(v) => s.set('privacy.officerPhone', v)} disabled={s.locked('privacy.officerPhone')} /></div>
          </div>
        </div>
        <div className="rw2"><div><b>Keep records for</b><small>After this long, the records of a student who left are due for deletion.</small></div>
          <SelectField label="Years" value={String(s.get<number>('privacy.retentionMonths'))} onChange={(v) => s.set('privacy.retentionMonths', Number(v))} disabled={s.locked('privacy.retentionMonths')} options={RETENTION.map((m) => ({ value: String(m), label: `${m / 12} ${m === 12 ? 'year' : 'years'} after leaving` }))} />
        </div>
        <div className="tgl"><div><b>Ask a parent’s consent for new students</b><small>A parent confirms in the app before a child’s profile is used.</small></div><Sw on={s.get<boolean>('privacy.consentRequired')} label="Ask for consent" disabled={s.locked('privacy.consentRequired')} onClick={() => s.set('privacy.consentRequired', !s.get<boolean>('privacy.consentRequired'))} /></div>
        <div className="tgl"><div><b>Photos in the gallery need consent</b><small>Children whose parents have not agreed are left out of photos.</small></div><Sw on={s.get<boolean>('privacy.photoConsent')} label="Photo consent" disabled={s.locked('privacy.photoConsent')} onClick={() => s.set('privacy.photoConsent', !s.get<boolean>('privacy.photoConsent'))} /></div>
      </div>
      <SaveRow s={s} />
      <div className="card" style={{ marginTop: 24 }}>
        <div className="ch"><h2>Data requests</h2><span className="chip">{reqs.data?.filter((r) => r.status === 'open').length ?? 0} open</span>{canWrite && <button className="btn sm" onClick={() => setAdding(true)}>Log a request</button>}</div>
        {reqs.isLoading ? <div className="skc" style={{ height: 120, borderRadius: 18, marginTop: 12 }} /> : (reqs.data?.length ?? 0) === 0 ? <div className="help" style={{ marginTop: 12 }}>No one has asked for their data yet. Log a request when a family does, and close it once it is dealt with.</div> : (
          <div className="lscroll" style={{ maxHeight: 340, marginTop: 10 }}>
            {reqs.data!.map((r) => (
              <div className="tgl" key={r.id}>
                <div><b>{KIND_LABEL[r.kind]} · {r.subjectName}</b><small>{r.requestedBy ? `Asked by ${r.requestedBy}. ` : ''}{r.note}</small></div>
                {r.status === 'open' ? (canWrite ? <button className="btn sm" onClick={() => setDeciding(r)}>Close</button> : <span className="chip a">Open</span>) : <span className={`chip ${r.status === 'done' ? 'g' : ''}`}>{r.status === 'done' ? 'Done' : 'Declined'}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      {adding && <RequestDialog onClose={() => setAdding(false)} onDone={() => { setAdding(false); refresh(); say('Request logged.'); }} />}
      {deciding && <DecideDialog r={deciding} onClose={() => setDeciding(null)} onDone={(m) => { setDeciding(null); refresh(); say(m); }} />}
    </section>
  );
}

function RequestDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const app = useApp();
  const [f, setF] = useState({ kind: 'access', subjectName: '', requestedBy: '', note: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const shake = useShake();
  const make = useMutation({ mutationFn: () => app.api.privacy.create({ kind: f.kind as 'access', subjectName: f.subjectName.trim(), requestedBy: f.requestedBy.trim(), note: f.note.trim() }), onSuccess: onDone, onError: (e) => { setErr(problem(e)); shake.hit(); } });
  return (
    <Dialog title="Log a data request" onClose={onClose} width={500} shake={shake.cls}>
      <div className="stack">
        <SelectField label="What do they want" value={f.kind} onChange={(kind) => setF({ ...f, kind })} options={DATA_REQUEST_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
        <Field label="Whose data" value={f.subjectName} onChange={(subjectName) => { setF({ ...f, subjectName }); setErr({}); }} error={err.subjectName} maxLength={80} />
        <Field label="Asked by (optional)" value={f.requestedBy} onChange={(requestedBy) => setF({ ...f, requestedBy })} maxLength={80} />
        <AreaField label="Details (optional)" value={f.note} onChange={(note) => setF({ ...f, note })} rows={3} maxLength={400} />
        {err._ && <div className="emsg" role="alert">{err._}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={make.isPending} onClick={() => { if (f.subjectName.trim().length < 2) { setErr({ subjectName: 'Whose data is this about?' }); shake.hit(); } else make.mutate(); }}>{make.isPending ? 'Saving…' : 'Log request'}</button>
      </div>
    </Dialog>
  );
}

function DecideDialog({ r, onClose, onDone }: { r: DataRequestRow; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const go = useMutation({ mutationFn: (status: 'done' | 'declined') => app.api.privacy.decide(r.id, { status, note: note.trim() }), onSuccess: (x) => onDone(x.status === 'done' ? 'Request closed as done.' : 'Request declined.'), onError: (e) => setErr((e as Error).message) });
  return (
    <Dialog title={`${KIND_LABEL[r.kind]} · ${r.subjectName}`} onClose={onClose} width={480}>
      <AreaField label="What was done (optional)" value={note} onChange={setNote} rows={3} maxLength={400} />
      {err && <div className="emsg" role="alert" style={{ marginTop: 8 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn dng" disabled={go.isPending} onClick={() => go.mutate('declined')}>Decline</button>
        <button className="btn pri" disabled={go.isPending} onClick={() => go.mutate('done')}>Mark done</button>
      </div>
    </Dialog>
  );
}
