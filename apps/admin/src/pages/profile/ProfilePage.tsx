import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { APP_CATALOG, MODULES } from '@gradeon/config-engine';
import {
  APP_ROLE_KEYS, MESSAGE_EVENTS, PERMISSION_CATALOG, SETTINGS_META, SchoolSettingsSchema,
  type EffectiveConfig, type SettingMeta, type SettingsResponse,
} from '@gradeon/contracts';
import { EmptyCard, Segmented, useToast } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { Card, Page } from '../../app/Page';
import { usePageTabs } from '../../app/tabs';
import { AskGradeon } from './AskGradeon';

/**
 * How Gradeon has set the school up, to read: the school changes none of it (docs/product-map.md, "schools configure nothing").
 * Every value is read from the settings and the module definitions, so a new setting shows here with no change to this page.
 */
const dflt = (k: string): unknown => (SchoolSettingsSchema.shape as Record<string, { safeParse: (v: unknown) => { data?: unknown } }>)[k]?.safeParse(undefined).data;
const ROLE_NAMES: Record<string, string> = { parent: 'Parents', student: 'Students', teacher: 'Teachers', driver: 'Bus drivers' };
const AREA: Record<string, string> = { data: 'Your data', identity: 'School identity', plan: 'Plan and modules', app: 'The app', roles: 'Roles', messages: 'Messages', privacy: 'Privacy notice' };

function show(m: SettingMeta, v: unknown): ReactNode {
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return <span className="help">Not set</span>;
  const opt = (x: string) => m.options?.find((o) => o[0] === x)?.[1] ?? x;
  switch (m.kind) {
    case 'bool': return v ? 'Yes' : 'No';
    case 'enum': case 'language': return opt(String(v));
    case 'multi': case 'strings': return (v as string[]).map(opt).join(', ');
    case 'color': return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 7, background: String(v) }} />{String(v).toUpperCase()}</span>;
    case 'houses': return <span className="tgrow">{(v as { name: string; color: string }[]).map((h) => <span key={h.name} className="chip" style={{ background: h.color, color: 'var(--on-deep)' }}>{h.name}</span>)}</span>;
    case 'categories': return <span className="tgrow">{(v as { name: string; tone: string }[]).map((c) => <span key={c.name} className={`chip ${c.tone}`}>{c.name}</span>)}</span>;
    case 'gradingScale': return (v as { grade: string; minPct: number }[]).map((g) => `${g.grade} from ${g.minPct}%`).join(' · ');
    case 'logo': return 'Uploaded';
    case 'classes': return `${(v as string[]).length} chosen`;
    default: return typeof v === 'object' ? 'Set by Gradeon' : String(v);
  }
}

