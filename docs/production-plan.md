# Gradeon: the plan to production

Written Nov 4, 2026, from the code on `main` (d25d5d5) and the features master (`School ERP Features - Master Reference.pdf`), and kept current since (last update Nov 9). This is the order of work that takes **Gradeon** from a working test track to something a real school runs on every day. Each phase says what "done" means so nobody has to guess.

What matters most, in the owner's words, and where it is in this plan:

| Owner's requirement | Where |
|---|---|
| Rename the product to Gradeon, everywhere | Phase 0 (done) |
| Any school can move to Gradeon easily, from any software or from paper, in every module | Phase 3 |
| **Schools cannot change any configuration.** Every setting and role is done from the console by Gradeon staff; the school's own data (timetable, classes, terms, holidays, fee structures) stays with the school, inside limits the console sets | Phase 2A |
| **Everything that can be configured is configurable**: colours, branding, features, roles, deployments and the rest | Phase 2A (the full list) |
| Roles, which modules each role can use, and creating new roles are set from the console | Phase 2A, "Roles" |
| The console decides which school gets which modules (the biggest one) | Phase 2B |
| One precise design system for the app and one for admin and console, covering micro-interactions | Done (Nov 9): `docs/DESIGN.md`, `docs/design-system.md`, enforced by tests |
| **Every colour of the admin, the app and the console is set from the console**, with full freedom (a picker, hex, rgb, hsl) | Done (Nov 9): console → school → Configuration → Colours; Team → Console colours |
| An **Integrations Hub** in the console to configure, manage and add third parties, instead of hard-coding them, before Phase 4 | Phase 3B |
| The plan is detailed enough for other agents to build the remaining phases | "How to pick up a piece of this plan", and every step in Phases 3B to 6 |
| Pending decisions never stop the work | "Decisions" at the end |

**Decided (Nov 4, 2026):** configuration is console-only. **Decided (Nov 5, 2026):** the school keeps its own data inside console limits; every school runs the deployed code and is migrated at start-up (release waves sign schools off, they do not stage code). **Open:** one Gradeon app or one app per school, names, hosting, providers, pilot school. None of them stops the coding work, but **an SMS provider (with DLT registration) stops a pilot**, so it is the first thing to start. The work goes on with working values kept in one place, so each decision later is a change of value, not a rebuild.

## Status (Nov 9, 2026)

**Design systems and colours (branch `feat/design-system`, Nov 9):** both design systems are built and enforced. Admin and console: one token per meaning (retired duplicates), ten type sizes in three weights, radius and spacing scales, control heights that line up, every control's states (hover, press, focus, disabled, busy), toast timing in one hook, theme changes in one frame, and a guard test that fails on any off-system value. App: type roles, `AppMotion` and curve tokens, radius and spacing scales, every tap through `Pressable`, plurals through `.trn`, and its own guard test. **Every colour is configurable from the console**: each school's admin (light, dark) and app (Chalk, Blackboard, AMOLED, subjects, houses) under Configuration → Colours, and the console's own under Team, with a full colour picker, live previews and contrast warnings; derived colours follow a changed base. Next: **Phase 3B, the Integrations Hub**, then Phase 4.


