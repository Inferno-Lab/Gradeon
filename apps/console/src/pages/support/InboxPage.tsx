import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyCard, Select } from '@gradeon/web-ui';
import { Card, Page } from '../../app/Page';
import { useApp } from '../../app/context';
import { ago } from '../../app/format';

const ICON: Record<string, string> = {
  sms: 'M4 5h16v11H9l-5 4z', email: 'M4 6h16v12H4zM4 7l8 6 8-6', whatsapp: 'M4 5h16v11H9l-5 4z', push: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
};

/** Texts and emails the test track would have sent. Nothing leaves the building here, so this is where a tester reads the codes and receipts. */
export function InboxPage() {
  const app = useApp();
  const [school, setSchool] = useState('');
  const schools = useQuery({ queryKey: ['schools'], queryFn: () => app.api.schools() });
  const msgs = useQuery({ queryKey: ['sandbox', school], queryFn: () => app.api.sandbox(school || undefined), enabled: app.can('sandbox.read'), refetchInterval: 6000 });
  const rows = msgs.data ?? [];
  return (
    <Page title="Test inbox" sub="Every text and email the platform would send, caught here instead of reaching real phones" loading={msgs.isLoading} error={msgs.isError ? { message: (msgs.error as Error).message, retry: () => void msgs.refetch() } : null}
      actions={<Select compact aria-label="School" value={school} onChange={setSchool} options={[{ value: '', label: 'All schools' }, ...(schools.data ?? []).map((s) => ({ value: s.slug, label: s.name }))]} />}>
      {rows.length === 0 ? (
        <div><EmptyCard title="Test inbox" chip={{ text: 'Empty', tone: 'v' }} scene="envelope" heading="Nothing has been sent yet" body="Sign-in codes, fee receipts and notices land here as they are triggered. Try signing in to a school to see the first one." /></div>
      ) : (
        <Card>
          {rows.map((m) => (
            <div key={m.id} className="kv" style={{ alignItems: 'flex-start' }}>
              <span style={{ display: 'flex', gap: 12, minWidth: 0 }}>
                <span className="av" style={{ width: 34, height: 34, flex: 'none', background: 'var(--vS)', color: 'var(--vD)' }}>
                  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path className="i" d={ICON[m.channel] ?? ICON.sms}></path></svg>
                </span>
                <span style={{ minWidth: 0 }}>
                  <b style={{ display: 'block', textAlign: 'left' }}>{m.subject ?? m.to}</b>
                  <span style={{ color: 'var(--ink2)', overflowWrap: 'anywhere' }}>{m.body}</span><br />
                  <small style={{ color: 'var(--ink3)' }}>{m.channel} to {m.to} · {m.schoolSlug}</small>
                </span>
              </span>
              <b style={{ whiteSpace: 'nowrap', color: 'var(--ink3)' }}>{ago(m.createdAt)}</b>
            </div>
          ))}
        </Card>
      )}
    </Page>
  );
}
