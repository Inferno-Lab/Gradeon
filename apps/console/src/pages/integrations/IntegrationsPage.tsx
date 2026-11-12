import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HttpError } from '@gradeon/api-client';
import {
  CAPABILITIES, CAPABILITY_LABELS, DELIVERY_STATUSES, INTEGRATION_PROVIDERS, LANGUAGES, MESSAGE_EVENTS, PLATFORM_CAPABILITIES, SYSTEM_MESSAGES, fieldProblem, providerDef,
  type Capability, type ConnectionRow, type DeliveryRow, type IntegrationsView, type ProviderField, type RouteRow, type SchoolRow, type TemplateRow,
} from '@gradeon/contracts';
import { Checkbox, Dialog, EmptyCard, Field, FilePick, NumberField, Segmented, Select, SelectField, useShake, Icon, type IconName } from '@gradeon/web-ui';
import { Card, Page, Tiles, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { ago, count, rupees, when } from '../../app/format';
import { tabsOf } from '../../app/nav';

type Tab = 'connections' | 'routing' | 'templates' | 'activity' | 'webhooks';
const fields = (e: unknown): Record<string, string> => (e instanceof HttpError && Object.keys(e.fields).length ? e.fields : { _: (e as Error).message });
const STATE: Record<ConnectionRow['state'], { text: string; tone: string }> = { draft: { text: 'Draft', tone: '' }, test: { text: 'Test', tone: 'a' }, live: { text: 'Live', tone: 'g' }, paused: { text: 'Paused', tone: 'c' } };
const DELIVERY: Record<DeliveryRow['status'], string> = { queued: 'a', held: 'v', sent: 'v', delivered: 'g', read: 'g', failed: 'c', refused: 'c' };
/** Route settings a capability uses, on top of its connection's own. */
const ROUTE_FIELDS: Partial<Record<Capability, { key: string; label: string; placeholder: string }[]>> = {
  sms: [{ key: 'senderId', label: 'Sender ID for this route', placeholder: 'GRNFLD' }],
  email: [{ key: 'from', label: 'From address for this route', placeholder: 'Your School <office@yourschool.org>' }],
  storage: [{ key: 'prefix', label: 'Folder prefix in the bucket', placeholder: 'gradeon/' }],
};
const MESSAGE_KEYS = [...SYSTEM_MESSAGES.map((m) => ({ key: m.key, label: m.label, text: m.text })), ...MESSAGE_EVENTS.map((m) => ({ key: m.key, label: m.label, text: m.text }))];

export function IntegrationsPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  // The tabs have addresses (/integrations/routing); the Test inbox is there only while messages go to it.
  const { tab: asked } = useParams({ strict: false }) as { tab?: string };
  const [dlg, setDlg] = useState<
    | { kind: 'add' } | { kind: 'edit'; c: ConnectionRow } | { kind: 'test'; c: ConnectionRow } | { kind: 'route'; capability: Capability; schoolId: string | null; route?: RouteRow }
    | { kind: 'template'; connectionId: string; messageKey: string; t?: TemplateRow } | { kind: 'allow' } | { kind: 'delete'; c: ConnectionRow } | null>(null);
  const view = useQuery({ queryKey: ['integrations'], queryFn: app.api.integrations.view });
  const schools = useQuery({ queryKey: ['schools'], queryFn: () => app.api.schools() });
  const write = app.can('integrations.write');
  const refresh = () => void qc.invalidateQueries({ predicate: (q) => ['integrations', 'actions', 'activity'].includes(String(q.queryKey[0])) });
  const done = (m: string) => { setDlg(null); refresh(); say(m); };
  const v = view.data;
  const live = (schools.data ?? []).filter((s) => s.status !== 'archived');
  const tabList = tabsOf('/integrations', app.can).filter((t) => t.key !== 'inbox' || v?.mode !== 'live');
  const tab = (tabList.find((t) => t.key === asked)?.key ?? 'connections') as Tab | 'inbox';
  const counts: Record<string, number | undefined> = { connections: v?.connections.length, routing: v?.routes.length, templates: v?.templates.length };
  const gaps = useQuery({ queryKey: ['integrations', 'gaps'], queryFn: app.api.integrations.gaps });
  const mode = useMutation({
    mutationFn: (m: 'sandbox' | 'live') => app.api.integrations.mode(m),
    onSuccess: (r) => { refresh(); say(r.action ? 'Asked for approval to switch to live messages. A second person approves it under Approvals.' : 'Back to sandbox: messages go to the Test inbox again.'); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  const act = useMutation({
    mutationFn: async ({ c, what }: { c: ConnectionRow; what: 'live' | 'pause' | 'resume' }) => {
      if (what === 'live') { const a = await app.api.integrations.live(c.id); return a.status === 'pending_approval' ? `Asked for approval to take ${c.name} live. A second person approves it under Approvals.` : `${c.name} is live.`; }
      await app.api.integrations.update(c.id, { state: what === 'pause' ? 'paused' : 'test' });
      return what === 'pause' ? `${c.name} is paused: its routes use their fallback.` : `${c.name} is back in test.`;
    },
    onSuccess: (m) => { refresh(); say(m); }, onError: (e) => say((e as Error).message, 'bad'),
  });
  return (
    <Page title="Integrations" sub="Every third party the platform talks to: messages, payments, files and maps. Added, tested, routed and taken live from here, with no deploy." toast={toast}
      loading={view.isLoading} error={view.isError ? { message: (view.error as Error).message, retry: () => void view.refetch() } : null}
      actions={write ? <button className="btn pri" onClick={() => setDlg({ kind: 'add' })}><Icon name="plus" />Add a connection</button> : undefined}
      overlays={v && <>
        {dlg?.kind === 'add' && <ConnectionDialog schools={live} onClose={() => setDlg(null)} onDone={done} />}
        {dlg?.kind === 'edit' && <ConnectionDialog schools={live} c={dlg.c} onClose={() => setDlg(null)} onDone={done} />}
        {dlg?.kind === 'test' && <TestDialog c={dlg.c} onClose={() => { setDlg(null); refresh(); }} />}
        {dlg?.kind === 'route' && <RouteDialog view={v} schools={live} {...dlg} onClose={() => setDlg(null)} onDone={done} />}
        {dlg?.kind === 'template' && <TemplateDialog {...dlg} onClose={() => setDlg(null)} onDone={done} />}
        {dlg?.kind === 'allow' && <AllowDialog list={v.allowList} onClose={() => setDlg(null)} onDone={done} />}
        {dlg?.kind === 'delete' && <DeleteDialog c={dlg.c} onClose={() => setDlg(null)} onDone={done} />}
      </>}>
      {v && <>
        <div className="card rise" role="status" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', background: v.mode === 'live' ? 'var(--ok-s)' : 'var(--warn-s)', color: v.mode === 'live' ? 'var(--ok-i)' : 'var(--warn-i)' }}>
          <span className={`chip ${v.mode === 'live' ? 'g' : 'a'}`}>{v.mode === 'live' ? 'Live mode' : 'Sandbox mode'}</span>
          <span style={{ flex: 1, minWidth: 220, font: '600 13px/1.45 var(--fb)' }}>
            {v.mode === 'live' ? 'Real providers send to families. A capability without a live connection fails and says so; nothing falls back to the Test inbox.'
              : `Messages go to the Test inbox, except to the ${v.allowList.length} ${v.allowList.length === 1 ? 'number or address' : 'numbers and addresses'} on the allow-list, which get real messages through test or live connections.`}
          </span>
          {v.mode === 'sandbox' && write && <button className="btn sm" onClick={() => setDlg({ kind: 'allow' })}>Allow-list</button>}
          {write && <button className={`btn sm ${v.mode === 'sandbox' ? 'pri' : ''}`} disabled={mode.isPending} onClick={() => mode.mutate(v.mode === 'sandbox' ? 'live' : 'sandbox')}>{v.mode === 'sandbox' ? 'Switch to live…' : 'Back to sandbox'}</button>}
        </div>
        {v.mode === 'sandbox' && !!gaps.data?.gaps.length && (
          <Card title="Before live messages" chip={<span className="chip a">{gaps.data.gaps.length} to do</span>}>
            {gaps.data.gaps.map((g) => <div key={g} className="kv" style={{ height: 'auto', padding: '6px 0' }}><span style={{ font: '400 13px/1.45 var(--fb)' }}>{g}</span></div>)}
          </Card>
        )}
        <Tiles items={[
          { label: 'Connections', value: v.connections.length, note: `${v.connections.filter((c) => c.state === 'live').length} live · ${v.connections.filter((c) => c.health.ok === false).length} failing`, tone: 'v' },
          { label: 'Sent this month', value: count(v.connections.reduce((n, c) => n + c.usage.count, 0)), note: 'through real providers', tone: 'a' },
          { label: 'Cost this month', value: rupees(v.connections.reduce((n, c) => n + c.usage.costPaise, 0) / 100), note: 'from each connection’s price', tone: 'i' },
        ]} />
        <Segmented label="Integrations" value={tab} onChange={(k) => app.go(k === 'connections' ? '/integrations' : `/integrations/${k}`)} options={tabList.map((t) => ({ value: t.key, label: t.label, count: counts[t.key] }))} />
        {tab === 'connections' && <Connections v={v} write={write} busy={act.isPending} onEdit={(c) => setDlg({ kind: 'edit', c })} onTest={(c) => setDlg({ kind: 'test', c })} onDelete={(c) => setDlg({ kind: 'delete', c })}
          onAct={(c, what) => act.mutate({ c, what })} onAdd={() => setDlg({ kind: 'add' })} />}
        {tab === 'routing' && <Routing v={v} schools={live} write={write} onEdit={(capability, schoolId, route) => setDlg({ kind: 'route', capability, schoolId, route })} />}
        {tab === 'templates' && <Templates v={v} write={write} say={say} onEdit={(connectionId, messageKey, t) => setDlg({ kind: 'template', connectionId, messageKey, t })} />}
        {tab === 'activity' && <Activity schools={live} write={write} say={say} />}
        {tab === 'webhooks' && <Webhooks v={v} say={say} />}
        {tab === 'inbox' && <TestInbox schools={live} />}
      </>}
    </Page>
  );
}

function Connections({ v, write, busy, onEdit, onTest, onDelete, onAct, onAdd }: {
  v: IntegrationsView; write: boolean; busy: boolean; onEdit: (c: ConnectionRow) => void; onTest: (c: ConnectionRow) => void; onDelete: (c: ConnectionRow) => void;
  onAct: (c: ConnectionRow, what: 'live' | 'pause' | 'resume') => void; onAdd: () => void;
}) {
  if (!v.connections.length) {
    return <div><EmptyCard title="Connections" chip={{ text: '0 connections', tone: 'v' }} scene="plug" heading="Everything goes to the Test inbox"
      body="Until a connection is added, texts, emails and WhatsApp messages land in the Test inbox, files are kept in the registry, and payments open a test checkout. Add a provider to reach real families."
      actions={write ? <button className="btn pri" onClick={onAdd}>Add a connection</button> : undefined} /></div>;
  }
  const groups = CAPABILITIES.map((cap) => ({ cap, list: v.connections.filter((c) => providerDef(c.provider)?.capabilities[0] === cap) })).filter((g) => g.list.length);
  return (
    <>
      {groups.map((g) => (
        <section key={g.cap} className="grid" data-even="">
          {g.list.map((c) => {
            const def = providerDef(c.provider);
            const st = STATE[c.state];
            return (
              <Card key={c.id} span="s6" title={c.name} chip={<><span className="chip v">{CAPABILITY_LABELS[g.cap]}</span><span className={`chip ${st.tone}`}>{st.text}</span></>}>
                <div className="kv">Provider<b>{def?.name ?? c.provider}</b></div>
                <div className="kv">Serves<b style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-tip={c.schoolName ?? 'Every school without its own'}>{c.scope === 'platform' ? 'Gradeon-wide' : c.schoolName}</b></div>
                <div className="kv">Health<b className={`st ${c.health.ok === null ? '' : c.health.ok ? 'g' : 'c'}`} data-tip={c.health.error ?? undefined} style={{ minWidth: 0 }}>
                  <i></i>{c.health.ok === null ? 'Not tested yet' : c.health.ok ? `Healthy · ${ago(c.health.checkedAt)}` : `Failing · ${ago(c.health.checkedAt)}`}</b></div>
                {c.health.ok === false && c.health.error && <div className="help" style={{ padding: '0 0 8px', overflowWrap: 'anywhere' }}>{c.health.error}</div>}
                <div className="kv">This month<b className="num">{count(c.usage.count)}{c.usage.costPaise ? ` · ${rupees(c.usage.costPaise / 100)}` : ''}</b></div>
                <div className="kv">Keys<b style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.secretsSet.length ? c.secretsSet.map((s) => `${s.key} ••${s.ending}`).join(' · ') : 'None'}</b></div>
                {write && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    <button className="btn sm" onClick={() => onTest(c)}>Test</button>
                    {c.state !== 'live' && c.state !== 'paused' && <button className="btn sm pri" disabled={busy || !c.health.ok} data-tip={c.health.ok ? 'A second person approves it' : 'Pass a test first'} onClick={() => onAct(c, 'live')}>Go live</button>}
                    {c.state === 'live' && <button className="btn sm" disabled={busy} onClick={() => onAct(c, 'pause')}>Pause</button>}
                    {c.state === 'paused' && <button className="btn sm" disabled={busy} onClick={() => onAct(c, 'resume')}>Back to test</button>}
                    <button className="btn sm" onClick={() => onEdit(c)}>Change</button>
                    <button className="btn sm" onClick={() => onDelete(c)}>Delete</button>
                  </div>
                )}
              </Card>
            );
          })}
        </section>
      ))}
    </>
  );
}

function SecretOrField({ f, value, onChange, error, set }: { f: ProviderField; value: string; onChange: (v: string) => void; error?: string; set?: string }) {
  const label = `${f.label}${f.required ? '' : ' (optional)'}`;
  if (f.kind === 'bool') return <div className="fld"><Checkbox checked={value === 'true'} onChange={(b) => onChange(String(b))} label={f.label} /></div>;
  if (f.kind === 'select') return <div><SelectField label={label} value={value || f.options?.[0]?.[0] || ''} onChange={onChange} error={error} options={(f.options ?? []).map(([value, label]) => ({ value, label }))} />{f.help && !error && <div className="help" style={{ marginTop: 6 }}>{f.help}</div>}</div>;
  if (f.kind === 'number') return <NumberField label={label} value={value} onChange={onChange} error={error} min={0} hint={f.help} />;
  if (f.kind === 'file') return <FileField f={f} label={label} onChange={onChange} error={error} set={set} />;
  if (f.kind === 'json' || f.kind === 'template') {
    return (
      <div className="fld">
        <label htmlFor={`f-${f.key}`}>{label}</label>
        <div className={`inp ${error ? 'err shake' : ''}`} style={{ height: 'auto' }}>
          <textarea id={`f-${f.key}`} className="mono" rows={4} value={value} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} spellCheck={false}
            style={{ width: '100%', border: 0, outline: 0, background: 'none', padding: '12px 0', color: 'var(--ink)', resize: 'vertical' }} />
        </div>
        {(error || f.help) && <div className={error ? 'emsg' : 'help'} style={{ marginTop: 6 }}>{error || f.help}</div>}
      </div>
    );
  }
  return <Field label={label} type={f.kind === 'secret' ? 'password' : f.kind === 'url' ? 'url' : 'text'} value={value} onChange={onChange} error={error} autoComplete="off"
    placeholder={f.kind === 'secret' && set ? `Set, ending ${set}. Type to replace it.` : f.placeholder} hint={f.help} />;
}

