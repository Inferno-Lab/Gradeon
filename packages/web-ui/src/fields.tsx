import { Icon } from './Icon';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { addDays, istToday } from '@gradeon/contracts';
import { ErrorLine } from './forms';
import { Pop } from './Menu';
import { Select } from './Select';

// ── dates ───────────────────────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dow = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** "12 Nov 2026" for 2026-11-12, the way every date in the admin and console reads. */
export const formatDay = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : '');

/** A date as people type it: 2026-11-12, 12/11/2026, 12-11-26, 12.11.2026, 12 Nov 2026 or 12 Nov (this year). */
export function parseDay(text: string, year = Number(istToday().slice(0, 4))): string | null {
  const t = text.trim().toLowerCase();
  let y: number, m: number, d: number;
  let x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (x) [y, m, d] = [Number(x[1]), Number(x[2]), Number(x[3])];
  else if ((x = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t))) [d, m, y] = [Number(x[1]), Number(x[2]), Number(x[3]!.length === 2 ? `20${x[3]}` : x[3])];
  else if ((x = /^(\d{1,2})\s+([a-z]{3,})\.?,?(?:\s+(\d{4}))?$/.exec(t))) {
    const mi = MONTHS.findIndex((n) => x![2]!.startsWith(n.toLowerCase()));
    if (mi < 0) return null;
    [d, m, y] = [Number(x[1]), mi + 1, x[3] ? Number(x[3]) : year];
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > lastDay(y, m)) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const t = y * 12 + (m - 1) + n;
  const ny = Math.floor(t / 12), nm = (t % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(d, lastDay(ny, nm)))}`;
}

/** A month to pick a day from. Monday first; arrows move by day and week, Page Up and Down by month, Enter picks. */
export function Calendar({ value, min, max, onPick }: { value: string; min?: string; max?: string; onPick: (iso: string) => void }) {
  const today = istToday();
  const clamp = (iso: string) => (min && iso < min ? min : max && iso > max ? max : iso);
  const [at, setAt] = useState(() => clamp(value || today));
  const grid = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const first = `${at.slice(0, 7)}-01`;
  const start = addDays(first, -((dow(first) + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const off = (iso: string) => (!!min && iso < min) || (!!max && iso > max);
  useEffect(() => {
    // Focus follows the keyboard; on opening it lands on the chosen day.
    if (moved.current || !grid.current?.contains(document.activeElement)) grid.current?.querySelector<HTMLElement>(`[data-day="${at}"]`)?.focus({ preventScroll: true });
    moved.current = false;
  }, [at]);
  const go = (iso: string) => { moved.current = true; setAt(clamp(iso)); };
  const key = (e: KeyboardEvent) => {
    const step: Record<string, () => string> = {
      ArrowLeft: () => addDays(at, -1), ArrowRight: () => addDays(at, 1), ArrowUp: () => addDays(at, -7), ArrowDown: () => addDays(at, 7),
      PageUp: () => addMonths(at, -1), PageDown: () => addMonths(at, 1), Home: () => addDays(at, -((dow(at) + 6) % 7)), End: () => addDays(at, 6 - ((dow(at) + 6) % 7)),
    };
    if (step[e.key]) { e.preventDefault(); go(step[e.key]!()); }
  };
  const month = `${LONG[Number(at.slice(5, 7)) - 1]} ${at.slice(0, 4)}`;
  return (
    <div className="dpk">
      <div className="dpkh">
        <button type="button" className="mini" aria-label="Previous month" onClick={() => go(addMonths(at, -1))}><Icon name="caretLeft" size={16} /></button>
        <b aria-live="polite">{month}</b>
        <button type="button" className="mini" aria-label="Next month" onClick={() => go(addMonths(at, 1))}><Icon name="caretRight" size={16} /></button>
      </div>
      <div className="dpkw" aria-hidden="true">{['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((w) => <span key={w}>{w}</span>)}</div>
      <div className="dpkd" role="grid" aria-label={month} ref={grid} onKeyDown={key}>
        {days.map((d) => (
          <button key={d} type="button" data-day={d} tabIndex={d === at ? 0 : -1} disabled={off(d)} aria-pressed={d === value} aria-label={formatDay(d)}
            className={`${d.slice(0, 7) !== at.slice(0, 7) ? 'out' : ''} ${d === today ? 'now' : ''} ${d === value ? 'on' : ''}`}
            onClick={() => onPick(d)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!off(d)) onPick(d); } }}>
            {Number(d.slice(8))}
          </button>
        ))}
      </div>
    </div>
  );
}

interface FieldBase { label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string; disabled?: boolean }

/** The label, the box and the error or hint under it: the same frame for every field. */
function Frame({ id, label, error, hint, children, boxRef }: { id: string; label: string; error?: string; hint?: string; children: ReactNode; boxRef?: React.Ref<HTMLDivElement> }) {
  return (
    <div className="fld">
      <label htmlFor={id}>{label}</label>
      <div ref={boxRef} className={`inp ${error ? 'err shake' : ''}`}>{children}</div>
      {error ? <div id={`${id}-m`}><ErrorLine>{error}</ErrorLine></div> : hint ? <div id={`${id}-m`} className="help">{hint}</div> : null}
    </div>
  );
}

const CAL = 'calendar';
const CLOCK = 'time';

/** Typed text that turns into a value when the field is left (or Enter is pressed), and shows the value again after. */
function useTyped(value: string, show: (v: string) => string, parse: (t: string) => string | null, onChange: (v: string) => void) {
  const [text, setText] = useState(show(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setText(show(value)); }, [value, editing]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = () => {
    setEditing(false);
    if (!text.trim()) { if (value) onChange(''); return; }
    const v = parse(text);
    if (v === null) { setText(show(value)); return; }
    if (v !== value) onChange(v);
    setText(show(v));
  };
  return { text, setText, editing: () => setEditing(true), commit };
}

/**
 * A date: type it ("12 Nov", "12/11/2026") or pick it from the calendar. The value is YYYY-MM-DD.
 * `compact` is the small box for a row of a table, labelled for screen readers only.
 */
export function DateField({ label, value, onChange, error, hint, disabled, min, max, compact }: FieldBase & { min?: string; max?: string; compact?: boolean }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const inRange = (v: string | null) => (v && (!min || v >= min) && (!max || v <= max) ? v : null);
  const t = useTyped(value, formatDay, (s) => inRange(parseDay(s)), onChange);
  const inner = (
    <>
      <input id={id} aria-label={compact ? label : undefined} value={t.text} onChange={(e) => t.setText(e.target.value)} onFocus={t.editing} onBlur={t.commit} disabled={disabled} autoComplete="off"
        placeholder="e.g. 12 Nov 2026" aria-invalid={!!error} aria-describedby={error || hint ? `${id}-m` : undefined}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); t.commit(); } else if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); setOpen(true); } }} />
      <button ref={btn} type="button" className="fic" aria-label="Choose from a calendar" aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={() => setOpen((o) => !o)}>
        <Icon name={CAL} />
      </button>
      <Pop open={open} anchor={box} returnTo={btn} onClose={() => setOpen(false)} label="Calendar" minWidth={0} focus="[tabindex='0']">
        <Calendar value={value} min={min} max={max} onPick={(d) => { onChange(d); setOpen(false); btn.current?.focus(); }} />
      </Pop>
    </>
  );
  if (compact) return <div ref={box} className={`inp sm ${error ? 'err' : ''}`}>{inner}</div>;
  return <Frame id={id} label={label} error={error} hint={hint} boxRef={box}>{inner}</Frame>;
}

// ── times ───────────────────────────────────────────────────────────────────
/** A time as people type it: 8, 830, 8:30, 8.30, 8:30 pm, 20:45. The value is HH:MM. */
export function parseTime(text: string): string | null {
  const x = /^(\d{1,2})(?:[:.]?(\d{2}))?\s*(am|pm|a|p)?$/i.exec(text.trim());
  if (!x) return null;
  let h = Number(x[1]);
  const m = Number(x[2] ?? 0);
  const ap = x[3]?.toLowerCase();
  if (ap) { if (h < 1 || h > 12) return null; h = (h % 12) + (ap.startsWith('p') ? 12 : 0); }
  return h > 23 || m > 59 ? null : `${pad(h)}:${pad(m)}`;
}
const SLOTS = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`);

