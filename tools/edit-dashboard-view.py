"""One-time edit of the converted dashboard view: dynamic text, the new charts, and the object illustrations.
Run once after tools/convert-all.sh; afterwards the view is maintained by hand."""
import re

p = 'apps/admin/src/pages/dashboard/dashboard.view.tsx'
s = open(p, encoding='utf-8').read()


def rep(a, b, count=1):
    global s
    assert s.count(a) == count, (a[:70], s.count(a))
    s = s.replace(a, b)


s, n = re.subn(r'<span className="roll">\s*\{v\.(\w+)\.map\(.*?\)\)\}\s*</span>', r'<Roll digits={v.\1} />', s, flags=re.S)
print('rolls', n)
s = s.replace('import { Import, Shell } from "@gradeon/web-ui";', 'import { Illustration, Roll, Shell } from "@gradeon/web-ui";')

a = s.index('<div className="pcols">')
b = s.index('<div className="tile t-p s4')
s = s[:a] + '''<div className="pcols">
                {v.cols.map((p: any, $i: number) => (
                  <Fragment key={$i}>
                    <div className={`col2 ${p.today ?? ""}`} onMouseEnter={p.hover} onFocus={p.hover} tabIndex={0} aria-label={`${p.full}: ${p.v}`}>
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
              <div className="plab">
                {v.cols.map((p: any, $i: number) => (
                  <Fragment key={$i}>
                    <span className={p.today}>{p.n}</span>
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
          ''' + s[b:]

a = s.index('<div className="rolls">')
b = s.index('<div className="card s6 rise" style={{ "--d": ".4s" }')
s = s[:a] + '''<div className="rolls">
              {v.rolls.map((r: any, $i: number) => (
                <Fragment key={$i}>
                  <div className="rr">
                    <b>{r.n}</b>
                    <div className="sg" role="img" aria-label={r.aria}>
                      {r.segs.map((g: any, $j: number) => (
                        <i key={$j} className={g.k} style={{ flex: g.n } as CSSProperties}></i>
                      ))}
                    </div>
                    <em>{r.pct}</em>
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
          ''' + s[b:]

a = s.index('<div className="jars">')
b = s.index('<section className="grid">', a)
s = s[:a] + '''<div className="fbars">
              {v.heads.map((h: any, $i: number) => (
                <Fragment key={$i}>
                  <div className="fbar">
                    <div className="trk" role="img" aria-label={`${h.n}: ${h.pct} percent collected`}>
                      <i className="fill" style={{ height: `${h.fill}%`, background: h.c } as CSSProperties}>
                        {h.pct >= 24 && <em>{h.pct}%</em>}
                      </i>
                      {h.pct < 24 && <em className="out" style={{ bottom: `calc(${h.fill}% + 8px)` } as CSSProperties}>{h.pct}%</em>}
                    </div>
                    <b>{h.n}</b>
                    <span>{h.amt}</span>
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
        </section>
        ''' + s[b:]

