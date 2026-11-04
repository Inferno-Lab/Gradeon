import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { EmptyCard, LoginPage } from '@gradeon/web-ui';
import { session } from '../../app/client';

/** Signs in to the school named in the address: password first, then the code. */
export function LoginRoute() {
  const { slug, client } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate();
  const brand = useQuery({ queryKey: ['brand', slug], queryFn: client.api.brand, staleTime: 5 * 60_000, retry: false });
  if (brand.isError) return <NoSchool message={(brand.error as Error).message} />;
  const b = brand.data;
  return (
    <LoginPage
      controller={{
        product: 'admin', schoolName: b?.name ?? 'Gradeon', shortName: b?.shortName ?? 'school', demoMode: !!b?.demoMode, goName: 'the dashboard',
        initialEmail: (() => { try { return localStorage.getItem(`gradeon.admin.${slug}.email`) ?? ''; } catch { return ''; } })(),
        submitCredentials: async (email, password) => {
          const res = await client.api.login({ identifier: email, password });
          try { localStorage.setItem(`gradeon.admin.${slug}.email`, email); } catch { /* ignore */ }
          if (res.step === 'otp') return res.challenge;
          session.write(slug, { user: res.tokens.user });
          session.setAccess(slug, res.tokens.accessToken);
          return null;
        },
        submitCode: async (challengeId, code) => {
          const t = await client.api.verify({ challengeId, code, client: 'web' });
          session.write(slug, { user: t.user });
          session.setAccess(slug, t.accessToken);
          return t.user.name;
        },
        enter: () => void navigate({ to: '/' }),
      }}
    />
  );
}

function NoSchool({ message }: { message: string }) {
  return (
    <div className="nest" style={{ minHeight: '100dvh', padding: 12, display: 'grid', placeItems: 'center' }}>
      <div style={{ maxWidth: 440, width: '100%' }}>
        <EmptyCard error title="Sign in" chip={{ text: 'Not found', tone: 'r' }} scene="search-paper" heading="We couldn’t find that school" body={message} actions={<a className="btn pri" href="/">Try another address</a>} />
      </div>
    </div>
  );
}
