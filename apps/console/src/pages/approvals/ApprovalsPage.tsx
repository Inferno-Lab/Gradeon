import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyCard } from '@gradeon/web-ui';
import type { ActionRow } from '@gradeon/contracts';
import { Card, Page, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { ago } from '../../app/format';

const NAME: Record<string, string> = {
  'school.suspend': 'Suspend a school', 'school.resume': 'Bring a school back', 'school.erase': 'Erase a school', 'entitlements.push': 'Send plan changes',
  'migration.run': 'Run database changes', 'domain.set': 'Change an address', 'build.app': 'Build the app', 'backup.take': 'Take a backup', 'school.move': 'Move a school to another cell',
};
const TONE: Record<ActionRow['status'], string> = { pending_approval: 'a', running: 'b', done: 'g', failed: 'r', rejected: 'n' };
const LABEL: Record<ActionRow['status'], string> = { pending_approval: 'Waiting for approval', running: 'Running', done: 'Done', failed: 'Failed', rejected: 'Rejected' };

export function ApprovalsPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const list = useQuery({ queryKey: ['actions'], queryFn: app.api.actions.list, refetchInterval: 8000 });
  const done = () => void qc.invalidateQueries({ predicate: (q) => ['actions', 'schools', 'fleet', 'school'].includes(String(q.queryKey[0])) });
  const decide = useMutation({
    mutationFn: (b: { id: string; yes: boolean }) => (b.yes ? app.api.actions.approve(b.id) : app.api.actions.reject(b.id)),
    onSuccess: (r) => { done(); say(r.status === 'rejected' ? 'Rejected. Nothing was changed.' : r.status === 'failed' ? `It did not work: ${r.summary}` : 'Approved and carried out.', r.status === 'failed' ? 'bad' : 'ok'); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  const rows = list.data ?? [];
  const waiting = rows.filter((r) => r.status === 'pending_approval');
  const past = rows.filter((r) => r.status !== 'pending_approval');
  const mayDecide = app.can('schools.danger');
  return (
    <Page active="appr" title="Approvals" sub={waiting.length ? `${waiting.length} waiting for a second person` : 'Risky changes need a second person to say yes'} toast={toast} loading={list.isLoading} error={list.isError ? { message: (list.error as Error).message, retry: () => void list.refetch() } : null}>
      <section className="grid">
        <Card title="Waiting" chip={<span className={`chip ${waiting.length ? 'a' : 'g'}`}>{waiting.length}</span>} span="s12">
          {waiting.length === 0 && (
            <EmptyCard title="Waiting" chip={{ text: 'All clear', tone: 'g' }} scene="checklist" heading="Nothing needs approving" body="Erasing a school, suspending it and other risky changes land here for a second person. You can’t approve your own." />
          )}
          {waiting.map((r) => {
            const own = r.requestedBy === app.user.email;
            return (
              <div key={r.id} className="kv" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <span style={{ minWidth: 200 }}>
                  <b style={{ display: 'block', textAlign: 'left' }}>{NAME[r.action] ?? r.action}{r.schoolName ? ` · ${r.schoolName}` : ''}</b>
                  <small style={{ color: 'var(--ink3)' }}>{r.summary} · asked by {r.requestedBy} · {ago(r.createdAt)}</small>
                </span>
                <span className="tgrow">
                  <button className="btn sm" disabled={!mayDecide || decide.isPending} onClick={() => decide.mutate({ id: r.id, yes: false })}>Reject</button>
                  <button className="btn pri sm" disabled={!mayDecide || own || decide.isPending} title={own ? 'A second person has to approve this' : undefined} onClick={() => decide.mutate({ id: r.id, yes: true })}>Approve</button>
                  {own && <span className="help" style={{ flexBasis: '100%', textAlign: 'right' }}>You asked for this, so someone else has to approve it.</span>}
                </span>
              </div>
            );
          })}
        </Card>
        <Card title="Recent" span="s12">
          {past.length === 0 && <div className="help">Finished requests show up here.</div>}
          {past.slice(0, 12).map((r) => (
            <div key={r.id} className="kv">
              <span>{NAME[r.action] ?? r.action}{r.schoolName ? ` · ${r.schoolName}` : ''}<br /><small style={{ color: 'var(--ink3)' }}>{r.dryRun ? 'Rehearsal · ' : ''}{ago(r.finishedAt ?? r.createdAt)}</small></span>
              <b><span className={`st ${TONE[r.status]}`}><i></i>{LABEL[r.status]}</span></b>
            </div>
          ))}
        </Card>
      </section>
    </Page>
  );
}
