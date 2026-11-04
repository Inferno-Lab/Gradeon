"""One-time edit of the converted students view: real data, working controls, the object illustration."""
import re

p = 'apps/admin/src/pages/students/students.view.tsx'
s = open(p, encoding='utf-8').read()


def rep(a, b, count=1):
    global s
    assert s.count(a) == count, (a[:80], s.count(a))
    s = s.replace(a, b)


s = s.replace('import { Import, Shell } from "@gradeon/web-ui";', 'import { Illustration, Roll, Shell } from "@gradeon/web-ui";')
rep('<p>1,498 enrolled in 2026–27 across 42 sections</p>', '<p>{v.subtitle}</p>')
rep('<button className="btn">\n            <svg viewBox="0 0 24 24" aria-hidden="true">\n              <path className="i" d="M12 20V9M7 14l5-5 5 5M5 4h14"></path>', '<button className="btn" onClick={v.openImport}>\n            <svg viewBox="0 0 24 24" aria-hidden="true">\n              <path className="i" d="M12 20V9M7 14l5-5 5 5M5 4h14"></path>')
rep('<button className="btn">\n            <svg viewBox="0 0 24 24" aria-hidden="true">\n              <path className="i" d="M12 4v11M7 10l5 5 5-5M5 20h14"></path>', '<button className="btn" onClick={v.exportAll}>\n            <svg viewBox="0 0 24 24" aria-hidden="true">\n              <path className="i" d="M12 4v11M7 10l5 5 5-5M5 20h14"></path>')
rep('<button className="btn pri">\n            <svg viewBox="0 0 24 24" aria-hidden="true">\n              <path className="i" d="M12 5v14M5 12h14"></path>\n            </svg>\n            Add student', '<button className="btn pri" onClick={v.openAdd}>\n            <svg viewBox="0 0 24 24" aria-hidden="true">\n              <path className="i" d="M12 5v14M5 12h14"></path>\n            </svg>\n            Add student')

# filter pills
a = s.index('<button className="fp on">')
b = s.index('</div>', s.index('Add filter', a))
s = s[:a] + '{v.pills}\n        ' + s[b:]

# summary strip
a = s.index('<section className="strip4')
b = s.index('</section>', a) + len('</section>')
s = s[:a] + '''<section className="strip4 rise" style={{ "--d": ".1s" } as CSSProperties} aria-label="Summary">
          <div className="sm">
            <span className="l">Students in view</span>
            <div className="v">{v.sum.inView}</div>
            <div className="s">of {v.sum.total}</div>
          </div>
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
          <div className="sm">
            <span className="l">Fees overdue</span>
            <div className="v">
              ₹{v.sum.overdue}<em>.00</em>
            </div>
            <div className="s">
              <span className="tr dn">{v.sum.families}</span>this term
            </div>
          </div>
          <div className="sm">
            <span className="l">Average attendance</span>
            <div className="v">
              {v.sum.avg}<em>%</em>
            </div>
            <div className="s">
              <span className={`tr ${v.sum.deltaCls}`}>{v.sum.delta}</span>vs the 12 days before
            </div>
          </div>
        </section>''' + s[b:]

rep('<h2>Class 8 A</h2>', '<h2>{v.title}</h2>')
rep('<button className="btn sm">\n              <svg viewBox="0 0 24 24" aria-hidden="true">\n                <path className="i" d="M12 5v14M5 12h14"></path>\n              </svg>\n              Add entry', '<button className="btn sm" onClick={v.openAdd}>\n              <svg viewBox="0 0 24 24" aria-hidden="true">\n                <path className="i" d="M12 5v14M5 12h14"></path>\n              </svg>\n              Add student')
rep('<span className="cls">8A · {r.roll}</span>', '<span className="cls">{r.cls} · {r.roll}</span>')
rep('<button className="kebab" aria-label={`More for ${r.n ?? ""}`}>', '<button className="kebab" aria-label={`Open ${r.n ?? ""}`}>')
rep('<span>Showing {v.shown} of 36</span>', '<span>Showing {v.range}</span>')
rep('<button className="btn sm">Previous</button>', '<button className="btn sm" disabled={v.page <= 1} onClick={v.prev}>Previous</button>')
rep('<button className="btn sm">Next</button>', '<button className="btn sm" disabled={!v.hasNext} onClick={v.next}>Next</button>')

# empty state
a = s.index('{v.noRows && (')
b = s.index('</section>', a)
s = s[:a] + '''{v.noRows && (
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
                  <button className="btn pri sm" onClick={v.empty.act}>{v.empty.actLabel}</button>
                  {v.empty.act2 && <button className="btn sm" onClick={v.empty.act2}>{v.empty.act2Label}</button>}
                </div>
              </div>
            </>
          )}
        ''' + s[b:]

# bulk bar
rep('<button className="bk">\n          <svg viewBox="0 0 24 24" aria-hidden="true">\n            <path className="i" d="M4 5h16v11H9l-5 4z"></path>', '<button className="bk" onClick={v.bulkMessage}>\n          <svg viewBox="0 0 24 24" aria-hidden="true">\n            <path className="i" d="M4 5h16v11H9l-5 4z"></path>')
rep('<button className="bk">\n          <svg viewBox="0 0 24 24" aria-hidden="true">\n            <path className="i" d="M3 8.5', '<button className="bk" onClick={v.bulkFee}>\n          <svg viewBox="0 0 24 24" aria-hidden="true">\n            <path className="i" d="M3 8.5')
rep('<button className="bk">\n          <svg viewBox="0 0 24 24" aria-hidden="true">\n            <path className="i" d="M12 4v11M7 10l5 5 5-5M5 20h14"></path>', '<button className="bk" onClick={v.bulkExport}>\n          <svg viewBox="0 0 24 24" aria-hidden="true">\n            <path className="i" d="M12 4v11M7 10l5 5 5-5M5 20h14"></path>')

# drawer
rep('Adm {v.d.adm} · Class 8 A · Roll {v.d.roll}', 'Adm {v.d.adm} · Class {v.d.cls} · Roll {v.d.roll}')
rep('<span className="chip c">{v.d.house} house</span>\n                <span className="chip b">Bus route 4</span>', '{v.d.house && <span className="chip c">{v.d.house} house</span>}\n                {v.d.route && <span className="chip b">Bus {v.d.route}</span>}')
rep('<b>A1 · 91%</b>', '<b>{v.d.exam}</b>')
rep('<span>Unit test 1</span>', '<span>{v.d.examName}</span>')
rep('<b>27 of 29</b>', '<b>{v.d.homework}</b>')
rep('<b>2</b>', '<b>{v.d.library}</b>')
rep('<h3>September · 24 school days</h3>', '<h3>{v.d.rollTitle}</h3>')
rep('aria-label="22 present, 1 late, 1 absent"', 'aria-label={v.d.rollAria}')
a = s.index('<h3>Activity</h3>')
b = s.index('</div>\n            </div>\n            <div style={{ display: "flex", gap: "10px", padding: "16px 26px 22px"', a)
s = s[:a] + '''<h3>Activity</h3>
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
              ''' + s[b:]
rep('<button className="btn pri" style={{ flex: "1" } as CSSProperties}>\n                Message guardians', '<button className="btn pri" style={{ flex: "1" } as CSSProperties} onClick={v.messageOne}>\n                Message guardians')
rep('<button className="btn">Collect fee</button>', '{v.canCollect && <button className="btn" onClick={v.collect}>Collect fee</button>}')
rep('{v.drOn && (', '{v.dialog}\n      {v.drOn && (')
open(p, 'w', encoding='utf-8').write(s)
