import { useEffect, useState } from 'react';
import { useTheme } from '@gradeon/web-ui';

/** Shown for the whole of a support session: a red frame, who is looking, the time left, and a way out. The API refuses every change. */
export function SupportBanner({ school, until, onEnd }: { school: string; until: number; onEnd: () => void }) {
  const theme = useTheme();
  const [left, setLeft] = useState(() => Math.max(0, Math.round((until - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.round((until - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [until]);
  useEffect(() => { if (left === 0) onEnd(); }, [left, onEnd]);
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div className={`nest ${theme.cls}`} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 90 }}>
      <div className="glow" aria-hidden="true"></div>
      <div className="sbar" role="status" style={{ pointerEvents: 'auto' }}>
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path className="i" d="M12 3l8 4v5c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V7z"></path></svg>
        Gradeon support in {school} · read-only<span className="c num">{mm}:{ss} left</span>
        <button onClick={onEnd}>End session</button>
      </div>
    </div>
  );
}
