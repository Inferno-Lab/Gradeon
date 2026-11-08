import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { HttpError } from '@gradeon/api-client';
import { STEP_LABELS, type ActionKey, type ProvisionRunRow, type SchoolDetail } from '@gradeon/contracts';
import { Dialog, EmptyCard, PageScope, useShake } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { url } from '../../app/base';
import { useShellChrome } from '../../app/Layout';
import { ago, count, rupees, statusOf, when } from '../../app/format';
import { SchoolView } from './school.view';
import { ConfigTab } from './ConfigTab';
import { MigrationTab } from './MigrationTab';
import { RolesTab } from './RolesTab';
import { PlanEditor } from '../modules/ModulesPage';

const TABS = ['Overview', 'Entitlements', 'Configuration', 'Roles', 'Migration', 'Versions', 'Health', 'Audit'];
const DESC: Record<string, string> = {
  database: 'Its own database with its own role and password',
  'keys-storage': 'Encryption key and file space',
  'migrate-seed': 'Tables first, then roles, statuses and templates',
  domain: 'The school’s address and certificate',
  admin: 'Invite the first admin',
  'build-profile': 'The app’s build file for this school',
  'store-checklist': 'Apple and Google steps for the school',
};
const NEXT: Record<string, 'done' | 'waiting' | 'todo'> = { todo: 'waiting', waiting: 'done', done: 'todo' };
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB');
const dur = (a: string | null, b: string | null) => (a && b ? `${Math.max(0.1, (new Date(b).getTime() - new Date(a).getTime()) / 1000).toFixed(1)}s` : '');

