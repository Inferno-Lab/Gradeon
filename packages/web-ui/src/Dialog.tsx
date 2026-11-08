import { useEffect, useId, useRef, type ReactNode } from 'react';
import { leavingProps, useLeaving, useReturnFocus } from './Presence';

export interface DialogProps {
  title: string;
  /** A small label above the title, like "Cannot be undone". */
  tag?: { text: string; tone: 'v' | 'c' | 'a' | 'g' };
  dark?: boolean;
  onClose: () => void;
  /** Applied to the card, for the vibrate on a wrong answer. */
  shake?: string;
  width?: number;
  children: ReactNode;
}

/**
 * A card over a blurred page. Escape and the backdrop close it, and focus stays inside until it does.
 * Render it inside `<Presence>` (Page's `overlays` does) and it fades out instead of vanishing.
 */
export function Dialog({ title, tag, dark, onClose, shake, width, children }: DialogProps) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const leaving = useLeaving();
  useReturnFocus(leaving);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('input,textarea,button:not(.xb),[tabindex="0"]');
    first?.focus();
    const key = (e: KeyboardEvent) => {
      if (!ref.current || ref.current.closest('[data-leaving]')) return;
      // A popup opened from the dialog (a dropdown, a calendar) takes Escape first.
      if (e.key === 'Escape' && !e.defaultPrevented) close.current();
      if (e.key !== 'Tab') return;
      const items = [...ref.current.querySelectorAll<HTMLElement>('input,textarea,button,a[href],[tabindex="0"]')].filter((x) => !x.hasAttribute('disabled'));
      if (!items.length) return;
      const a = items[0]!, z = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  return (
    <>
      <div className="scrim" onClick={leaving ? undefined : onClose} {...leavingProps(leaving)}></div>
      <div className="mod" {...leavingProps(leaving)}>
        <div ref={ref} className={`dlg ${dark ? 'dk' : ''} ${shake ?? ''}`} role="dialog" aria-modal="true" aria-labelledby={id} style={{ ...(width ? { width } : {}), maxHeight: 'calc(100dvh - 32px)', overflow: 'auto' }}>
          {tag && <span className={`chip ${tag.tone}`}>{tag.text}</span>}
          <h3 id={id}>{title}</h3>
          {children}
        </div>
      </div>
    </>
  );
}

/** A record opened beside the list: slides in from the right over a blurred page. Escape and the backdrop close it. Render it inside `<Presence>`. */
export function Panel({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const leaving = useLeaving();
  useReturnFocus(leaving);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button,[tabindex="0"]')?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented && !ref.current?.closest('[data-leaving]')) close.current(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  return (
    <>
      <div className="scrim" onClick={leaving ? undefined : onClose} {...leavingProps(leaving)}></div>
      <aside ref={ref} className="drw" role="dialog" aria-modal="true" aria-label={label} {...leavingProps(leaving)}>{children}</aside>
    </>
  );
}
