import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EVENT_KINDS, istToday, type Category, type EventKind, type EventRow, type ExamRow } from '@tangent/contracts';
import { Checkbox, DateField, Dialog, Field, NumberField, SelectField, TimeField, useShake, EmptyState, EmptyNote } from '@tangent/web-ui';
import { useApp } from '../../app/context';
import { Page, useToast } from '../../app/Page';
import { AddBtn, AreaField, Ico, problem, useSetting } from '../../app/kit';
import { useShellChrome } from '../../app/Layout';

const KIND: Record<EventKind, { label: string; tone: string }> = { event: { label: 'Event', tone: 'v' }, holiday: { label: 'Holiday', tone: 'g' }, exam: { label: 'Exams', tone: 'a' }, ptm: { label: 'Parent meeting', tone: 'k' }, routine: { label: 'Routine', tone: '' } };
const AUDIENCE: Record<string, string> = { everyone: 'Everyone', parents: 'Parents', staff: 'Staff only', class: 'One class' };
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PREV = 'caretLeft';
const NEXT = 'caretRight';
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOf = (iso: string) => ymd(new Date(iso));
const when = (e: EventRow) => {
  const s = new Date(e.startsAt);
  const day = s.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const t = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (e.kind === 'holiday' || e.kind === 'exam') return e.endsAt ? `${day} to ${new Date(e.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : day;
  return `${day} · ${t(s)}${e.endsAt ? ` to ${t(new Date(e.endsAt))}` : ''}`;
};
/** Exams shown on the calendar as the weeks they run (opened in Exams, not edited here). */
const examEvents = (exams: ExamRow[]): EventRow[] => exams.map((x) => ({
  id: `exam:${x.id}`, title: `${x.name} · Class ${x.className}`, startsAt: `${x.startsOn}T00:00:00+05:30`, endsAt: `${x.endsOn}T00:00:00+05:30`, kind: 'exam', venue: '', note: '', audience: 'everyone',
  category: '', needsRsvp: false, lat: null, lng: null, going: 0, maybe: 0, cant: 0, adults: 0, classId: x.classId, className: x.className,
}));
const refresh = (qc: ReturnType<typeof useQueryClient>) => void qc.invalidateQueries({ predicate: (q) => ['events', 'dashboard'].includes(String(q.queryKey[0])) });

export function EventsPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [day, setDay] = useState<string | null>(null);
  const [editing, setEditing] = useState<EventRow | 'new' | null>(null);
  const list = useQuery({ queryKey: ['events'], queryFn: app.api.events.list });
  const canWrite = app.user.permissions.includes('events.write');
  // Exam weeks live in Exams; they show here from there, typed once.
  const { shell } = useShellChrome();
  const seeExams = !!shell?.modules.includes('exams') && app.user.permissions.includes('exams.read');
  const exams = useQuery({ queryKey: ['exams', ''], queryFn: () => app.api.exams.list(), enabled: seeExams });
  const sunday = useSetting<string>('calendar.weekStarts', 'mon') === 'sun';
  const all = useMemo(() => [...(list.data ?? []).filter((e) => e.kind !== 'exam'), ...examEvents(exams.data ?? [])].sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [list.data, exams.data]);
  const today = istToday();
  const byDay = useMemo(() => {
    const m = new Map<string, EventRow[]>();
    for (const e of all) {
      const start = new Date(e.startsAt);
      const end = e.endsAt && (e.kind === 'holiday' || e.kind === 'exam') ? new Date(e.endsAt) : start;
      for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()); d <= end; d.setDate(d.getDate() + 1)) { const k = ymd(d); m.set(k, [...(m.get(k) ?? []), e]); }
    }
    return m;
  }, [all]);
  const shown = day ? byDay.get(day) ?? [] : all.filter((e) => dayOf(e.endsAt ?? e.startsAt) >= today);
  const past = day ? [] : all.filter((e) => dayOf(e.endsAt ?? e.startsAt) < today).reverse();
  // The week starts on the school's first day (console: calendar.weekStarts).
  const first = sunday ? month.getDay() : month.getDay() === 0 ? 6 : month.getDay() - 1;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array.from({ length: first }, () => null), ...Array.from({ length: days }, (_, i) => ymd(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
  return (
    <Page title="Events" sub="The school calendar, and who is coming" toast={toast} loading={list.isLoading && !list.data}
      error={list.isError && !list.data ? { message: (list.error as Error).message, retry: () => void list.refetch() } : null}
      actions={canWrite ? <AddBtn onClick={() => setEditing('new')}>Add event</AddBtn> : undefined}
      overlays={editing && <EventDialog event={editing === 'new' ? null : editing} defaultDay={day} onClose={() => setEditing(null)} onDone={(m) => { setEditing(null); refresh(qc); say(m); }} />}>
      {all.length === 0 ? (
        <div><EmptyState scene="events" onAction={canWrite ? () => setEditing('new') : undefined} /></div>
      ) : (
        <section className="evg" data-even="">
          <div className="evcol">
          <div className="card rise evc">
            <div className="ch"><h2>{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h2>
              <button className="btn sm" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Ico d={PREV} /></button>
              <button className="btn sm" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Ico d={NEXT} /></button>
            </div>
            <div className="cal" role="grid" aria-label="Calendar">
              {(sunday ? ['Sun', ...WEEK.slice(0, 6)] : WEEK).map((d) => <span className="calh" key={d}>{d}</span>)}
              {cells.map((c, i) => c ? (
                <button key={c} className={`calc ${c === today ? 'now' : ''} ${c === day ? 'sel' : ''}`} aria-pressed={c === day} aria-label={`${c}${byDay.get(c)?.length ? `, ${byDay.get(c)!.length} events` : ''}`} onClick={() => setDay(c === day ? null : c)}>
                  {Number(c.slice(8))}
                  <span className="cald">{(byDay.get(c) ?? []).slice(0, 3).map((e) => <i key={e.id} className={`k-${e.kind}`}></i>)}</span>
                </button>
              ) : <span key={`b${i}`}></span>)}
            </div>
            <div className="tgrow" style={{ marginTop: 12, gap: 12 }}>{(['event', 'ptm', 'exam', 'holiday'] as EventKind[]).map((k) => <span key={k} className="lgd"><i className={`k-${k}`} style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', marginRight: 6 }}></i>{KIND[k].label}</span>)}</div>
          </div>
          </div>
          <div className="card rise evl" style={{ '--d': '.06s' } as React.CSSProperties}>
            <div className="ch"><h2>{day ? new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Coming up'}</h2>{day && <button className="btn sm" onClick={() => setDay(null)}>Show all</button>}</div>
            <div className="lscroll" data-even-scroll="" style={{ maxHeight: 'min(62dvh,620px)', marginTop: 8 }}>
              {shown.length === 0 && <EmptyNote icon="calendar" title={day ? 'Nothing on this day' : 'Nothing coming up'} body={day ? 'Pick another day, or add an event for this one.' : 'Add an event and it shows here and in the families’ app.'} />}
              {shown.map((e) => <EventItem key={e.id} e={e} canWrite={canWrite} onOpen={() => (e.id.startsWith('exam:') ? app.go(`/exams?open=${e.id.slice(5)}`) : setEditing(e))} />)}
              {past.length > 0 && <><div className="lbl" style={{ padding: '16px 0 6px' }}>Earlier</div>{past.map((e) => <EventItem key={e.id} e={e} canWrite={canWrite} onOpen={() => (e.id.startsWith('exam:') ? app.go(`/exams?open=${e.id.slice(5)}`) : setEditing(e))} dim />)}</>}
            </div>
          </div>
        </section>
      )}
    </Page>
  );
}

function EventItem({ e, canWrite, onOpen, dim }: { e: EventRow; canWrite: boolean; onOpen: () => void; dim?: boolean }) {
  const replies = e.going + e.maybe + e.cant;
  return (
    <button className="evi" style={{ opacity: dim ? 0.6 : 1 }} onClick={onOpen} aria-label={`${canWrite ? 'Edit' : 'Open'} ${e.title}`}>
      <span className={`evk k-${e.kind}`}></span>
      <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
        <b data-tip={e.title}>{e.title}</b>
        <small>{when(e)}{e.venue ? ` · ${e.venue}` : ''}</small>
        {e.note && <small className="evn">{e.note}</small>}
      </span>
      <span style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
        <span className={`chip ${KIND[e.kind].tone}`}>{KIND[e.kind].label}</span>
        {replies > 0 && <span className="chip g" data-tip={`${e.going} going, ${e.maybe} maybe, ${e.cant} cannot`}>{e.going} going</span>}
        {e.audience !== 'everyone' && <span className="chip">{e.audience === 'class' ? `Class ${e.className ?? ''}` : AUDIENCE[e.audience]}</span>}
      </span>
    </button>
  );
}

/** A stored time as the school's day and clock (India Standard Time), whatever the browser's time zone. */
const local = (iso: string) => { const d = new Date(new Date(iso).getTime() + 330 * 60_000).toISOString(); return { date: d.slice(0, 10), time: d.slice(11, 16) }; };

function EventDialog({ event, defaultDay, onClose, onDone }: { event: EventRow | null; defaultDay: string | null; onClose: () => void; onDone: (msg: string) => void }) {
  const app = useApp();
  const canWrite = app.user.permissions.includes('events.write');
  const s = event ? local(event.startsAt) : { date: defaultDay ?? istToday(), time: '10:00' };
  const en = event?.endsAt ? local(event.endsAt) : { date: s.date, time: '12:00' };
  const cats = useSetting<Category[]>('events.categories', []);
  const classes = useQuery({ queryKey: ['classes'], queryFn: app.api.classes, staleTime: 5 * 60_000, enabled: canWrite });
  const replies = useQuery({ queryKey: ['events', event?.id, 'replies'], queryFn: () => app.api.events.replies(event!.id), enabled: !!event && event.going + event.maybe + event.cant > 0 });
  const [showReplies, setShowReplies] = useState(false);
  const [f, setF] = useState({ title: event?.title ?? '', kind: (event?.kind ?? 'event') as EventKind, date: s.date, time: s.time, endDate: en.date, endTime: en.time, venue: event?.venue ?? '', note: event?.note ?? '', audience: event?.audience ?? 'everyone', classId: event?.classId ?? '',
    category: event?.category ?? cats[0]?.key ?? '', lat: event?.lat == null ? '' : String(event.lat), lng: event?.lng == null ? '' : String(event.lng) });
  const [needsRsvp, setNeedsRsvp] = useState(event?.needsRsvp ?? false);
  const [err, setErr] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const shake = useShake();
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErr((e) => ({ ...e, [k]: '', _: '' })); };
  const holiday = f.kind === 'holiday';
  // Times are the school's (India Standard Time), whatever the browser's clock is set to.
  const body = () => ({
    title: f.title.trim(), kind: f.kind, venue: f.venue.trim(), note: f.note.trim(), audience: f.audience as 'everyone', classId: f.audience === 'class' ? f.classId : null, category: f.category, needsRsvp: !holiday && needsRsvp,
    lat: f.lat ? Number(f.lat) : null, lng: f.lng ? Number(f.lng) : null,
    startsAt: new Date(`${f.date}T${holiday ? '00:00' : f.time}:00+05:30`).toISOString(), endsAt: new Date(`${f.endDate}T${holiday ? '00:00' : f.endTime}:00+05:30`).toISOString(),
  });
  const save = useMutation({
    mutationFn: () => (event ? app.api.events.save(event.id, body()) : app.api.events.create(body())),
    onSuccess: (r) => onDone(event ? `${r.title} was updated.` : `${r.title} was added.${r.audience === 'staff' ? '' : ' Families are told.'}`),
    onError: (e) => { setErr(problem(e)); shake.hit(); },
  });
  const del = useMutation({ mutationFn: () => app.api.events.remove(event!.id), onSuccess: () => onDone(`${event!.title} was removed.`), onError: (e) => { setConfirm(false); setErr(problem(e)); shake.hit(); } });
  const go = () => {
    const p: Record<string, string> = {};
    if (f.title.trim().length < 3) p.title = 'Name the event.';
    if (f.audience === 'class' && !f.classId) p.classId = 'Choose the class.';
    if (!f.date) p.date = 'Pick the day.';
    if (f.endDate < f.date || (!holiday && f.endDate === f.date && f.endTime < f.time)) p.endDate = 'It cannot end before it starts.';
    setErr(p);
    if (Object.keys(p).length) shake.hit(); else save.mutate();
  };
  return (
    <Dialog title={event ? (canWrite ? 'Edit event' : event.title) : 'Add event'} tag={event ? { text: KIND[event.kind].label, tone: 'v' } : undefined} onClose={onClose} width={560} shake={shake.cls}>
      {event && (event.going + event.maybe + event.cant > 0) && (
        <div style={{ marginBottom: 12 }}>
          <div className="tgrow"><span className="chip g">{event.going} going{event.adults ? ` · ${event.adults} adults` : ''}</span><span className="chip a">{event.maybe} maybe</span><span className="chip">{event.cant} cannot come</span>
            <button className="btn sm" onClick={() => setShowReplies((x) => !x)}>{showReplies ? 'Hide who' : 'See who'}</button></div>
          {showReplies && (
            <div className="lscroll" style={{ maxHeight: 220, marginTop: 8, border: '1px solid var(--line)', borderRadius: 12, padding: '4px 12px' }}>
              {(replies.data ?? []).map((r, i) => <div key={i} className="kv"><span>{r.studentName} · Class {r.className}<small style={{ display: 'block', color: 'var(--ink3)' }}>{r.guardianName}</small></span><b>{r.status === 'going' ? `Going${r.adults ? ` · ${r.adults} adults` : ''}` : r.status === 'maybe' ? 'Maybe' : 'Cannot come'}</b></div>)}
            </div>
          )}
        </div>
      )}
      {event && !canWrite ? (
        <div className="stack">
          <div className="kv"><span>When</span><b>{when(event)}</b></div>
          {event.venue && <div className="kv"><span>Where</span><b>{event.venue}</b></div>}
          <div className="kv"><span>For</span><b>{event.audience === 'class' ? `Class ${event.className ?? ''}` : AUDIENCE[event.audience]}</b></div>
          {event.note && <p style={{ margin: 0, font: '400 14px/1.5 var(--fb)' }}>{event.note}</p>}
        </div>
      ) : (
      <div className="stack">
        <Field label="Name" value={f.title} onChange={set('title')} error={err.title} maxLength={100} />
        <div className="two">
          <SelectField label="Kind" value={f.kind} onChange={set('kind')} options={EVENT_KINDS.filter((k) => k !== 'routine' && k !== 'exam').map((k) => ({ value: k, label: KIND[k].label }))} />
          <SelectField label="Who is told" value={f.audience} onChange={set('audience')} options={Object.entries(AUDIENCE).map(([value, label]) => ({ value, label }))} />
        </div>
        {f.audience === 'class' && <SelectField label="Which class" value={f.classId} onChange={set('classId')} error={err.classId} options={[{ value: '', label: 'Choose a class' }, ...(classes.data ?? []).map((c) => ({ value: c.id, label: `Class ${c.name}` }))]} />}
        {holiday && <div className="help" style={{ marginTop: -6 }}>Holidays close the school: no roll call, and the app shows them. Exam weeks are added in Exams and show here.</div>}
        <div className="two">
          <DateField label={holiday ? 'From' : 'Day'} value={f.date} onChange={(v) => setF((x) => ({ ...x, date: v, endDate: x.endDate < v ? v : x.endDate }))} error={err.date} />
          {holiday ? <DateField label="To" value={f.endDate} min={f.date} onChange={set('endDate')} error={err.endDate} /> : <TimeField label="Starts at" value={f.time} onChange={set('time')} />}
        </div>
        {!holiday && <div className="two"><DateField label="Ends on" value={f.endDate} min={f.date} onChange={set('endDate')} error={err.endDate} /><TimeField label="Ends at" value={f.endTime} onChange={set('endTime')} /></div>}
        {!holiday && cats.length > 0 && <SelectField label="Category" value={f.category} onChange={set('category')} options={cats.map((c) => ({ value: c.key, label: c.name }))} />}
        <Field label="Where (optional)" value={f.venue} onChange={set('venue')} maxLength={80} />
        {!holiday && <div className="two"><NumberField label="Latitude (optional)" decimals value={f.lat} onChange={set('lat')} min={-90} max={90} step={0.0001} /><NumberField label="Longitude (optional)" decimals value={f.lng} onChange={set('lng')} min={-180} max={180} step={0.0001} /></div>}
        {!holiday && <div className="help" style={{ marginTop: -6 }}>With the place on the map, families get directions in the app.</div>}
        {!holiday && <Checkbox checked={needsRsvp} onChange={setNeedsRsvp} label="Ask families whether they are coming" />}
        <AreaField label="Note (optional)" value={f.note} onChange={set('note')} rows={2} maxLength={300} />
        {err._ && <div className="emsg" role="alert">{err._}</div>}
      </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        {event && canWrite ? (confirm
          ? <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="help">Remove this event?</span><button className="btn dngf sm" onClick={() => del.mutate()}>Yes, remove</button><button className="btn sm" onClick={() => setConfirm(false)}>Keep</button></span>
          : <button className="btn dng" onClick={() => setConfirm(true)}>Remove</button>) : <span />}
        <span style={{ display: 'flex', gap: 10 }}>
          <button className="btn" onClick={onClose}>{canWrite ? 'Cancel' : 'Close'}</button>
          {canWrite && <button className="btn pri" disabled={save.isPending} onClick={go}>{save.isPending ? 'Saving…' : event ? 'Save' : 'Add event'}</button>}
        </span>
      </div>
    </Dialog>
  );
}
