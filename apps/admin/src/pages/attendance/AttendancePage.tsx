import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HttpError } from '@gradeon/api-client';
import { addDays, dayLabel, type AttendanceStatus } from '@gradeon/contracts';
import { DateField, EmptyCard, Segmented, Select, tintFor } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { useSetting } from '../../app/kit';
import { Page, useToast } from '../../app/Page';
import { usePageTabs } from '../../app/tabs';
import { useApprovalList } from '../approvals/ApprovalList';
import { PeriodGrid } from './PeriodGrid';

/** Every mark there is; the school uses the ones Gradeon chose for it (console: Attendance → marks). */
const MARKS: Record<AttendanceStatus, { label: string; cls: string }> = {
  present: { label: 'Present', cls: 'p' }, late: { label: 'Late', cls: 'l' }, half_day: { label: 'Half day', cls: 'h' }, leave: { label: 'On leave', cls: 'v' }, absent: { label: 'Absent', cls: 'a' },
};
const ORDER: AttendanceStatus[] = ['present', 'late', 'half_day', 'leave', 'absent'];

export function AttendancePage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const { tab, tabs } = usePageTabs('/attendance');
  const [leaveView, setLeaveView] = useState<'waiting' | 'decided'>('waiting');
  const leave = useApprovalList(leaveView, 'leave', say, tab === 'leave');
  const [classId, setClassId] = useState('');
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({});
  const [picked, setPicked] = useState<string | null>(null);
  const used = useSetting<AttendanceStatus[]>('attendance.statuses', ['present', 'absent', 'late', 'leave']);
  const lockDays = useSetting<number>('attendance.lockAfterDays', 2);
  const options = ORDER.filter((s) => used.includes(s) || s === 'present' || s === 'absent').map((value) => ({ value, ...MARKS[value] }));
  const classes = useQuery({ queryKey: ['classes'], queryFn: app.api.classes, staleTime: 5 * 60_000 });
  // The roll call opens on the latest school day, which the dashboard already works out; an earlier day can be picked to correct it.
  const today = useQuery({ queryKey: ['dashboard', 1], queryFn: () => app.api.dashboard(1), staleTime: 60_000 });
  const latest = today.data?.day.date ?? '';
  const date = picked ?? latest;
  // Past the correction window only someone who approves requests may change a day; the server says so if needed.
  const mayOld = app.user.permissions.includes('approvals.decide');
  useEffect(() => { if (!classId && classes.data?.length) setClassId(classes.data[0]!.id); }, [classes.data, classId]);
  const day = useQuery({ queryKey: ['attendance-day', classId, date], queryFn: () => app.api.attendance.day(classId, date), enabled: !!classId && !!date && tab === 'roll' });
  useEffect(() => { setDraft({}); }, [classId, date]);

  const save = useMutation({
    // The whole day is saved at once, so marks already saved go back with the changes.
    mutationFn: () => app.api.attendance.save({ classId, date, marks: marks.flatMap((m) => { const status = statusOf(m.studentId, m.status); return status ? [{ studentId: m.studentId, status }] : []; }) }),
    onSuccess: () => {
      setDraft({});
      void qc.invalidateQueries({ predicate: (q) => ['attendance-day', 'dashboard', 'shell', 'students'].includes(String(q.queryKey[0])) });
      say('Roll call saved. Parents of absent children are told.');
    },
    onError: (e) => say(e instanceof HttpError ? e.message : 'Could not save. Try again.', 'bad'),
  });

  const canMark = app.user.permissions.includes('attendance.mark');
  const marks = day.data?.marks ?? [];
  const statusOf = (id: string, saved: AttendanceStatus | null) => draft[id] ?? saved;
  const counts = { present: 0, late: 0, absent: 0, none: 0 };
  for (const m of marks) { const s = statusOf(m.studentId, m.status); if (s === 'present' || s === 'half_day') counts.present++; else if (s === 'late') counts.late++; else if (s === 'absent' || s === 'leave') counts.absent++; else counts.none++; }
  // Marks filled in from approved leave are not saved yet, so they count as changes to save.
  const changed = Object.keys(draft).length + (day.data?.submitted ? 0 : marks.filter((m) => m.status && !(m.studentId in draft)).length);
  const cls = classes.data?.find((c) => c.id === classId);
  const loading = classes.isLoading || today.isLoading;
  const err = [classes, today, day].find((q) => q.isError && !q.data);

  return (
    <Page title="Attendance" sub={date ? `${dayLabel(date)} · ${cls ? `Class ${cls.name}` : ''}` : 'Roll call'} toast={toast} loading={loading} overlays={leave.overlay}
      error={err ? { message: (err.error as Error).message, retry: () => void err.refetch() } : null}
      actions={<>
        {tabs}
        {tab !== 'leave' && !!classes.data?.length && (
          <>
            {latest && <DateField compact label="Day" value={date} onChange={(d) => setPicked(d && d !== latest ? d : null)} max={latest} min={mayOld ? undefined : addDays(latest, -lockDays)} />}
            <Select compact aria-label="Class" value={classId} onChange={setClassId} options={classes.data.map((c) => ({ value: c.id, label: `Class ${c.name}` }))} />
          </>
        )}
      </>}>
      {tab === 'leave' ? (
        <div className="stack" style={{ gap: 16 }}>
          <Segmented label="Leave requests" value={leaveView} onChange={setLeaveView} options={[{ value: 'waiting', label: 'Waiting' }, { value: 'decided', label: 'Decided' }]} style={{ alignSelf: 'flex-start' }} />
          {leave.list}
        </div>
      ) : classes.data?.length === 0 ? (
        <div><EmptyCard title="Attendance" chip={{ text: '0 classes', tone: 'v' }} scene="calendar" heading="No classes to mark yet" body="Add students to a class first. The roll call for each class appears here every school day." actions={<button className="btn pri" onClick={() => app.go('/students')}>Add students</button>} /></div>
      ) : tab === 'periods' ? (
        classId && date ? <PeriodGrid classId={classId} date={date} say={say} /> : null
      ) : (
        <section className="grid">
          <div className="card tbl rcall s12 rise" style={{ padding: 0 }}>
            <div className="ch" style={{ padding: '24px 24px 16px' }}>
              <h2>Roll call</h2>
              <span className={`chip ${day.data?.submitted ? 'g' : 'a'}`}>{day.data?.submitted ? 'Submitted' : 'Not submitted yet'}</span>
              {canMark && marks.length > 0 && <button className="btn sm" onClick={() => setDraft(Object.fromEntries(marks.filter((m) => !m.onLeave && statusOf(m.studentId, m.status) !== 'present').map((m) => [m.studentId, 'present' as const])))}>Mark everyone present</button>}
            </div>
            {day.isLoading && <div className="skc" style={{ height: 320, margin: '0 20px 20px', borderRadius: 16 }} />}
            {!day.isLoading && marks.length === 0 && <div style={{ padding: '0 24px 24px' }}><EmptyCard title={`Class ${cls?.name ?? ''}`} chip={{ text: '0 students', tone: 'v' }} scene="register" heading="No students in this class" body="Students appear here once they are added to the class." /></div>}
            {marks.length > 0 && (
              <div className="scroll-x" data-fill="">
                {marks.map((m) => {
                  const t = tintFor(m.name);
                  const s = statusOf(m.studentId, m.status);
                  return (
                    <div className="grd rw" key={m.studentId} style={{ '--cols': '36px minmax(0,1fr) auto' } as React.CSSProperties}>
                      <span className="rn num">{m.rollNo || '–'}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <span className="av" style={{ width: 34, height: 34, fontSize: 11, background: t.bg, color: t.fg, boxShadow: 'none', flex: 'none' }}>{m.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
                        <b style={{ font: '700 14px var(--fb)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</b>
                        {m.onLeave && <span className="chip v" data-tip="The office approved leave for this day">On leave</span>}
                      </span>
                      <span className="mk" role="group" aria-label={`Attendance for ${m.name}`}>
                        {options.map((o) => (
                          <button key={o.value} className={o.cls} aria-pressed={s === o.value} disabled={!canMark} onClick={() => setDraft({ ...draft, [m.studentId]: o.value })}>{o.label}</button>
                        ))}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {/* The count and the save button share one tile, so the row above the roll call is one even block. */}
          <div className="tile t-v s12 rise" style={{ '--d': '.08s', order: -1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(280px,100%),1fr))', gap: '16px 32px', alignItems: 'center' } as React.CSSProperties}>
            <div style={{ minWidth: 0 }}>
              <span className="lbl">Present or late</span>
              <div className="big" style={{ marginTop: 8 }}>{counts.present + counts.late}<small style={{ fontSize: 17, opacity: .6 }}> / {marks.length}</small></div>
              <div className="meter" aria-hidden="true">
                <i style={{ flex: counts.present || 0.001, background: 'var(--line2)' }}></i>
                <i style={{ flex: counts.late || 0.001, background: 'var(--warn)' }}></i>
                <i style={{ flex: counts.absent || 0.001, background: 'var(--bad)' }}></i>
                <i style={{ flex: counts.none || 0.001, background: 'var(--s2)' }}></i>
              </div>
              <div className="tgrow" style={{ marginTop: 12, font: '700 13px var(--fb)' }}>
                <span>{counts.present} present</span><span>{counts.late} late</span><span>{counts.absent} away</span>{counts.none > 0 && <span>{counts.none} not marked</span>}
              </div>
            </div>
            {canMark ? (
              <div style={{ minWidth: 0 }}>
                <div style={{ font: '600 14px var(--fb)', opacity: .85, marginBottom: 12 }}>{changed ? `${changed} ${changed === 1 ? 'change' : 'changes'} not saved yet.` : 'Tap a name’s status to change it, then save.'}</div>
                <div className="tgrow">
                  <button className="btn pri" disabled={!changed || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save roll call'}</button>
                  {changed > 0 && <button className="btn" onClick={() => setDraft({})}>Discard changes</button>}
                </div>
              </div>
            ) : (
              <div style={{ font: '600 14px/1.5 var(--fb)', opacity: .85 }}>You can look at attendance but not change it. Ask the school office for the roll-call permission.</div>
            )}
          </div>
        </section>
      )}
    </Page>
  );
}
