import type { ReactNode } from 'react';
import { Presence, leavingProps, useLeaving } from './Presence';

export interface ToastProps {
  text: ReactNode;
  tone?: 'ok' | 'bad';
  /** One button on the toast, such as Undo. */
  action?: { label: string; onPress: () => void };
}

/** The dark pill that confirms something happened, in one line at the bottom of the window. */
export function Toast({ text, tone = 'ok', action }: ToastProps) {
  const leaving = useLeaving();
  return (
    <div className="toasts">
      <div className="toast" role="status" {...leavingProps(leaving)}>
        <span style={{ width: 30, height: 30, borderRadius: '50%', background: tone === 'ok' ? 'var(--g)' : 'var(--c)', display: 'grid', placeItems: 'center', flex: 'none' }}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path className="i" d={tone === 'ok' ? 'M5 12.5l4.5 4.5L19 7.5' : 'M7 7l10 10M17 7 7 17'} style={{ stroke: 'currentColor', strokeWidth: 2.6 }}></path>
          </svg>
        </span>
        {text}
        {action && <button className="btn wht sm" onClick={action.onPress}>{action.label}</button>}
      </div>
    </div>
  );
}

/** The toast slot every page uses: shows `toast` while it is set and lets it fade out when it clears. */
export function ToastSlot({ toast }: { toast: ToastProps | null | undefined | false | '' }) {
  return <Presence>{toast && <Toast {...toast} />}</Presence>;
}
