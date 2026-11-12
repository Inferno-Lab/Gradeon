/* eslint-disable */
// Markup converted from design/canvas/Main.dc.html. Keep the markup and class names as designed.
import { Fragment, type CSSProperties } from "react";
import { Illustration, Roll, PageScope, Presence, ToastSlot, Segmented, MenuButton, Icon } from "@gradeon/web-ui";
import "./dashboard.css";

export function DashboardView({ v }: { v: any }) {
  return (
    <PageScope
      page="dashboard"
      overlays={
        <>
          <Presence>{v.widgetsDialog}</Presence>
          <ToastSlot toast={v.toast} />
        </>
      }
    >
      <main className="mn">
        <header className="hd rise">
          <div>
            <h1>Dashboard</h1>
            <p>{v.subtitle}</p>
          </div>
          <span className="grow"></span>
          <MenuButton label={v.rangeLabel} icon='calendar' chevron open={!!v.rangeOpen} onOpenChange={v.setRangeOpen} menuLabel="Time range">
            {v.ranges.map((r: any, $i: number) => (
              <button key={$i} role="menuitemradio" aria-checked={r.on} className={r.on ? "on" : ""} onClick={r.pick}>
                {r.t}
                {r.on && (
                  <Icon name="check" className="ck" />
                )}
              </button>
            ))}
          </MenuButton>
          <MenuButton label="New" icon='plus' primary open={!!v.newOpen} onOpenChange={v.setNewOpen} menuLabel="Add something new">
            {v.news.map((r: any, $i: number) => (
              <button key={$i} role="menuitem" onClick={r.go}>
                <Icon name={r.ic} />
                {r.t}
                <small>{r.k}</small>
              </button>
            ))}
          </MenuButton>
        </header>
        <section className="grid" aria-label="Today at a glance">
          <div className="tile t-l s3 wl lift rise" style={{ "--d": ".05s", minHeight: "232px" } as CSSProperties}>
            <div className="avl" style={{ background: v.me.bg, color: v.me.fg } as CSSProperties}>
              {v.me.initials}
            </div>
            <div style={{ marginTop: "12px", font: "600 14px var(--fb)", color: "var(--ink2)" } as CSSProperties}>{v.greeting},</div>
            <div className="fd" style={{ fontSize: "28px", letterSpacing: "-.03em", lineHeight: "1.1" } as CSSProperties}>
              {v.me.name}
            </div>
            <div style={{ font: "600 12px var(--fb)", color: "var(--ink3)", margin: "4px 0 12px" } as CSSProperties}>
              {v.me.role} · {v.schoolName}
            </div>
            <div className="quick">
              {v.has.chat && (
              <button aria-label="Messages" data-tip="Messages" onClick={() => v.goto("/messages")}>
                <Icon name="messages" />
              </button>
              )}
            </div>
            <div className="nst">
              <Illustration scene="calendar" />
            </div>
          </div>
          {v.has.attendance && (
          <div className="tile t-a s3 lift rise" style={{ "--d": ".1s" } as CSSProperties}>
            <div className="tt">
              <span className="chip">
                <Icon name="person" size={14} />
                Attendance
              </span>
              <button className="arrow" aria-label="Open attendance" onClick={() => v.goto("/attendance")}>
                <Icon name="upRight" size={16} />
              </button>
            </div>
            <div className="fd" style={{ fontSize: "22px", letterSpacing: "-.03em", marginTop: "16px" } as CSSProperties}>
              Present today
            </div>
            <div style={{ font: "600 12px var(--fb)", opacity: ".7", marginBottom: "12px" } as CSSProperties}>{v.dayLine}</div>
            <div className="big">
              <Roll digits={v.kPresent} />
              <small>/ {v.totalStudents}</small>
            </div>
            <div className="statl" style={{ marginTop: "12px" } as CSSProperties}>
              <span className={`tr ${v.presentTrend.cls}`}>
                <Icon name={v.presentTrend.icon} size={14} />
                {v.presentTrend.text}
              </span>
              {v.presentVersus}
            </div>
            <Icon name="attendance" className="ghostic" />
          </div>
          )}
          {v.has.fees && (
          <div className="tile t-v s3 lift rise" style={{ "--d": ".15s" } as CSSProperties}>
            <div className="tt">
              <span className="chip">
                <Icon name="fees" size={14} />
                Fees
              </span>
              <button className="arrow" aria-label="Open fees" onClick={() => v.goto("/fees")}>
                <Icon name="upRight" size={16} />
              </button>
            </div>
            <div className="fd" style={{ fontSize: "22px", letterSpacing: "-.03em", marginTop: "16px" } as CSSProperties}>
              Collected in {v.feeMonth}
            </div>
            <div style={{ font: "600 12px var(--fb)", opacity: ".7", marginBottom: "12px" } as CSSProperties}>
              {v.feePct}% of ₹{v.feeDue} due
            </div>
            <div className="big" style={{ fontSize: "38px" } as CSSProperties}>
              ₹
              <Roll digits={v.kFees} />
            </div>
            <div className="statl" style={{ marginTop: "12px" } as CSSProperties}>
              <span className={`tr ${v.feeTrend.cls}`}>
                <Icon name={v.feeTrend.icon} size={14} />
                {v.feeTrend.text}
              </span>
              {v.overdueLine}
            </div>
            <Icon name="fees" className="ghostic" />
          </div>
          )}
          <div className="tile t-i s3 lift rise" style={{ "--d": ".2s" } as CSSProperties}>
            <div className="tt">
              <span className="chip" style={{ background: "color-mix(in srgb,var(--on-deep) 14%,transparent)", color: "var(--on-deep)" } as CSSProperties}>
                <Icon name="check" size={14} />
                Approvals
              </span>
              <button className="arrow" aria-label="Open approvals" onClick={() => v.goto("/approvals")}>
                <Icon name="upRight" size={16} />
              </button>
            </div>
            <div className="fd" style={{ fontSize: "22px", letterSpacing: "-.03em", marginTop: "16px" } as CSSProperties}>
              Waiting for you
            </div>
            <div style={{ font: "600 12px var(--fb)", opacity: ".6", marginBottom: "12px" } as CSSProperties}>{v.approvalKinds}</div>
            <div className="big">
              <Roll digits={v.kLeft} />
              <small>requests</small>
            </div>
            <div style={{ display: "flex", alignItems: "center", marginTop: "12px" } as CSSProperties}>
              {v.avatars.map((a: any, $i: number) => (
                <span
                  key={$i}
                  className="av"
                  style={{ background: a.bg, color: a.fg, marginLeft: $i ? "-10px" : undefined, boxShadow: "0 0 0 2.5px var(--deep)" } as CSSProperties}
                >
                  {a.initials}
                </span>
              ))}
              {v.moreAvatars > 0 && (
                <span style={{ marginLeft: "10px", font: "700 12px var(--fb)", opacity: ".7" } as CSSProperties}>and {v.moreAvatars} more</span>
              )}
            </div>
          </div>
        </section>
        <section className="grid" data-even="" style={{ alignItems: "start" } as CSSProperties}>
          {v.showChart && (
          <div className="tile t-l s8 rise" style={{ "--d": ".25s" } as CSSProperties} aria-labelledby="chtt">
            <div className="ch" style={{ marginBottom: "8px" } as CSSProperties}>
              <h2 id="chtt" style={{ fontSize: "22px" } as CSSProperties}>
                {v.chartTitle}
              </h2>
              <Segmented label="Chart" value={String(v.tabs.findIndex((t: any) => t.on))} onChange={(i: string) => v.tabs[Number(i)].pick()} options={v.tabs.map((t: any, i: number) => ({ value: String(i), label: t.n }))} style={{ background: "color-mix(in srgb,var(--brand) 12%,transparent)" } as CSSProperties} />
            </div>
            <div className={`plot ${v.chartEmpty ? "empty" : ""}`} role="img" aria-label={v.chartAlt}>
              {v.grid.map((g: any, $i: number) => (
                <Fragment key={$i}>
                  <div className="gl" style={{ bottom: `${g.b ?? ""}px` } as CSSProperties}>
                    <span>{g.l}</span>
                  </div>
                </Fragment>
              ))}
              <div className="gl goal" style={{ bottom: `${v.goalB ?? ""}px` } as CSSProperties}>
                <b>{v.goalL}</b>
              </div>
              <div className="pcols">
                {v.cols.map((p: any, $i: number) => (
                  <Fragment key={$i}>
                    <div className={`col2 ${p.today ?? ""}`} data-tip={`${p.full}\n${p.v}${p.prev ? ` · was ${p.prev}` : ""}`} tabIndex={0} aria-label={`${p.full}: ${p.v}`}>
                      {p.gh > 0 && <i className="gh" style={{ height: `${p.gh}px` } as CSSProperties}></i>}
                      <i className="fl" style={{ height: `${p.h}px`, "--pc": p.c } as CSSProperties}></i>
                      <div className="bub">
                        <b>{p.v}</b>
                        {p.full}
                        {p.prev && <> · was {p.prev}</>}
                      </div>
                    </div>
                  </Fragment>
                ))}
              </div>
              {v.chartEmpty && <div className="plot-empty">{v.chartEmptyText}</div>}
              <div className="plab">
                {v.cols.map((p: any, $i: number) => (
                  <Fragment key={$i}>
                    <span className={p.today}>{p.n}</span>
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
          )}
          <div className="tile t-p s4 rise" style={{ "--d": ".3s" } as CSSProperties} aria-labelledby="need">
            <div className="ch" style={{ marginBottom: "16px" } as CSSProperties}>
              <h2 id="need" style={{ fontSize: "22px" } as CSSProperties}>
                Needs you
              </h2>
              <span className={`chip ${v.allDone ? "g" : "a"}`}>{v.leftLabel}</span>
            </div>
            <div className="needl" data-even-scroll="">
            {v.needs.map((n: any, $i: number) => (
              <Fragment key={$i}>
                <div className={`need ${n.done ?? ""}`}>
                  <span className="av" style={{ background: n.bg, color: n.fg, boxShadow: "none" } as CSSProperties}>
                    {n.ini}
                  </span>
                  <div style={{ minWidth: "0" } as CSSProperties}>
                    <b>{n.t}</b>
                    <small>{n.s}</small>
                  </div>
                  {n.open && (
                    <>
                      <button className="btn sm" onClick={n.act}>
                        {n.a}
                      </button>
                      {n.view && <button className="btn sm" data-tip="Open it, or decline with a reason" onClick={n.view}>Open</button>}
                    </>
                  )}
                </div>
              </Fragment>
            ))}
            {v.allDone && (
              <>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", padding: "6px 0" } as CSSProperties}>
                  <div style={{ width: "150px" } as CSSProperties}>
                    <Illustration scene="checklist" />
                  </div>
                  <b className="fd" style={{ fontSize: "17px" } as CSSProperties}>
                    All caught up
                  </b>
                  <span className="help">Nothing is waiting for you.</span>
                </div>
              </>
            )}
            </div>
          </div>
        </section>
        <section className="grid">
          {!v.hidden.includes("rolls") && (
          <div className="card s6 rise" style={{ "--d": ".35s" } as CSSProperties} aria-labelledby="rolls">
            <div className="ch">
              <h2 id="rolls">Class rolls · today</h2>
              <span className="lgd">
                <span>
                  <i style={{ background: "var(--line2)" } as CSSProperties}></i>Present
                </span>
                <span>
                  <i style={{ background: "var(--warn)" } as CSSProperties}></i>Late
                </span>
                <span>
                  <i style={{ background: "var(--bad)" } as CSSProperties}></i>Absent
                </span>
              </span>
            </div>
            <div className="rolls">
              {v.rolls.map((r: any, $i: number) => (
                <Fragment key={$i}>
                  <div className="rr">
                    <b>{r.n}</b>
                    <div className="sg" role="img" aria-label={r.aria}>
                      {r.segs.map((g: any, $j: number) => (
                        <i key={$j} className={g.k} data-tip={`Class ${r.n}\n${g.k === "p" ? "Present" : g.k === "l" ? "Late" : g.k === "a" ? "Absent" : "Not marked"}: ${g.n}`} style={{ flex: g.n } as CSSProperties}></i>
                      ))}
                    </div>
                    <em>{r.pct}</em>
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
          )}
          {!v.hidden.includes("fees") && (
          <div className="card s6 rise" style={{ "--d": ".4s" } as CSSProperties} aria-labelledby="jars">
            <div className="ch">
              <h2 id="jars">Fees by type · {v.feeMonth}</h2>
              <span className="chip g">{v.feePct}% collected</span>
            </div>
            <div className="fbars">
              {v.heads.map((h: any, $i: number) => (
                <Fragment key={$i}>
                  <div className="fbar">
                    <div className="trk" role="img" aria-label={`${h.n}: ${h.pct} percent collected`} data-tip={`${h.n}\n${h.pct}% collected · ${h.amt}`}>
                      <i className="fill" style={{ height: `${h.fill}%` } as CSSProperties}>
                        {h.pct >= 24 && <em>{h.pct}%</em>}
                      </i>
                      {h.pct < 24 && (
                        <em className="out" style={{ bottom: `calc(${h.fill}% + 8px)` } as CSSProperties}>
                          {h.pct}%
                        </em>
                      )}
                    </div>
                    <b>{h.n}</b>
                    <span>{h.amt}</span>
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
          )}
        </section>
        <section className="grid">
          {!v.hidden.includes("day") && (
          <div className="card s9 rise" style={{ "--d": ".45s" } as CSSProperties} aria-labelledby="day">
            <div className="ch">
              <h2 id="day">Today at school</h2>
              <span className="chip v">{v.nowLabel}</span>
            </div>
            <div className="day">
              <div className="prog" style={{ width: `${v.prog ?? ""}%` } as CSSProperties}></div>
              {v.events.map((e: any, $i: number) => (
                <Fragment key={$i}>
                  <div className={`ev ${e.cls ?? ""}`}>
                    <span className="tm">{e.t}</span>
                    <b>{e.n}</b>
                    <small>{e.s}</small>
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
          )}
          <button className="addw s3 rise" style={{ "--d": ".5s" } as CSSProperties} aria-label="Choose what the dashboard shows" onClick={v.openWidgets}>
            <span>
              <Icon name="plus" size={24} />
            </span>
            {v.hidden.length ? "Add a widget" : "Choose widgets"}
          </button>
        </section>
      </main>
    </PageScope>
  );
}
