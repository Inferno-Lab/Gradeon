import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PromotionPreview, YearRow } from '@gradeon/contracts';
import { istToday } from '@gradeon/contracts';
import { DateField, Dialog, EmptyCard, Field, Select, useShake } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { Card, Page, useToast } from '../../app/Page';
import { StudentPick, dateLabel, problem, stamp } from '../../app/kit';
import { usePageTabs } from '../../app/tabs';
import { useSetupSections } from './SetupSections';

const STATUS: Record<YearRow['status'], { text: string; tone: string }> = { current: { text: 'Current', tone: 'g' }, draft: { text: 'Draft', tone: 'a' }, archived: { text: 'Archived', tone: '' } };
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
type Kid = { id: string; name: string; className: string };

/** Which of the school's setup records each tab of Academic year lists (config-engine: the school module's year page). */
const KINDS: Record<string, string[]> = { terms: ['years', 'terms'], holidays: ['holidays'], classes: ['classes'], subjects: ['subjects'], bells: ['periods'] };
const SUBS: Record<string, string> = {
  terms: 'The school’s years and terms. Everything that runs by term reads from them.', holidays: 'Days the school is closed: no roll call, and the app shows them.',
  classes: 'Every class and its class teacher.', subjects: 'What is taught, and how often each week.', bells: 'When each period, break and lunch begins and ends.',
};

export function YearPage() {
  const { tab, tabs } = usePageTabs('/year');
  const { toast, say } = useToast();
  const setup = useSetupSections(KINDS[tab] ?? [], say);
  if (tab === 'year-end') return <YearEnd tabs={tabs} />;
  return <Page title="Academic year" sub={SUBS[tab] ?? ''} toast={toast} actions={tabs} overlays={setup.overlay}>{setup.view}</Page>;
}

