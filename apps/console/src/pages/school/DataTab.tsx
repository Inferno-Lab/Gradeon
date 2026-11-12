import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ImportInputIn } from '@gradeon/api-client';
import { IMPORT_SOURCES, type ImportBatchRow, type ImportKind, type ImportPreview, type MigrationView, type SchoolDetail } from '@gradeon/contracts';
import { Dialog, EmptyCard, Field, FilePick, Select } from '@gradeon/web-ui';
import { RecordsTab } from './IntegrationsTab';
import { useApp } from '../../app/context';
import { when } from '../../app/format';

type Say = (text: string, tone?: 'ok' | 'bad') => void;
/** What is being imported: a file (CSV text or an .xlsx as a data URL), or rows typed or fixed in the grid. */
type Source = { kind: 'file'; fileName: string; content: string; uploadId?: string } | { kind: 'rows'; fileName: string; rows: Record<string, string>[]; uploadId?: string };

const SOURCES = IMPORT_SOURCES;
const SHOWN = 100;
const blank = (k: ImportKind) => Object.fromEntries(k.columns.map((c) => [c.key, '']));
const readFile = (f: File) => (/\.(csv|txt)$/i.test(f.name) ? f.text() : new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(new Error('That file could not be read.')); r.readAsDataURL(f); }));
const save = (blob: Blob, name: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };

/**
 * A school's data: Gradeon's onboarding team imports what the school sent, checks it adds up and undoes what was wrong; the
 * export of everything; leavers past retention; and, at the bottom, erasing the school.
 */
