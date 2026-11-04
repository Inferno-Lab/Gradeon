"""One-time edit of the converted settings view: real values, working controls, and the other tabs."""
p = 'apps/admin/src/pages/settings/settings.view.tsx'
s = open(p, encoding='utf-8').read()


def rep(a, b, count=1):
    global s
    assert s.count(a) == count, (a[:80], s.count(a))
    s = s.replace(a, b)


s = s.replace('import { Import, Shell } from "@gradeon/web-ui";', 'import { Shell } from "@gradeon/web-ui";')
rep('<p>How Greenfield looks and behaves, for staff, families and students.</p>', '<p>How {v.shortName} looks and behaves, for staff, families and students.</p>')
rep('Saved. The app updates within a minute.', '{v.toastText}')
rep('<button className="btn v" disabled={v.clean} onClick={v.save}>', '<button className={`btn v ${v.shakeSave}`} disabled={v.clean} onClick={v.save}>')
rep('''                      G
                    </span>
                    <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "10px" } as CSSProperties}>
                      <label className="in2">
                        <input value={v.name} onChange={v.onName} aria-label="School name" />
                      </label>
                      <div style={{ display: "flex", gap: "8px" } as CSSProperties}>
                        <button className="btn sm">Upload logo</button>
                        <button className="btn sm ghost">Remove</button>
                      </div>
                    </div>''', '''                      {v.logoText}
                    </span>
                    <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "10px" } as CSSProperties}>
                      <label className={`in2 ${v.err.name ? "err shake" : ""}`}>
                        <input value={v.name} onChange={v.onName} aria-label="School name" aria-invalid={!!v.err.name} />
                      </label>
                      {v.err.name && <div className="emsg" role="alert">{v.err.name}</div>}
                      <label className="in2" style={{ maxWidth: "120px" } as CSSProperties}>
                        <input value={v.logoText} onChange={v.onLogo} maxLength={2} aria-label="Logo letters" />
                      </label>
                    </div>''')
rep('''                        <span
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
                          G
                        </span>
                        Greenfield''', '''                        <span
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
                        {v.shortName}''')
rep('''                    <small>Families and staff sign in here.</small>
                  </div>
                  <label className="in2">
                    <span className="pre">https://</span>
                    <input value={v.slug} onChange={v.onSlug} aria-label="Address" />
                    <span className="pre">.gradeon.app</span>
                  </label>''', '''                    <small>Families and staff sign in here. To change it, ask Gradeon.</small>
                  </div>
                  <div className="in2">
                    <input value={v.address} readOnly aria-label="Address" />
                    <button className={`copy ${v.copiedAddr ?? ""}`} onClick={v.copyAddress}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path className="i" d={v.copiedAddr ? "M5 12.5l4.5 4.5L19 7.5" : "M9 9h10v10H9zM5 15V5h10"}></path>
                      </svg>
                      {v.copiedAddr ? "Copied" : "Copy"}
                    </button>
                  </div>''')
rep('<small>Families type this in the app to find Greenfield.</small>', '<small>Families type this in the app to find {v.shortName}.</small>')
rep('<input value="GIS-PUNE-0412" readOnly={v.yes} aria-label="School code"', '<input value={v.schoolCode} readOnly aria-label="School code"')
rep('<textarea onChange={v.onAbout} value={v.about} aria-label="About the school" maxLength={240}></textarea>', '<textarea onChange={v.onAbout} value={v.about} aria-label="About the school" maxLength={240}></textarea>')
rep('<small>Rules that apply to everyone at Greenfield.</small>', '<small>Rules that apply to everyone at {v.shortName}.</small>')
rep('<div className="tgl">\n                  <div>\n                    <b>Who approves notices</b>', '<div className="tgl">\n                  <div>\n                    <b>Who approves notices</b>')
rep('''                      Gradeon Complete
                    </div>''', '''                      Gradeon {v.plan.name}
                    </div>''')
rep('Next invoice, 1 Nov 2026', '{v.plan.next}')
rep('''                    <button className="btn sm wht" style={{ alignSelf: "flex-start" } as CSSProperties}>
                      Manage billing
                    </button>''', '''                    <a className="btn sm wht" href="mailto:billing@gradeon.app?subject=Billing" style={{ alignSelf: "flex-start" } as CSSProperties}>
                      Manage billing
                    </a>''')
rep('''                    <span className="chip a" style={{ alignSelf: "flex-start" } as CSSProperties}>
                      Active
                    </span>
                    <span>1,498 students</span>
                    <span>96 staff</span>''', '''                    <span className="chip a" style={{ alignSelf: "flex-start" } as CSSProperties}>
                      {v.plan.status}
                    </span>
                    <span>{v.plan.students} students</span>
                    <span>{v.plan.staff} staff</span>''')
rep('4,000 <span', '{v.plan.smsLeft} <span')
rep('<span>Used this term</span>', '<span>Used this month</span>')
# the three General / Preferences / Plan sections only show on the first tab; the others have their own
rep('          <div className="set">\n', '          <div className="set">\n            {v.tab === 0 && (\n              <>\n')
i = s.rindex('            </section>\n          </div>\n        </div>\n      </main>')
s = s[:i] + '            </section>\n              </>\n            )}\n            {v.extra}\n          </div>\n        </div>\n      </main>' + s[i + len('            </section>\n          </div>\n        </div>\n      </main>'):]
open(p, 'w', encoding='utf-8').write(s)
