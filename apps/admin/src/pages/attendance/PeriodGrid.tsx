import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PeriodRoll } from '@gradeon/contracts';
import { EmptyCard, Select } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { problem } from '../../app/kit';

type Mark = PeriodRoll['periods'][number]['marks'][string];
const MARK: Record<Mark, { label: string; cls: string }> = { present: { label: 'Present', cls: 'p' }, late: { label: 'Late', cls: 'l' }, absent: { label: 'Absent', cls: 'a' } };
const DAY: Record<string, string> = { present: 'Present', late: 'Late', half_day: 'Half day', leave: 'On leave', absent: 'Absent' };

/**
 * Attendance every period: one period at a time, marked by its teacher (or someone who approves requests). The day's roll call is
 * shown beside each name, so a child who came in and then went missing stands out.
 */
export function PeriodGrid({ classId, date, say }: { classId: string; date: string; say: (text: string, tone?: 'bad') => void }) {
  const app = useApp();
  const qc = useQueryClient();
  const roll = useQuery({ queryKey: ['attendance-periods', classId, date], queryFn: () => app.api.attendance.periods(classId, date) });
  const [period, setPeriod] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<string, Mark>>({});
  const periods = roll.data?.periods ?? [];
  const p = periods.find((x) => x.period === period) ?? periods.find((x) => x.mine) ?? periods[0];
  useEffect(() => { setDraft({}); }, [classId, date, p?.period]);
  // An unmarked period starts with everyone present who is in school that day; the teacher taps the ones who are not.
  const markOf = (s: PeriodRoll['students'][number]): Mark | undefined =>
    draft[s.studentId] ?? p?.marks[s.studentId] ?? (p?.mine && !p.markedBy && s.day !== 'absent' && s.day !== 'leave' ? 'present' : undefined);
  const save = useMutation({
    mutationFn: () => app.api.attendance.savePeriod({ classId, date, period: p!.period, marks: roll.data!.students.flatMap((s) => { const m = markOf(s); return m ? [{ studentId: s.studentId, status: m }] : []; }) }),
    onSuccess: (next) => { qc.setQueryData(['attendance-periods', classId, date], next); setDraft({}); say(`${p!.label} saved.`); },
    onError: (e) => say(Object.values(problem(e))[0] ?? 'Could not save. Try again.', 'bad'),
  });

  if (roll.isLoading) return <div className="skc" style={{ height: 320, borderRadius: 16 }} />;
  if (roll.isError) return <EmptyCard error title="Every period" chip={{ text: 'Couldn’t load', tone: 'c' }} scene="plug" heading="That didn’t load" body={(roll.error as Error).message} actions={<button className="btn pri" onClick={() => void roll.refetch()}>Try again</button>} />;
  if (!p) return <EmptyCard title="Every period" chip={{ text: '0 periods', tone: 'v' }} scene="calendar" heading="No lessons that day" body="The class has no periods on the timetable for this day. Periods appear here once the timetable has them." />;
  const students = roll.data!.students;
  const changed = Object.keys(draft).length;
  return (
    <div className="card tbl rcall s12 rise" style={{ padding: 0 }}>
      <div className="ch" style={{ padding: '24px 24px 16px', flexWrap: 'wrap', gap: 12 }}>
        <Select compact aria-label="Period" value={String(p.period)} onChange={(v) => setPeriod(Number(v))} options={periods.map((x) => ({ value: String(x.period), label: `${x.label} · ${x.subject} · ${x.startsAt}` }))} />
        <span className={`chip ${p.markedBy ? 'g' : 'a'}`}>{p.markedBy ? `Marked by ${p.markedBy}` : `Not marked yet · ${p.teacherName}`}</span>
        <span className="grow"></span>
        {p.mine && changed > 0 && <button className="btn" onClick={() => setDraft({})}>Discard changes</button>}
        {p.mine && <button className="btn pri" disabled={save.isPending || (!changed && !!p.markedBy)} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save period'}</button>}
      </div>
      {!p.mine && <p className="help" style={{ margin: '0 24px 12px' }}>{p.teacherName} marks this period.</p>}
      <div className="scroll-x" data-fill="">
        {students.map((s) => {
          const m = markOf(s);
          return (
            <div className="grd rw" key={s.studentId} style={{ '--cols': '36px minmax(0,1fr) auto' } as React.CSSProperties}>
              <span className="rn num">{s.rollNo || '–'}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <b style={{ font: '700 14px var(--fb)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</b>
                {s.day && <span className={`chip ${s.day === 'absent' || s.day === 'leave' ? 'c' : ''}`} data-tip="The day’s roll call">{DAY[s.day]}</span>}
              </span>
              <span className="mk" role="group" aria-label={`${p.label} for ${s.name}`}>
                {(Object.keys(MARK) as Mark[]).map((k) => (
                  <button key={k} className={MARK[k].cls} aria-pressed={m === k} disabled={!p.mine} onClick={() => setDraft({ ...draft, [s.studentId]: k })}>{MARK[k].label}</button>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