/** Files are read in the browser and sealed with the connection's keys; only "set" and the last characters ever come back. */
function FileField({ f, label, onChange, error, set }: { f: ProviderField; label: string; onChange: (v: string) => void; error?: string; set?: string }) {
  const [picked, setPicked] = useState('');
  const [tooBig, setTooBig] = useState(false);
  return (
    <div className="fld">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className={`chip ${picked || set ? 'g' : ''}`}>{picked ? `Added: ${picked}` : set ? `Set, ending ${set}` : 'No file yet'}</span>
        <FilePick accept={f.accept} className="btn sm" onPick={(file) => {
          setTooBig(file.size > 512 * 1024);
          if (file.size > 512 * 1024) return;
          const r = new FileReader();
          r.onload = () => { onChange(String(r.result).split(',')[1] ?? ''); setPicked(file.name); };
          r.readAsDataURL(file);
        }}>{picked || set ? 'Replace file' : 'Add the file'}</FilePick>
      </div>
      {(error || tooBig || f.help) && <div className={error || tooBig ? 'emsg' : 'help'} style={{ marginTop: 6 }}>{error || (tooBig ? 'That file is larger than 512 KB: it is not the key file.' : f.help)}</div>}
    </div>
  );
}

/** Copies a value and says so on the button for a moment. */
function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="btn sm" onClick={() => { void navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}>{done ? 'Copied' : label}</button>;
}

