import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { leavingProps, useExit } from './Presence';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  id?: string;
  'aria-label'?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** The small pill used for filters in a page header. */
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
}

const GAP = 6;
const EDGE = 12;
const SEARCH_AFTER = 10;

interface Box { left: number; width: number; top?: number; bottom?: number; maxH: number }

/**
 * The dropdown that replaces the browser's own. The list is drawn in a portal on the page root with fixed
 * coordinates, so no card, table or dialog can clip it; it opens upward when there is no room below, scrolls
 * inside itself, and gets a search box once it is long.
 */
export function Select({ value, onChange, options, id, disabled, invalid, compact, className, style, placeholder, ...aria }: SelectProps) {
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const listId = useId();
  const [open, setOpen] = useState(false);
  const exit = useExit(open);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const searchable = options.length > SEARCH_AFTER;
  const shown = useMemo(() => (q ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())) : options), [options, q]);
  const current = options.find((o) => o.value === value);

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - EDGE;
    const above = r.top - EDGE;
    const up = below < 240 && above > below;
    const maxH = Math.max(150, Math.min(360, (up ? above : below) - GAP));
    const width = Math.min(Math.max(r.width, 200), window.innerWidth - EDGE * 2);
    const left = Math.min(Math.max(EDGE, r.left), window.innerWidth - width - EDGE);
    setBox(up ? { left, width, bottom: window.innerHeight - r.top + GAP, maxH } : { left, width, top: r.bottom + GAP, maxH });
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    setQ('');
    if (refocus) btn.current?.focus();
  };
  const pick = (v: string) => {
    onChange(v);
    close(true);
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const idx = options.findIndex((o) => o.value === value);
    setActive(Math.max(0, idx));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !box) return; // after the list is placed and drawn, so focus can move into it
    (searchable ? pop.current?.querySelector<HTMLElement>('input') : list.current)?.focus({ preventScroll: true });
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) close(false);
    };
    const move = (e: Event) => { if (!pop.current?.contains(e.target as Node)) place(); };
    document.addEventListener('pointerdown', away, true);
    window.addEventListener('scroll', move, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      window.removeEventListener('scroll', move, true);
      window.removeEventListener('resize', place);
    };
  }, [open, !box]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, shown]);

  const step = (to: number) => setActive(Math.min(Math.max(to, 0), Math.max(shown.length - 1, 0)));

  const onPopKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); step(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(active - 1); }
    else if (e.key === 'Home') { e.preventDefault(); step(0); }
    else if (e.key === 'End') { e.preventDefault(); step(shown.length - 1); }
    else if (e.key === 'Enter' || (e.key === ' ' && !searchable)) { e.preventDefault(); const o = shown[active]; if (o) pick(o.value); }
    else if (e.key === 'Tab') close(false);
    else if (!searchable && e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      // Typing a few letters jumps to the option that starts with them, like a native list.
      const now = Date.now();
      typed.current.text = now - typed.current.at > 700 ? e.key.toLowerCase() : typed.current.text + e.key.toLowerCase();
      typed.current.at = now;
      const hit = shown.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
      if (hit >= 0) setActive(hit);
    }
  };

  const onBtnKey = (e: KeyboardEvent) => {
    if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); setOpen(true); }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); close(false); }
  };

  const root = (btn.current?.closest('.nest') as HTMLElement | null) ?? document.body;
  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-invalid={invalid || undefined}
        aria-label={aria['aria-label']}
        disabled={disabled}
        className={`sx ${compact ? 'sm' : ''} ${invalid ? 'err' : ''} ${open ? 'open' : ''} ${className ?? ''}`}
        style={style}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onBtnKey}
      >
        <span className="sxv">{current?.label ?? placeholder ?? ''}</span>
        <span className="sxc" aria-hidden="true"><svg viewBox="0 0 24 24"><path className="i" d="M7 10l5 5 5-5"></path></svg></span>
      </button>
      {exit.shown && box && createPortal(
        <div ref={pop} className="sxp" {...leavingProps(exit.leaving)} style={{ left: box.left, width: box.width, top: box.top, bottom: box.bottom, transformOrigin: box.top !== undefined ? 'top left' : 'bottom left' }} onKeyDown={onPopKey}>
          {searchable && (
            <label className="sxs">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d="M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4"></path></svg>
              <input value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder="Search" aria-label="Search the list" />
            </label>
          )}
          <div ref={list} id={listId} className="sxl" role="listbox" tabIndex={-1} style={{ maxHeight: box.maxH - (searchable ? 52 : 0) }}>
            {shown.map((o, i) => (
              <div key={o.value} role="option" aria-selected={o.value === value} data-i={i} className={`sxo ${o.value === value ? 'on' : ''} ${i === active ? 'act' : ''}`} onPointerMove={() => i !== active && setActive(i)} onClick={() => pick(o.value)}>
                <span className="sxv">{o.label}</span>
                {o.value === value && <svg className="tick" viewBox="0 0 24 24" aria-hidden="true"><path className="i" d="M5 12.5l4.5 4.5L19 7.5"></path></svg>}
              </div>
            ))}
            {shown.length === 0 && <div className="sxe">Nothing matches “{q}”.</div>}
          </div>
        </div>,
        root,
      )}
    </>
  );
}
