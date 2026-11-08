import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyCard, tintFor } from '@gradeon/web-ui';
import { Card, Page, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { url } from '../../app/base';
import { ago, initials, statusOf } from '../../app/format';

export function OnboardingPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const schools = useQuery({ queryKey: ['schools'], queryFn: () => app.api.schools(), refetchInterval: 8000 });
  const drafts = useQuery({ queryKey: ['drafts'], queryFn: app.api.wizard.drafts, enabled: app.can('schools.write') });
  const del = useMutation({ mutationFn: (id: string) => app.api.wizard.deleteDraft(id), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['drafts'] }); say('Draft removed.'); }, onError: (e) => say((e as Error).message, 'bad') });
  const setting = (schools.data ?? []).filter((s) => s.status === 'onboarding');
  const recent = (schools.data ?? []).filter((s) => s.status === 'live').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const list = drafts.data ?? [];
  const none = !setting.length && !list.length;
  return (
    <Page title="Onboarding" sub="Set a new school up from start to finish: database, address, first admin and app" toast={toast} loading={schools.isLoading} error={schools.isError ? { message: (schools.error as Error).message, retry: () => void schools.refetch() } : null}
      actions={app.can('schools.write') ? <button className="btn pri" onClick={() => app.go('/onboarding/new')}><svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d="M12 5v14M5 12h14"></path></svg>Onboard a school</button> : undefined}>
      {none && (
        <div>
          <EmptyCard title="Onboarding" chip={{ text: 'Nothing in progress', tone: 'v' }} scene="register" heading="No school is being set up" body="Start the wizard to add one. It asks about the school, its plan, its look and where it runs, then creates everything and tells you how it went." actions={app.can('schools.write') ? <button className="btn pri" onClick={() => app.go('/onboarding/new')}>Onboard a school</button> : undefined} />
        </div>
      )}
      <section className="grid">
        {setting.length > 0 && (
          <Card title="Being set up" chip={<span className="chip b">{setting.length}</span>} span="s12">
            {setting.map((s) => {
              const t = tintFor(s.name);
              return (
                <a key={s.id} className="kv" href={url(`/schools/${s.id}`)} onClick={(e) => { e.preventDefault(); app.go(`/schools/${s.id}`); }} style={{ color: 'inherit', textDecoration: 'none', alignItems: 'center' }}>
                  <span style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                    <span className="av" style={{ width: 34, height: 34, fontSize: 11, background: t.bg, color: t.fg, boxShadow: 'none' }}>{initials(s.name)}</span>
                    <span style={{ minWidth: 0 }}><b style={{ display: 'block', textAlign: 'left' }}>{s.name}</b><small style={{ color: 'var(--ink3)' }}>{s.slug} · cell {s.cell} · started {ago(s.createdAt)}</small></span>
                  </span>
                  <span style={{ width: 150, flex: 'none' }}><span className="us"><span className="r"><span>{s.onboarding.done} of {s.onboarding.total} steps</span></span><span className="bar"><i style={{ width: `${s.onboarding.total ? (s.onboarding.done / s.onboarding.total) * 100 : 0}%` }}></i></span></span></span>
                </a>
              );
            })}
          </Card>
        )}
        {list.length > 0 && (
          <Card title="Saved drafts" chip={<span className="chip">{list.length}</span>} span="s12">
            {list.map((d) => (
              <div key={d.id} className="kv" style={{ alignItems: 'center' }}>
                <span>{d.name || 'Untitled school'}<br /><small style={{ color: 'var(--ink3)' }}>Step {d.step + 1} of 7 · {ago(d.updatedAt)} · {d.updatedBy}</small></span>
                <b className="tgrow"><button className="btn sm pri" onClick={() => app.go(`/onboarding/new/${d.id}`)}>Continue</button><button className="btn sm" aria-label={`Delete draft ${d.name}`} onClick={() => del.mutate(d.id)}>Delete</button></b>
              </div>
            ))}
          </Card>
        )}
        {recent.length > 0 && (
          <Card title="Went live recently" span="s12">
            {recent.map((s) => { const st = statusOf(s); return <a key={s.id} className="kv" href={url(`/schools/${s.id}`)} onClick={(e) => { e.preventDefault(); app.go(`/schools/${s.id}`); }} style={{ color: 'inherit', textDecoration: 'none' }}>{s.name}<b><span className={`st ${st.tone}`}><i></i>{st.text}</span></b></a>; })}
          </Card>
        )}
      </section>
    </Page>
  );
}
