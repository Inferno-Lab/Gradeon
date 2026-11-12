import { useQuery } from '@tanstack/react-query';
import { EmptyCard, useToast } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { Page } from '../../app/Page';

/** Who changed what at the school, newest first. */
export function AuditPage() {
  const { api } = useApp();
  const { toast } = useToast();
  const q = useQuery({ queryKey: ['settings-audit'], queryFn: api.settings.audit });
  const rows = q.data ?? [];
  return (
    <Page title="Audit log" sub="The latest changes made by people at your school" toast={toast} loading={q.isLoading}
      error={q.isError && !q.data ? { message: (q.error as Error).message, retry: () => void q.refetch() } : null}>
      {!rows.length ? (
        <EmptyCard title="Audit log" chip={{ text: '0 entries', tone: 'v' }} scene="checklist" heading="Nothing has been changed yet"
          body="Every change to students, fees, attendance, notices and approvals is written here, with who made it and when." />
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {rows.map((r) => (
            <div key={r.id} className="exr" style={{ padding: '12px 20px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ font: '700 14px var(--fb)', display: 'block', overflowWrap: 'anywhere' }}>{r.actor} · {r.action}</b>
                <small style={{ display: 'block', overflowWrap: 'anywhere' }}>{r.detail || r.entity}</small>
              </div>
              <span className="chip">{new Date(r.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</span>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
