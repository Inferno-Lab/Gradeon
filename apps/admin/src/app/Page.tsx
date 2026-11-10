import type { ReactNode } from 'react';
import { EmptyCard, PageScope, Presence, ToastSlot, type ToastProps } from '@gradeon/web-ui';
import './pages.css';

interface PageProps {
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  overlays?: ReactNode;
  toast?: ToastProps | null;
  /** A query that failed: shows the error card instead of the page. */
  error?: { message: string; retry: () => void } | null;
  loading?: boolean;
}

/** The frame every admin page without its own board shares: title row, error and loading states, its dialogs and toast. */
export function Page({ title, sub, actions, children, overlays, toast, error, loading }: PageProps) {
  return (
    <PageScope page="p" overlays={<><Presence>{overlays}</Presence><ToastSlot toast={toast} /></>}>
      <main className="mn" aria-busy={loading || undefined}>
        <header className="hd rise" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div style={{ minWidth: 0 }}><h1>{title}</h1>{sub != null && <p>{sub}</p>}</div>
          <span className="grow"></span>
          {actions}
        </header>
        {error ? (
          <div style={{ maxWidth: 520 }}>
            <EmptyCard error title={title} chip={{ text: 'Couldn’t load', tone: 'c' }} scene="plug" heading="That didn’t load" body={error.message} actions={<button className="btn pri" onClick={error.retry}>Try again</button>} />
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

/** Messages that vanish after a few seconds, for the result of a button press. */
export { useToast } from '@gradeon/web-ui';
