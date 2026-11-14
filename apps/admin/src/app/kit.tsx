import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Field, FilePick, tintFor, Icon, type IconName } from '@tangent/web-ui';
import { useApp } from './context';
import { HttpError } from '@tangent/api-client';

export const Ico = ({ d }: { d: IconName }) => <Icon name={d} />;
export const PLUS = 'plus';

/** The page's one dark action button, with a plus. */
export function AddBtn({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button className="btn pri" onClick={onClick}><Ico d={PLUS} />{children}</button>;
}

export function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const t = tintFor(name);
  return <span className="av" style={{ width: size, height: size, fontSize: Math.round(size * 0.33), background: t.bg, color: t.fg, boxShadow: 'none', flex: 'none' }}>{name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>;
}

/** The shared multi-line field (web-ui), kept importable from here. */
export { AreaField } from '@tangent/web-ui';

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

export const SEARCH = 'search';

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

/** The school's own fee heads, for every place that picks or filters a kind of fee. */
export function useFeeHeads(): { value: string; label: string }[] {
  const { api } = useApp();
  const q = useQuery({ queryKey: ['fee-heads'], queryFn: api.fees.heads, staleTime: 5 * 60_000 });
  return (q.data ?? []).map((h) => ({ value: h.key, label: h.name }));
}

/** The school's configuration as the console set it (its lists and rules), shared by every page. */
export function useSchoolConfig() {
  const { api } = useApp();
  return useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: 60_000 }).data;
}

/** A setting's value from the school's configuration, or the fallback while it loads. */
export function useSetting<T>(key: string, fallback: T): T {
  const cfg = useSchoolConfig();
  return (cfg?.settings[key] as T | undefined) ?? fallback;
}

/** The grades the school teaches, from its classes, each named the way its classes are ("Grade 8", or "Nursery"). */
export function useGrades(): { value: string; label: string }[] {
  const { api } = useApp();
  const q = useQuery({ queryKey: ['classes'], queryFn: api.classes, staleTime: 5 * 60_000 });
  const seen = new Map<number, string>();
  for (const c of q.data ?? []) if (!seen.has(c.grade)) seen.set(c.grade, c.section && c.name.endsWith(c.section) ? c.name.slice(0, -c.section.length).trim() : c.name);
  return [...seen].sort((a, b) => a[0] - b[0]).map(([g, name]) => ({ value: String(g), label: /^\d+$/.test(name) ? `Grade ${name}` : name }));
}

/** The record a page has open, kept in the address (`?open=<id>`), so a link, a reload or a bookmark lands on it. */
export function useOpenParam(key = 'open'): [string | null, (id: string | null) => void] {
  const [open, setOpen] = useState<string | null>(() => new URLSearchParams(window.location.search).get(key));
  const set = (id: string | null) => {
    setOpen(id);
    const q = new URLSearchParams(window.location.search);
    if (id) q.set(key, id); else q.delete(key);
    history.replaceState(null, '', `${window.location.pathname}${q.size ? `?${q}` : ''}`);
  };
  return [open, set];
}

/** A form's field errors and its message, from an API error. */
export const fieldsOf = (e: unknown): Record<string, string> => (e instanceof HttpError ? e.fields : {});
export const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');

/** Cancel and the form's submit button, at the foot of a dialog's form. */
export function DialogActions({ onClose, busy, label, danger }: { onClose: () => void; busy: boolean; label: string; danger?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
      <button type="button" className="btn" onClick={onClose}>Cancel</button>
      <button type="submit" className={`btn ${danger ? 'dngf' : 'pri'}`} disabled={busy}>{busy && <span className="spin" aria-hidden="true" />}{label}</button>
    </div>
  );
}
