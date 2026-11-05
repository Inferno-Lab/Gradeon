import { useQueryClient } from '@tanstack/react-query';
import { reportErrors } from '@gradeon/web-ui';
import { Outlet, createRootRouteWithContext, createRoute, createRouter, redirect, useRouter, lazyRouteComponent } from '@tanstack/react-router';
import { useMemo } from 'react';
import { AppContext, type AppCtx } from './app/context';
import { makeClient, session, type Client } from './app/client';
import { SupportBanner } from './app/SupportBanner';
import { LoginRoute } from './pages/login/LoginRoute';
import { NotFoundPage } from './pages/status/StatusPages';
import { PlanGate } from './pages/status/PlanGate';

export interface RouterCtx {
  slug: string;
  client: Client;
}

const root = createRootRouteWithContext<RouterCtx>()({ component: Outlet, notFoundComponent: NotFoundPage });

const login = createRoute({ getParentRoute: () => root, path: '/login', component: LoginRoute });

/** Everything behind sign-in. Without a session the visitor is sent to /login. */
const authed = createRoute({
  getParentRoute: () => root,
  id: 'authed',
  beforeLoad: async ({ context }) => {
    if (session.read(context.slug)?.support) return;
    if (!session.read(context.slug)) throw redirect({ to: '/login' });
    if (!session.access(context.slug)) {
      const ok = await context.client.http.restore();
      if (!ok) {
        session.write(context.slug, null);
        throw redirect({ to: '/login' });
      }
    }
  },
  component: function Authed() {
    const { slug, client } = authed.useRouteContext();
    const router = useRouter();
    const qc = useQueryClient();
    const user = session.read(slug)?.user;
    const ctx = useMemo<AppCtx | null>(() => user ? {
      slug, base: router.basepath === '/' ? '' : router.basepath, api: client.api, user,
      signOut: () => { void client.api.logout().catch(() => undefined).finally(() => { session.write(slug, null); qc.clear(); void router.navigate({ to: '/login' }); }); },
      go: (path) => void router.navigate({ to: path as never }),
    } : null, [slug, client, user, router, qc]);
    if (!ctx) return null;
    const support = session.read(slug)?.support;
    return (
      <AppContext.Provider value={ctx}>
        <PlanGate><Outlet /></PlanGate>
        {support && <SupportBanner school={slug} until={support.until} onEnd={() => { session.write(slug, null); qc.clear(); window.close(); void router.navigate({ to: '/login' }); }} />}
      </AppContext.Provider>
    );
  },
});

const page = (path: string, load: () => Promise<Record<string, unknown>>, name: string) =>
  createRoute({ getParentRoute: () => authed, path, component: lazyRouteComponent(load as never, name) });

const routeTree = root.addChildren([
  login,
  authed.addChildren([
    page('/', () => import('./pages/dashboard/DashboardPage'), 'DashboardPage'),
    page('/students', () => import('./pages/students/StudentsPage'), 'StudentsPage'),
    page('/attendance', () => import('./pages/attendance/AttendancePage'), 'AttendancePage'),
    page('/fees', () => import('./pages/fees/FeesPage'), 'FeesPage'),
    page('/notices', () => import('./pages/notices/NoticesPage'), 'NoticesPage'),
    page('/timetable', () => import('./pages/timetable/TimetablePage'), 'TimetablePage'),
    page('/homework', () => import('./pages/homework/HomeworkPage'), 'HomeworkPage'),
    page('/exams', () => import('./pages/exams/ExamsPage'), 'ExamsPage'),
    page('/staff', () => import('./pages/staff/StaffPage'), 'StaffPage'),
    page('/admissions', () => import('./pages/admissions/AdmissionsPage'), 'AdmissionsPage'),
    page('/invoices', () => import('./pages/invoices/InvoicesPage'), 'InvoicesPage'),
    page('/reports', () => import('./pages/reports/ReportsPage'), 'ReportsPage'),
    page('/messages', () => import('./pages/messages/MessagesPage'), 'MessagesPage'),
    page('/events', () => import('./pages/events/EventsPage'), 'EventsPage'),
    page('/settings', () => import('./pages/settings/SettingsPage'), 'SettingsPage'),
    page('/p/$name', () => import('./pages/status/StatusPages'), 'ComingSoonPage'),
    page('/design', () => import('./design/DesignPage'), 'DesignPage'),
  ]),
]);

export function makeRouter(slug: string, basepath: string) {
  const report = reportErrors(`${(import.meta.env.VITE_API_URL as string | undefined) ?? ''}/v1/errors`, 'admin', () => ({ 'x-school': slug }), String(import.meta.env.VITE_RELEASE ?? ''));
  const router = createRouter({
    routeTree, basepath: basepath || '/', defaultPreload: 'intent', defaultPendingMs: 400,
    context: { slug, client: undefined as never },
    defaultOnCatch: (err) => report(err),
  });
  const client = makeClient(slug, () => void router.navigate({ to: '/login' }));
  router.update({ context: { slug, client } });
  return router;
}

declare module '@tanstack/react-router' {
  interface Register { router: ReturnType<typeof makeRouter> }
}
