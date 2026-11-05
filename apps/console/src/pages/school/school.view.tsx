/* eslint-disable */
// Markup from design/canvas/ConsoleSchool.dc.html: classes and structure are the design's. Values come from SchoolPage.
import { Fragment, type CSSProperties } from "react";
import { Shell, Toast } from "@gradeon/web-ui";
import "./school.css";

export function SchoolView({ v }: { v: any }) {
  return (
    <Shell
      page="school"
      theme={v.themeCls}
      aside={v.aside}
      frClass={`${v.shk ?? ""}`}
      overlays={
        <>
          {v.palette}
          {v.sup && (
            <>
              <div className="glow" aria-hidden="true"></div>
              <div className="sbar" role="status">
                <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                  <path className="i" d="M12 3l8 4v5c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V7z"></path>
                </svg>
                Inside {v.shortName} · read-only<span className="c num">{v.clock} left</span>
                <button onClick={v.endSup}>End session</button>
              </div>
            </>
          )}
          {v.dialog}
          {v.toast && <Toast text={v.toast} tone={v.toastTone} />}
        </>
      }
    >
      <main className="mn">
        <div className="crumb rise">
          <a href={v.fleetHref} onClick={v.toFleet}>
            Fleet
          </a>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path className="i" d="M9 6l6 6-6 6"></path>
          </svg>
          <b style={{ color: "var(--ink)" } as CSSProperties}>{v.name}</b>
        </div>
        <header className="hd rise" style={{ "--d": ".05s", gap: "18px", flexWrap: "wrap" } as CSSProperties}>
          <span className="slogo" style={{ background: v.color, boxShadow: `0 14px 28px -12px ${v.color}` } as CSSProperties}>
            {v.logoText}
          </span>
          <div style={{ minWidth: "0" } as CSSProperties}>
            <h1>{v.name}</h1>
            <p>{v.subtitle}</p>
          </div>
          <span className={`chip ${v.stChip ?? ""}`} style={{ height: "30px" } as CSSProperties}>
            {v.stText}
          </span>
          <span className="grow"></span>
          {v.canSupport && (
            <button className="btn" onClick={v.openSupport}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path className="i" d="M12 3l8 4v5c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V7z"></path>
              </svg>
              Support session
            </button>
          )}
          {v.canErase && (
            <button className="btn dng" onClick={v.openErase}>
              Erase school
            </button>
          )}
        </header>
        <div className="seg rise" style={{ "--d": ".1s", alignSelf: "flex-start", maxWidth: "100%", overflowX: "auto" } as CSSProperties} role="tablist">
          <span className="kn" style={{ width: `${v.tw ?? ""}px`, transform: `translateX(${v.tx ?? ""}px)` } as CSSProperties}></span>
          {v.tabs.map((t: any, $i: number) => (
            <Fragment key={$i}>
              <button className={t.on} role="tab" aria-selected={t.sel} onClick={t.pick} ref={t.ref}>
                {t.n}
              </button>
            </Fragment>
          ))}
        </div>
        {v.tab !== 0 && v.extra}
        {v.tab === 0 && (
          <section className="grid" data-even="">
            <div className="card s7 rise" style={{ "--d": ".15s" } as CSSProperties} aria-labelledby="prov">
              <div className="ch">
                <h2 id="prov">{v.provTitle}</h2>
                {v.canRetry && (
                  <button className="btn v sm" onClick={v.retry} disabled={v.busy}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path className="i" d="M4 4v6h6M5.5 15a7 7 0 1 0 1-8.5L4 9"></path>
                    </svg>
                    Retry step {v.failedNo}
                  </button>
                )}
                {v.canSkip && (
                  <button className="btn sm" onClick={v.skip} disabled={v.busy}>
                    Skip this step
                  </button>
                )}
              </div>
              {v.steps.length === 0 && <div className="help" style={{ marginTop: "14px" } as CSSProperties}>No setup run has been recorded for this school.</div>}
              <div className="steps">
                {v.steps.map((s: any, $i: number) => (
                  <Fragment key={$i}>
                    <div className={`stp ${s.cls ?? ""}`}>
                      <span className="dot">
                        {s.ok && (
                          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                            <path className="i" d="M5 12.5l4.5 4.5L19 7.5" style={{ strokeWidth: "2.8" } as CSSProperties}></path>
                          </svg>
                        )}
                        {s.bad && (
                          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                            <path className="i" d="M7 7l10 10M17 7 7 17" style={{ strokeWidth: "2.6" } as CSSProperties}></path>
                          </svg>
                        )}
                        {s.todo && <>{s.num}</>}
                      </span>
                      <div>
                        <b>{s.n}</b>
                        <small>{s.d}</small>
                      </div>
                      <span className="tm">{s.t}</span>
                    </div>
                  </Fragment>
                ))}
              </div>
              <div className="log" data-even-scroll="" aria-live="polite" aria-label="Setup log">
                {v.log.map((l: any, $i: number) => (
                  <Fragment key={$i}>
                    <div className="ll">
                      <span className="t">{l.t}</span> <span className={l.c}>{l.m}</span>
                    </div>
                  </Fragment>
                ))}
              </div>
            </div>
            <div className="s5" style={{ display: "flex", flexDirection: "column", gap: "18px", minWidth: "0" } as CSSProperties}>
              <div className="tkt rise" style={{ "--d": ".2s" } as CSSProperties}>
                <div className="l">
                  <div className="fd" style={{ fontSize: "23px", letterSpacing: "-.03em" } as CSSProperties}>
                    Gradeon {v.planName}
                  </div>
                  <div className="tl2">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path className="i" d="M3.5 6.5h17v13h-17zM3.5 10.5h17"></path>
                    </svg>
                    {v.invoiceLine}
                  </div>
                  <div className="tl2">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path className="i" d="M3 8.5A2.5 2.5 0 0 1 5.5 6H17V3.5M3 8.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7.5a2 2 0 0 0-2-2H3"></path>
                    </svg>
                    {v.contactLine}
                  </div>
                  {v.canBilling && (
                    <button className="btn sm wht" style={{ alignSelf: "flex-start" } as CSSProperties} onClick={v.openBilling}>
                      Open in billing
                    </button>
                  )}
                </div>
                <div className="r">
                  <span className={`chip ${v.planChip ?? "a"}`} style={{ alignSelf: "flex-start" } as CSSProperties}>
                    {v.planStatus}
                  </span>
                  <span>{v.yearly}</span>
                  <span>{v.limitStudents} students</span>
                </div>
              </div>
              <div className="card rise" style={{ "--d": ".25s" } as CSSProperties} aria-labelledby="use">
                <div className="ch">
                  <h2 id="use">Usage</h2>
                  <span className="chip">now</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "18px", marginTop: "16px" } as CSSProperties}>
                  <div className="us">
                    <div className="r">
                      Students<b>{v.studentsText}</b>
                    </div>
                    <div className="bar">
                      <i style={{ width: `${v.u1 ?? ""}%` } as CSSProperties}></i>
                    </div>
                  </div>
                  <div className="us">
                    <div className="r">
                      File storage<b>{v.storageText}</b>
                    </div>
                    <div className="bar">
                      <i style={{ width: `${v.u2 ?? ""}%` } as CSSProperties}></i>
                    </div>
                  </div>
                  <div className="us">
                    <div className="r">
                      SMS this month<b className="num">{v.smsText}</b>
                    </div>
                    <div className="tk3">
                      {v.sms.map((s: any, $i: number) => (
                        <Fragment key={$i}>
                          <i className={s.c}></i>
                        </Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="card rise" style={{ "--d": ".3s" } as CSSProperties} aria-labelledby="stores">
                <div className="ch">
                  <h2 id="stores">App stores</h2>
                  <span className={`chip ${v.checkDone === v.checkTotal && v.checkTotal > 0 ? "g" : "a"}`}>
                    {v.checkDone} of {v.checkTotal}
                  </span>
                </div>
                <div style={{ marginTop: "8px" } as CSSProperties}>
                  {v.checks.length === 0 && <div className="help">The store checklist is created with the school.</div>}
                  {v.checks.map((c: any, $i: number) => (
                    <Fragment key={$i}>
                      <button className="ck" onClick={c.flip} disabled={!v.canWrite} aria-label={`${c.n}: ${c.state}. Press to change.`}>
                        <i className={c.cls}>
                          {c.cls === "d" && (
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path className="i" d="M5 12.5l4.5 4.5L19 7.5" style={{ strokeWidth: "3" } as CSSProperties}></path>
                            </svg>
                          )}
                          {c.cls === "w" && (
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path className="i" d="M12 7v5l3 2" style={{ strokeWidth: "2.6" } as CSSProperties}></path>
                            </svg>
                          )}
                        </i>
                        {c.n}
                      </button>
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </Shell>
  );
}
