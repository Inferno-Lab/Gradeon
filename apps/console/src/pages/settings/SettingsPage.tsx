import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ACTIONS, ACTION_LABELS, CONSOLE_ROLES, CONSOLE_ROLE_INFO, type ConsoleRole, type PolicyDoc, type ThemeColors } from '@gradeon/contracts';
import { AreaField, Dialog, useShake } from '@gradeon/web-ui';
import { Card, Page, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { usePageTabs } from '../../app/tabs';
import { ThemeEditor } from '../../app/ThemeEditor';

type Say = (text: string, tone?: 'ok' | 'bad') => void;

/** What configures the console itself: its colours, and which changes need a second person (and the freeze). */
export function SettingsPage() {
  const { tab, tabs } = usePageTabs('/settings');
  const { toast, say } = useToast();
  return (
    <Page title="Console settings" sub="How this console looks and which changes need a second person" toast={toast} actions={tabs}>
      {tab === 'rules' ? <Rules say={say} /> : <Colours say={say} />}
    </Page>
  );
}

/** The console's own colours, for everyone who uses it. A school's colours are under its Configuration → Look. */
function Colours({ say }: { say: Say }) {
  const app = useApp();
  const qc = useQueryClient();
  const saved = useQuery({ queryKey: ['console-theme'], queryFn: app.api.theme.get });
  const [draft, setDraft] = useState<ThemeColors | null>(null);
  const can = app.can('policy.write');
  const value = draft ?? saved.data ?? {};
  const save = useMutation({
    mutationFn: () => app.api.theme.set(value),
    onSuccess: (v) => { qc.setQueryData(['console-theme'], v); setDraft(null); say('Saved. The console wears the new colours for everyone.'); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  return (
    <Card title="Console colours">
      <div className="help">Every colour of this console, in light and dark. Changes show in the preview first and apply to everyone once saved.</div>
      <div style={{ marginTop: 16 }}><ThemeEditor scope="console" value={value} onChange={setDraft} disabled={!can || saved.isLoading} /></div>
      {can && (
        <div className="tgrow" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn" disabled={!draft || save.isPending} onClick={() => setDraft(null)}>Discard</button>
          <button className="btn pri" disabled={!draft || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save colours'}</button>
        </div>
      )}
    </Card>
  );
}

/** Which actions wait for a second person and which roles may approve them, from the one action list; and the freeze. */
function Rules({ say }: { say: Say }) {
  const app = useApp();
  const qc = useQueryClient();
  const policy = useQuery({ queryKey: ['policy'], queryFn: app.api.policy.get });
  const [pol, setPol] = useState<PolicyDoc | null>(null);
  const [freezing, setFreezing] = useState(false);
  useEffect(() => { if (policy.data) setPol(policy.data); }, [policy.data]);
  const can = app.can('policy.write');
  const save = useMutation({
    mutationFn: (p: PolicyDoc) => app.api.policy.set(p),
    onSuccess: (p) => { qc.setQueryData(['policy'], p); setPol(p); setFreezing(false); say(p.freeze ? 'Changes are frozen. Every page says so until it is lifted.' : 'Rules saved.'); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  if (!pol) return <div className="skc" style={{ height: 320, borderRadius: 28 }} />;
  const dirty = JSON.stringify(pol) !== JSON.stringify(policy.data);
  const rule = (a: string) => pol.approvals[a] ?? { needed: false, roles: ['super_admin'] as ConsoleRole[] };
  const setRule = (a: string, r: PolicyDoc['approvals'][string]) => setPol({ ...pol, approvals: { ...pol.approvals, [a]: r } });
  return (
    <>
      <Card title="Freeze changes" chip={<span className={`chip ${pol.freeze ? 'c' : 'g'}`}>{pol.freeze ? 'Frozen' : 'Off'}</span>}>
        <div className="help" style={{ marginTop: 0 }}>{pol.freeze ? `Frozen: ${pol.freezeReason || 'no reason given'}. Nothing changes in any school except pausing one.` : 'Stops every change across the fleet, except pausing a school. For an incident or an audit.'}</div>
        {can && <button className={`btn ${pol.freeze ? '' : 'dng'}`} style={{ marginTop: 12 }} disabled={save.isPending} onClick={() => (pol.freeze ? save.mutate({ ...policy.data!, freeze: false, freezeReason: '' }) : setFreezing(true))}>{pol.freeze ? 'Lift the freeze' : 'Freeze changes…'}</button>}
      </Card>
      <Card title="Needs a second person">
        <div className="help" style={{ marginTop: 0 }}>A request for one of these waits on Approvals until someone else in one of the chosen roles says yes. Nobody approves their own.</div>
        {ACTIONS.map((a) => {
          const r = rule(a);
          return (
            <div key={a} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 220px', font: '600 14px var(--fb)' }}>{ACTION_LABELS[a]}</span>
              {r.needed && (
                <span className="tgrow" style={{ gap: 6 }} role="group" aria-label={`Who may approve: ${ACTION_LABELS[a]}`}>
                  {CONSOLE_ROLES.filter((x) => x !== 'auditor').map((x) => {
                    const on = r.roles.includes(x);
                    return <button key={x} type="button" className={`fp ${on ? 'on' : ''}`} aria-pressed={on} disabled={!can || (on && r.roles.length === 1)} onClick={() => setRule(a, { ...r, roles: on ? r.roles.filter((y) => y !== x) : [...r.roles, x] })}>{CONSOLE_ROLE_INFO[x].label}</button>;
                  })}
                </span>
              )}
              <button className={`sw ${r.needed ? 'on' : ''}`} role="switch" aria-checked={r.needed} aria-label={ACTION_LABELS[a]} disabled={!can} onClick={() => setRule(a, { ...r, needed: !r.needed })}></button>
            </div>
          );
        })}
        {can && <div className="tgrow" style={{ marginTop: 12 }}><button className="btn pri" disabled={!dirty || save.isPending} onClick={() => save.mutate(pol)}>Save rules</button><button className="btn" disabled={!dirty} onClick={() => setPol(policy.data!)}>Discard</button></div>}
      </Card>
      {freezing && <FreezeDialog busy={save.isPending} onClose={() => setFreezing(false)} onFreeze={(reason) => save.mutate({ ...policy.data!, freeze: true, freezeReason: reason })} />}
    </>
  );
}

function FreezeDialog({ busy, onClose, onFreeze }: { busy: boolean; onClose: () => void; onFreeze: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const shake = useShake();
  return (
    <Dialog title="Freeze every change?" tag={{ text: 'Whole fleet', tone: 'a' }} onClose={onClose} width={480} shake={shake.cls}>
      <p style={{ marginTop: 0 }}>Nobody can change a school, run a release or take a connection live until the freeze is lifted. Pausing a school still works. Every console page shows the reason.</p>
      <AreaField label="Why" value={reason} onChange={(v) => { setReason(v); setErr(''); }} error={err} rows={2} maxLength={200} placeholder="For example: incident on cell A, until it is understood" />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn dngf" disabled={busy} onClick={() => { if (reason.trim().length < 5) { setErr('Say why, in a few words.'); shake.hit(); } else onFreeze(reason.trim()); }}>Freeze</button>
      </div>
    </Dialog>
  );
}
