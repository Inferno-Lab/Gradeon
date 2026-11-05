import type { ReactNode } from 'react';
import { tintFor } from '@gradeon/web-ui';
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
