# Gradeon: the plan to production

Written Nov 4, 2026, from the code on `main` (d25d5d5) and the features master (`School ERP Features - Master Reference.pdf`). This is the order of work that takes **Gradeon** from a working test track to something a real school runs on every day. Each phase says what "done" means so nobody has to guess.

What matters most, in the owner's words, and where it is in this plan:

| Owner's requirement | Where |
|---|---|
| Rename the product to Gradeon, everywhere | Phase 0 (done) |
| Any school can move to Gradeon easily, from any software or from paper, in every module | Phase 3 |
| **Schools cannot change anything themselves.** Every configuration is done from the console by Gradeon staff | Phase 2A |
| **Everything that can be configured is configurable**: colours, branding, features, roles, deployments and the rest | Phase 2A (the full list) |
| Roles, which modules each role can use, and creating new roles are set from the console | Phase 2A, "Roles" |
| The console decides which school gets which modules (the biggest one) | Phase 2B |
| Pending decisions never stop the work | "Decisions" at the end |

**Decided (Nov 4, 2026):** schools change nothing themselves; configuration is console-only. **Open, and not blocking:** one Gradeon app or one app per school, names, hosting, providers, pilot school. The work goes on with working values kept in one place, so each decision later is a change of value, not a rebuild.

---

## 0. Where we are today

The bones are good. The backend already keeps each school's data in its own database, has a five-layer config engine (`packages/config-engine/src/resolve.ts`) with a per-school **entitlement** the console pushes, a module manifest (`config-engine/src/modules.ts`), a `@RequireModule` guard, roles and about 35 permissions, an audit log, two-person approvals in the console and a provisioning wizard. Most of Phase 2 builds on these instead of replacing them.

What stops a real school today (all verified in the code on Nov 4):

