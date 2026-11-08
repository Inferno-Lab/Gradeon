import { useContext } from 'react';
import { useParams } from '@tanstack/react-router';
import { EmptyCard, NotFoundTile, PageScope } from '@gradeon/web-ui';
import { PAGE_TITLES } from '../../app/nav';
import { AppContext, useApp } from '../../app/context';

function Frame({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <PageScope page="status">
      <main className="mn">
        <header className="hd rise"><div><h1>{title}</h1><p>{sub}</p></div></header>
        <div>{children}</div>
      </main>
    </PageScope>
  );
}

/** A menu item whose screen has not been designed yet. It says so plainly and offers the way back. */
export function ComingSoonPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const { go } = useApp();
  const title = PAGE_TITLES[name] ?? 'This page';
  return (
    <Frame title={title} sub="Not open yet">
      <EmptyCard
        title={title} chip={{ text: 'Soon', tone: 'a' }} scene="calendar" heading={`${title} opens in a coming release`}
        body="The school's data for it is already safe in Gradeon. The screen is still being designed with the same care as the others."
        actions={<button className="btn pri" onClick={() => go('/')}>Back to the dashboard</button>}
      />
    </Frame>
  );
}

export function NotFoundPage() {
  const app = useContext(AppContext);
  return (
    <div className="nest" style={{ minHeight: '100dvh', padding: 12, display: 'grid', placeItems: 'center' }}>
      <div style={{ maxWidth: 880, width: '100%' }}>
        <NotFoundTile home={app?.base || '/'} onHome={() => app?.go('/') ?? (window.location.href = '/')} onSearch={() => app?.go('/')} />
      </div>
    </div>
  );
}