**Phases 0 to 3 are merged.** What is left in them needs something from the owner (an account, a vendor, a decision or a review) or belongs to a later phase; each such item is listed below with the reason. **The critical path to a pilot is now outside the code: an SMS provider with DLT registration** (families sign in only with a code to their phone, and invites are texts; until a provider exists every text lands in the console's test inbox), then India hosting with point-in-time recovery, then a check on real phones.

**Finished in the Nov 8 pass** (branch `feat/finish-phases-0-3`):

- **Safety and operations (Phase 1):** one account is sent at most five sign-in or reset codes in fifteen minutes (each code allows three guesses; demo schools excepted), on top of the per-device limit of 300 requests a minute; `ALERT_WEBHOOK_URL` (a Slack or Discord webhook) hears about every new kind of error, a school that stops or starts answering, a failed daily backup or restore drill and a school that could not be migrated at start-up; production logs are JSON lines and every unexpected failure carries its school and request ID; a **weekly restore drill** puts a fresh backup of one live school into a scratch database and counts it (console → Health shows the drills and runs one on demand); a backup taken before a later migration is **brought forward** in a scratch database before it is restored (before, every backup older than the last deploy that added a migration could not be put back); schools are migrated at start-up four at a time.
- **No sample data in a school's app (1.3):** the console's build workflow leaves `assets/mock/` out, and release builds compile the sample-content code out (they already refused to start without a school). "Try the demo" was already server-side: a build for a demo school shows its demo cards and signs in to the real demo accounts.
- **Configuration reaches the admin and the app (2A):** the brand colour paints the school's mark in the admin menu, on its sign-in page and in the app; the privacy notice and grievance officer show behind "Privacy" on the sign-in page and in the app's Settings; families **consent once** after sign-in when the console requires it, with the photo answer, and Moving in counts consent per class; Home shows its cards in the console's order with the school's **quick buttons**; the school's words for a student and a class name the admin menu, the Students page and the app's profile. New settings, each used: what receipts print under the school's name (printed receipts now name the school, its address and phone), how the office records payments, which languages the app offers, and whether teachers use the app. Profile tiles show only modules the school has. Two made-up facts (a founding year and office hours) are gone from the app's About.
- **Modules (2B):** Transport, Library and Gallery are **beta** in the catalogue and say what works today (they were marked live while their admin pages did not exist); a plan can leave features out (registry 0011), and a new school or a plan change takes them; app tests check that the console's Home cards, quick buttons, a module switched off and the offered languages reach the screen.
- **Moving in (3):** go-live waits until what is still owed in Gradeon equals the old system's dues total, which the team types in (it used to pass once any dues were imported); new items for the timetable, "Gradeon has reviewed the configuration" and "the school's staff are trained" (ticked by the team); an Entab export is tested.
- **UI sweep:** the page audit, the 49 browser flows, the layout scans and headless shots of every app screen (parent and teacher, light and dark, 360 wide to tablet) were run; fixed what they and a look in the browser found (see the pull request).

**Finished in the second Nov 8 pass** (branch `feat/finish-phases-0-3-part-2`):

- **Families without a phone (3.3, "phones and WhatsApp groups"):** students can now be imported without a family phone (the import counts them and says what to do); a new import kind, **Family phone numbers**, takes a contact list (from a phone, or a class WhatsApp group exported to a sheet) and gives each family without a phone its number, matched by the guardian's name and narrowed by the child or class; numbers the school already has are skipped, and two families with one name are flagged in plain words. Undo works like every import.
- **Excel templates (3.3):** every template, in the console and in the admin, is an .xlsx: the columns by name with an example row, **a dropdown on every column with fixed values** (current year, period kind, student status, admission stage, payment method, attendance mark, weekday), text cells so Excel keeps "8 A", admission numbers and phone numbers as typed, and a second sheet that says what each column is, whether it is needed and what it takes. A test reads every kind's template back through the importer.
- **Typing a register in (3.3, "paper"):** the admin's Moving in has **Type it in instead**: a grid for the chosen kind (fixed-value columns are dropdowns, needed columns are marked), sent to Gradeon's team like a file.
- **Payment history** now checks how each payment was made (UPI apps, NEFT, DD and the rest are read; anything else is asked about) instead of storing whatever was typed.
- **The days a school is closed (2A, "working days"):** `calendar.weeklyOff` (Sunday by default) replaces the Sunday that was hard-coded in attendance, the dashboard, fee charts, student rolls and reports; on a school build the app's leave days, attendance calendar and teacher views follow it (they counted every day as a school day).
- **Sign-in when the server is restarting or waking:** the admin's sign-in page said "We couldn't find that school" and stayed that way; it now says the school is not answering yet, tries again by itself and offers Try again. Only a school that really does not exist says "not found".

**Still open in Phases 0 to 3, and why:**

| Item | Why it is open |
|---|---|
| Recreate the test service and uninstall the old app (Phase 0) | Render and phones, not code |
| A staging service of its own; production with no demo switch at all | Needs a second service from the owner. Production refuses demo values unless `ALLOW_DEMO=true`, which only the test track sets |
| India hosting with point-in-time recovery, object storage, a restore drill on that hosting | Needs the owner's hosting account. The drill runs weekly wherever the server runs |
| Alerts reaching people | Needs a webhook from the owner (`ALERT_WEBHOOK_URL`); everything is wired |
| Penetration test; the bug sweep on real Android phones and an iPhone | Needs a vendor and devices |
| Retire the Greenfield seed in favour of the importer (1.2) | Decided against: Greenfield holds months of activity (notices, chats, homework, approvals) that no import kind brings in, and 49 browser flows rely on it. Test schools of any size come from the importer (Migration → test school, `tools/generate-school.mjs`) |
| Moving `assets/mock` and the Mock repositories into `test/` (1.3) | Decided against: plain `flutter run`, the screenshot tool and the widget tests all use the sample content, and what 1.3 is for is already true: release builds refuse to start without a school, compile the sample-content code out, and the build workflow leaves the files out |
| Settings not used yet: late fee, reminders by date, record retention | The job queue (Phase 4) runs fines and reminders; retention needs leaving dates from year-end (Phase 4) |
| 2A items covered another way: which pages each role sees (the role's permissions, set in the console's Roles tab), which dashboard widgets (each person hides or adds their own; widgets of modules the school does not have never show), who approves leave (whoever holds the approve permission in Roles), password rules (a shortest length; rules on character mixes are left out on purpose, as current guidance advises), sign-in methods (staff: password then a code, which the console can switch off; families: a code to their phone) | Nothing more is needed unless the owner wants it otherwise |
| 2A items that wait: late-arrival rules; message wording in Hindi and Marathi | Nothing records arrival times until biometric or RFID attendance (Phase 5); the Hindi and Marathi wording of every message needs a translation the owner writes or approves |
| 2A items not built: fonts, app name, icon and splash, logo image, sender names, student sign-in, report-card and certificate headings, grading scales, integrations, deployment settings | Colours are done (every one, from the console, Nov 9); fonts are the owner's design decision; icons, splash and logo need art and file storage; sender names need providers; report cards, certificates and student sign-in are Phase 5; deployment settings follow the hosting choice |
| Plans with feature differences filled in | The mechanism is in; which plan leaves out what is a pricing decision |
| Photos, documents and past report-card PDFs in Migration | File storage (Phase 4) |
| Presets for the other nine ERPs; QR codes on letters; WhatsApp invites; OCR of paper forms; Tally | Real exports from those systems; the app's store link (one app or one per school); a WhatsApp provider; the assistant; accounting |
| Proving a move on a staging school | Needs staging |
| Owner's design review of pages without boards | The owner's review |

**Earlier (Nov 6):** Phase 3 shipped the import engine, 17 kinds, Fedena and Entab presets, the console's Migration workspace, the admin's Classes and calendar and Moving in, and the generator. Phase 2B shipped the catalogue as data, per-school entitlements with dates and approvals, default deny, and billing from the entitlement. Phase 2A moved all configuration to the console. Phase 1 shipped password reset, console authenticator codes, error tracking, daily streaming backups with restore behind a second approver, the jobs table, pooler-safe connections and CI gates. Details are in `docs/HANDOFF.md`.

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

**Where B1 to B11 stand (Nov 8):** fixed: B1 (family accounts), B2 (default deny on every route, Phase 2B), B3, B4 (Phase 2A), B9 (the app follows the school's configuration), B11; B10 fixed except hosting (password reset, daily backups and weekly restore drills are in; India hosting needs the owner). B7 in part: the `jobs` table runs backups, drills, sweeps and probes once across servers; reminders by date and late fines are Phase 4. Open for Phase 4: B5 (real messages, waiting for providers), B6 (files), B8 (payments).

Test baseline (Nov 4, fresh install; both failing tests were fixed in Phase 1): platform typecheck passes; platform tests 146 of 148 pass, with **2 failing** in `apps/api/test/api.test.ts` (students: the "fees overdue" filter and the class summary find no overdue families in the seeded school, so either the overdue query or the seed's dates are wrong; to investigate in Phase 1). Flutter analyze has no errors or warnings (67 style hints); Flutter tests 40 pass, 3 skipped. The browser audit and flows (`tools/audit-ui.mjs`, `tools/e2e-flows.mjs`) were not run for this baseline.

---

## Phase 0. Rename to Gradeon (done)

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
- **Hosting:** move off the free tier to an India region (DPDP and latency): managed PostgreSQL with point-in-time recovery, object storage, the API as a container. A connection pooler (PgBouncer or the provider's) in front of PostgreSQL from day one: without it one server holds about 20 busy schools before it closes and reopens pools in the morning rush; with it, one cell carries the first 50 schools (to be proven by the Phase 6 load test). The existing cell model scales beyond that. EKS and Argo from the original spec can wait until there are many schools.
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
| **Academic setup** (*new*) | The school's own data, edited by the school: academic year, terms, working days, holidays, periods and bells, classes and sections, subjects, houses. The console sets the limits: a switch per area that can lock it (`timetable.schoolEdits` today), grading scales and report-card formats |
| **Rules** | Attendance (who is told, when records lock, late rules); fees (late fines, reminder schedule, receipt numbering, payment methods); approvals (fee waivers, notices, leave); notices |
| **Messages** | Which message goes on which channel, wording of every message, quiet hours, languages |
| **Security** | Two-step sign-in, how long sign-ins last, password rules (*new*), sign-in methods (*new*) |
| **Privacy** | Consent questions, privacy notice, grievance officer, how long records are kept, photo consent |
| **Integrations** (*new*, Phase 3B) | Not settings: connections and per-school routes in the console's **Integrations Hub** (payment gateway account and settlement, SMS sender and DLT templates, WhatsApp number, email domain, storage, maps, Tally) |
| **Deployment** | Where the school runs (cell and region), its web address (subdomain or own domain), which release wave signs it off (the code reaches every school at deploy), maintenance window, backup schedule, how its app is shipped (inside the shared Gradeon app, its own branded app, or both), feature flags |
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

## How to pick up a piece of this plan (for every agent)

Every step below is written so one agent can take it without asking. Before starting any step:

1. **Read** `AGENTS.md`, then `docs/HANDOFF.md` (anything outside `lib/`), then the step here. The design systems are `docs/DESIGN.md` (admin and console) and `docs/design-system.md` (app); both are enforced by tests (`packages/web-ui/src/rules.test.ts`, `test/design_rules_test.dart`), so build from their parts and tokens or the test fails.
2. **Branch** off the latest `main` in a worktree of its own (`git worktree add -b feat/<step> ../Gradeon-<step> origin/main`); never write in another agent's checkout. Two agents never take steps that touch the same files at the same time; each step lists its files.
3. **Run your own servers** when another checkout is running: `tools/dev-reset.sh` stops only processes under its own folder; give the second checkout other ports (PostgreSQL, `PORT` in `.env`) and start the admin and console with `GRADEON_API=http://localhost:<port> npx vite --port <port>`.
4. **Keep the rules that have bitten us:** every new school route declares `@RequireModule(...)` or `@Core()`; a new setting goes in `SchoolSettingsSchema` and `SETTINGS_META`; a new module or feature goes in `MODULES` first; data comes in through the import engine; never edit an applied SQL migration (add `NNNN_name.sql`, then `pnpm --filter @gradeon/db build`); declare build-time env in `turbo.json`; `apps/server` reads the API packages from `dist/` (rebuild).
5. **Done means:** the step's tests are written and pass; `pnpm typecheck && pnpm test`, `tool/verify.sh`, `node tools/audit-ui.mjs` and `node tools/e2e-flows.mjs` (with a fresh `dev-reset`) are green; the step's "Done when" is true; HANDOFF gets a short section (what changed, why, what to know); this plan's Status table is updated. Commits are atomic Conventional Commits with the attribution trailer; the owner merges.
6. **Nothing pretends.** A screen for a provider that is not connected says so in plain words; nothing marks money paid or a message delivered that was not.

---

## Phase 3B. Integrations Hub (before Phase 4)

**Why first.** Phase 4 is mostly third parties: SMS with DLT, WhatsApp, email, phone push, payments, file storage, maps for the live bus, later video meetings, accounting and AI. Wired one by one into code, each would be an environment variable, a hard-coded provider and a redeploy to change, which breaks the rule that everything configurable is configured from the console. The Hub makes every third party a **connection** the console creates, tests, routes per school, watches and switches, with secrets sealed and every change audited. Phase 4 then only builds features on top of it.

**What "add a new integration from the console" means.** Three levels, all from the console:

1. **A new account of a built provider** (a second MSG91 account, a school's own Razorpay account): fill a form built from the provider's fields, test, route. No code.
2. **A provider we have not written an adapter for, reached over plain HTTP** (most Indian SMS and WhatsApp gateways, many email APIs): the **Custom HTTP** provider. The console sets the URL, method, headers, a body template with `{to}`, `{text}`, `{templateId}`, `{vars.name}` placeholders, where the message ID is in the reply, and what counts as success. No code.
3. **A provider with signatures, SDK-only flows or webhooks we must verify** (Razorpay, FCM, S3 signing): one adapter file in code implementing the capability's interface, plus its catalogue entry. After that, level 1 applies.

### 3B.1 Concepts and names

| Term | What it is | Where |
|---|---|---|
| **Capability** | What a connection does: `sms`, `whatsapp`, `email`, `push`, `payments`, `storage`, `maps`, `video`, `accounting`, `ai`, `webhook` (send events out) | `packages/contracts/src/integrations.ts` |
| **Provider** | A kind of third party with a built adapter: `msg91`, `gupshup`, `twilio`, `kaleyra` (sms); `meta-cloud`, `gupshup-wa`, `interakt` (whatsapp); `ses`, `smtp`, `resend` (email); `fcm` (push, Android and iOS); `razorpay`, `cashfree` (payments); `s3` (any S3-compatible: AWS, Cloudflare R2, DigitalOcean Spaces, MinIO) (storage); `google-maps`, `mapbox` (maps); `custom-http` (sms, whatsapp, email); `webhook` (outbound events); `sandbox` (the test inbox, always present) | `INTEGRATION_PROVIDERS` in the same file |
| **Connection** | One configured account of a provider: its name, non-secret settings, sealed secrets, state (`draft`, `test`, `live`, `paused`), health | registry table `integration_connections` |
| **Route** | Which connection serves a capability, platform-wide (the default) or for one school (an override), with an optional fallback | registry table `integration_routes` |
| **Template** | A provider-side template a message must use: a DLT template ID for SMS, an approved WhatsApp template name and language, mapped to one of our message keys (`MESSAGE_EVENTS`) | registry table `integration_templates` |
| **Delivery** | One attempt to send a message or event, with its provider ID and status updates from webhooks | registry table `message_log` (replaces `sandbox_messages` as the record; the sandbox connection still fills the Test inbox) |

### 3B.2 Contracts (`packages/contracts/src/integrations.ts`, exported from `index.ts`)

```ts
export const CAPABILITIES = ['sms', 'whatsapp', 'email', 'push', 'payments', 'storage', 'maps', 'video', 'accounting', 'ai', 'webhook'] as const;
export interface ProviderField { key: string; label: string; help?: string; kind: 'text' | 'secret' | 'url' | 'select' | 'number' | 'bool' | 'json' | 'template';
  options?: [string, string][]; required?: boolean; placeholder?: string }
export interface ProviderDef { key: string; name: string; capabilities: Capability[]; state: 'built' | 'planned';
  fields: ProviderField[];            // the console's form is built from this (like SETTINGS_META): a new provider needs no new screen
  testAction: string;                 // what "Test" does, in words ("Sends a text to the number you type")
  webhooks?: { path: string; verifies: string }[];   // inbound events this provider sends us
  docs: string }                      // the provider's docs URL, shown beside the form
export const INTEGRATION_PROVIDERS: ProviderDef[] = [ /* one entry per provider above */ ];
export const ConnectionInput = z.object({ provider: z.string(), name: z.string().min(2).max(60), scope: z.enum(['platform', 'school']),
  schoolId: z.string().optional(), settings: z.record(z.string(), z.unknown()), secrets: z.record(z.string(), z.string()).optional() });
export const RouteInput = z.object({ capability: z.enum(CAPABILITIES), schoolId: z.string().nullable(), connectionId: z.string(),
  fallbackId: z.string().nullable(), settings: z.record(z.string(), z.unknown()).default({}) });   // sender ID, from-address, bucket prefix…
export interface ConnectionRow { id: string; provider: string; name: string; scope: 'platform' | 'school'; schoolId: string | null;
  state: 'draft' | 'test' | 'live' | 'paused'; settings: Record<string, unknown>; secretsSet: string[];   // names only, never values
  health: { ok: boolean; checkedAt: string | null; error: string | null }; usage: { month: string; count: number; costPaise: number } }
```

Custom HTTP's fields: `url`, `method`, `headers` (json, secrets allowed as `{secret.apiKey}`), `body` (template), `messageIdPath` (a dotted path into the JSON reply), `successStatus` (default 2xx), `successPath`/`successValue` (optional), `statusWebhook` (bool: gives a URL the provider can call with delivery reports, and `statusIdPath`, `statusPath` and a mapping of their status words to ours).

### 3B.3 Storage (registry migration `packages/db/migrations/registry/0012_integrations.sql`)

```sql
-- kind: expand
CREATE TABLE "integration_connections" (
  "id" text PRIMARY KEY, "provider" text NOT NULL, "name" text NOT NULL,
  "scope" text NOT NULL CHECK (scope IN ('platform','school')), "school_id" text REFERENCES schools(id),
  "state" text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','test','live','paused')),
  "settings" jsonb NOT NULL DEFAULT '{}', "secrets_sealed" text,            -- seal(JSON.stringify(secrets), SECRETS_KEY)
  "secret_version" integer NOT NULL DEFAULT 1,
  "health_ok" boolean, "health_checked_at" timestamptz, "health_error" text,
  "created_by" text NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_by" text, "updated_at" timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'school') = (school_id IS NOT NULL)));
CREATE TABLE "integration_routes" (
  "id" text PRIMARY KEY, "capability" text NOT NULL, "school_id" text REFERENCES schools(id),   -- null = the platform default
  "connection_id" text NOT NULL REFERENCES integration_connections(id), "fallback_id" text REFERENCES integration_connections(id),
  "settings" jsonb NOT NULL DEFAULT '{}', "updated_by" text, "updated_at" timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX "integration_routes_one" ON integration_routes (capability, coalesce(school_id, ''));
CREATE TABLE "integration_templates" (
  "id" text PRIMARY KEY, "connection_id" text NOT NULL REFERENCES integration_connections(id), "message_key" text NOT NULL,
  "language" text NOT NULL DEFAULT 'en', "provider_template_id" text NOT NULL, "dlt_template_id" text, "approved_text" text NOT NULL,
  UNIQUE (connection_id, message_key, language));
CREATE TABLE "message_log" (
  "id" text PRIMARY KEY, "school_slug" text NOT NULL, "channel" text NOT NULL, "to_addr" text NOT NULL, "message_key" text,
  "subject" text, "body" text NOT NULL, "connection_id" text, "provider_message_id" text,
  "status" text NOT NULL CHECK (status IN ('queued','held','sent','delivered','read','failed','refused')),
  "error" text, "attempts" integer NOT NULL DEFAULT 0, "segments" integer, "cost_paise" integer,
  "send_after" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now(), "sent_at" timestamptz, "updated_at" timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON message_log (school_slug, created_at DESC);
CREATE INDEX ON message_log (status, send_after) WHERE status IN ('queued','held');
CREATE INDEX ON message_log (provider_message_id);
```

Secrets: sealed with `seal()` from `packages/security` (the same AES used for school database URLs); **never** returned by any API (`secretsSet` lists names; the form shows "Set · ending 4F2A" with a Replace button); never logged (add the keys to the error reporter's redaction); replacing a secret bumps `secret_version` and is audited.

### 3B.4 The adapter layer (`packages/integrations`, a new workspace package)

```
packages/integrations/src/
  index.ts            resolve(capability, schoolId) → { connection, adapter }; the registry of adapters by provider key
  types.ts            SmsAdapter { send(to, text, opts: { templateId?, senderId?, vars }) → { providerId, segments } }
                      WhatsAppAdapter { sendTemplate(to, template, lang, vars) / sendText(to, text) }
                      EmailAdapter { send(to, subject, text, html?) }   PushAdapter { send(tokens[], title, body, data) → { failedTokens } }
                      PaymentsAdapter { createOrder(amountPaise, receipt, notes) → { orderId, checkoutUrl }; verify(payload, signature);
                                        refund(paymentId, amountPaise); parseWebhook(headers, raw) → PaymentEvent }
                      StorageAdapter { presignPut(key, mime, maxBytes) → url; presignGet(key, seconds); delete(key); usage(prefix) }
                      MapsAdapter { staticMapUrl(points); eta(from, to) }   Every adapter: test(input) → { ok, detail }; health() → { ok, error }
  providers/          one file per provider: msg91.ts, gupshup.ts, twilio.ts, ses.ts, smtp.ts, resend.ts, meta-cloud.ts, fcm.ts,
                      razorpay.ts, cashfree.ts, s3.ts, google-maps.ts, custom-http.ts, webhook.ts, sandbox.ts
  http.ts             one fetch wrapper: timeout 10 s, two retries on 5xx and network errors with backoff, never retries a 4xx
```

Rules: adapters use `fetch` (Node 24) and the provider's REST API; add an SDK only when signing or a protocol leaves no choice (S3 v4 signing: a 60-line signer, not the AWS SDK; FCM: HTTP v1 with a service-account JWT signed with `node:crypto`). Each adapter has a unit test against a recorded request (no network in tests). `custom-http.ts` renders the templates with the same `{placeholder}` code the message templates use.

**Resolution order** (`resolve`): the school's route → the platform route → `sandbox`. A route whose connection is `paused` or unhealthy uses its fallback. When `MESSAGING_MODE` is `sandbox` (local and staging) **every** message goes to the sandbox, except to numbers and emails on the platform setting `integrations.allowList` (so the team can try a real provider from staging). Production sets `MESSAGING_MODE=live` (`apps/api/src/env.ts` gains `'live'`).

### 3B.5 The console: Integrations Hub

A new item **Integrations** in the console menu, group Operate (`apps/console/src/app/nav.ts`, a new `plug` icon in `IC`, keys `G N`), route `/integrations`, page `apps/console/src/pages/integrations/IntegrationsPage.tsx` built only from `packages/web-ui` parts:

| Tab | What it shows and does |
|---|---|
| **Connections** | Cards grouped by capability: provider, name, scope (Gradeon-wide or a school), state chip, health ("Healthy · checked 3 min ago" / the provider's error in plain words), this month's count and cost. **Add a connection** opens a `Panel`: pick a capability, then a provider (built ones first, then Custom HTTP), then the form built from `fields`; secrets are write-only. Actions: **Test** (runs `testAction`, shows the result inline), **Go live** (a second person approves: new action `integration.live`), **Pause**, **Replace secret**, **Delete** (refused while a route uses it). |
| **Routing** | A matrix: capabilities down the side, "Gradeon default" and each school with an override across; each cell names the connection and its fallback; editing a cell opens the route panel (connection, fallback, sender ID, from-address, bucket prefix). Bulk: apply a route to many schools. |
| **Templates** | Our message keys (`MESSAGE_EVENTS`) against each SMS and WhatsApp connection: DLT template ID, provider template ID, approved text, language. Flags any school whose custom wording (`templates.messages`) no longer matches the approved text (DLT rejects those messages), with the difference highlighted. |
| **Activity** | `message_log` (and payment events): filter by school, channel, status, date; a failure shows the provider's reason and a Retry; totals per school and month for billing. |
| **Webhooks** | The inbound URLs to paste into each provider's dashboard (`https://<host>/hooks/<connectionId>/<token>`), the last ten events received for each, and their signature check result. |

Each **school page** gets an **Integrations** tab (`apps/console/src/pages/school/IntegrationsTab.tsx`): the routes that apply to it (its overrides and the defaults), its own connections (its Razorpay account for settlement, its sender ID), its message volume against its `smsPerMonth` limit, and recent failures. The admin's read-only School setup shows the school which channels are connected ("Texts: on · Payments: Razorpay, test mode").

Permissions (`packages/contracts/src/console.ts`): add `integrations.read` (super admin, implementation, support, auditor) and `integrations.write` (super admin, implementation); add `integration.live` to `ACTIONS` with `needed: true` in `DEFAULT_POLICY` (two people to take a payments or messaging connection live).

### 3B.6 The API (`apps/console-api/src/integrations.ts`, registered in `console.module.ts`)

| Route | Needs | Does |
|---|---|---|
| `GET /console/v1/integrations/catalogue` | `integrations.read` | `INTEGRATION_PROVIDERS` |
| `GET /console/v1/integrations/connections` | `integrations.read` | `ConnectionRow[]` with health and this month's usage |
| `POST /console/v1/integrations/connections` | `integrations.write` | Validates `settings` and `secrets` against the provider's `fields`, seals the secrets, state `draft` |
| `PATCH /console/v1/integrations/connections/:id` | `integrations.write` | Name, settings, secrets (replace), state (`paused`/`test`; `live` only through the approval) |
| `POST /console/v1/integrations/connections/:id/test` | `integrations.write` | Runs the adapter's `test`, stores health |
| `DELETE /console/v1/integrations/connections/:id` | `integrations.write` | Refused while a route or template uses it |
| `GET/PUT /console/v1/integrations/routes` | read / write | The routing matrix; PUT takes `RouteInput[]` |
| `GET/PUT /console/v1/integrations/templates` | read / write | Template mapping |
| `GET /console/v1/integrations/activity` | `integrations.read` | Paged `message_log` with filters |
| `POST /console/v1/integrations/activity/:id/retry` | `integrations.write` | Re-queues a failed message |
| `POST /hooks/:connectionId/:token` (public, on the server) | the token and the provider's signature | Delivery reports update `message_log`; payment events go to the payments handler (Phase 4.4). Raw body kept for signature checks |

Every write is in `console_audit` (`integration.created`, `.changed`, `.secret_replaced`, `.routed`, `.live`, `.paused`). A job (`scheduleJob(pool, 'integrations.health', 15 min, …)`) checks every live connection and posts to `ALERT_WEBHOOK_URL` when one turns unhealthy; messaging routes fall back automatically and say so in Activity.

### 3B.7 Moving the code onto the Hub

1. `Messenger.send` (`apps/api/src/school/support.ts`) writes a `message_log` row (`queued`, or `held` with `send_after` in quiet hours) and hands it to the sender; the sender resolves the route, calls the adapter, records `sent`/`failed`. Sign-in codes (`auth.service.ts:164`) send at once, skip quiet hours and use the fastest route (a separate `sms.otp` route setting may name a transactional connection).
2. `smsThisMonth` counts `message_log` (sent or delivered SMS segments), and the school's `smsPerMonth` limit refuses (with a clear message) once reached.
3. The console's **Test inbox** reads `message_log` rows sent through the sandbox; `sandbox_messages` stays readable for old rows and is dropped in a later contract migration.
4. The 2A list's "Integrations" row is these routes; no school setting holds a credential.

### 3B.8 Tests and done

Tests: `packages/integrations` unit tests (each adapter's request against a recording; Custom HTTP templating; resolution order and fallback; sandbox and allow-list); `apps/console-api/test/integrations.test.ts` (secrets are sealed and never returned; a provider's required fields are enforced; going live needs a second person; a route to a paused connection uses its fallback; a webhook with a bad signature is refused and a good one updates the delivery); `apps/api/test` (the absence alert lands in `message_log` with the right route; quiet hours hold it with `send_after`; the SMS limit refuses); a browser flow: create a Custom HTTP SMS connection pointing at a local echo server, test it, route a school to it, mark a student absent, see "delivered" in Activity.

Done when: every capability in Phase 4 is reached only through a route; a connection can be added, tested, routed, taken live (two people), paused and replaced from the console with no deploy; secrets never leave the server; a provider failure falls back and alerts; Activity shows every message's fate; the docs (HANDOFF, `docs/integrations.md` with one section per provider: where to get the keys, the DLT steps, the webhook URL) are written.

Rough size: 2–3 weeks (contracts and storage 2 days; adapters 1 week, parallel by provider; console 1 week; moving the Messenger 2 days).

---

## Phase 4. Make what exists real

Each track turns a screen that looks finished into a feature that works for a real school. Tracks 4.1 to 4.4 need the Hub (3B); they can run in parallel once it is merged because their files do not overlap.

### 4.1 Messages that reach people (B5): first, because families sign in with a code

**Start outside the code now:** register the company and every template on DLT (Jio, Airtel, Vodafone Idea, BSNL portals; takes weeks), choose an SMS provider and a WhatsApp business provider, set SPF/DKIM for the sending email domain. Record the IDs in the Hub's Templates tab.

Steps:
1. **Templates match DLT.** `MESSAGE_EVENTS` (`packages/contracts`) gets, per message, the variables it uses; the Templates tab maps each to a DLT template; the console refuses a school's custom wording for SMS that does not match an approved template and says which words differ. WhatsApp uses approved templates outside the 24-hour window.
2. **A real queue.** Messages are `message_log` rows: a worker (track 4.2) sends `queued` rows and `held` rows whose `send_after` has passed, three tries with backoff, then `failed` with the provider's reason. Quiet hours now actually hold messages until `notify.quietTo`.
3. **Delivery reports** arrive on the Hub's webhook and set `delivered`/`failed`; the admin's message history and the console's Activity show them.
4. **Email** via the Hub (SES, SMTP or Resend): plain text plus a simple HTML version built from one layout with the school's name and colours.
5. **Push** (with 4.5): FCM HTTP v1 through the Hub; tokens from the app (4.5); invalid tokens removed on the provider's answer.
6. **Limits and costs:** SMS segments counted per school per month against `smsPerMonth`; cost per segment from the connection's settings; the plan card and billing read them.
Tests: queue order and retries; quiet hours; DLT mismatch refused; delivery report updates; limit reached. Done when: a family's sign-in code, an absence alert and a fee reminder reach a real phone on staging through the allow-list, with delivery shown.

### 4.2 Jobs (B7): a queue on PostgreSQL, no new server

`jobs` (registry 0007) runs timed work once across servers (`packages/db/src/jobs.ts`). Add a queue for per-school work:
1. Registry migration `0013_job_queue.sql`: `job_queue (id, school_id, kind, payload jsonb, run_at timestamptz, status ('queued','running','done','failed'), attempts, locked_until, last_error, created_at)`; index on `(status, run_at)`.
2. `packages/db/src/queue.ts`: `enqueue(kind, schoolId, payload, runAt)`, `work(kinds, handler)` claiming with `SELECT … FOR UPDATE SKIP LOCKED` and a lease (`locked_until`), so a crashed run is picked up again.
3. Kinds: `messages.send` (4.1), `fees.reminders` (daily per school: invoices due in `fees.remindDaysBefore` days, once per invoice per day), `fees.lateFines` (daily: `fees.lateFeePct` on overdue invoices, idempotent per invoice and month, audited, shown on the receipt), `reports.scheduled`, `imports.run` and `exports.run` (move the import engine's long runs off the request), `files.scan` and `files.thumb` (4.3), `payments.reconcile` (4.4), `retention.erase` (4.8).
4. The console's Health page lists queued, running and failed jobs per school, with Retry.
Done when: reminders and late fines run every day without anyone pressing a button (the two `notUsedYet` settings lose that mark), and a server restart loses no work.

### 4.3 Files (B6)

1. **Storage** through the Hub (`storage` capability; one bucket per region with a prefix per school `schools/<slug>/`).
2. School migration `0011_files.sql`: `files (id, kind ('homework_submission','homework_attachment','notice_attachment','chat','student_photo','student_document','logo','gallery','receipt','report_card'), owner_id, name, mime, bytes, sha256, storage_key, scanned ('pending','clean','infected'), width, height, thumb_key, created_by, created_at, deleted_at)`.
3. **Upload flow:** `POST /v1/files` (module per kind) returns a presigned PUT and a file ID; the client uploads straight to storage; `POST /v1/files/:id/done` checks size and type and queues `files.scan` (ClamAV in the worker image, or the provider's scanning) and `files.thumb` (images resized to 320 and 1280 with `sharp` in the worker); downloads are presigned GETs valid five minutes, checked against the reader's permission and module.
4. **Wire every place that keeps only a name today:** homework hand-ins (`family.service.ts:235`) and attachments, notice attachments (`attachments: []` today), chat attachments, student photos and documents (admin student panel; app profile), the school's logo image (a new setting `brand.logoFileId` used by the admin mark, sign-in pages and the app), gallery albums with photo consent (`privacy.photoConsent` respected per student), printed receipts and report cards as PDFs.
5. **Usage:** a nightly job sums `bytes` per school; the console's usage card shows it against `storageGb` (today it shows 0) and refuses uploads past the limit.
6. **Migration:** new import kind `photos` (a zip matched by admission number) and `documents` (HANDOFF §15).
App: `image_picker` and `camera` are already dependencies; upload with progress, retry, and a size check before upload.
Done when: every file feature works end to end on staging with real storage, infected files are refused, and storage usage is real.

### 4.4 Payments (B8)

1. **Razorpay through the Hub**, each school with its own account (its money settles to it) or the Route product under one Gradeon account; the console chooses per school.
2. School migration `0012_online_payments.sql`: `payment_orders (id, invoice_id, student_id, amount, provider_order_id, status ('created','paid','failed','refunded','partial_refund'), provider_payment_id, method, created_by, created_at, paid_at)`.
3. **App:** `POST /v1/f/fees/:invoiceId/order` (feature `fees.onlinePayment`) creates the order and returns a hosted checkout URL; the app opens it with `url_launcher` (no SDK), and returns by deep link; the screen polls the order until the webhook marks it paid. `family.service.ts:348` stops marking fees paid itself.
4. **Webhook** (`payment.captured`, `payment.failed`, `refund.processed`) through `/hooks/…`: verified, idempotent per provider payment ID, writes the receipt through `fees.pay` with `method: 'online'` and the provider reference.
5. **Refunds** from the admin's receipt (permission `fees.refund`, a second person above a console-set amount); **reconciliation** job daily: provider settlements against receipts, mismatches listed in the admin's Fees page and the console.
6. **GST receipts** (feature `fees.gstReceipts`): GSTIN, HSN/SAC and tax lines on receipts where the school's fee heads are taxable.
Done when: a parent pays a real ₹1 in test mode and live mode on staging, the receipt appears once even if the webhook repeats, a refund reverses it, and the settlement report reconciles.

### 4.5 The app: push, deep links, offline

1. **Push:** add `firebase_messaging` (the one dependency this needs); register the token after sign-in at `POST /v1/f/devices` (school migration: `devices (id, user_id, platform, token, app_version, last_seen)`); remove on sign-out; the Messenger's `push` channel sends to the person's devices.
2. **Deep links:** every notification carries a route (`/fees`, `/homework/:id`, `/notices/:id`, `/chat/:threadId`, `/attendance`); the app opens it (cold and warm start), and asks to sign in first when needed. App links on `gradeon.app` for the payment return and invites.
3. **Offline:** the last loaded data of Home, timetable, fees, homework and notices is kept (encrypted with the existing secure storage key) and shown with "Last updated 10:42" when offline; writes queue and send when back online (attendance marking first).
Done when: on real Android and iPhone devices a notification opens the right screen from a cold start, and Home works in airplane mode.

### 4.6 One app or one app per school, without deciding yet

The app already takes its colours (palette from the console), name, modules and layout from the server. Remaining: the logo image (4.3), app icon and splash per school in the build workflow (`.github/workflows/mobile-build.yml`: icons from the console's build form), and the **shared app's school finder** (a code or phone number → the school's address) for the one-app option. CI builds both on every change. The store ID is fixed before the first store release.

### 4.7 Beta modules made real: library, transport, gallery

Each gets its admin pages (built from `packages/web-ui`), real data instead of the app's demo, its importer (Phase 3 engine), and leaves beta in the catalogue:
- **Library:** catalogue, copies, issue and return with due dates, fines, reservations, the app's shelf and search.
- **Transport:** routes, stops with times, vehicles and drivers, students per stop, route fees (fees module), the live bus: a driver's phone (the teacher app in a "driver" role, or a GPS device through a Hub `maps`/`gps` connection) posts positions; the app shows the bus and the stop ETA; parents are told when the bus is near (a message key).
- **Gallery:** albums by class and event with photos from storage (4.3), photo consent respected, the app's gallery and viewer on real data.

### 4.8 Year-end

Promotion to the next class (a preview by class, exceptions for detained students, run as a batch with undo), a new academic year (copies structure, fee heads and timetable as a draft), carry-forward of dues, archived years read-only, leaving dates and transfer, and `privacy.retentionMonths` acting through the `retention.erase` job (two people in the console before anything is erased).

---

## Phase 5. New modules from the features master

### 5.1 The module contract (a module is not done until every line is true)

| # | Item | Where |
|---|---|---|
| 1 | Catalogue entry: key, name, state (`planned` → `beta` → `live`), dependencies, features inside it, limits, price | `MODULES` in `packages/config-engine/src/modules.ts` |
| 2 | Permissions it adds, attached to roles in the role templates | `packages/contracts/src/permissions.ts` |
| 3 | School migration (new file) and the tables | `packages/db/migrations/school/NNNN_<module>.sql` |
| 4 | API: every route `@RequireModule('<module>')` or a feature, plus a permission | `apps/api/src/school/<module>.service.ts` and controller |
| 5 | Admin pages built only from `packages/web-ui` (Page, Card, table, Dialog, Panel, fields), menu entries in `adminNav` | `apps/admin/src/pages/<module>/` |
| 6 | App screens (if families or teachers use it) with empty, loading and error states and a dock or home entry in `APP_CATALOG` | `lib/features/<module>/` |
| 7 | Messages it sends: keys in `MESSAGE_EVENTS` with defaults, templates and DLT text | contracts + Hub Templates |
| 8 | Importer and exporter through the one engine | `IMPORT_KINDS`, `packages/db/src/import/kinds.ts` |
| 9 | Reports and dashboard widgets | admin Reports page |
| 10 | Audit entries for every change | `audit` |
| 11 | Settings it needs, in `SchoolSettingsSchema` and `SETTINGS_META` (console only) | contracts |
| 12 | Tests: API (module off → refused; permissions), browser flows, app widget tests, import round trip | `apps/api/test`, `tools/e2e-flows.mjs`, `test/` |
| 13 | Design guards pass (colours, type, scales); light, dark, 360 to desktop; owner's review | `rules.test.ts`, `design_rules_test.dart` |
| 14 | Docs: HANDOFF section and help text in plain words | `docs/` |

### 5.2 Wave A: needed to switch (in this order)

| Module (key) | Tables (school DB) | Admin | App | Messages | Import | Notes |
|---|---|---|---|---|---|---|
| Academic setup screens (`core`) | years, terms, working days, holidays, periods and bells, subjects, houses (most exist) | Classes and calendar grows tabs for each, behind the `*.schoolEdits` switches | reads only | — | `structure` kinds exist | Locks come from the console |
| Fees structures (`fees` features `structures`, `concessions`, `lateFines`, `gstReceipts`, `refunds`) | fee_heads, structures by class and category, concession rules, fine rules | Fee setup: heads, structures, rules; bulk invoice generation per term | shows breakdown | `fees.invoiced` | `fees.structures` | Late fines run in 4.2 |
| Staff attendance and leave (`staff`) | staff_attendance, leave_types, leave_balances, leave_requests | Staff roll, leave approvals, balances | teacher app: mark own attendance, apply leave | `leave.staff.*` | `staff.leave_balances` | Biometric later (wave C) |
| Certificates and ID cards (`certificates`) | certificate_templates, issued_certificates (number series) | Issue TC, bonafide, character, study; ID cards for a class to PDF | download issued certificates | `certificate.issued` | past TCs (PDF, 4.3) | Templates use the school's heading settings |
| Report cards (`exams` features `reportCards`, `hpc`) | grading scales, report_card_templates, published report cards | Board formats (CBSE, state boards), NEP Holistic Progress Card, remarks, publish | report card viewer and PDF | `exam.reportcard` | past report cards (PDF) | Grading scales are console settings |
| Digital diary and classwork (`diary`) | diary_entries by class and date | Teachers post daily | families read, acknowledge | `diary.new` | — | |
| Transport administration (`transport`) | routes, stops, vehicles, assignments, route fees | see 4.7 | see 4.7 | `bus.near` | `transport.*` | |
| Visitor and gate pass (`gate`) | visitors, passes, pickups by authorised adults | Front desk screen, phone-number lookup, photo (4.3) | parent pre-approves a pickup | `gate.pickup` | — | |
| UDISE+ export (`compliance`) | — | Export in the official format | — | — | — | Read from existing data |
| Tally export (`accounting`) | ledger mappings | Map fee heads to ledgers, export day book (XML) | — | — | — | Hub `accounting` capability later for live sync |

### 5.3 Waves B and C

B (grows value): payroll and HR; study material and online tests; parent-teacher meeting booking (Hub `video` for online meetings); helpdesk and grievances; surveys; health and infirmary; behaviour; hostel; inventory; alumni; a multi-campus view for trusts. C (sets Gradeon apart): the AI assistant (Hub `ai`, behind the existing assistant switch), at-risk alerts, report-card comment drafts, smart reminder timing, biometric and RFID attendance, canteen wallet. Each meets 5.1, starts as `beta` for one pilot school (Phase 2B), and lists its tables and screens here before work starts.

---

## Phase 6. Ready for real schools

1. **Pilot:** one friendly school on production, moved in with Phase 3, watched daily for four weeks (a checklist: messages delivered, payments reconciled, errors, support requests), then three more.
2. **Load:** a generated 3,000-student school and 50 schools at once on staging (`tools/generate-school.mjs`); budgets: admin pages under one second, app screens under 300 ms from cache, the morning attendance burst of every school at once without errors.
3. **Security and law:** penetration test by a vendor; DPDP Act: consent (built), data-rights requests end to end (Compliance page), breach process, data kept in India (hosting), signed agreements per school.
4. **Stores:** Play Store and App Store listings for whichever app decision is made (both built since 4.6); privacy labels; review notes with a demo school.
5. **Support:** help centre and in-app help, runbooks (restore a school, rotate a secret, a provider is down: use the Hub to switch), incident process, a status page (the admin's status board exists), response time per plan.
6. **Billing:** plans, add-ons, SMS and storage usage and invoices from the console, matching entitlements and the Hub's usage.

---

## The quality bar ("impeccable")

- Every page and screen: designed, reviewed by the owner, works at phone, tablet and desktop widths, light and dark, with a school's own colours, with real empty, loading and error states.
- The design systems are enforced by tests; a value off the system is a failing build, not a review comment.
- Nothing pretends: no screen shows a feature that does not work for real; demo-only parts are hidden in production.
- Fast on cheap Android phones and slow networks; judged on release builds.
- Every important action is audited; risky ones can be undone or need a second person.
- Hindi and Marathi across app and admin (then more Indian languages), plain wording everywhere.

---

## Order and rough size

Sizes assume one owner plus coding agents, working in parallel where files do not overlap.

| Step | Depends on | Rough size | Can run in parallel with |
|---|---|---|---|
| Phases 0–3 | — | done | — |
| Design systems (both) and console-configurable colours | — | done (branch `feat/design-system`) | — |
| **Phase 3B Integrations Hub** | design systems merged | 2–3 weeks | DLT registration (owner), hosting (owner) |
| 4.1 Messages | 3B; DLT and a provider (owner) | 1–2 weeks | 4.2, 4.3 |
| 4.2 Jobs queue | — (start with 3B) | 1 week | 3B |
| 4.3 Files | 3B (storage) | 2 weeks | 4.1, 4.4 |
| 4.4 Payments | 3B; Razorpay account (owner) | 2 weeks | 4.3 |
| 4.5 Push, deep links, offline | 4.1 | 1–2 weeks | 4.7 |
| 4.6 App delivery | 4.3 (logo) | 1 week | any |
| 4.7 Library, transport, gallery | 4.3 | 3 weeks | 4.8 |
| 4.8 Year-end | 4.2 | 1–2 weeks | 4.7 |
| Phase 5 wave A | 4.x as each module needs | 6–10 weeks | module by module |
| Phase 6 pilot | waves above as needed by the pilot school | 4 weeks of watching | — |

---

## Decisions

**Decided:** every configuration, roles included, is set from the console by Gradeon staff; everything that can be configured is configurable, **every colour of the admin, the app and the console included** (Nov 9); the school's own data stays with the school inside limits the console sets (Nov 5); one process serves every school, so each deploy migrates every school and releases sign schools off rather than stage code (Nov 5); **third parties are connections in the console's Integrations Hub, never hard-coded** (Nov 9).

**Open.** None of them stops the coding work, but item 4 (an SMS provider) stops a pilot. Until the owner decides, the work uses the working value in brackets, kept in one place (configuration or environment), so a later decision is a change of value:

1. **Names** (domain `gradeon.app`, app ID `com.gradeon.app`, npm scope `@gradeon`, mascot and design-system names as they are). The app ID must be final before the first store release.
2. **One Gradeon app or one app per school** (both are built; see 4.6).
3. **Hosting in India** (staging stays on the current free track until then).
4. **Providers:** SMS with DLT registration (**start now: the pilot waits for it**), WhatsApp business provider, email, Razorpay (the sandbox connection and gateway test mode until then), object storage, and an alert webhook (`ALERT_WEBHOOK_URL`). Each becomes a Hub connection, so choosing one is configuration, not code.
5. **Pilot school** and its current system (realistic generated files until then).
6. **Plans and prices** for the module catalogue, and which features each plan leaves out (the three current plans, with no feature differences, until then).
7. **Fonts** stay Manrope and Bricolage Grotesque (admin, console) and Anek (app) until the owner chooses otherwise; colours are already per school.
