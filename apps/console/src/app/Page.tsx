import type { ReactNode } from 'react';
import { EmptyCard, PageScope, Presence, ToastSlot, type ToastProps, Icon } from '@tangent/web-ui';
import { url } from './base';

interface PageProps {
  title: string;
  sub?: ReactNode;
  /** The page's verbs (Add, Export…), top right. */
  actions?: ReactNode;
  /** The page's tabs, in the bar under the title. */
  tabs?: ReactNode;
  /** What narrows the page (a class, a day, a period), in the same bar: after the tabs, or on its own. */
  filters?: ReactNode;
  children: ReactNode;
  overlays?: ReactNode;
  toast?: ToastProps | null;
  /** A query that failed: shows the error card instead of the page. */
  error?: { message: string; retry: () => void } | null;
  loading?: boolean;
  /** The part of the menu bar the person came from, for a back link. */
  back?: { label: string; to: string; go: (to: string) => void };
}

/** The frame every console page without its own board shares: title row, error and loading states, its dialogs and toast. */
export function Page({ title, sub, actions, tabs, filters, children, overlays, toast, error, loading, back }: PageProps) {
  return (
    <PageScope page="c" overlays={<><Presence>{overlays}</Presence><ToastSlot toast={toast} /></>}>
      <main className="mn" aria-busy={loading || undefined}>
        {back && (
          <div className="crumb rise">
            <a href={url(back.to)} onClick={(e) => { e.preventDefault(); back.go(back.to); }}>{back.label}</a>
            <Icon name="caretRight" size={14} />
            <b style={{ color: 'var(--ink)' }}>{title}</b>
          </div>
        )}
        <header className="hd rise">
          <div className="ht"><h1>{title}</h1>{sub != null && <p>{sub}</p>}</div>
          {actions && <div className="ha">{actions}</div>}
        </header>
        {(tabs || filters) && <div className="pbar rise">{tabs}{tabs && filters && <span className="grow"></span>}{filters}</div>}
        {error ? (
          <div>
            <EmptyCard error title={title} chip={{ text: 'Couldn’t load', tone: 'c' }} icon="warning" heading="That didn’t load" body={error.message} actions={<button className="btn pri" onClick={error.retry}>Try again</button>} />
          </div>
        ) : loading ? <div className="skc" style={{ height: 320, borderRadius: 28 }} /> : children}
      </main>
    </PageScope>
  );
}

/** A white card with a title row. */
export function Card({ title, chip, children, span, style, id }: { title?: string; chip?: ReactNode; children: ReactNode; span?: string; style?: React.CSSProperties; id?: string }) {
  return (
    <div className={`card ${span ?? ''} rise`} style={style}>
      {/* A card with no padding (a list that runs to its edges) still keeps its heading off the edge. */}
      {title && <div className="ch" style={style?.padding === 0 ? { padding: '20px 20px 0' } : undefined}><h2 id={id}>{title}</h2>{chip}</div>}
      <div style={{ marginTop: title ? 12 : 0 }}>{children}</div>
    </div>
  );
}

/** A row of three numbers at the top of a page, in the design's coloured tiles. */
export function Tiles({ items }: { items: { label: string; value: ReactNode; note: string; tone: 'v' | 'a' | 'i' | 'g' }[] }) {
  return (
    <section className="grid">
      {items.map((t, i) => (
        <div key={t.label} className={`tile t-${t.tone} s4 rise`} style={{ '--d': `${i * 0.05}s` } as React.CSSProperties}>
          <span className="lbl">{t.label}</span>
          <div className="fd" style={{ fontSize: 30, letterSpacing: '-.04em', marginTop: 8 }}>{t.value}</div>
          <div style={{ opacity: 0.75, font: '600 13px var(--fb)' }}>{t.note}</div>
        </div>
      ))}
    </section>
  );
}

/** Messages that vanish after a few seconds, for the result of a button press. */
export { useToast } from '@tangent/web-ui';