/**
 * Adding a connection is a template to fill in, like a credential in n8n: choose the service, then follow its steps beside the
 * form. A new connection is saved as a draft first, so its webhook address can be pasted at the provider before the keys are typed.
 */
function ConnectionDialog({ c: initial, schools, onClose, onDone }: { c?: ConnectionRow; schools: SchoolRow[]; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const qc = useQueryClient();
  const shake = useShake();
  const [c, setC] = useState<ConnectionRow | undefined>(initial);
  const [cap, setCap] = useState<Capability>(c ? (providerDef(c.provider)?.capabilities[0] ?? 'sms') : 'sms');
  const providers = INTEGRATION_PROVIDERS.filter((p) => p.key !== 'sandbox' && p.capabilities.includes(cap));
  const [provider, setProvider] = useState(c?.provider ?? providers[0]?.key ?? '');
  const def = providerDef(provider);
  const platformOnly = !!def && def.capabilities.every((k) => PLATFORM_CAPABILITIES.includes(k));
  const [name, setName] = useState(c?.name ?? '');
  const [scope, setScope] = useState<'platform' | 'school'>(c?.scope ?? 'platform');
  const [schoolId, setSchoolId] = useState(c?.schoolId ?? schools[0]?.id ?? '');
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(c?.settings ?? {}).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])));
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: string) => (x: string) => { setVals((o) => ({ ...o, [k]: x })); setErr((e) => ({ ...e, [k]: '', _: '' })); };
  const secretsSet = new Map((c?.secretsSet ?? []).map((s) => [s.key, s.ending]));
  const start = useMutation({
    mutationFn: async () => {
      const r = await app.api.integrations.create({ provider, name: name.trim(), scope: platformOnly ? 'platform' : scope, schoolId: !platformOnly && scope === 'school' ? schoolId : undefined, settings: {}, secrets: {}, draft: true });
      // staleTime 0: the cached list predates the new connection.
      const view = await qc.fetchQuery({ queryKey: ['integrations'], queryFn: app.api.integrations.view, staleTime: 0 });
      return view.connections.find((x) => x.id === r.id)!;
    },
    onSuccess: (row) => setC(row), onError: (e) => { setErr(fields(e)); shake.hit(); },
  });
  const save = useMutation({
    mutationFn: async () => {
      const settings: Record<string, unknown> = {};
      const secrets: Record<string, string> = {};
      const problems: Record<string, string> = {};
      for (const f of def?.fields ?? []) {
        // A dropdown shows its first option until changed: that is the value it saves.
        const raw = vals[f.key] || (f.kind === 'select' ? f.options?.[0]?.[0] ?? '' : '');
        const sealed = f.kind === 'secret' || f.kind === 'file';
        const problem = sealed && !raw && secretsSet.has(f.key) ? null : fieldProblem(f, raw);
        if (problem) problems[f.key] = problem;
        if (sealed) { if (raw) secrets[f.key] = raw; continue; }
        if (raw === '' && f.kind !== 'bool') continue;
        settings[f.key] = f.kind === 'number' ? Number(raw) : f.kind === 'bool' ? raw === 'true' : raw;
      }
      if (Object.keys(problems).length) throw Object.assign(new Error('Some fields need a look.'), { problems });
      await app.api.integrations.update(c!.id, { name: name.trim(), settings, secrets });
      return c!.state === 'draft' ? `${name.trim()} is set up. Run Test, then route it.` : `${name.trim()} was saved.${c!.state === 'live' ? ' Its keys changed, so it is back in test until a second person takes it live again.' : ''}`;
    },
    onSuccess: onDone,
    onError: (e) => { setErr((e as { problems?: Record<string, string> }).problems ?? fields(e)); shake.hit(); },
  });

  // First: which service, what to call it, who it serves.
  if (!c) {
    return (
      <Dialog title="Add a connection" onClose={onClose} width={560} shake={shake.cls}>
        <div className="stack">
          <div className="two">
            <SelectField label="What it does" value={cap} onChange={(x) => { setCap(x as Capability); setProvider(INTEGRATION_PROVIDERS.find((p) => p.key !== 'sandbox' && p.capabilities.includes(x as Capability))?.key ?? ''); }}
              options={CAPABILITIES.filter((k) => INTEGRATION_PROVIDERS.some((p) => p.key !== 'sandbox' && p.capabilities.includes(k))).map((k) => ({ value: k, label: CAPABILITY_LABELS[k] }))} />
            <SelectField label="Provider" value={provider} onChange={setProvider} options={providers.map((p) => ({ value: p.key, label: p.name }))} />
          </div>
          <Field label="Name" value={name} onChange={(x) => { setName(x); setErr((e) => ({ ...e, name: '' })); }} error={err.name} placeholder={def ? `${def.name} for every school` : ''} />
          {!platformOnly && <>
            <Segmented label="Who it serves" value={scope} onChange={setScope} options={[{ value: 'platform', label: 'Every school (Gradeon-wide)' }, { value: 'school', label: 'One school' }]} />
            {scope === 'school' && <SelectField label="School" value={schoolId} onChange={setSchoolId} error={err.schoolId} options={schools.map((s) => ({ value: s.id, label: s.name }))} />}
          </>}
          {platformOnly && <div className="help">Gradeon itself uses this, so it serves every school.</div>}
          {def && <div className="help">Next: the {def.steps.length} steps to get each value from {def.name}, beside the form.</div>}
          {err._ && <div className="emsg" role="alert">{err._}</div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn pri" disabled={start.isPending || name.trim().length < 2 || !provider} onClick={() => start.mutate()}>{start.isPending ? 'Starting…' : 'Continue'}</button>
        </div>
      </Dialog>
    );
  }

  // Then: the steps, the webhook address to paste back, and the form.
  return (
    <Dialog title={c.state === 'draft' ? `Set up ${c.name}` : `Change ${c.name}`} tag={def ? { text: def.name, tone: 'v' } : undefined} onClose={onClose} width={860} shake={shake.cls}>
      <div className="grid" style={{ gap: 20 }}>
        <div className="s5" style={{ minWidth: 0 }}>
          <div className="lbl">How to get these from {def?.name}</div>
          <ol style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 8, font: '400 13px/1.5 var(--fb)', color: 'var(--ink2)' }}>
            {def?.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          {def?.docs && <div className="help" style={{ marginTop: 10 }}><a href={def.docs} target="_blank" rel="noreferrer">{def.name} documentation</a></div>}
          {def?.webhooks && c.webhookUrl && (
            <div style={{ marginTop: 16 }}>
              <div className="lbl">Webhook address to paste at {def.name}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                <code className="mono" style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', font: '400 12px/1.4 var(--fm)' }}>{c.webhookUrl}</code>
                <CopyButton text={c.webhookUrl} />
              </div>
              <div className="help" style={{ marginTop: 6 }}>Events: {def.webhooks.events}. Checked by: {def.webhooks.verifies}.</div>
            </div>
          )}
        </div>
        <div className="s7 stack" style={{ minWidth: 0 }}>
          <Field label="Name" value={name} onChange={(x) => { setName(x); setErr((e) => ({ ...e, name: '' })); }} error={err.name} />
          {def?.fields.map((f) => <SecretOrField key={f.key} f={f} value={vals[f.key] ?? ''} onChange={set(f.key)} error={err[f.key]} set={secretsSet.get(f.key)} />)}
          {err._ && <div className="emsg" role="alert">{err._}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>{c.state === 'draft' ? 'Finish later' : 'Cancel'}</button>
        <button className="btn pri" disabled={save.isPending || !name.trim()} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</button>
      </div>
    </Dialog>
  );
}

