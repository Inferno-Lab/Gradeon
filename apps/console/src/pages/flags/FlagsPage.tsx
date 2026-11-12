import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FlagRow } from '@gradeon/contracts';
import { Dialog, EmptyCard, Field, MenuButton, useShake } from '@gradeon/web-ui';
import { Card, Page, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { ago } from '../../app/format';

type Ask = { key: string; label: string; enabled: boolean; schoolId: string | null; what: string } | { remove: FlagRow };

/**
 * Switches for features still being finished: off for everyone, on for one school first, then for everyone. Pausing a module
 * that is in trouble is on Plans and modules, not here (`kill.*` flags are kept out of this list).
 */
export function FlagsPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [err, setErr] = useState('');
  const [ask, setAsk] = useState<Ask | null>(null);
  const [menuFor, setMenuFor] = useState('');
  const shake = useShake();
  const flags = useQuery({ queryKey: ['flags'], queryFn: app.api.flags.list });
  const schools = useQuery({ queryKey: ['schools'], queryFn: () => app.api.schools() });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['flags'] });
  const set = useMutation({
    mutationFn: (b: { key: string; enabled: boolean; schoolId?: string | null; label?: string }) => app.api.flags.set(b.key, { enabled: b.enabled, schoolId: b.schoolId, label: b.label }),
    onSuccess: () => { refresh(); setAsk(null); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  const remove = useMutation({
    mutationFn: (f: FlagRow) => app.api.flags.remove(f.key, f.schoolId),
    onSuccess: (_, f) => { refresh(); setAsk(null); say(f.schoolId ? 'Cleared for that school: it follows everyone again.' : 'Flag deleted.'); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  const rows = (flags.data ?? []).filter((f) => !f.key.startsWith('kill.'));
  const fleet = rows.filter((f) => f.scope === 'fleet');
  const per = (k: string) => rows.filter((f) => f.scope === 'school' && f.key === k);
  const canWrite = app.can('flags.write');
  const name = (id: string | null) => schools.data?.find((s) => s.id === id)?.name ?? 'a school';
  const add = () => {
    if (!/^[a-z][a-z0-9._-]{2,40}$/.test(key)) { setErr('Use lowercase letters, numbers, dots or dashes, 3 to 41 long. Example: new.report-cards'); shake.hit(); return; }
    if (key.startsWith('kill.')) { setErr('Pausing a module is done on Plans and modules.'); shake.hit(); return; }
    set.mutate({ key, enabled: false, label: label.trim() || key }, { onSuccess: () => { setKey(''); setLabel(''); say('Flag added, switched off for everyone.'); } });
  };
  return (
    <Page title="Flags" sub="Switch a feature on for one school, then everyone, without shipping anything" toast={toast} loading={flags.isLoading} error={flags.isError ? { message: (flags.error as Error).message, retry: () => void flags.refetch() } : null}
      overlays={ask && (
        <Dialog title={'remove' in ask ? `Delete ${ask.remove.label}?` : ask.what} tag={{ text: 'remove' in ask ? 'Every school' : ask.schoolId ? name(ask.schoolId) : 'Every school', tone: 'a' }} onClose={() => setAsk(null)} width={460}>
          <p style={{ marginTop: 0 }}>{'remove' in ask ? 'The code that reads it treats it as off. Do this once the feature no longer needs a switch.' : ask.schoolId ? 'Only this school changes; it applies within a minute.' : 'Every school changes within a minute, except schools set on their own below.'}</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn" onClick={() => setAsk(null)}>Cancel</button>
            {'remove' in ask
              ? <button className="btn dngf" disabled={remove.isPending} onClick={() => remove.mutate(ask.remove)}>Delete</button>
              : <button className="btn pri" disabled={set.isPending} onClick={() => set.mutate({ key: ask.key, enabled: ask.enabled, schoolId: ask.schoolId, label: ask.label })}>{ask.enabled ? 'Switch on' : 'Switch off'}</button>}
          </div>
        </Dialog>
      )}>
      <Card title="Flags" chip={<span className="chip">{fleet.length}</span>}>
        {fleet.length === 0 && <EmptyCard title="Flags" chip={{ text: '0 flags', tone: 'v' }} scene="checklist" heading="No flags yet" body="Add a flag to ship a feature switched off, then turn it on for one school before the rest." />}
        {fleet.map((f) => (
          <div key={f.key} style={{ padding: '16px 0', borderTop: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 240px', minWidth: 0 }}><b style={{ font: '700 14px var(--fb)', display: 'block' }}>{f.label}</b><small style={{ font: '500 13px var(--fb)', color: 'var(--ink3)' }}>{f.key} · changed {ago(f.updatedAt)} by {f.updatedBy}</small></div>
              {canWrite && (
                <MenuButton label="For one school" chevron open={menuFor === f.key} onOpenChange={(o) => setMenuFor(o ? f.key : '')} menuLabel="Choose a school">
                  {(schools.data ?? []).filter((s) => !per(f.key).some((x) => x.schoolId === s.id)).map((s) => (
                    <button key={s.id} role="menuitem" onClick={() => { setMenuFor(''); setAsk({ key: f.key, label: f.label, enabled: !f.enabled, schoolId: s.id, what: `${f.enabled ? 'Switch off' : 'Switch on'} ${f.label} at ${s.name}?` }); }}>{s.name}</button>
                  ))}
                </MenuButton>
              )}
              {canWrite && <button className="btn sm dng" onClick={() => setAsk({ remove: f })}>Delete</button>}
              <span className="lbl" style={{ margin: 0 }}>Everyone</span>
              <button className={`sw ${f.enabled ? 'on' : ''}`} role="switch" aria-checked={f.enabled} aria-label={`${f.label} for everyone`} disabled={!canWrite}
                onClick={() => setAsk({ key: f.key, label: f.label, enabled: !f.enabled, schoolId: null, what: `${f.enabled ? 'Switch off' : 'Switch on'} ${f.label} for everyone?` })}></button>
            </div>
            {per(f.key).map((x) => (
              <div key={x.schoolId} className="kv" style={{ paddingLeft: 24 }}>
                <span>{name(x.schoolId)}<br /><small style={{ color: 'var(--ink3)' }}>Set on its own · {ago(x.updatedAt)} by {x.updatedBy}</small></span>
                <b style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {canWrite && <button className="btn sm" onClick={() => remove.mutate(x)}>Follow everyone</button>}
                  <button className={`sw ${x.enabled ? 'on' : ''}`} role="switch" aria-checked={x.enabled} aria-label={`${f.label} at ${name(x.schoolId)}`} disabled={!canWrite}
                    onClick={() => setAsk({ key: f.key, label: f.label, enabled: !x.enabled, schoolId: x.schoolId, what: `${x.enabled ? 'Switch off' : 'Switch on'} ${f.label} at ${name(x.schoolId)}?` })}></button>
                </b>
              </div>
            ))}
          </div>
        ))}
      </Card>
      {canWrite && (
        <Card title="New flag">
          <div className={shake.cls} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(240px,100%),1fr))', gap: 12 }}>
            <Field label="Key" value={key} onChange={(v) => { setKey(v); setErr(''); }} error={err} placeholder="new.report-cards" hint="The name the code checks." />
            <Field label="What it does" value={label} onChange={setLabel} placeholder="New report card layout" />
          </div>
          <button className="btn pri" style={{ marginTop: 12 }} onClick={add} disabled={set.isPending}>Add flag</button>
        </Card>
      )}
    </Page>
  );
}
