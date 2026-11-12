import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Checkbox, Segmented, Select, tintFor, EmptyState } from '@gradeon/web-ui';
import { Card, Page, Tiles, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { url } from '../../app/base';
import { ago, initials, statusOf } from '../../app/format';

export function HealthPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const schools = useQuery({ queryKey: ['schools'], queryFn: () => app.api.schools(), refetchInterval: 20_000 });
  const fleet = useQuery({ queryKey: ['fleet'], queryFn: app.api.fleet });
  const [days, setDays] = useState('7');
  const [handled, setHandled] = useState(false);
  const errors = useQuery({ queryKey: ['errors', days, handled], queryFn: () => app.api.errors(Number(days), handled), refetchInterval: 60_000 });
  const done = useMutation({ mutationFn: app.api.errorHandled, onSuccess: () => { void qc.invalidateQueries({ queryKey: ['errors'] }); say('Marked handled. It comes back if it happens again.'); }, onError: (e) => say((e as Error).message, 'bad') });
  const drills = useQuery({ queryKey: ['drills'], queryFn: app.api.drills });
  const drill = useMutation({ mutationFn: app.api.runDrill, onSuccess: (d) => { void qc.invalidateQueries({ queryKey: ['drills'] }); say(d.ok ? `Restored ${d.rows.toLocaleString('en-IN')} rows of ${d.schoolName} into a scratch database.` : `The drill failed: ${d.error}`, d.ok ? undefined : 'bad'); }, onError: (e) => say((e as Error).message, 'bad') });
  const probe = useMutation({ mutationFn: app.api.probe, onSuccess: (r) => { void qc.invalidateQueries({ predicate: (q) => ['schools', 'fleet'].includes(String(q.queryKey[0])) }); say(`Checked ${r.probed} ${r.probed === 1 ? 'school' : 'schools'}.`); }, onError: (e) => say((e as Error).message, 'bad') });
  const rows = (schools.data ?? []).filter((s) => s.status !== 'archived');
  const order = { down: 0, degraded: 1, unknown: 2, ok: 3 } as const;
  rows.sort((a, b) => order[a.health] - order[b.health]);
  const inc = fleet.data?.incident;
  return (
    <Page title="Health" sub="Each school’s API answers a heartbeat every minute. Slow or silent ones float to the top." toast={toast} loading={schools.isLoading} error={schools.isError ? { message: (schools.error as Error).message, retry: () => void schools.refetch() } : null}
      actions={<button className="btn pri" onClick={() => probe.mutate()} disabled={probe.isPending}>{probe.isPending ? 'Checking…' : 'Check everything now'}</button>}>
      {inc && (
        <div className={`inc ${inc.state === 'resolved' ? 'ok' : ''} rise`} role="status" style={{ padding: 20, borderRadius: 24, background: inc.state === 'resolved' ? 'var(--ok-s)' : 'var(--deep)', color: inc.state === 'resolved' ? 'var(--ok-i)' : 'var(--on-deep)' }}>
          <span className={`chip ${inc.state === 'resolved' ? 'g' : 'c'}`}>{inc.state === 'resolved' ? 'Resolved' : `Incident${inc.schoolName ? ` · ${inc.schoolName}` : ''}`}</span>
          <div className="fd" style={{ fontSize: 17, letterSpacing: '-.02em', marginTop: 10 }}>{inc.title}</div>
          <p style={{ margin: '4px 0 0', font: '400 13px/1.45 var(--fb)', opacity: .75 }}>{inc.body}</p>
        </div>
      )}
      {rows.length > 0 && (() => {
        const timed = rows.filter((s) => s.healthMs != null);
        const slow = timed.reduce<typeof rows[number] | null>((m, s) => (!m || (s.healthMs ?? 0) > (m.healthMs ?? 0) ? s : m), null);
        const look = rows.filter((s) => s.health === 'down' || s.health === 'degraded').length;
        return <Tiles items={[
          { label: 'Answering normally', value: `${rows.filter((s) => s.health === 'ok').length} of ${rows.length}`, note: rows.length === 1 ? 'school' : 'schools', tone: 'g' },
          { label: 'Needs a look', value: look, note: look ? 'slow or not answering' : 'nothing slow or silent', tone: look ? 'a' : 'v' },
          { label: 'Slowest answer', value: slow ? `${slow.healthMs} ms` : '–', note: slow ? slow.name : 'no heartbeat yet', tone: 'i' },
        ]} />;
      })()}
      {rows.length === 0 ? (
        <div><EmptyState scene="health" onAction={() => app.go('/onboarding/new')} /></div>
      ) : (
        <Card style={{ padding: 0 }}>
          <div className="tbl scroll-x"><div style={{ minWidth: 620 }}>
            <div className="grd th" style={{ '--cols': 'minmax(0,2fr) 70px 140px 100px 130px' } as React.CSSProperties}><span>School</span><span>Cell</span><span>Status</span><span>Answers in</span><span></span></div>
            {rows.map((s) => {
              const st = statusOf(s); const t = tintFor(s.name);
              return (
                <a key={s.id} className="grd rw" href={url(`/schools/${s.id}/technical`)} onClick={(e) => { e.preventDefault(); app.go(`/schools/${s.id}/technical`); }} style={{ '--cols': 'minmax(0,2fr) 70px 140px 100px 130px', color: 'inherit', textDecoration: 'none' } as React.CSSProperties}>
                  <span style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}><span className="av" style={{ width: 34, height: 34, fontSize: 11, background: t.bg, color: t.fg, boxShadow: 'none' }}>{initials(s.name)}</span><b data-tip={s.name} style={{ font: '700 14px/1.25 var(--fb)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.name}</b></span>
                  <span className="chip">{s.cell}</span><span className={`st ${st.tone}`}><i></i>{st.text}</span><span className="num" style={{ font: '700 13px var(--fb)' }}>{s.healthMs != null ? `${s.healthMs} ms` : '–'}</span><span style={{ color: 'var(--ink3)', font: '600 13px var(--fb)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-tip={s.lastIncident ?? undefined}>{s.lastIncident ?? ''}</span>
                </a>
              );
            })}
          </div></div>
        </Card>
      )}
      <Card title="Errors" chip={<span className="tgrow" style={{ alignItems: 'center' }}><Segmented label="Range" value={days} onChange={setDays} options={[{ value: '1', label: 'Day' }, { value: '7', label: 'Week' }, { value: '30', label: 'Month' }]} /><Checkbox checked={handled} onChange={setHandled} label="Show handled" /></span>} style={{ padding: 0 }}>
        {errors.isError ? <div className="help" style={{ padding: 20 }}>{(errors.error as Error).message}</div>
          : !(errors.data ?? []).length ? <div className="help" style={{ padding: 20 }}>Nothing {handled ? '' : 'unhandled '}has gone wrong in the APIs, the admin, the console or the app in that time.</div>
          : (errors.data ?? []).map((e) => (
            <details key={e.fingerprint} className="rw" style={{ display: 'block', height: 'auto', padding: '12px 20px' }}>
              <summary style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', listStyle: 'none', minWidth: 0 }}>
                <span className="chip">{e.source}</span>
                {e.schoolSlug && <span className="chip v">{e.schoolSlug}</span>}
                <b style={{ flex: 1, minWidth: 0, font: '700 13px/1.35 var(--fb)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-tip={e.message}>{e.message}</b>
                {e.handledBy && <span className="chip g" data-tip={`By ${e.handledBy}`}>Handled</span>}
                <span className="num" style={{ font: '700 13px var(--fb)' }}>{e.count}×</span>
                <span style={{ color: 'var(--ink3)', font: '600 13px var(--fb)', whiteSpace: 'nowrap' }}>{ago(e.lastAt)}</span>
              </summary>
              <div className="help" style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>{e.url ?? ''}{e.release ? ` · release ${e.release}` : ''} · first seen {ago(e.firstAt)}
                {!e.handledBy && app.can('schools.write') && <button className="btn sm" disabled={done.isPending} onClick={() => done.mutate(e.fingerprint)}>Mark handled</button>}</div>
              {e.stack && <pre style={{ margin: '8px 0 0', padding: 12, borderRadius: 12, background: 'var(--s2)', font: '400 12px/1.5 var(--fm, monospace)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 260, overflow: 'auto' }}>{e.stack}</pre>}
            </details>
          ))}
      </Card>
      <Jobs say={say} />
      <Card title="Restore drills" chip={<button className="btn sm" onClick={() => drill.mutate()} disabled={drill.isPending}>{drill.isPending ? 'Restoring…' : 'Run a drill now'}</button>} style={{ padding: 0 }}>
        <div className="help" style={{ padding: '0 20px 12px' }}>Once a week a fresh backup of one live school is put back into a scratch database and counted, so we know backups restore. The school is never touched.</div>
        {!(drills.data ?? []).length ? <div className="help" style={{ padding: '0 20px 20px' }}>No drill has run yet.</div>
          : (drills.data ?? []).map((d) => (
            <div key={d.id} className="rw" style={{ display: 'flex', gap: 10, alignItems: 'center', height: 'auto', minHeight: 52, padding: '10px 20px', flexWrap: 'wrap' }}>
              <span className={`chip ${d.ok ? 'g' : 'c'}`}>{d.ok ? 'Restored' : 'Failed'}</span>
              <b style={{ flex: 1, minWidth: 160, font: '700 13px/1.35 var(--fb)' }}>{d.schoolName}</b>
              <span className="help" style={{ margin: 0 }} data-tip={d.error ?? undefined}>{d.ok ? `${d.rows.toLocaleString('en-IN')} rows · ${d.students.toLocaleString('en-IN')} students · ${(d.ms / 1000).toFixed(1)} s` : (d.error ?? '').slice(0, 80)}</span>
              <span style={{ color: 'var(--ink3)', font: '600 13px var(--fb)', whiteSpace: 'nowrap' }}>{ago(d.at)}</span>
            </div>
          ))}
      </Card>
    </Page>
  );
}

const JOB_LABELS: Record<string, string> = {
  'fees.reminders': 'Fee reminders', 'fees.lateFines': 'Late fines', 'files.scan': 'Virus check', 'files.thumb': 'Thumbnails', 'payments.reconcile': 'Payment reconciliation',
  'retention.erase': 'Erase leavers', 'imports.run': 'Import', 'notices.publish': 'Scheduled notice', 'transport.poll': 'Bus positions', 'files.usage': 'Storage used',
};
const JOB_TONE = { queued: 'v', running: 'a', done: 'g', failed: 'c' } as const;
const JOB_WORDS = { queued: 'Waiting', running: 'Running', done: 'Done', failed: 'Failed' } as const;

/** Each school's background work (reminders, late fines, reconciliation, file checks, erasure): what is waiting, running or failed. */
function Jobs({ say }: { say: (m: string, tone?: 'bad') => void }) {
  const app = useApp();
  const qc = useQueryClient();
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: app.api.jobs.list, refetchInterval: 20_000 });
  const retry = useMutation({ mutationFn: app.api.jobs.retry, onSuccess: () => { void qc.invalidateQueries({ queryKey: ['jobs'] }); say('Queued again.'); }, onError: (e) => say((e as Error).message, 'bad') });
  const [school, setSchool] = useState('');
  const [onlyFailed, setOnlyFailed] = useState(false);
  const all = jobs.data ?? [];
  const failed = all.filter((j) => j.status === 'failed').length;
  const rows = all.filter((j) => (!school || j.schoolId === school) && (!onlyFailed || j.status === 'failed'));
  const schools = [...new Map(all.filter((j) => j.schoolId).map((j) => [j.schoolId!, j.schoolName ?? j.schoolId!])).entries()];
  return (
    <Card title="Background jobs" chip={<span className={`chip ${failed ? 'c' : 'g'}`}>{failed ? `${failed} failed` : 'Nothing failed'}</span>} style={{ padding: 0 }}>
      <div className="help" style={{ padding: '0 20px 12px' }}>Reminders, late fines and reconciliation are queued for every school each morning; a failed job is tried again after 1 and 10 minutes, then waits here.</div>
      {all.length > 0 && (
        <div className="tgrow" style={{ padding: '0 20px 12px', alignItems: 'center' }}>
          {schools.length > 1 && <Select compact aria-label="School" value={school} onChange={setSchool} options={[{ value: '', label: 'Every school' }, ...schools.map(([value, label]) => ({ value, label }))]} />}
          <Checkbox checked={onlyFailed} onChange={setOnlyFailed} label="Only failed" />
        </div>
      )}
      {jobs.isError ? <div className="help" style={{ padding: '0 20px 20px' }}>{(jobs.error as Error).message}</div>
        : !rows.length ? <div className="help" style={{ padding: '0 20px 20px' }}>{all.length ? 'No job matches.' : 'No job has run in the last day.'}</div> : (
          <div className="tbl scroll-x"><div style={{ minWidth: 640 }} className="lscroll">
            <div className="grd th" style={{ '--cols': '100px minmax(0,1.2fr) minmax(0,1fr) minmax(0,2fr) 90px' } as React.CSSProperties}><span>Status</span><span>Job</span><span>School</span><span>Result</span><span></span></div>
            {rows.map((j) => (
              <div key={j.id} className="grd rw" style={{ '--cols': '100px minmax(0,1.2fr) minmax(0,1fr) minmax(0,2fr) 90px', height: 'auto', minHeight: 52, padding: '8px 20px' } as React.CSSProperties}>
                <span className={`chip ${JOB_TONE[j.status]}`}>{JOB_WORDS[j.status]}</span>
                <span style={{ minWidth: 0 }}><b style={{ font: '700 13px var(--fb)' }}>{JOB_LABELS[j.kind] ?? j.kind}</b><div className="help" style={{ margin: 0 }}>{ago(j.finishedAt ?? j.runAt)}{j.attempts > 1 ? ` · try ${j.attempts}` : ''}</div></span>
                <span className="help" style={{ margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.schoolName ?? 'Every school'}</span>
                <span style={{ minWidth: 0, font: '400 13px/1.4 var(--fb)', color: j.lastError ? 'var(--bad-i)' : 'var(--ink2)', overflowWrap: 'anywhere' }}>{j.lastError ?? j.result ?? ''}</span>
                <span>{app.can('schools.write') && j.status === 'failed' && <button className="btn sm" disabled={retry.isPending} onClick={() => retry.mutate(j.id)}>Retry</button>}</span>
              </div>
            ))}
          </div></div>
        )}
    </Card>
  );
}
