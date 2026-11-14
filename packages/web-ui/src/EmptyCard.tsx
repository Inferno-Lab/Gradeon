import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { Illustration, type Scene } from './illustrations/Illustration';
import './empty.css';

export interface EmptyCardProps {
  /** The name of the thing that is empty, shown in the card's header. */
  title: string;
  chip?: { text: string; tone: 'v' | 'c' | 'a' | 'g' };
  /** The icon in the tile; an error shows the warning sign. */
  icon?: IconName;
  heading: string;
  body: string;
  actions?: ReactNode;
  error?: boolean;
  children?: ReactNode;
}

/**
 * What is not a page with nothing in it yet (that is EmptyState): an error, a page someone may not open, a search or filter
 * with no match, an empty list inside a page that has data. A spot illustration (or an icon tile), one honest sentence and the next step.
 */
/** The Nest spot illustration for an empty card's icon: the picture is what makes an empty card feel looked after. */
const ART: Partial<Record<IconName, Scene>> = {
  warning: 'torn-page', lock: 'padlock', search: 'search-paper', people: 'register', mail: 'envelope', invoices: 'receipt',
  homework: 'notebooks', checkCircle: 'checklist', calendar: 'calendar',
};

export function EmptyCard({ title, chip, icon, heading, body, actions, error, children }: EmptyCardProps) {
  return (
    <article className={`es ${error ? 'es-err' : ''}`}>
      <div className="eh"><b>{title}</b>{chip && <span className={`chip ${chip.tone}`}>{chip.text}</span>}</div>
      <div className="eb">
        {(() => {
          const name = error ? 'warning' : icon ?? 'info';
          const scene = ART[name];
          return scene ? <div className="art"><Illustration scene={scene} /></div> : <span className="eic"><Icon name={name} size={24} /></span>;
        })()}
        <h3>{heading}</h3>
        <p>{body}</p>
        {children}
        {actions && <div className="es-act">{actions}</div>}
      </div>
    </article>
  );
}

/** A page that does not exist: the big 404 on the deep colour, and two ways on. */
export function NotFoundTile({ home, onHome, onSearch }: { home: string; onHome: () => void; onSearch: () => void }) {
  return (
    <article className="es-nf" aria-label="Page not found">
      <div style={{ position: 'relative' }}>
        <div className="n">4<span>0</span>4</div>
        <h3>This page isn’t here</h3>
        <p>The link may be old, or the page may have moved. Search finds almost anything: a student, a receipt, a notice, a setting.</p>
        <div className="es-act">
          <a className="btn wht" href={home} onClick={(e) => { e.preventDefault(); onHome(); }}><Icon name="caretLeft" />Back to the dashboard</a>
          <button className="btn ond" onClick={onSearch}>Search<span className="kbd">Ctrl K</span></button>
        </div>
      </div>
      <div style={{ position: 'relative' }}><Illustration scene="torn-page" /></div>
    </article>
  );
}