export function DataTab({ d, say, danger }: { d: SchoolDetail; say: Say; danger: React.ReactNode }) {
  const schoolId = d.id;
  const app = useApp();
  const about = useQuery({ queryKey: ['about'], queryFn: app.api.about, staleTime: Infinity });
  const [undoing, setUndoing] = useState<ImportBatchRow | null>(null);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['migration', schoolId], queryFn: () => app.api.migration.view(schoolId) });
  const can = app.can('schools.configure');
  const [kindKey, setKindKey] = useState('');
  const [job, setJob] = useState<{ src: Source | null; mapping?: Record<string, string>; rev: number }>({ src: null, rev: 0 });
  const { src, mapping } = job;
  // A new revision on every change: the query key stays small however big the file is.
  const change = (s: Source | null, m?: Record<string, string>) => setJob((j) => ({ src: s, mapping: m, rev: j.rev + 1 }));
  const [sample, setSample] = useState('300');
  const v = q.data;
  const kind = v?.kinds.find((k) => k.key === (kindKey || v.kinds[0]?.key));
  const input = (): ImportInputIn | null => (!src || !kind ? null : src.kind === 'file'
    ? { kind: kind.key, csv: src.content, fileName: src.fileName, uploadId: src.uploadId, mapping }
    : { kind: kind.key, rows: src.rows, fileName: src.fileName, uploadId: src.uploadId });
  const preview = useQuery({
    queryKey: ['import-preview', schoolId, kind?.key, job.rev], enabled: !!src && !!kind,
    queryFn: () => app.api.migration.preview(schoolId, input()!), retry: false, staleTime: Infinity, placeholderData: keepPreviousData,
  });
  const refresh = (next?: Partial<MigrationView>) => { if (next && v) qc.setQueryData(['migration', schoolId], { ...v, ...next }); void qc.invalidateQueries({ queryKey: ['migration', schoolId] }); void qc.invalidateQueries({ queryKey: ['school', schoolId] }); };
  const fail = (e: unknown) => say((e as Error).message, 'bad');
  const commit = useMutation({
    mutationFn: () => app.api.migration.commit(schoolId, input()!),
    onSuccess: (b) => { change(null); refresh(); say(`Imported ${kind!.label.toLowerCase()}: ${b.created} added, ${b.updated} updated${b.skipped ? `, ${b.skipped} left out` : ''}.`); },
    onError: fail,
  });
  const undo = useMutation({ mutationFn: (id: string) => app.api.migration.undo(schoolId, id), onSuccess: (batches) => { setUndoing(null); refresh({ batches }); say('Undone. Everything it changed is back as it was.'); }, onError: fail });
  // Setting a file aside says why: the school reads it under Moving in.
  const [asideFor, setAsideFor] = useState<string | null>(null);
  const [why, setWhy] = useState('');
  const aside = useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => app.api.migration.setAside(schoolId, id, reason), onSuccess: (uploads) => { setAsideFor(null); setWhy(''); refresh({ uploads }); }, onError: fail });
  const open = useMutation({
    mutationFn: (id: string) => app.api.migration.upload(schoolId, id),
    onSuccess: (f, id) => change({ kind: 'file', fileName: f.fileName, content: f.content, uploadId: id }),
    onError: fail,
  });
  const load = useMutation({ mutationFn: () => app.api.migration.sample(schoolId, Number(sample)), onSuccess: (batches) => { refresh({ batches }); say(`A test school of ${sample} students was imported, file by file.`); }, onError: fail });
  const exp = useMutation({ mutationFn: () => app.api.migration.exportAll(schoolId), onSuccess: (b) => save(b, `${schoolId}-export.zip`), onError: fail });
  const tpl = useMutation({ mutationFn: (k: string) => app.api.migration.template(schoolId, k), onSuccess: (blob, k) => save(blob, `${k}-template.xlsx`), onError: fail });

  if (q.isLoading) return <div className="skc" style={{ height: 420, borderRadius: 24 }} />;
  if (q.isError || !v) return <EmptyCard error title="Data" chip={{ text: 'Couldn’t load', tone: 'c' }} icon="warning" heading="The school’s data didn’t load" body={(q.error as Error)?.message ?? ''} actions={<button className="btn pri" onClick={() => void q.refetch()}>Try again</button>} />;
  const pickKind = (k: string) => { setKindKey(k); change(null); };
  return (
    <section className="grid">
      {can && kind && (
        <div className="card s12 rise">
          <div className="ch" style={{ flexWrap: 'wrap', gap: 10 }}><h2>Import</h2><span className="grow"></span><button className="btn sm" disabled={tpl.isPending} onClick={() => tpl.mutate(kind.key)}>Blank template</button></div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
            <div className="fld" style={{ flex: '1 1 240px', maxWidth: 360 }}><label htmlFor="imp-kind">What to import</label><Select id="imp-kind" value={kind.key} onChange={pickKind} options={v.kinds.map((k, i) => ({ value: k.key, label: `${i + 1}. ${k.label}` }))} /></div>
            <FilePick accept=".csv,.txt,.xlsx" onPick={(f) => void readFile(f).then((content) => change({ kind: 'file', fileName: f.name, content }), fail)}>Choose a file</FilePick>
            <button className="btn" onClick={() => change({ kind: 'rows', fileName: 'Typed in the console', rows: Array.from({ length: 5 }, () => blank(kind)) })}>Type rows</button>
          </div>
          <div className="help" style={{ marginTop: 8 }}>{kind.blurb} Import in the order of the list: each kind can refer to the ones above it. A second import of the same rows updates them instead of adding them again.</div>
          {src && <PreviewPanel kind={kind} src={src} preview={preview.data} loading={preview.isFetching} error={preview.isError ? (preview.error as Error).message : ''}
            onMap={(m) => change(src, m)} onRows={(rows) => change({ kind: 'rows', fileName: src.fileName, rows, uploadId: src.uploadId })}
            onCancel={() => change(null)} onCommit={() => commit.mutate()} committing={commit.isPending} />}
        </div>
      )}

      <div className="card s12 rise">
        <div className="ch"><h2>Imports</h2><span className="chip">{v.batches.length}</span></div>
        <div className="help">Each import is one batch. The newest can be undone for 30 days; undo the newer ones first to go further back.</div>
        {v.batches.length === 0 ? <div className="help" style={{ marginTop: 10 }}>Nothing imported yet.</div> : v.batches.map((b) => <BatchRow key={b.id} b={b} kinds={v.kinds} canUndo={can && b.canUndo} busy={undo.isPending} onUndo={() => setUndoing(b)} />)}
        {undoing && (
          <Dialog title="Undo this import?" tag={{ text: v.kinds.find((k) => k.key === undoing.kind)?.label ?? undoing.kind, tone: 'a' }} onClose={() => setUndoing(null)} width={460}>
            <p style={{ marginTop: 0 }}>The {undoing.created} {undoing.created === 1 ? 'record it added is' : 'records it added are'} removed and the {undoing.updated} it updated go back to how they were. Anything added since that depends on them is refused first.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn" onClick={() => setUndoing(null)}>Keep it</button>
              <button className="btn dngf" disabled={undo.isPending} onClick={() => undo.mutate(undoing.id)}>Undo {undoing.created + undoing.updated} rows</button>
            </div>
          </Dialog>
        )}
      </div>

      <div className="card s12 rise">
        <div className="ch"><h2>Files from the school</h2><span className="chip">{v.uploads.filter((u) => u.status === 'new').length} waiting</span></div>
        <div className="help">What the school sent from its admin (Moving in). Open one to import it; set aside what is not for importing.</div>
        {v.uploads.length === 0 ? <div className="help" style={{ marginTop: 10 }}>No files yet.</div> : v.uploads.map((u) => (
          <div key={u.id} className="rw" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 8, height: 'auto', padding: '10px 0', cursor: 'default' }}>
            <span style={{ minWidth: 0, flex: '1 1 220px' }}><b style={{ font: '700 14px var(--fb)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-tip={u.fileName}>{u.fileName}</b><small style={{ color: 'var(--ink3)', font: '600 12px var(--fb)' }}>{u.note || (u.rows ? `${u.rows} rows` : 'Read by eye')}</small></span>
            <span style={{ color: 'var(--ink2)', font: '600 13px var(--fb)' }}>{u.uploadedBy} · {when(u.at)}{u.status === 'set_aside' && u.setAsideReason ? ` · set aside: ${u.setAsideReason}` : ''}</span>
            {asideFor === u.id && (
              <span style={{ flex: '1 1 100%', display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <span style={{ flex: '1 1 260px' }}><Field label="Why (the school reads this)" value={why} onChange={setWhy} maxLength={200} placeholder="This is last year's list; send this year's" /></span>
                <button className="btn sm pri" disabled={aside.isPending || why.trim().length < 3} onClick={() => aside.mutate({ id: u.id, reason: why.trim() })}>Set aside</button>
                <button className="btn sm" onClick={() => setAsideFor(null)}>Cancel</button>
              </span>
            )}
            <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>
              {u.status === 'imported' ? <span className="chip g">Imported</span> : <>
                {can && /\.(csv|txt|xlsx)$/i.test(u.fileName) && <button className="btn sm" disabled={open.isPending} onClick={() => open.mutate(u.id)}>Open</button>}
                {can && <button className="btn sm" disabled={aside.isPending} onClick={() => (u.status === 'set_aside' ? aside.mutate({ id: u.id, reason: '' }) : setAsideFor(u.id))}>{u.status === 'set_aside' ? 'Bring back' : 'Set aside'}</button>}
              </>}
              <button className="btn sm" onClick={() => void app.api.migration.upload(schoolId, u.id).then((f) => save(f.content.startsWith('data:') ? dataBlob(f.content) : new Blob([f.content], { type: 'text/csv' }), f.fileName), fail)}>Download</button>
            </span>
          </div>
        ))}
      </div>

      {can && (
        <div className="card s12 rise">
          <div className="ch"><h2>{about.data?.demos && v.students === 0 ? 'Test school and export' : 'Export'}</h2></div>
          {about.data?.demos && v.students === 0 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ width: 200 }}><Field label="Students (10 to 3,000)" value={sample} onChange={(x) => setSample(x.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" /></div>
              <button className="btn" disabled={load.isPending || Number(sample) < 10 || Number(sample) > 3000} onClick={() => load.mutate()}>{load.isPending ? 'Importing…' : 'Load a realistic test school'}</button>
            </div>
          )}
          <div className="help">{about.data?.demos && v.students === 0 ? 'The test school goes through the same importer, file by file, so it can be undone like any import. Only for a school with no students. ' : ''}The export is every kind of record in the import templates: what the school takes with it if it leaves.</div>
          <div style={{ marginTop: 12 }}><button className="btn" disabled={exp.isPending} onClick={() => exp.mutate()}>{exp.isPending ? 'Preparing…' : 'Export everything'}</button></div>
        </div>
      )}

      <RecordsTab d={d} say={say} />
      {danger}
    </section>
  );
}

