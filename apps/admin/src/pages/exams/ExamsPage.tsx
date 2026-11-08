import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, istToday, type ExamRow } from '@gradeon/contracts';
import { Checkbox, DateField, Dialog, EmptyCard, Field, Segmented, Select, SelectField, useShake } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { Page, useToast } from '../../app/Page';
import { AddBtn, Avatar, dateLabel, problem } from '../../app/kit';

const TONE = { upcoming: 'n', marking: 'a', published: 'g' } as const;
const LABEL = { upcoming: 'Coming up', marking: 'Marking', published: 'Published' } as const;
const refresh = (qc: ReturnType<typeof useQueryClient>) => void qc.invalidateQueries({ predicate: (q) => ['exams', 'students', 'dashboard'].includes(String(q.queryKey[0])) });

export function ExamsPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [classId, setClassId] = useState('');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const classes = useQuery({ queryKey: ['classes'], queryFn: app.api.classes, staleTime: 5 * 60_000 });
  const list = useQuery({ queryKey: ['exams', classId], queryFn: () => app.api.exams.list(classId || undefined) });
  const rows = list.data ?? [];
  const canWrite = app.user.permissions.includes('exams.write');
  const groups = useMemo(() => (['marking', 'upcoming', 'published'] as const).map((s) => ({ s, items: rows.filter((r) => r.status === s) })).filter((g) => g.items.length), [rows]);
  return (
    <Page title="Exams" sub="Schedules, marks and results" toast={toast} loading={list.isLoading && !list.data}
      error={list.isError && !list.data ? { message: (list.error as Error).message, retry: () => void list.refetch() } : null}
      actions={<>
        <Select compact aria-label="Class" value={classId} onChange={setClassId} options={[{ value: '', label: 'All classes' }, ...(classes.data ?? []).map((c) => ({ value: c.id, label: `Class ${c.name}` }))]} />
        {canWrite && <AddBtn onClick={() => setCreating(true)}>New exam</AddBtn>}
      </>}
      overlays={<>
        {creating && <NewExam defaultClass={classId} onClose={() => setCreating(false)} onDone={(e) => { setCreating(false); refresh(qc); say('Exam added to the schedule.'); setOpen(e.id); }} />}
        {open && <ExamSheet id={open} onClose={() => setOpen(null)} onChanged={(m) => { refresh(qc); if (m) say(m); }} onRemoved={() => { setOpen(null); refresh(qc); say('Exam removed.'); }} />}
      </>}>
      {rows.length === 0 ? (
        <div><EmptyCard title="Exams" chip={{ text: '0 exams', tone: 'v' }} scene="checklist" heading="No exams yet" body="Add an exam for a class with its subjects and dates. Teachers enter marks here, and you publish the results to families." actions={canWrite ? <AddBtn onClick={() => setCreating(true)}>New exam</AddBtn> : undefined} /></div>
      ) : (
        <div className="exb">
          {groups.map((g) => (
            <section className="exbs rise" key={g.s}>
              <div className="ch"><h2>{LABEL[g.s]}</h2><span className={`chip ${g.s === 'published' ? 'g' : g.s === 'marking' ? 'a' : ''}`}>{g.items.length}</span></div>
              <div className="exg">
                {g.items.map((e) => <ExamCard key={e.id} e={e} onOpen={() => setOpen(e.id)} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}

function ExamCard({ e, onOpen }: { e: ExamRow; onOpen: () => void }) {
  const p = e.expected ? Math.round((e.entered / e.expected) * 100) : 0;
  return (
    <button className="exc" onClick={onOpen} aria-label={`Open ${e.name}, Class ${e.className}`}>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><span className="chip v">Class {e.className}</span><span className={`st ${TONE[e.status]}`}><i></i>{LABEL[e.status]}</span></span>
      <b className="fd" style={{ fontSize: 17, letterSpacing: '-.02em', lineHeight: 1.2 }}>{e.name}</b>
      <small style={{ color: 'var(--ink3)', font: '600 12px var(--fb)' }}>{dateLabel(e.startsOn)}{e.endsOn !== e.startsOn ? ` to ${dateLabel(e.endsOn)}` : ''} · {e.subjects.length} subjects</small>
      <span className="us" style={{ gap: 6, marginTop: 4 }}>
        <span className="r"><span>Marks entered</span><b>{e.entered} of {e.expected}</b></span>
        <span className="bar" style={{ height: 14 }}><i style={{ width: `${p}%` }}></i></span>
      </span>
    </button>
  );
}

function NewExam({ defaultClass, onClose, onDone }: { defaultClass: string; onClose: () => void; onDone: (e: ExamRow) => void }) {
  const app = useApp();
  const classes = useQuery({ queryKey: ['classes'], queryFn: app.api.classes, staleTime: 5 * 60_000 });
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: app.api.subjects, staleTime: 10 * 60_000 });
  const [f, setF] = useState({ name: '', classId: defaultClass, startsOn: addDays(istToday(), 7), endsOn: addDays(istToday(), 11) });
  const [picked, setPicked] = useState<Record<string, { on: string; max: string }>>({});
  const [err, setErr] = useState<Record<string, string>>({});
  const shake = useShake();
  const create = useMutation({
    mutationFn: () => app.api.exams.create({ name: f.name.trim(), classId: f.classId, startsOn: f.startsOn, endsOn: f.endsOn, subjects: Object.entries(picked).map(([subjectId, v]) => ({ subjectId, onDate: v.on || null, maxMarks: Number(v.max) || 100 })) }),
    onSuccess: onDone, onError: (e) => { setErr(problem(e)); shake.hit(); },
  });
  const go = () => {
    const p: Record<string, string> = {};
    if (f.name.trim().length < 3) p.name = 'Name the exam.';
    if (!f.classId) p.classId = 'Choose a class.';
    if (f.endsOn < f.startsOn) p.endsOn = 'Pick a day on or after the first day.';
    if (!Object.keys(picked).length) p.subjects = 'Pick at least one subject.';
    setErr(p);
    if (Object.keys(p).length) shake.hit(); else create.mutate();
  };
  const toggle = (id: string) => { setErr({ ...err, subjects: '' }); setPicked((x) => { const n = { ...x }; if (n[id]) delete n[id]; else n[id] = { on: f.startsOn, max: '100' }; return n; }); };
  return (
    <Dialog title="New exam" onClose={onClose} width={620} shake={shake.cls}>
      <div className="stack">
        <Field label="Name" value={f.name} onChange={(name) => { setF({ ...f, name }); setErr({ ...err, name: '' }); }} error={err.name} placeholder="Mid-term exams" maxLength={80} />
        <SelectField label="Class" value={f.classId} onChange={(classId) => { setF({ ...f, classId }); setErr({ ...err, classId: '' }); }} error={err.classId} options={[{ value: '', label: 'Pick a class' }, ...(classes.data ?? []).map((c) => ({ value: c.id, label: `Class ${c.name}` }))]} />
        <div className="two">
          <DateField label="First day" value={f.startsOn} onChange={(startsOn) => setF({ ...f, startsOn })} />
          <DateField label="Last day" value={f.endsOn} min={f.startsOn} onChange={(endsOn) => { setF({ ...f, endsOn }); setErr({ ...err, endsOn: '' }); }} error={err.endsOn} />
        </div>
        <div className="fld">
          <label>Subjects</label>
          <div className="exs">
            {(subjects.data ?? []).map((s) => {
              const on = picked[s.id];
              return (
                <div key={s.id} className={`exr ${on ? 'on' : ''}`}>
                  <Checkbox checked={!!on} onChange={() => toggle(s.id)} label={<span>{s.name}</span>} />
                  {on && <>
                    <DateField compact label={`${s.name} date`} value={on.on} min={f.startsOn} max={f.endsOn} onChange={(v) => setPicked({ ...picked, [s.id]: { ...on, on: v } })} />
                    <input className="hws" inputMode="numeric" aria-label={`${s.name} marks out of`} value={on.max} onChange={(e) => setPicked({ ...picked, [s.id]: { ...on, max: e.target.value.replace(/\D/g, '').slice(0, 3) } })} />
                    <small>marks</small>
                  </>}
                </div>
              );
            })}
          </div>
          {err.subjects && <div className="emsg" role="alert">{err.subjects}</div>}
        </div>
        {err._ && <div className="emsg" role="alert">{err._}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={create.isPending} onClick={go}>{create.isPending ? 'Adding…' : 'Add exam'}</button>
      </div>
    </Dialog>
  );
}

type Cell = { score: string; absent: boolean };

function ExamSheet({ id, onClose, onChanged, onRemoved }: { id: string; onClose: () => void; onChanged: (msg?: string) => void; onRemoved: () => void }) {
  const app = useApp();
  const [tab, setTab] = useState<'marks' | 'results'>('marks');
  const marks = useQuery({ queryKey: ['exams', 'marks', id], queryFn: () => app.api.exams.marks(id) });
  const results = useQuery({ queryKey: ['exams', 'results', id], queryFn: () => app.api.exams.results(id), enabled: tab === 'results' });
  const [draft, setDraft] = useState<Record<string, Cell>>({});
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState<'publish' | 'remove' | null>(null);
  const shake = useShake();
  const grid = useRef<HTMLDivElement>(null);
  const m = marks.data;
  const canWrite = app.user.permissions.includes('exams.write');
  const canPublish = app.user.permissions.includes('exams.publish');
  const key = (stu: string, sub: string) => `${stu}|${sub}`;
  const saved = (stu: string, sub: string): Cell => { const x = m?.students.find((s) => s.studentId === stu)?.marks[sub]; return { score: x?.score == null ? '' : String(x.score), absent: !!x?.absent }; };
  const cell = (stu: string, sub: string): Cell => draft[key(stu, sub)] ?? saved(stu, sub);
  useEffect(() => { setDraft({}); }, [m]);
  const dirty = Object.keys(draft).filter((k) => { const [a, b] = k.split('|') as [string, string]; const s = saved(a, b); const d = draft[k]!; return s.score !== d.score || s.absent !== d.absent; });
  const save = useMutation({
    mutationFn: () => app.api.exams.putMarks(id, { marks: dirty.map((k) => { const [studentId, subjectId] = k.split('|') as [string, string]; const d = draft[k]!; return { studentId, subjectId, score: d.absent || d.score === '' ? null : Number(d.score), absent: d.absent }; }) }),
    onSuccess: () => { setErr(''); void marks.refetch(); void results.refetch(); onChanged('Marks saved.'); },
    onError: (e) => { setErr(problem(e)._ ?? 'Could not save.'); shake.hit(); },
  });
  const publish = useMutation({
    mutationFn: () => app.api.exams.publish(id),
    onSuccess: (r) => { setConfirm(null); void marks.refetch(); void results.refetch(); onChanged(`Results published. ${r.families} ${r.families === 1 ? 'family is' : 'families are'} told.`); },
    onError: (e) => { setConfirm(null); setErr((e as Error).message); shake.hit(); },
  });
  const remove = useMutation({ mutationFn: () => app.api.exams.remove(id), onSuccess: onRemoved, onError: (e) => { setConfirm(null); setErr((e as Error).message); shake.hit(); } });
  // Enter moves down the column, like a spreadsheet.
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const col = e.currentTarget.dataset.col;
    const next = [...(grid.current?.querySelectorAll<HTMLInputElement>(`input[data-col="${col}"]:not(:disabled)`) ?? [])];
    next[next.indexOf(e.currentTarget) + 1]?.focus();
  };
  const ex = m?.exam;
  const editable = canWrite;
  return (
    <Dialog title={ex ? ex.name : 'Exam'} tag={ex ? { text: `Class ${ex.className} · ${LABEL[ex.status]}`, tone: ex.status === 'published' ? 'g' : 'v' } : undefined} onClose={onClose} width={860} shake={shake.cls}>
      {!m || !ex ? <div className="skc" style={{ height: 280, borderRadius: 18 }} /> : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '4px 0 12px' }}>
            <Segmented value={tab} onChange={setTab} label="Exam view" options={[{ value: 'marks', label: 'Marks' }, { value: 'results', label: 'Results' }]} />
            <span className="chip">{ex.entered} of {ex.expected} marks entered</span>
          </div>
          {tab === 'marks' ? (
            <div className="lscroll" ref={grid} style={{ maxHeight: 'min(50dvh,440px)', border: '1px solid var(--line)', borderRadius: 18 }}>
              <div style={{ minWidth: 120 + ex.subjects.length * 96 + 220 }}>
                <div className="mkh" style={{ '--n': ex.subjects.length } as React.CSSProperties}>
                  <span>Roll</span><span>Student</span>
                  {ex.subjects.map((s) => <span key={s.subjectId} data-tip={`${s.name}, out of ${s.maxMarks}`} style={{ textAlign: 'center' }}>{s.name}<small>/ {s.maxMarks}</small></span>)}
                </div>
                {m.students.map((s) => (
                  <div className="mkr" key={s.studentId} style={{ '--n': ex.subjects.length } as React.CSSProperties}>
                    <span className="rn num">{s.rollNo || '–'}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}><Avatar name={s.name} size={26} /><b data-tip={s.name} style={{ font: '700 13px var(--fb)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.name}</b></span>
                    {ex.subjects.map((sub) => {
                      const c = cell(s.studentId, sub.subjectId);
                      const over = c.score !== '' && Number(c.score) > sub.maxMarks;
                      return (
                        <span key={sub.subjectId} className="mkc">
                          <input data-col={sub.subjectId} inputMode="decimal" aria-label={`${s.name}, ${sub.name}`} className={`hws ${over ? 'bad' : ''}`} disabled={!editable || c.absent} placeholder={c.absent ? 'Abs' : '–'} value={c.score}
                            onKeyDown={onKey} onChange={(e) => setDraft({ ...draft, [key(s.studentId, sub.subjectId)]: { score: e.target.value.replace(/[^\d.]/g, '').slice(0, 5), absent: false } })} />
                          {editable && <button type="button" className={`abs ${c.absent ? 'on' : ''}`} data-tip={c.absent ? 'Marked absent. Click to undo' : 'Mark absent'} aria-label={`Absent: ${s.name}, ${sub.name}`} aria-pressed={c.absent}
                            onClick={() => setDraft({ ...draft, [key(s.studentId, sub.subjectId)]: { score: '', absent: !c.absent } })}>A</button>}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            !results.data ? <div className="skc" style={{ height: 240, borderRadius: 18 }} /> : results.data.rows.length === 0 ? <div className="help" style={{ padding: 16 }}>Results appear here as marks are entered.</div> : (
              <>
                <div className="tgrow" style={{ marginBottom: 10 }}><span className="chip v">Average {results.data.average}%</span><span className="chip g">{results.data.passPct}% passed</span><span className="chip">{results.data.rows.length} students</span></div>
                <div className="lscroll" style={{ maxHeight: 'min(46dvh,400px)', border: '1px solid var(--line)', borderRadius: 18 }}>
                  <div style={{ minWidth: 520 }}>
                    {results.data.rows.map((r) => (
                      <div className="grd rw" key={r.studentId} style={{ '--cols': '44px minmax(0,1.6fr) 90px 70px 60px' } as React.CSSProperties}>
                        <b className="num" style={{ font: '700 14px var(--fb)', color: r.rank <= 3 ? 'var(--v)' : 'var(--ink3)' }}>#{r.rank}</b>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}><Avatar name={r.name} size={28} /><b data-tip={r.name} style={{ font: '700 14px var(--fb)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.name}</b></span>
                        <span className="num" style={{ font: '600 13px var(--fb)' }}>{r.total} / {r.max}</span>
                        <b className="num" style={{ font: '700 14px var(--fb)' }}>{r.pct}%</b>
                        <span className={`chip ${r.pct >= 33 ? 'g' : 'c'}`}>{r.grade}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )
          )}
          {err && <div className="emsg" role="alert" style={{ marginTop: 10 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            {editable ? (confirm === 'remove'
              ? <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="help">Remove this exam?</span><button className="btn dngf sm" onClick={() => remove.mutate()}>Yes, remove</button><button className="btn sm" onClick={() => setConfirm(null)}>Keep</button></span>
              : ex.status !== 'published' ? <button className="btn dng" onClick={() => setConfirm('remove')}>Remove exam</button> : <span />) : <span />}
            <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {confirm === 'publish' && <span className="help">Families will see these results.</span>}
              <button className="btn" onClick={onClose}>Close</button>
              {editable && <button className="btn" disabled={!dirty.length || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : dirty.length ? `Save ${dirty.length} ${dirty.length === 1 ? 'mark' : 'marks'}` : 'Save marks'}</button>}
              {canPublish && ex.status !== 'published' && (confirm === 'publish'
                ? <button className="btn pri" disabled={publish.isPending || dirty.length > 0} onClick={() => publish.mutate()}>{publish.isPending ? 'Publishing…' : 'Yes, publish'}</button>
                : <button className="btn pri" disabled={dirty.length > 0} title={dirty.length ? 'Save the marks first' : undefined} onClick={() => setConfirm('publish')}>Publish results</button>)}
            </span>
          </div>
        </>
      )}
    </Dialog>
  );
}
