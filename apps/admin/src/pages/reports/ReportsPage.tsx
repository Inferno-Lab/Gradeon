import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyCard } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { Page, useToast } from '../../app/Page';
import { Ico } from '../../app/kit';

const DOWNLOAD = 'M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14';

export function ReportsPage() {
  const app = useApp();
  const { toast, say } = useToast();
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useQuery({ queryKey: ['reports'], queryFn: app.api.reports.list, staleTime: 10 * 60_000 });
  const pick = id || list.data?.[0]?.id || '';
  const data = useQuery({ queryKey: ['reports', pick], queryFn: () => app.api.reports.get(pick), enabled: !!pick });
  const areas = [...new Set((list.data ?? []).map((r) => r.area))];
  const download = async () => {
    setBusy(true);
    try {
      const csv = await app.api.reports.csv(pick);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
      a.download = `${pick}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      say('Report downloaded.');
    } catch (e) { say((e as Error).message, 'bad'); } finally { setBusy(false); }
  };
  const d = data.data;
  return (
    <Page title="Reports" sub="Numbers you can read, print or take to a meeting" toast={toast} loading={list.isLoading && !list.data}
      error={list.isError && !list.data ? { message: (list.error as Error).message, retry: () => void list.refetch() } : null}
      actions={d ? <button className="btn" disabled={busy} onClick={() => void download()}><Ico d={DOWNLOAD} />{busy ? 'Preparing…' : 'Download CSV'}</button> : undefined}>
      {(list.data?.length ?? 0) === 0 ? (
        <div><EmptyCard title="Reports" chip={{ text: '0 reports', tone: 'v' }} scene="checklist" heading="No reports are available" body="Reports appear here once the modules they read from are switched on for your school." /></div>
      ) : (
        <section className="rpg" data-even="fill">
          <nav className="card rpl rise" data-even-scroll="" aria-label="Reports">
            {areas.map((a) => (
              <div key={a}>
                <div className="lbl" style={{ padding: '4px 10px 8px' }}>{a}</div>
                {list.data!.filter((r) => r.area === a).map((r) => (
                  <button key={r.id} className={`rpb ${r.id === pick ? 'on' : ''}`} aria-current={r.id === pick} onClick={() => setId(r.id)}><b>{r.title}</b><small>{r.blurb}</small></button>
                ))}
              </div>
            ))}
          </nav>
          <div className="card tbl rise" style={{ padding: 0, minWidth: 0 }}>
            {!d ? <div className="skc" style={{ height: 320, borderRadius: 24 }} /> : (
              <>
                <div className="ch" style={{ padding: '22px 22px 6px' }}><h2>{d.title}</h2><span className="chip v">{d.rows.length} {d.rows.length === 1 ? 'row' : 'rows'}</span></div>
                <div className="tgrow" style={{ padding: '10px 22px 14px', gap: 8 }}>{d.summary.map((s) => <span className="chip" key={s.label}>{s.label}: <b style={{ color: 'var(--ink)' }}>{s.value}</b></span>)}</div>
                {d.rows.length === 0 ? <div style={{ padding: '0 22px 22px' }}><div className="help">Nothing to report yet. This fills in as the school uses Gradeon.</div></div> : (
                  <div className="scroll-x lscroll" data-even-scroll="">
                    <div style={{ minWidth: Math.max(480, d.columns.length * 96) }}>
                      <div className="grd th" style={{ '--cols': `minmax(0,1.5fr) ${d.columns.slice(1).map(() => 'minmax(64px,1fr)').join(' ')}` } as React.CSSProperties}>{d.columns.map((c) => <span key={c.key} style={{ textAlign: c.align }}>{c.label}</span>)}</div>
                      {d.rows.map((r, i) => (
                        <div className="grd rw" key={i} style={{ '--cols': `minmax(0,1.5fr) ${d.columns.slice(1).map(() => 'minmax(64px,1fr)').join(' ')}` } as React.CSSProperties}>
                          {d.columns.map((c, j) => <span key={c.key} className={j ? 'num' : ''} style={{ textAlign: c.align, font: j ? '600 13.5px var(--fb)' : '700 14px var(--fb)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} data-tip={String(r[c.key] ?? '')}>{r[c.key]}</span>)}
                        </div>
                      ))}
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
