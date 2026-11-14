import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Field, Select, EmptyState, EmptyNote } from '@gradeon/web-ui';
import type { BuildRow } from '@gradeon/contracts';
import { Card, Page, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { url } from '../../app/base';
import { ago } from '../../app/format';

const TONE: Record<BuildRow['status'], string> = { queued: 'v', building: 'v', done: 'g', failed: 'c', unavailable: 'a' };
const LABEL: Record<BuildRow['status'], string> = { queued: 'Queued', building: 'Building', done: 'Ready', failed: 'Failed', unavailable: 'Not set up' };
const COLS = 'minmax(0,2fr) 90px 100px 130px 110px';

/** Every school's app builds. A build is started from the school's Technical tab, where its own builds are. */
export function BuildsPage() {
  const app = useApp();
  const { toast, say } = useToast();
  const [school, setSchool] = useState('');
  const [status, setStatus] = useState('');
  const builds = useQuery({ queryKey: ['builds'], queryFn: app.api.builds, refetchInterval: 10_000 });
  const schools = useQuery({ queryKey: ['schools'], queryFn: () => app.api.schools() });
  const name = (id: string) => schools.data?.find((s) => s.id === id)?.name ?? 'A school';
  const all = builds.data ?? [];
  const rows = all.filter((b) => (!school || b.schoolId === school) && (!status || b.status === status));
  const open = (id: string) => (e: React.MouseEvent) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); app.go(`/schools/${id}/technical`); };
  return (
    <Page title="Mobile builds" sub="Each school gets its own app with its name, colours and address built in" toast={toast} loading={builds.isLoading} error={builds.isError ? { message: (builds.error as Error).message, retry: () => void builds.refetch() } : null}>
      {all.length === 0 ? (
        <div><EmptyState scene="builds" label="Choose a school" onAction={() => app.go('/schools')} /></div>
      ) : (
        <Card style={{ padding: 0 }}>
          <div className="ch" style={{ padding: '20px 20px 8px', flexWrap: 'wrap', gap: 10 }}>
            <Select compact aria-label="School" value={school} onChange={setSchool} options={[{ value: '', label: 'Every school' }, ...(schools.data ?? []).map((s) => ({ value: s.id, label: s.name }))]} />
            <Select compact aria-label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'Every status' }, ...Object.entries(LABEL).map(([value, label]) => ({ value, label }))]} />
          </div>
          {rows.length === 0 ? <div style={{ padding: '0 20px 20px' }}><EmptyNote icon="search" title="No build matches" body="Try another school or state, or clear the filters." /></div> : (
            <div className="tbl scroll-x"><div style={{ minWidth: 640 }}>
              <div className="grd th" style={{ '--cols': COLS } as React.CSSProperties}><span>School</span><span>Phone</span><span>Version</span><span>Status</span><span></span></div>
              {rows.map((b) => (
                <div key={b.id} className="grd rw" style={{ '--cols': COLS, height: 'auto', minHeight: 58 } as React.CSSProperties}>
                  <span style={{ minWidth: 0 }}>
                    <a href={url(`/schools/${b.schoolId}/technical`)} onClick={open(b.schoolId)} style={{ display: 'block', font: '700 14px var(--fb)', color: 'inherit' }}>{name(b.schoolId)}</a>
                    <small style={{ color: b.status === 'failed' ? 'var(--bad)' : 'var(--ink3)' }}>{b.status === 'done' ? `Built ${ago(b.createdAt)}` : b.note}</small>
                  </span>
                  <span>{b.platform === 'android' ? 'Android' : 'iPhone'}</span><span className="num">{b.version}</span>
                  <span className={`st ${TONE[b.status]}`}><i></i>{LABEL[b.status]}</span>
                  <span>{b.url ? <a className="btn sm" href={b.url} target="_blank" rel="noreferrer">Install</a> : b.status === 'failed' ? <a className="btn sm" href={url(`/schools/${b.schoolId}/technical`)} onClick={open(b.schoolId)}>Open</a> : null}</span>
                </div>
              ))}
            </div></div>
          )}
        </Card>
      )}
      <BuildSettings say={say} />
    </Page>
  );
}

/** The id every new school's app is listed under in the stores starts with this; an app already built keeps its id. */
function BuildSettings({ say }: { say: (m: string, tone?: 'ok' | 'bad') => void }) {
  const app = useApp();
  const qc = useQueryClient();
  const policy = useQuery({ queryKey: ['policy'], queryFn: app.api.policy.get });
  const [prefix, setPrefix] = useState('');
  useEffect(() => { if (policy.data) setPrefix(policy.data.naming.bundlePrefix); }, [policy.data]);
  const save = useMutation({
    mutationFn: () => app.api.policy.set({ ...policy.data!, naming: { ...policy.data!.naming, bundlePrefix: prefix.trim() } }),
    onSuccess: (p) => { qc.setQueryData(['policy'], p); say('Saved. Schools built for the first time from now use it.'); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  const can = app.can('policy.write');
  const ok = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+\.?$/.test(prefix.trim());
  return (
    <Card title="Build settings">
      <Field label="App id prefix" value={prefix} onChange={setPrefix} disabled={!can} error={prefix && !ok ? 'Like com.yourcompany. (lowercase words joined by dots)' : undefined}
        hint={`A school’s app id is this and its address, like ${prefix.trim().replace(/\.?$/, '.')}yourschool. An app already in a store keeps the id it has.`} />
      {can && <button className="btn pri" style={{ marginTop: 12 }} disabled={!ok || prefix.trim() === policy.data?.naming.bundlePrefix || save.isPending} onClick={() => save.mutate()}>Save</button>}
    </Card>
  );
}