function TestDialog({ c, onClose }: { c: ConnectionRow; onClose: () => void }) {
  const app = useApp();
  const def = providerDef(c.provider);
  const [to, setTo] = useState('');
  const run = useMutation({ mutationFn: () => app.api.integrations.test(c.id, to.trim() || undefined) });
  const needsTo = def?.capabilities.some((k) => k === 'sms' || k === 'whatsapp' || k === 'email');
  return (
    <Dialog title={`Test ${c.name}`} tag={{ text: def?.name ?? c.provider, tone: 'v' }} onClose={onClose} width={500}>
      <div className="stack">
        <div className="help">{def?.testAction}</div>
        {needsTo && <Field label={def?.capabilities.includes('email') ? 'Send to (email)' : 'Send to (phone number)'} value={to} onChange={setTo} placeholder={def?.capabilities.includes('email') ? 'you@example.com' : '98220 11002'} />}
        {run.data && <div className={`chip ${run.data.ok ? 'g' : 'c'}`} role="status" style={{ height: 'auto', padding: '10px 12px', whiteSpace: 'normal', lineHeight: 1.45, overflowWrap: 'anywhere' }}>{run.data.detail}</div>}
        {run.isError && <div className="emsg" role="alert">{(run.error as Error).message}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Close</button>
        <button className="btn pri" disabled={run.isPending} onClick={() => run.mutate()}>{run.isPending ? 'Testing…' : run.data ? 'Test again' : 'Run the test'}</button>
      </div>
    </Dialog>
  );
}

function DeleteDialog({ c, onClose, onDone }: { c: ConnectionRow; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const del = useMutation({ mutationFn: () => app.api.integrations.remove(c.id), onSuccess: () => onDone(`${c.name} was deleted.`) });
  return (
    <Dialog title={`Delete ${c.name}?`} onClose={onClose} width={460}>
      <p className="help" style={{ margin: 0 }}>Its keys are forgotten and its templates go with it. Messages already sent keep their record. A connection that a route uses cannot be deleted.</p>
      {del.isError && <div className="emsg" role="alert" style={{ marginTop: 12 }}>{(del.error as Error).message}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn dngf" disabled={del.isPending} onClick={() => del.mutate()}>{del.isPending ? 'Deleting…' : 'Delete'}</button>
      </div>
    </Dialog>
  );
}

function Routing({ v, schools, write, onEdit }: { v: IntegrationsView; schools: SchoolRow[]; write: boolean; onEdit: (cap: Capability, schoolId: string | null, route?: RouteRow) => void }) {
  const name = (id: string | null) => (id ? v.connections.find((c) => c.id === id)?.name ?? 'Deleted' : null);
  const caps = CAPABILITIES.filter((k) => INTEGRATION_PROVIDERS.some((p) => p.key !== 'sandbox' && p.capabilities.includes(k)));
  const [school, setSchool] = useState('');
  return (
    <Card title="Which connection serves what" style={{ padding: 0 }}>
      <div className="help" style={{ padding: '0 20px 8px' }}>A school’s own route wins; otherwise the Gradeon default serves it; with neither, the Test inbox stands in (sandbox mode only). When the connection fails, its fallback is tried.</div>
      {write && <div style={{ padding: '0 20px 12px', maxWidth: 380 }}><SelectField label="Give a school its own route" value={school} onChange={setSchool} options={[{ value: '', label: 'Choose a school…' }, ...schools.map((s) => ({ value: s.id, label: s.name }))]} /></div>}
      <div className="tbl scroll-x"><div style={{ minWidth: 640 }}>
        <div className="grd th" style={{ '--cols': '160px minmax(0,1fr) minmax(0,1.4fr)' } as React.CSSProperties}><span>Capability</span><span>Gradeon default</span><span>Schools with their own</span></div>
        {caps.map((k) => {
          const def = v.routes.find((r) => r.capability === k && !r.schoolId);
          const own = v.routes.filter((r) => r.capability === k && r.schoolId);
          return (
            <div key={k} className="grd rw" style={{ '--cols': '160px minmax(0,1fr) minmax(0,1.4fr)', height: 'auto', minHeight: 56, padding: '10px 20px' } as React.CSSProperties}>
              <b style={{ font: '700 14px var(--fb)' }}>{CAPABILITY_LABELS[k]}</b>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
                {def ? <span className="chip v">{name(def.connectionId)}{def.fallbackId ? ` → ${name(def.fallbackId)}` : ''}</span> : <span className="help">Test inbox</span>}
                {write && <button className="btn sm" onClick={() => onEdit(k, null, def)}>{def ? 'Change' : 'Set'}</button>}
              </span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                {own.map((r) => <button key={r.id} className="chip" disabled={!write} onClick={() => onEdit(k, r.schoolId, r)} data-tip={`${name(r.connectionId)}${r.fallbackId ? ` → ${name(r.fallbackId)}` : ''}`}>{r.schoolName}: {name(r.connectionId)}</button>)}
                {write && school && !own.some((r) => r.schoolId === school) && <button className="btn sm" onClick={() => onEdit(k, school)}>Set for {schools.find((s) => s.id === school)?.name}</button>}
                {!own.length && !school && <span className="help">None</span>}
              </span>
            </div>
          );
        })}
      </div></div>
    </Card>
  );
}

function RouteDialog({ view, schools, capability, schoolId, route, onClose, onDone }: { view: IntegrationsView; schools: SchoolRow[]; capability: Capability; schoolId: string | null; route?: RouteRow; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const shake = useShake();
  const fit = view.connections.filter((c) => providerDef(c.provider)?.capabilities.includes(capability) && (c.scope === 'platform' || c.schoolId === schoolId));
  const [conn, setConn] = useState(route?.connectionId ?? fit[0]?.id ?? '');
  const [fallback, setFallback] = useState(route?.fallbackId ?? '');
  const [settings, setSettings] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(route?.settings ?? {}).map(([k, x]) => [k, String(x)])));
  const [err, setErr] = useState<Record<string, string>>({});
  const who = schoolId ? schools.find((s) => s.id === schoolId)?.name ?? 'This school' : 'Gradeon default';
  const save = useMutation({
    mutationFn: () => app.api.integrations.route({ capability, schoolId, connectionId: conn, fallbackId: fallback || null, settings: Object.fromEntries(Object.entries(settings).filter(([, x]) => x.trim())) }),
    onSuccess: () => onDone(`${CAPABILITY_LABELS[capability]} for ${who} now goes through ${fit.find((c) => c.id === conn)?.name}.`), onError: (e) => { setErr(fields(e)); shake.hit(); },
  });
  const unroute = useMutation({ mutationFn: () => app.api.integrations.unroute(route!.id), onSuccess: () => onDone(`${who} no longer has its own route for ${CAPABILITY_LABELS[capability].toLowerCase()}.`), onError: (e) => setErr(fields(e)) });
  return (
    <Dialog title={`${CAPABILITY_LABELS[capability]} · ${who}`} onClose={onClose} width={520} shake={shake.cls}>
      {!fit.length ? <p className="help" style={{ margin: 0 }}>No connection can do this for {who} yet. Add one under Connections first.</p> : (
        <div className="stack">
          <SelectField label="Connection" value={conn} onChange={setConn} error={err.connectionId} options={fit.map((c) => ({ value: c.id, label: `${c.name} · ${STATE[c.state].text}` }))} />
          <SelectField label="When it fails, try" value={fallback} onChange={setFallback} error={err.fallbackId} options={[{ value: '', label: 'Nothing (retry later)' }, ...fit.filter((c) => c.id !== conn).map((c) => ({ value: c.id, label: c.name }))]} />
          {(ROUTE_FIELDS[capability] ?? []).map((f) => <Field key={f.key} label={`${f.label} (optional)`} value={settings[f.key] ?? ''} onChange={(x) => setSettings((o) => ({ ...o, [f.key]: x }))} placeholder={f.placeholder} />)}
          {err._ && <div className="emsg" role="alert">{err._}</div>}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        {route && <button className="btn" style={{ marginRight: 'auto' }} disabled={unroute.isPending} onClick={() => unroute.mutate()}>{schoolId ? 'Use the Gradeon default' : 'Remove route'}</button>}
        <button className="btn" onClick={onClose}>Cancel</button>
        {fit.length > 0 && <button className="btn pri" disabled={save.isPending || !conn} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save route'}</button>}
      </div>
    </Dialog>
  );
}

/** The wording as DLT wants it: every {placeholder} becomes {#var#}. */
const forDlt = (text: string) => text.replace(/\{[\w.]+\}/g, '{#var#}');
// WhatsApp providers whose templates can be listed and imported (their adapters implement templates()).
const IMPORTABLE = new Set(['meta-cloud', 'gupshup-wa']);

function Templates({ v, write, say, onEdit }: { v: IntegrationsView; write: boolean; say: (m: string, tone?: 'ok' | 'bad') => void; onEdit: (connectionId: string, messageKey: string, t?: TemplateRow) => void }) {
  const app = useApp();
  const qc = useQueryClient();
  const imp = useMutation({
    mutationFn: (id: string) => app.api.integrations.importTemplates(id),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['integrations'] }); say(r.found ? `Found ${r.found} approved templates; ${r.imported} matched a message by name and were mapped.` : 'The provider has no approved templates yet.'); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  const conns = v.connections.filter((c) => providerDef(c.provider)?.capabilities.some((k) => k === 'sms' || k === 'whatsapp'));
  if (!conns.length) return <div><EmptyCard title="Templates" chip={{ text: 'No SMS or WhatsApp', tone: 'v' }} scene="envelope" heading="Nothing to map yet" body="Indian SMS and WhatsApp send only approved templates. Add an SMS or WhatsApp connection, then map each message to its approved template here." /></div>;
  return (
    <>
      <div className="help rise">When a message is mapped, its approved wording is what goes out, filled with the message’s values, so DLT never rejects it. A text or WhatsApp connection goes live only when every message is mapped. “Copy for DLT” gives the wording with {'{#var#}'} where the values go, ready to register.</div>
      {conns.map((c) => {
        const mapped = v.templates.filter((t) => t.connectionId === c.id);
        return (
          <Card key={c.id} title={c.name} chip={<><span className={`chip ${mapped.length === MESSAGE_KEYS.length ? 'g' : 'a'}`}>{mapped.length} of {MESSAGE_KEYS.length} mapped</span>
            {write && IMPORTABLE.has(c.provider) && <button className="btn sm" disabled={imp.isPending} onClick={() => imp.mutate(c.id)}>{imp.isPending ? 'Importing…' : 'Import from provider'}</button>}</>} style={{ padding: 0 }}>
            <div className="tbl scroll-x"><div style={{ minWidth: 600 }}>
              <div className="grd th" style={{ '--cols': 'minmax(0,1.2fr) minmax(0,2fr) 200px' } as React.CSSProperties}><span>Message</span><span>Approved template</span><span></span></div>
              {MESSAGE_KEYS.map((m) => {
                const t = mapped.find((x) => x.messageKey === m.key);
                return (
                  <div key={m.key} className="grd rw" style={{ '--cols': 'minmax(0,1.2fr) minmax(0,2fr) 200px', height: 'auto', minHeight: 52, padding: '10px 20px' } as React.CSSProperties}>
                    <b style={{ font: '700 13px/1.35 var(--fb)' }}>{m.label}</b>
                    <span style={{ minWidth: 0, font: '400 13px/1.45 var(--fb)', color: t ? 'var(--ink2)' : 'var(--ink3)', overflowWrap: 'anywhere' }}>{t ? <><span className="chip">{t.providerTemplateId}{t.dltTemplateId ? ` · DLT ${t.dltTemplateId}` : ''}</span> {t.approvedText}</> : 'Not mapped: this message cannot go by this connection.'}</span>
                    <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{!t && <CopyButton text={forDlt(m.text)} label="Copy for DLT" />}{write && <button className="btn sm" onClick={() => onEdit(c.id, m.key, t)}>{t ? 'Change' : 'Map'}</button>}</span>
                  </div>
                );
              })}
            </div></div>
          </Card>
        );
      })}
    </>
  );
}

function TemplateDialog({ connectionId, messageKey, t, onClose, onDone }: { connectionId: string; messageKey: string; t?: TemplateRow; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const shake = useShake();
  const m = MESSAGE_KEYS.find((x) => x.key === messageKey)!;
  const [f, setF] = useState({ providerTemplateId: t?.providerTemplateId ?? '', dltTemplateId: t?.dltTemplateId ?? '', approvedText: t?.approvedText ?? m.text, language: t?.language ?? 'en' });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (x: string) => { setF((o) => ({ ...o, [k]: x })); setErr((e) => ({ ...e, [k]: '', _: '' })); };
  const save = useMutation({ mutationFn: () => app.api.integrations.template({ connectionId, messageKey, ...f }), onSuccess: () => onDone(`${m.label} is mapped.`), onError: (e) => { setErr(fields(e)); shake.hit(); } });
  const unmap = useMutation({ mutationFn: () => app.api.integrations.untemplate(t!.id), onSuccess: () => onDone(`${m.label} is no longer mapped.`) });
  return (
    <Dialog title={m.label} onClose={onClose} width={560} shake={shake.cls}>
      <div className="stack">
        <div className="two">
          <Field label="Provider template ID" value={f.providerTemplateId} onChange={set('providerTemplateId')} error={err.providerTemplateId} placeholder="65f1c…" />
          <Field label="DLT template ID (optional)" value={f.dltTemplateId} onChange={set('dltTemplateId')} error={err.dltTemplateId} placeholder="1107169…" />
        </div>
        <SelectField label="Language" value={f.language} onChange={set('language')} options={LANGUAGES.map(([value, label]) => ({ value, label }))} />
        <div className="fld">
          <label htmlFor="tpl-text">Approved wording</label>
          <div className={`inp ${err.approvedText ? 'err shake' : ''}`} style={{ height: 'auto' }}>
            <textarea id="tpl-text" rows={4} value={f.approvedText} onChange={(e) => set('approvedText')(e.target.value)} style={{ width: '100%', border: 0, outline: 0, background: 'none', padding: '12px 0', color: 'var(--ink)', resize: 'vertical', font: 'inherit' }} />
          </div>
          <div className={err.approvedText ? 'emsg' : 'help'} style={{ marginTop: 6 }}>{err.approvedText || 'Paste it exactly as approved, with {placeholders} where the values go: {code}, {student}, {school}…'}</div>
        </div>
        {err._ && <div className="emsg" role="alert">{err._}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        {t && <button className="btn" style={{ marginRight: 'auto' }} disabled={unmap.isPending} onClick={() => unmap.mutate()}>Unmap</button>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</button>
      </div>
    </Dialog>
  );
}

function Activity({ schools, write, say }: { schools: SchoolRow[]; write: boolean; say: (m: string, tone?: 'bad') => void }) {
  const app = useApp();
  const qc = useQueryClient();
  const [school, setSchool] = useState('');
  const [channel, setChannel] = useState('');
  const [status, setStatus] = useState('');
  const q = useQuery({ queryKey: ['activity', school, channel, status], queryFn: () => app.api.integrations.activity({ school: school || undefined, channel: channel || undefined, status: (status || undefined) as never }), refetchInterval: 15_000 });
  const retry = useMutation({ mutationFn: app.api.integrations.retry, onSuccess: () => { void qc.invalidateQueries({ queryKey: ['activity'] }); say('Sent again.'); }, onError: (e) => say((e as Error).message, 'bad') });
  const rows = q.data?.rows ?? [];
  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }} className="rise">
        <Select compact aria-label="School" value={school} onChange={setSchool} options={[{ value: '', label: 'Every school' }, ...schools.map((s) => ({ value: s.slug, label: s.name }))]} />
        <Select compact aria-label="Channel" value={channel} onChange={setChannel} options={[{ value: '', label: 'Every channel' }, ...(['sms', 'whatsapp', 'email', 'push'] as const).map((k) => ({ value: k, label: CAPABILITY_LABELS[k] }))]} />
        <Select compact aria-label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'Any status' }, ...DELIVERY_STATUSES.map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) }))]} />
      </div>
      <Card title="Every message’s fate" chip={<span className="chip">{rows.length} shown</span>} style={{ padding: 0 }}>
        {q.isError ? <div className="help" style={{ padding: 20 }}>{(q.error as Error).message}</div>
          : !rows.length ? <div className="help" style={{ padding: 20 }}>{q.isLoading ? 'Loading…' : 'No messages match. Messages appear here the moment a school sends one.'}</div> : (
            <div className="tbl scroll-x"><div style={{ minWidth: 760 }} className="lscroll">
              <div className="grd th" style={{ '--cols': '96px 110px minmax(0,1fr) minmax(0,2fr) 120px 90px' } as React.CSSProperties}><span>Status</span><span>School</span><span>To</span><span>Message</span><span>Through</span><span></span></div>
              {rows.map((m) => (
                <div key={m.id} className="grd rw" style={{ '--cols': '96px 110px minmax(0,1fr) minmax(0,2fr) 120px 90px', height: 'auto', minHeight: 52, padding: '8px 20px' } as React.CSSProperties}>
                  <span className={`chip ${DELIVERY[m.status]}`} data-tip={m.error ?? (m.sendAfter ? `Held until ${when(m.sendAfter)}` : undefined)}>{m.status}</span>
                  <span className="help" style={{ margin: 0 }}>{m.schoolSlug}</span>
                  <span style={{ minWidth: 0 }}><b className="num" style={{ font: '700 13px var(--fb)' }}>{m.to}</b><div className="help" style={{ margin: 0 }}>{CAPABILITY_LABELS[m.channel as Capability] ?? m.channel} · {ago(m.createdAt)}</div></span>
                  <span style={{ minWidth: 0, font: '400 13px/1.4 var(--fb)', color: 'var(--ink2)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} data-tip={m.error ?? m.body}>{m.error ? <span style={{ color: 'var(--bad-i)' }}>{m.error}</span> : m.body}</span>
                  <span className="help" style={{ margin: 0 }}>{m.connectionName ?? '–'}{m.costPaise ? ` · ${rupees(m.costPaise / 100)}` : ''}</span>
                  <span>{write && m.status === 'failed' && <button className="btn sm" disabled={retry.isPending} onClick={() => retry.mutate(m.id)}>Retry</button>}</span>
                </div>
              ))}
            </div></div>
          )}
      </Card>
    </>
  );
}

