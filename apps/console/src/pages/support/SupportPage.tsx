import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HttpError } from '@gradeon/api-client';
import { EmptyCard, SelectField, useShake } from '@gradeon/web-ui';
import { Card, Page, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { when } from '../../app/format';

const TONE = { requested: 'a', active: 'g', ended: 'n', expired: 'n' } as const;

export function SupportPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const sessions = useQuery({ queryKey: ['support'], queryFn: app.api.support.list, enabled: app.can('support.access'), refetchInterval: 15_000 });
  const schools = useQuery({ queryKey: ['schools'], queryFn: () => app.api.schools() });
  const [schoolId, setSchoolId] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const shake = useShake();
  const end = useMutation({ mutationFn: (id: string) => app.api.support.end(id), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['support'] }); say('Session ended.'); } });
  const start = useMutation({
    mutationFn: () => app.api.support.start(schoolId || schools.data![0]!.id, reason.trim()),
    onSuccess: (r) => { window.open(`${r.adminUrl.replace(/\/$/, '')}/#support=${r.token}`, '_blank', 'noopener'); setReason(''); void qc.invalidateQueries({ queryKey: ['support'] }); say('Session started in a new tab. It is read-only and ends in an hour.'); },
    onError: (e) => { setErr(e instanceof HttpError ? (e.fields.reason ?? e.message) : (e as Error).message); shake.hit(); },
  });
  if (!app.can('support.access')) {
    return (
      <Page active="sup" title="Support" sub="Look inside a school to help its staff">
        <div><EmptyCard title="Support" chip={{ text: 'Not for your role', tone: 'a' }} scene="padlock" heading="Support sessions are for the support team" body="Ask a super admin to add the Support role to your account if you need to look inside a school." /></div>
      </Page>
    );
  }
  const rows = sessions.data ?? [];
  const go = () => {
    if (!schools.data?.length) { setErr('There are no schools to open yet.'); shake.hit(); return; }
    if (reason.trim().length < 8) { setErr('Say why in a few words, at least 8 letters. It is written to the audit log.'); shake.hit(); return; }
    start.mutate();
  };
  return (
    <Page active="sup" title="Support" sub="Read-only sessions inside a school. Every one needs a reason and ends by itself after an hour." toast={toast} loading={sessions.isLoading} error={sessions.isError ? { message: (sessions.error as Error).message, retry: () => void sessions.refetch() } : null}>
      <section className="grid">
        <Card title="Start a session" span="s12">
          <div className={shake.cls} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(260px,100%),1fr))', gap: 16, alignItems: 'start' }}>
            <SelectField label="School" value={schoolId || schools.data?.[0]?.id || ''} onChange={setSchoolId} options={(schools.data ?? []).map((s) => ({ value: s.id, label: s.name }))} />
            <div className="fld" style={{ marginTop: 0, gridColumn: 'span 2' }}>
              <label htmlFor="sup-reason">Why do you need to look?</label>
              <div className={`inp ${err ? 'err shake' : ''}`}>
                <input id="sup-reason" value={reason} onChange={(e) => { setReason(e.target.value); setErr(''); }} maxLength={300} placeholder="For example: wrong fees total" aria-invalid={!!err} />
              </div>
              {err && <div className="emsg" role="alert">{err}</div>}
            </div>
          </div>
          <button className="btn pri" style={{ marginTop: 16 }} onClick={go} disabled={start.isPending}>{start.isPending ? 'Opening…' : 'Start session'}</button>
        </Card>
        <Card title="Sessions" chip={<span className="chip">{rows.length}</span>} span="s12">
          {rows.length === 0 && <EmptyCard title="Sessions" chip={{ text: '0 so far', tone: 'v' }} scene="envelope" heading="No support sessions yet" body="When you look inside a school, the session, the reason and who started it are listed here." />}
          {rows.map((r) => (
            <div key={r.id} className="kv" style={{ alignItems: 'flex-start' }}>
              <span>{r.schoolName}<br /><small style={{ color: 'var(--ink3)' }}>{r.reason} · {r.startedBy}{r.expiresAt ? ` · until ${when(r.expiresAt)}` : ''}</small></span>
              <b className="tgrow"><span className={`st ${TONE[r.status]}`}><i></i>{r.status}</span>{r.status === 'active' && <button className="btn sm" onClick={() => end.mutate(r.id)}>End</button>}</b>
            </div>
          ))}
        </Card>
      </section>
    </Page>
  );
}
