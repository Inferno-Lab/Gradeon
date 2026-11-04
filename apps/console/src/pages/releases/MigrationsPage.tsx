import { useQuery } from '@tanstack/react-query';
import { EmptyCard } from '@gradeon/web-ui';
import type { MigrationRow } from '@gradeon/contracts';
import { Card, Page } from '../../app/Page';
import { useApp } from '../../app/context';

const KIND: Record<MigrationRow['kind'], string> = { expand: 'v', backfill: 'b', contract: 'a' };
const KIND_HELP: Record<MigrationRow['kind'], string> = { expand: 'Adds something new. Safe to run first.', backfill: 'Fills in old rows.', contract: 'Removes something old. Runs last.' };

export function MigrationsPage() {
  const app = useApp();
  const q = useQuery({ queryKey: ['migrations'], queryFn: app.api.releases.migrations, refetchInterval: 15_000 });
  const rows = q.data ?? [];
  return (
    <Page active="mig" title="Migrations" sub="Database changes, and which schools have them. Each school’s database is changed on its own." loading={q.isLoading} error={q.isError ? { message: (q.error as Error).message, retry: () => void q.refetch() } : null}>
      {rows.length === 0 ? (
        <div><EmptyCard title="Migrations" chip={{ text: 'None', tone: 'v' }} scene="notebooks" heading="No migrations recorded" body="Once a school’s database is created, the changes applied to it are listed here, newest first." /></div>
      ) : rows.map((m) => {
        const applied = m.schools.filter((s) => s.state === 'applied').length;
        const bad = m.schools.filter((s) => s.state === 'failed');
        return (
          <Card key={m.tag} title={m.tag} chip={<span className={`chip ${KIND[m.kind]}`}>{m.kind}</span>}>
            <div className="help">{KIND_HELP[m.kind]}</div>
            <div className="us" style={{ marginTop: 12 }}>
              <div className="r">Schools with it<b>{applied} of {m.schools.length}</b></div>
              <div className={`bar ${bad.length ? 'warn' : ''}`}><i style={{ width: `${m.schools.length ? (applied / m.schools.length) * 100 : 0}%` }}></i></div>
            </div>
            {bad.map((s) => <div key={s.id} className="emsg" role="alert" style={{ marginTop: 10 }}>{s.name}: {s.error ?? 'failed'}</div>)}
          </Card>
        );
      })}
    </Page>
  );
}
