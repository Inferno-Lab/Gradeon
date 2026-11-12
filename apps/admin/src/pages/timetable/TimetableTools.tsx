import { Fragment, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { SlotRow, WeekOf } from '@gradeon/contracts';
import { Dialog, ErrorLine, Field, Segmented, SelectField, useShake } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { problem } from '../../app/kit';

const DAY = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Puts a lesson in a free period: subject, teacher (only those free then are accepted), room. */
export function PlaceDialog({ classId, day, period, label, onClose, onDone }: { classId: string; day: number; period: number; label: string; onClose: () => void; onDone: (m: string) => void }) {
  const { api } = useApp();
  const shake = useShake();
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: api.subjects, staleTime: 5 * 60_000 });
  const staff = useQuery({ queryKey: ['staff', ''], queryFn: () => api.staff.list() });
  const [f, setF] = useState({ subjectId: '', teacherId: '', room: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const place = useMutation({
    mutationFn: () => api.timetable.place({ classId, day, period, subjectId: f.subjectId, teacherId: f.teacherId, room: f.room.trim() || null }),
    onSuccess: () => onDone('Lesson placed. Publish to tell families and teachers.'),
    onError: (e) => { setErr(problem(e)); shake.hit(); },
  });
  const teachers = (staff.data ?? []).filter((s) => !f.subjectId || !s.subjects.length || s.subjects.some((x) => x.id === f.subjectId));
  return (
    <Dialog title={`Place a lesson · ${DAY[day]} ${label}`} onClose={onClose} width={480} shake={shake.cls}>
      <div className="stack">
        <SelectField label="Subject" value={f.subjectId} onChange={(subjectId) => { setF({ ...f, subjectId }); setErr({}); }} error={err.subjectId} options={[{ value: '', label: 'Choose a subject' }, ...(subjects.data ?? []).map((s) => ({ value: s.id, label: s.name }))]} />
        <SelectField label="Teacher" value={f.teacherId} onChange={(teacherId) => { setF({ ...f, teacherId }); setErr({}); }} error={err.teacherId} options={[{ value: '', label: 'Choose a teacher' }, ...teachers.map((s) => ({ value: s.id, label: s.name }))]} />
        <Field label="Room (optional)" value={f.room} onChange={(room) => setF({ ...f, room })} maxLength={20} placeholder="B-204" />
        {err._ && <ErrorLine>{err._}</ErrorLine>}
        <div className="tgrow" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn pri" disabled={place.isPending || !f.subjectId || !f.teacherId} onClick={() => place.mutate()}>{place.isPending ? 'Placing…' : 'Place'}</button>
        </div>
      </div>
    </Dialog>
  );
}

/** Changes a lesson's subject or room (the teacher has its own chooser), or frees the period. */
export function ChangeDialog({ slot, onClose, onDone }: { slot: SlotRow; onClose: () => void; onDone: (m: string) => void }) {
  const { api } = useApp();
  const shake = useShake();
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: api.subjects, staleTime: 5 * 60_000 });
  const [f, setF] = useState({ subjectId: slot.subjectId, room: slot.room ?? '' });
  const [freeing, setFreeing] = useState(false);
  const [err, setErr] = useState('');
  const save = useMutation({
    mutationFn: () => api.timetable.patch(slot.id, { subjectId: f.subjectId !== slot.subjectId ? f.subjectId : undefined, room: f.room.trim() || null }),
    onSuccess: () => onDone('Lesson changed. Publish to tell families and teachers.'), onError: (e) => { setErr((e as Error).message); shake.hit(); },
  });
  const free = useMutation({ mutationFn: () => api.timetable.free(slot.id), onSuccess: () => onDone('The period is free now.'), onError: (e) => { setErr((e as Error).message); shake.hit(); } });
  return (
    <Dialog title={`${slot.subjectName} · ${DAY[slot.day]}`} onClose={onClose} width={480} shake={shake.cls}>
      <div className="stack">
        <SelectField label="Subject" value={f.subjectId} onChange={(subjectId) => setF({ ...f, subjectId })} options={(subjects.data ?? []).map((s) => ({ value: s.id, label: s.name }))} />
        <Field label="Room" value={f.room} onChange={(room) => setF({ ...f, room })} maxLength={20} placeholder="B-204" />
        {err && <ErrorLine>{err}</ErrorLine>}
        {freeing ? (
          <div className="tgrow" style={{ justifyContent: 'flex-end' }}>
            <span className="help">The class will have no lesson in this period.</span>
            <button className="btn" onClick={() => setFreeing(false)}>Keep it</button>
            <button className="btn dng" disabled={free.isPending} onClick={() => free.mutate()}>Yes, free it</button>
          </div>
        ) : (
          <div className="tgrow">
            <button className="btn dng" onClick={() => setFreeing(true)}>Free this period</button>
            <span className="grow"></span>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn pri" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** One teacher's or one room's week across every class, to read or print. */
export function WeekDialog({ days, onClose }: { days: number[]; onClose: () => void }) {
  const { api } = useApp();
  const [by, setBy] = useState<'teacher' | 'room'>('teacher');
  const [pick, setPick] = useState('');
  const staff = useQuery({ queryKey: ['staff', ''], queryFn: () => api.staff.list(), enabled: by === 'teacher' });
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: api.timetable.rooms, enabled: by === 'room' });
  const week = useQuery<WeekOf>({ queryKey: ['week-of', by, pick], queryFn: () => api.timetable.week(by === 'teacher' ? { teacherId: pick } : { room: pick }), enabled: !!pick });
  const w = week.data;
  return (
    <Dialog title="A teacher’s or a room’s week" onClose={onClose} width={860}>
      <div className="stack">
        <div className="tgrow">
          <Segmented label="Whose week" value={by} onChange={(v) => { setBy(v); setPick(''); }} options={[{ value: 'teacher', label: 'Teacher' }, { value: 'room', label: 'Room' }]} />
          <div style={{ minWidth: 240 }}>
            <SelectField label={by === 'teacher' ? 'Teacher' : 'Room'} value={pick} onChange={setPick}
              options={[{ value: '', label: by === 'teacher' ? 'Choose a teacher' : 'Choose a room' }, ...(by === 'teacher' ? (staff.data ?? []).map((s) => ({ value: s.id, label: s.name })) : (rooms.data ?? []).map((r) => ({ value: r, label: r })))]} />
          </div>
          {w && <button className="btn sm" onClick={() => window.print()}>Print</button>}
        </div>
        {week.isLoading && pick && <div className="skc" style={{ height: 240, borderRadius: 16 }} />}
        {w && (
          <div className="scroll-x">
            <div style={{ display: 'grid', gridTemplateColumns: `90px repeat(${days.length}, minmax(110px,1fr))`, gap: 4, minWidth: 90 + days.length * 114 }}>
              <span></span>
              {days.map((d) => <b key={d} style={{ font: '700 12px var(--fb)', color: 'var(--ink3)' }}>{DAY[d]}</b>)}
              {w.periods.filter((p) => p.kind === 'period').map((p) => (
                <Fragment key={p.idx}>
                  <span style={{ font: '700 12px var(--fb)', color: 'var(--ink3)' }}>{p.label}<small style={{ display: 'block' }}>{p.starts}</small></span>
                  {days.map((d) => {
                    const s = w.slots.find((x) => x.day === d && x.period === p.idx);
                    return (
                      <span key={`${p.idx}-${d}`} style={{ padding: 8, borderRadius: 12, background: s ? 'var(--brand-soft)' : 'var(--s2)', minHeight: 44, font: '600 12px/1.3 var(--fb)' }}>
                        {s ? <><b style={{ display: 'block' }}>{s.subjectName}</b>{s.className}{by === 'room' ? ` · ${s.substituteName ?? s.teacherName}` : s.room ? ` · ${s.room}` : ''}</> : ''}
                      </span>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
