import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, istToday, type HomeworkDetail, type HomeworkFile, type HomeworkRow } from '@gradeon/contracts';
import { Checkbox, DateField, Dialog, Field, NumberField, Segmented, Select, SelectField, useShake, EmptyState } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { Page, useToast } from '../../app/Page';
import { AddBtn, AreaField, Attach, Avatar, dateLabel, problem, useOpenParam, useSetting } from '../../app/kit';
import { uploadFile } from '@gradeon/api-client';

const refresh = (qc: ReturnType<typeof useQueryClient>) => void qc.invalidateQueries({ predicate: (q) => ['homework', 'dashboard'].includes(String(q.queryKey[0])) });

export function HomeworkPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [classId, setClassId] = useState('');
  const [setting, setSetting] = useState(false);
  const [changing, setChanging] = useState<HomeworkDetail | null>(null);
  const [open, setOpen] = useOpenParam();
  const [subjectId, setSubjectId] = useState('');
  const [state, setState] = useState<'open' | 'closed' | 'all'>('open');
  const [mine, setMine] = useState(false);
  const classes = useQuery({ queryKey: ['classes'], queryFn: app.api.classes, staleTime: 5 * 60_000 });
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: app.api.subjects, staleTime: 10 * 60_000 });
  const list = useQuery({ queryKey: ['homework', classId, subjectId], queryFn: () => app.api.homework.list({ ...(classId ? { classId } : {}), ...(subjectId ? { subjectId } : {}) }) });
  const all = list.data ?? [];
  // A teacher's own homework comes first; "Mine" shows only theirs.
  const rows = all.filter((r) => (state === 'all' || (state === 'open') === (r.dueOn >= istToday())) && (!mine || r.teacherId === app.user.id))
    .sort((a, b) => Number(b.teacherId === app.user.id) - Number(a.teacherId === app.user.id));
  const iSet = all.some((r) => r.teacherId === app.user.id);
  const canWrite = app.user.permissions.includes('homework.write');
  const handed = rows.reduce((a, r) => a + r.handedIn, 0);
  const total = rows.reduce((a, r) => a + r.total, 0);
  const onTime = rows.reduce((a, r) => a + r.onTime, 0);
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const today = istToday();
  return (
    <Page title="Homework" sub={classId ? `Class ${classes.data?.find((c) => c.id === classId)?.name ?? ''}` : 'What has been set, and what has come back'} toast={toast} loading={list.isLoading && !list.data}
      error={list.isError && !list.data ? { message: (list.error as Error).message, retry: () => void list.refetch() } : null}
      actions={<>
        <Select compact aria-label="Class" value={classId} onChange={setClassId} options={[{ value: '', label: 'All classes' }, ...(classes.data ?? []).map((c) => ({ value: c.id, label: `Class ${c.name}` }))]} />
        {canWrite && <AddBtn onClick={() => setSetting(true)}>Set homework</AddBtn>}
      </>}
      overlays={<>
        {setting && <SetHomework defaultClass={classId} onClose={() => setSetting(false)} onDone={(d, failed) => { setSetting(false); refresh(qc); say(failed.length ? `Homework set, but ${failed.join(', ')} could not be attached.` : 'Homework set. Families are told.', failed.length ? 'bad' : undefined); setOpen(d.id); }} />}
        {changing && <SetHomework hw={changing} defaultClass={classId} onClose={() => setChanging(null)} onDone={(_d, failed) => { setChanging(null); refresh(qc); say(failed.length ? `Saved, but ${failed.join(', ')} could not be attached.` : 'Homework changed.'); }} />}
        {open && !changing && <HomeworkSheet id={open} canWrite={canWrite} onChange={setChanging} onClose={() => setOpen(null)} onSaved={(m) => { refresh(qc); say(m); }} onRemoved={() => { setOpen(null); refresh(qc); say('Homework removed.'); }} />}
      </>}>
      {all.length === 0 ? (
        <div><EmptyState scene="homework" onAction={canWrite ? () => setSetting(true) : undefined} /></div>
      ) : (
        <section className="grid">
          <div className="tile t-v s4 rise"><span className="lbl">Handed in</span><div className="big" style={{ marginTop: 8 }}>{pct(handed)}%</div><div style={{ font: '600 13px var(--fb)', opacity: 0.8 }}>{handed} of {total} pieces of work</div></div>
          <div className="tile t-a s4 rise" style={{ '--d': '.05s' } as React.CSSProperties}><span className="lbl">On time</span><div className="big" style={{ marginTop: 8 }}>{pct(onTime)}%</div><div style={{ font: '600 13px var(--fb)', opacity: 0.75 }}>handed in by the due day</div></div>
          <div className="tile t-l s4 rise" style={{ '--d': '.1s' } as React.CSSProperties}><span className="lbl">Homework set</span><div className="big" style={{ marginTop: 8 }}>{rows.length}</div><div style={{ font: '600 13px var(--fb)', color: 'var(--ink3)' }}>{rows.filter((r) => r.dueOn >= today).length} still open</div></div>
          <div className="card tbl s12 rise" style={{ '--d': '.14s', padding: 0 } as React.CSSProperties}>
            <div className="ch" style={{ padding: '24px 24px 12px', flexWrap: 'wrap', gap: 10 }}>
              <h2>Homework</h2><span className="chip v">{rows.length}</span>
              <span className="grow"></span>
              <Segmented label="Open or closed" value={state} onChange={setState} options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }, { value: 'all', label: 'All' }]} />
              <Select compact aria-label="Subject" value={subjectId} onChange={setSubjectId} options={[{ value: '', label: 'All subjects' }, ...(subjects.data ?? []).map((s) => ({ value: s.id, label: s.name }))]} />
              {iSet && <Checkbox checked={mine} onChange={setMine} label="Only mine" />}
            </div>
            <div className="scroll-x lscroll" data-fill="">
              <div className="hwlw" style={{ minWidth: 640 }}>
                <div className="grd th" style={{ '--cols': COLS } as React.CSSProperties}><span>Homework</span><span>Class</span><span>Due</span><span>Handed in</span><span style={{ textAlign: 'right' }}>Count</span></div>
                {rows.map((r) => <Row key={r.id} r={r} today={today} onOpen={() => setOpen(r.id)} />)}
                {rows.length === 0 && <div className="help" style={{ padding: '16px 24px' }}>Nothing here with these filters.</div>}
              </div>
            </div>
          </div>
        </section>
      )}
    </Page>
  );
}

