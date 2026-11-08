import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Presence, leavingProps, useLeaving } from './Presence';

export interface ToastProps {
  text: ReactNode;
  tone?: 'ok' | 'bad';
  /** One button on the toast, such as Undo. */
  action?: { label: string; onPress: () => void };
  /** Set by useToast: the pointer over the toast holds it; an error has a close button. */
  hold?: (on: boolean) => void;
  close?: () => void;
}

/** How long a toast stays: a confirmation 4 s, one with an action 6 s. An error stays until it is closed. */
export const TOAST_MS = 4000;
export const TOAST_ACTION_MS = 6000;

/** `say("Saved")` shows a toast; `say("Couldn’t save", 'bad')` one that waits to be closed. Timers stop with the page. */
export function useToast(): { toast: ToastProps | null; say: (text: ReactNode, tone?: 'ok' | 'bad', action?: ToastProps['action']) => void; clear: () => void } {
  const [toast, setToast] = useState<ToastProps | null>(null);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ms = useRef(0);
  useEffect(() => () => clearTimeout(t.current), []);
  const clear = useCallback(() => { clearTimeout(t.current); setToast(null); }, []);
  const arm = useCallback(() => { clearTimeout(t.current); if (ms.current) t.current = setTimeout(() => setToast(null), ms.current); }, []);
  const say = useCallback((text: ReactNode, tone: 'ok' | 'bad' = 'ok', action?: ToastProps['action']) => {
    ms.current = tone === 'bad' ? 0 : action ? TOAST_ACTION_MS : TOAST_MS;
    setToast({ text, tone, action, hold: (on) => (on ? clearTimeout(t.current) : arm()), close: clear });
    arm();
  }, [arm, clear]);
  return { toast, say, clear };
}

/** The dark pill that confirms something happened, in one line at the bottom of the window. */
export function Toast({ text, tone = 'ok', action, hold, close }: ToastProps) {
  const leaving = useLeaving();
  return (
    <div className="toasts">
      <div className="toast" role={tone === 'bad' ? 'alert' : 'status'} {...leavingProps(leaving)} onPointerEnter={() => hold?.(true)} onPointerLeave={() => hold?.(false)}>
        <span style={{ width: 30, height: 30, borderRadius: '50%', background: tone === 'ok' ? 'var(--g)' : 'var(--c)', display: 'grid', placeItems: 'center', flex: 'none' }}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path className="i" d={tone === 'ok' ? 'M5 12.5l4.5 4.5L19 7.5' : 'M7 7l10 10M17 7 7 17'} style={{ stroke: 'currentColor', strokeWidth: 2.6 }}></path>
          </svg>
        </span>
        {text}
        {action && <button className="btn wht sm" onClick={action.onPress}>{action.label}</button>}
        {tone === 'bad' && close && <button className="xb" onClick={close} aria-label="Close"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path className="i" d="M7 7l10 10M17 7 7 17"></path></svg></button>}
      </div>
    </div>
  );
}

/** The toast slot every page uses: shows `toast` while it is set and lets it fade out when it clears. */
export function ToastSlot({ toast }: { toast: ToastProps | null | undefined | false | '' }) {
  return <Presence>{toast && <Toast {...toast} />}</Presence>;
}
