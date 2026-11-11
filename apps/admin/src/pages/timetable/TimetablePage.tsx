import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HttpError } from '@gradeon/api-client';
import { addDays, dayLabel, dayMonth, dayName, istMinutes, istToday, weekday, type SlotRow, type TimetableView as TT } from '@gradeon/contracts';
import { Dialog, EmptyCard, PageScope, tintFor, useToast } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { useShellChrome } from '../../app/Layout';
import { useSetting } from '../../app/kit';
import { TimetableView } from './timetable.view';

const VIEWS = ['Week', 'Day', 'List'];
const WEEK = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 } as const;
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

const SUBJECT_COLOURS = ['maths', 'science', 'english', 'hindi', 'social', 'computer', 'art', 'pe', 'music'];

export function TimetablePage() {
  const app = useApp();
  const chrome = useShellChrome();
  const qc = useQueryClient();
  const [classId, setClassId] = useState('');
  const [clsOpen, setClsOpen] = useState(false);
  const [mode, setMode] = useState(() => (window.innerWidth < 640 ? 1 : 0)); // the week grid needs more width than a phone has
  // Opens on today and the period running now (or the first one), like a teacher looking up what is on.
  const [sel, setSel] = useState<{ day: number; period: number }>({ day: ((weekday(istToday()) + 6) % 7) + 1, period: 0 });
  // The school's working days: every day except the weekly off days the console set.
  const off = useSetting<string[]>('calendar.weeklyOff', ['sun']);
  const DAYS = (Object.entries(WEEK) as [string, number][]).filter(([k]) => !off.includes(k)).map(([, n]) => n);
  const { toast, say } = useToast();
  const [chooser, setChooser] = useState(false);
  useEffect(() => { const off = () => setClsOpen(false); document.addEventListener('click', off); return () => document.removeEventListener('click', off); }, []);

  const classes = useQuery({ queryKey: ['classes'], queryFn: app.api.classes, staleTime: 5 * 60_000 });
  // A class teacher opens on their own class.
  useEffect(() => { if (!classId && classes.data?.length) setClassId(classes.data.find((c) => c.classTeacherId === app.user.id)?.id ?? classes.data[0]!.id); }, [classes.data, classId, app.user.id]);
  const tt = useQuery({ queryKey: ['timetable', classId], queryFn: () => app.api.timetable.view(classId), enabled: !!classId, placeholderData: keepPreviousData });
  const loads = useQuery({ queryKey: ['loads', classId, tt.data?.version, tt.data?.draftChanges], queryFn: () => app.api.timetable.loads(classId), enabled: !!classId });

  const refresh = () => void qc.invalidateQueries({ predicate: (q) => ['timetable', 'loads', 'shell'].includes(String(q.queryKey[0])) });
  const cover = useMutation({
    mutationFn: (b: { slotId: string; teacherId: string }) => app.api.timetable.cover(b),
    onSuccess: refresh, onError: (e) => say((e as Error).message, 'bad'),
  });
  const publish = useMutation({
    mutationFn: () => app.api.timetable.publish(),
    onSuccess: (r) => { say(`Published · ${r.families.toLocaleString('en-IN')} families and ${r.teachers} teachers notified`); refresh(); },
    onError: (e) => say(e instanceof HttpError ? e.message : 'Could not publish. Try again.', 'bad'),
  });

  const data: TT | undefined = tt.data;
  const classList = classes.data ?? [];

  if (tt.isError && !data) {
    return (
      <PageScope page="timetable">
        <main className="mn"><header className="hd"><div><h1>Timetable</h1></div></header>
          <div><EmptyCard error title="Timetable" chip={{ text: 'Couldn’t load', tone: 'c' }} scene="plug" heading="That didn’t load" body={(tt.error as Error).message} actions={<button className="btn pri" onClick={() => void tt.refetch()}>Try again</button>} /></div>
        </main>
      </PageScope>
    );
  }
  if (classes.isSuccess && classList.length === 0) {
    return (
      <PageScope page="timetable">
        <main className="mn"><header className="hd"><div><h1>Timetable</h1><p>No classes yet</p></div></header>
          <div><EmptyCard title="Timetable" chip={{ text: '0 classes', tone: 'v' }} scene="calendar" heading="Nothing to schedule yet" body="Once your classes and teachers are added, build each week here and publish it to families." actions={<button className="btn pri" onClick={() => app.go('/students')}>Add students first</button>} /></div>
        </main>
      </PageScope>
    );
  }
  if (!data) {
    return (
      <PageScope page="timetable">
        <main className="mn" aria-busy="true"><header className="hd"><div><h1>Timetable</h1><p>&nbsp;</p></div></header>
          <div className="skc" style={{ height: 620, borderRadius: 28 }} />
        </main>
      </PageScope>
    );
  }

  const today = istToday();
  const monday = addDays(today, -((weekday(today) + 6) % 7));
  const dateOf = (day: number) => addDays(monday, day - 1);
  const shownDays = mode === 1 ? [DAYS.includes(sel.day) ? sel.day : DAYS[0] ?? 1] : DAYS;
  const slotAt = (d: number, p: number) => data.slots.find((s) => s.day === d && s.period === p);
  const badIds = new Set(data.clashes.flatMap((c) => c.slotIds));
  const periodDef = (idx: number) => data.periods.find((p) => p.idx === idx);
  const now = istMinutes();
  // The app's subject colours (lib/core/theme/app_colors.dart), so a subject looks the same in the admin and the app; others keep their stored tone.
  const subjectKey = (s: Pick<SlotRow, 'subjectName' | 'subjectColor'>) => {
    const k = (s.subjectName.trim().toLowerCase().split(/\s+/)[0] ?? '').replace(/^mathematics$/, 'maths').replace(/^physical$/, 'pe');
    return SUBJECT_COLOURS.includes(k) ? `sub s-${k}` : s.subjectColor;
  };
  const running = data.periods.find((p) => p.kind === 'period' && now >= toMin(p.starts) && now < toMin(p.ends)) ?? data.periods.find((p) => p.kind === 'period');
  const at = { day: DAYS.includes(sel.day) ? sel.day : DAYS[0] ?? 1, period: sel.period || running?.idx || 0 };
  const cellOf = (day: number, p: { idx: number; starts: string; ends: string }, ri: number) => {
    const s = slotAt(day, p.idx);
    const live = dateOf(day) === today && now >= toMin(p.starts) && now < toMin(p.ends);
    const on = at.day === day && at.period === p.idx;
    const base = { sel: on ? 'sel' : '', pressed: on ? 'true' : 'false', d: (ri * 0.04 + day * 0.03).toFixed(2), pg: live ? Math.round(((now - toMin(p.starts)) / (toMin(p.ends) - toMin(p.starts))) * 100) : 0, now: live ? 'now' : '', pick: () => setSel({ day, period: p.idx }) };
    if (!s) return { ...base, k: 'n', n: 'Free', t: 'Not placed', r: '', bad: '', isBad: false, isFixed: false };
    const bad = badIds.has(s.id) && !s.substituteId;
    return { ...base, k: bad ? '' : subjectKey(s), n: s.subjectName, t: s.substituteName ?? s.teacherName, r: s.room ?? '', bad: bad ? 'bad' : '', isBad: bad, isFixed: !!s.substituteId };
  };
  const rows = data.periods.map((p, ri) => (p.kind === 'period'
    ? { brk: false, per: true, l: p.label, t: p.starts, cells: shownDays.map((d) => cellOf(d, p, ri)) }
    : { brk: true, per: false, l: '', t: '', name: `${p.label} · ${p.starts} to ${p.ends}` }));

  const cur = slotAt(at.day, at.period);
  const curDef = periodDef(at.period);
  const clash = cur ? data.clashes.find((c) => c.slotIds.includes(cur.id)) : undefined;
  const selBad = !!cur && !!clash && !cur.substituteId;
  const teacherId = cur?.substituteId ?? cur?.teacherId;
  const myLoad = (loads.data ?? []).find((l) => l.teacherId === teacherId);
  const loadMax = myLoad?.max ?? 30;
  const loadNow = myLoad?.periodsPerWeek ?? 0;
  const top = [...(loads.data ?? [])].sort((a, b) => b.periodsPerWeek - a.periodsPerWeek).slice(0, 4);
  const subjects = [...new Map(data.slots.map((s) => [s.subjectId, s])).values()];
  const canEdit = app.user.permissions.includes('timetable.edit');
  const fixedNow = !!cur?.substituteId;

  const v = {
    ...chrome,
    className: data.className, term: chrome.shell?.term.name || 'This year', version: data.version, isDraft: data.draftChanges > 0, draftChanges: data.draftChanges,
    clsOpen: clsOpen ? 'open' : '', clsExp: clsOpen ? 'true' : 'false', clsLabel: `Class ${data.className}`,
    toggleCls: (e: React.MouseEvent) => { e.stopPropagation(); setClsOpen((o) => !o); },
    classes: classList.map((c, i) => ({ n: `Class ${c.name}`, on: c.id === classId, sel: c.id === classId ? 'true' : 'false', d: 40 + Math.min(i, 8) * 30, pick: () => { setClassId(c.id); setClsOpen(false); } })),
    views: VIEWS.map((x, i) => ({ n: x, on: i === mode ? 'on' : '', sel: i === mode ? 'true' : 'false', pick: () => setMode(i) })),
    mode: ['week', 'day', 'list'][mode],
    tgStyle: mode === 1 ? { gridTemplateColumns: '78px minmax(0,1fr)' } : undefined,
    publish: () => publish.mutate(),
    weekLabel: `Every week · shown for ${dayMonth(dateOf(DAYS[0] ?? 1))} – ${dayMonth(dateOf(DAYS.at(-1) ?? 5))}`,
    clashChip: data.clashes.length ? 'c' : 'g', clashText: data.clashes.length ? `${data.clashes.length} ${data.clashes.length === 1 ? 'clash' : 'clashes'} to fix` : 'No clashes',
    legend: subjects.map((s) => ({ k: subjectKey(s), n: s.subjectName })),
    days: shownDays.map((d) => ({ n: dayName(dateOf(d), true), d: Number(dateOf(d).slice(8)), today: dateOf(d) === today ? 'today' : '' })),
    rows,
    list: data.slots.filter(() => mode === 2).sort((a, b) => a.day - b.day || a.period - b.period).map((s) => ({
      day: dayName(dateOf(s.day), true), n: s.subjectName, t: s.substituteName ?? s.teacherName, time: `${periodDef(s.period)?.starts} to ${periodDef(s.period)?.ends}`,
      k: badIds.has(s.id) && !s.substituteId ? 'bad' : subjectKey(s), pick: () => { setSel({ day: s.day, period: s.period }); setMode(1); },
    })),
    sel: {
      k: selBad ? 'c' : cur ? subjectKey(cur) : 'n', ab: (cur?.subjectName ?? 'Free').slice(0, 2), n: cur?.subjectName ?? 'Not placed', t: cur?.substituteName ?? cur?.teacherName ?? '–', r: cur?.room ?? '–',
      day: `${dayLabel(dateOf(at.day))}`, time: curDef ? `${curDef.starts} to ${curDef.ends}` : '', len: curDef ? `${toMin(curDef.ends) - toMin(curDef.starts)} min` : '',
      bad: selBad, fixedNow, fine: !!cur && !selBad && !fixedNow, other: clash ? clash.classNames.filter((n) => n !== data.className).join(', ') || 'another class' : '',
      suggest: clash?.suggestion ? clash.suggestion.teacherName.split(' ')[0] : null,
    },
    canEdit,
    fix: () => { if (cur && clash?.suggestion) cover.mutate({ slotId: cur.id, teacherId: clash.suggestion.teacherId }, { onSuccess: () => say(`Clash fixed · ${clash.suggestion!.teacherName} covers ${dayName(dateOf(at.day), true)} ${periodDef(at.period)?.label}`) }); },
    change: () => setChooser(true),
    ringOff: (226 * (1 - Math.min(1, loadNow / loadMax))).toFixed(1), ringC: loadNow > loadMax * 0.9 ? 'var(--c)' : 'var(--v)', kLoad: loadNow, loadMax, loadName: myLoad?.name ?? cur?.teacherName ?? '–',
    loads: top.map((l) => { const c = tintFor(l.name); return { n: l.name, s: l.subjects[0] ?? 'Teacher', ini: l.name.split(' ').map((w) => w[0]).slice(0, 2).join(''), bg: c.bg, fg: c.fg, v: l.periodsPerWeek, p: Math.round((l.periodsPerWeek / l.max) * 100), hot: l.periodsPerWeek > l.max * 0.9 ? 'hot' : '' }; }),
    unplaced: data.unplaced,
    toast,
    dialog: chooser && cur ? <TeacherChooser slot={cur} onClose={() => setChooser(false)} onPick={(id) => { setChooser(false); app.api.timetable.patch(cur.id, { teacherId: id }).then(() => { say('Teacher changed. Publish to tell families.'); refresh(); }).catch((e) => say((e as Error).message)); }} /> : null,
  };
  return <TimetableView v={v} />;
}

function TeacherChooser({ slot, onClose, onPick }: { slot: SlotRow; onClose: () => void; onPick: (id: string) => void }) {
  const { api } = useApp();
  const q = useQuery({ queryKey: ['teachers', slot.id], queryFn: () => api.timetable.teachers(slot.id) });
  return (
    <Dialog title={`Who teaches ${slot.subjectName}?`} onClose={onClose} width={480}>
      <p>People who are free in this period come first.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflow: 'auto', marginBottom: 12 }}>
        {q.isLoading && <div className="skc" style={{ height: 160 }} />}
        {(q.data ?? []).map((t) => (
          <button key={t.id} className="btn" disabled={!t.free && t.id !== slot.teacherId} onClick={() => onPick(t.id)} style={{ justifyContent: 'space-between', height: 48, borderRadius: 14, opacity: t.free ? 1 : 0.55 }}>
            <span>{t.name}<small style={{ marginLeft: 8, color: 'var(--ink3)', fontWeight: 600 }}>{t.subjects.join(', ')}</small></span>
            <span className="chip" style={{ height: 24 }}>{t.free ? `${t.load} / ${t.max}` : 'Busy then'}</span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn" onClick={onClose}>Cancel</button></div>
    </Dialog>
  );
}
