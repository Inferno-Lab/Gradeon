/* eslint-disable */
// Markup converted from design/canvas/AdminSettings.dc.html. Keep the markup and class names as designed.
import { Fragment, type CSSProperties } from "react";
import { Select, Shell } from "@gradeon/web-ui";
import "./settings.css";

export function SettingsView({ v }: { v: any }) {
  return (
    <Shell
      page="settings"
      theme={v.themeCls}
      aside={v.aside}
      overlays={
        <>
          {v.palette}
          {v.askDialog}
          {v.toast && (
            <>
              <div className="toast toast" role="status">
                <span
                  style={
                    { width: "30px", height: "30px", borderRadius: "50%", background: "var(--g)", display: "grid", placeItems: "center", flex: "none" } as CSSProperties
                  }
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <path className="i" d="M5 12.5l4.5 4.5L19 7.5" style={{ stroke: "#fff", strokeWidth: "2.6" } as CSSProperties}></path>
                  </svg>
                </span>
                {v.toastText}
              </div>
            </>
          )}
        </>
      }
    >
      <main className={`mn ${v.shk}`}>
        <header className="hd rise">
          <div>
            <h1>School setup</h1>
            <p>How Gradeon has set up {v.shortName} for staff, families and students.</p>
          </div>
          <span className="grow"></span>
          <button className="btn v" onClick={v.ask}>
            Ask Gradeon to change this
          </button>
        </header>
        {v.err._ && (
          <div className="emsg" role="alert" style={{ marginBottom: "16px" } as CSSProperties}>
            {v.err._}
          </div>
        )}
        <div className="cols">
          <nav className="snav rise" style={{ "--d": ".05s" } as CSSProperties} aria-label="Settings sections">
            {v.tabs.map((t: any, $i: number) => (
              <Fragment key={$i}>
                <button className={`sn ${t.on ?? ""}`} onClick={t.pick} aria-current={t.cur}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path className="i" d={t.d}></path>
                  </svg>
                  {t.n}
                  {t.nw && (
                    <>
                      <span className="nw">NEW</span>
                    </>
                  )}
                </button>
              </Fragment>
            ))}
          </nav>
          <div className="set">
            {v.tab === 0 && (
              <>
            <section className="rise" style={{ "--d": ".1s" } as CSSProperties}>
              <h2 className="sec">
                General<small>The name and look families see in the app.</small>
              </h2>
              <div className="grp" style={{ marginTop: "16px" } as CSSProperties}>
                <div className="rw2">
                  <div>
                    <b>Name and logo</b>
                    <small>Shown in the app, on receipts and on report cards.</small>
                  </div>
                  <div style={{ display: "flex", gap: "18px", alignItems: "center" } as CSSProperties}>
                    <span className="logo" style={{ background: v.brandC } as CSSProperties}>
                      {v.logoText}
                    </span>
                    <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "10px" } as CSSProperties}>
                      <label className={`in2 ${v.err.name ? "err shake" : ""}`}>
                        <input value={v.name} onChange={v.onName} readOnly={v.roName} aria-label="School name" aria-invalid={!!v.err.name} />
                      </label>
                      {v.err.name && <div className="emsg" role="alert">{v.err.name}</div>}
                      <label className="in2" style={{ maxWidth: "120px" } as CSSProperties}>
                        <input value={v.logoText} onChange={v.onLogo} readOnly={v.roLogo} maxLength={2} aria-label="Logo letters" />
                      </label>
                    </div>
                  </div>
                </div>
                <div className="rw2">
                  <div>
                    <b>Brand colour</b>
                    <small>Used for the app’s header and buttons. Contrast is checked for you.</small>
                  </div>
                  <div style={{ display: "flex", gap: "22px", flexWrap: "wrap", alignItems: "center" } as CSSProperties}>
                    <div style={{ flex: "1", minWidth: "200px", display: "flex", flexDirection: "column", gap: "14px" } as CSSProperties}>
                      <div className="sw5" role="radiogroup" aria-label="Brand colour">
                        {v.swatches.map((w: any, $i: number) => (
                          <Fragment key={$i}>
                            <button
                              className={w.on}
                              role="radio"
                              aria-checked={w.sel}
                              aria-label={w.n}
                              disabled={w.locked}
                              style={{ background: w.c, "--c2": w.c } as CSSProperties}
                              onClick={w.pick}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path className="i" d="M5 12.5l4.5 4.5L19 7.5" style={{ strokeWidth: "3" } as CSSProperties}></path>
                              </svg>
                            </button>
                          </Fragment>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" } as CSSProperties}>
                        <span className={`chip ${v.aa ? "g" : "r"}`}>
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path className="i" d={v.aa ? "M5 12.5l4.5 4.5L19 7.5" : "M6 6l12 12M18 6L6 18"} style={{ strokeWidth: "2.6" } as CSSProperties}></path>
                          </svg>
                          {v.aa ? "Passes AA" : "Too light for white text"} · {v.ratio}:1
                        </span>
                        <span className="chip">{v.brandN}</span>
                      </div>
                    </div>
                    <div className="pv" aria-label="App preview">
                      <div className="tb" style={{ background: v.brandC } as CSSProperties}>
                        <span
                          style={
                            {
                              width: "24px",
                              height: "24px",
                              borderRadius: "8px",
                              background: "rgba(255,255,255,.28)",
                              display: "grid",
                              placeItems: "center",
                              font: "800 12px var(--fd)",
                            } as CSSProperties
                          }
                        >
                          {v.logoText}
                        </span>
                        {v.shortName}
                      </div>
                      <div className="bd">
                        <i style={{ width: "70%" } as CSSProperties}></i>
                        <i style={{ width: "46%" } as CSSProperties}></i>
                        <b style={{ background: v.brandC } as CSSProperties}>Pay fees</b>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="rw2">
                  <div>
                    <b>Public address</b>
                    <small>Families and staff sign in here. To change it, ask Gradeon.</small>
                  </div>
                  <div className="in2">
                    <input value={v.address} readOnly aria-label="Address" />
                    <button className={`copy ${v.copiedAddr ?? ""}`} onClick={v.copyAddress}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path className="i" d={v.copiedAddr ? "M5 12.5l4.5 4.5L19 7.5" : "M9 9h10v10H9zM5 15V5h10"}></path>
                      </svg>
                      {v.copiedAddr ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
                <div className="rw2">
                  <div>
                    <b>School code</b>
                    <small>Families type this in the app to find {v.shortName}.</small>
                  </div>
                  <div className="in2">
                    <input value={v.schoolCode} readOnly aria-label="School code" style={{ fontFamily: "var(--fb)", letterSpacing: ".04em" } as CSSProperties} />
                    <button className={`copy ${v.copied ?? ""}`} onClick={v.copy}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path className="i" d={v.copyIc}></path>
                      </svg>
                      {v.copyLabel}
                    </button>
                  </div>
                </div>
                <div className="rw2">
                  <div>
                    <b>About the school</b>
                    <small>One or two lines for the app’s school page.</small>
                  </div>
                  <div>
                    <label className="in2" style={{ height: "auto" } as CSSProperties}>
                      <textarea onChange={v.onAbout} value={v.about} aria-label="About the school" maxLength={v.aboutMax} readOnly={v.roAbout}></textarea>
                    </label>
                    <div className="cnt num">{v.aboutLen} / {v.aboutMax}</div>
                  </div>
                </div>
              </div>
            </section>
            <section className="rise" style={{ "--d": ".15s" } as CSSProperties}>
              <h2 className="sec">
                Preferences<small>Rules that apply to everyone at {v.shortName}.</small>
              </h2>
              <div className="grp" style={{ marginTop: "16px" } as CSSProperties}>
                {v.toggles.map((t: any, $i: number) => (
                  <Fragment key={$i}>
                    <div className="tgl">
                      <div>
                        <b>{t.n}</b>
                        <small>{t.d}</small>
                      </div>
                      <button className={`sw ${t.on ?? ""}`} role="switch" aria-checked={t.sel} aria-label={t.n} disabled={t.locked} onClick={t.flip}></button>
                    </div>
                  </Fragment>
                ))}
                <div className="tgl">
                  <div>
                    <b>Who approves fee waivers</b>
                    <small>Waiving or reducing a fee needs this person to say yes.</small>
                  </div>
                  <Select compact disabled={!!v.apLocked} style={{ minWidth: 228 }} aria-label="Who approves fee waivers" value={String(Math.max(0, v.aps.findIndex((a: any) => a.on)))} onChange={(i) => v.aps[Number(i)]?.pick()} options={v.aps.map((a: any, i: number) => ({ value: String(i), label: a.n }))} />
                </div>
              </div>
            </section>
            <section className="rise" style={{ "--d": ".2s" } as CSSProperties}>
              <h2 className="sec">
                Plan and usage<small>Billed yearly to the school.</small>
              </h2>
              <div className="billing" style={{ marginTop: "16px" } as CSSProperties}>
                <div className="tkt">
                  <div className="l">
                    <div className="fd" style={{ fontSize: "23px", letterSpacing: "-.03em" } as CSSProperties}>
                      Gradeon {v.plan.name}
                    </div>
                    <div className="tl2">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path className="i" d="M3.5 6.5h17v13h-17zM3.5 10.5h17"></path>
                      </svg>
                      {v.plan.next}
                    </div>
                    <div className="tl2">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path className="i" d="M4 4v6h6M5.5 15a7 7 0 1 0 1-8.5L4 9"></path>
                      </svg>
                      Renews yearly
                    </div>
                    <a className="btn sm wht" href="mailto:billing@gradeon.app?subject=Billing" style={{ alignSelf: "flex-start" } as CSSProperties}>
                      Manage billing
                    </a>
                  </div>
                  <div className="r">
                    <span className="chip a" style={{ alignSelf: "flex-start" } as CSSProperties}>
                      {v.plan.status}
                    </span>
                    <span>{v.plan.students} students</span>
                    <span>{v.plan.staff} staff</span>
                  </div>
                </div>
                <div className="cred">
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", font: "700 13px var(--fb)", color: "#CFC9E6" } as CSSProperties}>
                    <i style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--g)" } as CSSProperties}></i>SMS credits
                  </div>
                  <div className="fd" style={{ fontSize: "38px", letterSpacing: "-.04em", lineHeight: "1" } as CSSProperties}>
                    {v.plan.smsLeft} <span style={{ font: "700 14px var(--fb)", opacity: ".6", letterSpacing: "0" } as CSSProperties}>left</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", font: "700 12px var(--fb)", color: "#CFC9E6" } as CSSProperties}>
                    <span>Used this month</span>
                    <span className="num">{v.used}%</span>
                  </div>
                  <div className="tk3" aria-hidden="true">
                    {v.ticks.map((t: any, $i: number) => (
                      <Fragment key={$i}>
                        <i className={t.c}></i>
                      </Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </section>
              </>
            )}
            {v.extra}
          </div>
        </div>
      </main>
    </Shell>
  );
}