function Rows({ doc, keys }: { doc: SettingsResponse; keys: string[] }) {
  return (
    <div>
      {keys.map((k) => {
        const m = SETTINGS_META[k as keyof typeof SETTINGS_META];
        return (
          <div key={k} className="kv" style={{ alignItems: 'flex-start', gap: 16 }}>
            <span style={{ minWidth: 0 }}>{m.label}{m.help && <small style={{ display: 'block', color: 'var(--ink3)', font: '400 12px/1.4 var(--fb)' }}>{m.help}</small>}</span>
            <b style={{ textAlign: 'right', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{show(m, doc.values[k] !== undefined ? doc.values[k] : dflt(k))}</b>
          </div>
        );
      })}
    </div>
  );
}
const keysIn = (...groups: string[]) => Object.entries(SETTINGS_META).filter(([, m]) => groups.includes(m.group) && !['appRoles', 'appLayout', 'notifyRules', 'templates'].includes(m.kind)).map(([k]) => k);

export function ProfilePage() {
  const app = useApp();
  const { toast, say } = useToast();
  const { tab, tabs } = usePageTabs('/profile');
  const [asking, setAsking] = useState(false);
  const doc = useQuery({ queryKey: ['settings'], queryFn: app.api.settings.get });
  const cfg = useQuery({ queryKey: ['config'], queryFn: app.api.config, staleTime: 60_000 });
  const err = [doc, cfg].find((q) => q.isError && !q.data);
  const d = doc.data;
  const c = cfg.data;
  return (
    <Page title="School profile" sub="How Gradeon has set up your school. To change anything, ask Gradeon." toast={toast} loading={doc.isLoading || cfg.isLoading}
      error={err ? { message: (err.error as Error).message, retry: () => void err.refetch() } : null}
      actions={<>{tabs}<button className="btn pri" onClick={() => setAsking(true)}>Ask Gradeon to change this</button></>}
      overlays={asking && <AskGradeon area={AREA[tab] ?? 'School profile'} onClose={() => setAsking(false)} onDone={() => { setAsking(false); say('Sent to Gradeon. The answer shows when you ask again.'); }} />}>
      {d && c && (
        <div className="stack" style={{ gap: 16 }}>
          {tab === 'identity' && <>
            <Card title="The school"><Rows doc={d} keys={keysIn('School identity', 'Look')} /></Card>
            <Card title="Addresses">
              <div className="kv"><span>The admin</span><b>{`${window.location.host}${app.base}`}</b></div>
              <div className="kv"><span>School code (families type it in the app)</span><b>{app.slug.toUpperCase()}</b></div>
            </Card>
            <Card title="Sign-in and security"><Rows doc={d} keys={keysIn('Sign-in and security')} /></Card>
          </>}
          {tab === 'plan' && <Plan doc={d} cfg={c} />}
          {tab === 'app' && <AppSetup doc={d} cfg={c} />}
          {tab === 'roles' && <Roles cfg={c} />}
          {tab === 'messages' && <Messages doc={d} cfg={c} />}
          {tab === 'data' && <YourData say={say} />}
          {tab === 'privacy' && <>
            <Card title="Privacy notice">
              <p style={{ margin: 0, font: '400 14px/1.6 var(--fb)', whiteSpace: 'pre-wrap' }}>{c.privacy.notice || 'Gradeon has not written the school’s privacy notice yet.'}</p>
            </Card>
            <Card title="Privacy and consent"><Rows doc={d} keys={keysIn('Privacy').filter((k) => k !== 'privacy.notice')} /></Card>
          </>}
        </div>
      )}
    </Page>
  );
}

function Plan({ doc, cfg }: { doc: SettingsResponse; cfg: EffectiveConfig }) {
  const u = doc.usage;
  const on = MODULES.filter((m) => m.core || cfg.modules.includes(m.key));
  const off = MODULES.filter((m) => !m.core && m.state !== 'planned' && !cfg.modules.includes(m.key));
  return <>
    <Card title={`${u.plan.charAt(0).toUpperCase()}${u.plan.slice(1)} plan`}>
      <div className="kv"><span>Students</span><b>{u.students.toLocaleString('en-IN')}{u.studentLimit ? ` of ${u.studentLimit.toLocaleString('en-IN')}` : ''}</b></div>
      <div className="kv"><span>Staff</span><b>{u.staff.toLocaleString('en-IN')}</b></div>
      <div className="kv"><span>Texts this month</span><b>{u.smsUsed.toLocaleString('en-IN')} of {u.smsLimit.toLocaleString('en-IN')}</b></div>
    </Card>
    {on.map((m) => {
      const keys = m.settings.filter((k) => k in SETTINGS_META);
      const feats = m.features.filter((f) => f.state !== 'planned');
      return (
        <Card key={m.key} title={m.name} chip={<span className="chip g">On</span>}>
          <p className="help" style={{ margin: '0 0 8px' }}>{m.blurb}</p>
          {feats.length > 0 && <div className="tgrow" style={{ marginBottom: 8 }}>{feats.map((f) => <span key={f.key} className={`chip ${cfg.features.includes(f.key) ? 'g' : ''}`} data-tip={cfg.features.includes(f.key) ? 'On' : 'Not in your plan'}>{f.name}</span>)}</div>}
          {keys.length > 0 && <Rows doc={doc} keys={keys} />}
        </Card>
      );
    })}
    {off.length > 0 && (
      <Card title="Not in your plan">
        {off.map((m) => <div key={m.key} className="kv" style={{ alignItems: 'flex-start' }}><span style={{ minWidth: 0 }}>{m.name}<small style={{ display: 'block', color: 'var(--ink3)' }}>{m.blurb}</small></span><b></b></div>)}
      </Card>
    )}
  </>;
}

function AppSetup({ doc, cfg }: { doc: SettingsResponse; cfg: EffectiveConfig }) {
  const label = (slot: 'dock' | 'home' | 'quick', k: string) => APP_CATALOG[slot].find((p) => p.key === k)?.label ?? k;
  const roles = APP_ROLE_KEYS.filter((r) => cfg.app.roles.includes(r));
  return <>
    <Card title="Who uses the app">
      {APP_ROLE_KEYS.map((r) => <div key={r} className="kv"><span>{ROLE_NAMES[r]}</span><b><span className={`chip ${cfg.app.roles.includes(r) ? 'g' : ''}`}>{cfg.app.roles.includes(r) ? 'Use the app' : 'Off'}</span></b></div>)}
    </Card>
    {roles.map((r) => {
      const l = cfg.app.layout[r];
      return (
        <Card key={r} title={`What ${ROLE_NAMES[r]!.toLowerCase()} see`}>
          <div className="kv"><span>Tabs along the bottom</span><b>{l.dock.map((k) => label('dock', k)).join(' · ') || '–'}</b></div>
          <div className="kv"><span>Home screen</span><b>{l.home.map((k) => label('home', k)).join(' · ') || '–'}</b></div>
          <div className="kv"><span>Quick buttons</span><b>{l.quick.map((k) => label('quick', k)).join(' · ') || '–'}</b></div>
        </Card>
      );
    })}
    <Card title="Languages and look"><Rows doc={doc} keys={keysIn('The app')} /></Card>
  </>;
}

function Roles({ cfg }: { cfg: EffectiveConfig }) {
  const app = useApp();
  const roles = useQuery({ queryKey: ['roles'], queryFn: app.api.roles.list });
  const [sel, setSel] = useState('');
  if (roles.isLoading) return <div className="skc" style={{ height: 240, borderRadius: 16 }} />;
  if (roles.isError) return <EmptyCard error title="Roles" chip={{ text: 'Couldn’t load', tone: 'c' }} scene="padlock" heading="You can’t see roles" body={(roles.error as Error).message} actions={<button className="btn pri" onClick={() => void roles.refetch()}>Try again</button>} />;
  const list = roles.data ?? [];
  const cur = list.find((r) => r.id === sel) ?? list[0];
  if (!cur) return <EmptyCard title="Roles" chip={{ text: '0', tone: 'v' }} scene="padlock" heading="No roles yet" body="Gradeon makes the school’s roles when it sets the school up." />;
  const has = { modules: cfg.modules, features: cfg.features };
  const allowed = PERMISSION_CATALOG.filter((p) => cur.permissions.includes(p.key) && (has.modules.length === 0 || true));
  const areas = [...new Set(allowed.map((p) => p.area))];
  return <>
    <Segmented label="Roles" value={cur.id} onChange={setSel} options={list.map((r) => ({ value: r.id, label: r.name, count: r.people }))} style={{ alignSelf: 'flex-start', maxWidth: '100%', overflowX: 'auto' }} />
    <Card title={cur.name} chip={<span className="chip">{cur.people} {cur.people === 1 ? 'person' : 'people'}</span>}>
      {cur.description && <p className="help" style={{ margin: '0 0 8px' }}>{cur.description}</p>}
      {areas.map((a) => (
        <div key={a} className="kv" style={{ alignItems: 'flex-start', gap: 16 }}>
          <span>{a}</span>
          <b style={{ textAlign: 'right' }}>{allowed.filter((p) => p.area === a).map((p) => p.label).join(' · ')}</b>
        </div>
      ))}
      {!areas.length && <p className="help">This role can sign in and see the dashboard only.</p>}
    </Card>
  </>;
}

const CH = [['push', 'App'], ['sms', 'Text'], ['email', 'Email']] as const;
const STATE = { on: { text: 'On', tone: 'g' }, test: { text: 'Test mode', tone: 'a' }, sandbox: { text: 'Not connected yet', tone: '' } } as const;

function Messages({ doc, cfg }: { doc: SettingsResponse; cfg: EffectiveConfig }) {
  const app = useApp();
  const ch = useQuery({ queryKey: ['settings', 'channels'], queryFn: app.api.settings.channels });
  const rules = (doc.values['notify.rules'] ?? {}) as Record<string, { push: boolean; sms: boolean; email: boolean }>;
  const words = (doc.values['templates.messages'] ?? {}) as Record<string, string>;
  const has = (k: string) => cfg.modules.includes(k) || cfg.features.includes(k) || MODULES.some((m) => m.core && m.key === k);
  const events = MESSAGE_EVENTS.filter((e) => has(e.needs));
  return <>
    <Card title="How messages travel">
      {ch.isError ? <p className="help">{(ch.error as Error).message}</p> : (ch.data?.channels ?? []).map((x) => (
        <div key={x.capability} className="kv"><span style={{ minWidth: 0 }}>{x.label}<small style={{ display: 'block', color: 'var(--ink3)' }}>{x.provider ?? (x.state === 'sandbox' ? 'Messages go to Gradeon’s test inbox for now.' : '')}</small></span><b><span className={`chip ${STATE[x.state].tone}`}>{STATE[x.state].text}</span></b></div>
      ))}
      <Rows doc={doc} keys={keysIn('Messaging')} />
    </Card>
    <Card title="Each message">
      {events.map((e) => {
        const r = rules[e.key] ?? e.defaults;
        return (
          <div key={e.key} className="kv" style={{ alignItems: 'flex-start', gap: 16 }}>
            <span style={{ minWidth: 0 }}>{e.label}<small style={{ display: 'block', color: 'var(--ink3)', font: '400 12px/1.4 var(--fb)' }}>“{words[e.key]?.trim() || e.text}”</small></span>
            <b style={{ textAlign: 'right' }}>{CH.filter(([k]) => r[k]).map(([, l]) => l).join(' · ') || 'Not sent'}</b>
          </div>
        );
      })}
    </Card>
  </>;
}

/** Everything the school has, in the import templates: what it would take to another system. Its data is its own. */
function YourData({ say }: { say: (m: string, tone?: 'bad') => void }) {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const b = await app.api.movingIn.exportAll();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `${app.slug}-export.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      say('Your export is downloading.');
    } catch (e) { say((e as Error).message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <Card title="Everything, to take with you">
      <p className="help" style={{ marginTop: 0 }}>A ZIP with one sheet for each kind of record, in the same columns Gradeon imports. Your data is yours: this is what you would take to another system.</p>
      <button className="btn" disabled={busy} onClick={() => void go()}>{busy ? 'Preparing…' : 'Download everything'}</button>
    </Card>
  );
}
