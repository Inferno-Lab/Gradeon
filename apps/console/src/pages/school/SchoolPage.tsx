import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { HttpError } from '@gradeon/api-client';
import { SCHOOL_BOARDS, SchoolDetailsPatch, STEP_LABELS, auditLabel, type ActionKey, type ProvisionRunRow, type SchoolDetail } from '@gradeon/contracts';
import { DateField, Dialog, EmptyCard, Field, NumberField, PageScope, Select, SelectField, useShake, useToast } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { url } from '../../app/base';
import { useShellChrome } from '../../app/Layout';
import { count, rupees, statusOf, when } from '../../app/format';
import { SchoolView } from './school.view';
import { ConfigTab } from './ConfigTab';
import { DataTab } from './DataTab';
import { RolesTab } from './RolesTab';
import { IntegrationsTab } from './IntegrationsTab';
import { PlanTab } from './PlanTab';
import { SCHOOL_TABS } from '../../app/nav';

const STATE_WORDS: Record<string, string> = { done: 'Done', waiting: 'Waiting on someone', todo: 'To do', queued: 'Queued', building: 'Building', failed: 'Failed', unavailable: 'Not set up' };
const DESC: Record<string, string> = {
  database: 'Its own database with its own role and password',
  'keys-storage': 'Encryption key and file space',
  'migrate-seed': 'Tables first, then roles, statuses and templates',
  domain: 'The school’s address and certificate',
  admin: 'Invite the first admin',
  'build-profile': 'The app’s build file for this school',
  'store-checklist': 'Apple and Google steps for the school',
};
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB');
const dur = (a: string | null, b: string | null) => (a && b ? `${Math.max(0.1, (new Date(b).getTime() - new Date(a).getTime()) / 1000).toFixed(1)}s` : '');

