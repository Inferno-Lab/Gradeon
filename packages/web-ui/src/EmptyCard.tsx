import type { ReactNode } from 'react';
import { Illustration, type Scene } from './illustrations/Illustration';
import './empty.css';

export interface EmptyCardProps {
  /** The name of the thing that is empty, shown in the card's header. */
  title: string;
  chip?: { text: string; tone: 'v' | 'c' | 'a' | 'g' };
  scene: Scene;
  heading: string;
  body: string;
  actions?: ReactNode;
  error?: boolean;
  children?: ReactNode;
}

/** An empty list, an empty search or an error: an illustration, one honest sentence and the next step. Never a blank table. */
export function EmptyCard({ title, chip, scene, heading, body, actions, error, children }: EmptyCardProps) {
  return (
    <article className={`es ${error ? 'es-err' : ''}`}>
      <div className="eh"><b>{title}</b>{chip && <span className={`chip ${chip.tone}`}>{chip.text}</span>}<span className="ghost"></span></div>
      <div className="eb">
        <div className="art"><Illustration scene={scene} /></div>
        <h3>{heading}</h3>
        <p>{body}</p>
        {children}
        {actions && <div className="es-act">{actions}</div>}
      </div>
    </article>
  );
}

/** The big "page skipped class" tile. */
export function NotFoundTile({ home, onHome, onSearch }: { home: string; onHome: () => void; onSearch: () => void }) {
  return (
    <article className="es-nf" aria-label="Page not found">
      <div style={{ position: 'relative' }}>
        <div className="n">4<span>0</span>4</div>
        <h3>This page skipped class.</h3>
        <p>The link may be old, or the page may have moved. Search finds almost anything: a student, a receipt, a notice, a setting.</p>
        <div className="es-act" style={{ justifyContent: 'flex-start' }}>
          <a className="btn wht" href={home} onClick={(e) => { e.preventDefault(); onHome(); }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d="M15 6l-6 6 6 6"></path></svg>Back to the dashboard
          </a>
          <button className="btn" onClick={onSearch} style={{ background: 'color-mix(in srgb,var(--onCi) 10%,transparent)', color: 'var(--onCi)', borderColor: 'transparent' }}>Search<span className="kbd" style={{ background: 'color-mix(in srgb,var(--onCi) 14%,transparent)', color: 'var(--onCi)' }}>Ctrl K</span></button>
        </div>
      </div>
      <div style={{ position: 'relative' }}><Illustration scene="torn-page" /></div>
    </article>
  );
}