function Webhooks({ v, say }: { v: IntegrationsView; say: (m: string, tone?: 'bad') => void }) {
  const app = useApp();
  const hooked = v.connections.filter((c) => c.webhookUrl);
  const [open, setOpen] = useState<string | null>(null);
  const events = useQuery({ queryKey: ['integrations', 'events', open], queryFn: () => app.api.integrations.events(open!), enabled: !!open });
  if (!hooked.length) return <div><EmptyCard title="Webhooks" chip={{ text: '0 addresses', tone: 'v' }} scene="envelope" heading="No provider sends us anything yet" body="Delivery reports and payment confirmations come back to an address made for each connection. Add an SMS, WhatsApp or payments connection to get one." /></div>;
  return (
    <Card title="Addresses to paste into each provider’s dashboard" style={{ padding: 0 }}>
      {hooked.map((c) => {
        const def = providerDef(c.provider);
        return (
          <div key={c.id} className="rw" style={{ display: 'block', height: 'auto', padding: '12px 20px' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <b style={{ font: '700 14px var(--fb)' }}>{c.name}</b><span className="chip">{def?.webhooks?.events}</span>
              <span className="grow" style={{ flex: 1 }}></span>
              <button className="btn sm" onClick={() => { void navigator.clipboard.writeText(c.webhookUrl!).then(() => say('Copied.')); }}>Copy</button>
              <button className="btn sm" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? 'Hide events' : 'Last events'}</button>
            </div>
            <div className="mono" style={{ marginTop: 6, overflowWrap: 'anywhere', color: 'var(--ink2)' }}>{c.webhookUrl}</div>
            <div className="help" style={{ marginTop: 4 }}>Checked by: {def?.webhooks?.verifies}</div>
            {open === c.id && (
              <div style={{ marginTop: 10 }}>
                {events.isLoading ? <div className="help">Loading…</div> : !(events.data ?? []).length ? <div className="help">Nothing received yet.</div>
                  : (events.data ?? []).slice(0, 10).map((e) => (
                    <div key={e.id} className="kv" style={{ alignItems: 'center' }}>
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}><span className={`chip ${e.ok ? 'g' : 'c'}`}>{e.ok ? 'Accepted' : 'Refused'}</span><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-tip={e.summary}>{e.summary}</span></span>
                      <b style={{ whiteSpace: 'nowrap' }}>{ago(e.at)}</b>
                    </div>
                  ))}
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}

function AllowDialog({ list, onClose, onDone }: { list: string[]; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const [text, setText] = useState(list.join('\n'));
  const save = useMutation({ mutationFn: () => app.api.integrations.allowList(text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)), onSuccess: (r) => onDone(`${r.allowList.length} on the allow-list.`) });
  return (
    <Dialog title="Allow-list" tag={{ text: 'Sandbox mode', tone: 'a' }} onClose={onClose} width={480}>
      <div className="fld">
        <label htmlFor="allow">Phone numbers and email addresses that get real messages, one per line</label>
        <div className="inp" style={{ height: 'auto' }}>
          <textarea id="allow" className="mono" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={'9822011002\nyou@gradeon.app'} style={{ width: '100%', border: 0, outline: 0, background: 'none', padding: '12px 0', color: 'var(--ink)', resize: 'vertical' }} />
        </div>
        <div className="help" style={{ marginTop: 6 }}>For trying real providers on the test track: only these people are reached, through connections in test or live.</div>
      </div>
      {save.isError && <div className="emsg" role="alert" style={{ marginTop: 12 }}>{(save.error as Error).message}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</button>
      </div>
    </Dialog>
  );
}

const ICON: Record<string, IconName> = {
  sms: 'messages', email: 'mail', whatsapp: 'messages', push: 'notifications',
};

/** Texts and emails that would have gone out while messages are in sandbox: where a tester reads the codes and receipts. */
function TestInbox({ schools }: { schools: SchoolRow[] }) {
  const app = useApp();
  const [school, setSchool] = useState('');
  const msgs = useQuery({ queryKey: ['sandbox', school], queryFn: () => app.api.sandbox(school || undefined), refetchInterval: 6000 });
  const rows = msgs.data ?? [];
  return (
    <Card title="Test inbox" chip={<Select compact aria-label="School" value={school} onChange={setSchool} options={[{ value: '', label: 'All schools' }, ...schools.map((s) => ({ value: s.slug, label: s.name }))]} />}>
      {msgs.isLoading ? <div className="skc" style={{ height: 200, borderRadius: 16 }} />
        : rows.length === 0 ? <div className="help">Nothing yet. Sign-in codes, receipts and notices land here as they are triggered.</div>
          : rows.map((m) => (
            <div key={m.id} className="kv" style={{ alignItems: 'flex-start' }}>
              <span style={{ display: 'flex', gap: 12, minWidth: 0 }}>
                <span className="av" style={{ width: 34, height: 34, flex: 'none', background: 'var(--brand-soft)', color: 'var(--brand-ink)' }}>
                  <Icon name={ICON[m.channel] ?? ICON.sms} size={16} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <b style={{ display: 'block', textAlign: 'left' }}>{m.subject ?? m.to}</b>
                  <span style={{ color: 'var(--ink2)', overflowWrap: 'anywhere' }}>{m.body}</span><br />
                  <small style={{ color: 'var(--ink3)' }}>{CAPABILITY_LABELS[m.channel as Capability] ?? m.channel} to {m.to} · {m.schoolSlug}</small>
                </span>
              </span>
              <b style={{ whiteSpace: 'nowrap', color: 'var(--ink3)' }}>{ago(m.createdAt)}</b>
            </div>
          ))}
    </Card>
  );
}
