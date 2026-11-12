/* eslint-disable */
// Markup from design/canvas/ConsoleFleet.dc.html: classes and structure are the design's. Values come from FleetPage.
import { Fragment, type CSSProperties } from "react";
import { PageScope, Presence, Icon, EmptyState } from "@gradeon/web-ui";
import "./fleet.css";

export function FleetView({ v }: { v: any }) {
  return (
    <PageScope page="fleet" overlays={<><Presence>{v.dialog}</Presence><Presence>{v.alertsDialog}</Presence></>}>
      <main className="mn">
        <header className="hd rise">
          <div>
            <h1>Fleet</h1>
            <p>{v.subtitle}</p>
          </div>
          <span className="grow"></span>
          <button className="ibtn" aria-label={v.alertCount ? `Alerts: ${v.alertCount}` : "Alerts"} data-tip="Alerts" onClick={v.openAlerts}>
            <Icon name="notifications" />
            {v.alertCount > 0 && <span className="pip"></span>}
          </button>
          <button className="btn pri" onClick={v.onboard}>
            <Icon name="plus" />
            Onboard a school
          </button>
        </header>
        <section className="grid" style={{ alignItems: "stretch" } as CSSProperties}>
          <div className={`tile t-v s5 rise ${v.pausedCls ?? ""}`} style={{ "--d": ".05s" } as CSSProperties}>
            <div className="tt">
              <span className="chip">
                <Icon name="releases" size={14} />
                Release
              </span>
              <span style={{ font: "700 13px var(--fb)", opacity: ".8" } as CSSProperties}>{v.relState}</span>
              <button className="arrow" aria-label="Open releases" onClick={v.openReleases}>
                <Icon name="upRight" size={16} />
              </button>
            </div>
            <div className="fd" style={{ fontSize: "28px", letterSpacing: "-.035em", marginTop: "16px" } as CSSProperties}>
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
<div style={{ display: "flex", gap: "8px", marginTop: "16px", flexWrap: "wrap" } as CSSProperties}>
              {v.canPause && (
                <button className="btn sm" onClick={v.pause} disabled={v.busy}>
                  <Icon name={v.pauseIc} />
                  {v.pauseLabel}
                </button>
              )}
              {v.canRollback && (
                <button className="btn sm" onClick={v.rollback} disabled={v.busy}>
                  Mark rolled back
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
                <Icon name="grid" size={14} />
                Schools
              </span>
              <button className="arrow" aria-label="Open the schools list" onClick={v.openSchools}>
                <Icon name="upRight" size={16} />
              </button>
            </div>
            <div className="fd" style={{ fontSize: "22px", letterSpacing: "-.03em", marginTop: "16px" } as CSSProperties}>
              Live now
            </div>
            <div style={{ font: "600 12px var(--fb)", opacity: ".7", marginBottom: "12px" } as CSSProperties}>{v.soon}</div>
            <div className="big" style={{ fontSize: "38px" } as CSSProperties}>
              {v.live}
            </div>
            <div style={{ marginTop: "12px", display: "flex", gap: "8px", alignItems: "center", font: "700 13px var(--fb)" } as CSSProperties}>
              <span className="tr up">+{v.newThisMonth}</span>this month
            </div>
          </div>
          <div className="tile t-i s4 rise" style={{ "--d": ".15s" } as CSSProperties}>
            <div className="tt">
              <span className="chip" style={{ background: "color-mix(in srgb,var(--on-deep) 14%,transparent)", color: "var(--on-deep)" } as CSSProperties}>
                <Icon name="pulse" size={14} />
                Health
              </span>
              <span className="num" style={{ marginLeft: "auto", font: "700 13px var(--fb)", opacity: ".7" } as CSSProperties}>
                {v.p95}
              </span>
              <button className="arrow" aria-label="Open health" onClick={v.openHealth}>
                <Icon name="upRight" size={16} />
              </button>
            </div>
            <div className="hbar" aria-hidden="true">
              <i style={{ flex: v.hOk || 0.001, background: "var(--ok)" } as CSSProperties}></i>
              <i style={{ flex: v.hWarn || 0.001, background: "var(--warn)" } as CSSProperties}></i>
              <i style={{ flex: v.hBad || 0.001, background: "var(--bad)" } as CSSProperties}></i>
            </div>
            <div className="hl">
              <div>
                <i style={{ background: "var(--ok)" } as CSSProperties}></i>Healthy<b>{v.hOk}</b>
              </div>
              <div>
                <i style={{ background: "var(--warn)" } as CSSProperties}></i>Degraded<b>{v.hWarn}</b>
              </div>
              <div>
                <i style={{ background: "var(--bad)" } as CSSProperties}></i>Down<b>{v.hBad}</b>
              </div>
            </div>
          </div>
        </section>
        <section className="grid" style={{ alignItems: "stretch" } as CSSProperties}>
          <div className="card s12 rise" style={{ "--d": ".2s" } as CSSProperties} aria-labelledby="req">
            <div className="ch">
              <h2 id="req">Requests per minute</h2>
              <span className="chip">{v.chartSub}</span>
              <span className="lgd">
                <span>
                  <i style={{ background: "var(--brand)" } as CSSProperties}></i>Today
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
                <path className="area" d={v.pArea} style={{ fill: "var(--brand-soft)" } as CSSProperties}></path>
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
                  <a className="cell" href={c.href} onClick={c.open} style={{ color: "inherit", textDecoration: "none" } as CSSProperties}>
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
                  </a>
                </Fragment>
              ))}
            </div>
          </div>
        </section>
        <section className="grid">
          <div className="card tbl s12 rise" style={{ "--d": ".3s", padding: "0" } as CSSProperties} aria-labelledby="sch">
            <div className="ch" style={{ padding: "24px 24px 16px" } as CSSProperties}>
              <h2 id="sch">Newest schools</h2>
              <span className="grow"></span>
              <button className="btn sm" onClick={v.openSchools}>{v.more ? `All ${v.more} schools` : "All schools"}</button>
            </div>
            {v.rows.length === 0 && !v.loading && (
              <div style={{ padding: "0 24px 24px" } as CSSProperties}>
                <EmptyState scene="fleet" onAction={v.onboard} />
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
                  {v.rows.map((r: any) => (
                    <Fragment key={r.id}>
                      <a
                        className="grd rw"
                        href={r.href}
                        onClick={r.open}
                        style={{ "--cols": "minmax(0,2fr) 70px 130px 130px 80px", height: "58px", color: "inherit", textDecoration: "none" } as CSSProperties}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: "0" } as CSSProperties}>
                          <span className="av" style={{ width: "34px", height: "34px", fontSize: "11px", background: r.bg, color: r.fg, boxShadow: "none" } as CSSProperties}>
                            {r.ini}
                          </span>
                          <b data-tip={r.n} style={{ font: "700 14px/1.25 var(--fb)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as CSSProperties}>{r.n}</b>
                        </div>
                        <span className="chip">{r.cell}</span>
                        <span className="ver">
                          <span style={{ transform: `translateY(${r.vy ?? ""}px)` } as CSSProperties}>
                            <b>{r.from}</b>
                            <b style={{ color: "var(--brand)" } as CSSProperties}>{r.to}</b>
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
            {v.loading && <div className="skc" style={{ height: "260px", margin: "0 20px 20px", borderRadius: "16px" } as CSSProperties}></div>}
          </div>
          <div className="s12" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(320px,100%),1fr))", gap: "12px", alignItems: "start" } as CSSProperties}>
            {v.inc && (
              <div className={`inc ${v.inc.cls ?? ""} rise`} style={{ "--d": ".35s" } as CSSProperties} role="status">
                <div style={{ display: "flex", alignItems: "center", gap: "10px" } as CSSProperties}>
                  <span className={`chip ${v.inc.chip ?? ""}`}>{v.inc.tag}</span>
                  <button className="xb" style={{ marginLeft: "auto" } as CSSProperties} aria-label="Dismiss" onClick={v.inc.dismiss}>
                    <Icon name="close" size={16} />
                  </button>
                </div>
                <div>
                  <b>{v.inc.title}</b>
                  <p style={{ marginTop: "4px" } as CSSProperties}>{v.inc.body}</p>
                </div>
                <div style={{ display: "flex", gap: "8px" } as CSSProperties}>
                  {v.inc.open && (
                    <button className="btn sm" style={{ background: "color-mix(in srgb,var(--on-deep) 10%,transparent)", borderColor: "transparent", color: "inherit", flex: "1" } as CSSProperties} onClick={v.inc.open}>
                      Open the school
                    </button>
                  )}
                  <button className="btn wht sm" style={{ flex: "1" } as CSSProperties} onClick={v.recheck}>
                    Check again
                  </button>
                </div>
              </div>
            )}
            <button className="tile t-l rise" onClick={v.openOnboarding} aria-label="Open onboarding" style={{ "--d": ".4s", display: "flex", alignItems: "center", gap: "12px", padding: "20px 20px", textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer", border: 0, width: "100%" } as CSSProperties}>
              <span className="itile"><Icon name="calendar" size={24} /></span>
              <div>
                <b className="fd" style={{ fontSize: "17px", letterSpacing: "-.02em" } as CSSProperties}>
                  {v.up.title}
                </b>
                <div style={{ font: "600 13px var(--fb)", color: "var(--ink3)", marginTop: "2px" } as CSSProperties}>{v.up.body}</div>
              </div>
            </button>
          </div>
        </section>
      </main>
    </PageScope>
  );
}
