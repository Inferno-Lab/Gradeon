import { useContext } from 'react';
import { NotFoundTile } from '@gradeon/web-ui';
import { AppContext } from '../../app/context';

export function NotFoundPage() {
  const app = useContext(AppContext);
  return (
    <div className="nest" style={{ minHeight: '100dvh', padding: 12, display: 'grid', placeItems: 'center' }}>
      <div style={{ maxWidth: 880, width: '100%' }}>
        <NotFoundTile home={app?.base || '/'} onHome={() => app?.go('/') ?? (window.location.href = '/')} onSearch={() => app?.go('/?search=1') ?? (window.location.href = '/')} />
      </div>
    </div>
  );
}
