import { useContext } from 'react';
import { NotFoundTile } from '@gradeon/web-ui';
import { AppContext } from '../../app/context';
import { url } from '../../app/base';

export function NotFoundPage() {
  const app = useContext(AppContext);
  const home = () => (app ? app.go('/') : (window.location.href = url('/')));
  return (
    <div className="nest" style={{ minHeight: '100dvh', padding: 12, display: 'grid', placeItems: 'center' }}>
      <div style={{ maxWidth: 880, width: '100%' }}>
        <NotFoundTile home={url('/')} onHome={home} onSearch={home} />
      </div>
    </div>
  );
}