/** A time: type it ("8:47", "2 pm") or pick from the quarter hours. The value is HH:MM. */
export function TimeField({ label, value, onChange, error, hint, disabled }: FieldBase) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const t = useTyped(value, (v) => v, parseTime, onChange);
  const near = SLOTS.find((s) => s >= (value || '08:00')) ?? SLOTS[0];
  return (
    <Frame id={id} label={label} error={error} hint={hint} boxRef={box}>
      <input id={id} value={t.text} onChange={(e) => t.setText(e.target.value)} onFocus={t.editing} onBlur={t.commit} disabled={disabled} autoComplete="off" inputMode="numeric"
        placeholder="e.g. 08:30" aria-invalid={!!error} aria-describedby={error || hint ? `${id}-m` : undefined}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); t.commit(); } else if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); setOpen(true); } }} />
      <button ref={btn} type="button" className="fic" aria-label="Choose a time" aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen((o) => !o)}>
        <Icon name={CLOCK} />
      </button>
      <Pop open={open} anchor={box} returnTo={btn} onClose={() => setOpen(false)} role="listbox" label={label} className="popm" minWidth={0} focus={`[data-t="${near}"]`}>
        {SLOTS.map((s) => <button key={s} type="button" role="option" data-t={s} aria-selected={s === value} className={s === value ? 'on' : ''} onClick={() => { onChange(s); setOpen(false); btn.current?.focus(); }}>{s}</button>)}
      </Pop>
    </Frame>
  );
}