function dataBlob(url: string): Blob {
  const [head, body] = url.split(',');
  const bin = atob(body ?? '');
  return new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))], { type: /data:([^;]+)/.exec(head ?? '')?.[1] ?? 'application/octet-stream' });
}

function BatchRow({ b, kinds, canUndo, busy, onUndo }: { b: ImportBatchRow; kinds: ImportKind[]; canUndo: boolean; busy: boolean; onUndo: () => void }) {
  return (
    <div className="rw" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', columnGap: 16, rowGap: 8, height: 'auto', padding: '12px 0', cursor: 'default' }}>
      <span style={{ minWidth: 0, flex: '1 1 260px' }}>
        <b style={{ font: '700 14px var(--fb)' }}>{kinds.find((k) => k.key === b.kind)?.label ?? b.kind}</b>
        <small style={{ display: 'block', color: 'var(--ink3)', font: '600 12px var(--fb)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.fileName || 'Typed'} · {SOURCES[b.source] ?? b.source} · {b.byName} · {when(b.at)}</small>
        {b.notes.map((n) => <small key={n} style={{ display: 'block', color: 'var(--warn)', font: '600 12px var(--fb)', marginTop: 4 }}>{n}</small>)}
      </span>
      <span className="tgrow" style={{ gap: 6, flex: '1 1 260px' }}>
        <span className="chip g">{b.created} added</span><span className="chip">{b.updated} updated</span>{b.skipped > 0 && <span className="chip a">{b.skipped} left out</span>}
        {b.totals.map((t) => <span key={t.label} className="chip">{t.label}: {t.value}</span>)}
      </span>
      <span>{b.undoneAt ? <span className="chip">Undone</span> : canUndo ? <button className="btn sm" disabled={busy} onClick={onUndo}>Undo</button> : null}</span>
    </div>
  );
}

function PreviewPanel({ kind, src, preview: p, loading, error, onMap, onRows, onCancel, onCommit, committing }: {
  kind: ImportKind; src: Source; preview: ImportPreview | undefined; loading: boolean; error: string;
  onMap: (m: Record<string, string>) => void; onRows: (rows: Record<string, string>[]) => void; onCancel: () => void; onCommit: () => void; committing: boolean;
}) {
  const [onlyBad, setOnlyBad] = useState(true);
  const rows = useMemo(() => (p?.rows ?? []).map((r, i) => ({ ...r, i })), [p]);
  const bad = rows.filter((r) => r.errors.length);
  const shown = (onlyBad && bad.length ? bad : rows).slice(0, SHOWN);
  const options = [{ value: '', label: 'Leave out' }, ...kind.columns.map((c) => ({ value: c.key, label: `${c.label}${c.required ? ' *' : ''}` }))];
  // Fixing a cell turns the file into typed rows (already matched to the columns), checked again on every change.
  const edit = (i: number, key: string, value: string) => onRows(rows.map((r) => (r.i === i ? { ...r.values, [key]: value } : r.values)));
  const addRow = () => onRows([...(src.kind === 'rows' ? src.rows : rows.map((r) => r.values)), blank(kind)]);
  const grid = { '--cols': `56px ${kind.columns.map(() => 'minmax(110px,1fr)').join(' ')} minmax(160px,1.4fr)` } as React.CSSProperties;
  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <b style={{ font: '700 15px var(--fb)' }}>{src.fileName}</b>
        {p && <span className="chip v">{SOURCES[p.source] ?? p.source}</span>}
        {loading && <span className="chip">Checking…</span>}
      </div>
      {error && <div className="emsg" role="alert" style={{ marginTop: 10 }}>{error}</div>}
      {p && src.kind === 'file' && (
        <div style={{ marginTop: 12 }}>
          <div className="lbl" style={{ marginBottom: 6 }}>Columns in the file</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
            {p.headers.map((h) => (
              <div className="fld" key={h}><label htmlFor={`map-${h}`} data-tip={h} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h || '(no heading)'}</label>
                <Select id={`map-${h}`} compact value={p.mapping[h] ?? ''} onChange={(val) => onMap({ ...p.mapping, [h]: val })} options={options} /></div>
            ))}
          </div>
          {p.missing.length > 0 && <div className="emsg" role="alert" style={{ marginTop: 10 }}>Match a column to {p.missing.join(', ')}: these are needed.</div>}
        </div>
      )}
      {p && (
        <>
          <div className="tgrow" style={{ gap: 6, marginTop: 12 }}>
            <span className="chip g">{p.counts.create} to add</span><span className="chip">{p.counts.update} to update</span>
            <span className={`chip ${p.counts.skip ? 'c' : ''}`}>{p.counts.skip} with problems</span>
            {p.totals.map((t) => <span key={t.label} className="chip">{t.label}: {t.value}</span>)}
          </div>
          {rows.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                {bad.length > 0 && <button className="btn sm" onClick={() => setOnlyBad(!onlyBad)}>{onlyBad ? `Show every row` : `Show only the ${bad.length} with problems`}</button>}
                {rows.length > SHOWN && <span className="help">Showing {shown.length} of {(onlyBad && bad.length ? bad : rows).length}.</span>}
                {src.kind === 'rows' && <button className="btn sm" onClick={addRow}>Add a row</button>}
              </div>
              <div className="scroll-x lscroll" style={{ marginTop: 8 }}>
                <div style={{ minWidth: 56 + kind.columns.length * 120 + 180 }}>
                  <div className="grd th" style={grid}><span>Line</span>{kind.columns.map((c) => <span key={c.key}>{c.label}</span>)}<span>Problem</span></div>
                  {shown.map((r) => (
                    <div key={r.i} className="grd rw" style={{ ...grid, height: 'auto', padding: '6px 0', gap: 6 }}>
                      <span style={{ font: '700 12px var(--fb)', color: 'var(--ink3)' }}>{r.line}</span>
                      {kind.columns.map((c) => <input key={c.key} className={`hws ${r.errors.length && c.required && !r.values[c.key] ? 'bad' : ''}`} style={{ width: '100%', textAlign: 'left' }} aria-label={`Line ${r.line}, ${c.label}`} placeholder={c.example} defaultValue={r.values[c.key] ?? ''}
                        onBlur={(e) => { if (e.target.value !== (r.values[c.key] ?? '')) edit(r.i, c.key, e.target.value); }} />)}
                      <span style={{ font: '600 12px var(--fb)', color: r.errors.length ? 'var(--bad)' : 'var(--ok)' }}>{r.errors.length ? r.errors.join(' ') : r.action === 'update' ? 'Updates what is there' : 'New'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn pri" disabled={!p || loading || committing || p.missing.length > 0 || p.counts.create + p.counts.update === 0} onClick={onCommit}>
          {committing ? 'Importing…' : p ? `Import ${p.counts.create + p.counts.update} rows${p.counts.skip ? `, leave out ${p.counts.skip}` : ''}` : 'Import'}
        </button>
      </div>
    </div>
  );
}
