import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Select, tintFor, Icon, EmptyState } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { url } from '../../app/base';
import { Page } from '../../app/Page';
import { useShellChrome } from '../../app/Layout';
import { count, initials, statusOf } from '../../app/format';

const SEARCH = 'search';
const PAGE = 25;
const COLS = 'minmax(0,2fr) 110px 70px 100px 90px 130px 80px';
type Sort = 'name' | 'newest' | 'students' | 'p95';

/** Every school, the list every other page links to: search, filters by state, cell and plan, sorting and pages. */
export function SchoolsPage() {
  const app = useApp();
  const { schools } = useShellChrome();
  const plans = useQuery({ queryKey: ['plans'], queryFn: app.api.plans, staleTime: 5 * 60_000 });
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [cell, setCell] = useState('');
  const [plan, setPlan] = useState('');
  const [sort, setSort] = useState<Sort>('name');
  const [page, setPage] = useState(0);
  const all = schools.data ?? [];
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = all.filter((s) => (!t || s.name.toLowerCase().includes(t) || s.slug.includes(t))
      && (!state || (state === 'moving_in' ? s.status === 'live' && !s.wentLiveAt : state === 'live' ? s.status === 'live' && !!s.wentLiveAt : s.status === state))
      && (!cell || s.cell === cell) && (!plan || s.plan === plan));
    const by: Record<Sort, (a: typeof all[number], b: typeof all[number]) => number> = {
      name: (a, b) => a.name.localeCompare(b.name), newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
      students: (a, b) => b.students - a.students, p95: (a, b) => (b.healthMs ?? -1) - (a.healthMs ?? -1),
    };
    return list.sort(by[sort]);
  }, [all, q, state, cell, plan, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const at = Math.min(page, pages - 1);
  const shown = rows.slice(at * PAGE, at * PAGE + PAGE);
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(0); };
  const cells = [...new Set(all.map((s) => s.cell))].sort();
  return (
    <Page title="Schools" sub={all.length ? `${count(all.length)} in all` : 'Every school on the platform'} loading={schools.isLoading && !schools.data}
      error={schools.isError && !schools.data ? { message: (schools.error as Error).message, retry: () => void schools.refetch() } : null}
      back={{ label: 'Fleet', to: '/', go: app.go }}
      actions={app.can('schools.write') ? <button className="btn pri" onClick={() => app.go('/onboarding/new')}>Onboard a school</button> : undefined}>
      {all.length === 0 ? (
        <div><EmptyState scene="fleet" onAction={app.can('schools.write') ? () => app.go('/onboarding/new') : undefined} /></div>
      ) : (
        <section className="card tbl rise" style={{ padding: 0 }}>
          <div className="ch" style={{ padding: '20px 20px 12px', flexWrap: 'wrap', gap: 10 }}>
            <div className="srch" style={{ minWidth: 220, height: 38, flex: '1 1 220px', maxWidth: 360 }}>
              <Icon name={SEARCH} />
              <input value={q} onChange={(e) => reset(setQ)(e.target.value)} placeholder="Name or address" aria-label="Search schools" style={{ border: 0, outline: 0, background: 'none', font: '600 13px var(--fb)', color: 'var(--ink)', flex: 1, minWidth: 0 }} />
            </div>
            <Select compact aria-label="State" value={state} onChange={reset(setState)} options={[{ value: '', label: 'Every state' }, { value: 'onboarding', label: 'Setting up' }, { value: 'moving_in', label: 'Moving in' }, { value: 'live', label: 'Live' }, { value: 'suspended', label: 'Suspended' }, { value: 'moving', label: 'Moving cell' }]} />
            {cells.length > 1 && <Select compact aria-label="Cell" value={cell} onChange={reset(setCell)} options={[{ value: '', label: 'Every cell' }, ...cells.map((c) => ({ value: c, label: `Cell ${c}` }))]} />}
            <Select compact aria-label="Plan" value={plan} onChange={reset(setPlan)} options={[{ value: '', label: 'Every plan' }, ...(plans.data ?? []).map((p) => ({ value: p.key, label: p.name }))]} />
            <span className="grow"></span>
            <Select compact aria-label="Sort" value={sort} onChange={(v) => setSort(v as Sort)} options={[{ value: 'name', label: 'By name' }, { value: 'newest', label: 'Newest first' }, { value: 'students', label: 'Most students' }, { value: 'p95', label: 'Slowest first' }]} />
          </div>
          {rows.length === 0 ? <div className="help" style={{ padding: '0 20px 20px' }}>No school matches. Clear a filter or the search.</div> : (
            <div className="scroll-x">
              <div style={{ minWidth: 760 }}>
                <div className="grd th" style={{ '--cols': COLS } as React.CSSProperties}><span>School</span><span>Plan</span><span>Cell</span><span>Students</span><span>Version</span><span>State</span><span>p95</span></div>
                {shown.map((s) => {
                  const t = tintFor(s.name);
                  const st = s.status === 'live' && !s.wentLiveAt ? { text: 'Moving in', tone: 'v' } : statusOf(s);
                  return (
                    <a key={s.id} className="grd rw" href={url(`/schools/${s.id}`)} onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); app.go(`/schools/${s.id}`); }}
                      style={{ '--cols': COLS, height: 58, color: 'inherit', textDecoration: 'none' } as React.CSSProperties}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <span className="av" style={{ width: 34, height: 34, fontSize: 11, background: t.bg, color: t.fg, boxShadow: 'none' }}>{initials(s.name)}</span>
                        <span style={{ minWidth: 0 }}><b data-tip={s.name} style={{ font: '700 14px/1.25 var(--fb)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</b><small style={{ color: 'var(--ink3)', font: '600 12px var(--fb)' }}>{s.slug}</small></span>
                      </span>
                      <span>{plans.data?.find((p) => p.key === s.plan)?.name ?? s.plan}</span>
                      <span className="chip">{s.cell}</span>
                      <span className="num">{count(s.students)}</span>
                      <span className="num">{s.versions.api}</span>
                      <span className={`st ${st.tone}`}><i></i>{st.text}</span>
                      <span className="num">{s.healthMs != null ? `${s.healthMs} ms` : '–'}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          )}
          {pages > 1 && (
            <div className="tgrow" style={{ padding: '12px 20px 20px', alignItems: 'center' }}>
              <button className="btn sm" disabled={at === 0} onClick={() => setPage(at - 1)}>Previous</button>
              <span className="help" style={{ margin: 0 }}>{at * PAGE + 1}–{Math.min(rows.length, at * PAGE + PAGE)} of {count(rows.length)}</span>
              <button className="btn sm" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>Next</button>
            </div>
          )}
        </section>
      )}
    </Page>
  );
}