const COLS = 'minmax(0,1.7fr) 70px 90px minmax(120px,1fr) 90px';

function Row({ r, today, onOpen }: { r: HomeworkRow; today: string; onOpen: () => void }) {
  const p = r.total ? Math.round((r.handedIn / r.total) * 100) : 0;
  const overdue = r.dueOn < today && r.handedIn < r.total;
  return (
    <button className="rowbtn" onClick={onOpen} aria-label={`Open ${r.title}, ${r.className}`}>
      <div className="grd rw hwl" style={{ '--cols': COLS } as React.CSSProperties}>
        <span style={{ minWidth: 0 }}>
          <b data-tip={r.title} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', font: '700 14px/1.25 var(--fb)' }}>{r.title}</b>
          <small style={{ color: 'var(--ink3)', font: '600 12px var(--fb)' }}>{r.subjectName} · set {dateLabel(r.assignedOn)}{r.teacherName ? ` by ${r.teacherName}` : ''}</small>
        </span>
        <span className="chip">{r.className}</span>
        <span className={`chip ${overdue ? 'c' : ''}`}>Due {dateLabel(r.dueOn)}</span>
        <span className="us hs" style={{ gap: 6 }}><div className="bar" style={{ height: 14 }}><i style={{ width: `${p}%` }}></i></div></span>
        <b className="num" style={{ font: '700 13px var(--fb)', textAlign: 'right' }}>{r.handedIn} / {r.total}</b>
      </div>
    </button>
  );
}

