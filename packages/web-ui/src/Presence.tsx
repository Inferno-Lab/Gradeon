import { Children, Fragment, createContext, isValidElement, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/** What would actually render: a fragment of `{a && <X/>}{b && <Y/>}` with nothing open counts as nothing. */
const rendered = (n: ReactNode): ReactNode[] =>
  Children.toArray(n).flatMap((c) => (isValidElement<{ children?: ReactNode }>(c) && c.type === Fragment ? rendered(c.props.children) : [c]));

/** How long something stays on screen after it is closed: the longest leaving animation (`--t2`). */
export const LEAVE_MS = 200;

/** Shown while `open`, and for LEAVE_MS after, with `leaving` set so it can animate out instead of vanishing. */
export function useExit(open: boolean): { shown: boolean; leaving: boolean } {
  const [kept, setKept] = useState(open);
  useEffect(() => {
    if (open) { setKept(true); return; }
    const t = setTimeout(() => setKept(false), LEAVE_MS);
    return () => clearTimeout(t);
  }, [open]);
  return { shown: open || kept, leaving: !open && kept };
}

const Leaving = createContext(false);
/** True inside a Presence whose content has been closed: put `data-leaving` and `inert` on the overlay's own elements. */
export const useLeaving = () => useContext(Leaving);
/** Puts focus back where it was when an overlay opened, the moment it starts to leave (not after the fade). */
export function useReturnFocus(leaving: boolean): void {
  // Read while rendering, before any child's effect moves focus into the overlay.
  const [prev] = useState(() => document.activeElement);
  useEffect(() => {
    if (!leaving) return;
    const p = prev as HTMLElement | null;
    if (p?.isConnected && p !== document.body) p.focus({ preventScroll: true });
    else (document.activeElement as HTMLElement | null)?.blur();
  }, [leaving]);
}

/** The attributes an overlay element takes while it leaves. */
export const leavingProps = (leaving: boolean) => (leaving ? { 'data-leaving': '', inert: true } : {});

/**
 * Wrap a conditionally rendered overlay (`<Presence>{open && <Dialog/>}</Presence>`): when the condition goes false the
 * last content stays for a moment, marked as leaving, so dialogs, sheets and toasts close as smoothly as they open.
 */
export function Presence({ children }: { children: ReactNode }) {
  const has = rendered(children).length > 0;
  const last = useRef<ReactNode>(null);
  // Each opening is a new generation: an overlay opened while the last one is still leaving starts fresh, instead of
  // inheriting the leaving one's state (a fee dialog opened in a holiday dialog's fade kept the holiday's fields).
  const gen = useRef(0);
  const had = useRef(false);
  if (has && !had.current) gen.current += 1;
  had.current = has;
  if (has) last.current = children;
  const { shown, leaving } = useExit(has);
  if (!shown) return null;
  return <Leaving.Provider value={leaving}><Fragment key={gen.current}>{has ? children : last.current}</Fragment></Leaving.Provider>;
}
