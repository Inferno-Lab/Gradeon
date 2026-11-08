import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { leavingProps, useExit } from './Presence';

const GAP = 6;
const EDGE = 12;
const ITEMS = 'button:not(:disabled),[role=menuitem],a[href]';

interface Box { left: number; minWidth: number; top?: number; bottom?: number; maxH: number; origin: string }

/** Where a popup goes: under its button, over it when there is no room below, or beside it (`right`, for the collapsed menu). */
export function placeBy(anchor: HTMLElement, side: 'auto' | 'right', min = 220): Box {
  const r = anchor.getBoundingClientRect();
  if (side === 'right') return { left: r.right + 12, minWidth: min, bottom: window.innerHeight - r.bottom, maxH: r.bottom - EDGE, origin: 'left bottom' };
  const below = window.innerHeight - r.bottom - EDGE;
  const above = r.top - EDGE;
  const up = below < 240 && above > below;
  const maxH = Math.max(150, Math.min(360, (up ? above : below) - GAP));
  const minWidth = Math.max(r.width, min);
  const left = Math.min(Math.max(EDGE, r.left), window.innerWidth - minWidth - EDGE);
  return up ? { left, minWidth, bottom: window.innerHeight - r.top + GAP, maxH, origin: 'bottom left' } : { left, minWidth, top: r.bottom + GAP, maxH, origin: 'top left' };
}

/**
 * A menu that opens from a button: drawn on the page root with fixed coordinates so nothing clips it, grows from the button,
 * moves with the arrow keys, and closes on Escape, Tab or a click outside (and fades as it goes).
 */
export function Menu({ open, anchor, onClose, side = 'auto', label, children }: { open: boolean; anchor: RefObject<HTMLElement | null>; onClose: () => void; side?: 'auto' | 'right'; label?: string; children: ReactNode }) {
  const { shown, leaving } = useExit(open);
  if (!shown) return null;
  return <MenuPop anchor={anchor} onClose={onClose} side={side} leaving={leaving} label={label}>{children}</MenuPop>;
}

function MenuPop({ anchor, onClose, side, leaving, label, children }: { anchor: RefObject<HTMLElement | null>; onClose: () => void; side: 'auto' | 'right'; leaving: boolean; label?: string; children: ReactNode }) {
  const [box, setBox] = useState<Box | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    if (anchor.current) setBox(placeBy(anchor.current, side));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (leaving) return;
    ref.current?.querySelector<HTMLElement>(ITEMS)?.focus({ preventScroll: true });
    const place = () => { if (anchor.current) setBox(placeBy(anchor.current, side)); };
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) close.current(); };
    document.addEventListener('pointerdown', away, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [leaving]); // eslint-disable-line react-hooks/exhaustive-deps
  const key = (e: KeyboardEvent) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => { e.preventDefault(); items[(i + items.length) % items.length]?.focus(); };
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close.current(); anchor.current?.focus(); }
    else if (e.key === 'Tab') close.current();
    else if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
  };
  const root = (anchor.current?.closest('.nest') as HTMLElement | null) ?? document.body;
  if (!box) return null;
  return createPortal(
    <div ref={ref} className="popm" role="menu" aria-label={label} onKeyDown={key} {...leavingProps(leaving)}
      style={{ position: 'fixed', zIndex: 120, left: box.left, minWidth: box.minWidth, top: box.top ?? 'auto', bottom: box.bottom ?? 'auto', maxHeight: box.maxH, transformOrigin: box.origin }}>
      {children}
    </div>,
    root,
  );
}

/** A pill button that opens a menu under it: the same button and the same menu everywhere. */
export function MenuButton({ label, icon, primary, chevron, open, onOpenChange, menuLabel, children }: {
  label: ReactNode; icon?: string; primary?: boolean; chevron?: boolean; open: boolean; onOpenChange: (open: boolean) => void; menuLabel?: string; children: ReactNode;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={btn} type="button" className={`btn ${primary ? 'pri' : ''} ${chevron ? 'mbtn' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => onOpenChange(!open)}>
        {icon && <svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d={icon}></path></svg>}
        {label}
        {chevron && <svg className="cv" viewBox="0 0 24 24" aria-hidden="true"><path className="i" d="M6 9l6 6 6-6"></path></svg>}
      </button>
      <Menu open={open} anchor={btn} onClose={() => onOpenChange(false)} label={menuLabel}>{children}</Menu>
    </>
  );
}
