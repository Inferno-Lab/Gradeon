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
        <button type="button" className="mini" aria-label="Previous month" onClick={() => go(addMonths(at, -1))}><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path className="i" d="M15 6l-6 6 6 6"></path></svg></button>
        <b aria-live="polite">{month}</b>
        <button type="button" className="mini" aria-label="Next month" onClick={() => go(addMonths(at, 1))}><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path className="i" d="M9 6l6 6-6 6"></path></svg></button>
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

const CAL = 'M3.5 6.5h17v13h-17zM3.5 10.5h17M8 4v4M16 4v4';
const CLOCK = 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17M12 7.5V12l3 2';

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
        <svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d={CAL}></path></svg>
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
        <svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d={CLOCK}></path></svg>
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
      <button type="button" className="fic" aria-label="Decrease" disabled={disabled || (min !== undefined && Number(value) <= min)} onClick={() => bump(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d="M6 12h12"></path></svg></button>
      <button type="button" className="fic" aria-label="Increase" disabled={disabled || (max !== undefined && Number(value) >= max)} onClick={() => bump(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d="M12 6v12M6 12h12"></path></svg></button>
    </Frame>
  );
}

// ── colours ─────────────────────────────────────────────────────────────────
/** The colours a school can choose for its brand, the same everywhere they are offered. */
export const BRAND_SWATCHES: [string, string][] = [['Violet', '#6A4CF5'], ['Maroon', '#8C1D40'], ['Teal', '#0F7C86'], ['Orange', '#C2410C'], ['Blue', '#2F5BEA'], ['Green', '#1F8F5F']];
const HEX = /^#[0-9a-f]{6}$/i;

/** The brand colours as round swatches, the chosen one ringed and ticked. */
export function Swatches({ label, value, onPick, disabled, colours = BRAND_SWATCHES }: { label: string; value: string; onPick: (c: string) => void; disabled?: boolean; colours?: [string, string][] }) {
  return (
    <div className="sw5" role="radiogroup" aria-label={label}>
      {colours.map(([n, c]) => {
        const on = c.toLowerCase() === value.toLowerCase();
        return (
          <button key={c} type="button" role="radio" aria-checked={on} aria-label={n} disabled={disabled} className={on ? 'on' : ''} style={{ background: c, '--c2': c } as React.CSSProperties} onClick={() => onPick(c)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d="M5 12.5l4.5 4.5L19 7.5" style={{ strokeWidth: 2.6 }}></path></svg>
          </button>
        );
      })}
    </div>
  );
}

/** A colour: a brand swatch, or any hex typed in. The value is #RRGGBB. */
export function ColourField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);
  return (
    <div>
      <button ref={btn} type="button" className="btn" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} aria-label={`${label}: ${value}`}>
        <span style={{ width: 20, height: 20, borderRadius: '50%', background: value, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.12)' }} />
        <code>{value}</code>
      </button>
      <Pop open={open} anchor={btn} onClose={() => setOpen(false)} label={label} minWidth={260}>
        <Swatches label={label} value={value} onPick={(c) => { onChange(c); setOpen(false); btn.current?.focus(); }} />
        <div className="inp" style={{ marginTop: 12, height: 44 }}>
          <input value={hex} onChange={(e) => setHex(e.target.value)} aria-label={`${label} as hex`} placeholder="#2F5BD3" maxLength={7}
            onKeyDown={(e) => { if (e.key === 'Enter' && HEX.test(hex)) { onChange(hex.toUpperCase()); setOpen(false); btn.current?.focus(); } }}
            onBlur={() => { if (HEX.test(hex)) onChange(hex.toUpperCase()); else setHex(value); }} />
        </div>
      </Pop>
    </div>
  );
}

// ── ticks and files ─────────────────────────────────────────────────────────
/** A tick box. With `label`, the words beside it toggle it too. */
export function Checkbox({ checked, onChange, label, disabled, ...aria }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; 'aria-label'?: string }) {
  const box = (
    <button type="button" role="checkbox" aria-checked={checked} disabled={disabled} className={`cb ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)} {...aria}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d="M5 12.5l4.5 4.5L19 7.5" style={{ strokeWidth: 2.6 }}></path></svg>
    </button>
  );
  return label === undefined ? box : <label className="hwc">{box}{label}</label>;
}

/** A button that opens the file chooser (the browser's own button never shows). */
export function FilePick({ accept, onPick, className = 'btn', disabled, children }: { accept?: string; onPick: (file: File) => void; className?: string; disabled?: boolean; children: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => input.current?.click()}>{children}</button>
      <input ref={input} type="file" accept={accept} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }} />
    </>
  );
}
