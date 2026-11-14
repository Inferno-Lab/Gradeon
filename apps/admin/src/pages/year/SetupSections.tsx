import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { importKind, type ImportColumn, type SetupSection } from '@tangent/contracts';
import { DateField, Dialog, EmptyCard, Field, SelectField, TimeField, useShake, EmptyState, EmptyNote, type EmptyScene, type IconName } from '@tangent/web-ui';

// The lists that have a scene of their own; the rest show an EmptyNote.
const SCENE: Record<string, EmptyScene> = { classes: 'year', holidays: 'holidays', subjects: 'subjects', periods: 'bells' };
const KIND_ICON: Record<string, IconName> = { years: 'year', terms: 'calendar', holidays: 'calendar', subjects: 'homework', periods: 'time', fee_heads: 'fees', fee_structures: 'invoices' };
import { useApp } from '../../app/context';
import { AddBtn, problem, useFeeHeads } from '../../app/kit';

type Row = SetupSection['rows'][number];
const PERIOD_KINDS = ['period', 'break', 'lunch', 'recess', 'assembly'];
/** What people call a row: the fee's title, the subject's or holiday's name, the class, the period's label. */
const nameOf = (r: Record<string, string>) => r.title || r.name || r.class || r.label || 'It';
const isDay = (key: string) => /_on$/.test(key);
const isTime = (key: string) => /_at$/.test(key);

