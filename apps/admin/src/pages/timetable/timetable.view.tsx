/* eslint-disable */
// Markup converted from design/canvas/AdminTimetable.dc.html. Keep the markup and class names as designed.
import { Fragment, type CSSProperties } from "react";
import { Select, PageScope, ToastSlot, Segmented } from "@gradeon/web-ui";
import "./timetable.css";

export function TimetableView({ v }: { v: any }) {
  return (
    <PageScope
      page="timetable"
      overlays={
        <ToastSlot toast={v.toast} />
      }
    >
      <main className="mn">
        <header className="hd rise">
          <div>
            <h1>Timetable</h1>
            <p>
              Class {v.className} · {v.term} · version {v.version},{" "}
              <span style={{ color: v.isDraft ? "var(--aD)" : "var(--gD)", fontWeight: "700" } as CSSProperties}>{v.isDraft ? "draft" : "published"}</span>
            </p>
          </div>
          <span className="grow"></span>
          <Select compact aria-label="Class" value={String(Math.max(0, v.classes.findIndex((c: any) => c.on)))} onChange={(i) => v.classes[Number(i)]?.pick()} options={v.classes.map((c: any, i: number) => ({ value: String(i), label: c.n }))} />
          <Segmented label="Timetable view" value={String(v.views.findIndex((x: any) => x.on))} onChange={(i: string) => v.views[Number(i)].pick()} options={v.views.map((x: any, i: number) => ({ value: String(i), label: x.n }))} />
          <button className="btn pri" onClick={v.publish}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path className="i" d="M4 12l16-8-6 16-3-7z"></path>
            </svg>
            Publish
          </button>
        </header>
        <div className="wk rise" style={{ "--d": ".05s" } as CSSProperties}>
          <div className="wkp">
            <button aria-label="Previous week" onClick={v.prevWeek}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path className="i" d="M15 6l-6 6 6 6"></path>
              </svg>
            </button>
            <span>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path className="i" d="M3.5 6.5h17v13h-17zM3.5 10.5h17M8 4v4M16 4v4"></path>
              </svg>
              {v.weekLabel}
            </span>
            <button aria-label="Next week" onClick={v.nextWeek}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path className="i" d="M9 6l6 6-6 6"></path>
              </svg>
            </button>
          </div>
          <span className="grow"></span>
          <span className={`chip ${v.clashChip ?? ""}`}>{v.clashText}</span>
          {v.draftChanges > 0 && (
            <span className="chip v">
              {v.draftChanges} unpublished {v.draftChanges === 1 ? "change" : "changes"}
            </span>
          )}
          <span className="lgd" style={{ display: "flex", gap: "10px", flexWrap: "wrap" } as CSSProperties}>
            {v.legend.map((l: any, $i: number) => (
              <span key={$i} className={`chip ${l.k}`}>
                {l.n}
              </span>
            ))}
          </span>
        </div>
        <div className="bd" data-even="">
          <section className="tg rise" style={{ "--d": ".1s", ...v.tgStyle } as CSSProperties} aria-label="Week grid">
            <div className="trow">
              <span></span>
              {v.days.map((d: any, $i: number) => (
                <Fragment key={$i}>
                  <div className={`dh ${d.today ?? ""}`}>
                    {d.n}
                    <b>{d.d}</b>
                  </div>
                </Fragment>
              ))}
            </div>
            {v.mode !== "list" &&
              v.rows.map((r: any, $i: number) => (
                <Fragment key={$i}>
                  <div className="trow">
                    <div className="tl">
                      {r.l}
                      <small>{r.t}</small>
                    </div>
                    {r.brk && (
                      <>
                        <div className="br">
                          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                            <path className="i" d="M5 8h10v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM15 9h2a2 2 0 0 1 0 5h-2M8 3v2M12 3v2"></path>
                          </svg>
                          {r.name}
                        </div>
                      </>
                    )}
                    {r.per && (
                      <>
                        {r.cells.map((c: any, $i: number) => (
                          <Fragment key={$i}>
                            <button
                              className={`cl ${c.k ?? ""} ${c.sel ?? ""} ${c.bad ?? ""} ${c.now ?? ""}`}
                              style={{ "--d": `${c.d ?? ""}s`, "--pg": `${c.pg ?? ""}%` } as CSSProperties}
                              onClick={c.pick}
                              aria-pressed={c.pressed}
                            >
                              {c.isBad && (
                                <>
                                  <span className="alert" aria-label="Clash">
                                    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                                      <path className="i" d="M12 7v6M12 17h.01" style={{ strokeWidth: "3" } as CSSProperties}></path>
                                    </svg>
                                  </span>
                                </>
                              )}
                              {c.isFixed && (
                                <>
                                  <span className="fixed">
                                    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                                      <path className="i" d="M5 12.5l4.5 4.5L19 7.5" style={{ strokeWidth: "3" } as CSSProperties}></path>
                                    </svg>
                                  </span>
                                </>
                              )}
                              <b>{c.n}</b>
                              <small>{c.t}</small>
                              <span className="rm">{c.r}</span>
                            </button>
                          </Fragment>
                        ))}
                      </>
                    )}
                  </div>
                </Fragment>
              ))}
            {v.mode === "list" && (
              <div className="lst" style={{ gridColumn: "1 / -1" } as CSSProperties}>
                {v.list.map((it: any, $i: number) => (
                  <button key={$i} className={`lrow ${it.k}`} onClick={it.pick}>
                    <span className="d">{it.day}</span>
                    <b>{it.n}</b>
                    <span>{it.t}</span>
                    <span className="num">{it.time}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
          {v.dialog}
          <aside className="side">
            <section className="det" aria-live="polite" aria-label="Selected period">
              <div style={{ display: "flex", alignItems: "center", gap: "12px" } as CSSProperties}>
                <span className={`sw1 chip ${v.sel.k ?? ""}`} style={{ padding: "0" } as CSSProperties}>
                  {v.sel.ab}
                </span>
                <div>
                  <div className="fd" style={{ fontSize: "22px", letterSpacing: "-.025em" } as CSSProperties}>
                    {v.sel.n}
                  </div>
                  <div className="help">
                    {v.sel.day} · {v.sel.time}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" } as CSSProperties}>
                <span className="chip">{v.sel.t}</span>
                <span className="chip">Room {v.sel.r}</span>
                <span className="chip">{v.sel.len}</span>
              </div>
              {v.sel.bad && (
                <>
                  <div className="call" role="alert">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path className="i" d="M12 3.5l9 15.5H3zM12 10v4M12 16.5h.01"></path>
                    </svg>
                    <div>
                      <b>Clash with {v.sel.other}.</b> {v.sel.t} is also teaching {v.sel.other} at this time. Pick a fix; nothing changes until you publish.
                    </div>
                  </div>
                </>
              )}
              {v.sel.fixedNow && (
                <>
                  <div className="call ok">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path className="i" d="M5 12.5l4.5 4.5L19 7.5" style={{ strokeWidth: "2.4" } as CSSProperties}></path>
                    </svg>
                    <div>
                      <b>Clash fixed.</b> {v.sel.t} covers this period. Both classes are clear.
                    </div>
                  </div>
                </>
              )}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" } as CSSProperties}>
                {v.sel.bad && (
                  <>
                    {v.sel.suggest && (
                      <button className="btn pri sm" onClick={v.fix}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path className="i" d="M13 3 5 13h6l-1 8 8-10h-6z"></path>
                        </svg>
                        Ask {v.sel.suggest} to cover
                      </button>
                    )}
                    <button className="btn sm" onClick={v.change}>
                      Choose someone else
                    </button>
                  </>
                )}
                {v.sel.fine && (
                  <>
                    {v.canEdit && (
                      <button className="btn sm" onClick={v.change}>
                        Change teacher
                      </button>
                    )}
                  </>
                )}
              </div>
            </section>
            <section className="card" aria-labelledby="load">
              <div className="ch">
                <h2 id="load" style={{ fontSize: "17px" } as CSSProperties}>
                  Teacher load
                </h2>
                <span className="chip">this week</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", margin: "12px 0 6px" } as CSSProperties}>
                <svg className="ring" viewBox="0 0 84 84" aria-hidden="true">
                  <circle className="bg" cx="42" cy="42" r="36"></circle>
                  <circle className="fg" cx="42" cy="42" r="36" style={{ strokeDashoffset: v.ringOff, stroke: v.ringC } as CSSProperties}></circle>
                </svg>
                <div>
                  <div className="fd" style={{ fontSize: "28px", letterSpacing: "-.035em", lineHeight: "1" } as CSSProperties}>
                    {v.kLoad}
                    <span className="muted" style={{ font: "700 15px var(--fb)" } as CSSProperties}>
                      {" "}
                      / {v.loadMax}
                    </span>
                  </div>
                  <div className="help" style={{ marginTop: "4px" } as CSSProperties}>
                    {v.loadName}, periods
                  </div>
                </div>
              </div>
              <div className="lscroll" data-even-scroll="" style={{ maxHeight: "232px" } as CSSProperties}>
              {v.loads.map((l: any, $i: number) => (
                <Fragment key={$i}>
                  <div className="lr" data-tip={`${l.n}\n${l.v} periods this week`}>
                    <span className="av" style={{ width: "32px", height: "32px", fontSize: "11px", background: l.bg, color: l.fg, boxShadow: "none" } as CSSProperties}>
                      {l.ini}
                    </span>
                    <div style={{ minWidth: "0", width: "92px" } as CSSProperties}>
                      <b>{l.n}</b>
                      <small>{l.s}</small>
                    </div>
                    <div className="lb">
                      <i className={l.hot} style={{ width: `${l.p ?? ""}%` } as CSSProperties}></i>
                    </div>
                    <span className="num" style={{ font: "700 12px var(--fb)", width: "28px", textAlign: "right" } as CSSProperties}>
                      {l.v}
                    </span>
                  </div>
                </Fragment>
              ))}
              </div>
            </section>
            <section className="card" aria-labelledby="unp">
              <div className="ch">
                <h2 id="unp" style={{ fontSize: "17px" } as CSSProperties}>
                  Not placed yet
                </h2>
                {v.unplaced.length > 0 && <span className="chip a">{v.unplaced.length}</span>}
              </div>
              <div className="lscroll" data-even-scroll="" style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px", maxHeight: "176px" } as CSSProperties}>
                {v.unplaced.length === 0 && <div className="help">Every period this class needs has a place.</div>}
                {v.unplaced.map((u: any, $i: number) => (
                  <div className="un" key={$i}>
                    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" style={{ color: "var(--ink3)" } as CSSProperties}>
                      <path className="i" d="M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01" style={{ strokeWidth: "3" } as CSSProperties}></path>
                    </svg>
                    {u.name} · {u.missing} {u.missing === 1 ? "period" : "periods"}
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </PageScope>
  );
}
