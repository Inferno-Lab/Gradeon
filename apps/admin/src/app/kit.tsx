import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Field, FilePick, tintFor } from '@gradeon/web-ui';
import { useApp } from './context';
import { HttpError } from '@gradeon/api-client';

export const Ico = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d={d}></path></svg>;
export const PLUS = 'M12 5v14M5 12h14';

/** The page's one dark action button, with a plus. */
export function AddBtn({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button className="btn pri" onClick={onClick}><Ico d={PLUS} />{children}</button>;
}

export function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const t = tintFor(name);
  return <span className="av" style={{ width: size, height: size, fontSize: Math.round(size * 0.33), background: t.bg, color: t.fg, boxShadow: 'none', flex: 'none' }}>{name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>;
}

/** A multi-line input in the same box as Field. */
export function AreaField({ label, value, onChange, error, rows = 4, ...rest }: { label: string; value: string; onChange: (v: string) => void; error?: string; rows?: number; maxLength?: number; placeholder?: string }) {
  const id = `ta-${label.replace(/\W+/g, '')}`;
  return (
    <div className="fld">
      <label htmlFor={id}>{label}</label>
      <div className={`inp ${error ? 'err shake' : ''}`} style={{ height: 'auto', alignItems: 'stretch' }}>
        <textarea id={id} className="ta" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} style={{ padding: '12px 0', resize: 'vertical', width: '100%', font: '500 15px/1.5 var(--fb)' }} {...rest} />
      </div>
      {error && <div className="emsg" role="alert">{error}</div>}
    </div>
  );
}

/** What a failed call says, split into field messages when the server named fields. */
export function problem(e: unknown): Record<string, string> {
  if (e instanceof HttpError && Object.keys(e.fields).length) return e.fields;
  return { _: (e as Error).message || 'Something went wrong. Try again.' };
}

export const dateLabel = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const stamp = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

/** Find a student by name or admission number; the choice shows as a chip that clears with a click. */
export function StudentPick({ label, value, onChange, error }: { label: string; value: { id: string; name: string; className: string } | null; onChange: (s: { id: string; name: string; className: string } | null) => void; error?: string }) {
  const app = useApp();
  const [q, setQ] = useState('');
  const found = useQuery({ queryKey: ['student-pick', q], queryFn: () => app.api.students.list({ query: q, limit: 6 }), enabled: q.trim().length >= 2, staleTime: 30_000 });
  if (value) {
    return (
      <div className="fld">
        <label>{label}</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="chip v">{value.name} · {value.className}</span>
          <button type="button" className="btn sm" onClick={() => onChange(null)}>Change</button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <Field label={label} value={q} onChange={setQ} error={error} placeholder="Type a name or admission number" icon={SEARCH} autoComplete="off" />
      {q.trim().length >= 2 && (
        <div className="tgrow" style={{ marginTop: 8 }}>
          {(found.data?.items ?? []).map((s) => <button key={s.id} type="button" className="chip" onClick={() => { onChange({ id: s.id, name: s.name, className: s.className }); setQ(''); }}>{s.name} · {s.className}</button>)}
          {found.data && !found.data.items.length && <span className="help">No student matches.</span>}
        </div>
      )}
    </div>
  );
}

/** Opens a PDF the API makes (a receipt, a report card) in a new tab. */
export async function openPdf(blob: Promise<Blob>): Promise<void> {
  const url = URL.createObjectURL(await blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const SEARCH = 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM20 20l-4-4';

/** Files to attach to something not saved yet: picked here, uploaded once it exists (images or PDFs, up to 15 MB each). */
export function Attach({ files, onChange, max = 3 }: { files: File[]; onChange: (f: File[]) => void; max?: number }) {
  const [err, setErr] = useState('');
  const pick = (f: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(f.type)) return setErr('Attach a PDF or a photo (JPEG, PNG, WebP).');
    if (f.size > 15 * 1024 * 1024) return setErr('That file is over 15 MB.');
    setErr('');
    onChange([...files, f]);
  };
  return (
    <div className="fld">
      <label>Attachments (optional)</label>
      <div className="tgrow">
        {files.map((f, i) => <button key={`${f.name}${i}`} type="button" className="chip v" data-tip="Remove" onClick={() => onChange(files.filter((_, j) => j !== i))}>{f.name} ×</button>)}
        {files.length < max && <FilePick accept="application/pdf,image/jpeg,image/png,image/webp" className="btn sm" onPick={pick}>Attach a file</FilePick>}
      </div>
      {err && <div className="emsg" role="alert">{err}</div>}
    </div>
  );
}
