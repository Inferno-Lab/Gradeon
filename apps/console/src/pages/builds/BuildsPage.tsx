import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyCard, Select } from '@gradeon/web-ui';
import type { BuildRow } from '@gradeon/contracts';
import { Card, Page, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { ago } from '../../app/format';

const TONE: Record<BuildRow['status'], string> = { queued: 'b', building: 'b', done: 'g', failed: 'r', unavailable: 'a' };
const LABEL: Record<BuildRow['status'], string> = { queued: 'Queued', building: 'Building', done: 'Ready', failed: 'Failed', unavailable: 'Not started' };

export function BuildsPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [schoolId, setSchoolId] = useState('');
  const builds = useQuery({ queryKey: ['builds'], queryFn: app.api.builds, refetchInterval: 10_000 });
  const schools = useQuery({ queryKey: ['schools'], queryFn: () => app.api.schools() });
  const request = useMutation({
    mutationFn: () => app.api.actions.request({ action: 'build.app', schoolId: schoolId || schools.data![0]!.id, params: { platform: 'android' } }),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['builds'] }); say(r.status === 'failed' ? r.summary : 'Build requested. The install link appears here when it finishes.', r.status === 'failed' ? 'bad' : 'ok'); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  const name = (id: string) => schools.data?.find((s) => s.id === id)?.name ?? 'A school';
  const rows = builds.data ?? [];
  return (
    <Page title="Mobile builds" sub="Each school gets its own app with its name, colours and address built in" toast={toast} loading={builds.isLoading} error={builds.isError ? { message: (builds.error as Error).message, retry: () => void builds.refetch() } : null}
      actions={app.can('builds.write') && schools.data?.length ? (
        <span className="tgrow">
          <Select compact aria-label="School" value={schoolId || schools.data[0]!.id} onChange={setSchoolId} options={schools.data.map((s) => ({ value: s.id, label: s.name }))} />
          <button className="btn pri" onClick={() => request.mutate()} disabled={request.isPending}>Build Android app</button>
        </span>
      ) : undefined}>
      {rows.length === 0 ? (
        <div><EmptyCard title="Builds" chip={{ text: '0 builds', tone: 'v' }} scene="notebooks" heading="No apps built yet" body="Pick a school and build its Android app. The install link appears here when GitHub finishes. iPhone builds need the school’s Apple account." /></div>
      ) : (
        <Card style={{ padding: 0 }}>
          <div className="tbl scroll-x"><div style={{ minWidth: 640 }}>
            <div className="grd th" style={{ '--cols': 'minmax(0,2fr) 90px 100px 130px 110px' } as React.CSSProperties}><span>School</span><span>Phone</span><span>Version</span><span>Status</span><span></span></div>
            {rows.map((b) => (
              <div key={b.id} className="grd rw" style={{ '--cols': 'minmax(0,2fr) 90px 100px 130px 110px' } as React.CSSProperties} data-tip={b.note}>
                <span style={{ minWidth: 0 }}><b style={{ display: 'block', font: '700 14px var(--fb)' }}>{name(b.schoolId)}</b><small style={{ color: 'var(--ink3)' }}>{b.status === 'done' ? `Built ${ago(b.createdAt)}` : b.note}</small></span>
                <span>{b.platform === 'android' ? 'Android' : 'iPhone'}</span><span className="num">{b.version}</span>
                <span className={`st ${TONE[b.status]}`}><i></i>{LABEL[b.status]}</span>
                <span>{b.url && <a className="btn sm" href={b.url} target="_blank" rel="noreferrer">Install</a>}</span>
              </div>
            ))}
          </div></div>
        </Card>
      )}
    </Page>
  );
}
