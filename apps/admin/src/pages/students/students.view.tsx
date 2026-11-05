/* eslint-disable */
// Markup converted from design/canvas/AdminStudents.dc.html. Keep the markup and class names as designed.
import { Fragment, type CSSProperties } from "react";
import { Illustration, Roll, Shell } from "@gradeon/web-ui";
import "./students.css";

export function StudentsView({ v }: { v: any }) {
  return (
    <Shell page="students" theme={v.themeCls} aside={v.aside} overlays={<>{v.palette}</>}>
      <main className="mn">
        <header className="hd rise">
          <div>
            <h1>Students</h1>
            <p>{v.subtitle}</p>
          </div>
          <span className="grow"></span>
          <button className="btn" onClick={v.openImport}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path className="i" d="M12 20V9M7 14l5-5 5 5M5 4h14"></path>
            </svg>
            Import
          </button>
          <button className="btn" onClick={v.exportAll}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path className="i" d="M12 4v11M7 10l5 5 5-5M5 20h14"></path>
            </svg>
            Export
          </button>
          <button className="btn pri" onClick={v.openAdd}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path className="i" d="M12 5v14M5 12h14"></path>
            </svg>
            Add student
          </button>
        </header>
        <div className="fbar rise" style={{ "--d": ".05s" } as CSSProperties}>
          <div className="seg" role="tablist">
            <span className="kn" style={{ width: `${v.kw ?? ""}px`, transform: `translateX(${v.kx ?? ""}px)` } as CSSProperties}></span>
            {v.views.map((v: any, $i: number) => (
              <Fragment key={$i}>
                <button className={v.on} role="tab" aria-selected={v.sel} onClick={v.pick}>
                  {v.n}
                  <span className={`chip ${v.cc ?? ""}`} style={{ height: "22px", padding: "0 8px" } as CSSProperties}>
                    {v.c}
                  </span>
                </button>
              </Fragment>
            ))}
          </div>
          <span className="grow"></span>
          {v.pills}
        </div>
        <section className="strip4 rise" style={{ "--d": ".1s" } as CSSProperties} aria-label="Summary">
          <div className="sm">
            <span className="l">Students in view</span>
            <div className="v">{v.sum.inView}</div>
            <div className="s">of {v.sum.total}</div>
          </div>
          {v.has.attendance && (
          <div className="sm">
            <span className="l">Present {v.sum.dayWord}</span>
            <div className="v">
              <Roll digits={v.sum.presD} />
              <em>/{v.sum.marked}</em>
            </div>
            <div className="s">
              <span className="tr up">+{v.sum.since}</span>since 09:00
            </div>
          </div>
          )}
          {v.has.fees && (
          <div className="sm">
            <span className="l">Fees overdue</span>
            <div className="v">
              ₹{v.sum.overdue}
              <em>.00</em>
            </div>
            <div className="s">
              <span className="tr dn">{v.sum.families}</span>this term
            </div>
          </div>
          )}
          {v.has.attendance && (
          <div className="sm">
            <span className="l">Average attendance</span>
            <div className="v">
              {v.sum.avgNone ? "–" : v.sum.avg}
              {!v.sum.avgNone && <em>%</em>}
            </div>
            <div className="s">
              <span className={`tr ${v.sum.deltaCls}`}>{v.sum.delta}</span>vs the 12 days before
            </div>
          </div>
          )}
        </section>
        <section className="tcard rise" style={{ "--d": ".15s" } as CSSProperties} aria-label="Students table">
          <div className="tcap">
            <h2>{v.title}</h2>
            <div className="srch" style={{ minWidth: "280px", height: "38px" } as CSSProperties}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path className="i" d="M4.5 11a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0M20 20l-4.2-4.2"></path>
              </svg>
              <input
                value={v.q}
                onChange={v.onQ}
                placeholder="Name or admission no."
                aria-label="Search students"
                style={
                  {
                    border: "0",
                    outline: "0",
                    background: "none",
                    font: "600 13.5px var(--fb)",
                    color: "var(--ink)",
                    flex: "1",
                    minWidth: "0",
                  } as CSSProperties
                }
              />
            </div>
            <button className="btn sm" onClick={v.openAdd}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path className="i" d="M12 5v14M5 12h14"></path>
              </svg>
              Add student
            </button>
          </div>
          {v.hasRows && (
            <>
              <div className="scroll-x">
              <div className="gmin">
              <div className="grd th" style={{ "--cols": "44px minmax(0,1.5fr) 84px minmax(0,1.1fr) 150px 150px 40px" } as CSSProperties} role="row">
                <button className={`cb ${v.allOn ?? ""}`} role="checkbox" aria-checked={v.allSel} aria-label="Select all" onClick={v.toggleAll}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path className="i" d="M5 12.5l4.5 4.5L19 7.5" style={{ strokeWidth: "3" } as CSSProperties}></path>
                  </svg>
                </button>
                <span className="sortb" aria-sort="ascending">
                  Student
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path className="i" d="M8 10l4-4 4 4M8 14l4 4 4-4"></path>
                  </svg>
                </span>
                <span>Class</span>
                <span>Guardian</span>
                <span>Last 10 days</span>
                <span>Fees</span>
                <span></span>
              </div>
              {v.rows.map((r: any, $i: number) => (
                <Fragment key={$i}>
                  <div
                    className={`grd rw ${r.sel ?? ""}`}
                    style={{ "--cols": "44px minmax(0,1.5fr) 84px minmax(0,1.1fr) 150px 150px 40px" } as CSSProperties}
                    role="row"
                    onClick={r.open}
                    tabIndex={0}
                    onKeyDown={r.key}
                  >
                    <button className={`cb ${r.cbOn ?? ""}`} role="checkbox" aria-checked={r.checked} aria-label={`Select ${r.n ?? ""}`} onClick={r.toggle}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path className="i" d="M5 12.5l4.5 4.5L19 7.5" style={{ strokeWidth: "3" } as CSSProperties}></path>
                      </svg>
                    </button>
                    <div className="who">
                      <span className="av" style={{ background: r.bg, color: r.fg, boxShadow: "none" } as CSSProperties}>
                        {r.ini}
                      </span>
                      <div style={{ minWidth: "0" } as CSSProperties}>
                        <b>{r.n}</b>
                        <small>
                          Adm {r.adm} · {r.house}
                        </small>
                      </div>
                    </div>
                    <span className="cls">
                      {r.cls} · {r.roll}
                    </span>
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--ink2)" } as CSSProperties}>{r.g}</span>
                    <span className="tk" aria-label={`${r.att ?? ""} percent present`}>
                      {r.tk.map((t: any, $i: number) => (
                        <Fragment key={$i}>
                          <i className={t.c} style={{ "--k": t.k } as CSSProperties}></i>
                        </Fragment>
                      ))}
                    </span>
                    <span className={`fs ${r.fcls ?? ""} ${r.pp ?? ""}`}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path className="i" d={r.fic} style={{ strokeWidth: "2.2" } as CSSProperties}></path>
                      </svg>
                      {r.fees}
                    </span>
                    <button className="kebab" aria-label={`Open ${r.n ?? ""}`}>
                      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                        <path className="i" d="M5 12h.01M12 12h.01M19 12h.01" style={{ strokeWidth: "3" } as CSSProperties}></path>
                      </svg>
                    </button>
                  </div>
                </Fragment>
              ))}
              </div>
              </div>
              <div className="tfoot">
                <span>Showing {v.range}</span>
                <span style={{ display: "flex", gap: "8px" } as CSSProperties}>
                  <button className="btn sm" disabled={v.page <= 1} onClick={v.prev}>
                    Previous
                  </button>
                  <button className="btn sm" disabled={!v.hasNext} onClick={v.next}>
                    Next
                  </button>
                </span>
              </div>
            </>
          )}
          {v.noRows && (
            <>
              <div className="empt">
                <div style={{ width: "190px" } as CSSProperties}>
                  <Illustration scene={v.empty.scene} />
                </div>
                <b className="fd" style={{ fontSize: "22px", letterSpacing: "-.025em" } as CSSProperties}>
                  {v.empty.title}
                </b>
                <span className="m2" style={{ font: "500 14.5px var(--fb)" } as CSSProperties}>
                  {v.empty.body}
                </span>
                <div style={{ display: "flex", gap: "10px", marginTop: "10px", flexWrap: "wrap", justifyContent: "center" } as CSSProperties}>
                  <button className="btn pri sm" onClick={v.empty.act}>
                    {v.empty.actLabel}
                  </button>
                  {v.empty.act2 && (
                    <button className="btn sm" onClick={v.empty.act2}>
                      {v.empty.act2Label}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </main>
      <div className={`bulk ${v.bulkOn ?? ""}`} role="region" aria-label="Bulk actions">
        <span style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 12px 0 14px", font: "700 13.5px var(--fb)" } as CSSProperties}>
          <span className="chip v" style={{ height: "26px" } as CSSProperties}>
            {v.count}
          </span>
          selected
        </span>
        <button className="bk" onClick={v.bulkMessage}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path className="i" d="M4 5h16v11H9l-5 4z"></path>
          </svg>
          Message
        </button>
        <button className="bk" onClick={v.bulkInvite}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path className="i" d="M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2"></path>
          </svg>
          Invite to app
        </button>
        {v.has.fees && (
        <button className="bk" onClick={v.bulkFee}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path className="i" d="M3 8.5A2.5 2.5 0 0 1 5.5 6H17V3.5M3 8.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7.5a2 2 0 0 0-2-2H3"></path>
          </svg>
          Assign fee
        </button>
        )}
        <button className="bk" onClick={v.bulkExport}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path className="i" d="M12 4v11M7 10l5 5 5-5M5 20h14"></path>
          </svg>
          Export
        </button>
        <button className="bk" onClick={v.clear} aria-label="Clear selection">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path className="i" d="M6 6l12 12M18 6 6 18"></path>
          </svg>
        </button>
      </div>
      {v.dialog}
      {v.drOn && (
        <>
          <div className={`scrim ${v.out ?? ""}`} onClick={v.close}></div>
          <aside className={`drw ${v.out ?? ""}`} role="dialog" aria-label="Student profile">
            <div className="dh">
              <div className="dtop">
                <span className="dav" style={{ background: v.d.bg, color: v.d.fg } as CSSProperties}>
                  {v.d.ini}
                </span>
                <div>
                  <div className="fd" style={{ fontSize: "27px", letterSpacing: "-.03em", lineHeight: "1.1" } as CSSProperties}>
                    {v.d.n}
                  </div>
                  <div style={{ font: "600 13.5px var(--fb)", color: "var(--ink3)", marginTop: "4px" } as CSSProperties}>
                    Adm {v.d.adm} · Class {v.d.cls} · Roll {v.d.roll}
                  </div>
                </div>
                <button className="xbtn" aria-label="Close" onClick={v.close}>
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path className="i" d="M6 6l12 12M18 6 6 18"></path>
                  </svg>
                </button>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" } as CSSProperties}>
                <span className={`fs ${v.d.fcls ?? ""}`}>{v.d.fees}</span>
                {v.d.house && <span className="chip c">{v.d.house} house</span>}
                {v.d.route && <span className="chip b">{v.d.route}</span>}
              </div>
            </div>
            <div className="db">
              <div className="facts">
                <div className="fc t-v" style={{ "--d": ".05s" } as CSSProperties}>
                  <span>Attendance this term</span>
                  <b>{v.d.att}%</b>
                </div>
                <div className="fc t-a" style={{ "--d": ".1s" } as CSSProperties}>
                  <span>{v.d.examName}</span>
                  <b>{v.d.exam}</b>
                </div>
                <div className="fc t-g" style={{ "--d": ".15s" } as CSSProperties}>
                  <span>Homework on time</span>
                  <b>{v.d.homework}</b>
                </div>
                <div className="fc t-l" style={{ "--d": ".2s" } as CSSProperties}>
                  <span>Library books out</span>
                  <b>{v.d.library}</b>
                </div>
              </div>
              <div>
                <h3>{v.d.rollTitle}</h3>
                <div className="roll24" aria-label={v.d.rollAria}>
                  {v.heat.map((h: any, $i: number) => (
                    <Fragment key={$i}>
                      <i className={h.c} style={{ "--d": `${h.d ?? ""}s` } as CSSProperties}></i>
                    </Fragment>
                  ))}
                </div>
              </div>
              <div>
                <h3>Guardians</h3>
                <div className="g">
                  <span className="av" style={{ background: "var(--card)", color: "var(--ink2)", boxShadow: "none" } as CSSProperties}>
                    {v.d.gi}
                  </span>
                  <div style={{ flex: "1" } as CSSProperties}>
                    <b style={{ font: "700 14px var(--fb)" } as CSSProperties}>{v.d.g}</b>
                    <div style={{ font: "600 12.5px var(--fb)", color: "var(--ink3)" } as CSSProperties}>Primary · may collect from school</div>
                  </div>
                  <span className="num" style={{ font: "700 12.5px var(--fb)", color: "var(--ink2)" } as CSSProperties}>
                    {v.phone}
                  </span>
                  <button className="rev" onClick={v.reveal}>
                    {v.rlab}
                  </button>
                </div>
              </div>
              <div>
                <h3>Activity</h3>
                {v.d.activity.length === 0 && <div className="help">Nothing yet. Payments, homework and attendance notes appear here.</div>}
                {v.d.activity.map((e: any, $i: number) => (
                  <div className="ev" key={$i}>
                    <i style={{ background: e.color } as CSSProperties}></i>
                    <div>
                      {e.label}
                      <small>{e.sub}</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", padding: "16px 26px 22px", borderTop: "1px solid var(--line)" } as CSSProperties}>
              <button className="btn pri" style={{ flex: "1" } as CSSProperties} onClick={v.messageOne}>
                Message guardians
              </button>
              {v.canCollect && (
                <button className="btn" onClick={v.collect}>
                  Collect fee
                </button>
              )}
            </div>
          </aside>
        </>
      )}
    </Shell>
  );
}
