import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { HttpError } from '@gradeon/api-client';
import { EmptyCard, LoginPage, useThemeColors } from '@gradeon/web-ui';
import { session } from '../../app/client';

/** Signs in to the school named in the address: password first, then the code. */
export function LoginRoute() {
  const { slug, client } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate();
  // A school that does not exist is final; a server restarting (or waking up on the free tier) is tried again.
  const brand = useQuery({
    queryKey: ['brand', slug], queryFn: client.api.brand, staleTime: 5 * 60_000,
    retry: (n, e) => !(e instanceof HttpError && e.status === 404) && n < 6, retryDelay: (n) => Math.min(1000 * 2 ** n, 8000),
  });
  useThemeColors(brand.data?.theme);
  if (brand.isError) return <NoSchool error={brand.error} retry={() => void brand.refetch()} busy={brand.isFetching} />;
  const b = brand.data;
  return (
    <LoginPage
      controller={{
        product: 'admin', schoolName: b?.name ?? 'Gradeon', shortName: b?.shortName ?? 'school', color: b?.color, logoText: b?.logoText, privacy: b?.privacy, demoMode: !!b?.demoMode, goName: 'the dashboard',
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
        resetStart: (identifier) => client.api.resetStart(identifier),
        resetFinish: async (challengeId, code, password) => { await client.api.resetFinish({ challengeId, code, password }); },
        enter: () => void navigate({ to: '/' }),
      }}
    />
  );
}

function NoSchool({ error, retry, busy }: { error: Error; retry: () => void; busy: boolean }) {
  const missing = error instanceof HttpError && error.status === 404;
  return (
    <div className="nest" style={{ minHeight: '100dvh', padding: 12, display: 'grid', placeItems: 'center' }}>
      <div style={{ maxWidth: 440, width: '100%' }}>
        {missing
          ? <EmptyCard error title="Sign in" chip={{ text: 'Not found', tone: 'c' }} scene="search-paper" heading="We couldn’t find that school" body={error.message} actions={<a className="btn pri" href="/">Try another address</a>} />
          : <EmptyCard error title="Sign in" chip={{ text: 'Not answering', tone: 'a' }} scene="plug" heading="The school isn’t answering yet" body={error instanceof HttpError ? error.message : 'Check your connection, then try again.'} actions={<button className="btn pri" disabled={busy} onClick={retry}>{busy ? 'Trying…' : 'Try again'}</button>} />}
      </div>
    </div>
  );
}
