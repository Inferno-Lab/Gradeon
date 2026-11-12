import { Icon } from './Icon';
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
        <span style={{ width: 28, height: 28, borderRadius: 10, background: tone === 'ok' ? 'var(--ok)' : 'var(--bad)', color: tone === 'ok' ? 'var(--on-ok)' : 'var(--on-bad)', display: 'grid', placeItems: 'center', flex: 'none' }}>
          <Icon name={tone === 'ok' ? 'check' : 'close'} size={16} />
        </span>
        {text}
        {action && <button className="btn wht sm" onClick={action.onPress}>{action.label}</button>}
        {tone === 'bad' && close && <button className="xb" onClick={close} aria-label="Close"><Icon name="close" size={16} /></button>}
      </div>
    </div>
  );
}

/** The toast slot every page uses: shows `toast` while it is set and lets it fade out when it clears. */
export function ToastSlot({ toast }: { toast: ToastProps | null | undefined | false | '' }) {
  return <Presence>{toast && <Toast {...toast} />}</Presence>;
}