/** Sets homework, or changes it later (families are not told again for a correction). */
function SetHomework({ hw, defaultClass, onClose, onDone }: { hw?: HomeworkDetail; defaultClass: string; onClose: () => void; onDone: (d: HomeworkDetail, failed: string[]) => void }) {
  const app = useApp();
  const classes = useQuery({ queryKey: ['classes'], queryFn: app.api.classes, staleTime: 5 * 60_000 });
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: app.api.subjects, staleTime: 10 * 60_000 });
  const dueDays = useSetting<number>('homework.defaultDueDays', 2);
  const outOf = useSetting<number>('homework.defaultMarks', 20);
  const [f, setF] = useState({ classId: hw?.classId ?? defaultClass, subjectId: hw?.subjectId ?? '', title: hw?.title ?? '', description: hw?.description ?? '', dueOn: hw?.dueOn ?? addDays(istToday(), dueDays), maxMarks: String(hw?.maxMarks ?? outOf) });
  const [graded, setGraded] = useState(hw?.graded ?? true);
  const [err, setErr] = useState<Record<string, string>>({});
  const shake = useShake();
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErr((e) => ({ ...e, [k]: '', _: '' })); };
  const [files, setFiles] = useState<File[]>([]);
  const make = useMutation({
    mutationFn: async () => {
      const body = { classId: f.classId, subjectId: f.subjectId, title: f.title.trim(), description: f.description.trim(), dueOn: f.dueOn, maxMarks: Number(f.maxMarks) || outOf, graded, draft: false, fileIds: [] };
      const d = hw ? await app.api.homework.update(hw.id, body) : await app.api.homework.create(body);
      // Attached once the homework exists; one that fails is said by name, and the homework stays set.
      const failed: string[] = [];
      for (const file of files) await uploadFile(app.api, 'homework_attachment', d.id, file).catch(() => failed.push(file.name));
      return { d, failed };
    },
    onSuccess: ({ d, failed }) => onDone(d, failed), onError: (e) => { setErr(problem(e)); shake.hit(); },
  });
  const go = () => {
    const p: Record<string, string> = {};
    if (!f.classId) p.classId = 'Choose a class.';
    if (!f.subjectId) p.subjectId = 'Choose a subject.';
    if (f.title.trim().length < 3) p.title = 'Give the homework a title.';
    if (f.dueOn < istToday() && f.dueOn !== hw?.dueOn) p.dueOn = 'Pick today or a later day.';
    setErr(p);
    if (Object.keys(p).length) shake.hit(); else make.mutate();
  };
  return (
    <Dialog title={hw ? `Change ${hw.title}` : 'Set homework'} onClose={onClose} width={560} shake={shake.cls}>
      <div className="stack">
        <div className="two">
          {!hw && <SelectField label="Class" value={f.classId} onChange={set('classId')} error={err.classId} options={[{ value: '', label: 'Pick a class' }, ...(classes.data ?? []).map((c) => ({ value: c.id, label: `Class ${c.name}` }))]} />}
          <SelectField label="Subject" value={f.subjectId} onChange={set('subjectId')} error={err.subjectId} options={[{ value: '', label: 'Pick a subject' }, ...(subjects.data ?? []).map((s) => ({ value: s.id, label: s.name }))]} />
        </div>
        <Field label="Title" value={f.title} onChange={set('title')} error={err.title} maxLength={120} placeholder="Linear equations, questions 1 to 10" />
        <AreaField label="What to do (optional)" value={f.description} onChange={set('description')} error={err.description} maxLength={1000} rows={3} />
        <div className="two">
          <DateField label="Due on" value={f.dueOn} min={istToday()} onChange={set('dueOn')} error={err.dueOn} />
          {graded ? <NumberField label="Marks out of" min={1} max={100} value={f.maxMarks} onChange={set('maxMarks')} error={err.maxMarks} /> : <div className="help" style={{ alignSelf: 'center' }}>Checked when handed in, not marked.</div>}
        </div>
        <Checkbox checked={graded} onChange={setGraded} label="Marked out of a number" />
        <Attach files={files} onChange={setFiles} />
        {err._ && <div className="emsg" role="alert">{err._}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={make.isPending} onClick={go}>{make.isPending ? 'Saving…' : hw ? 'Save changes' : 'Set homework'}</button>
      </div>
    </Dialog>
  );
}

interface Draft { handed: boolean; score: string; feedback: string }

