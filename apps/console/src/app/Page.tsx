import type { ReactNode } from 'react';
import { EmptyCard, PageScope, Presence, ToastSlot } from '@gradeon/web-ui';
import { url } from './base';

interface PageProps {
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  overlays?: ReactNode;
  toast?: { text: string; tone: 'ok' | 'bad' } | null;
  /** A query that failed: shows the error card instead of the page. */
  error?: { message: string; retry: () => void } | null;
  loading?: boolean;
  /** The part of the menu bar the person came from, for a back link. */
  back?: { label: string; to: string; go: (to: string) => void };
}

/** The frame every console page without its own board shares: title row, error and loading states, its dialogs and toast. */
export function Page({ title, sub, actions, children, overlays, toast, error, loading, back }: PageProps) {
  return (
    <PageScope page="c" overlays={<><Presence>{overlays}</Presence><ToastSlot toast={toast} /></>}>
      <main className="mn" aria-busy={loading || undefined}>
        {back && (
          <div className="crumb rise">
            <a href={url(back.to)} onClick={(e) => { e.preventDefault(); back.go(back.to); }}>{back.label}</a>
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path className="i" d="M9 6l6 6-6 6"></path></svg>
            <b style={{ color: 'var(--ink)' }}>{title}</b>
          </div>
        )}
        <header className="hd rise" style={{ flexWrap: 'wrap', gap: 14 }}>
          <div style={{ minWidth: 0 }}><h1>{title}</h1>{sub != null && <p>{sub}</p>}</div>
          <span className="grow"></span>
          {actions}
        </header>
        {error ? (
          <div>
            <EmptyCard error title={title} chip={{ text: 'Couldn’t load', tone: 'r' }} scene="plug" heading="That didn’t load" body={error.message} actions={<button className="btn pri" onClick={error.retry}>Try again</button>} />
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
      {title && <div className="ch"><h2 id={id}>{title}</h2>{chip}</div>}
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
          <div className="fd" style={{ fontSize: 34, letterSpacing: '-.04em', marginTop: 8 }}>{t.value}</div>
          <div style={{ opacity: 0.75, font: '600 13px var(--fb)' }}>{t.note}</div>
        </div>
      ))}
    </section>
  );
}

/** Messages that vanish after a few seconds, for the result of a button press. */
export { useToast } from './useToast';
