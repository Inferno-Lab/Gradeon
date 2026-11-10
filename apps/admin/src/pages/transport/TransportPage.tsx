import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BusRouteRow, RiderRow, StopInput } from '@gradeon/contracts';
import { Dialog, EmptyCard, Field, NumberField, Segmented, Select, TimeField, useShake } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { Card, Page, useToast } from '../../app/Page';
import { AddBtn, Ico, problem, stamp } from '../../app/kit';

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const UP = 'M12 19V5M6 11l6-6 6 6';
const X = 'M6 6l12 12M18 6 6 18';
// A position older than ten minutes is "last seen", not live.
const isLive = (at: string) => Date.now() - Date.parse(at) < 10 * 60_000;

export function TransportPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [tab, setTab] = useState<'routes' | 'riders'>('routes');
  const [edit, setEdit] = useState<BusRouteRow | 'new' | null>(null);
  const view = useQuery({ queryKey: ['transport'], queryFn: app.api.transport.view, refetchInterval: 30_000 });
  const canWrite = app.user.permissions.includes('transport.write');
  const v = view.data;
  const done = (m: string) => { setEdit(null); void qc.invalidateQueries({ queryKey: ['transport'] }); say(m); };
  return (
    <Page title="Transport" sub="Routes, stops and times, who rides which bus, and where the bus is now" toast={toast} loading={view.isLoading && !v}
      error={view.isError && !v ? { message: (view.error as Error).message, retry: () => void view.refetch() } : null}
      actions={canWrite ? <AddBtn onClick={() => setEdit('new')}>Add a route</AddBtn> : undefined}
      overlays={edit && <RouteDialog route={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onDone={done} />}>
      {v && (!v.routes.length ? (
        <div><EmptyCard title="Transport" chip={{ text: '0 routes', tone: 'v' }} scene="map-pin" heading="No bus routes yet"
          body="Add each route with its stops and times, then put students on their bus. Families see their child’s route and stop in the app, and the bus’s position once the driver shares it."
          actions={canWrite ? <AddBtn onClick={() => setEdit('new')}>Add a route</AddBtn> : undefined} /></div>
      ) : <>
        <section className="grid">
          {[
            { label: 'Routes', value: v.routes.length, note: `${v.routes.reduce((n, r) => n + r.stops.length, 0)} stops`, tone: 'v' },
            { label: 'Riders', value: v.riders.filter((r) => r.routeId).length, note: `of ${v.riders.length} students`, tone: 'a' },
            { label: 'Buses live now', value: v.routes.filter((r) => r.bus && isLive(r.bus.at)).length, note: 'sharing their position', tone: 'g' },
          ].map((t, i) => (
            <div key={t.label} className={`tile t-${t.tone} s4 rise`} style={{ '--d': `${i * 0.05}s` } as React.CSSProperties}>
              <span className="lbl">{t.label}</span>
              <div className="fd" style={{ fontSize: 34, letterSpacing: '-.04em', marginTop: 8 }}>{t.value}</div>
              <div style={{ opacity: 0.75, font: '600 13px var(--fb)' }}>{t.note}</div>
            </div>
          ))}
        </section>
        <Segmented label="Transport" value={tab} onChange={setTab} options={[{ value: 'routes', label: 'Routes', count: v.routes.length }, { value: 'riders', label: 'Who rides', count: v.riders.filter((r) => r.routeId).length }]} />
        {tab === 'routes' && (
          <section className="grid" data-even="">
            {v.routes.map((r) => (
              <Card key={r.id} span="s6" title={r.name} chip={<>{r.bus ? <span className={`chip ${isLive(r.bus.at) ? 'g' : ''}`} data-tip={`${r.bus.lat.toFixed(4)}, ${r.bus.lng.toFixed(4)}`}>{isLive(r.bus.at) ? 'Live' : `Seen ${stamp(r.bus.at)}`}</span> : null}{canWrite && <button className="btn sm" onClick={() => setEdit(r)}>Edit</button>}</>}>
                <div className="kv">Bus<b>{r.vehicle || '–'}</b></div>
                <div className="kv">Driver<b>{r.driverName ? `${r.driverName}${r.driverPhone ? ` · ${r.driverPhone}` : ''}` : '–'}</b></div>
                <div className="kv">Route fee<b>{r.fee ? `${rupees(r.fee)} a term` : 'None'}</b></div>
                <div className="kv">Riders<b>{r.riders}</b></div>
                <div className="lbl" style={{ margin: '12px 0 4px' }}>Stops</div>
                <div className="lscroll" data-even-scroll="" style={{ maxHeight: 240 }}>
                  {!r.stops.length && <div className="help">No stops yet.</div>}
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
      </>)}
    </Page>
  );
}

function Riders({ routes, riders, canWrite, say }: { routes: BusRouteRow[]; riders: RiderRow[]; canWrite: boolean; say: (m: string, tone?: 'bad') => void }) {
  const app = useApp();
  const qc = useQueryClient();
  const classes = useMemo(() => [...new Set(riders.map((r) => r.className))], [riders]);
  const [cls, setCls] = useState(classes[0] ?? '');
  const set = useMutation({ mutationFn: app.api.transport.rider, onSuccess: () => void qc.invalidateQueries({ queryKey: ['transport'] }), onError: (e) => say((e as Error).message, 'bad') });
  const shown = riders.filter((r) => r.className === cls);
  return (
    <Card title="Who rides which bus" chip={<Select compact aria-label="Class" value={cls} onChange={setCls} options={classes.map((c) => ({ value: c, label: c }))} />} style={{ padding: 0 }}>
      <div className="tbl scroll-x"><div style={{ minWidth: 640 }} className="lscroll">
        <div className="grd th" style={{ '--cols': 'minmax(0,1.4fr) minmax(0,1.2fr) minmax(0,1.2fr)' } as React.CSSProperties}><span>Student</span><span>Route</span><span>Stop</span></div>
        {shown.map((r) => {
          const route = routes.find((x) => x.id === r.routeId);
          return (
            <div key={r.studentId} className="grd rw" style={{ '--cols': 'minmax(0,1.4fr) minmax(0,1.2fr) minmax(0,1.2fr)', height: 'auto', minHeight: 56, padding: '8px 20px' } as React.CSSProperties}>
              <b style={{ font: '700 13px var(--fb)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.student}</b>
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
  const [f, setF] = useState({ name: route?.name ?? '', vehicle: route?.vehicle ?? '', driverName: route?.driverName ?? '', driverPhone: route?.driverPhone ?? '', fee: String(route?.fee ?? 0) });
  const [stops, setStops] = useState<StopDraft[]>(() => (route?.stops ?? []).map((s) => ({ id: s.id, name: s.name, pickup: s.pickup, dropTime: s.dropTime, lat: s.lat == null ? '' : String(s.lat), lng: s.lng == null ? '' : String(s.lng) })));
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (x: string) => { setF((o) => ({ ...o, [k]: x })); setErr((e) => ({ ...e, [k]: '', _: '' })); };
  const setStop = (i: number, k: keyof StopDraft) => (x: string) => setStops((list) => list.map((s, j) => (j === i ? { ...s, [k]: x } : s)));
  const move = (i: number) => setStops((list) => { const n = [...list]; [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; return n; });
  const body = () => ({ ...f, name: f.name.trim(), fee: Number(f.fee || 0), stops: stops.filter((s) => s.name.trim()).map((s): StopInput => ({ id: s.id, name: s.name.trim(), pickup: s.pickup, dropTime: s.dropTime, lat: s.lat ? Number(s.lat) : null, lng: s.lng ? Number(s.lng) : null })) });
  const save = useMutation({ mutationFn: () => (route ? app.api.transport.save(route.id, body()) : app.api.transport.add(body())), onSuccess: (r) => onDone(`${r.name} was saved with ${r.stops.length} stops.`), onError: (e) => { setErr(problem(e)); shake.hit(); } });
  const del = useMutation({ mutationFn: () => app.api.transport.remove(route!.id), onSuccess: () => onDone(`${route!.name} was removed.`), onError: (e) => { setErr(problem(e)); shake.hit(); } });
  return (
    <Dialog title={route ? `Edit ${route.name}` : 'Add a route'} onClose={onClose} width={640} shake={shake.cls}>
      <div className="stack">
        <div className="two"><Field label="Route name" value={f.name} onChange={set('name')} error={err.name} placeholder="Route 4 · Baner" /><Field label="Bus number" value={f.vehicle} onChange={set('vehicle')} placeholder="MH12 AB 1234" /></div>
        <div className="two"><Field label="Driver" value={f.driverName} onChange={set('driverName')} placeholder="Suresh Patil" /><Field label="Driver’s phone" type="tel" value={f.driverPhone} onChange={set('driverPhone')} hint="The driver shares the bus’s position from the app with this number." /></div>
        <NumberField label="Route fee for a term (₹)" value={f.fee} onChange={set('fee')} min={0} />
        <div>
          <div className="lbl" style={{ marginBottom: 8 }}>Stops, in order</div>
          {stops.map((s, i) => (
            <div key={s.id ?? `n${i}`} className="card" style={{ padding: 12, marginBottom: 8, boxShadow: 'none', background: 'var(--sunk)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: 0 }}><Field label={`Stop ${i + 1}`} value={s.name} onChange={setStop(i, 'name')} placeholder="Baner gaon" /></div>
                <button type="button" className="btn sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i)}><Ico d={UP} /></button>
                <button type="button" className="btn sm" aria-label="Remove stop" onClick={() => setStops((list) => list.filter((_, j) => j !== i))}><Ico d={X} /></button>
              </div>
              <div className="two"><TimeField label="Pick-up" value={s.pickup} onChange={setStop(i, 'pickup')} /><TimeField label="Drop" value={s.dropTime} onChange={setStop(i, 'dropTime')} /></div>
              <div className="two"><NumberField label="Latitude (optional)" decimals value={s.lat} onChange={setStop(i, 'lat')} min={-90} max={90} step={0.0001} /><NumberField label="Longitude (optional)" decimals value={s.lng} onChange={setStop(i, 'lng')} min={-180} max={180} step={0.0001} /></div>
            </div>
          ))}
          <button type="button" className="btn sm" onClick={() => setStops((l) => [...l, { name: '', pickup: '', dropTime: '', lat: '', lng: '' }])}>Add a stop</button>
          <div className="help" style={{ marginTop: 6 }}>With a stop’s place on the map, families get “the bus is near” and an arrival time.</div>
        </div>
        {err._ && <div className="emsg" role="alert">{err._}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        {route && <button className="btn" style={{ marginRight: 'auto' }} disabled={del.isPending} onClick={() => del.mutate()}>Remove route</button>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={save.isPending || !f.name.trim()} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save route'}</button>
      </div>
    </Dialog>
  );
}
