import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyCard, tintFor } from '@gradeon/web-ui';
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
  const errors = useQuery({ queryKey: ['errors'], queryFn: () => app.api.errors(7), refetchInterval: 60_000 });
  const probe = useMutation({ mutationFn: app.api.probe, onSuccess: (r) => { void qc.invalidateQueries({ predicate: (q) => ['schools', 'fleet'].includes(String(q.queryKey[0])) }); say(`Checked ${r.probed} ${r.probed === 1 ? 'school' : 'schools'}.`); }, onError: (e) => say((e as Error).message, 'bad') });
  const rows = (schools.data ?? []).filter((s) => s.status !== 'archived');
  const order = { down: 0, degraded: 1, unknown: 2, ok: 3 } as const;
  rows.sort((a, b) => order[a.health] - order[b.health]);
  const inc = fleet.data?.incident;
  return (
    <Page title="Health" sub="Each school’s API answers a heartbeat every minute. Slow or silent ones float to the top." toast={toast} loading={schools.isLoading} error={schools.isError ? { message: (schools.error as Error).message, retry: () => void schools.refetch() } : null}
      actions={<button className="btn pri" onClick={() => probe.mutate()} disabled={probe.isPending}>{probe.isPending ? 'Checking…' : 'Check everything now'}</button>}>
      {inc && (
        <div className={`inc ${inc.state === 'resolved' ? 'ok' : ''} rise`} role="status" style={{ padding: 18, borderRadius: 26, background: inc.state === 'resolved' ? 'var(--gS)' : 'var(--ci)', color: inc.state === 'resolved' ? 'var(--gD)' : '#fff' }}>
          <span className={`chip ${inc.state === 'resolved' ? 'g' : 'r'}`}>{inc.state === 'resolved' ? 'Resolved' : `Incident${inc.schoolName ? ` · ${inc.schoolName}` : ''}`}</span>
          <div className="fd" style={{ fontSize: 17, letterSpacing: '-.02em', marginTop: 10 }}>{inc.title}</div>
          <p style={{ margin: '4px 0 0', font: '500 13.5px/1.45 var(--fb)', opacity: .75 }}>{inc.body}</p>
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
        <div><EmptyCard title="Health" chip={{ text: '0 schools', tone: 'v' }} scene="plug" heading="Nothing to watch yet" body="Once a school is live its heartbeat shows here, with how fast its API answers." /></div>
      ) : (
        <Card style={{ padding: 0 }}>
          <div className="tbl scroll-x"><div style={{ minWidth: 620 }}>
            <div className="grd th" style={{ '--cols': 'minmax(0,2fr) 70px 140px 100px 130px' } as React.CSSProperties}><span>School</span><span>Cell</span><span>Status</span><span>Answers in</span><span></span></div>
            {rows.map((s) => {
              const st = statusOf(s); const t = tintFor(s.name);
              return (
                <a key={s.id} className="grd rw" href={url(`/schools/${s.id}`)} onClick={(e) => { e.preventDefault(); app.go(`/schools/${s.id}`); }} style={{ '--cols': 'minmax(0,2fr) 70px 140px 100px 130px', color: 'inherit', textDecoration: 'none' } as React.CSSProperties}>
                  <span style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}><span className="av" style={{ width: 34, height: 34, fontSize: 11, background: t.bg, color: t.fg, boxShadow: 'none' }}>{initials(s.name)}</span><b title={s.name} style={{ font: '700 14px/1.25 var(--fb)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.name}</b></span>
                  <span className="chip">{s.cell}</span><span className={`st ${st.tone}`}><i></i>{st.text}</span><span className="num" style={{ font: '700 13px var(--fb)' }}>{s.healthMs != null ? `${s.healthMs} ms` : '–'}</span><span style={{ color: 'var(--ink3)', font: '600 13px var(--fb)' }}>{s.lastIncident ? 'Had a problem' : ''}</span>
                </a>
              );
            })}
          </div></div>
        </Card>
      )}
      <Card title="Errors in the last 7 days" style={{ padding: 0 }}>
        {errors.isError ? <div className="help" style={{ padding: 18 }}>{(errors.error as Error).message}</div>
          : !(errors.data ?? []).length ? <div className="help" style={{ padding: 18 }}>Nothing has gone wrong in the APIs, the admin, the console or the app.</div>
          : (errors.data ?? []).map((e) => (
            <details key={e.fingerprint} className="rw" style={{ display: 'block', height: 'auto', padding: '12px 18px' }}>
              <summary style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', listStyle: 'none', minWidth: 0 }}>
                <span className="chip">{e.source}</span>
                {e.schoolSlug && <span className="chip v">{e.schoolSlug}</span>}
                <b style={{ flex: 1, minWidth: 0, font: '700 13.5px/1.35 var(--fb)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.message}>{e.message}</b>
                <span className="num" style={{ font: '700 13px var(--fb)' }}>{e.count}×</span>
                <span style={{ color: 'var(--ink3)', font: '600 13px var(--fb)', whiteSpace: 'nowrap' }}>{ago(e.lastAt)}</span>
              </summary>
              <div className="help" style={{ marginTop: 8 }}>{e.url ?? ''}{e.release ? ` · release ${e.release}` : ''} · first seen {ago(e.firstAt)}</div>
              {e.stack && <pre style={{ margin: '8px 0 0', padding: 12, borderRadius: 12, background: 'var(--sunk)', font: '500 12px/1.5 var(--fm, monospace)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 260, overflow: 'auto' }}>{e.stack}</pre>}
            </details>
          ))}
      </Card>
    </Page>
  );
}