export function SchoolPage() {
  const { id, tab: asked } = useParams({ strict: false }) as { id: string; tab?: string };
  const app = useApp();
  const chrome = useShellChrome();
  const qc = useQueryClient();
  const school = useQuery({
    queryKey: ['school', id], queryFn: () => app.api.school(id),
    refetchInterval: (q) => (['queued', 'running'].includes(q.state.data?.runs[0]?.status ?? '') ? 1500 : false),
  });
  const plans = useQuery({ queryKey: ['plans'], queryFn: app.api.plans, staleTime: 5 * 60_000 });
  const bills = useQuery({ queryKey: ['invoices'], queryFn: app.api.billing.invoices, enabled: app.can('billing.read'), staleTime: 60_000 });
  const tabs = SCHOOL_TABS.filter((t) => !t.needs || app.can(t.needs));
  const tab = tabs.find((t) => t.key === asked)?.key ?? 'overview';
  const [dlg, setDlg] = useState<'support' | 'erase' | 'details' | 'pause' | null>(null);
  const [menu, setMenu] = useState(false);
  const [steps, setSteps] = useState(false);
  const { toast, say } = useToast();
  const [sup, setSup] = useState<{ id: string; until: number } | null>(null);
  const [left, setLeft] = useState(0);

  const d = school.data;
  // An open session of mine at this school comes from the server, so the bar and its countdown survive a reload.
  const sessions = useQuery({ queryKey: ['support'], queryFn: app.api.support.list, enabled: app.can('support.access'), staleTime: 15_000 });
  useEffect(() => {
    const mine = sessions.data?.find((r) => r.schoolId === id && r.status === 'active' && r.startedBy === app.user.email && r.expiresAt);
    if (mine && !sup) setSup({ id: mine.id, until: new Date(mine.expiresAt!).getTime() });
  }, [sessions.data, id, app.user.email, sup]);
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
  const st = statusOf(d);
  const moving = d.status === 'live' && !d.wentLiveAt;
  const stChip = running ? 'v' : moving ? 'v' : d.status === 'live' ? 'g' : d.status === 'suspended' ? 'c' : 'a';
  const stText = running ? 'Setting up' : moving ? 'Moving in' : d.status === 'live' ? 'Live' : st.text;
  // The school's own invoices from Billing: the latest one, not a date made up here.
  const last = (bills.data ?? []).filter((b) => b.schoolId === d.id).sort((a, b) => b.period.localeCompare(a.period))[0];
  const settled = d.status === 'live' && !running && failed < 0;
  const lines = (run?.steps ?? []).flatMap((s) => s.log).sort((a, b) => a.at.localeCompare(b.at)).slice(-6);
  const done = d.checklist.filter((c) => c.state === 'done').length;

  const danger = app.can('schools.danger') && d.status !== 'archived' ? (
    <div className="card s12 rise" style={{ boxShadow: 'inset 0 0 0 2px color-mix(in srgb,var(--c) 40%,transparent)' }}>
      <div className="ch"><h2>Danger</h2></div>
      <div className="help">Erasing drops the school’s database, deletes its files and its key, so every backup becomes unreadable. It needs a second person.</div>
      <div style={{ marginTop: 12 }}><button className="btn dng" onClick={() => setDlg('erase')}>Erase this school…</button></div>
    </div>
  ) : null;
  const extra: ReactNode = tab === 'plan' ? <PlanTab key={d.entitlement.version} d={d} say={say} />
    : tab === 'configuration' ? <ConfigTab schoolId={d.id} say={say} />
      : tab === 'roles' ? <RolesTab schoolId={d.id} say={say} />
        : tab === 'data' ? <DataTab d={d} say={say} danger={danger} />
          : tab === 'messaging' ? <IntegrationsTab d={d} />
            : tab === 'technical' ? <Technical d={d} onAct={(a, p, dry) => act.mutate({ action: a, params: p, dryRun: dry })} busy={act.isPending} />
              : tab === 'audit' ? <Audit id={id} /> : null;

  const v = {
    ...chrome, tab, extra, toast, golive: tab === 'overview' && (d.status === 'live' || d.status === 'onboarding') ? <GoLive d={d} say={say} onDone={refresh} /> : null,
    name: d.name, shortName: d.shortName, color: d.color, logoText: d.logoText, subtitle: `${d.slug} · cell ${d.cell} · ${planName} plan`,
    fleetHref: url('/'), toFleet: (e: React.MouseEvent) => { e.preventDefault(); app.go('/'); },
    stChip, stText, canSupport: app.can('support.access') && d.status !== 'archived',
    openSupport: () => setDlg('support'),
    menu, setMenu, menuItems: [
      ...(app.can('schools.write') ? [{ label: 'Edit details', run: () => setDlg('details') }] : []),
      ...(app.can('schools.danger') && d.status === 'live' ? [{ label: 'Pause this school…', run: () => setDlg('pause') }] : []),
      ...(app.can('schools.danger') && d.status === 'suspended' ? [{ label: 'Bring it back', run: () => act.mutate({ action: 'school.resume' }) }] : []),
      ...(app.can('billing.read') ? [{ label: 'Open in billing', run: () => app.go(`/billing?school=${d.id}`) }] : []),
    ],
    tabs: tabs.map((t) => ({ key: t.key, n: t.label })), pickTab: (k: string) => app.go(k === 'overview' ? `/schools/${d.id}` : `/schools/${d.id}/${k}`),
    provTitle: d.status === 'onboarding' || running ? 'Setting up the school' : 'How this school was set up',
    // Once the school runs and nothing failed, the set-up steps fold into one line.
    folded: settled && !steps, setupLine: run ? `Set up ${when(run.startedAt)} in ${run.steps.length} steps` : 'Set up before set-up runs were recorded', showSteps: () => setSteps(true), hideSteps: settled ? () => setSteps(false) : undefined,
    steps: (run?.steps ?? []).map((s, i) => ({
      n: STEP_LABELS[s.key] ?? s.label, num: i + 1, cls: s.status === 'running' ? 'run' : s.status === 'done' ? 'done' : s.status === 'failed' ? 'fail' : s.status === 'skipped' ? 'skip' : '',
      ok: s.status === 'done', bad: s.status === 'failed', todo: s.status === 'pending' || s.status === 'skipped',
      d: s.status === 'failed' ? (s.error ?? 'This step did not finish.') : s.status === 'skipped' ? 'Skipped for now. It can be done later.' : (s.log.at(-1)?.text ?? DESC[s.key] ?? ''),
      t: s.status === 'skipped' ? 'Skipped' : dur(s.startedAt, s.finishedAt),
    })),
    log: lines.length ? lines.map((l) => ({ t: clock(l.at), m: l.text, c: l.level === 'error' ? 'bad' : l.level === 'info' ? 'ok' : '' })) : [{ t: '--:--:--', m: 'ready · nothing has run for this school yet', c: '' }],
    canRetry: !!failedStep && !!run && !running && app.can('schools.write'), canSkip: !!failedStep?.optional && !running && app.can('schools.write'), failedNo: failed + 1, busy: retry.isPending || skip.isPending,
    retry: () => run && retry.mutate(run), skip: () => run && failedStep && skip.mutate({ run, step: failedStep.key }),
    planName, invoiceLine: !app.can('billing.read') ? '' : last ? `Last invoice ${last.period}: ${rupees(last.amount)}, ${last.status}` : d.entitlement.trialUntil ? `Free until ${d.entitlement.trialUntil}` : 'No invoice yet',
    contactLine: `Contact: ${d.contact.name} · ${d.contact.phone}`, canBilling: app.can('billing.read'), openBilling: () => app.go(`/billing?school=${d.id}`),
    planChip: stChip, planStatus: stText, yearly: plan ? `${rupees(lim.students * plan.perStudentYear)} a year at most` : '', limitStudents: count(lim.students),
    u1: pct(d.usage.students, lim.students), u2: pct(d.usage.storageGb, lim.storageGb), studentsText: `${count(d.usage.students)} of ${count(lim.students)}`, storageText: `${d.usage.storageGb.toFixed(1)} of ${lim.storageGb} GB`,
    smsText: `${smsPct}% used`, sms: Array.from({ length: 20 }, (_, k) => ({ c: k < Math.round(smsPct / 5) ? 'on' : '' })),
    checks: d.checklist.map((c) => ({ key: c.key, n: c.label, state: c.state, cls: c.state === 'done' ? 'd' : c.state === 'waiting' ? 'w' : 'n', who: c.by ? `${STATE_WORDS[c.state]} · ${c.by} · ${when(c.at)}` : '', set: (state: 'done' | 'waiting' | 'todo') => check.mutate({ key: c.key, state }) })),
    checkOptions: (['todo', 'waiting', 'done'] as const).map((k) => ({ value: k, label: STATE_WORDS[k]! })),
    checkDone: done, checkTotal: d.checklist.length, canWrite: app.can('schools.write'),
    sup: !!sup, clock: `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`,
    endSup: () => { if (sup) void app.api.support.end(sup.id).then(() => qc.invalidateQueries({ queryKey: ['support'] })).catch(() => undefined); setSup(null); },
    dialog: dlg === 'support' ? (
      <SupportDialog school={d} onClose={() => setDlg(null)} onStarted={(s) => { setDlg(null); setSup(s); }} />
    ) : dlg === 'erase' ? (
      <EraseDialog school={d} onClose={() => setDlg(null)} onSent={(done) => { setDlg(null); refresh(); if (done) app.go('/'); else say('Erasure requested. A second person has to approve it under Approvals.'); }} />
    ) : dlg === 'details' ? (
      <DetailsDialog d={d} onClose={() => setDlg(null)} onDone={() => { setDlg(null); refresh(); say('Details saved.'); }} />
    ) : dlg === 'pause' ? (
      <Dialog title={`Pause ${d.name}?`} tag={{ text: 'Everyone is signed out of it', tone: 'a' }} onClose={() => setDlg(null)} width={460}>
        <p style={{ marginTop: 0 }}>Its admin and app show a pause message and nothing can be changed; its data stays as it is. Bring it back from this menu.</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn" onClick={() => setDlg(null)}>Cancel</button>
          <button className="btn dngf" disabled={act.isPending} onClick={() => { setDlg(null); act.mutate({ action: 'school.suspend' }); }}>Pause it</button>
        </div>
      </Dialog>
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

/** The school's machinery: versions, its database changes, app builds, health and backups. */
function Technical({ d, onAct, busy }: { d: SchoolDetail; onAct: (a: ActionKey, p?: Record<string, unknown>, dry?: boolean) => void; busy: boolean }) {
  const app = useApp();
  const qc = useQueryClient();
  const probe = useMutation({ mutationFn: () => app.api.probe(d.id), onSuccess: () => void qc.invalidateQueries({ queryKey: ['school'] }) });
  // While a backup is being taken the list refreshes until the new one is there, not after a fixed wait.
  const [waitingFor, setWaitingFor] = useState<number | null>(null);
  const backups = useQuery({ queryKey: ['backups', d.id], queryFn: () => app.api.backups(d.id), refetchInterval: waitingFor != null ? 2000 : false });
  useEffect(() => { if (waitingFor != null && (backups.data?.length ?? 0) > waitingFor) setWaitingFor(null); }, [backups.data, waitingFor]);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [build, setBuild] = useState<'android' | 'ios' | null>(null);
  const st = statusOf(d);
  return (
    <section className="grid">
      <Card title="Right now" chip={<span className={`st ${st.tone}`}><i></i>{st.text}</span>} span="s6">
        <div className="kv">Answer time<b>{d.healthMs != null ? `${d.healthMs} ms` : 'Not measured yet'}</b></div>
        <div className="kv">Last problem<b>{d.lastIncident ?? 'None recorded'}</b></div>
        <div className="kv">Address<b style={{ overflowWrap: 'anywhere' }}>{d.adminUrl}</b></div>
        <div className="help">Checked every minute; two failures in a row open an incident on Fleet.</div>
        <div style={{ marginTop: 12 }}><button className="btn" onClick={() => probe.mutate()} disabled={probe.isPending}>{probe.isPending ? 'Checking…' : 'Check this school now'}</button></div>
      </Card>
      <Card title="Running versions" span="s6">
        <div className="kv">School API<b>{d.versions.api}</b></div>
        <div className="kv">Admin<b>{d.versions.admin}</b></div>
        <div className="kv">Mobile app<b>{d.versions.app}</b></div>
        <div className="kv">Configuration<b>{d.configVersion}</b></div>
        <div className="kv">Placed on<b>{d.target} · cell {d.cell} · {d.region}</b></div>
      </Card>
      <Card title="Database changes" span="s12">
        <div className="help">Applies changes to the school’s tables it has not had yet. A rehearsal reports what would run and changes nothing. Every school’s state is on <a href={url('/releases/database')} onClick={(e) => { e.preventDefault(); app.go('/releases/database'); }}>Releases → Database changes</a>.</div>
        <div className="tgrow" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => onAct('migration.run', {}, true)} disabled={busy || !app.can('schools.write')}>Rehearse</button>
          <button className="btn pri" onClick={() => onAct('migration.run')} disabled={busy || !app.can('schools.write')}>Run database changes</button>
        </div>
      </Card>
      <Card title="App builds" span="s12" chip={app.can('builds.write') ? <span className="tgrow"><button className="btn sm" onClick={() => setBuild('android')} disabled={busy}>Build Android</button><button className="btn sm" onClick={() => setBuild('ios')} disabled={busy}>Build iPhone</button></span> : undefined}>
        {d.builds.length === 0 && <div className="help">No builds yet. A build packages this school’s name, colours and address into its own app, signed and sent to the store.</div>}
        {d.builds.map((b) => (
          <div key={b.id} className="kv">
            <span>{b.platform === 'android' ? 'Android' : 'iPhone'} · {b.version} · {when(b.createdAt)}<br /><small style={{ color: b.status === 'failed' ? 'var(--c)' : 'var(--ink3)' }}>{b.note}</small></span>
            <b>{b.url ? <a href={b.url} target="_blank" rel="noreferrer" style={{ color: 'var(--vD)' }}>Install</a> : <span className={`st ${b.status === 'done' ? 'g' : b.status === 'failed' ? 'c' : 'n'}`}><i></i>{STATE_WORDS[b.status] ?? b.status}</span>}</b>
          </div>
        ))}
      </Card>
      <Card title="Backups" span="s12" chip={<span className="chip">{(backups.data ?? []).length} kept</span>}>
        <div className="help">The whole database is backed up every day; the last 14 are kept. Putting one back needs a second person and takes a backup of the data just before.</div>
        {(backups.data ?? []).map((b) => (
          <div key={b.id} className="kv">{when(b.takenAt)} · {b.kind === 'daily' ? 'daily' : `by ${b.takenBy}`}
            <b style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{Math.max(1, Math.round(b.bytes / 1024))} KB
              {app.can('schools.write') && (restoring === b.id
                ? <><button className="btn sm dng" disabled={busy} onClick={() => { onAct('backup.restore', { backupId: b.id }); setRestoring(null); }}>Ask to restore</button><button className="btn sm" onClick={() => setRestoring(null)}>Keep</button></>
                : <button className="btn sm" onClick={() => setRestoring(b.id)}>Restore…</button>)}
            </b>
          </div>
        ))}
        {app.can('schools.write') && <div style={{ marginTop: 12 }}><button className="btn" disabled={busy || waitingFor != null} onClick={() => { setWaitingFor(backups.data?.length ?? 0); onAct('backup.take'); }}>{waitingFor != null ? 'Backing up…' : 'Back up now'}</button></div>}
      </Card>
      {build && (
        <Dialog title={`Build the ${build === 'android' ? 'Android' : 'iPhone'} app?`} tag={{ text: d.shortName, tone: 'v' }} onClose={() => setBuild(null)} width={460}>
          <p style={{ marginTop: 0 }}>It is built from the current release with this school’s name, colours and address, signed, and sent to {build === 'android' ? 'Google Play’s test track' : 'TestFlight'}. It takes about 20 minutes.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn" onClick={() => setBuild(null)}>Cancel</button>
            <button className="btn pri" onClick={() => { onAct('build.app', { platform: build }); setBuild(null); }}>Build</button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

/** Everything the console did to this school: who, what (in words) and when; filtered, a page at a time, and exported. */
function Audit({ id }: { id: string }) {
  const app = useApp();
  const [f, setF] = useState({ actor: '', action: '', from: '', to: '' });
  const [pages, setPages] = useState<string[]>([]);
  const before = pages.at(-1);
  const q = useQuery({ queryKey: ['audit', id, f, before], queryFn: () => app.api.audit(id, { ...clean(f), before }), enabled: app.can('audit.read') });
  const team = useQuery({ queryKey: ['team'], queryFn: app.api.team.list, staleTime: 60_000, enabled: app.can('audit.read') });
  if (!app.can('audit.read')) return <EmptyCard title="Audit" chip={{ text: 'Not for your role', tone: 'a' }} scene="padlock" heading="The audit log is for auditors and admins" body="Ask a super admin if you need to see who changed what for this school." />;
  const rows = q.data ?? [];
  const set = (k: keyof typeof f) => (v: string) => { setF({ ...f, [k]: v }); setPages([]); };
  const download = () => void app.api.auditCsv(id, clean(f)).then((csv) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' })); a.download = 'audit.csv'; a.click(); URL.revokeObjectURL(a.href); });
  return (
    <section className="card tbl rise" style={{ padding: 0 }}>
      <div className="ch" style={{ padding: '20px 20px 8px', flexWrap: 'wrap', gap: 10 }}>
        <h2>Audit</h2>
        <span className="grow"></span>
        <Select compact aria-label="Who" value={f.actor} onChange={set('actor')} options={[{ value: '', label: 'Everyone' }, ...(team.data ?? []).map((p) => ({ value: p.email, label: p.name }))]} />
        <Select compact aria-label="What" value={f.action} onChange={set('action')} options={[{ value: '', label: 'Everything' }, { value: 'config.', label: 'Settings' }, { value: 'role', label: 'Roles' }, { value: 'import.', label: 'Imports' }, { value: 'action.', label: 'Risky changes' }, { value: 'support.', label: 'Support sessions' }, { value: 'integration.', label: 'Messaging' }]} />
        <DateField compact label="From" value={f.from} onChange={set('from')} max={f.to || undefined} />
        <DateField compact label="To" value={f.to} onChange={set('to')} min={f.from || undefined} />
        <button className="btn sm" onClick={download}>Export</button>
      </div>
      {q.isLoading ? <div className="skc" style={{ height: 240, margin: 20, borderRadius: 24 }} />
        : !rows.length ? <div className="help" style={{ padding: '0 20px 20px' }}>{pages.length || Object.values(f).some(Boolean) ? 'Nothing matches.' : 'Nothing has happened to this school yet. Every change made from the console is written here.'}</div>
          : <div style={{ padding: '0 20px' }}>{rows.map((r) => <div key={r.id} className="kv"><span>{auditLabel(r.action)}<br /><small style={{ color: 'var(--ink3)' }}>{r.actor}{r.detail ? ` · ${r.detail}` : ''}</small></span><b>{when(r.at)}</b></div>)}</div>}
      <div className="tgrow" style={{ padding: '12px 20px 20px' }}>
        <button className="btn sm" disabled={!pages.length} onClick={() => setPages(pages.slice(0, -1))}>Newer</button>
        <button className="btn sm" disabled={rows.length < 50} onClick={() => setPages([...pages, rows.at(-1)!.at])}>Older</button>
      </div>
    </section>
  );
}

const clean = (f: Record<string, string>) => Object.fromEntries(Object.entries(f).filter(([, v]) => v));

/**
 * Ready to go live: worked out from the school's own data, plus what only Gradeon can tick. Go live ends moving in (the
 * school's Moving in page closes); it is pressed once every item is green.
 */
function GoLive({ d, say, onDone }: { d: SchoolDetail; say: (m: string, tone?: 'ok' | 'bad') => void; onDone: () => void }) {
  const app = useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['migration', d.id], queryFn: () => app.api.migration.view(d.id), enabled: d.status === 'live' });
  const [oldDues, setOldDues] = useState('');
  const [confirm, setConfirm] = useState(false);
  const can = app.can('schools.configure');
  const mark = useMutation({ mutationFn: (b: Parameters<typeof app.api.migration.mark>[1]) => app.api.migration.mark(d.id, b), onSuccess: (next) => qc.setQueryData(['migration', d.id], next), onError: (e) => say((e as Error).message, 'bad') });
  const go = useMutation({
    mutationFn: () => app.api.actions.request({ action: 'school.golive', schoolId: d.id, params: {}, dryRun: false }),
    onSuccess: (r) => { setConfirm(false); onDone(); say(r.status === 'pending_approval' ? 'Sent for a second person to approve.' : r.status === 'failed' ? r.summary : r.summary, r.status === 'failed' ? 'bad' : 'ok'); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  if (d.wentLiveAt) return <div className="card s12 rise"><div className="ch"><h2>Live</h2><span className="chip g">Since {when(d.wentLiveAt)}</span></div><div className="help">Moving in is over: the school adds its records from each page now. Imports for it still work from the Data tab.</div></div>;
  if (d.status !== 'live') return <div className="card s12 rise"><div className="ch"><h2>Ready to go live</h2><span className="chip v">After set-up</span></div><div className="help">The go-live checklist starts once the school’s set-up has finished.</div></div>;
  const v = q.data;
  if (!v) return <div className="skc" style={{ height: 200, borderRadius: 24 }} />;
  const open = v.readiness.filter((r) => !r.done);
  return (
    <div className="card s12 rise">
      <div className="ch"><h2>Ready to go live</h2><span className={`chip ${open.length ? 'a' : 'g'}`}>{v.readiness.length - open.length} of {v.readiness.length}</span></div>
      <div className="help">Worked out from the school’s own data. The school invites staff and families from its admin (Staff, Students → On the app).</div>
      <div style={{ marginTop: 10 }}>
        {v.readiness.map((r) => (
          <div key={r.key} className="grd rw" style={{ '--cols': '28px minmax(0,1fr) minmax(0,auto)', height: 'auto', padding: '10px 0' } as React.CSSProperties}>
            <span className={`st ${r.done ? 'g' : 'a'}`} aria-label={r.done ? 'Done' : 'Not yet'}><i></i></span>
            <b style={{ font: '700 14px var(--fb)' }}>{r.label}</b>
            <span style={{ color: 'var(--ink3)', font: '600 13px var(--fb)', textAlign: 'right', display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {r.detail}
              {can && r.manual && <button className="btn sm" disabled={mark.isPending} onClick={() => mark.mutate({ key: r.key as 'config_reviewed' | 'staff_trained', done: !r.done })}>{r.done ? 'Undo' : 'Mark done'}</button>}
            </span>
          </div>
        ))}
        {can && v.dues && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', marginTop: 12 }}>
            <div style={{ flex: '1 1 220px', maxWidth: 300 }}><NumberField label="The old system’s total dues (₹)" min={0} value={oldDues || (v.dues.oldSystem == null ? '' : String(v.dues.oldSystem))} onChange={setOldDues} hint="From its dues report: must match what is owed here." /></div>
            <button className="btn" disabled={mark.isPending} onClick={() => mark.mutate({ key: 'old_dues', amount: oldDues === '' ? null : Math.round(Number(oldDues)) })}>Compare</button>
          </div>
        )}
      </div>
      {app.can('schools.write') && (
        <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn pri" disabled={open.length > 0 || go.isPending} onClick={() => setConfirm(true)}>Go live</button>
          <span className="help" style={{ margin: 0 }}>{open.length ? `${open.length} ${open.length === 1 ? 'item is' : 'items are'} still open.` : 'Every item is green.'}</span>
        </div>
      )}
      {confirm && (
        <Dialog title={`Take ${d.name} live?`} tag={{ text: 'Moving in ends', tone: 'v' }} onClose={() => setConfirm(false)} width={460}>
          <p style={{ marginTop: 0 }}>The school’s Moving in page closes and its people add records from each page from now on. Gradeon can still import a file for it from the Data tab.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn" onClick={() => setConfirm(false)}>Not yet</button>
            <button className="btn pri" disabled={go.isPending} onClick={() => go.mutate()}>Go live</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/** What Gradeon keeps about the school beside its own settings. Its name, colours and address are in Configuration → School identity. */
function DetailsDialog({ d, onClose, onDone }: { d: SchoolDetail; onClose: () => void; onDone: () => void }) {
  const app = useApp();
  const shake = useShake();
  const [f, setF] = useState({ name: d.contact.name, phone: d.contact.phone, email: d.contact.email, gstin: d.gstin, board: d.board });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErr((e) => ({ ...e, [k]: '', _: '' })); };
  const save = useMutation({
    mutationFn: () => app.api.setDetails(d.id, SchoolDetailsPatch.parse({ contact: { name: f.name, phone: f.phone, email: f.email }, gstin: f.gstin, board: f.board })),
    onSuccess: onDone,
    onError: (e) => {
      const issues = (e as { issues?: { path: (string | number)[]; message: string }[] }).issues;
      setErr(issues ? Object.fromEntries(issues.map((i) => [String(i.path.at(-1)), i.message])) : { _: (e as Error).message });
      shake.hit();
    },
  });
  return (
    <Dialog title="School details" tag={{ text: d.shortName, tone: 'v' }} onClose={onClose} width={520} shake={shake.cls}>
      <div className="stack">
        <div className="help" style={{ marginTop: 0 }}>Gradeon’s contact at the school, for invoices and incidents. The school’s own name, address and colours are in its Configuration.</div>
        <Field label="Contact name" value={f.name} onChange={set('name')} error={err.name} maxLength={80} />
        <div className="two">
          <Field label="Phone" type="tel" value={f.phone} onChange={set('phone')} error={err.phone} />
          <Field label="Email" type="email" value={f.email} onChange={set('email')} error={err.email} />
        </div>
        <div className="two">
          <Field label="Tax number (GSTIN)" value={f.gstin} onChange={set('gstin')} error={err.gstin} maxLength={20} hint="On the school’s invoices." />
          <SelectField label="Board" value={f.board} onChange={set('board')} error={err.board} options={SCHOOL_BOARDS.map((b) => ({ value: b, label: b }))} />
        </div>
        {err._ && <div className="emsg" role="alert">{err._}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={save.isPending} onClick={() => save.mutate()}>Save</button>
      </div>
    </Dialog>
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
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