function HomeworkSheet({ id, canWrite, onChange, onClose, onSaved, onRemoved }: { id: string; canWrite: boolean; onChange: (d: HomeworkDetail) => void; onClose: () => void; onSaved: (msg: string) => void; onRemoved: () => void }) {
  const app = useApp();
  const detail = useQuery({ queryKey: ['homework', 'detail', id], queryFn: () => app.api.homework.detail(id) });
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState(false);
  const shake = useShake();
  const d = detail.data;
  useEffect(() => { if (d) setDraft(Object.fromEntries(d.students.map((s) => [s.studentId, { handed: !!s.handedAt, score: s.score == null ? '' : String(s.score), feedback: s.feedback }]))); }, [d]);
  const save = useMutation({
    mutationFn: () => {
      const changed = d!.students.filter((s) => { const x = draft[s.studentId]; return x && (x.handed !== !!s.handedAt || x.score !== (s.score == null ? '' : String(s.score)) || x.feedback !== s.feedback); });
      return app.api.homework.mark(id, { marks: changed.map((s) => { const x = draft[s.studentId]!; return { studentId: s.studentId, handed: x.handed, score: x.score === '' ? null : Number(x.score), feedback: x.feedback }; }) });
    },
    onSuccess: (r) => { onSaved('Saved. Hand-ins are up to date.'); setErr(''); setDraft(Object.fromEntries(r.students.map((s) => [s.studentId, { handed: !!s.handedAt, score: s.score == null ? '' : String(s.score), feedback: s.feedback }]))); void detail.refetch(); },
    onError: (e) => { setErr(problem(e)._ ?? 'Could not save.'); shake.hit(); },
  });
  const remove = useMutation({ mutationFn: () => app.api.homework.remove(id), onSuccess: onRemoved, onError: (e) => { setErr((e as Error).message); setConfirm(false); } });
  const dirty = d ? d.students.some((s) => { const x = draft[s.studentId]; return x && (x.handed !== !!s.handedAt || x.score !== (s.score == null ? '' : String(s.score)) || x.feedback !== s.feedback); }) : false;
  const nothing = !dirty || save.isPending;
  return (
    <Dialog title={d ? d.title : 'Homework'} tag={d ? { text: `${d.subjectName} · Class ${d.className}`, tone: 'v' } : undefined} onClose={onClose} width={720} shake={shake.cls}>
      {!d ? <div className="skc" style={{ height: 240, borderRadius: 16 }} /> : (
        <>
          {d.description && <p style={{ margin: '0 0 6px', font: '400 14px/1.5 var(--fb)', color: 'var(--ink2)' }}>{d.description}</p>}
          <div className="tgrow" style={{ margin: '8px 0 12px' }}>
            <span className="chip">Set {dateLabel(d.assignedOn)}</span><span className="chip a">Due {dateLabel(d.dueOn)}</span>{d.graded ? <span className="chip">Out of {d.maxMarks}</span> : <span className="chip">Checked, not marked</span>}<span className="chip g">{d.handedIn} of {d.total} handed in</span>
            <FileChips files={d.files} />
          </div>
          <div className="lscroll" style={{ maxHeight: 'min(48dvh,420px)', border: '1px solid var(--line)', borderRadius: 16 }}>
            {d.students.map((s) => {
              const x = draft[s.studentId] ?? { handed: false, score: '', feedback: '' };
              return (
                <div key={s.studentId} className="hwr">
                  <span className="rn num">{s.rollNo || '–'}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}><Avatar name={s.name} size={30} /><b style={{ font: '700 14px var(--fb)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} data-tip={s.name}>{s.name}</b></span>
                  <Checkbox checked={x.handed} disabled={!canWrite} onChange={(handed) => setDraft({ ...draft, [s.studentId]: { ...x, handed } })} label={<span>{x.handed ? (s.onTime || !s.handedAt ? 'Handed in' : 'Late') : 'Not yet'}</span>} />
                  {d.graded ? <input className="hws" inputMode="numeric" aria-label={`Marks for ${s.name}`} placeholder="–" disabled={!canWrite || !x.handed} value={x.score} onChange={(e) => setDraft({ ...draft, [s.studentId]: { ...x, score: e.target.value.replace(/\D/g, '').slice(0, 3) } })} /> : <span />}
                  {(x.handed || s.files.length > 0) && (
                    <div style={{ gridColumn: '2 / -1', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', paddingBottom: 6 }}>
                      <FileChips files={s.files} />
                      <input className="hws" style={{ flex: '1 1 200px', width: 'auto', minWidth: 0, textAlign: 'left' }} aria-label={`Feedback for ${s.name}`} placeholder="A word of feedback (the family sees it)" disabled={!canWrite} maxLength={300}
                        value={x.feedback} onChange={(e) => setDraft({ ...draft, [s.studentId]: { ...x, feedback: e.target.value } })} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {err && <div className="emsg" role="alert" style={{ marginTop: 10 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            {canWrite ? (confirm
              ? <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="help">Remove this homework?</span><button className="btn dngf sm" onClick={() => remove.mutate()}>Yes, remove</button><button className="btn sm" onClick={() => setConfirm(false)}>Keep</button></span>
              : <span style={{ display: 'flex', gap: 8 }}><button className="btn dng" onClick={() => setConfirm(true)}>Remove homework</button>{d && <button className="btn" onClick={() => onChange(d)}>Change</button>}</span>) : <span />}
            <span style={{ display: 'flex', gap: 10 }}>
              <button className="btn" onClick={onClose}>Close</button>
              {canWrite && <button className="btn pri" disabled={nothing} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save hand-ins'}</button>}
            </span>
          </div>
        </>
      )}
    </Dialog>
  );
}

/** Files to open in a new tab: their links last a few minutes, so each is fetched on the click. */
function FileChips({ files }: { files: HomeworkFile[] }) {
  const app = useApp();
  if (!files.length) return null;
  const open = (id: string) => void app.api.files.url(id, true).then((u) => window.open(u.url, '_blank', 'noopener')).catch(() => undefined);
  return <>{files.map((f) => <button key={f.id} type="button" className="chip v" data-tip="Open" onClick={() => open(f.id)}>{f.name}</button>)}</>;
}
