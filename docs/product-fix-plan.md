# Gradeon: the one-pass fix plan

**Status: for the owner's approval (2026-11-10).** Reads with [`product-map.md`](product-map.md) (where everything goes) and [`product-audit.md`](product-audit.md) (every element, its verdict and why; §6 holds every decision, all taken as recommended).

**The rule for this pass:** nothing is patched, hidden "for now" or left for later. Each item is finished end to end (admin, console, server, app, tests), or removed. An option is offered only when what is behind it works: a capability appears when a tested connection serves it. The only things that stay are scale ceilings that work correctly (audit §5).

**After this pass:** the new design system (built in parallel by another agent) is applied, then the new modules from `features-plan.md`, each starting from its module definition.

## Now and after, in brief

| Area | Now | After |
| --- | --- | --- |
| **How a module exists** | Declared by hand in about ten lists that drifted; nothing checks a module is complete | One module definition generates the menus, routes, settings, permissions, import kinds, message events, dashboard pieces, app tabs, search scopes and test lists; a test fails if a module is incomplete or named outside it |
| **School data** | Houses, fee heads, categories, grading, terms, statuses, limits, receipt numbers, languages written in code (often copied 3–4 times) | The school's own data or a console setting, one list each, defaults equal to today's values |
| **Admin** | Pages grouped by where they were built; three search entries; fakes (bell, sort icon, kebab, "Plan the rooms"); create-and-delete only; panels without addresses | Menu grouped Home, People, Teach, Care, Money, Reach, Campus, School; one of each control; every control real; every record editable; every panel and tab has a URL; approve and decline with a reason |
| **Console** | Ten school tabs without URLs; modules in three homes; "Care" grab-bag; fleet actions inside a school; raw keys; Plans in code; no "Go live" button | Menu Schools, Product, Platform, Business, Console; Plans and modules in one place; Plans page with prices; Go live button behind its checklist; plain words; confirms and second person where it matters; role switches and app layout per school |
| **Integrations Hub** | Forms per provider already exist, but setup steps live in a doc, the webhook address appears only after saving, templates have no "missing" list, and many services still need server variables or a developer | n8n-style templates: pick a service, see each value it needs with where to find it and a format check, copy the webhook address straight away, Test, go live. Messaging mode, alerts, virus scanning, builds, app-store signing, Firebase files, test databases, backups, custom domains and bus trackers all become templates or console switches. Only server-start variables remain |
| **App roles** | Parents and teachers; students cannot sign in; no driver; nothing switchable | Student, parent, teacher and driver, each switched per school from the console, each with its own dock and Home from the console |
| **App screens** | About 35 controls that only show a toast or pretend (share, save, download, attach, scan, live bus, map, calendar, report); data in code; teacher tools with fixed exams, fixed audiences and no view of the student's work | Every control does the real thing with real files, real PDFs (Unicode, logo), real push, live updates (chat, typing, notifications, bus), phone calendar; teacher tools complete (roster, own timetable, period attendance, exam-based marks with lock, grading with the work shown, edit and delete) |
| **Missing pieces families and teachers expect** | No forgot password, account changes, exam timetable, withdraw leave, consent changes, data requests | All added (audit §3.0) |
| **Copy and wording** | Developer and wrong-audience lines; one word naming several things | One copy pass; one word, one meaning (map §8) |
| **Guards** | Checks are visual and technical only | Placement rules in AGENTS.md; tests for module completeness, dead controls, school data in code, switched-off modules leaving no trace; the new-page commands start from the module definition |

## The steps, in order (one branch, one merge)

1. **Module definition** (the cause): `ModuleDef` in `config-engine`, generators, the completeness test; delete every hand-kept copy.
2. **School data and settings**: every P2/P18 item becomes the school's data or a console setting; `/v1/config` gives the app everything per role (dock, Home, quick actions, lists, rules, privacy notice).
3. **Integrations Hub and outside credentials** (audit §4): `steps`, per-field help and format checks, webhook address before saving, template coverage with Copy for DLT and Import, the new capabilities (alerts, file scanning, build service, app stores, databases, hosting, bus trackers), messaging mode in the console, Firebase files through the FCM connection, signed Android and iPhone builds to the stores, backups to storage, real cell moves, Unicode PDFs, QR letter.
4. **Server pieces the app and admin need**: event stream (chat, typing, read, notifications, bus), uploads for every file, report-card and receipt PDFs, exam timetable, roster, notice schedule/edit/delete/acknowledge, leave withdraw and half day, library reservations, fines and staff loans, driver trips and boarding marks, consent changes and data requests, password reset in the console.
5. **Console** per audit §2 and map §4.
6. **Admin** per audit §1 and map §3.
7. **App** per audit §3: roles and docks from the console, every screen's verdicts, student and driver branches, push.
8. **Pattern sweep and copy pass** over all three (P1–P20), so nothing a single page missed survives.
9. **Guards**: AGENTS.md rules, the tests, the `/new-admin-page` and `/new-screen` commands start from the module definition; `features-plan.md` cleaned (import junk out, "Built" statuses true).
10. **Gates**, then the one merge: `tool/verify.sh`, `pnpm typecheck && pnpm test`, `audit-ui`, `e2e-flows` (plus one flow per module switched off), the scan tools, app shots for every role in light, dark and empty data, and the owner's look on a phone and in the browser.

Steps 5, 6 and 7 touch different files and run side by side once 1–4 are in.

## What the owner provides (not code)

Real accounts to fill into the Hub templates: SMS provider with DLT, WhatsApp, e-mail, Razorpay or Cashfree, a storage bucket, Google Maps or Mapbox, Firebase, Google Play and Apple developer accounts, ClamAV host, Render API key for domains. Everything works on the sandbox until each is filled in and tested.