| # | Problem | Where | Why it blocks a real school |
|---|---|---|---|
| B1 | Nothing creates parent accounts. Only the demo seed makes guardian users; enrolment creates the guardian record without a login. | `apps/api/src/school/people.service.ts:64` creates staff only | Parents of a real school cannot sign in to the app at all. |
| B2 | The app's API ignores modules: 0 of 46 routes check them. The admin API checks 31 of 79. | `family.controller.ts`, `school.controllers.ts`, `modules.controllers.ts` | A school without Fees still serves fees to the app; switching a module off is cosmetic. |
| B3 | `GET /v1/dashboard` has no permission check. | `school.controllers.ts:219` | Any signed-in account of the school, a parent's included, can read school-wide fee and attendance totals. |
| B4 | School staff with `settings.write` change modules, app layout, branding, roles, message rules. | `apps/admin/src/pages/settings/panels.tsx`, `PATCH /v1/settings` | The opposite of requirement 2. |
| B5 | No message leaves the platform: SMS, email, WhatsApp, push and sign-in codes all go to the test inbox. | `Messenger` in `apps/api/src/school/support.ts:90` | No absence alerts, no fee reminders, no sign-in codes for real people. |
| B6 | No file storage: homework hand-ins keep only a file name; attachments, gallery and photos are demo only. | `family.service.ts:235` | Homework, documents and photos do not work. |
| B7 | No job runner: fee reminders by date, late fees and the quiet-hours queue never run. The only timer is the daily session sweep. | `apps/api/src/school/sweep.service.ts` | Settings that look live do nothing. |
| B8 | No payment gateway: in-app payment marks fees paid without money moving. | `family.service.ts:335` | Cannot be switched on for a real school as it is. |
| B9 | The app does not read the school's config: modules and App layout are ignored, tabs are fixed. | `lib/` shell; `docs/HANDOFF.md` 9.3 | Requirement 3 cannot reach the phone. |
| B10 | No password reset; no real backups (only Neon's); hosting is one free Render service. | `docs/HANDOFF.md` 9.4–9.5 | Not survivable for real data. |
| B11 | Smaller wrong behaviour: the "New notice" message is never sent; support sessions end after 30 minutes while the console says an hour (`apps/console-api/src/ops.ts:99`); admin sign-in accepts only email although the API takes a phone. | various | Each one breaks trust in front of a school. |

Test baseline (Nov 4, fresh install): platform typecheck passes; platform tests 146 of 148 pass, with **2 failing** in `apps/api/test/api.test.ts` (students: the "fees overdue" filter and the class summary find no overdue families in the seeded school, so either the overdue query or the seed's dates are wrong; to investigate in Phase 1). Flutter analyze has no errors or warnings (67 style hints); Flutter tests 40 pass, 3 skipped. The browser audit and flows (`tools/audit-ui.mjs`, `tools/e2e-flows.mjs`) were not run for this baseline.

---

## Phase 0. Rename to Gradeon (done on branch `chore/rename-gradeon`)

Done first and as one change, so every later branch starts from the new name. The old name no longer appears in any tracked file, file name or folder name; a CI check (`tools/check-name.mjs`) fails any change that brings it back.

What changed, using the working values (see Decisions; each is now one value to change if the owner picks another):

| What | Now |
|---|---|
| Product name in all copy (app, admin, console, translations, messages, docs, design boards) | Gradeon |
| npm packages | `@gradeon/*` |
| Dart package | `gradeon` (`package:gradeon/...`) |
| Android and iOS app ID | `com.gradeon.app` (the Android source folder moved to match) |
| Domains and emails | `gradeon.app` |
| Test deployment | Render service `gradeon`, expected at `https://gradeon.onrender.com` |
| Environment names, local data folder, Neon project names | `GRADEON_*`, `.gradeon-data`, `gradeon-<school>` |
| Sign-in cookies (they used the old initials) | `gd_rt_<school>`, `gd_crt`, `gd_csrf` |
| The built APK that was committed to the repo | removed (builds belong in releases) |

Still to do for the rename, outside the code:
1. **Recreate the test deployment.** A Render address cannot be renamed, so after this branch is merged, Render creates a new service called `gradeon`. If Render gives it a different address than `https://gradeon.onrender.com`, change that one value in `render.yaml` (`CORS_ORIGINS`), `lib/core/config/app_config.dart` (`API_BASE_URL` default) and the docs. Start it with fresh databases: everyone signs in again (new cookie names), and the old test service can then be deleted.
2. **Phones:** the new app ID installs as a new app; uninstall the old test app.
3. **GitHub:** the repository is now `Inferno-Lab/Gradeon` (renamed by the owner on Nov 4, 2026); `origin` points there.
4. **Brand art:** the mascot (Nesti), the design-system name (Nest), the app icon, splash and logo are kept as they are until the owner gives new names or art.

---

## Phase 1. Foundations: honest environments, test data, safety

### 1.1 Three environments, one code base

| | Local | Staging (the test track) | Production |
|---|---|---|---|
| Data | Seeded test schools | Seeded test schools, reset on demand | Real schools only. No seed, no demo code, no demo accounts |
| Messages | Test inbox | Test inbox (plus a few allow-listed staff phones) | Real providers |
| Payments | Gateway test mode | Gateway test mode | Live |
| Who | Developers | Gradeon team and testers | Schools |

The guards already exist (`ALLOW_DEMO`, `SEED_DEMO`, `DEMO_CODE`, refused in production); make production refuse them unconditionally and give staging its own registry, domain and Render (or cloud) service.

### 1.2 Test data: a better way than typing it into the admin

The owner's idea is right in spirit: test data should live in the backend and reach the app through the real API, so the app never carries dummy data. The better way to fill it is **not by hand in the admin panel** but **through the migration importer from Phase 3**:

- A generator writes the same files a real school would bring us (students and guardians, staff, classes, fee structures with opening dues, past attendance and marks, timetable, library books, bus routes), in our import templates and in the formats of two or three other ERPs.
- "Reset test school" in the console imports them into a fresh school database through the real import pipeline. One click, about a minute, a known state every time; sizes from a 120-student playschool to a 3,000-student K-12.
- Testers then work in the admin and the app exactly as a school would, and can add more by hand on top.

Why this is better: the migration tool (requirement 1) gets exercised every day instead of once per new school; data is big and realistic enough to catch slow pages; nothing about the test school is special-cased in code; and the Greenfield seed in `packages/db/src/seed` is retired instead of maintained in parallel.

### 1.3 Take dummy data out of the shipped app

- Production and staging builds of the app always use the real API. `assets/mock/*.json` and the `Mock*` repositories move to `test/` for widget tests and screenshots only.
- "Try the demo" in the app signs into a demo school on the server (read-only accounts) instead of bundled JSON, so the demo shows the real product.
- Empty states stay first-class: a brand-new school sees friendly empty screens, which is exactly what a school will see on day one after import of only students.

### 1.4 Safety before any real data

- **Backups:** daily full backups and point-in-time recovery per school database, a restore drill each month, and a "restore this school to yesterday" console action with two-person approval.
- **Hosting:** move off the free tier to an India region (DPDP and latency): managed PostgreSQL with point-in-time recovery, object storage, the API as a container. One cell is enough for the first 50 schools; the existing cell model scales it later. EKS and Argo from the original spec can wait until there are many schools.
- **Observability:** error tracking for the API, admin, console and app (crash reports), structured logs with the school and request ID, uptime checks per school, alerts to the team.
- **Security:** password reset by phone or email code, phone-number sign-in in the admin, remove the leftover `localStorage` token read (`apps/admin/src/app/client.ts:42`), passkeys or TOTP for console staff, rate limits per account, a penetration test before the pilot.
- **CI gates on every pull request:** typecheck, API tests, Flutter analyze and tests, UI audit and the browser flows, the rename check, the module-guard check from Phase 2B, and a migration check that refuses edits to applied SQL files.

### 1.5 The bug sweep

There are bugs in all three surfaces; the way to finish them is a list, not a mood.
1. Collect: run `tools/audit-ui.mjs`, `tools/e2e-flows.mjs`, `scan-*.mjs`, the app on a real Android phone and an iPhone in every role, light and dark; walk every page and screen against the features master; add B1–B11 above.
2. Triage into one board: P0 (wrong data, security, a school cannot do its job), P1 (broken feature), P2 (wrong but survivable), P3 (polish).
3. Every fixed bug gets a test that would have caught it. P0 and P1 are cleared before the pilot.

Done when: staging and production exist separately, the app ships without mock data, backups have been restored once in a drill, errors reach the team, CI blocks regressions, and P0/P1 bugs are zero.

---

## Phase 2A. Gradeon configures everything; schools configure nothing

**Rules (decided):**
1. The school admin is for running the school: its people, attendance, fees, homework, notices and messages, the daily work and the data. **No school role, the principal included, can change any configuration.**
2. **Everything that can be configured is configurable**, from the console, by Gradeon staff. Nothing that could differ between schools is fixed in code: if two schools could want it differently, it is a setting.
3. Each setting is data: a key with a type, a default, a description, which console role may change it, and whether a change needs a second person's approval. The console builds its forms from that list, so a new setting appears in the console without new screens.

### What is configurable (the full list)

Today about 45 settings exist (`packages/contracts/src/config.ts`) and most are edited in the admin. All of them move to the console, and the list grows to cover everything below. Items marked *new* do not exist yet.

| Area | What the console sets per school |
|---|---|
| **Identity and branding** | School name, short name, tagline, logo and logo letters, **colours** (main, accent, and their dark-mode versions), fonts (*new*), app name, app icon and splash (*new*), how receipts, report cards and certificates are headed (*new*), the email sender name and SMS sender ID (*new*), contact details and address |
| **Modules and features** | Which modules and which features inside each module the school has, its limits (students, staff, SMS, storage) and dates (trial, start, end). See Phase 2B |
| **Roles and access** | See "Roles" below |
| **The app** | Bottom tabs, home-screen cards and their order, quick buttons, which kinds of people get the app (parents, teachers, students), student sign-in on or off (*new*), languages offered |
| **The admin** | Which pages and dashboard widgets each role sees, default views and filters (*new*) |
| **Academic setup** (*new*) | Academic year, terms, working days, holidays, periods and bells, classes and sections, subjects, houses, grading scales, report-card formats |
| **Rules** | Attendance (who is told, when records lock, late rules); fees (late fines, reminder schedule, receipt numbering, payment methods); approvals (fee waivers, notices, leave); notices |
| **Messages** | Which message goes on which channel, wording of every message, quiet hours, languages |
| **Security** | Two-step sign-in, how long sign-ins last, password rules (*new*), sign-in methods (*new*) |
| **Privacy** | Consent questions, privacy notice, grievance officer, how long records are kept, photo consent |
| **Integrations** (*new*) | The school's payment gateway account and settlement, SMS sender, WhatsApp number, email domain, Tally export format |
| **Deployment** | Where the school runs (cell and region), its web address (subdomain or own domain), which release it is on and its rollout wave, maintenance window, backup schedule, how its app is shipped (inside the shared Gradeon app, its own branded app, or both), feature flags |
| **Dashboard targets** | Daily fee target, attendance and homework goals, classes shown in the roll call |

### Roles (set from the console)

- **Gradeon defines every role for each school**: creates new roles, renames them, deletes them, and sets exactly what each role can do: **which modules it can open** and which actions inside each module (see, add, change, approve, publish, export, see phone numbers and so on). Ready-made role sets (Principal, Office, Accountant, Teacher, Class teacher, and more) can be applied to a school and then adjusted.
- A role can only use modules the school has (Phase 2B). Taking a module from a school takes it from every role.
- **Who is in which role:** whether the school may put its own staff into the roles Gradeon made, or whether Gradeon does that too, is itself a console setting per school (so it can be locked completely). The school can never create or change a role.
- Every role change is versioned, audited and can be rolled back; removing access from a role in use needs a second person.

### How

1. **Server first:** the school API stops accepting configuration changes from school accounts. `PATCH /v1/settings` and the role-editing routes leave the school API; `settings.write` and the role-editing permissions leave the school permission list; existing roles are migrated. Changes come only through the console API, with console roles, the audit log and two-person approval where marked.
2. **Console:** a **Configuration** area on each school's page, built from the settings list, reusing the existing panels (moved from `apps/admin/src/pages/settings/panels.tsx` into `packages/web-ui`). It has a version history, a diff before saving, "roll back to this version", a live preview of the app and the admin as each role will see them, and **configuration templates**: save one school's setup and apply it to another, or to many at once.
3. **Admin:** the settings pages become a read-only **School setup** page that shows what Gradeon has set, with **Ask Gradeon to change this**, which lands in a console queue (who asked, what, why).
4. **Gradeon staff roles:** add a console role for the people who set schools up (for example "Implementation"), separate from Support (read-only) and Super admin. Support sessions stay read-only.
5. **The app and the admin read everything from the configuration** at start and when it changes (colours, names, modules, layout, roles), so nothing school-specific is compiled in.

Done when: no school account can change any configuration through any route (an API test signs in as every school role and tries every configuration write, and all are refused); every item in the list above is set from the console and reaches the admin and the app; every change is in the console audit log and can be rolled back.

---

## Phase 2B. Per-school modules from the console (the biggest piece)

The foundation exists: `entitlement.modules` per school, plans as presets, `closeModules` for dependencies, the console's "Push the plan and locks" action, `kill.<module>` switches. What is missing is that it covers few modules, is enforced in few places, and stops at modules (no features inside them).

### 2B.1 The module catalogue becomes data

Every module and feature in the features master gets an entry in the catalogue (today `MODULES` in `config-engine/src/modules.ts`, 12 entries): key, name, state (planned, beta, live), dependencies, **features inside it** (for example `fees.onlinePayment`, `fees.lateFines`, `fees.gstReceipts`, `attendance.staff`, `attendance.biometric`), limits it adds (SMS a month, storage), what it touches (admin pages, app screens, messages, reports, importers), and its price. The console reads it; plans are just named bundles of it.

### 2B.2 What the console sets per school

- Plan as a starting bundle, then **add or remove any module or feature** for this school.
- Limits (students, staff, SMS, storage) and **dates**: trial until, active from, ends on.
- A clear matrix of every school against every module, bulk changes for many schools, a diff before pushing, two-person approval for removing a module, and the history of every change.
- Billing reads the same entitlement, so what a school pays always matches what it has.

### 2B.3 One rule for enforcement: default deny

A module that is off must disappear everywhere, not just from a menu:

| Surface | What changes |
|---|---|
| School API | Every route declares its module (or that it is core). A CI check fails any route without it. Fixes B2 (46 app routes and 48 admin routes have no module check today). |
| App API and app | The app fetches the resolved config (`/v1/f/config`) at start and on change: tabs, home cards, quick buttons, search, deep links and notifications follow it; a module switched off while the app is open closes its screens politely. Fixes B9. |
| Admin | Menu, pages, quick actions, Ctrl+K search, dashboard widgets, reports and bulk actions follow it (menu already does). |
| Permissions | The roles editor and staff screens show only permissions of modules the school has. |
| Messages and jobs | No message, reminder or scheduled job runs for a module that is off. |
| Imports and exports | Importers for an off module are hidden; exports include it only if on. |
| Data | Switching off hides data, never deletes it; switching on brings it back. Deleting is a separate, two-person erasure. |

Tests: one API test runs every route against a school with only the core modules and expects "not in your plan" for everything else; one app test per module switches it off and checks its tabs and cards are gone.

Done when: every module and feature in the catalogue can be given or taken per school from the console, and the default-deny check, the API matrix test and the app tests are in CI.

---

## Phase 3. Moving to Gradeon is easy, from anything

Goal: a school on any other software, on Excel, or on paper registers can be fully running on Gradeon in about a week, with no data lost and nothing typed twice. Today the only import is one students CSV.

### 3.1 One import engine for every module

Upload → recognise the file → map columns (presets for known sources, a mapper that remembers choices) → validate every row with plain-language errors and a grid to fix them in place → preview what will be created or changed, with totals → import as one batch → reconciliation report → **undo the whole batch** within 30 days.

Rules: imports are repeatable (each row keeps its old system ID, so a second import updates instead of duplicating, which also allows running both systems in parallel for a while); the school's own numbers are kept (admission numbers, roll numbers, receipt numbers continue from where they were); people are matched across files (siblings by guardian phone, staff by phone or email).

### 3.2 What we bring in, module by module

| Module | Bring in | Notes |
|---|---|---|
| School structure | Academic year, terms, classes and sections, subjects, houses, periods, holidays | First, everything else hangs on it |
| Students and families | Students, guardians, siblings, photos (bulk zip matched by admission number), documents | Families are merged by phone; creates parent logins (fixes B1) |
| Staff | Staff, roles, subjects taught, class teachers | Sends invitations at go-live, not at import |
| Admissions | Open enquiries and applications with stage | So the pipeline does not restart |
| Fees | Fee heads and structures, concessions, **opening dues per student**, payment history, receipt numbering | Reconciled to the rupee against the old system's dues report |
| Attendance | Past attendance (daily or monthly totals) | Optional; needed for year reports |
| Exams | Past exams and marks, past report cards as PDFs | Keeps history and ranks |
| Timetable | Periods and teacher assignments | From the old ERP or the printed timetable sheet |
| Library, transport, hostel… | Catalogue and current loans; routes, stops and assigned students; and so on | Each new module ships its importer (rule in Phase 5) |
| Accounts | Ledgers and opening balances from Tally | When accounting exists |

### 3.3 Where schools come from

- **Other ERPs:** column presets for the standard exports of Fedena, Entab CampusCare, Skolaro, MyClassboard, Teachmint, NLET, Edumarshal, Eduflex, Camu, Extramarks and Schoolpad first (the Indian products in the features master), then international ones as needed. Built from real exports collected from the first schools.
- **Excel and Google Sheets:** Gradeon templates with dropdowns and checks, downloadable per module, so a school that keeps data in sheets fills them once.
- **Paper:** spreadsheet-style quick-entry grids in the console and admin (type a whole class in minutes); later, photographed admission forms and registers read with OCR behind the assistant switch; and the Gradeon onboarding team can do the entry for the school.
- **Phones and WhatsApp groups:** paste or upload a contact list to match guardians to students.

### 3.4 Who runs it

Because configuration is Gradeon's (Phase 2A), migration runs from a **Migration** workspace on the school's console page, used by Gradeon's onboarding team. The school admin gets a **Send us your files** page to upload exports and see progress and the reconciliation reports.

### 3.5 Go-live and families

- A go-live checklist per school in the console: structure, students, staff, fees reconciled, timetable, configuration reviewed, staff trained, parents invited.
- **Parent activation:** invite every family by SMS or WhatsApp with a link and code, print QR letters per class, and track activation per class so the school can chase the rest.
- **Leaving is easy too:** a full export of everything in the same templates. Schools trust a system they can leave.

Done when: a school can arrive from Excel, from one other ERP and from paper, each proved with a real or realistic data set on staging, with reconciled totals and parents able to sign in.

---

## Phase 4. Make what exists real

Each of these turns a screen that looks finished into a feature that works for a real school.

- **Messages (B5):** SMS through a DLT-registered Indian provider, WhatsApp through a business provider, email, and phone push (FCM, APNs) behind the existing `Messenger` interface; delivery reports; the quiet-hours queue; send the "New notice" message.
- **Jobs (B7):** a job queue on PostgreSQL (no new server) for fee reminders by date, late fines, scheduled reports, imports and exports, retries of failed messages.
- **Files (B6):** object storage with signed links, virus scanning and image resizing: homework hand-ins and attachments, chat attachments, student photos and documents, gallery with consent.
- **Payments (B8):** Razorpay for school fees with reconciliation, refunds and settlement reports; GST receipts where needed.
- **One app or one app per school, without deciding yet:** the app takes everything school-specific (name, colours, logo, modules, layout, roles, server address) from the school's configuration at run time, never from the code. The same code then ships two ways, and CI builds both on every change: (a) one Gradeon app where a person finds their school by code or phone number, and (b) a branded app per school with that school preset, built by the console's existing build pipeline. Choosing later only decides which we publish. The one hard deadline: an app's store ID cannot change after its first store release, so that name is fixed before the first publish.
- **App:** reads config (B9), parent sign-in by phone code, push registration, deep links from notifications, an offline cache for the last-seen data, the library, gallery and bus screens on real data.
- **Year-end:** promotion to the next class, new academic year, carry-forward of dues, archived years read-only.
- **Correctness fixes from Phase 0 list:** B3 dashboard permission, B11 items.

---

## Phase 5. New modules from the features master

Every new module meets the same **module contract**, or it is not done:
catalogue entry with features and dependencies → migration and tables → API with module and permission on every route → admin pages built from `packages/web-ui` → app screens with empty states → messages through `Messenger` → **importer and exporter** → reports → audit → tests (API, browser flows, app) → docs and help text → owner's design review.

Suggested order for Indian K-12 schools (where the features master shows Gradeon weakest against what schools expect):

| Wave | Modules | Why first |
|---|---|---|
| A: needed to switch | Academic setup screens; fee structures by class and category, concessions rules, late fines, GST receipts, refunds; staff attendance and leave; certificates (TC, bonafide, character) and printed ID cards; report cards in board formats (CBSE, state boards) and NEP Holistic Progress Card; digital diary and classwork; transport administration (routes, stops, route fees) with live bus; visitor and gate pass; UDISE+ export; Tally export | Schools ask about these in the first demo; most competitors have them (features master, section 2a) |
| B: grows value | Payroll and HR; study material and online tests; parent-teacher meeting booking; helpdesk and grievances; surveys; health and infirmary; behaviour; hostel; inventory; alumni; multi-campus view for trusts | Common in larger schools and groups |
| C: sets Gradeon apart | AI assistant, at-risk alerts, report-card comment drafts, smart fee-reminder timing; biometric and RFID attendance; canteen wallet | Differentiators once the basics are excellent |

Each wave's modules are given to schools per Phase 2B, so a school only gets what it pays for and new modules can start as "beta" for one pilot school.

---

## Phase 6. Ready for real schools

- **Pilot:** one friendly school on production, migrated with Phase 3, watched daily for four weeks; then three more.
- **Load:** a synthetic 3,000-student school and 50 schools at once on staging; page and API speed budgets (admin pages under one second, app screens under 300 ms from cache).
- **Security and law:** penetration test; DPDP Act: consent capture in the app, data-rights requests end to end, breach process, data kept in India, signed agreements per school.
- **Stores:** Play Store and App Store listings, for the shared Gradeon app, per-school apps, or both, whichever is decided by then (both are built and tested from Phase 4).
- **Support:** help centre and in-app help, runbooks for the team, incident process, status page, response-time promise per plan.
- **Billing:** plans, add-ons and invoices from the console, matching entitlements.

---

## The quality bar ("impeccable")

- Every page and screen: designed, reviewed by the owner, works at phone, tablet and desktop widths, light and dark, with real empty, loading and error states.
- Nothing pretends: no screen shows a feature that does not work for real; demo-only parts are hidden in production.
- Fast on cheap Android phones and slow networks; judged on release builds.
- Every important action is audited; risky ones can be undone or need a second person.
- Hindi and Marathi across app and admin (then more Indian languages), plain wording everywhere.

---

## Order and rough size

Sizes assume one owner plus coding agents, working in parallel where files do not overlap. They are rough and will be revised after Phase 1.

| Step | Depends on | Rough size |
|---|---|---|
| Phase 0 rename | owner's names | 2–4 days |
| Phase 1 foundations and bug sweep | Phase 0 | 2–3 weeks |
| Phase 2A config to console | Phase 0 | 1–2 weeks, parallel with Phase 1 |
| Phase 2B per-school modules | 2A | 2–3 weeks |
| Phase 3 migration engine + first presets | Phase 1 (test data uses it) | 3–4 weeks, then ongoing per source |
| Phase 4 make it real | Phase 1; owner's provider accounts | 3–5 weeks, parallel tracks |
| Phase 5 wave A | 2B, 3, 4 | 6–10 weeks |
| Phase 6 pilot | waves above as needed by the pilot school | 4 weeks of watching |

---

## Decisions

**Decided:** schools change nothing themselves; every configuration, roles included, is set from the console by Gradeon staff; everything that can be configured is configurable.

**Open, and none of them stops the work.** Until the owner decides, the work uses the working value in brackets, kept in one place (configuration or environment), so a later decision is a change of value:

1. **Names** (domain `gradeon.app`, app ID `com.gradeon.app`, npm scope `@gradeon`, mascot and design-system names as they are). The app ID must be final before the first store release.
2. **One Gradeon app or one app per school** (both are built; see Phase 4).
3. **Hosting in India** (staging stays on the current free track until then).
4. **Providers:** SMS with DLT registration, WhatsApp business provider, email, Razorpay (the test inbox and gateway test mode until then).
5. **Pilot school** and its current system (realistic generated files until then).
6. **Plans and prices** for the module catalogue (the three current plans until then).