export function SchoolPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const app = useApp();
  const chrome = useShellChrome();
  const qc = useQueryClient();
  const school = useQuery({
    queryKey: ['school', id], queryFn: () => app.api.school(id),
    refetchInterval: (q) => (['queued', 'running'].includes(q.state.data?.runs[0]?.status ?? '') ? 1500 : false),
  });
  const plans = useQuery({ queryKey: ['plans'], queryFn: app.api.plans, staleTime: 5 * 60_000 });
  const [tab, setTab] = useState(0);
  const [dlg, setDlg] = useState<'support' | 'erase' | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);
  const [sup, setSup] = useState<{ id: string; until: number } | null>(null);
  const [left, setLeft] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const say = (text: string, tone: 'ok' | 'bad' = 'ok') => { clearTimeout(timer.current); setToast({ text, tone }); timer.current = setTimeout(() => setToast(null), 4200); };
  useEffect(() => () => clearTimeout(timer.current), []);

  const d = school.data;
  useEffect(() => {
    if (!sup) return;
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((sup.until - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) setSup(null);
    }, 1000);
    setLeft(Math.max(0, Math.round((sup.until - Date.now()) / 1000)));
    return () => clearInterval(t);
  }, [sup]);

  const refresh = () => void qc.invalidateQueries({ predicate: (q) => ['school', 'schools', 'fleet', 'actions', 'runs'].includes(String(q.queryKey[0])) });
  const retry = useMutation({ mutationFn: (run: ProvisionRunRow) => app.api.runs.retry(run.id), onSuccess: refresh, onError: (e) => say((e as Error).message, 'bad') });
  const skip = useMutation({ mutationFn: (b: { run: ProvisionRunRow; step: ProvisionRunRow['steps'][number]['key'] }) => app.api.runs.skip(b.run.id, b.step), onSuccess: refresh, onError: (e) => say((e as Error).message, 'bad') });
  const check = useMutation({
    mutationFn: (b: { key: string; state: 'done' | 'waiting' | 'todo' }) => app.api.setChecklist(id, b.key, b.state), onSuccess: refresh, onError: (e) => say((e as Error).message, 'bad'),
  });
  const act = useMutation({
    mutationFn: (b: { action: ActionKey; params?: Record<string, unknown>; dryRun?: boolean; confirmCode?: string }) => app.api.actions.request({ action: b.action, schoolId: id, params: b.params ?? {}, dryRun: !!b.dryRun, confirmCode: b.confirmCode }),
    onSuccess: (r) => { refresh(); say(r.status === 'pending_approval' ? 'Sent for a second person to approve. It is waiting under Approvals.' : r.status === 'failed' ? `That did not work: ${r.summary}` : r.summary, r.status === 'failed' ? 'bad' : 'ok'); },
    onError: (e) => say((e as Error).message, 'bad'),
  });

  if (school.isError && !d) {
    return (
      <PageScope page="school">
        <main className="mn"><header className="hd"><div><h1>School</h1></div></header>
          <div><EmptyCard error title="School" chip={{ text: 'Couldn’t load', tone: 'c' }} scene="search-paper" heading="That school isn’t here" body={(school.error as Error).message} actions={<button className="btn pri" onClick={() => app.go('/')}>Back to the fleet</button>} /></div>
        </main>
      </PageScope>
    );
  }
  if (!d) {
    return (
      <PageScope page="school">
        <main className="mn" aria-busy="true"><header className="hd"><div><h1>&nbsp;</h1><p>&nbsp;</p></div></header>
          <div className="skc" style={{ height: 520, borderRadius: 28 }} />
        </main>
      </PageScope>
    );
  }

  const run = d.runs[0];
  const failed = run?.steps.findIndex((s) => s.status === 'failed') ?? -1;
  const failedStep = failed >= 0 ? run!.steps[failed]! : null;
  const running = run?.status === 'running' || run?.status === 'queued';
  const plan = plans.data?.find((p) => p.key === d.plan);
  const planName = plan?.name ?? d.plan;
  const lim = d.entitlement.limits;
  const pct = (n: number, of: number) => (of ? Math.min(100, Math.round((n / of) * 100)) : 0);
  const smsPct = pct(d.usage.sms, lim.smsPerMonth);
  const nextMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const st = statusOf(d);
  const stChip = running ? 'v' : d.status === 'live' ? 'g' : d.status === 'suspended' ? 'c' : 'a';
  const stText = running ? 'Setting up' : d.status === 'live' ? 'Live' : st.text;
  const lines = (run?.steps ?? []).flatMap((s) => s.log).sort((a, b) => a.at.localeCompare(b.at)).slice(-6);
  const done = d.checklist.filter((c) => c.state === 'done').length;

  const extra: ReactNode = tab === 1 ? <PlanEditor key={d.entitlement.version} d={d} say={say} />
    : tab === 2 ? <ConfigTab schoolId={d.id} say={say} />
      : tab === 3 ? <RolesTab schoolId={d.id} say={say} />
        : tab === 4 ? <MigrationTab schoolId={d.id} say={say} />
          : tab === 5 ? <Versions d={d} onAct={(a, p, dry) => act.mutate({ action: a, params: p, dryRun: dry })} busy={act.isPending} />
            : tab === 6 ? <Health d={d} onAct={(a, p) => act.mutate({ action: a, params: p })} busy={act.isPending} />
              : tab === 7 ? <Audit id={id} /> : null;

  const v = {
    ...chrome, tab, extra, toast: toast?.text, toastTone: toast?.tone,
    name: d.name, shortName: d.shortName, color: d.color, logoText: d.logoText, subtitle: `${d.slug} · cell ${d.cell} · ${planName} plan`,
    fleetHref: url('/'), toFleet: (e: React.MouseEvent) => { e.preventDefault(); app.go('/'); },
    stChip, stText, canSupport: app.can('support.access') && d.status !== 'archived', canErase: app.can('schools.danger') && d.status !== 'archived',
    openSupport: () => setDlg('support'), openErase: () => setDlg('erase'),
    tabs: TABS.map((n, i) => ({ n, on: i === tab ? 'on' : '', sel: i === tab ? 'true' : 'false', pick: () => setTab(i) })),
    provTitle: d.status === 'onboarding' || running ? 'Setting up the school' : 'How this school was set up',
    steps: (run?.steps ?? []).map((s, i) => ({
      n: STEP_LABELS[s.key] ?? s.label, num: i + 1, cls: s.status === 'running' ? 'run' : s.status === 'done' ? 'done' : s.status === 'failed' ? 'fail' : s.status === 'skipped' ? 'skip' : '',
      ok: s.status === 'done', bad: s.status === 'failed', todo: s.status === 'pending' || s.status === 'skipped',
      d: s.status === 'failed' ? (s.error ?? 'This step did not finish.') : s.status === 'skipped' ? 'Skipped for now. It can be done later.' : (s.log.at(-1)?.text ?? DESC[s.key] ?? ''),
      t: s.status === 'skipped' ? 'Skipped' : dur(s.startedAt, s.finishedAt),
    })),
    log: lines.length ? lines.map((l) => ({ t: clock(l.at), m: l.text, c: l.level === 'error' ? 'bad' : l.level === 'info' ? 'ok' : '' })) : [{ t: '--:--:--', m: 'ready · nothing has run for this school yet', c: '' }],
    canRetry: !!failedStep && !!run && !running && app.can('schools.write'), canSkip: !!failedStep?.optional && !running && app.can('schools.write'), failedNo: failed + 1, busy: retry.isPending || skip.isPending,
    retry: () => run && retry.mutate(run), skip: () => run && failedStep && skip.mutate({ run, step: failedStep.key }),
    planName, invoiceLine: `Next invoice, ${nextMonth}`, contactLine: `Contact: ${d.contact.name}`, canBilling: app.can('billing.read'), openBilling: () => app.go('/billing'),
    planChip: d.status === 'live' ? 'a' : 'v', planStatus: d.status === 'live' ? 'Active' : st.text, yearly: plan ? `${rupees(lim.students * plan.perStudentYear)} a year` : '', limitStudents: count(lim.students),
    u1: pct(d.usage.students, lim.students), u2: pct(d.usage.storageGb, lim.storageGb), studentsText: `${count(d.usage.students)} of ${count(lim.students)}`, storageText: `${d.usage.storageGb.toFixed(1)} of ${lim.storageGb} GB`,
    smsText: `${smsPct}% used`, sms: Array.from({ length: 20 }, (_, k) => ({ c: k < Math.round(smsPct / 5) ? 'on' : '' })),
    checks: d.checklist.map((c) => ({ n: c.label, state: c.state, cls: c.state === 'done' ? 'd' : c.state === 'waiting' ? 'w' : 'n', flip: () => check.mutate({ key: c.key, state: NEXT[c.state]! }) })),
    checkDone: done, checkTotal: d.checklist.length, canWrite: app.can('schools.write'),
    sup: !!sup, clock: `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`,
    endSup: () => { if (sup) void app.api.support.end(sup.id).catch(() => undefined); setSup(null); },
    dialog: dlg === 'support' ? (
      <SupportDialog school={d} onClose={() => setDlg(null)} onStarted={(s) => { setDlg(null); setSup(s); }} />
    ) : dlg === 'erase' ? (
      <EraseDialog school={d} onClose={() => setDlg(null)} onSent={(done) => { setDlg(null); refresh(); if (done) app.go('/'); else say('Erasure requested. A second person has to approve it under Approvals.'); }} />
    ) : null,
  };
  return <SchoolView v={v} />;
}

