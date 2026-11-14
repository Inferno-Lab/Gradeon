import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BusRouteRow, RiderRow, StopInput } from '@gradeon/contracts';
import { DateField, Dialog, EmptyCard, Field, NumberField, Select, SelectField, TimeField, useShake, EmptyState, EmptyNote } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { Card, Page, useToast } from '../../app/Page';
import { AddBtn, Ico, problem, stamp } from '../../app/kit';
import { usePageTabs } from '../../app/tabs';
import { useShellChrome } from '../../app/Layout';

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const UP = 'up';
const DOWN = 'down';
const X = 'close';
// A position older than ten minutes is "last seen", not live.
const isLive = (at: string) => Date.now() - Date.parse(at) < 10 * 60_000;

export function TransportPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const { tab: at, tabs } = usePageTabs('/transport');
  const tab = at || 'routes';
  const [edit, setEdit] = useState<BusRouteRow | 'new' | null>(null);
  const [billing, setBilling] = useState<BusRouteRow | null>(null);
  const { shell } = useShellChrome();
  const canBill = app.user.permissions.includes('fees.collect') && !!shell?.modules.includes('fees');
  const view = useQuery({ queryKey: ['transport'], queryFn: app.api.transport.view, refetchInterval: 30_000 });
  const canWrite = app.user.permissions.includes('transport.write');
  const v = view.data;
  const done = (m: string) => { setEdit(null); void qc.invalidateQueries({ queryKey: ['transport'] }); say(m); };
  return (
    <Page title="Transport" sub="Routes, stops and times, who rides which bus, and today’s trips" toast={toast} loading={view.isLoading && !v}
      error={view.isError && !v ? { message: (view.error as Error).message, retry: () => void view.refetch() } : null}
      tabs={tabs} actions={<>{canWrite && <AddBtn onClick={() => setEdit('new')}>Add a route</AddBtn>}</>}
      overlays={<>
        {edit && <RouteDialog route={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onDone={done} />}
        {billing && <BillDialog route={billing} onClose={() => setBilling(null)} onDone={(m) => { setBilling(null); say(m); }} />}
      </>}>
      {v && (!v.routes.length ? (
        tab === 'riders' ? <EmptyCard title="Riders" icon="people" heading="No riders yet" body="Add a route first, then put students on it with their stop. Families see the bus, the stop and the pick-up time in the app."
            actions={canWrite ? <button className="btn pri" onClick={() => setEdit('new')}>Add a route</button> : undefined} />
        : tab === 'live' ? <EmptyCard title="Live bus" art="map-pin" heading="No bus on the road" body="When a route has a driver, the bus shows here live during each trip, and families at the next stop are told it is near."
            actions={canWrite ? <button className="btn pri" onClick={() => setEdit('new')}>Add a route</button> : undefined} />
        : <div><EmptyState scene="transport" onAction={canWrite ? () => setEdit('new') : undefined} /></div>
      ) : <>
        <section className="grid">
          {[
            { label: 'Routes', value: v.routes.length, note: `${v.routes.reduce((n, r) => n + r.stops.length, 0)} stops`, tone: 'v' },
            { label: 'Riders', value: v.riders.filter((r) => r.routeId).length, note: `of ${v.riders.length} students`, tone: 'a' },
            { label: 'Buses live now', value: v.routes.filter((r) => r.bus && isLive(r.bus.at)).length, note: 'sharing their position', tone: 'g' },
          ].map((t, i) => (
            <div key={t.label} className={`tile t-${t.tone} s4 rise`} style={{ '--d': `${i * 0.05}s` } as React.CSSProperties}>
              <span className="lbl">{t.label}</span>
              <div className="fd" style={{ fontSize: 30, letterSpacing: '-.04em', marginTop: 8 }}>{t.value}</div>
              <div style={{ opacity: 0.75, font: '600 13px var(--fb)' }}>{t.note}</div>
            </div>
          ))}
        </section>
        {tab === 'routes' && (
          <section className="grid" data-even="">
            {v.routes.map((r) => (
              <Card key={r.id} span="s6" title={r.name} chip={<>{r.bus ? <span className={`chip ${isLive(r.bus.at) ? 'g' : ''}`} data-tip={`${r.bus.lat.toFixed(4)}, ${r.bus.lng.toFixed(4)}`}>{isLive(r.bus.at) ? 'Live' : `Seen ${stamp(r.bus.at)}`}</span> : null}{canWrite && <button className="btn sm" onClick={() => setEdit(r)}>Edit</button>}</>}>
                <div className="kv">Bus<b>{r.vehicle || '–'}</b></div>
                <div className="kv">Driver<b>{r.driverName ? `${r.driverName}${r.driverPhone ? ` · ${r.driverPhone}` : ''}` : '–'}</b></div>
                <div className="kv">Route fee<b style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{r.fee ? `${rupees(r.fee)} a term` : 'None'}{canBill && r.fee > 0 && r.riders > 0 && <button className="btn sm" onClick={() => setBilling(r)}>Bill riders</button>}</b></div>
                <div className="kv">Riders<b>{r.riders}</b></div>
                <div className="lbl" style={{ margin: '12px 0 4px' }}>Stops</div>
                <div className="lscroll" data-even-scroll="" style={{ maxHeight: 240 }}>
                  {!r.stops.length && <EmptyNote icon="route" title="No stops yet" body="Add the stops in the order the bus reaches them." />}
                  {r.stops.map((s) => (
                    <div key={s.id} className="kv" style={{ alignItems: 'center' }}>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-tip={s.lat == null ? 'Not on the map: no “bus is near” for this stop' : 'On the map'}>{s.position}. {s.name}</span>
                      <b className="num">{s.pickup || '–'}{s.dropTime ? ` / ${s.dropTime}` : ''} · {s.riders}</b>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </section>
        )}
        {tab === 'riders' && <Riders routes={v.routes} riders={v.riders} canWrite={canWrite} say={say} />}
        {tab === 'live' && <Live routes={v.routes} />}
      </>)}
    </Page>
  );
}

function Riders({ routes, riders, canWrite, say }: { routes: BusRouteRow[]; riders: RiderRow[]; canWrite: boolean; say: (m: string, tone?: 'bad') => void }) {
  const app = useApp();
  const qc = useQueryClient();
  const classes = useMemo(() => [...new Set(riders.map((r) => r.className))], [riders]);
  const [cls, setCls] = useState(classes[0] ?? '');
  const [q, setQ] = useState('');
  const set = useMutation({
    mutationFn: app.api.transport.rider,
    onSuccess: (_r, b) => { void qc.invalidateQueries({ queryKey: ['transport'] }); const who = riders.find((x) => x.studentId === b.studentId)?.student ?? 'The student'; say(b.routeId ? `${who}: saved.` : `${who} no longer rides a bus.`); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  // A name typed finds the student in any class; otherwise one class at a time.
  const term = q.trim().toLowerCase();
  const shown = term ? riders.filter((r) => r.student.toLowerCase().includes(term)).slice(0, 60) : riders.filter((r) => r.className === cls);
  return (
    <Card title="Who rides which bus" chip={<span className="tgrow"><Field label="Find a student" value={q} onChange={setQ} placeholder="Name" />{!term && <Select compact aria-label="Class" value={cls} onChange={setCls} options={classes.map((c) => ({ value: c, label: c }))} />}</span>} style={{ padding: 0 }}>
      <div className="tbl scroll-x"><div style={{ minWidth: 640 }} className="lscroll">
        <div className="grd th" style={{ '--cols': 'minmax(0,1.4fr) minmax(0,1.2fr) minmax(0,1.2fr)' } as React.CSSProperties}><span>Student</span><span>Route</span><span>Stop</span></div>
        {shown.map((r) => {
          const route = routes.find((x) => x.id === r.routeId);
          return (
            <div key={r.studentId} className="grd rw" style={{ '--cols': 'minmax(0,1.4fr) minmax(0,1.2fr) minmax(0,1.2fr)', height: 'auto', minHeight: 56, padding: '8px 20px' } as React.CSSProperties}>
              <b style={{ font: '700 13px var(--fb)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.student}{term && <small className="help" style={{ display: 'block', margin: 0 }}>{r.className}</small>}</b>
              <Select compact aria-label={`Route for ${r.student}`} disabled={!canWrite || set.isPending} value={r.routeId ?? ''} onChange={(x) => set.mutate({ studentId: r.studentId, routeId: x || null, stopId: null })}
                options={[{ value: '', label: 'Does not ride' }, ...routes.map((x) => ({ value: x.id, label: x.name }))]} />
              <Select compact aria-label={`Stop for ${r.student}`} disabled={!canWrite || !route || set.isPending} value={r.stopId ?? ''} onChange={(x) => set.mutate({ studentId: r.studentId, routeId: r.routeId, stopId: x || null })}
                options={[{ value: '', label: route ? 'Choose a stop' : '–' }, ...(route?.stops ?? []).map((s) => ({ value: s.id, label: `${s.name}${s.pickup ? ` · ${s.pickup}` : ''}` }))]} />
            </div>
          );
        })}
      </div></div>
    </Card>
  );
}

type StopDraft = { id?: string; name: string; pickup: string; dropTime: string; lat: string; lng: string };

function RouteDialog({ route, onClose, onDone }: { route: BusRouteRow | null; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const shake = useShake();
  const [f, setF] = useState({ name: route?.name ?? '', vehicle: route?.vehicle ?? '', driverUserId: route?.driverUserId ?? '', attendantName: route?.attendantName ?? '', attendantPhone: route?.attendantPhone ?? '', trackerId: route?.trackerId ?? '', fee: String(route?.fee ?? 0) });
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => app.api.staff.list() });
  const [sure, setSure] = useState(false);
  const [stops, setStops] = useState<StopDraft[]>(() => (route?.stops ?? []).map((s) => ({ id: s.id, name: s.name, pickup: s.pickup, dropTime: s.dropTime, lat: s.lat == null ? '' : String(s.lat), lng: s.lng == null ? '' : String(s.lng) })));
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (x: string) => { setF((o) => ({ ...o, [k]: x })); setErr((e) => ({ ...e, [k]: '', _: '' })); };
  const setStop = (i: number, k: keyof StopDraft) => (x: string) => setStops((list) => list.map((s, j) => (j === i ? { ...s, [k]: x } : s)));
  const move = (i: number, by: -1 | 1) => setStops((list) => { const n = [...list]; [n[i + by], n[i]] = [n[i]!, n[i + by]!]; return n; });
  const [dropping, setDropping] = useState<number | null>(null);
  const ridersAt = (id?: string) => route?.stops.find((x) => x.id === id)?.riders ?? 0;
  const channels = useQuery({ queryKey: ['settings', 'channels'], queryFn: app.api.settings.channels, staleTime: 5 * 60_000 });
  const maps = channels.data?.channels.find((c) => c.capability === 'maps')?.state === 'on';
  const body = () => ({ ...f, name: f.name.trim(), driverUserId: f.driverUserId || null, fee: Number(f.fee || 0), stops: stops.filter((s) => s.name.trim()).map((s): StopInput => ({ id: s.id, name: s.name.trim(), pickup: s.pickup, dropTime: s.dropTime, lat: s.lat ? Number(s.lat) : null, lng: s.lng ? Number(s.lng) : null })) });
  const save = useMutation({ mutationFn: () => (route ? app.api.transport.save(route.id, body()) : app.api.transport.add(body())), onSuccess: (r) => onDone(`${r.name} was saved with ${r.stops.length} stops.`), onError: (e) => { setErr(problem(e)); shake.hit(); } });
  const del = useMutation({ mutationFn: () => app.api.transport.remove(route!.id), onSuccess: () => onDone(`${route!.name} was removed.`), onError: (e) => { setErr(problem(e)); shake.hit(); } });
  return (
    <Dialog title={route ? `Edit ${route.name}` : 'Add a route'} onClose={onClose} width={640} shake={shake.cls}>
      <div className="stack">
        <div className="two"><Field label="Route name" value={f.name} onChange={set('name')} error={err.name} placeholder="Route 4 · Baner" /><Field label="Bus number" value={f.vehicle} onChange={set('vehicle')} placeholder="MH12 AB 1234" /></div>
        <div>
          <SelectField label="Driver" value={f.driverUserId} onChange={set('driverUserId')} error={err.driverUserId}
            options={[{ value: '', label: 'No driver yet' }, ...(staff.data ?? []).filter((p) => p.status === 'active').map((p) => ({ value: p.id, label: `${p.name}${p.designation ? ` · ${p.designation}` : ''}` }))]} />
          <div className="help" style={{ marginTop: 6 }}>The driver signs in to the app as a bus driver (when the school uses that role) to run this route’s trips: the bus’s position, who got on and off, delays.</div>
        </div>
        <div className="two"><Field label="Attendant" value={f.attendantName} onChange={set('attendantName')} placeholder="Meena Kale" /><Field label="Attendant’s phone" type="tel" value={f.attendantPhone} onChange={set('attendantPhone')} hint="Families call the attendant or the office about the bus, never the driver." /></div>
        <Field label="GPS tracker number (optional)" value={f.trackerId} onChange={set('trackerId')} hint="If the bus has a tracker: its number at the tracker company. Its position is used while a trip runs." />
        <NumberField label="Route fee for a term (₹)" value={f.fee} onChange={set('fee')} min={0} />
        <div>
          <div className="lbl" style={{ marginBottom: 8 }}>Stops, in order</div>
          {stops.map((s, i) => (
            <div key={s.id ?? `n${i}`} className="card" style={{ padding: 12, marginBottom: 8, boxShadow: 'none', background: 'var(--s2)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: 0 }}><Field label={`Stop ${i + 1}`} value={s.name} onChange={setStop(i, 'name')} placeholder="Baner gaon" /></div>
                <button type="button" className="btn sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><Ico d={UP} /></button>
                <button type="button" className="btn sm" aria-label="Move down" disabled={i === stops.length - 1} onClick={() => move(i, 1)}><Ico d={DOWN} /></button>
                <button type="button" className="btn sm" aria-label="Remove stop" onClick={() => (ridersAt(s.id) ? setDropping(i) : setStops((list) => list.filter((_, j) => j !== i)))}><Ico d={X} /></button>
              </div>
              {dropping === i && <div className="tgrow" style={{ marginTop: 8 }}><span className="help">{ridersAt(s.id)} {ridersAt(s.id) === 1 ? 'rider loses' : 'riders lose'} this stop and must be given another.</span><button type="button" className="btn sm dngf" onClick={() => { setStops((list) => list.filter((_, j) => j !== i)); setDropping(null); }}>Remove it</button><button type="button" className="btn sm" onClick={() => setDropping(null)}>Keep</button></div>}
              <div className="two"><TimeField label="Pick-up" value={s.pickup} onChange={setStop(i, 'pickup')} /><TimeField label="Drop" value={s.dropTime} onChange={setStop(i, 'dropTime')} /></div>
              {maps && <PlaceFind placed={!!s.lat} onPick={(p) => setStops((list) => list.map((x, j) => (j === i ? { ...x, lat: String(p.lat), lng: String(p.lng) } : x)))} />}
            </div>
          ))}
          <button type="button" className="btn sm" onClick={() => setStops((l) => [...l, { name: '', pickup: '', dropTime: '', lat: '', lng: '' }])}>Add a stop</button>
          <div className="help" style={{ marginTop: 6 }}>{maps ? 'With a stop’s place found on the map, families get “the bus is near” and an arrival time.' : 'Once Gradeon connects maps for your school, each stop can be found on the map, and families get “the bus is near”.'}</div>
        </div>
        {err._ && <div className="emsg" role="alert">{err._}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        {route && (sure
          ? <button className="btn dng" style={{ marginRight: 'auto' }} disabled={del.isPending} onClick={() => del.mutate()}>Remove {route.name} and unassign its {route.riders} riders</button>
          : <button className="btn" style={{ marginRight: 'auto' }} onClick={() => setSure(true)}>Remove route…</button>)}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={save.isPending || !f.name.trim()} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save route'}</button>
      </div>
    </Dialog>
  );
}

const KIND = { morning: 'Morning', afternoon: 'Afternoon' } as const;

/** Today on every route: which trip runs, where the bus was last seen, who got on and off, and any delay the driver reported. */
function Live({ routes }: { routes: BusRouteRow[] }) {
  return (
    <section className="grid" data-even="">
      {routes.map((r) => {
        const running = r.trips.find((t) => !t.endedAt);
        return (
          <Card key={r.id} span="s6" title={r.name} chip={<span className={`chip ${running ? 'g' : ''}`}>{running ? `${KIND[running.kind]} trip running` : r.trips.length ? 'No trip running' : 'Not out today'}</span>}>
            <div className="kv">Bus<b>{r.vehicle || '–'}</b></div>
            <div className="kv">Driver<b>{r.driverName || 'None chosen'}</b></div>
            <div className="kv">Last seen<b>{r.bus ? `${stamp(r.bus.at)}${isLive(r.bus.at) ? ' · live' : ''}` : 'Not yet today'}</b></div>
            <RouteMap id={r.id} at={r.bus?.at ?? ''} />
            {!r.trips.length && <div className="help" style={{ marginTop: 8 }}>The driver starts each trip in the app; it shows here as it runs.</div>}
            {r.trips.map((t) => (
              <div key={t.id} className="kv" style={{ alignItems: 'flex-start', gap: 12 }}>
                <span style={{ minWidth: 0 }}>{KIND[t.kind]}<small style={{ display: 'block', color: 'var(--ink3)' }}>{stamp(t.startedAt)}{t.endedAt ? ` to ${stamp(t.endedAt)}` : ', running'}{t.lateMinutes ? ` · ${t.lateMinutes} min late: ${t.lateReason}` : ''}</small></span>
                <b className="num">{t.boarded} on · {t.dropped} off{t.absent ? ` · ${t.absent} absent` : ''}</b>
              </div>
            ))}
          </Card>
        );
      })}
    </section>
  );
}

/** Finds a stop's place through the school's maps connection: type the name or address, pick the right one. */
function PlaceFind({ placed, onPick }: { placed: boolean; onPick: (p: { lat: number; lng: number }) => void }) {
  const app = useApp();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [chosen, setChosen] = useState('');
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  const found = useQuery({ queryKey: ['places', term], queryFn: () => app.api.transport.places(term), enabled: term.length >= 3 });
  return (
    <div style={{ marginTop: 8 }}>
      <Field label={placed ? 'On the map · find again to move it' : 'Find it on the map'} value={q} onChange={(v) => { setQ(v); setChosen(''); }} placeholder="Stop name or address" hint={chosen || undefined} />
      {!chosen && (found.data?.length ?? 0) > 0 && (
        <div className="pks">{found.data!.map((p) => <button key={`${p.lat},${p.lng}`} type="button" className="pk" onClick={() => { onPick(p); setChosen(`Placed at ${p.label}`); }}><span><b>{p.label}</b></span></button>)}</div>
      )}
      {!chosen && term.length >= 3 && found.data?.length === 0 && <EmptyNote icon="map" title="Nothing found" body="Try the street address, or a landmark near the stop." />}
    </div>
  );
}

/** The route's stops and the bus on the school's map; nothing without a maps connection. */
function RouteMap({ id, at }: { id: string; at: string }) {
  const app = useApp();
  const q = useQuery({ queryKey: ['transport', 'map', id, at], queryFn: () => app.api.transport.map(id), staleTime: 60_000 });
  if (!q.data?.url) return null;
  return <img src={q.data.url} alt="The route on a map, with the bus" loading="lazy" style={{ width: '100%', borderRadius: 12, marginTop: 8, display: 'block', background: 'var(--s2)' }} />;
}

/** Bills every rider of a route its fee as a Transport fee; billing twice under the same name adds nothing. */
function BillDialog({ route, onClose, onDone }: { route: BusRouteRow; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const shake = useShake();
  const { shell } = useShellChrome();
  const [title, setTitle] = useState(`${route.name} · ${shell?.term.name || 'this term'}`);
  const [dueOn, setDueOn] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const bill = useMutation({
    mutationFn: () => app.api.transport.bill(route.id, { title: title.trim(), dueOn }),
    onSuccess: (r) => onDone(`${r.created} ${r.created === 1 ? 'family was' : 'families were'} billed ${rupees(route.fee)}.${r.skipped ? ` ${r.skipped} already had it.` : ''}`),
    onError: (e) => { setErr(problem(e)); shake.hit(); },
  });
  return (
    <Dialog title={`Bill the riders of ${route.name}`} onClose={onClose} width={480} shake={shake.cls}>
      <div className="stack">
        <p className="help" style={{ margin: 0 }}>{route.riders} {route.riders === 1 ? 'rider' : 'riders'} get a Transport fee of {rupees(route.fee)}.</p>
        <Field label="Fee name" value={title} onChange={(v) => { setTitle(v); setErr({}); }} error={err.title} maxLength={80} />
        <DateField label="Due on" value={dueOn} onChange={(v) => { setDueOn(v); setErr({}); }} error={err.dueOn} />
        {err._ && <div className="emsg" role="alert">{err._}</div>}
        <div className="tgrow" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn pri" disabled={bill.isPending || !dueOn || title.trim().length < 3} onClick={() => bill.mutate()}>{bill.isPending ? 'Billing…' : `Bill ${route.riders}`}</button>
        </div>
      </div>
    </Dialog>
  );
}
