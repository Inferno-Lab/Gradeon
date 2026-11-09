import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** The words for an element: its own data-tip, or for a usage bar (a label, a number and a bar) what that row says. */
function tipText(el: HTMLElement): string | null {
  if (el.dataset.tip) return el.dataset.tip;
  if (!el.matches('.us')) return null;
  const r = el.querySelector('.r');
  const label = r?.firstChild?.textContent?.trim();
  const value = r?.querySelector('b')?.textContent?.trim();
  if (label && value) return `${label}\n${value}`;
  return el.textContent?.trim().replace(/\s+/g, ' ') || null;
}

interface Shown { text: string; x: number; y: number; below: boolean; side: boolean; root: HTMLElement }

/**
 * One tooltip for the whole page. Anything with `data-tip="First line\nmore"` shows it on hover or keyboard focus,
 * above the element (or `data-tip-side="right"` beside it). Charts, bars and the collapsed menu use it, so a number
 * never has to be read off an axis.
 */
export function Tooltips() {
  const [shown, setShown] = useState<Shown | null>(null);
  const cur = useRef<HTMLElement | null>(null);
  const [fit, setFit] = useState<{ dx: number } | null>(null);
  const tip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let wait = 0;
    let lastShown = 0;
    const show = (el: HTMLElement) => {
      const text = tipText(el);
      const root = el.closest<HTMLElement>('.nest');
      if (!text || !root) return;
      // A tip that only repeats the element's own words is for text cut off by its cell: none when it all shows,
      // and a short wait first (instant when moving between neighbours), so a table does not flicker under the mouse.
      if (text === el.textContent?.trim()) {
        if (el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1) return;
        if (performance.now() - lastShown > 300 && !wait) {
          cur.current = el;
          wait = window.setTimeout(() => { wait = 0; if (cur.current === el) place(el, text, root); }, 400);
          return;
        }
      }
      place(el, text, root);
    };
    let visible = false;
    const place = (el: HTMLElement, text: string, root: HTMLElement) => {
      cur.current = el;
      visible = true;
      const r = el.getBoundingClientRect();
      setFit(null);
      if (el.dataset.tipSide === 'right') setShown({ text, x: r.right + 10, y: r.top + r.height / 2, below: false, side: true, root });
      else setShown({ text, x: r.left + r.width / 2, y: r.top < 80 ? r.bottom : r.top, below: r.top < 80, side: false, root });
    };
    const hide = () => {
      clearTimeout(wait);
      wait = 0;
      if (visible) lastShown = performance.now();
      visible = false;
      if (cur.current) { cur.current = null; setShown(null); setFit(null); }
    };
    // Rows sliding under a still mouse while a list scrolls would open and close a tooltip on every frame; wait until scrolling stops.
    let still = 0;
    const scrolled = () => { still = performance.now() + 160; hide(); };
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || performance.now() < still) return;
      const el = (e.target as Element).closest?.<HTMLElement>('[data-tip], .us') ?? null;
      if (el === cur.current) return;
      if (el) show(el); else hide();
    };
    const focus = (e: FocusEvent) => { const el = (e.target as Element).closest?.<HTMLElement>('[data-tip], .us'); if (el) show(el); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    document.addEventListener('pointerover', over);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', hide);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', scrolled, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerover', over);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', scrolled, true);
    };
  }, []);

  // Keep the bubble inside the window: nudge it sideways when it would run off an edge.
  useEffect(() => {
    if (!shown || !tip.current) return;
    const r = tip.current.getBoundingClientRect();
    const dx = r.left < 8 ? 8 - r.left : r.right > window.innerWidth - 8 ? window.innerWidth - 8 - r.right : 0;
    if (dx) setFit({ dx });
  }, [shown]);

  if (!shown) return null;
  const [head, ...rest] = shown.text.split('\n');
  return createPortal(
    <div ref={tip} className={`tipx ${shown.side ? 'rt' : shown.below ? 'bl' : ''}`} role="tooltip" style={{ left: shown.x + (fit?.dx ?? 0), top: shown.y }}>
      <b>{head}</b>
      {rest.length > 0 && <span>{rest.join('\n')}</span>}
    </div>,
    shown.root,
  );
}