rep('<h2 id="jars">Fee jars · October</h2>', '<h2 id="jars">Fees by type · {v.feeMonth}</h2>')
rep('<span className="chip g">62% filled</span>', '<span className="chip g">{v.feePct}% collected</span>')
rep('<i style={{ background: "transparent", boxShadow: "inset 0 0 0 1.6px var(--ink3)" } as CSSProperties}></i>Absent', '<i style={{ background: "var(--c)" } as CSSProperties}></i>Absent')
rep('<p>Term 1 · 38 of 42 classes have marked attendance</p>', '<p>{v.subtitle}</p>')
rep('<div className="avl">NM</div>', '<div className="avl" style={{ background: v.me.bg, color: v.me.fg } as CSSProperties}>{v.me.initials}</div>')
rep('<div style={{ marginTop: "14px", font: "600 14px var(--fb)", color: "var(--ink2)" } as CSSProperties}>Good morning,</div>', '<div style={{ marginTop: "14px", font: "600 14px var(--fb)", color: "var(--ink2)" } as CSSProperties}>{v.greeting},</div>')
rep('              Neha Menon\n            </div>', '              {v.me.name}\n            </div>')
rep('Principal · Greenfield International', '{v.me.role} · {v.schoolName}')
rep('<button aria-label="Messages">', '<button aria-label="Messages" onClick={() => v.goto("/p/messages")}>')
rep('<button aria-label="Find">', '<button aria-label="Find" onClick={v.openSearch}>')
rep('<button aria-label="Saved">', '<button aria-label="Saved" onClick={() => v.goto("/p/saved")}>')
rep('<div className="nst">\n              <Import name="Nesti" scene="wave" />\n            </div>', '<div className="nst">\n              <Illustration scene="calendar" />\n            </div>')
rep('<button className="arrow" aria-label="Open attendance">', '<button className="arrow" aria-label="Open students" onClick={() => v.goto("/students")}>')
rep('Wed 14 Oct · {v.clock}', '{v.dayLine}')
rep('<small>/ 1,498</small>', '<small>/ {v.totalStudents}</small>')
rep('''              <span className="tr up">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path className="i" d="M7 17L17 7M9 7h8v8" style={{ strokeWidth: "2.4" } as CSSProperties}></path>
                </svg>
                2.1%
              </span>
              vs last Tuesday''', '''              <span className={`tr ${v.presentTrend.cls}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path className="i" d={v.presentTrend.icon} style={{ strokeWidth: "2.4" } as CSSProperties}></path>
                </svg>
                {v.presentTrend.text}
              </span>
              {v.presentVersus}''')
rep('<button className="arrow" aria-label="Open fees">', '<button className="arrow" aria-label="Open fees" onClick={() => v.goto("/p/fees")}>')
rep('Collected in October', 'Collected in {v.feeMonth}')
rep('62% of ₹29,70,000 due', '{v.feePct}% of ₹{v.feeDue} due')
rep('<button className="arrow" aria-label="Open approvals">', '<button className="arrow" aria-label="Open approvals" onClick={() => v.goto("/p/approvals")}>')
rep('''              <span className="tr up" style={{ background: "rgba(255,255,255,.2)", color: "#fff" } as CSSProperties}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path className="i" d="M7 17L17 7M9 7h8v8" style={{ strokeWidth: "2.4" } as CSSProperties}></path>
                </svg>
                8.7%
              </span>
              37 families overdue''', '''              <span className={`tr ${v.feeTrend.cls}`} style={{ background: "rgba(255,255,255,.2)", color: "#fff" } as CSSProperties}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path className="i" d={v.feeTrend.icon} style={{ strokeWidth: "2.4" } as CSSProperties}></path>
                </svg>
                {v.feeTrend.text}
              </span>
              {v.overdueLine}''')
a = s.index('<span className="av" style={{ background: "#E3EAFE", color: "#2449C8", boxShadow: "0 0 0 2.5px var(--ci)" } as CSSProperties}>')
b = s.index('and 2 more</span>', a) + len('and 2 more</span>')
s = s[:a] + '''{v.avatars.map((a: any, $i: number) => (
                <span key={$i} className="av" style={{ background: a.bg, color: a.fg, marginLeft: $i ? "-10px" : undefined, boxShadow: "0 0 0 2.5px var(--ci)" } as CSSProperties}>
                  {a.initials}
                </span>
              ))}
              {v.moreAvatars > 0 && <span style={{ marginLeft: "10px", font: "700 12.5px var(--fb)", opacity: ".7" } as CSSProperties}>and {v.moreAvatars} more</span>}''' + s[b:]
rep('<Import name="Nesti" scene="party" />', '<Illustration scene="checklist" />')
rep('<span className="help">Nesti is celebrating for you.</span>', '<span className="help">Nothing is waiting for you.</span>')
rep('Leave, concessions, notices', 'Leave, concessions, notices')
rep('<button className="addw s3 rise" style={{ "--d": ".5s" } as CSSProperties} aria-label="Add a widget">', '<button className="addw s3 rise" style={{ "--d": ".5s" } as CSSProperties} aria-label="Add a widget" onClick={() => v.goto("/p/widgets")}>')
rep('<button className="ibtn" aria-label="Notifications">', '<button className="ibtn" aria-label="Notifications" onClick={() => v.goto("/p/notifications")}>')
rep('<span className="pip"></span>', '{v.hasAlerts && <span className="pip"></span>}')
open(p, 'w', encoding='utf-8').write(s)
