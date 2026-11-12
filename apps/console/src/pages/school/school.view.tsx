/* eslint-disable */
// Markup from design/canvas/ConsoleSchool.dc.html: classes and structure are the design's. Values come from SchoolPage.
import { Fragment, type CSSProperties } from "react";
import { MenuButton, PageScope, Presence, Select, ToastSlot, Segmented, markStyle, Icon } from "@gradeon/web-ui";
import "./school.css";

export function SchoolView({ v }: { v: any }) {
  return (
    <PageScope
      page="school"
      className={`${v.shk ?? ""}`}
      overlays={
        <>
          
          {v.sup && (
            <>
              <div className="glow" aria-hidden="true"></div>
              <div className="sbar" role="status">
                <Icon name="shield" size={16} />
                Inside {v.shortName} · read-only<span className="c num">{v.clock} left</span>
                <button onClick={v.endSup}>End session</button>
              </div>
            </>
          )}
          <Presence>{v.dialog}</Presence>
          <ToastSlot toast={v.toast} />
        </>
      }
    >
      <main className="mn">
        <div className="crumb rise">
          <a href={v.fleetHref} onClick={v.toFleet}>
            Fleet
          </a>
          <Icon name="caretRight" size={14} />
          <b style={{ color: "var(--ink)" } as CSSProperties}>{v.name}</b>
        </div>
        <header className="hd rise" style={{ "--d": ".05s", gap: "16px", flexWrap: "wrap" } as CSSProperties}>
          <span className="slogo" style={{ ...markStyle(v.color) } as CSSProperties}>
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
              <Icon name="shield" />
              Support session
            </button>
          )}
          {v.menuItems.length > 0 && (
            <MenuButton label="More" chevron open={v.menu} onOpenChange={v.setMenu} menuLabel="School actions">
              {v.menuItems.map((m: any) => (
                <button key={m.label} role="menuitem" onClick={() => { v.setMenu(false); m.run(); }}>
                  {m.label}
                </button>
              ))}
            </MenuButton>
          )}
        </header>
        <Segmented label="School" className="rise" value={v.tab} onChange={v.pickTab} options={v.tabs.map((t: any) => ({ value: t.key, label: t.n }))} style={{ "--d": ".1s", alignSelf: "flex-start", maxWidth: "100%", overflowX: "auto" } as CSSProperties} />
        {v.tab !== "overview" && v.extra}
        {v.tab === "overview" && (
          <section className="grid" data-even="">
            {v.golive}
            <div className="card s7 rise" style={{ "--d": ".15s" } as CSSProperties} aria-labelledby="prov">
              <div className="ch">
                <h2 id="prov">{v.provTitle}</h2>
                {v.folded && (
                  <button className="btn sm" onClick={v.showSteps}>
                    Show the steps
                  </button>
                )}
                {!v.folded && v.hideSteps && (
                  <button className="btn sm" onClick={v.hideSteps}>
                    Fold
                  </button>
                )}
                {v.canRetry && (
                  <button className="btn pri sm" onClick={v.retry} disabled={v.busy}>
                    <Icon name="undo" />
                    Retry step {v.failedNo}
                  </button>
                )}
                {v.canSkip && (
                  <button className="btn sm" onClick={v.skip} disabled={v.busy}>
                    Skip this step
                  </button>
                )}
              </div>
              {v.folded && <div className="help" style={{ marginTop: "12px" } as CSSProperties}>{v.setupLine}. Every step finished.</div>}
              {!v.folded && v.steps.length === 0 && <div className="help" style={{ marginTop: "12px" } as CSSProperties}>No setup run has been recorded for this school.</div>}
              {!v.folded && (
              <>
              <div className="steps">
                {v.steps.map((s: any, $i: number) => (
                  <Fragment key={$i}>
                    <div className={`stp ${s.cls ?? ""}`}>
                      <span className="dot">
                        {s.ok && (
                          <Icon name="check" size={16} />
                        )}
                        {s.bad && (
                          <Icon name="close" size={16} />
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
              </>
              )}
            </div>
            <div className="s5" style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: "0" } as CSSProperties}>
              <div className="tkt rise" style={{ "--d": ".2s" } as CSSProperties}>
                <div className="l">
                  <div className="fd" style={{ fontSize: "22px", letterSpacing: "-.03em" } as CSSProperties}>
                    Gradeon {v.planName}
                  </div>
                  {v.invoiceLine && (
                  <div className="tl2">
                    <Icon name="card" />
                    {v.invoiceLine}
                  </div>
                  )}
                  <div className="tl2">
                    <Icon name="fees" />
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
                <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "16px" } as CSSProperties}>
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
                  {v.checks.map((c: any) => (
                    <div key={c.key} className="ck" style={{ cursor: "default", alignItems: "center", flexWrap: "wrap" } as CSSProperties}>
                      <i className={c.cls}>
                        {c.cls === "d" && (
                          <Icon name="check" />
                        )}
                        {c.cls === "w" && (
                          <Icon name="time" />
                        )}
                      </i>
                      <span style={{ flex: "1 1 160px", minWidth: 0 } as CSSProperties}>
                        {c.n}
                        {c.who && <small style={{ display: "block", color: "var(--ink3)", font: "600 12px var(--fb)" } as CSSProperties}>{c.who}</small>}
                      </span>
                      <Select compact aria-label={c.n} value={c.state} onChange={c.set} disabled={!v.canWrite} options={v.checkOptions} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </PageScope>
  );
}
