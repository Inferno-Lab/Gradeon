import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ReportQuery } from '@gradeon/contracts';
import { DateField, Select, EmptyState } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { Page, useToast } from '../../app/Page';
import { Ico, useOpenParam } from '../../app/kit';
import { usePageTabs } from '../../app/tabs';

const DOWNLOAD = 'download';
const PRINT = 'print';
/** Which reports each tab of the page (config-engine: the school module's reports page) holds, by the server's report areas. */
const AREAS: Record<string, string> = { attendance: 'Attendance', money: 'Fees', learning: 'Learning', people: 'People' };
/** A number in a cell ("88%", "₹1,200", 12) as a number, so columns sort by value. */
const num = (v: string | number) => (typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, '')) || 0);

export function ReportsPage() {
  const app = useApp();
  const { toast, say } = useToast();
  const { tab, tabs } = usePageTabs('/reports');
  // The open report is in the address (?open=<report>), with its filters kept while it is open.
  const [id, setId] = useOpenParam();
  const [q, setQ] = useState<ReportQuery>({});
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [busy, setBusy] = useState(false);
  const all = useQuery({ queryKey: ['reports'], queryFn: app.api.reports.list, staleTime: 10 * 60_000 });
  const classes = useQuery({ queryKey: ['classes'], queryFn: app.api.classes, staleTime: 5 * 60_000 });
  const list = all.data?.filter((r) => r.area === AREAS[tab]);
  const pick = (list?.some((r) => r.id === id) ? id : '') || list?.[0]?.id || '';
  const info = list?.find((r) => r.id === pick);
  const data = useQuery({ queryKey: ['reports', pick, q], queryFn: () => app.api.reports.get(pick, q), enabled: !!pick, placeholderData: (p) => p });
  const open = (next: string) => { setId(next); setQ({}); setSort(null); };
  const download = async () => {
    setBusy(true);
    try {
      const csv = await app.api.reports.csv(pick, q);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
      a.download = `${d?.title ?? 'Report'} - ${d?.scope ?? ''}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      say('Report downloaded.');
    } catch (e) { say((e as Error).message, 'bad'); } finally { setBusy(false); }
  };
  const d = data.data;
  const rows = d && sort ? [...d.rows].sort((a, b) => {
    const x = a[sort.key] ?? '', y = b[sort.key] ?? '';
    const right = d.columns.find((c) => c.key === sort.key)?.align === 'right';
    return (right ? num(x) - num(y) : String(x).localeCompare(String(y))) * sort.dir;
  }) : d?.rows ?? [];
  const cols = d ? `minmax(0,1.5fr) ${d.columns.slice(1).map(() => 'minmax(64px,1fr)').join(' ')}` : '';
  return (
    <Page title="Reports" sub="Numbers you can read, download or print for a meeting" toast={toast} loading={all.isLoading && !all.data}
      error={all.isError && !all.data ? { message: (all.error as Error).message, retry: () => void all.refetch() } : null}
      actions={<>{tabs}{d && <>
        <button className="btn" onClick={() => window.print()}><Ico d={PRINT} />Print</button>
        <button className="btn" disabled={busy} onClick={() => void download()}><Ico d={DOWNLOAD} />{busy ? 'Preparing…' : 'Download CSV'}</button>
      </>}</>}>
      {(list?.length ?? 0) === 0 ? (
        <div><EmptyState scene="reports" onAction={() => app.go('/attendance')} onLink={() => app.go('/fees')} /></div>
      ) : (
        <section className="rpg" data-even="fill">
          <nav className="card rpl rise" data-even-scroll="" aria-label="Reports">
            {list!.map((r) => (
              <button key={r.id} className={`rpb ${r.id === pick ? 'on' : ''}`} aria-current={r.id === pick} onClick={() => open(r.id)}><b>{r.title}</b><small>{r.blurb}</small></button>
            ))}
          </nav>
          <div className="card tbl rise" style={{ padding: 0, minWidth: 0 }}>
            {!d ? <div className="skc" style={{ height: 320, borderRadius: 24 }} /> : (
              <>
                <div className="ch" style={{ padding: '24px 24px 6px', flexWrap: 'wrap', gap: 10 }}>
                  <h2>{d.title}</h2><span className="chip v">{d.scope}</span>
                  <span className="grow"></span>
                  {info?.filters.includes('class') && <Select compact aria-label="Class" value={q.classId ?? ''} onChange={(v) => setQ({ ...q, classId: v || undefined })} options={[{ value: '', label: 'Whole school' }, ...(classes.data ?? []).map((c) => ({ value: c.id, label: `Class ${c.name}` }))]} />}
                  {info?.filters.includes('dates') && <>
                    <DateField compact label="From" value={q.from ?? ''} onChange={(v) => setQ({ ...q, from: v || undefined })} max={q.to} />
                    <DateField compact label="To" value={q.to ?? ''} onChange={(v) => setQ({ ...q, to: v || undefined })} min={q.from} />
                  </>}
                </div>
                <div className="tgrow" style={{ padding: '10px 24px 16px', gap: 8 }}>{d.summary.map((s) => <span className="chip" key={s.label}>{s.label}: <b style={{ color: 'var(--ink)' }}>{s.value}</b></span>)}</div>
                {d.rows.length === 0 ? <div style={{ padding: '0 24px 24px' }}><div className="help">Nothing to report for this. It fills in as the school uses Gradeon.</div></div> : (
                  <div className="scroll-x">
                    <div style={{ minWidth: Math.max(480, d.columns.length * 96) }}>
                      <div className="grd th" style={{ '--cols': cols } as React.CSSProperties}>
                        {d.columns.map((c) => (
                          <button key={c.key} type="button" className="sortb" style={{ textAlign: c.align, justifyContent: c.align === 'right' ? 'flex-end' : undefined, border: 0, background: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer', padding: 0 }}
                            aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} onClick={() => setSort(sort?.key === c.key ? { key: c.key, dir: sort.dir === 1 ? -1 : 1 } : { key: c.key, dir: c.align === 'right' ? -1 : 1 })}>
                            {c.label}{sort?.key === c.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
                          </button>
                        ))}
                      </div>
                      {rows.map((r, i) => {
                        const sid = r._student ? String(r._student) : null;
                        return (
                          <div className="grd rw" key={i} role={sid ? 'button' : undefined} tabIndex={sid ? 0 : undefined} onClick={sid ? () => app.go(`/students?open=${sid}`) : undefined}
                            onKeyDown={sid ? (e) => { if (e.key === 'Enter') app.go(`/students?open=${sid}`); } : undefined} style={{ '--cols': cols, cursor: sid ? 'pointer' : undefined } as React.CSSProperties}>
                            {d.columns.map((c, j) => <span key={c.key} className={j ? 'num' : ''} style={{ textAlign: c.align, font: j ? '600 13px var(--fb)' : '700 14px var(--fb)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} data-tip={String(r[c.key] ?? '')}>{r[c.key]}</span>)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}
    </Page>
  );
}