/** Promotions, starting the new year and leavers. */
function YearEnd({ tabs }: { tabs: React.ReactNode }) {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [dlg, setDlg] = useState<'year' | 'promote' | 'leaver' | null>(null);
  const view = useQuery({ queryKey: ['year'], queryFn: app.api.year.view });
  const can = app.user.permissions.includes('year.manage');
  const refresh = () => void qc.invalidateQueries({ predicate: (q) => ['year', 'students', 'classes', 'shell'].includes(String(q.queryKey[0])) });
  const done = (m: string) => { setDlg(null); refresh(); say(m); };
  const act = useMutation({
    mutationFn: async (a: { what: 'start' | 'remove' | 'undo' | 'rejoin'; id: string }) => {
      if (a.what === 'start') { await app.api.year.start(a.id); return 'The new year has started: classes, terms and fee dates moved to it, and last year is archived.'; }
      if (a.what === 'remove') { await app.api.year.remove(a.id); return 'The draft year was removed.'; }
      if (a.what === 'undo') { await app.api.year.undo(a.id); return 'Every student is back where they were before the promotion.'; }
      await app.api.year.rejoin(a.id); return 'The student is back on the roll.';
    },
    onSuccess: (m) => { refresh(); say(m); }, onError: (e) => say((e as Error).message, 'bad'),
  });
  const v = view.data;
  const draft = v?.years.find((y) => y.status === 'draft');
  const latestRun = v?.runs[0];
  return (
    <Page title="Academic year" sub="Promote students, start the new year and record who leaves. Dues carry forward on their own." toast={toast} loading={view.isLoading && !v}
      error={view.isError && !v ? { message: (view.error as Error).message, retry: () => void view.refetch() } : null}
      actions={<>{tabs}{can && <button className="btn pri" onClick={() => setDlg('promote')}>Promote students</button>}</>}
      overlays={v && <>
        {dlg === 'year' && <NewYear years={v.years} onClose={() => setDlg(null)} onDone={done} />}
        {dlg === 'promote' && <Promote years={v.years} onClose={() => setDlg(null)} onDone={done} />}
        {dlg === 'leaver' && <Leaver onClose={() => setDlg(null)} onDone={done} />}
      </>}>
      {v && <>
        <section className="grid" data-even="">
          <Card span="s6" title="Academic years" chip={can && !draft ? <button className="btn sm" onClick={() => setDlg('year')}>Draft next year</button> : undefined}>
            {!v.years.length && <div className="help">No year is set up. Gradeon adds the first one with the school.</div>}
            {v.years.map((y) => (
              <div key={y.id} className="kv" style={{ alignItems: 'center' }}>
                <span style={{ minWidth: 0 }}><b style={{ color: 'var(--ink)' }}>{y.label}</b><br /><small className="help">{dateLabel(y.startsOn)} {y.startsOn.slice(0, 4)} to {dateLabel(y.endsOn)} {y.endsOn.slice(0, 4)}{y.status === 'current' ? ` · ${y.classes} classes, ${y.students} students` : ''}</small></span>
                <b style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className={`chip ${STATUS[y.status].tone}`}>{STATUS[y.status].text}</span>
                  {can && y.status === 'draft' && <><button className="btn sm pri" disabled={act.isPending} onClick={() => act.mutate({ what: 'start', id: y.id })} data-tip="Promote students first">Start</button><button className="btn sm" disabled={act.isPending} onClick={() => act.mutate({ what: 'remove', id: y.id })}>Remove</button></>}
                </b>
              </div>
            ))}
            <div className="help" style={{ marginTop: 10 }}>Order of things: draft the next year, promote students, then start the year. An archived year stays readable but cannot be changed.</div>
          </Card>
          <Card span="s6" title="Promotions" chip={latestRun && !latestRun.undoneAt && can ? <button className="btn sm" disabled={act.isPending} onClick={() => act.mutate({ what: 'undo', id: latestRun.id })}>Undo the latest</button> : undefined}>
            {!v.runs.length ? <div className="help">No promotion has run yet. “Promote students” shows where each class goes before anything moves.</div>
              : v.runs.map((r) => (
                <div key={r.id} className="kv" style={{ alignItems: 'center' }}>
                  <span>{r.students} students · to {r.toYear}<br /><small className="help">{stamp(r.createdAt)}</small></span>
                  <b>{r.undoneAt ? <span className="chip">Undone</span> : <span className="chip g">Applied</span>}</b>
                </div>
              ))}
          </Card>
        </section>
        <Card title="Students who left" chip={can ? <button className="btn sm" onClick={() => setDlg('leaver')}>Record a leaver</button> : undefined} style={{ padding: 0 }}>
          <div className="help" style={{ padding: '0 20px 12px' }}>Their records are kept for {v.retentionMonths} months after they leave, then Gradeon erases them once a second person agrees. Receipts stay, without a name.</div>
          {!v.leavers.length ? <div className="help" style={{ padding: '0 20px 20px' }}>Nobody has left. Students in the top class leave when they are promoted; others are recorded here.</div> : (
            <div className="tbl scroll-x"><div style={{ minWidth: 620 }} className="lscroll">
              <div className="grd th" style={{ '--cols': 'minmax(0,1.4fr) 110px minmax(0,1.4fr) 150px 100px' } as React.CSSProperties}><span>Student</span><span>Left on</span><span>Why</span><span>Records kept until</span><span></span></div>
              {v.leavers.map((l) => (
                <div key={l.id} className="grd rw" style={{ '--cols': 'minmax(0,1.4fr) 110px minmax(0,1.4fr) 150px 100px', height: 'auto', minHeight: 52, padding: '8px 20px' } as React.CSSProperties}>
                  <span style={{ minWidth: 0 }}><b style={{ font: '700 13px var(--fb)' }}>{l.name}</b><small className="help" style={{ display: 'block' }}>{l.admissionNo}</small></span>
                  <span className="num">{dateLabel(l.leftOn)}</span>
                  <span className="help" style={{ margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-tip={l.reason}>{l.reason}</span>
                  <span><span className={`chip ${l.due ? 'a' : ''}`}>{dateLabel(l.eraseAfter)} {l.eraseAfter.slice(0, 4)}</span></span>
                  <span>{can && <button className="btn sm" disabled={act.isPending} onClick={() => act.mutate({ what: 'rejoin', id: l.id })}>Rejoin</button>}</span>
                </div>
              ))}
            </div></div>
          )}
        </Card>
      </>}
    </Page>
  );
}

function NewYear({ years, onClose, onDone }: { years: YearRow[]; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const shake = useShake();
  const cur = years.find((y) => y.status === 'current');
  const nextStart = cur ? `${Number(cur.endsOn.slice(0, 4))}-${cur.startsOn.slice(5)}` : istToday();
  const [f, setF] = useState({ label: cur ? `${Number(cur.label.slice(0, 4)) + 1}-${String(Number(cur.label.slice(0, 4)) + 2).slice(2)}` : '', startsOn: nextStart > (cur?.endsOn ?? '') ? nextStart : '', endsOn: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (x: string) => { setF((o) => ({ ...o, [k]: x })); setErr((e) => ({ ...e, [k]: '', _: '' })); };
  const save = useMutation({ mutationFn: () => app.api.year.create(f), onSuccess: () => onDone(`${f.label} is drafted. Promote students, then start it.`), onError: (e) => { setErr(problem(e)); shake.hit(); } });
  return (
    <Dialog title="Draft next year" onClose={onClose} width={480} shake={shake.cls}>
      <div className="stack">
        <Field label="Name" value={f.label} onChange={set('label')} error={err.label} placeholder="2027-28" />
        <div className="two"><DateField label="Starts" value={f.startsOn} onChange={set('startsOn')} error={err.startsOn} /><DateField label="Ends" value={f.endsOn} onChange={set('endsOn')} error={err.endsOn} /></div>
        {err._ && <div className="emsg" role="alert">{err._}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={save.isPending || !f.label || !f.startsOn || !f.endsOn} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Draft year'}</button>
      </div>
    </Dialog>
  );
}

function Promote({ years, onClose, onDone }: { years: YearRow[]; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const shake = useShake();
  const preview = useQuery({ queryKey: ['year', 'preview'], queryFn: app.api.year.preview });
  const [moves, setMoves] = useState<PromotionPreview['classes']>([]);
  const [held, setHeld] = useState<Kid[]>([]);
  const [leaving, setLeaving] = useState<Kid[]>([]);
  const target = years.find((y) => y.status === 'draft') ?? years.find((y) => y.status === 'current');
  const [err, setErr] = useState('');
  useEffect(() => { if (preview.data) setMoves(preview.data.classes); }, [preview.data]);
  const run = useMutation({
    mutationFn: () => app.api.year.promote({ toYear: target!.id, moves: moves.map((m) => ({ fromClassId: m.fromClassId, toClassId: m.toClassId })), detained: held.map((k) => k.id), leaving: leaving.map((k) => k.id) }),
    onSuccess: (r) => onDone(`${r.moved} students moved up and ${r.left} left the school. Undo is on this page if anything looks wrong.`), onError: (e) => { setErr((e as Error).message); shake.hit(); },
  });
  const classes = preview.data?.classes ?? [];
  const total = moves.reduce((n, m) => n + m.students, 0);
  return (
    <Dialog title="Promote students" tag={target ? { text: `Into ${target.label}`, tone: 'v' } : undefined} onClose={onClose} width={640} shake={shake.cls}>
      {preview.isLoading ? <div className="skc" style={{ height: 220, borderRadius: 18 }} /> : !classes.length ? <EmptyCard title="Promotion" chip={{ text: '0 classes', tone: 'v' }} scene="register" heading="No classes to promote" body="Classes come from Classes and calendar, or from Migration." /> : (
        <div className="stack">
          <div className="help">Each class moves to the next grade’s section with the same letter. Change any of them; the top class leaves the school.</div>
          <div className="lscroll" style={{ maxHeight: 280 }}>
            {moves.map((m, i) => (
              <div key={m.fromClassId} className="kv" style={{ alignItems: 'center' }}>
                <span>{m.fromName} · {m.students}</span>
                <b style={{ minWidth: 200 }}><Select compact aria-label={`Where ${m.fromName} goes`} value={m.toClassId ?? ''} onChange={(x) => setMoves((l) => l.map((y, j) => (j === i ? { ...y, toClassId: x || null } : y)))}
                  options={[{ value: '', label: 'Leaves the school' }, ...classes.map((c) => ({ value: c.fromClassId, label: c.fromName }))]} /></b>
              </div>
            ))}
          </div>
          <div>
            <StudentPick label="Detained (stay in their class)" value={null} onChange={(s) => s && setHeld((l) => (l.some((x) => x.id === s.id) ? l : [...l, s]))} />
            {held.length > 0 && <div className="tgrow" style={{ marginTop: 8 }}>{held.map((k) => <button key={k.id} type="button" className="chip a" onClick={() => setHeld((l) => l.filter((x) => x.id !== k.id))}>{k.name} ×</button>)}</div>}
          </div>
          <div>
            <StudentPick label="Leaving the school (besides the top class)" value={null} onChange={(s) => s && setLeaving((l) => (l.some((x) => x.id === s.id) ? l : [...l, s]))} />
            {leaving.length > 0 && <div className="tgrow" style={{ marginTop: 8 }}>{leaving.map((k) => <button key={k.id} type="button" className="chip c" onClick={() => setLeaving((l) => l.filter((x) => x.id !== k.id))}>{k.name} ×</button>)}</div>}
          </div>
          {!!preview.data?.dues && <div className="help">{rupees(preview.data.dues)} is still owed by {preview.data.duesStudents} students. It carries forward: nothing is cleared by promoting.</div>}
          {err && <div className="emsg" role="alert">{err}</div>}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={run.isPending || !target || !moves.length} onClick={() => run.mutate()}>{run.isPending ? 'Promoting…' : `Promote ${total} students`}</button>
      </div>
    </Dialog>
  );
}

function Leaver({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const shake = useShake();
  const [kid, setKid] = useState<Kid | null>(null);
  const [leftOn, setLeftOn] = useState(istToday());
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const save = useMutation({ mutationFn: () => app.api.year.leaver({ studentId: kid!.id, leftOn, reason: reason.trim() }), onSuccess: () => onDone(`${kid!.name} is recorded as having left.`), onError: (e) => { setErr(problem(e)); shake.hit(); } });
  return (
    <Dialog title="Record a leaver" onClose={onClose} width={480} shake={shake.cls}>
      <div className="stack">
        <StudentPick label="Student" value={kid} onChange={setKid} error={err.studentId} />
        <DateField label="Left on" value={leftOn} onChange={setLeftOn} error={err.leftOn} />
        <Field label="Why" value={reason} onChange={(x) => { setReason(x); setErr({}); }} error={err.reason} placeholder="Moved to Bengaluru" />
        {err._ && <div className="emsg" role="alert">{err._}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={save.isPending || !kid || reason.trim().length < 2} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Record'}</button>
      </div>
    </Dialog>
  );
}
