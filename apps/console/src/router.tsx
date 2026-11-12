import { useQueryClient } from '@tanstack/react-query';
import { reportErrors } from '@gradeon/web-ui';
import { Outlet, createRootRoute, createRoute, createRouter, lazyRouteComponent, redirect, useRouter } from '@tanstack/react-router';
import { useMemo } from 'react';
import { AppContext, type AppCtx } from './app/context';
import { makeClient, session, type Client } from './app/client';
import { LoginRoute } from './pages/login/LoginRoute';
import { JoinPage } from './pages/login/JoinPage';
import { NotFoundPage } from './pages/status/StatusPages';
import { BASE } from './app/base';
import { AppLayout } from './app/Layout';
import { PAGES } from './app/nav';

// Every console page, sign-in included, wears the console's seed (cobalt), which hue.css carries.
const root = createRootRoute({ component: Outlet, notFoundComponent: NotFoundPage });
const login = createRoute({ getParentRoute: () => root, path: '/login', component: LoginRoute });
const join = createRoute({ getParentRoute: () => root, path: '/join', component: JoinPage });

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
      go: (path) => { const [to, q] = path.split('?'); void router.navigate({ to: to as never, search: (q ? Object.fromEntries(new URLSearchParams(q)) : {}) as never }); },
    } : null, [user, router, qc]);
    if (!ctx) return null;
    return <AppContext.Provider value={ctx}><AppLayout><Outlet /></AppLayout></AppContext.Provider>;
  },
});

const page = (path: string, load: () => Promise<Record<string, unknown>>, name: string) => {
  const one = createRoute({ getParentRoute: () => authed, path, component: lazyRouteComponent(load as never, name) });
  // A page with tabs also answers at <page>/<tab>; the page reads the tab with usePageTabs.
  return PAGES.find((p) => p.to === path)?.tabs ? [one, createRoute({ getParentRoute: () => authed, path: `${path}/$tab`, component: lazyRouteComponent(load as never, name) })] : [one];
};
/** An old address that moved: it lands on its new place. */
const moved = (path: string, to: string) => createRoute({ getParentRoute: () => authed, path, beforeLoad: () => { throw redirect({ to: to as never }); } });

const routeTree = root.addChildren([
  login,
  join,
  authed.addChildren([
    page('/', () => import('./pages/fleet/FleetPage'), 'FleetPage'),
    page('/schools', () => import('./pages/fleet/SchoolsPage'), 'SchoolsPage'),
    page('/schools/$id', () => import('./pages/school/SchoolPage'), 'SchoolPage'),
    page('/schools/$id/$tab', () => import('./pages/school/SchoolPage'), 'SchoolPage'),
    page('/onboarding', () => import('./pages/onboarding/OnboardingPage'), 'OnboardingPage'),
    page('/onboarding/new', () => import('./pages/onboarding/WizardPage'), 'WizardPage'),
    page('/onboarding/new/$draft', () => import('./pages/onboarding/WizardPage'), 'WizardPage'),
    page('/cells', () => import('./pages/cells/CellsPage'), 'CellsPage'),
    page('/releases', () => import('./pages/releases/ReleasesPage'), 'ReleasesPage'),
    [moved('/migrations', '/releases/database')],
    page('/integrations', () => import('./pages/integrations/IntegrationsPage'), 'IntegrationsPage'),
    page('/builds', () => import('./pages/builds/BuildsPage'), 'BuildsPage'),
    page('/flags', () => import('./pages/flags/FlagsPage'), 'FlagsPage'),
    page('/blueprints', () => import('./pages/blueprints/BlueprintsPage'), 'BlueprintsPage'),
    page('/health', () => import('./pages/health/HealthPage'), 'HealthPage'),
    page('/approvals', () => import('./pages/approvals/ApprovalsPage'), 'ApprovalsPage'),
    page('/requests', () => import('./pages/requests/RequestsPage'), 'RequestsPage'),
    page('/modules', () => import('./pages/modules/ModulesPage'), 'ModulesPage'),
    page('/support', () => import('./pages/support/SupportPage'), 'SupportPage'),
    [moved('/inbox', '/integrations/inbox')],
    page('/settings', () => import('./pages/settings/SettingsPage'), 'SettingsPage'),
    page('/billing', () => import('./pages/billing/BillingPage'), 'BillingPage'),
    page('/compliance', () => import('./pages/compliance/CompliancePage'), 'CompliancePage'),
    page('/team', () => import('./pages/team/TeamPage'), 'TeamPage'),
  ].flat()),
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
