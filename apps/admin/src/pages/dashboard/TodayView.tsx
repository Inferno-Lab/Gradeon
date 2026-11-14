import type { CSSProperties } from 'react';
import type { DashboardData } from '@gradeon/contracts';
import { EmptyNote, Icon, MenuButton, PageScope, Roll, Segmented, ToastSlot, rollDigits, type IconName, type PageIcon } from '@gradeon/web-ui';

// The dashboard as the Today board (design/hue/src/Today.html): the day on the deep colour, what needs the person, fees and the
// day ahead. `v` is what DashboardPage works out from the data; `d` is the data itself.
type V = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const heatCls = (absent: number, unmarked: boolean) => (unmarked ? 'h0' : absent === 0 ? 'h1' : absent === 1 ? 'h2' : absent === 2 ? 'h3' : absent < 5 ? 'h4' : 'h5');
const NEED_ICON: Record<string, IconName> = { attendance: 'warning', leave: 'calendar', fee_waiver: 'fees', notice: 'notices', admission: 'admissions', photo: 'gallery' };

export function TodayView({ v, d }: { v: V; d: DashboardData }) {
  const rolls = d.classRolls;
  const sum = (k: 'present' | 'late' | 'absent' | 'unmarked') => rolls.reduce((n, r) => n + r[k], 0);
  const onTime = sum('present'), late = sum('late'), absent = sum('absent'), unmarked = sum('unmarked');
  const marked = onTime + late + absent, total = marked + unmarked;
  const pct = marked ? Math.round(((onTime + late) / marked) * 1000) / 10 : 0;
  const notTaken = rolls.filter((r) => r.unmarked === r.size && r.size > 0).map((r) => r.name);
  // The grid shows the classes chosen for it; the reminder goes to every class in the school that has not marked.
  const allNot = d.needsYou.find((n) => n.kind === 'attendance')?.subtitle.split(' · ') ?? notTaken;
  const rest = allNot.length - notTaken.length;
  const note = (notTaken.length ? `${notTaken.length === 1 ? 'One class here has' : `${notTaken.length} classes here have`} not taken the roll` : 'Every class here has taken the roll')
    + (rest > 0 ? `; ${rest === 1 ? 'one more' : `${rest} more`} across the school.` : '.');
  // Classes by grade (columns) and section (rows), as on the board; a name that is not "8 A" goes in its own row.
  const parse = (n: string) => /^(\S+)\s+(\S+)$/.exec(n.trim());
  const grades = [...new Set(rolls.map((r) => parse(r.name)?.[1] ?? r.name))];
  const sections = [...new Set(rolls.map((r) => parse(r.name)?.[2] ?? ''))];
  const cell = (g: string, s: string) => rolls.find((r) => (parse(r.name)?.[1] ?? r.name) === g && (parse(r.name)?.[2] ?? '') === s);
  const shown = (k: string) => !v.hidden.includes(k);
  return (
    <PageScope page="dashboard" overlays={<><ToastSlot toast={v.toast} />{v.widgetsDialog}</>}>
      <main className="mn hb">
        <header className="top">
          <div><h1>{v.greeting}, {d.greetingName.split(' ')[0]}</h1><p>{v.dayLine}{d.term.name ? ` · ${d.term.name}` : ''}</p></div>
          <span className="sp" />
          <button className="search" onClick={v.openSearch}><Icon name="search" className="i" />Search students, staff, receipts<kbd>Ctrl K</kbd></button>
          {v.news.length > 0 && (
            <MenuButton label="New" icon="plus" primary open={v.newOpen} onOpenChange={v.setNewOpen} menuLabel="Add something new">
              {v.news.map((r: V) => <button key={r.t} role="menuitem" onClick={r.go}><Icon name={r.ic as PageIcon} />{r.t}<small>{r.k}</small></button>)}
            </MenuButton>
          )}
        </header>

        {v.has.attendance && shown('rolls') && (
          <section className="card deep" style={{ flexDirection: 'row', gap: 48, flexWrap: 'wrap' }}>
            <div className="vc" style={{ flex: '1 1 380px', gap: 22 }}>
              <div className="vc" style={{ gap: 10 }}>
                <span className="lbl">{d.day.isToday ? 'In school today' : `In school, ${d.day.label}`}</span>
                <div className="fig" style={{ fontSize: 72 }}><Roll digits={rollDigits(`${pct}%`)} /><small>{marked.toLocaleString()} of {total.toLocaleString()} marked</small></div>
              </div>
              <div className="vc" style={{ gap: 12 }}>
                <div className="bar" style={{ height: 14, borderRadius: 7 }} aria-hidden="true">
                  <i style={{ flex: onTime || 0.0001, minWidth: 0, background: 'var(--bright)' }} /><i style={{ flex: late, minWidth: 0, background: 'var(--warn-d)' }} />
                  <i style={{ flex: absent, minWidth: 0, background: 'var(--bad-d)' }} /><i style={{ flex: unmarked, minWidth: 0, background: 'var(--deep3)' }} />
                </div>
                <div className="fx" style={{ gap: 20, fontSize: 13, lineHeight: '18px', flexWrap: 'wrap' }}>
                  {[['On time', onTime, '--bright'], ['Late', late, '--warn-d'], ['Absent', absent, '--bad-d'], ['Not marked', unmarked, '--deep3']].map(([t, n, c]) => (
                    <span key={t as string} className="fx" style={{ gap: 7 }}><i className="dot" style={{ '--c': `var(${c})` } as CSSProperties} />{t} <b className="num">{(n as number).toLocaleString()}</b></span>
                  ))}
                </div>
              </div>
              <div className="fx" style={{ gap: 10, marginTop: 'auto', flexWrap: 'wrap' }}>
                {allNot.length > 0 && <button className="btn bri" onClick={v.remind}><Icon name="notifications" className="i" />Remind {allNot.slice(0, 2).join(' and ')}{allNot.length > 2 ? ` and ${allNot.length - 2} more` : ''}</button>}
                <button className="btn ond" onClick={() => v.goto('/attendance')}>Open attendance</button>
              </div>
            </div>
            {rolls.length > 0 && (
              <div className="vc" style={{ gap: 12, flex: 'none', maxWidth: '100%', overflowX: 'auto' }}>
                <div className="fx" style={{ gap: 8 }}><span className="lbl" style={{ color: 'var(--on-deep)' }}>Absent by class</span><span className="sp" /><span className="note">fewer</span><span className="fx" style={{ gap: 3 }} aria-hidden="true">{[1, 2, 3, 4, 5].map((h) => <i key={h} className={`hk h${h}`} />)}</span><span className="note">more</span></div>
                <div className="heat" role="table" aria-label="Children absent in each class" style={{ gridTemplateColumns: `18px repeat(${grades.length},40px)`, gap: 4 }}>
                  <span className="hl" />{grades.map((g) => <span key={g} className="hl">{g}</span>)}
                  {sections.map((s) => [<span key={`l${s}`} className="hl">{s}</span>, ...grades.map((g) => {
                    const r = cell(g, s);
                    if (!r) return <span key={g + s} className="hx" />;
                    const none = r.unmarked === r.size;
                    return <span key={g + s} className={heatCls(r.absent, none)} data-tip={none ? `${r.name}: roll not taken` : `${r.name}: ${r.absent} absent`}>{none ? '?' : r.absent}</span>;
                  })])}
                </div>
                <span className="note">{note}</span>
              </div>
            )}
          </section>
        )}

        <div className="g" style={{ gridTemplateColumns: v.has.fees && shown('fees') ? 'minmax(0,1.4fr) minmax(0,1fr)' : 'minmax(0,1fr)' }}>
          <section className="card">
            <div className="ch"><h2>Needs you</h2><small>{v.leftLabel}</small></div>
            {v.needs.length ? (
              <div className="rows">
                {v.needs.map((n: V, i: number) => (
                  <div key={i} className="row" style={{ opacity: n.open ? 1 : 0.55 }}>
                    <span className={`ht ${d.needsYou[i]?.kind === 'attendance' ? 'warn' : ''}`}><Icon name={NEED_ICON[d.needsYou[i]?.kind ?? ''] ?? 'approvals'} className="i" /></span>
                    <button className="grow" style={{ textAlign: 'left', minWidth: 0 }} onClick={n.view} data-tip={n.tip}><b>{n.t}</b><small>{n.s}</small></button>
                    {n.open ? <button className="btn ton sm" onClick={n.act}>{n.a}</button> : <span className="tag ok"><Icon name="check" size={14} className="i" />Done</span>}
                  </div>
                ))}
              </div>
            ) : <EmptyNote icon="checkCircle" title="Nothing is waiting for you" body="Requests to decide and reminders appear here." />}
            {v.allClear.length > 0 && (
              <div className="clr">
                {v.allClear.map((c: V) => <span key={c.kind}><Icon name="check" size={16} className="i" />{c.t}</span>)}
              </div>
            )}
          </section>
          {v.has.fees && shown('fees') && (
            <section className="card">
              <div className="ch"><h2>Fees in {d.fees.monthLabel}</h2><a href="#" onClick={(e) => { e.preventDefault(); v.goto('/fees'); }}>Open fees<Icon name="next" size={14} className="i" /></a></div>
              <div className="fig" style={{ fontSize: 44 }}><Roll digits={rollDigits(v.money(d.fees.collected))} /><small>of {v.money(d.fees.due)} due</small></div>
              <div className="vc" style={{ gap: 8 }}><div className="bar"><i style={{ width: `${d.fees.pct}%` }} /></div><span className="cap">{d.fees.pct}% collected</span></div>
              <div className="fx" style={{ gap: 10, marginTop: 'auto' }}>
                <div className="mcard grow"><span className="lbl">Still to come</span><b className="d">{v.money(Math.max(0, d.fees.due - d.fees.collected))}</b><small>this month</small></div>
                <div className="mcard grow"><span className="lbl">Overdue</span><b className="d" style={{ color: 'var(--bad-i)' }}>{d.fees.overdueFamilies}</b><small>{d.fees.overdueFamilies === 1 ? 'family' : 'families'}</small></div>
              </div>
            </section>
          )}
        </div>

        {shown('day') && d.timeline.length > 0 && (
          <section className="card">
            <div className="ch"><h2>{d.day.isToday ? 'The rest of today' : `On ${d.day.label}`}</h2><a href="#" onClick={(e) => { e.preventDefault(); v.goto('/events'); }}>Calendar<Icon name="next" size={14} className="i" /></a></div>
            <div className="g" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 24 }}>
              {d.timeline.map((e) => (
                <div key={e.id} className="fx" style={{ gap: 12, opacity: e.state === 'done' ? 0.6 : 1 }}>
                  <span className={`ht date ${e.state === 'now' ? 'warn' : ''}`} style={{ width: 60, fontSize: 15 }}><small>{e.state === 'now' ? 'Now' : e.state === 'done' ? 'Done' : 'Next'}</small>{e.time}</span>
                  <span className="grow"><b className="cut" style={{ display: 'block', fontWeight: 600 }}>{e.title}</b><small className="t2" style={{ fontSize: 13 }}>{e.subtitle}</small></span>
                </div>
              ))}
            </div>
          </section>
        )}

        {v.showChart && (
          <section className="card">
            <div className="ch"><h2>{v.chartTitle}</h2><span className="sp" /><Segmented label="Chart" value={String(v.tabs.findIndex((t: V) => t.on))} onChange={(x) => v.tabs[Number(x)]?.pick()} options={v.tabs.map((t: V, i: number) => ({ value: String(i), label: t.n }))} /></div>
            {v.chartEmpty ? <p className="t2" style={{ fontSize: 14 }}>{v.chartEmptyText}</p> : (
              <div className="fx" role="img" aria-label={v.chartAlt} style={{ alignItems: 'flex-end', gap: 12, height: 200 }}>
                {v.cols.map((c: V, i: number) => (
                  <div key={i} className="vc" style={{ flex: 1, alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }} data-tip={`${c.full}: ${c.v}`}>
                    <b className="num" style={{ fontSize: 12 }}>{c.v}</b>
                    <i style={{ display: 'block', width: '100%', maxWidth: 56, height: `${Math.round((c.h / 236) * 150)}px`, borderRadius: 10, background: c.today ? 'var(--brand)' : 'var(--brand-line)' }} />
                    <small className="t3" style={{ fontSize: 12 }}>{c.n}</small>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="fx" style={{ justifyContent: 'flex-end' }}><button className="btn quiet" onClick={v.openWidgets}>Choose what this page shows</button></div>
      </main>
    </PageScope>
  );
}
