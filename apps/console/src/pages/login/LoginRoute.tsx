import { useNavigate } from '@tanstack/react-router';
import { LoginPage } from '@tangent/web-ui';
import { makeClient, session } from '../../app/client';

const client = makeClient(() => undefined);

/** The console's own sign-in: password first, then the code. Team members only. */
export function LoginRoute() {
  const navigate = useNavigate();
  return (
    <LoginPage
      controller={{
        product: 'console', schoolName: 'Tangent Console', shortName: 'console', demoMode: !!import.meta.env.VITE_DEMO_LOGIN, goName: 'the console',
        initialEmail: (() => { try { return localStorage.getItem('tangent.console.email') ?? ''; } catch { return ''; } })(),
        submitCredentials: async (email, password) => {
          const res = await client.api.login({ identifier: email, password });
          try { localStorage.setItem('tangent.console.email', email); } catch { /* ignore */ }
          if (res.step === 'otp') return res.challenge;
          session.write({ user: res.tokens.user });
          session.setAccess(res.tokens.accessToken);
          return null;
        },
        submitCode: async (challengeId, code) => {
          const t = await client.api.verify({ challengeId, code, client: 'web' });
          session.write({ user: t.user });
          session.setAccess(t.accessToken);
          return t.user.name;
        },
        resetStart: (identifier) => client.api.resetStart(identifier),
        resetFinish: async (challengeId, code, password) => { await client.api.resetFinish({ challengeId, code, password }); },
        enter: () => void navigate({ to: '/' }),
      }}
    />
  );
}
