import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { EmptyCard, PageScope } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { pageForPath } from '@gradeon/config-engine';
import { moduleForPath } from '../../app/nav';

/**
 * Around every signed-in page: a page the person's menu does not have says why plainly, instead of loading and failing (someone
 * followed an old link or a bookmark): a module the school does not have, Moving in after the school went live, or a page the
 * person's role does not include. The menu (ShellData.menu, from the module definitions) is the one rule for all three.
 */
export function PlanGate({ children }: { children: ReactNode }) {
  const app = useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const path = app.base && pathname.startsWith(app.base) ? pathname.slice(app.base.length) || '/' : pathname;
  const page = pageForPath(path);
  const shell = useQuery({ queryKey: ['shell'], queryFn: app.api.shell, staleTime: 30_000, enabled: !!page });
  const d = shell.data;
  if (!page || !d || d.menu.some((g) => g.pages.some((x) => x.id === page.id))) return <>{children}</>;
  const need = moduleForPath(path);
  if (need && !d.modules.includes(need) && !d.features.includes(need)) return <NotInPlan />;
  if (page.untilLive) return <Closed title="Moving in" heading="Your school has moved in" body="Moving in closes once the school is live. Records are added from each page now, and Gradeon’s team can still import a file for you." />;
  return <Closed title={page.label} heading="Your role does not include this page" body="Ask your principal if you need it; they can ask Gradeon to change your role." />;
}

function Closed({ title, heading, body }: { title: string; heading: string; body: string }) {
  const app = useApp();
  return (
    <PageScope page="dashboard">
      <main className="mn">
        <div><EmptyCard title={title} chip={{ text: 'Not here', tone: 'a' }} scene="padlock" heading={heading} body={body}
          actions={<button className="btn pri" onClick={() => app.go('/')}>Go to the dashboard</button>} /></div>
      </main>
    </PageScope>
  );
}

function NotInPlan() {
  const app = useApp();
  return (
    <PageScope page="dashboard">
      <main className="mn">
        <div><EmptyCard title="Not in your plan" chip={{ text: 'Not included', tone: 'a' }} scene="padlock" heading="This is not part of your school’s plan"
          body="Your school does not have this module right now. Anything it held is kept safely. To add it, ask Gradeon from your school profile."
          actions={<button className="btn pri" onClick={() => app.go('/profile/plan')}>See the plan and modules</button>} /></div>
      </main>
    </PageScope>
  );
}
