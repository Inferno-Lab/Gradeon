/* eslint-disable */
// Markup from design/canvas/ConsoleFleet.dc.html: classes and structure are the design's. Values come from FleetPage.
import { Fragment, type CSSProperties } from "react";
import { EmptyCard, Illustration, Shell } from "@gradeon/web-ui";
import "./fleet.css";

export function FleetView({ v }: { v: any }) {
  return (
    <Shell page="fleet" theme={v.themeCls} aside={v.aside} overlays={<>{v.palette}{v.dialog}{v.alertsDialog}</>}>
      <main className="mn">
        <header className="hd rise">
          <div>
            <h1>Fleet</h1>
            <p>{v.subtitle}</p>
          </div>
          <span className="grow"></span>
          <div className="srch" role="search" onClick={v.openSearch} tabIndex={0} onKeyDown={(e: any) => e.key === "Enter" && v.openSearch()} style={{ cursor: "text" }}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path className="i" d="M4.5 11a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0M20 20l-4.2-4.2"></path>
            </svg>
            Find a school or page<span className="kbd">Ctrl K</span>
          </div>
          <button className="ibtn" aria-label={v.pending ? `${v.pending} requests to approve` : "Approvals"} onClick={v.openApprovals}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path className="i" d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"></path>
            </svg>
            {v.pending > 0 && <span className="pip"></span>}
          </button>
          <button className="btn pri" onClick={v.onboard}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path className="i" d="M12 5v14M5 12h14"></path>
            </svg>
            Onboard a school
          </button>
        </header>
        <section className="grid" style={{ alignItems: "stretch" } as CSSProperties}>
          <div className={`tile t-v s5 rise ${v.pausedCls ?? ""}`} style={{ "--d": ".05s" } as CSSProperties}>
            <div className="tt">
              <span className="chip">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path className="i" d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5"></path>
                </svg>
                Release
              </span>
              <span style={{ font: "700 13px var(--fb)", opacity: ".8" } as CSSProperties}>{v.relState}</span>
              <button className="arrow" aria-label="Open releases" onClick={v.openReleases}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path className="i" d="M7 17L17 7M9 7h8v8"></path>
                </svg>
              </button>
            </div>
            <div className="fd" style={{ fontSize: "30px", letterSpacing: "-.035em", marginTop: "16px" } as CSSProperties}>
              {v.relVersion}
            </div>
            <div style={{ font: "600 13px var(--fb)", opacity: ".78" } as CSSProperties}>{v.relLine}</div>
            {v.hasRelease && (
<>
<div className="ticks" role="progressbar" aria-valuenow={v.done} aria-valuemin={0} aria-valuemax={v.total} aria-label="Schools updated">
              {v.ticks.map((t: any, $i: number) => (
                <Fragment key={$i}>
                  <i className={t.c}></i>
                </Fragment>
              ))}
            </div>
            <div className="waves">
              {v.waves.map((w: any, $i: number) => (
                <Fragment key={$i}>
                  {$i > 0 && <u></u>}
                  <i className={w.c}>{$i + 1}</i>
                </Fragment>
              ))}
            </div>
            </>
)}
<div style={{ display: "flex", gap: "8px", marginTop: "18px", flexWrap: "wrap" } as CSSProperties}>
              {v.canPause && (
                <button className="btn sm" onClick={v.pause} disabled={v.busy}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path className="i" d={v.pauseIc}></path>
                  </svg>
                  {v.pauseLabel}
                </button>
              )}
              {v.canRollback && (
                <button className="btn sm" onClick={v.rollback} disabled={v.busy}>
                  Roll back
                </button>
              )}
              {!v.canPause && !v.canRollback && (
                <button className="btn sm" onClick={v.openReleases}>
                  {v.relCta}
                </button>
              )}
            </div>
          </div>
          <div className="tile t-a s3 lift rise" style={{ "--d": ".1s" } as CSSProperties}>
            <div className="tt">
              <span className="chip">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path className="i" d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"></path>
                </svg>
                Schools
              </span>
              <button className="arrow" aria-label="Open onboarding" onClick={v.onboard}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path className="i" d="M7 17L17 7M9 7h8v8"></path>
                </svg>
              </button>
            </div>
            <div className="fd" style={{ fontSize: "23px", letterSpacing: "-.03em", marginTop: "18px" } as CSSProperties}>
              Live now
            </div>
            <div style={{ font: "600 12.5px var(--fb)", opacity: ".7", marginBottom: "14px" } as CSSProperties}>{v.soon}</div>
            <div className="big" style={{ fontSize: "54px" } as CSSProperties}>
              {v.live}
            </div>
            <div style={{ marginTop: "14px", display: "flex", gap: "8px", alignItems: "center", font: "700 13px var(--fb)" } as CSSProperties}>
              <span className="tr up">+{v.newThisMonth}</span>this month
            </div>
          </div>
          <div className="tile t-i s4 rise" style={{ "--d": ".15s" } as CSSProperties}>
            <div className="tt">
              <span className="chip" style={{ background: "rgba(255,255,255,.14)", color: "#fff" } as CSSProperties}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path className="i" d="M3 12h4l3-7 4 14 3-7h4"></path>
                </svg>
                Health
              </span>
              <span className="num" style={{ marginLeft: "auto", font: "700 13px var(--fb)", opacity: ".7" } as CSSProperties}>
                {v.p95}
              </span>
            </div>
            <div className="hbar" aria-hidden="true">
              <i style={{ flex: v.hOk || 0.001, background: "var(--g)" } as CSSProperties}></i>
              <i style={{ flex: v.hWarn || 0.001, background: "var(--a)" } as CSSProperties}></i>
              <i style={{ flex: v.hBad || 0.001, background: "var(--r)" } as CSSProperties}></i>
            </div>
            <div className="hl">
              <div>
                <i style={{ background: "var(--g)" } as CSSProperties}></i>Healthy<b>{v.hOk}</b>
              </div>
              <div>
                <i style={{ background: "var(--a)" } as CSSProperties}></i>Degraded<b>{v.hWarn}</b>
              </div>
              <div>
                <i style={{ background: "var(--r)" } as CSSProperties}></i>Down<b>{v.hBad}</b>
              </div>
            </div>
          </div>
        </section>
        <section className="grid" style={{ alignItems: "stretch" } as CSSProperties}>
          <div className="card s12 rise" style={{ "--d": ".2s" } as CSSProperties} aria-labelledby="req">
            <div className="ch">
              <h2 id="req">Requests per minute</h2>
              <span className="lgd">
                <span>
                  <i style={{ background: "var(--v)" } as CSSProperties}></i>Today
                </span>
                <span>
                  <i style={{ background: "var(--ink3)" } as CSSProperties}></i>Yesterday
                </span>
              </span>
            </div>
            <div className="chart" onMouseMove={v.cmove} onTouchMove={v.ctouch}>
              <svg viewBox="0 0 600 240" preserveAspectRatio="none" role="img" aria-label={v.chartLabel}>
                <line className="gl" x1="0" y1="60" x2="600" y2="60"></line>
                <line className="gl" x1="0" y1="120" x2="600" y2="120"></line>
                <line className="gl" x1="0" y1="180" x2="600" y2="180"></line>
                <path className="area" d={v.pArea} style={{ fill: "var(--vS)" } as CSSProperties}></path>
                <path className="ln2" d={v.p2}></path>
                <path className="ln" d={v.p1}></path>
              </svg>
              <span className="vl" style={{ left: `${v.cx ?? ""}%` } as CSSProperties}></span>
              <span className="cd" style={{ left: `${v.cx ?? ""}%`, top: `${v.cy ?? ""}px` } as CSSProperties}></span>
              <span className="ctp" style={{ left: `${v.tx ?? ""}%`, top: `${v.ty ?? ""}px` } as CSSProperties}>
                <b>{v.cv} per minute</b>
                {v.ct}
              </span>
              <div className="xl">
                <span>00:00</span>
                <span>06:00</span>
                <span>12:00</span>
                <span>18:00</span>
                <span>24:00</span>
              </div>
            </div>
          </div>
          <div className="card s12 rise" style={{ "--d": ".25s" } as CSSProperties} aria-labelledby="cells">
            <div className="ch">
              <h2 id="cells">Cells</h2>
              <button className="btn sm" onClick={v.openCells}>
                Manage
              </button>
            </div>
            <div className="cellg" style={{ marginTop: "10px" } as CSSProperties}>
              {v.cells.length === 0 && <div className="help">No cells yet. Cells appear when the first school is placed.</div>}
              {v.cells.map((c: any, $i: number) => (
                <Fragment key={$i}>
                  <div className="cell" onClick={v.openCells}>
                    <svg className="gz" viewBox="0 0 54 54" aria-hidden="true">
                      <circle className="bg" cx="27" cy="27" r="22"></circle>
                      <circle className="fg" cx="27" cy="27" r="22" style={{ stroke: c.col, strokeDashoffset: c.off } as CSSProperties}></circle>
                    </svg>
                    <div style={{ flex: "1", minWidth: "0" } as CSSProperties}>
                      <b>{c.n}</b>
                      <small>
                        {c.s} {c.s === 1 ? "school" : "schools"} · {c.p}% full
                      </small>
                    </div>
                    <span className={`st ${c.cc ?? ""}`}>
                      <i></i>
                      {c.st}
                    </span>
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
        </section>
        <section className="grid">
          <div className="card tbl s12 rise" style={{ "--d": ".3s", padding: "0" } as CSSProperties} aria-labelledby="sch">
            <div className="ch" style={{ padding: "22px 22px 14px" } as CSSProperties}>
              <h2 id="sch">Schools</h2>
              <span className="chip">{v.rows.length} · newest first</span>
            </div>
            {v.rows.length === 0 && !v.loading && (
              <div style={{ padding: "0 22px 22px" } as CSSProperties}>
                <EmptyCard
                  title="Schools"
                  chip={{ text: "0 schools", tone: "v" }}
                  scene="register"
                  heading="No schools on this platform yet"
                  body="Onboard the first school from here. The console creates its database, address, first admin and app settings in a few minutes."
                  actions={
                    <button className="btn pri" onClick={v.onboard}>
                      Onboard a school
                    </button>
                  }
                />
              </div>
            )}
            {v.rows.length > 0 && (
              <div className="scroll-x">
                <div style={{ minWidth: "620px" } as CSSProperties}>
                  <div className="grd th" style={{ "--cols": "minmax(0,2fr) 70px 130px 130px 80px" } as CSSProperties}>
                    <span>School</span>
                    <span>Cell</span>
                    <span>Version</span>
                    <span>Status</span>
                    <span>p95</span>
                  </div>
                  {v.rows.map((r: any, $i: number) => (
                    <Fragment key={r.id}>
                      <a
                        className={`grd rw ${r.up ?? ""}`}
                        href={r.href}
                        onClick={r.open}
                        style={{ "--cols": "minmax(0,2fr) 70px 130px 130px 80px", height: "58px", color: "inherit", textDecoration: "none" } as CSSProperties}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: "0" } as CSSProperties}>
                          <span className="av" style={{ width: "34px", height: "34px", fontSize: "11px", background: r.bg, color: r.fg, boxShadow: "none" } as CSSProperties}>
                            {r.ini}
                          </span>
                          <b title={r.n} style={{ font: "700 14px/1.25 var(--fb)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as CSSProperties}>{r.n}</b>
                        </div>
                        <span className="chip">{r.cell}</span>
                        <span className="ver">
                          <span style={{ transform: `translateY(${r.vy ?? ""}px)` } as CSSProperties}>
                            <b>{r.from}</b>
                            <b style={{ color: "var(--v)" } as CSSProperties}>{r.to}</b>
                          </span>
                        </span>
                        <span className={`st ${r.cc ?? ""}`}>
                          <i></i>
                          {r.st}
                        </span>
                        <span className="num" style={{ font: "700 13px var(--fb)" } as CSSProperties}>
                          {r.p}
                        </span>
                      </a>
                    </Fragment>
                  ))}
                </div>
              </div>
            )}
            {v.loading && <div className="skc" style={{ height: "260px", margin: "0 22px 22px", borderRadius: "20px" } as CSSProperties}></div>}
          </div>
          <div className="s12" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(320px,100%),1fr))", gap: "14px", alignItems: "start" } as CSSProperties}>
            {v.inc && (
              <div className={`inc ${v.inc.cls ?? ""} rise`} style={{ "--d": ".35s" } as CSSProperties} role="status">
                <div style={{ display: "flex", alignItems: "center", gap: "10px" } as CSSProperties}>
                  <span className={`chip ${v.inc.chip ?? ""}`}>{v.inc.tag}</span>
                  <button className="xb" style={{ marginLeft: "auto" } as CSSProperties} aria-label="Dismiss" onClick={v.inc.dismiss}>
                    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                      <path className="i" d="M6 6l12 12M18 6 6 18"></path>
                    </svg>
                  </button>
                </div>
                <div>
                  <b>{v.inc.title}</b>
                  <p style={{ marginTop: "4px" } as CSSProperties}>{v.inc.body}</p>
                </div>
                <div style={{ display: "flex", gap: "8px" } as CSSProperties}>
                  {v.inc.open && (
                    <button className="btn sm" style={{ background: "rgba(255,255,255,.1)", borderColor: "transparent", color: "inherit", flex: "1" } as CSSProperties} onClick={v.inc.open}>
                      Open the school
                    </button>
                  )}
                  <button className="btn wht sm" style={{ flex: "1" } as CSSProperties} onClick={v.recheck}>
                    Check again
                  </button>
                </div>
              </div>
            )}
            <div className="tile t-l rise" style={{ "--d": ".4s", display: "flex", alignItems: "center", gap: "12px", padding: "18px 20px" } as CSSProperties}>
              <div style={{ width: "92px", flex: "none" } as CSSProperties}>
                <Illustration scene="calendar" />
              </div>
              <div>
                <b className="fd" style={{ fontSize: "17px", letterSpacing: "-.02em" } as CSSProperties}>
                  {v.up.title}
                </b>
                <div style={{ font: "600 13px var(--fb)", color: "var(--ink3)", marginTop: "2px" } as CSSProperties}>{v.up.body}</div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </Shell>
  );
}