function Card({ title, chip, children, span = 's6' }: { title: string; chip?: ReactNode; children: ReactNode; span?: string }) {
  return (
    <div className={`card ${span} rise`}>
      <div className="ch"><h2>{title}</h2>{chip}</div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

function Versions({ d, onAct, busy }: { d: SchoolDetail; onAct: (a: ActionKey, p?: Record<string, unknown>, dry?: boolean) => void; busy: boolean }) {
  const app = useApp();
  return (
    <section className="grid">
      <Card title="Running versions" span="s12">
        <div className="rolh2">
          <div className="kv">School API<b>{d.versions.api}</b></div>
          <div className="kv">Admin panel<b>{d.versions.admin}</b></div>
          <div className="kv">Mobile app<b>{d.versions.app}</b></div>
          <div className="kv">Configuration<b>{d.configVersion}</b></div>
          <div className="kv">Placed on<b>{d.target} · cell {d.cell} · {d.region}</b></div>
        </div>
      </Card>
      <Card title="Database" chip={<span className="chip">Migrations</span>} span="s12">
        <div className="help">Applies any schema changes this school has not seen yet. A rehearsal reports what would run and changes nothing.</div>
        <div className="tgrow" style={{ marginTop: 14 }}>
          <button className="btn" onClick={() => onAct('migration.run', {}, true)} disabled={busy || !app.can('schools.write')}>Rehearse</button>
          <button className="btn pri" onClick={() => onAct('migration.run')} disabled={busy || !app.can('schools.write')}>Run migrations</button>
        </div>
      </Card>
      <Card title="Mobile app builds" chip={<button className="btn sm" onClick={() => onAct('build.app', { platform: 'android' })} disabled={busy || !app.can('builds.write')}>Build Android</button>} span="s12">
        {d.builds.length === 0 && <div className="help">No builds yet. A build packages this school’s name, colours and address into its own app.</div>}
        {d.builds.map((b) => (
          <div key={b.id} className="kv">
            <span>{b.platform === 'android' ? 'Android' : 'iPhone'} · {b.version} · {when(b.createdAt)}<br /><small style={{ color: 'var(--ink3)' }}>{b.note}</small></span>
            <b>{b.url ? <a href={b.url} target="_blank" rel="noreferrer" style={{ color: 'var(--vD)' }}>Install</a> : <span className={`st ${b.status === 'done' ? 'g' : b.status === 'failed' ? 'c' : 'n'}`}>{b.status}</span>}</b>
          </div>
        ))}
      </Card>
    </section>
  );
}

function Health({ d, onAct, busy }: { d: SchoolDetail; onAct: (a: ActionKey, p?: Record<string, unknown>) => void; busy: boolean }) {
  const app = useApp();
  const qc = useQueryClient();
  const probe = useMutation({ mutationFn: app.api.probe, onSuccess: () => void qc.invalidateQueries({ queryKey: ['school'] }) });
  const backups = useQuery({ queryKey: ['backups', d.id], queryFn: () => app.api.backups(d.id), refetchInterval: busy ? 3000 : false });
  const [restoring, setRestoring] = useState<string | null>(null);
  const st = statusOf(d);
  return (
    <section className="grid">
      <Card title="Right now" chip={<span className={`st ${st.tone}`}><i></i>{st.text}</span>} span="s12">
        <div className="kv">Answer time<b>{d.healthMs != null ? `${d.healthMs} ms` : 'Not measured yet'}</b></div>
        <div className="kv">Last problem<b>{d.lastIncident ? ago(d.lastIncident) : 'None recorded'}</b></div>
        <div className="kv">Address<b>{d.adminUrl}</b></div>
        <div style={{ marginTop: 14 }}><button className="btn" onClick={() => probe.mutate()} disabled={probe.isPending}>{probe.isPending ? 'Checking…' : 'Check now'}</button></div>
      </Card>
      <Card title="How it is checked" span="s12">
        <div className="help">The console asks each school’s API for a heartbeat every minute and keeps the answer time. Two failures in a row open an incident on the Fleet page; a clean check closes it.</div>
      </Card>
      <Card title="Backups" span="s12" chip={<span className="chip">{(backups.data ?? []).length} kept</span>}>
        <div className="help">The whole database is backed up every day; the last 14 backups are kept. Putting one back needs a second person to approve, and takes a backup of the data just before.</div>
        {(backups.data ?? []).map((b) => (
          <div key={b.id} className="kv">{new Date(b.takenAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {b.kind === 'daily' ? 'daily' : `by ${b.takenBy}`}
            <b style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{Math.max(1, Math.round(b.bytes / 1024))} KB
              {app.can('schools.write') && (restoring === b.id
                ? <><button className="btn sm dng" disabled={busy} onClick={() => { onAct('backup.restore', { backupId: b.id }); setRestoring(null); }}>Ask to restore</button><button className="btn sm" onClick={() => setRestoring(null)}>Keep</button></>
                : <button className="btn sm" onClick={() => setRestoring(b.id)}>Restore…</button>)}
            </b>
          </div>
        ))}
        {app.can('schools.write') && <div style={{ marginTop: 14 }}><button className="btn" disabled={busy} onClick={() => { onAct('backup.take'); setTimeout(() => void qc.invalidateQueries({ queryKey: ['backups', d.id] }), 1500); }}>Back up now</button></div>}
      </Card>
    </section>
  );
}

function Audit({ id }: { id: string }) {
  const app = useApp();
  const q = useQuery({ queryKey: ['audit', id], queryFn: () => app.api.audit(id), enabled: app.can('audit.read') });
  if (!app.can('audit.read')) return <EmptyCard title="Audit" chip={{ text: 'Not for your role', tone: 'a' }} scene="padlock" heading="The audit log is for auditors and admins" body="Ask a super admin if you need to see who changed what for this school." />;
  if (q.isLoading) return <div className="skc" style={{ height: 240, borderRadius: 26 }} />;
  const rows = q.data ?? [];
  if (!rows.length) return <EmptyCard title="Audit" chip={{ text: '0 entries', tone: 'v' }} scene="checklist" heading="Nothing has happened to this school yet" body="Every change made from the console, who made it and when, is written here." />;
  return (
    <section className="card rise">
      <div className="ch"><h2>Audit</h2><span className="chip">{rows.length} latest</span></div>
      <div style={{ marginTop: 8 }}>
        {rows.map((r) => <div key={r.id} className="kv"><span>{r.action}<br /><small style={{ color: 'var(--ink3)' }}>{r.actor}{r.detail ? ` · ${r.detail}` : ''}</small></span><b>{when(r.at)}</b></div>)}
      </div>
    </section>
  );
}

function SupportDialog({ school, onClose, onStarted }: { school: SchoolDetail; onClose: () => void; onStarted: (s: { id: string; until: number }) => void }) {
  const app = useApp();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const shake = useShake();
  const start = useMutation({
    mutationFn: () => app.api.support.start(school.id, reason.trim()),
    onSuccess: (r) => {
      window.open(`${r.adminUrl.replace(/\/$/, '')}/#support=${r.token}`, '_blank', 'noopener');
      onStarted({ id: r.session.id, until: new Date(r.expiresAt).getTime() });
    },
    onError: (e) => { setErr(e instanceof HttpError ? (e.fields.reason ?? e.message) : (e as Error).message); shake.hit(); },
  });
  const go = () => {
    if (reason.trim().length < 8) { setErr('Say why in a few words, at least 8 letters. It is written to the audit log.'); shake.hit(); return; }
    start.mutate();
  };
  return (
    <Dialog title={`Look inside ${school.shortName}?`} tag={{ text: 'Read-only · 30 minutes', tone: 'v' }} onClose={onClose} width={480} shake={shake.cls}>
      <p>You will see the school’s admin exactly as its staff do, but nothing can be changed. The session ends by itself after 30 minutes.</p>
      <div className="fld">
        <label htmlFor="sup-r">Why do you need to look?</label>
        <div className={`inp ${err ? 'err shake' : ''}`} style={{ height: 'auto' }}>
          <textarea id="sup-r" value={reason} onChange={(e) => { setReason(e.target.value); setErr(''); }} rows={3} placeholder="For example: principal reported attendance not sending" style={{ flex: 1, border: 0, outline: 0, background: 'none', font: '600 15px var(--fb)', color: 'var(--ink)', padding: '12px 0', resize: 'none' }} aria-invalid={!!err} />
        </div>
        {err && <div className="emsg" role="alert">{err}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" onClick={go} disabled={start.isPending}>{start.isPending ? 'Opening…' : 'Start session'}</button>
      </div>
    </Dialog>
  );
}

function EraseDialog({ school, onClose, onSent }: { school: SchoolDetail; onClose: () => void; onSent: (done: boolean) => void }) {
  const app = useApp();
  const [typed, setTyped] = useState('');
  const [bad, setBad] = useState('');
  const shake = useShake();
  const send = useMutation({
    mutationFn: () => app.api.actions.request({ action: 'school.erase', schoolId: school.id, confirmCode: typed.trim() }),
    onSuccess: (r) => onSent(r.status === 'done'),
    onError: (e) => { setBad(e instanceof HttpError ? (e.fields.confirmCode ?? e.message) : (e as Error).message); shake.hit(); },
  });
  const go = () => {
    if (typed.trim() !== school.slug) { setBad('That isn’t the school code. Nothing was erased.'); shake.hit(); return; }
    send.mutate();
  };
  return (
    <Dialog dark title={`Erase ${school.name}?`} tag={{ text: 'Permanent · needs a second approver', tone: 'c' }} onClose={onClose} shake={shake.cls} width={480}>
      <p>Its database is dropped, its files are deleted and its key is scheduled for deletion, so every backup becomes unreadable.</p>
      <div>
        <label htmlFor="er-in">Type <b style={{ color: 'var(--onCi)' }}>{school.slug}</b> to continue</label>
        <input id="er-in" className={`shake ${bad ? 'err' : ''}`} value={typed} onChange={(e) => { setTyped(e.target.value); setBad(''); }} autoComplete="off" aria-invalid={!!bad} />
      </div>
      {bad && <div className="emsg" role="alert" style={{ marginTop: 10 }}>{bad}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" style={{ background: 'transparent', color: 'var(--onCi)', borderColor: 'color-mix(in srgb,var(--onCi) 18%,transparent)' }} onClick={onClose}>Cancel</button>
        <button className="btn dngf" onClick={go} disabled={send.isPending}>Request erasure</button>
      </div>
    </Dialog>
  );
}
