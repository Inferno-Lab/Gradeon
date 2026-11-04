"""One-time edit of the converted timetable view: real data, working buttons, a day view and a list view."""
p = 'apps/admin/src/pages/timetable/timetable.view.tsx'
s = open(p, encoding='utf-8').read()


def rep(a, b, count=1):
    global s
    assert s.count(a) == count, (a[:80], s.count(a))
    s = s.replace(a, b)


s = s.replace('import { Import, Shell } from "@gradeon/web-ui";', 'import { Shell } from "@gradeon/web-ui";')
rep('''              Class 8 A · Term 1 · version 3, <span style={{ color: "var(--aD)", fontWeight: "800" } as CSSProperties}>draft</span>''',
    '''              Class {v.className} · {v.term} · version {v.version},{" "}
              <span style={{ color: v.isDraft ? "var(--aD)" : "var(--gD)", fontWeight: "800" } as CSSProperties}>{v.isDraft ? "draft" : "published"}</span>''')
rep('<button aria-label="Previous week">', '<button aria-label="Previous week" onClick={v.prevWeek}>')
rep('<button aria-label="Next week">', '<button aria-label="Next week" onClick={v.nextWeek}>')
rep('12 – 16 Oct 2026 · W42', '{v.weekLabel}')
rep('<span className="chip v">2 unsaved changes</span>', '{v.draftChanges > 0 && <span className="chip v">{v.draftChanges} unpublished {v.draftChanges === 1 ? "change" : "changes"}</span>}')
a = s.index('<span className="lgd"')
b = s.index('</span>', s.index('Social', a)) + len('</span>')
b = s.index('</span>', b - 1) + len('</span>') if False else b
# legend: replace the five fixed chips with the school's subjects
end = s.index('</span>\n          </span>', a) + len('</span>\n          </span>') if '</span>\n          </span>' in s[a:] else None
chunk_end = s.index('Social', a)
chunk_end = s.index('</span>\n          </span>', chunk_end) + len('</span>\n          </span>')
s = s[:a] + '''<span className="lgd" style={{ display: "flex", gap: "10px", flexWrap: "wrap" } as CSSProperties}>
            {v.legend.map((l: any, $i: number) => (
              <span key={$i} className={`chip ${l.k}`}>{l.n}</span>
            ))}
          </span>''' + s[chunk_end:]
rep('<section className="tg rise" style={{ "--d": ".1s" } as CSSProperties} aria-label="Week grid">', '<section className="tg rise" style={{ "--d": ".1s", ...v.tgStyle } as CSSProperties} aria-label="Week grid">')
rep('<b>Clash with 8 B.</b> Kavita Iyer is also teaching 8 B at this time. Pick a fix; nothing changes until you publish.', '<b>Clash with {v.sel.other}.</b> {v.sel.t} is also teaching {v.sel.other} at this time. Pick a fix; nothing changes until you publish.')
rep('<b>Clash fixed.</b> Rahul Verma covers this period. Both classes are clear.', '<b>Clash fixed.</b> {v.sel.t} covers this period. Both classes are clear.')
rep('''                    <button className="btn v sm" onClick={v.fix}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path className="i" d="M13 3 5 13h6l-1 8 8-10h-6z"></path>
                      </svg>
                      Ask Rahul to cover
                    </button>
                    <button className="btn sm">Swap with Wed P6</button>''', '''                    {v.sel.suggest && (
                      <button className="btn v sm" onClick={v.fix}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path className="i" d="M13 3 5 13h6l-1 8 8-10h-6z"></path>
                        </svg>
                        Ask {v.sel.suggest} to cover
                      </button>
                    )}
                    <button className="btn sm" onClick={v.change}>Choose someone else</button>''')
rep('''                    <button className="btn sm">Change teacher</button>
                    <button className="btn sm">Swap</button>
                    <button className="btn sm ghost">Remove</button>''', '''                    {v.canEdit && <button className="btn sm" onClick={v.change}>Change teacher</button>}''')
rep('<span className="chip">40 min</span>', '<span className="chip">{v.sel.len}</span>')
rep('Kavita Iyer, periods', '{v.loadName}, periods')
rep('/ 30\n', '/ {v.loadMax}\n') if '/ 30\n' in s else rep('{" "}\n                      / 30', '{" "}\n                      / {v.loadMax}')
a = s.index('<span className="chip a">2</span>')
b = s.index('</section>', a)
s = s[:a] + '''{v.unplaced.length > 0 && <span className="chip a">{v.unplaced.length}</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" } as CSSProperties}>
                {v.unplaced.length === 0 && <div className="help">Every period this class needs has a place.</div>}
                {v.unplaced.map((u: any, $i: number) => (
                  <div className="un" key={$i}>
                    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" style={{ color: "var(--ink3)" } as CSSProperties}>
                      <path className="i" d="M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01" style={{ strokeWidth: "3" } as CSSProperties}></path>
                    </svg>
                    {u.n} · {u.missing} {u.missing === 1 ? "period" : "periods"}
                  </div>
                ))}
              </div>
            ''' + s[b:]
rep('<div className="ch">\n                <h2 id="unp"', '<div className="ch">\n                <h2 id="unp"')
# list view
rep('{v.rows.map((r: any, $i: number) => (\n              <Fragment key={$i}>\n                <div className="trow">', '{v.mode !== "list" && v.rows.map((r: any, $i: number) => (\n              <Fragment key={$i}>\n                <div className="trow">')
rep('          </section>\n          <aside className="side">', '''            {v.mode === "list" && (
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
          <aside className="side">''')
open(p, 'w', encoding='utf-8').write(s)
