import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyCard, Select, EmptyState, EmptyNote } from '@tangent/web-ui';
import { Card, Page, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { url } from '../../app/base';
import { when } from '../../app/format';

const TONE = { requested: 'a', active: 'g', ended: 'n', expired: 'n' } as const;
const WORDS = { requested: 'Asked for', active: 'Open now', ended: 'Ended', expired: 'Timed out' } as const;

/** Every read-only look inside a school: who, why and how long. A session is started from the school's own page. */
export function SupportPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const sessions = useQuery({ queryKey: ['support'], queryFn: app.api.support.list, enabled: app.can('support.access'), refetchInterval: 15_000 });
  const [school, setSchool] = useState('');
  const [who, setWho] = useState('');
  const end = useMutation({ mutationFn: (id: string) => app.api.support.end(id), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['support'] }); say('Session ended.'); } });
  if (!app.can('support.access')) {
    return (
      <Page title="Support sessions" sub="Looks inside schools to help their staff">
        <div><EmptyCard title="Support sessions" chip={{ text: 'Not for your role', tone: 'a' }} icon="lock" heading="Support sessions are for the support team" body="Ask a super admin to add the Support role to your account if you need to look inside a school." /></div>
      </Page>
    );
  }
  const all = sessions.data ?? [];
  const rows = all.filter((r) => (!school || r.schoolId === school) && (!who || r.startedBy === who));
  const schools = [...new Map(all.map((r) => [r.schoolId, r.schoolName])).entries()];
  const people = [...new Set(all.map((r) => r.startedBy))];
  return (
    <Page title="Support sessions" sub="Read-only looks inside schools. Each needs a reason and ends by itself after 30 minutes. Start one from the school’s page." toast={toast}
      loading={sessions.isLoading} error={sessions.isError ? { message: (sessions.error as Error).message, retry: () => void sessions.refetch() } : null}>
      <Card title="Sessions" chip={<span className="chip">{rows.length}</span>}>
        {all.length > 0 && (
          <div className="tgrow" style={{ marginBottom: 8 }}>
            <Select compact aria-label="School" value={school} onChange={setSchool} options={[{ value: '', label: 'Every school' }, ...schools.map(([value, label]) => ({ value, label }))]} />
            <Select compact aria-label="Who" value={who} onChange={setWho} options={[{ value: '', label: 'Everyone' }, ...people.map((p) => ({ value: p, label: p }))]} />
          </div>
        )}
        {all.length === 0 && <EmptyState scene="support" onAction={() => app.go('/')} />}
        {all.length > 0 && rows.length === 0 && <EmptyNote icon="search" title="No session matches" body="Try another school or person, or clear the filters." />}
        {rows.map((r) => (
          <div key={r.id} className="kv" style={{ alignItems: 'flex-start' }}>
            <span><a href={url(`/schools/${r.schoolId}`)} onClick={(e) => { e.preventDefault(); app.go(`/schools/${r.schoolId}`); }} style={{ color: 'inherit', fontWeight: 700 }}>{r.schoolName}</a><br /><small style={{ color: 'var(--ink3)' }}>{r.reason} · {r.startedBy}{r.expiresAt ? ` · until ${when(r.expiresAt)}` : ''}</small></span>
            <b className="tgrow"><span className={`st ${TONE[r.status]}`}><i></i>{WORDS[r.status]}</span>{r.status === 'active' && <button className="btn sm" onClick={() => end.mutate(r.id)}>End</button>}</b>
          </div>
        ))}
      </Card>
    </Page>
  );
}