function shown(col: ImportColumn, v: string): string {
  if (!v) return '–';
  if (isDay(col.key)) return new Date(`${v}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  if (col.key === 'amount') return `₹${Number(v).toLocaleString('en-IN')}`;
  if (col.key === 'current') return v ? 'Current' : '';
  return v;
}

/**
 * The school's own records of one part of its setup (years and terms, holidays, classes, subjects, bells, fee structures), as
 * lists to read and, where Tangent lets the school change them (console switches like calendar.schoolEdits), to edit.
 */
export function useSetupSections(kinds: readonly string[], say: (text: string, tone?: 'bad') => void): { view: React.ReactNode; overlay: React.ReactNode } {
  const app = useApp();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ section: SetupSection; row: Row | null } | null>(null);
  const list = useQuery({ queryKey: ['setup'], queryFn: app.api.setup.sections });
  const canWrite = app.user.permissions.includes('setup.write');
  const sections = list.data ?? [];
  const overlay = editing && <RowDialog section={editing.section} row={editing.row} all={sections} onClose={() => setEditing(null)}
    onDone={(msg, next) => { setEditing(null); if (next) qc.setQueryData(['setup'], next); void qc.invalidateQueries({ predicate: (q) => ['classes', 'subjects', 'timetable', 'events', 'shell'].includes(String(q.queryKey[0])) }); say(msg); }} />;
  if (list.isLoading) return { view: <div className="skc" style={{ height: 240, borderRadius: 16 }} />, overlay: null };
  if (list.isError) return { view: <EmptyCard error title="Setup" chip={{ text: 'Couldn’t load', tone: 'c' }} icon="warning" heading="That didn’t load" body={(list.error as Error).message} actions={<button className="btn pri" onClick={() => void list.refetch()}>Try again</button>} />, overlay: null };
  const view = (
    <div className="stack" style={{ gap: 16 }}>
      {sections.filter((s) => kinds.includes(s.kind)).map((s) => <SectionCard key={s.kind} section={s} canWrite={canWrite} onOpen={(row) => setEditing({ section: s, row })} />)}
    </div>
  );
  return { view, overlay };
}

function SectionCard({ section: s, canWrite, onOpen }: { section: SetupSection; canWrite: boolean; onOpen: (row: Row | null) => void }) {
  const edit = canWrite && !s.locked;
  // A class's grade and section come from its name (8 A), so the list shows the name only.
  const cols = s.columns.filter((c) => s.kind !== 'classes' || (c.key !== 'grade' && c.key !== 'section'));
  const grid = { '--cols': cols.map((c) => (c.key === 'name' || c.key === 'title' || c.key === 'label' ? 'minmax(0,1.6fr)' : 'minmax(0,1fr)')).join(' ') } as React.CSSProperties;
  return (
    <section className="card tbl rise" style={{ padding: 0 }}>
      <div className="ch" style={{ padding: '24px 24px 16px', flexWrap: 'wrap', gap: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}><h2>{s.label}</h2><span className="chip">{s.rows.length}</span></span>
        {edit && <span style={{ marginLeft: 'auto' }}><AddBtn onClick={() => onOpen(null)}>Add</AddBtn></span>}
      </div>
      {s.locked && <div className="help" style={{ padding: '0 24px 16px' }}>Tangent keeps these for your school. To change them, use “Ask Tangent” on School setup.</div>}
      {s.rows.length === 0 && SCENE[s.kind] ? (
        <div style={{ padding: '0 24px 24px' }}><EmptyState scene={SCENE[s.kind]!} label={s.kind === 'classes' ? 'Add the first class' : undefined} onAction={edit ? () => onOpen(null) : undefined} /></div>
      ) : s.rows.length === 0 ? (
        <div style={{ padding: '0 24px 24px' }}><EmptyNote icon={KIND_ICON[s.kind] ?? 'setup'} title={`No ${s.label.toLowerCase()} yet`}
          body={`${importKind(s.kind)?.blurb ?? ''} ${edit ? 'Add the first, or send Tangent your sheet from Moving in.' : 'Tangent adds them for your school.'}`} /></div>
      ) : (
        <div className="scroll-x lscroll">
          <div style={{ minWidth: 120 * cols.length }}>
            <div className="grd th" style={grid}>{cols.map((c) => <span key={c.key}>{c.label.replace(/ \(.*\)$/, '')}</span>)}</div>
            {s.rows.map((r) => {
              const cells = cols.map((c, i) => <span key={c.key} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', font: i === 0 ? '700 14px var(--fb)' : '600 13px var(--fb)', color: i === 0 ? 'var(--ink)' : 'var(--ink2)' }} data-tip={r[c.key]}>{shown(c, r[c.key] ?? '')}</span>);
              return edit
                ? <button className="rowbtn" key={r.id} onClick={() => onOpen(r)} aria-label={`Open ${nameOf(r)}`}><div className="grd rw" style={grid}>{cells}</div></button>
                : <div className="grd rw" key={r.id} style={grid}>{cells}</div>;
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function RowDialog({ section: s, row, all, onClose, onDone }: { section: SetupSection; row: Row | null; all: SetupSection[]; onClose: () => void; onDone: (msg: string, next?: SetupSection[]) => void }) {
  const app = useApp();
  const shake = useShake();
  const kind = importKind(s.kind)!;
  const years = all.find((x) => x.kind === 'years')?.rows ?? [];
  const heads = useFeeHeads();
  const start: Record<string, string> = { head: heads[0]?.value ?? '', kind: 'period', year: (years.find((y) => y.current) ?? years[years.length - 1])?.label ?? '' };
  const [f, setF] = useState<Record<string, string>>(() => Object.fromEntries(s.columns.map((c) => [c.key, row?.[c.key] ?? start[c.key] ?? ''])));
  const [err, setErr] = useState('');
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => app.api.staff.list(), enabled: s.kind === 'classes' });
  const set = (k: string) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErr(''); };
  const fail = (e: unknown) => { setErr(problem(e)._ ?? Object.values(problem(e))[0] ?? ''); shake.hit(); };
  const save = useMutation({ mutationFn: () => app.api.setup.save(s.kind, f), onSuccess: (next) => onDone(`${nameOf(f)} was saved.`, next), onError: fail });
  const remove = useMutation({ mutationFn: () => app.api.setup.remove(s.kind, row!.id), onSuccess: (next) => onDone(`${nameOf(row!)} was removed.`, next), onError: fail });
  const bill = useMutation({ mutationFn: () => app.api.setup.applyFee(row!.id), onSuccess: (r) => onDone(r.created ? `${row!.title} was added to ${r.created} students’ fees.` : 'Every student already has this fee.'), onError: fail });
  const field = (c: ImportColumn) => {
    // The columns that say which row this is stay fixed once it exists: a new name is a new row.
    const fixed = !!row && kind.matchOn.includes(c.key);
    const name = c.required || c.label.includes('(') ? c.label : `${c.label} (optional)`;
    const pick = (options: { value: string; label: string }[]) => <SelectField key={c.key} label={name} value={f[c.key] ?? ''} onChange={set(c.key)} options={options} disabled={fixed} />;
    if (c.key === 'class_teacher') return pick([{ value: '', label: 'No class teacher' }, ...(staff.data ?? []).filter((p) => p.status === 'active' && p.email).map((p) => ({ value: p.email!, label: p.name }))]);
    if (c.key === 'year' && s.kind === 'terms') return pick(years.map((y) => ({ value: y.label!, label: y.label! })));
    if (c.key === 'head') return pick(heads);
    if (c.key === 'kind') return pick(PERIOD_KINDS.map((k) => ({ value: k, label: k[0]!.toUpperCase() + k.slice(1) })));
    if (c.key === 'current') return pick([{ value: '', label: 'No' }, { value: 'yes', label: 'Yes, the year the school is in' }]);
    if (isDay(c.key)) return <DateField key={c.key} label={name} value={f[c.key] ?? ''} onChange={set(c.key)} disabled={fixed} />;
    if (isTime(c.key)) return <TimeField key={c.key} label={name} value={f[c.key] ?? ''} onChange={set(c.key)} disabled={fixed} />;
    return <Field key={c.key} label={name} value={f[c.key] ?? ''} onChange={set(c.key)} disabled={fixed} placeholder={c.example} maxLength={120} />;
  };
  const busy = save.isPending || remove.isPending || bill.isPending;
  return (
    <Dialog title={row ? nameOf(row) : `Add to ${kind.label.toLowerCase()}`} onClose={onClose} width={560} shake={shake.cls}>
      <div className="stack">
        {s.columns.map(field)}
        {row && kind.matchOn.length > 0 && <div className="help">To rename it, remove it and add it again.</div>}
        {err && <div className="emsg" role="alert">{err}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {row && <button className="btn dng" disabled={busy} onClick={() => remove.mutate()}>Remove</button>}
          {row && s.kind === 'fee_structures' && app.user.permissions.includes('fees.collect') && <button className="btn" disabled={busy} onClick={() => bill.mutate()}>{bill.isPending ? 'Adding…' : 'Add to students’ fees'}</button>}
        </span>
        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn pri" disabled={busy} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</button>
        </span>
      </div>
    </Dialog>
  );
}
