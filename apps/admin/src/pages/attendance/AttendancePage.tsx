import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HttpError } from '@tangent/api-client';
import { addDays, dayLabel, type AttendanceStatus } from '@tangent/contracts';
import { DateField, EmptyCard, EmptyState, Icon, Segmented, Select } from '@tangent/web-ui';
import { useApp } from '../../app/context';
import { useSetting } from '../../app/kit';
import { Page, useToast } from '../../app/Page';
import { usePageTabs } from '../../app/tabs';
import { useApprovalList } from '../approvals/ApprovalList';
import { PeriodGrid } from './PeriodGrid';

/** Every mark there is; the school uses the ones Tangent chose for it (console: Attendance → marks). */
// The roll call's letters and their status colour, as the Attendance board (design/hue/src/Attendance.html).
const MARKS: Record<AttendanceStatus, { label: string; cls: string; key: string }> = {
  present: { label: 'Present', cls: 'ok', key: 'P' }, late: { label: 'Late', cls: 'warn', key: 'L' }, half_day: { label: 'Half day', cls: 'warn', key: 'H' }, leave: { label: 'On leave', cls: 'info', key: 'V' }, absent: { label: 'Absent', cls: 'bad', key: 'A' },
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
      tabs={tabs}
      filters={<>
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
        tab === 'periods' ? <div><EmptyState scene="periods" onAction={() => app.go('/year/classes')} /></div>
        : <div><EmptyState scene="attendance" onAction={() => app.go('/year/classes')} onLink={() => app.go('/students')} /></div>
      ) : tab === 'periods' ? (
        classId && date ? <PeriodGrid classId={classId} date={date} say={say} /> : null
      ) : (
        <div className="hb" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="card deep" style={{ flexDirection: 'row', alignItems: 'center', gap: 40, flexWrap: 'wrap' }}>
            <div className="vc" style={{ gap: 4 }}><span className="lbl">Present</span><span className="fig" style={{ fontSize: 44 }}>{counts.present}<small>of {marks.length}</small></span></div>
            <div className="vc" style={{ gap: 4 }}><span className="lbl">Late</span><span className="fig" style={{ fontSize: 44, color: 'var(--warn-d)' }}>{counts.late}</span></div>
            <div className="vc" style={{ gap: 4 }}><span className="lbl">Away</span><span className="fig" style={{ fontSize: 44, color: 'var(--bad-d)' }}>{counts.absent}</span></div>
            <div className="vc" style={{ gap: 4 }}><span className="lbl">Not marked</span><span className="fig" style={{ fontSize: 44, color: 'var(--on-deep)' }}>{counts.none}</span></div>
            <div className="vc grow" style={{ gap: 10, minWidth: 240 }}>
              <div className="bar" style={{ height: 14, borderRadius: 7 }} aria-hidden="true">
                <i style={{ flex: counts.present, minWidth: 0, background: 'var(--bright)' }} /><i style={{ flex: counts.late, minWidth: 0, background: 'var(--warn-d)' }} />
                <i style={{ flex: counts.absent, minWidth: 0, background: 'var(--bad-d)' }} /><i style={{ flex: counts.none, minWidth: 0, background: 'var(--deep3)' }} />
              </div>
              <span style={{ fontSize: 14, lineHeight: '20px', color: 'var(--on-deep2)' }}>{!canMark ? 'You can look at attendance but not change it. Ask the school office for the roll-call permission.' : changed ? `${changed} ${changed === 1 ? 'change' : 'changes'} not saved yet.` : day.data?.submitted ? 'Submitted. Tap a letter to correct it, then save.' : counts.none ? `${counts.none} still to mark before you save.` : 'Everyone is marked. Save to send it.'}</span>
            </div>
            {canMark && (
              <div className="fx" style={{ gap: 8, flexWrap: 'wrap' }}>
                {marks.length > 0 && <button className="btn ond" onClick={() => setDraft(Object.fromEntries(marks.filter((m) => !m.onLeave && statusOf(m.studentId, m.status) !== 'present').map((m) => [m.studentId, 'present' as const])))}><Icon name="check" className="i" />Mark all present</button>}
                {changed > 0 && <button className="btn ond" onClick={() => setDraft({})}>Discard</button>}
                <button className="btn bri" disabled={!changed || save.isPending} onClick={() => save.mutate()}><Icon name="check" className="i" />{save.isPending ? 'Saving…' : 'Save roll'}</button>
              </div>
            )}
          </section>
          {day.isLoading && <div className="skc" style={{ height: 320, borderRadius: 16 }} />}
          {!day.isLoading && marks.length === 0 && <EmptyCard title={`Class ${cls?.name ?? ''}`} chip={{ text: '0 students', tone: 'v' }} icon="people" heading="No students in this class" body="Students appear here once they are added to the class." />}
          {marks.length > 0 && (
            <div className="g" style={{ gridTemplateColumns: `repeat(auto-fill,minmax(min(${options.length > 3 ? 300 : 260}px,100%),1fr))`, gap: 8 }}>
              {marks.map((m) => {
                const s = statusOf(m.studentId, m.status);
                return (
                  <div className="cell" key={m.studentId}>
                    <b className="grow cut" style={{ fontSize: 14, fontWeight: 600 }} data-tip={m.onLeave ? `${m.name}\nOn leave: the office approved it` : undefined}>{m.name}</b>
                    <span className="fx" role="group" aria-label={`Attendance for ${m.name}`} style={{ gap: 4 }}>
                      {options.map((o) => (
                        <button key={o.value} className={`pk ${s === o.value ? o.cls : ''}`} aria-label={o.label} aria-pressed={s === o.value} data-tip={o.label} disabled={!canMark} onClick={() => setDraft({ ...draft, [m.studentId]: o.value })}>{o.key}</button>
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="fx t2" style={{ gap: 8, fontSize: 14 }}><Icon name="messages" className="i" />Families of absent students are told when you save. A late mark does not send a message.</div>
        </div>
      )}
    </Page>
  );
}