// ── months ──────────────────────────────────────────────────────────────────
/** A month (YYYY-MM) from the last two years and the next one. */
export function MonthField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const now = istToday();
  const options = Array.from({ length: 36 }, (_, i) => addMonths(now, 12 - i).slice(0, 7)).map((m) => ({ value: m, label: `${LONG[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}` }));
  return <Select value={value} onChange={onChange} options={options} aria-label={label} compact />;
}

// ── numbers ─────────────────────────────────────────────────────────────────
const clampNum = (v: string, min?: number, max?: number) => {
  if (v === '' || Number.isNaN(Number(v))) return v;
  return String(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, Number(v))));
};

/** A number in a small box (a cell in a row): digits only, arrow keys step, kept inside min and max. */
export function NumberInput({ value, onChange, min, max, step = 1, className = 'hws', disabled, decimals, ...aria }: { value: string; onChange: (v: string) => void; min?: number; max?: number; step?: number; className?: string; disabled?: boolean; decimals?: boolean; id?: string; 'aria-label'?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) {
  const bump = (d: number) => onChange(clampNum(String((Number(value) || 0) + d * step), min, max));
  return (
    <input className={className} value={value} disabled={disabled} inputMode={decimals ? 'decimal' : 'numeric'} autoComplete="off" {...aria}
      onChange={(e) => onChange(e.target.value.replace(decimals ? /[^\d.]/g : /\D/g, ''))}
      onBlur={() => { const c = clampNum(value, min, max); if (c !== value) onChange(c); }}
      onKeyDown={(e) => { if (e.key === 'ArrowUp') { e.preventDefault(); bump(1); } else if (e.key === 'ArrowDown') { e.preventDefault(); bump(-1); } }} />
  );
}

/** A labelled number with − and + beside it. */
export function NumberField({ label, value, onChange, error, hint, disabled, min, max, step = 1, decimals }: FieldBase & { min?: number; max?: number; step?: number; decimals?: boolean }) {
  const id = useId();
  const bump = (d: number) => onChange(clampNum(String((Number(value) || 0) + d * step), min, max));
  return (
    <Frame id={id} label={label} error={error} hint={hint}>
      <NumberInput id={id} className="" value={value} onChange={onChange} min={min} max={max} step={step} decimals={decimals} disabled={disabled} aria-invalid={!!error} aria-describedby={error || hint ? `${id}-m` : undefined} />
      <button type="button" className="fic" aria-label="Decrease" disabled={disabled || (min !== undefined && Number(value) <= min)} onClick={() => bump(-1)}><Icon name="minus" /></button>
      <button type="button" className="fic" aria-label="Increase" disabled={disabled || (max !== undefined && Number(value) >= max)} onClick={() => bump(1)}><Icon name="plus" /></button>
    </Frame>
  );
}

// ── colours ─────────────────────────────────────────────────────────────────
/** The colours a school can choose for its brand, the same everywhere they are offered. */
// ── ticks and files ─────────────────────────────────────────────────────────
/** A tick box. With `label`, the words beside it toggle it too. */
export function Checkbox({ checked, onChange, label, disabled, ...aria }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; 'aria-label'?: string }) {
  const box = (
    <button type="button" role="checkbox" aria-checked={checked} disabled={disabled} className={`cb ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)} {...aria}>
      <Icon name="check" />
    </button>
  );
  return label === undefined ? box : <label className="hwc">{box}{label}</label>;
}

/** A button that opens the file chooser (the browser's own button never shows). */
/** A button that opens the file chooser. With `multiple`, every chosen file is passed to `onPick` in turn (`onPickAll` gets them together). */
export function FilePick({ accept, onPick, onPickAll, multiple, className = 'btn', disabled, children }: { accept?: string; onPick?: (file: File) => void; onPickAll?: (files: File[]) => void; multiple?: boolean; className?: string; disabled?: boolean; children: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => input.current?.click()}>{children}</button>
      <input ref={input} type="file" accept={accept} multiple={multiple} hidden onChange={(e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = '';
        if (!files.length) return;
        if (onPickAll) onPickAll(files); else files.forEach((f) => onPick?.(f));
      }} />
    </>
  );
}
