/* eslint-disable */
// Markup from design/canvas/AdminPhone.dc.html: classes and structure are the design's. The mascot and pencil columns are replaced
// by an object illustration and filled bars. Values come from PhoneDashboard.
import { Fragment, type CSSProperties } from "react";
import { Illustration, PageScope, ToastSlot } from "@gradeon/web-ui";
import "./phone.css";

export function PhoneView({ v }: { v: any }) {
  return (
    <PageScope page="phone" overlays={<ToastSlot toast={v.toast} />}>
      <div className="ph">
        <div className="top">
          <span className="lg" style={{ width: "44px", height: "44px", fontSize: "22px" } as CSSProperties}>
            {v.logo}
          </span>
          <div style={{ flex: "1", minWidth: "0" } as CSSProperties}>
            <small>{v.dayLine}</small>
            <h1>{v.greeting}</h1>
          </div>
          <button className="mini bell" aria-label={v.pending ? `${v.pending} things need you` : "Notifications"} onClick={v.openSearch}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path className="i" d="M12 4a6 6 0 0 0-6 6c0 5-2 6-2 6h16s-2-1-2-6a6 6 0 0 0-6-6M10 20a2 2 0 0 0 4 0"></path>
            </svg>
            {v.pending > 0 && <i></i>}
          </button>
        </div>
        <div className="sc">
          <div className="two">
            {v.has.attendance && (
            <div className="bt a" style={{ "--d": ".02s" } as CSSProperties}>
              <small>Present today</small>
              <div className="n num">
                {v.present}
                <span style={{ fontSize: "22px", opacity: ".6" } as CSSProperties}>/{v.total}</span>
              </div>
            </div>
            )}
            {v.has.fees && (
            <div className="bt v" style={{ "--d": ".06s" } as CSSProperties}>
              <small>Fees in {v.feeMonth}</small>
              <div className="n num">{v.fees}</div>
            </div>
            )}
          </div>
          <div className="bt w" style={{ "--d": ".1s", display: "flex", alignItems: "center", gap: "12px", padding: "16px 20px" } as CSSProperties}>
            <div style={{ width: "90px", flex: "none" } as CSSProperties}>
              <Illustration scene="calendar" />
            </div>
            <div>
              <b className="fd" style={{ fontSize: "17px", letterSpacing: "-.02em" } as CSSProperties}>
                {v.headline}
              </b>
              <p style={{ margin: "4px 0 0", font: "500 13px/1.45 var(--fb)", color: "var(--ink2)" } as CSSProperties}>{v.subline}</p>
            </div>
          </div>
          <div className="bt w" style={{ "--d": ".14s" } as CSSProperties}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: "4px" } as CSSProperties}>
              <b className="fd" style={{ fontSize: "17px", letterSpacing: "-.02em" } as CSSProperties}>
                Needs you
              </b>
              <span className="chip a" style={{ marginLeft: "auto" } as CSSProperties}>
                {v.left} left
              </span>
            </div>
            {v.items.map((it: any) => (
              <Fragment key={it.id}>
                <div className={`ap ${it.cls ?? ""}`}>
                  <span className="av" style={{ background: it.bg, color: it.fg } as CSSProperties}>
                    {it.i}
                  </span>
                  <div style={{ flex: "1", minWidth: "0" } as CSSProperties}>
                    <b>{it.t}</b>
                    <small>{it.s}</small>
                  </div>
                  <button className="btn" style={{ height: "40px", padding: "0 16px" } as CSSProperties} onClick={it.go}>
                    {it.l}
                  </button>
                </div>
              </Fragment>
            ))}
            {v.clear && (
              <div style={{ textAlign: "center", padding: "8px 0" } as CSSProperties}>
                <div style={{ width: "120px", margin: "0 auto" } as CSSProperties}>
                  <Illustration scene="checklist" />
                </div>
                <b className="fd" style={{ fontSize: "17px" } as CSSProperties}>
                  All caught up
                </b>
              </div>
            )}
          </div>
          {v.has.fees && (
          <div className="bt k" style={{ "--d": ".18s" } as CSSProperties}>
            <small>{v.barsTitle}</small>
            {v.barsEmpty ? (
              <p style={{ margin: "12px 0 0", font: "500 13px/1.45 var(--fb)", opacity: ".75" } as CSSProperties}>Payments show up here as fees are collected.</p>
            ) : (
              <div className="bars" role="img" aria-label={v.barsAlt}>
                {v.bars.map((h: any, $i: number) => (
                  <Fragment key={$i}>
                    <span>
                      <i style={{ height: `${h.h ?? ""}%`, background: h.c } as CSSProperties}></i>
                      <em>{h.n}</em>
                    </span>
                  </Fragment>
                ))}
              </div>
            )}
          </div>
          )}
        </div>
      </div>
    </PageScope>
  );
}
