import { useQuery } from '@tanstack/react-query';
import { useToast, EmptyState, useMore } from '@tangent/web-ui';
import { useApp } from '../../app/context';
import { Page } from '../../app/Page';

/** Who changed what at the school, newest first. */
export function AuditPage() {
  const app = useApp();
  const { api } = app;
  const { toast } = useToast();
  const q = useQuery({ queryKey: ['settings-audit'], queryFn: api.settings.audit });
  const rows = q.data ?? [];
  const [shown, more] = useMore(rows, 25);
  return (
    <Page title="Audit log" sub="The latest changes made by people at your school" toast={toast} loading={q.isLoading}
      error={q.isError && !q.data ? { message: (q.error as Error).message, retry: () => void q.refetch() } : null}>
      {!rows.length ? (
        <EmptyState scene="audit" onAction={() => app.go('/')} />
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {shown.map((r) => (
            <div key={r.id} className="exr" style={{ padding: '12px 20px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ font: '700 14px var(--fb)', display: 'block', overflowWrap: 'anywhere' }}>{r.actor} · {r.action}</b>
                <small style={{ display: 'block', overflowWrap: 'anywhere' }}>{r.detail || r.entity}</small>
              </div>
              <span className="chip">{new Date(r.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</span>
            </div>
          ))}
          {more}
        </div>
      )}
    </Page>
  );
}
