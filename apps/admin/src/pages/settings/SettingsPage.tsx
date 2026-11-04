import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { closeModules, contrastRatio, dependents } from '@gradeon/config-engine';
import { istToday, type SettingsResponse } from '@gradeon/contracts';
import { Dialog, EmptyCard, ErrorLine, Shell, useShake } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { useChrome } from '../../app/useChrome';
import { SettingsView } from './settings.view';
import { AppLayoutPanel, NotificationsPanel, PrivacyPanel, RolesPanel, TemplatesPanel } from './panels';

const TABS: [string, string, boolean?][] = [
  ['General', 'M4 4h16v16H4zM4 9h16M9 9v11'],
  ['Modules', 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'],
  ['App layout', 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM11 18h2'],
  ['Roles and access', 'M12 3l8 4v5c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V7z'],
  ['Notifications', 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0'],
  ['Message templates', 'M4 5h16v11H9l-5 4z', true],
  ['Privacy and consent', 'M9 12l2 2 4-4M12 3l8 4v5c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V7z'],
  ['Audit log', 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h4'],
];
const SWATCHES: [string, string][] = [['Violet', '#6A4CF5'], ['Maroon', '#8C1D40'], ['Teal', '#0F7C86'], ['Orange', '#C2410C'], ['Blue', '#2F5BEA'], ['Green', '#1F8F5F']];
const WAIVERS: [string, string][] = [['principal', 'Principal only'], ['office', 'Principal or the office'], ['anyone', 'Anyone allowed to approve']];
const TICKS = 20;

interface Draft { name: string; logo: string; about: string; brand: string; notify: boolean; notice: boolean; twoFactor: boolean; waiver: string; modules: string[] }

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

function draftOf(doc: SettingsResponse): Draft {
  const v = doc.values;
  const entitled = doc.modules.filter((m) => m.entitled).map((m) => m.key);
  const set = Array.isArray(v['modules.enabled']) && (v['modules.enabled'] as string[]).length ? (v['modules.enabled'] as string[]) : entitled;
  return {
    name: str(v['school.name']), logo: str(v['brand.logoText']) || str(v['school.shortName']).slice(0, 1).toUpperCase(), about: str(v['school.tagline']), brand: str(v['brand.color'], '#6A4CF5'),
    notify: bool(v['attendance.notifyParents'], true), notice: v['approvals.notice'] !== 'off', twoFactor: bool(v['security.twoFactor'], true), waiver: str(v['approvals.feeWaiver'], 'principal'),
    modules: closeModules(set).sort(),
  };
}


/** First of next month, in the school's time zone: the day the next invoice goes out. */
function nextInvoice(): string {
  const [y, m] = istToday().split('-').map(Number) as [number, number];
  return new Date(Date.UTC(m === 12 ? y + 1 : y, m % 12, 1)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function SettingsPage() {
  const app = useApp();
  const chrome = useChrome('set');
  const qc = useQueryClient();
  const doc = useQuery({ queryKey: ['settings'], queryFn: app.api.settings.get });
  const data = doc.data;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tab, setTab] = useState(0);
  const [apOpen, setApOpen] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const [shk, setShk] = useState(0);
  const [toast, setToast] = useState('');
  const [copied, setCopied] = useState('');
  const [used, setUsed] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => { const off = () => setApOpen(false); document.addEventListener('click', off); return () => document.removeEventListener('click', off); }, []);
  // A refresh (for instance after a panel saved its own keys) keeps unsaved General edits.
  const base = useRef<Draft | null>(null);
  useEffect(() => {
    if (!data) return;
    const next = draftOf(data);
    setDraft((cur) => (!cur || !base.current || JSON.stringify(cur) === JSON.stringify(base.current) ? next : cur));
    base.current = next;
    setErr({});
  }, [data]);

  const [asking, setAsking] = useState(false);

  const usage = data?.usage;
  const smsTarget = usage && usage.smsLimit ? Math.min(100, Math.round((usage.smsUsed / usage.smsLimit) * 100)) : 0;
  useEffect(() => { const t = setTimeout(() => setUsed(smsTarget), 300); return () => clearTimeout(t); }, [smsTarget]);

  if (doc.isError && !data) {
    return (
      <Shell page="settings" theme={chrome.themeCls} aside={chrome.aside}>
        <main className="mn"><header className="hd"><div><h1>Settings</h1></div></header>
          <div><EmptyCard error title="Settings" chip={{ text: 'Couldn’t load', tone: 'r' }} scene="plug" heading="That didn’t load" body={(doc.error as Error).message} actions={<button className="btn pri" onClick={() => void doc.refetch()}>Try again</button>} /></div>
        </main>
      </Shell>
    );
  }
  if (!data || !draft) {
    return (
      <Shell page="settings" theme={chrome.themeCls} aside={chrome.aside} overlays={<>{chrome.palette}</>}>
        <main className="mn" aria-busy="true"><header className="hd"><div><h1>Settings</h1><p>&nbsp;</p></div></header>
          <div className="skc" style={{ height: 520, borderRadius: 28, maxWidth: 780 }} />
        </main>
      </Shell>
    );
  }

  // Gradeon sets the school up from the console; this page shows the setup and asks for changes.
  const canWrite = false;
  const lock = (k: string) => !canWrite || data.locked.includes(k);
  const set = (p: Partial<Draft>) => { setDraft({ ...draft, ...p }); setErr({}); };
  const shortName = str(data.values['school.shortName'], draft.name);
  const swatches = SWATCHES.some((s) => s[1].toLowerCase() === draft.brand.toLowerCase()) ? SWATCHES : [['Current', draft.brand] as [string, string], ...SWATCHES];
  const cur = swatches.find((s) => s[1].toLowerCase() === draft.brand.toLowerCase()) ?? swatches[0]!;
  const ratio = contrastRatio(draft.brand, '#FFFFFF');
  const copy = (key: string, text: string) => { void navigator.clipboard?.writeText(text).catch(() => undefined); setCopied(key); later(() => setCopied(''), 1800); };
  const address = `${window.location.host}${app.base}`;
  const toggle = (key: 'notify' | 'notice' | 'twoFactor', n: string, d: string, setting: string) => ({
    n, d, on: draft[key] ? 'on' : '', sel: draft[key] ? 'true' : 'false', locked: lock(setting), flip: () => set({ [key]: !draft[key] } as Partial<Draft>),
  });
  const plan = {
    name: usage ? usage.plan.charAt(0).toUpperCase() + usage.plan.slice(1) : '', status: 'Active', next: `Next invoice, ${nextInvoice()}`,
    students: (usage?.students ?? 0).toLocaleString('en-IN'), staff: (usage?.staff ?? 0).toLocaleString('en-IN'),
    smsLeft: Math.max(0, (usage?.smsLimit ?? 0) - (usage?.smsUsed ?? 0)).toLocaleString('en-IN'),
  };

  const say = (text: string) => { setToast(text); later(() => setToast(''), 3600); };
  const extra: ReactNode = tab === 1 ? <ModulesPanel doc={data} draft={draft} locked={lock('modules.enabled')} onChange={(m) => set({ modules: m })} />
    : tab === 2 ? <AppLayoutPanel doc={data} say={say} />
      : tab === 3 ? <RolesPanel say={say} />
        : tab === 4 ? <NotificationsPanel doc={data} say={say} />
          : tab === 5 ? <TemplatesPanel doc={data} say={say} />
            : tab === 6 ? <PrivacyPanel doc={data} say={say} />
              : tab === 7 ? <AuditPanel />
                : null;

  const v = {
    ...chrome, tab, extra, shk: shk ? `shk${(shk % 2) + 1}` : '', err, shortName, plan, used,
    tabs: TABS.map((t, i) => ({ n: t[0], d: t[1], nw: !!t[2], on: i === tab ? 'on' : '', cur: i === tab ? 'page' : 'false', pick: () => setTab(i) })),
    name: draft.name, onName: (e: React.ChangeEvent<HTMLInputElement>) => set({ name: e.target.value }), logoText: draft.logo, onLogo: (e: React.ChangeEvent<HTMLInputElement>) => set({ logo: e.target.value.slice(0, 2) }),
    roName: lock('school.name'), roLogo: lock('brand.logoText'),
    brandC: draft.brand, brandN: cur[0], ratio: ratio.toFixed(1), aa: ratio >= 4.5,
    swatches: swatches.map((w) => ({ n: w[0], c: w[1], on: w[1].toLowerCase() === draft.brand.toLowerCase() ? 'on' : '', sel: w[1].toLowerCase() === draft.brand.toLowerCase() ? 'true' : 'false', locked: lock('brand.color'), pick: () => set({ brand: w[1] }) })),
    address, copiedAddr: copied === 'addr' ? 'done' : '', copyAddress: () => copy('addr', address),
    schoolCode: app.slug.toUpperCase(), copied: copied === 'code' ? 'done' : '', copyLabel: copied === 'code' ? 'Copied' : 'Copy', copyIc: copied === 'code' ? 'M5 12.5l4.5 4.5L19 7.5' : 'M9 9h10v10H9zM5 15V5h10', copy: () => copy('code', app.slug.toUpperCase()),
    about: draft.about, aboutLen: draft.about.length, aboutMax: 120, roAbout: lock('school.tagline'), onAbout: (e: React.ChangeEvent<HTMLTextAreaElement>) => set({ about: e.target.value }),
    toggles: [
      toggle('notify', 'Tell parents when a child is absent', 'Parents get a message as soon as attendance is marked.', 'attendance.notifyParents'),
      toggle('notice', 'Notices wait for approval', 'Notices to whole classes need an approver before they send.', 'approvals.notice'),
      toggle('twoFactor', 'Ask for a code at sign-in', 'Staff confirm a one-time code after their password.', 'security.twoFactor'),
    ],
    apOpen: apOpen ? 'open' : '', apExp: apOpen ? 'true' : 'false', apLabel: WAIVERS.find((w) => w[0] === draft.waiver)?.[1] ?? WAIVERS[0]![1],
    apLocked: lock('approvals.feeWaiver'),
    toggleAp: (e: React.MouseEvent) => { e.stopPropagation(); if (!lock('approvals.feeWaiver')) setApOpen((o) => !o); },
    aps: WAIVERS.map((w, i) => ({ n: w[1], on: w[0] === draft.waiver, d: 50 + i * 45, pick: () => { set({ waiver: w[0] }); setApOpen(false); } })),
    ticks: Array.from({ length: TICKS }, (_, k) => ({ c: k < (used / 100) * TICKS ? 'on' : '' })),
    ask: () => setAsking(true), toast: !!toast, toastText: toast,
    askDialog: asking ? <AskDialog area={TABS[tab]![0]} onClose={() => setAsking(false)} onDone={() => { setAsking(false); say('Sent to Gradeon. You will see the answer here.'); }} /> : null,
  };
  return <SettingsView v={v} />;
}

function ModulesPanel({ doc, draft, locked, onChange }: { doc: SettingsResponse; draft: Draft; locked: boolean; onChange: (m: string[]) => void }) {
  const [warn, setWarn] = useState('');
  const flip = (key: string, on: boolean) => {
    if (on) { setWarn(''); onChange(closeModules([...draft.modules, key]).sort()); return; }
    const needs = dependents(key, draft.modules);
    if (needs.length) { setWarn(`${doc.modules.find((m) => m.key === key)?.name} is needed by ${needs.map((k) => doc.modules.find((m) => m.key === k)?.name ?? k).join(', ')}. Switch those off first.`); return; }
    setWarn(''); onChange(draft.modules.filter((k) => k !== key));
  };
  return (
    <section className="rise">
      <h2 className="sec">Modules<small>Switch whole areas of the app on or off for everyone at your school.</small></h2>
      {warn && <div className="emsg" role="alert" style={{ marginTop: 12 }}>{warn}</div>}
      <div className="grp grp2" style={{ marginTop: 16 }}>
        {doc.modules.map((m) => {
          const on = m.core || draft.modules.includes(m.key);
          return (
            <div className="tgl" key={m.key}>
              <div><b>{m.name}</b><small>{m.entitled ? m.blurb : `${m.blurb} Not part of your plan.`}</small></div>
              {m.core ? <span className="chip">Always on</span>
                : !m.entitled ? <span className="chip">Not in your plan</span>
                  : <button className={`sw ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={m.name} disabled={locked} onClick={() => flip(m.key, !on)}></button>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AuditPanel() {
  const { api } = useApp();
  const q = useQuery({ queryKey: ['settings-audit'], queryFn: api.settings.audit });
  if (q.isLoading) return <div className="skc" style={{ height: 260, borderRadius: 26 }} />;
  if (q.isError) return <EmptyCard error title="Audit log" chip={{ text: 'Couldn’t load', tone: 'r' }} scene="padlock" heading="You can’t see this log" body={(q.error as Error).message} actions={<button className="btn pri" onClick={() => void q.refetch()}>Try again</button>} />;
  const rows = q.data ?? [];
  if (!rows.length) return <EmptyCard title="Audit log" chip={{ text: '0 entries', tone: 'v' }} scene="checklist" heading="Nothing has been changed yet" body="Every change to settings, fees and approvals is written here, with who made it and when." />;
  return (
    <section className="rise">
      <h2 className="sec">Audit log<small>The latest changes made by people at your school.</small></h2>
      <div className="grp lscroll" data-fill="" style={{ marginTop: 16 }}>
        {rows.map((r) => (
          <div className="tgl" key={r.id}>
            <div><b>{r.actor} · {r.action}</b><small>{r.detail || r.entity}</small></div>
            <span className="chip">{new Date(r.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** "Ask Gradeon to change this": the request lands in the console, and the answer shows here. */
function AskDialog({ area, onClose, onDone }: { area: string; onClose: () => void; onDone: () => void }) {
  const app = useApp();
  const qc = useQueryClient();
  const [message, setMessage] = useState('');
  const [err, setErr] = useState('');
  const shake = useShake();
  const mine = useQuery({ queryKey: ['change-requests'], queryFn: app.api.changeRequests.list });
  const send = useMutation({
    mutationFn: () => app.api.changeRequests.create({ area, message: message.trim() }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['change-requests'] }); onDone(); },
    onError: (e) => { setErr((e as Error).message); shake.hit(); },
  });
  return (
    <Dialog title="Ask Gradeon to change this" tag={{ text: area, tone: 'v' }} onClose={onClose} width={560} shake={shake.cls}>
      <div className="fld">
        <label htmlFor="ask-msg">What would you like changed?</label>
        <div className={`inp ${err ? 'err shake' : ''}`} style={{ height: 'auto' }}>
          <textarea id="ask-msg" value={message} onChange={(e) => { setMessage(e.target.value); setErr(''); }} maxLength={1000} aria-invalid={!!err} placeholder="For example: put Fees in the app’s bottom tabs."
            style={{ width: '100%', minHeight: 110, resize: 'vertical', border: 0, outline: 0, background: 'none', font: '500 14.5px/1.5 var(--fb)', color: 'var(--ink)', padding: '10px 0' }} />
        </div>
        {err && <ErrorLine>{err}</ErrorLine>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={send.isPending} onClick={() => { if (message.trim().length < 5) { setErr('Say what you would like changed.'); shake.hit(); } else send.mutate(); }}>{send.isPending ? 'Sending…' : 'Send to Gradeon'}</button>
      </div>
      {(mine.data ?? []).length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div className="lbl" style={{ marginBottom: 6 }}>Your requests</div>
          {(mine.data ?? []).slice(0, 5).map((r) => (
            <div key={r.id} className="kv" style={{ alignItems: 'flex-start' }}>
              <span style={{ minWidth: 0 }}><b style={{ font: '700 13px var(--fb)' }}>{r.area}</b> · {r.message}{r.answer && <small style={{ display: 'block', color: 'var(--ink3)' }}>Gradeon: {r.answer}</small>}</span>
              <b><span className={`chip ${r.status === 'open' ? 'a' : r.status === 'done' ? 'g' : 'r'}`}>{r.status === 'open' ? 'Waiting' : r.status === 'done' ? 'Done' : 'Declined'}</span></b>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
