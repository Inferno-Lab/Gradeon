import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { EmptyCard, PageScope } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { moduleForPath } from '../../app/nav';

/**
 * Around every signed-in page: a page of a module the school does not have says so plainly, instead of loading and failing
 * (someone followed an old link or a bookmark). Pages every school has render straight away.
 */
export function PlanGate({ children }: { children: ReactNode }) {
  const app = useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const need = moduleForPath(app.base && pathname.startsWith(app.base) ? pathname.slice(app.base.length) || '/' : pathname);
  const shell = useQuery({ queryKey: ['shell'], queryFn: app.api.shell, staleTime: 30_000, enabled: !!need });
  const d = shell.data;
  if (!need || !d || d.modules.includes(need) || d.features.includes(need)) return <>{children}</>;
  return <NotInPlan />;
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
