import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MODULES } from '@gradeon/config-engine';
import { EmptyCard, Field, SelectField, useShake } from '@gradeon/web-ui';
import { Card, Page, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { ago } from '../../app/format';

export function FlagsPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [err, setErr] = useState('');
  const [kill, setKill] = useState({ module: 'homework', school: '' });
  const shake = useShake();
  const flags = useQuery({ queryKey: ['flags'], queryFn: app.api.flags.list });
  const schools = useQuery({ queryKey: ['schools'], queryFn: () => app.api.schools() });
  const set = useMutation({
    mutationFn: (b: { key: string; enabled: boolean; schoolId?: string | null; label?: string }) => app.api.flags.set(b.key, { enabled: b.enabled, schoolId: b.schoolId, label: b.label }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['flags'] }); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  const rows = flags.data ?? [];
  const paused = rows.filter((f) => f.key.startsWith('kill.') && f.enabled);
  const fleet = rows.filter((f) => f.scope === 'fleet');
  const per = rows.filter((f) => f.scope === 'school');
  const canWrite = app.can('flags.write');
  const school = (id: string | null) => schools.data?.find((s) => s.id === id)?.name ?? 'one school';
  const add = () => {
    if (!/^[a-z][a-z0-9._-]{2,40}$/.test(key)) { setErr('Use lowercase letters, numbers, dots or dashes, 3 to 41 long. Example: new.report-cards'); shake.hit(); return; }
    set.mutate({ key, enabled: false, label: label.trim() || key }, { onSuccess: () => { setKey(''); setLabel(''); say('Flag added, switched off.'); } });
  };
  return (
    <Page title="Flags" sub="Switch a feature on for everyone, or for one school, without shipping anything" toast={toast} loading={flags.isLoading} error={flags.isError ? { message: (flags.error as Error).message, retry: () => void flags.refetch() } : null}>
      <section className="grid">
        <Card title="Everyone" chip={<span className="chip">{fleet.length}</span>} span="s12">
          {fleet.length === 0 && <EmptyCard title="Flags" chip={{ text: '0 flags', tone: 'v' }} scene="checklist" heading="No flags yet" body="Add a flag to ship a feature switched off, then turn it on for one school before the rest." />}
          {fleet.map((f) => (
            <div className="tgl" key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '14px 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ flex: 1, minWidth: 0 }}><b style={{ font: '700 14.5px var(--fb)', display: 'block' }}>{f.label}</b><small style={{ font: '500 13px var(--fb)', color: 'var(--ink3)' }}>{f.key} · changed {ago(f.updatedAt)} by {f.updatedBy}</small></div>
              <button className={`sw ${f.enabled ? 'on' : ''}`} role="switch" aria-checked={f.enabled} aria-label={f.label} disabled={!canWrite || set.isPending} onClick={() => set.mutate({ key: f.key, enabled: !f.enabled })}></button>
            </div>
          ))}
        </Card>
        <Card title="Only some schools" chip={<span className="chip">{per.length}</span>} span="s12">
          {per.length === 0 && <div className="help">A flag you switch on for a single school shows up here.</div>}
          {per.map((f) => (
            <div className="kv" key={`${f.key}-${f.schoolId}`}><span>{f.label}<br /><small style={{ color: 'var(--ink3)' }}>{school(f.schoolId)}</small></span><b><span className={`st ${f.enabled ? 'g' : 'n'}`}><i></i>{f.enabled ? 'On' : 'Off'}</span></b></div>
          ))}
        </Card>
        <div className="s12 fpair" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(340px,100%),1fr))', gap: 18 }}>
          {canWrite && (
            <Card title="Pause a feature" chip={<span className={`chip ${paused.length ? 'r' : 'g'}`}>{paused.length} paused</span>}>
              <div className="help" style={{ marginBottom: 12 }}>A kill switch takes a feature away from the app and refuses its requests within seconds. Lift it by switching the flag off.</div>
              <SelectField label="Feature" value={kill.module} onChange={(module) => setKill({ ...kill, module })} options={MODULES.filter((m) => !m.core && m.state !== 'planned').map((m) => ({ value: m.key, label: m.name }))} />
              <SelectField label="For" value={kill.school} onChange={(school) => setKill({ ...kill, school })} options={[{ value: '', label: 'Every school' }, ...(schools.data ?? []).map((s) => ({ value: s.id, label: s.name }))]} />
              <button className="btn dngf" style={{ marginTop: 14 }} disabled={set.isPending} onClick={() => set.mutate({ key: `kill.${kill.module}`, enabled: true, schoolId: kill.school || null, label: `${MODULES.find((m) => m.key === kill.module)?.name ?? kill.module} paused` }, { onSuccess: () => say('Paused. It takes effect within a few seconds.') })}>Pause it</button>
            </Card>
          )}
          {canWrite && (
            <Card title="New flag">
              <div className={shake.cls}>
                <Field label="Key" value={key} onChange={(v) => { setKey(v); setErr(''); }} error={err} placeholder="new.report-cards" />
                <Field label="What it does" value={label} onChange={setLabel} placeholder="New report card layout" />
              </div>
              <button className="btn pri" style={{ marginTop: 14 }} onClick={add} disabled={set.isPending}>Add flag</button>
            </Card>
          )}
        </div>
      </section>
    </Page>
  );
}
