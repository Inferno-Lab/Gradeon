/* eslint-disable */
// Markup converted from design/canvas/Main.dc.html. Keep the markup and class names as designed.
import { Fragment, type CSSProperties } from "react";
import { Illustration, Roll, Shell } from "@gradeon/web-ui";
import "./dashboard.css";

export function DashboardView({ v }: { v: any }) {
  return (
    <Shell
      page="dashboard"
      theme={v.themeCls}
      aside={v.aside}
      overlays={
        <>
          {v.palette}
          {v.widgetsDialog}
          {v.toastOn && (
            <>
              <div className="toast" role="status">
                <span
                  style={
                    {
                      width: "30px",
                      height: "30px",
                      borderRadius: "50%",
                      background: "var(--g)",
                      display: "grid",
                      placeItems: "center",
                      flex: "none",
                    } as CSSProperties
                  }
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <path className="i" d="M5 12.5l4.5 4.5L19 7.5" style={{ stroke: "#fff", strokeWidth: "2.6" } as CSSProperties}></path>
                  </svg>
                </span>
                {v.toastText}
                <button className="btn wht sm" onClick={v.undo}>
                  Undo
                </button>
              </div>
            </>
          )}
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
          <div
            className="srch"
            role="search"
            onClick={v.openSearch}
            tabIndex={0}
            onKeyDown={(e: any) => e.key === "Enter" && v.openSearch()}
            style={{ cursor: "text" }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path className="i" d="M4.5 11a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0M20 20l-4.2-4.2"></path>
            </svg>
            Search anything<span className="kbd">Ctrl K</span>
          </div>
          <button className="ibtn" aria-label="Notifications" onClick={v.showNeeds}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path className="i" d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"></path>
            </svg>
            {v.hasAlerts && <span className="pip"></span>}
          </button>
          <div className="anc" style={{ width: "148px", height: "42px" } as CSSProperties}>
            <div className={`morph ${v.rangeOpen ?? ""}`} style={{ "--w0": "148px", "--w1": "210px", "--h1": "232px" } as CSSProperties}>
              <button className="mh" onClick={v.toggleRange} aria-expanded={v.rangeExp}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path className="i" d="M3.5 6.5h17v13h-17zM3.5 10.5h17M8 4v4M16 4v4"></path>
                </svg>
                {v.rangeLabel}
                <svg className="cv" viewBox="0 0 24 24" aria-hidden="true">
                  <path className="i" d="M6 9l6 6 6-6"></path>
                </svg>
              </button>
              <div className="ml" role="listbox">
                {v.ranges.map((r: any, $i: number) => (
                  <Fragment key={$i}>
                    <button
                      className="mo"
                      role="option"
                      aria-selected={r.sel}
                      onClick={r.pick}
                      style={{ transitionDelay: `${r.d ?? ""}ms` } as CSSProperties}
                    >
                      {r.t}
                      {r.on && (
                        <>
                          <svg className="ck" viewBox="0 0 24 24" aria-hidden="true">
                            <path className="i" d="M5 12.5l4.5 4.5L19 7.5"></path>
                          </svg>
                        </>
                      )}
                    </button>
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
          <div className="anc" style={{ width: "112px", height: "42px" } as CSSProperties}>
            <div className={`morph dk ${v.newOpen ?? ""}`} style={{ "--w0": "112px", "--w1": "250px", "--h1": "290px" } as CSSProperties}>
              <button className="mh" onClick={v.toggleNew} aria-expanded={v.newExp}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path className="i" d="M12 5v14M5 12h14"></path>
                </svg>
                New
              </button>
              <div className="ml" role="menu">
                {v.news.map((r: any, $i: number) => (
                  <Fragment key={$i}>
                    <button className="mo" role="menuitem" onClick={r.go} style={{ transitionDelay: `${r.d ?? ""}ms` } as CSSProperties}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path className="i" d={r.ic}></path>
                      </svg>
                      {r.t}
                      <kbd>{r.k}</kbd>
                    </button>
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        </header>
        <section className="grid" aria-label="Today at a glance">
          <div className="tile t-l s3 wl lift rise" style={{ "--d": ".05s", minHeight: "232px" } as CSSProperties}>
            <div className="avl" style={{ background: v.me.bg, color: v.me.fg } as CSSProperties}>
              {v.me.initials}
            </div>
            <div style={{ marginTop: "14px", font: "600 14px var(--fb)", color: "var(--ink2)" } as CSSProperties}>{v.greeting},</div>
            <div className="fd" style={{ fontSize: "27px", letterSpacing: "-.03em", lineHeight: "1.1" } as CSSProperties}>
              {v.me.name}
            </div>
            <div style={{ font: "600 12.5px var(--fb)", color: "var(--ink3)", margin: "4px 0 14px" } as CSSProperties}>
              {v.me.role} · {v.schoolName}
            </div>
            <div className="quick">
              <button aria-label="Messages" onClick={() => v.goto("/messages")}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path className="i" d="M4 5h16v11H9l-5 4z"></path>
                </svg>
              </button>
              <button aria-label="Find" onClick={v.openSearch}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path className="i" d="M4.5 11a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0M20 20l-4.2-4.2"></path>
                </svg>
              </button>
            </div>
            <div className="nst">
              <Illustration scene="calendar" />
            </div>
          </div>
          {v.has.attendance && (
          <div className="tile t-a s3 lift rise" style={{ "--d": ".1s" } as CSSProperties}>
            <div className="tt">
              <span className="chip">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path className="i" d="M5.5 8a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"></path>
                </svg>
                Students
              </span>
              <button className="arrow" aria-label="Open students" onClick={() => v.goto("/students")}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path className="i" d="M7 17L17 7M9 7h8v8"></path>
                </svg>
              </button>
            </div>
            <div className="fd" style={{ fontSize: "23px", letterSpacing: "-.03em", marginTop: "18px" } as CSSProperties}>
              Present today
            </div>
            <div style={{ font: "600 12.5px var(--fb)", opacity: ".7", marginBottom: "12px" } as CSSProperties}>{v.dayLine}</div>
            <div className="big">
              <Roll digits={v.kPresent} />
              <small>/ {v.totalStudents}</small>
            </div>
            <div className="statl" style={{ marginTop: "12px" } as CSSProperties}>
              <span className={`tr ${v.presentTrend.cls}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path className="i" d={v.presentTrend.icon} style={{ strokeWidth: "2.4" } as CSSProperties}></path>
                </svg>
                {v.presentTrend.text}
              </span>
              {v.presentVersus}
            </div>
            <svg className="ghostic" viewBox="0 0 24 24" aria-hidden="true">
              <path
                className="i"
                d="M4 5h16v15H4zM4 9h16M9 3v4M15 3v4M8.5 14l2 2 4-4"
                style={{ fill: "none", stroke: "var(--ink)" } as CSSProperties}
              ></path>
            </svg>
          </div>
          )}
          {v.has.fees && (
          <div className="tile t-v s3 lift rise" style={{ "--d": ".15s" } as CSSProperties}>
            <div className="tt">
              <span className="chip">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path className="i" d="M3 8.5A2.5 2.5 0 0 1 5.5 6H17V3.5M3 8.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7.5a2 2 0 0 0-2-2H3"></path>
                </svg>
                Fees
              </span>
              <button className="arrow" aria-label="Open fees" onClick={() => v.goto("/fees")}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path className="i" d="M7 17L17 7M9 7h8v8"></path>
                </svg>
              </button>
            </div>
            <div className="fd" style={{ fontSize: "23px", letterSpacing: "-.03em", marginTop: "18px" } as CSSProperties}>
              Collected in {v.feeMonth}
            </div>
            <div style={{ font: "600 12.5px var(--fb)", opacity: ".7", marginBottom: "12px" } as CSSProperties}>
              {v.feePct}% of ₹{v.feeDue} due
            </div>
            <div className="big" style={{ fontSize: "38px" } as CSSProperties}>
              ₹
              <Roll digits={v.kFees} />
            </div>
            <div className="statl" style={{ marginTop: "12px" } as CSSProperties}>
              <span className={`tr ${v.feeTrend.cls}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path className="i" d={v.feeTrend.icon} style={{ strokeWidth: "2.4" } as CSSProperties}></path>
                </svg>
                {v.feeTrend.text}
              </span>
              {v.overdueLine}
            </div>
            <svg className="ghostic" viewBox="0 0 24 24" aria-hidden="true">
              <path
                className="i"
                d="M3 8.5A2.5 2.5 0 0 1 5.5 6H17V3.5M3 8.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7.5a2 2 0 0 0-2-2H3"
                style={{ fill: "none", stroke: "var(--ink)" } as CSSProperties}
              ></path>
            </svg>
          </div>
          )}
          <div className="tile t-i s3 lift rise" style={{ "--d": ".2s" } as CSSProperties}>
            <div className="tt">
              <span className="chip" style={{ background: "rgba(255,255,255,.14)", color: "#fff" } as CSSProperties}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path className="i" d="M5 12.5l4.5 4.5L19 7.5"></path>
                </svg>
                Approvals
              </span>
              <button className="arrow" aria-label="Open approvals" onClick={v.showNeeds}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path className="i" d="M7 17L17 7M9 7h8v8"></path>
                </svg>
              </button>
            </div>
            <div className="fd" style={{ fontSize: "23px", letterSpacing: "-.03em", marginTop: "18px" } as CSSProperties}>
              Waiting for you
            </div>
            <div style={{ font: "600 12.5px var(--fb)", opacity: ".6", marginBottom: "12px" } as CSSProperties}>Leave, concessions, notices</div>
            <div className="big">
              <Roll digits={v.kLeft} />
              <small>requests</small>
            </div>
            <div style={{ display: "flex", alignItems: "center", marginTop: "14px" } as CSSProperties}>
              {v.avatars.map((a: any, $i: number) => (
                <span
                  key={$i}
                  className="av"
                  style={{ background: a.bg, color: a.fg, marginLeft: $i ? "-10px" : undefined, boxShadow: "0 0 0 2.5px var(--ci)" } as CSSProperties}
                >
                  {a.initials}
                </span>
              ))}
              {v.moreAvatars > 0 && (
                <span style={{ marginLeft: "10px", font: "700 12.5px var(--fb)", opacity: ".7" } as CSSProperties}>and {v.moreAvatars} more</span>
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
              <div className="seg" role="tablist" style={{ background: "color-mix(in srgb,var(--v) 12%,transparent)" } as CSSProperties}>
                <span className="kn" style={{ width: `${v.kw ?? ""}px`, transform: `translateX(${v.kx ?? ""}px)` } as CSSProperties}></span>
                {v.tabs.map((t: any, $i: number) => (
                  <Fragment key={$i}>
                    <button className={t.on} role="tab" aria-selected={t.sel} onClick={t.pick}>
                      {t.n}
                    </button>
                  </Fragment>
                ))}
              </div>
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
                    <div className={`col2 ${p.today ?? ""}`} data-tip={`${p.full}\n${p.v}${p.prev ? ` · was ${p.prev}` : ""}`} onMouseEnter={p.hover} onFocus={p.hover} tabIndex={0} aria-label={`${p.full}: ${p.v}`}>
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
                      <button className="btn sm pri" onClick={n.act}>
                        {n.a}
                      </button>
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
                  <b className="fd" style={{ fontSize: "18px" } as CSSProperties}>
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
                  <i style={{ background: "var(--present)" } as CSSProperties}></i>Present
                </span>
                <span>
                  <i style={{ background: "var(--a)" } as CSSProperties}></i>Late
                </span>
                <span>
                  <i style={{ background: "var(--r)" } as CSSProperties}></i>Absent
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
              <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
                <path className="i" d="M12 5v14M5 12h14" style={{ strokeWidth: "2" } as CSSProperties}></path>
              </svg>
            </span>
            {v.hidden.length ? "Add a widget" : "Choose widgets"}
          </button>
        </section>
      </main>
    </Shell>
  );
}
