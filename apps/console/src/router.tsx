import { useQueryClient } from '@tanstack/react-query';
import { reportErrors } from '@gradeon/web-ui';
import { Outlet, createRootRoute, createRoute, createRouter, lazyRouteComponent, redirect, useRouter } from '@tanstack/react-router';
import { useMemo } from 'react';
import { AppContext, type AppCtx } from './app/context';
import { makeClient, session, type Client } from './app/client';
import { LoginRoute } from './pages/login/LoginRoute';
import { NotFoundPage } from './pages/status/StatusPages';
import { BASE } from './app/base';

const root = createRootRoute({ component: Outlet, notFoundComponent: NotFoundPage });
const login = createRoute({ getParentRoute: () => root, path: '/login', component: LoginRoute });

let client: Client;

/** Everything behind sign-in. Without a session the visitor is sent to /login. */
const authed = createRoute({
  getParentRoute: () => root,
  id: 'authed',
  beforeLoad: async () => {
    if (!session.read()) throw redirect({ to: '/login' });
    if (session.access()) return;
    const ok = await client.http.restore();
    if (!ok) {
      session.write(null);
      throw redirect({ to: '/login' });
    }
  },
  component: function Authed() {
    const router = useRouter();
    const qc = useQueryClient();
    const user = session.read()?.user;
    const ctx = useMemo<AppCtx | null>(() => user ? {
      api: client.api, user, can: (p) => user.permissions.includes(p as never),
      signOut: () => { void client.api.logout().catch(() => undefined).finally(() => { session.write(null); qc.clear(); void router.navigate({ to: '/login' }); }); },
      go: (path) => void router.navigate({ to: path as never }),
    } : null, [user, router, qc]);
    if (!ctx) return null;
    return <AppContext.Provider value={ctx}><Outlet /></AppContext.Provider>;
  },
});

const page = (path: string, load: () => Promise<Record<string, unknown>>, name: string) =>
  createRoute({ getParentRoute: () => authed, path, component: lazyRouteComponent(load as never, name) });

const routeTree = root.addChildren([
  login,
  authed.addChildren([
    page('/', () => import('./pages/fleet/FleetPage'), 'FleetPage'),
    page('/schools/$id', () => import('./pages/school/SchoolPage'), 'SchoolPage'),
    page('/onboarding', () => import('./pages/onboarding/OnboardingPage'), 'OnboardingPage'),
    page('/onboarding/new', () => import('./pages/onboarding/WizardPage'), 'WizardPage'),
    page('/onboarding/new/$draft', () => import('./pages/onboarding/WizardPage'), 'WizardPage'),
    page('/cells', () => import('./pages/cells/CellsPage'), 'CellsPage'),
    page('/releases', () => import('./pages/releases/ReleasesPage'), 'ReleasesPage'),
    page('/migrations', () => import('./pages/releases/MigrationsPage'), 'MigrationsPage'),
    page('/builds', () => import('./pages/builds/BuildsPage'), 'BuildsPage'),
    page('/flags', () => import('./pages/flags/FlagsPage'), 'FlagsPage'),
    page('/blueprints', () => import('./pages/blueprints/BlueprintsPage'), 'BlueprintsPage'),
    page('/health', () => import('./pages/health/HealthPage'), 'HealthPage'),
    page('/approvals', () => import('./pages/approvals/ApprovalsPage'), 'ApprovalsPage'),
    page('/requests', () => import('./pages/requests/RequestsPage'), 'RequestsPage'),
    page('/modules', () => import('./pages/modules/ModulesPage'), 'ModulesPage'),
    page('/support', () => import('./pages/support/SupportPage'), 'SupportPage'),
    page('/inbox', () => import('./pages/support/InboxPage'), 'InboxPage'),
    page('/billing', () => import('./pages/billing/BillingPage'), 'BillingPage'),
    page('/compliance', () => import('./pages/compliance/CompliancePage'), 'CompliancePage'),
    page('/team', () => import('./pages/team/TeamPage'), 'TeamPage'),
  ]),
]);

export function makeRouter() {
  const report = reportErrors(`${(import.meta.env.VITE_API_URL as string | undefined) ?? ''}/console/v1/errors`, 'console', undefined, String(import.meta.env.VITE_RELEASE ?? ''));
  const router = createRouter({ routeTree, basepath: BASE || '/', defaultPreload: 'intent', defaultPendingMs: 400, defaultOnCatch: (err) => report(err) });
  client = makeClient(() => void router.navigate({ to: '/login' }));
  return router;
}

declare module '@tanstack/react-router' {
  interface Register { router: ReturnType<typeof makeRouter> }
}
