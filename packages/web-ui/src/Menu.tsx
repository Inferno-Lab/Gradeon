import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { leavingProps, useExit } from './Presence';

const GAP = 6;
const EDGE = 12;
const ITEMS = 'button:not(:disabled),[role=menuitem],a[href]';

interface Box { left?: number; right?: number; minWidth: number; top?: number; bottom?: number; maxH: number; origin: string }

/** Where a popup goes: under its button, over it when there is no room below, or beside it (`right`, for the collapsed menu). */
export function placeBy(anchor: HTMLElement, side: 'auto' | 'right', min = 220): Box {
  const r = anchor.getBoundingClientRect();
  if (side === 'right') return { left: r.right + 12, minWidth: min, bottom: window.innerHeight - r.bottom, maxH: r.bottom - EDGE, origin: 'left bottom' };
  const below = window.innerHeight - r.bottom - EDGE;
  const above = r.top - EDGE;
  const up = below < 240 && above > below;
  const maxH = Math.max(150, Math.min(420, (up ? above : below) - GAP));
  const minWidth = Math.min(Math.max(r.width, min), window.innerWidth - EDGE * 2);
  // Lined up with the button's left edge, or with its right edge when that would run off the window (a button at the right).
  const fromRight = r.left + minWidth > window.innerWidth - EDGE;
  const edge = fromRight ? { right: Math.max(EDGE, window.innerWidth - r.right) } : { left: Math.max(EDGE, r.left) };
  const x = fromRight ? 'right' : 'left';
  return up ? { ...edge, minWidth, bottom: window.innerHeight - r.top + GAP, maxH, origin: `bottom ${x}` } : { ...edge, minWidth, top: r.bottom + GAP, maxH, origin: `top ${x}` };
}

export interface PopProps {
  open: boolean;
  /** What it opens from: placed against it, and clicks on it do not count as "outside". */
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** Where focus goes on Escape (the anchor if it can take focus). */
  returnTo?: RefObject<HTMLElement | null>;
  side?: 'auto' | 'right';
  /** `menu` and `listbox` move between their buttons with the arrow keys. */
  role?: 'menu' | 'listbox' | 'dialog';
  label?: string;
  className?: string;
  /** Where focus starts inside (a CSS selector); the first item by default. */
  focus?: string;
  minWidth?: number;
  children: ReactNode;
}

/**
 * Anything that opens from a button: a menu, a list of times, a calendar, swatches. Drawn on the page root with fixed
 * coordinates so nothing clips it, it grows from the button, closes on Escape, Tab or a click outside, and fades as it goes.
 */
export function Pop(props: PopProps) {
  const { shown, leaving } = useExit(props.open);
  if (!shown) return null;
  return <PopBox {...props} leaving={leaving} />;
}

function PopBox({ anchor, onClose, returnTo, side = 'auto', role = 'dialog', label, className = 'pvr', focus, minWidth, leaving, children }: PopProps & { leaving: boolean }) {
  const [box, setBox] = useState<Box | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const arrows = role !== 'dialog';
  useLayoutEffect(() => {
    if (anchor.current) setBox(placeBy(anchor.current, side, minWidth));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (leaving || !box) return;
    const start = (focus && ref.current?.querySelector<HTMLElement>(focus)) || ref.current?.querySelector<HTMLElement>(arrows ? ITEMS : 'input,button:not(:disabled)');
    start?.focus({ preventScroll: true });
    start?.scrollIntoView({ block: 'center' });
    const place = () => { if (anchor.current) setBox(placeBy(anchor.current, side, minWidth)); };
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) close.current(); };
    document.addEventListener('pointerdown', away, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [leaving, !box]); // eslint-disable-line react-hooks/exhaustive-deps
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close.current(); (returnTo ?? anchor).current?.focus(); return; }
    if (e.key === 'Tab') { close.current(); return; }
    if (!arrows) return;
    const items = [...(ref.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => { e.preventDefault(); items[(i + items.length) % items.length]?.focus(); };
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
  };
  const root = (anchor.current?.closest('.nest') as HTMLElement | null) ?? document.body;
  if (!box) return null;
  return createPortal(
    <div ref={ref} className={className} role={role} aria-label={label} onKeyDown={key} {...leavingProps(leaving)}
      style={{ position: 'fixed', zIndex: 120, left: box.left ?? 'auto', right: box.right ?? 'auto', minWidth: box.minWidth, maxWidth: `calc(100vw - ${EDGE * 2}px)`, top: box.top ?? 'auto', bottom: box.bottom ?? 'auto', maxHeight: box.maxH, transformOrigin: box.origin }}>
      {children}
    </div>,
    root,
  );
}

/** A menu of actions from a button: moves with the arrow keys. */
export function Menu({ open, anchor, onClose, side = 'auto', label, children }: { open: boolean; anchor: RefObject<HTMLElement | null>; onClose: () => void; side?: 'auto' | 'right'; label?: string; children: ReactNode }) {
  return <Pop open={open} anchor={anchor} onClose={onClose} side={side} role="menu" label={label} className="popm">{children}</Pop>;
}

/** A pill button that opens a menu under it: the same button and the same menu everywhere. */
export function MenuButton({ label, icon, primary, chevron, open, onOpenChange, menuLabel, children }: {
  label: ReactNode; icon?: string; primary?: boolean; chevron?: boolean; open: boolean; onOpenChange: (open: boolean) => void; menuLabel?: string; children: ReactNode;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={btn} type="button" className={`btn ${primary ? 'pri' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => onOpenChange(!open)}>
        {icon && <svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d={icon}></path></svg>}
        {label}
        {chevron && <svg className="cv" viewBox="0 0 24 24" aria-hidden="true"><path className="i" d="M6 9l6 6 6-6"></path></svg>}
      </button>
      <Menu open={open} anchor={btn} onClose={() => onOpenChange(false)} label={menuLabel}>{children}</Menu>
    </>
  );
}
