import { useEffect, useRef, useState } from 'react';
import { leavingProps, useLeaving, useReturnFocus } from './Presence';
import './palette.css';

export interface PaletteHit {
  group: string;
  title: string;
  hint: string;
  href: string;
  keys?: string;
}

const ICON: Record<string, string> = {
  People: 'M8 8a4 4 0 1 0 8 0a4 4 0 1 0-8 0M4.5 20c.9-3.8 3.9-6 7.5-6s6.6 2.2 7.5 6',
  'Go to': 'M3 6h18M3 12h18M3 18h18M9 3v18M15 3v18',
  Actions: 'M13 3 5 13h6l-1 8 8-10h-6z',
  Schools: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
};

export interface PaletteProps {
  hits: PaletteHit[];
  query: string;
  onQuery: (q: string) => void;
  onPick: (hit: PaletteHit) => void;
  onClose: () => void;
  placeholder?: string;
  empty?: string;
}

/** Search and commands in one box. Arrow keys move, Enter opens, Escape closes. */
export function Palette({ hits, query, onQuery, onPick, onClose, placeholder = 'Search people, money, notices, settings', empty }: PaletteProps) {
  const [at, setAt] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => setAt(0), [hits]);
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setAt((i) => Math.min(hits.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && hits[at]) onPick(hits[at]!);
  };
  return (
    <div className="pal" role="dialog" aria-modal="true" aria-label="Search and commands" onKeyDown={key}>
      <div className="pin">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d="M4.5 11a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0M20 20l-4.2-4.2"></path></svg>
        <input ref={ref} value={query} onChange={(e) => onQuery(e.target.value)} placeholder={placeholder} aria-label="Search" />
        <span className="kbd">Esc</span>
      </div>
      {hits.map((p, i) => (
        <div key={`${p.group}-${p.href}-${i}`} style={{ display: 'contents' }}>
          {(i === 0 || hits[i - 1]!.group !== p.group) && <div className="pg">{p.group}</div>}
          <button className={`po ${i === at ? 'act' : ''}`} onMouseEnter={() => setAt(i)} onClick={() => onPick(p)}>
            <span className="pic"><svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d={ICON[p.group] ?? ICON.Actions}></path></svg></span>
            {p.title}
            <small>{p.keys ?? p.hint}</small>
          </button>
        </div>
      ))}
      {hits.length === 0 && <div className="none">{empty ?? `No matches for “${query}”.`}</div>}
      <div className="pf"><span>↑ ↓ move</span><span>Enter opens</span><span style={{ marginLeft: 'auto' }}>Ctrl K anywhere</span></div>
    </div>
  );
}

/**
 * The search box over the page: Ctrl K, / or the search field open it. It sits 18% from the top in a layer that does not
 * move it, so it opens in place. Render it inside `<Presence>` so it fades out too.
 */
export function SearchDialog(props: PaletteProps) {
  const leaving = useLeaving();
  useReturnFocus(leaving);
  return (
    <>
      <div className="scrim" onClick={leaving ? undefined : props.onClose} {...leavingProps(leaving)}></div>
      <div className="mod top" {...leavingProps(leaving)}>
        <div style={{ width: 'min(560px, 100%)' }}><Palette {...props} /></div>
      </div>
    </>
  );
}
