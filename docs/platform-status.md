# Platform build status (2026-11-08; Phases 0 to 3 of docs/production-plan.md are done, whose Status section is the detail)

Everything below is on `main`. The long-term design is `docs/superpowers/specs/2026-10-14-gradeon-platform-design.md`; this file says what of it exists.
Deploying the free test track: `docs/deploy-free-test.md`. The hand-off (decisions, how to continue, what is left) is `docs/HANDOFF.md`; the design concept is `docs/DESIGN.md`. Live test deployment: `https://gradeon.onrender.com` (admin `/`, console `/console/`).

## What exists and is checked

| Part | Where | Checks |
| --- | --- | --- |
| Workspace (pnpm + Turborepo), CI, Render blueprint | root, `.github/workflows`, `render.yaml` | `pnpm build`, `typecheck`, `test` all green |
| Contracts, config engine (modules, features, plans, layered settings), security, db (schemas, migrations, migrator, backups with bring-forward, the import engine, Greenfield seed), tenancy, nest-kit (errors, alerts, rate limits), api-client, web-ui | `packages/*` | unit tests in each package |
| School API: sign-in (password and code; codes capped per account), refresh rotation, password reset, students, attendance, fees, invoices, approvals, timetable, homework, exams, staff, admissions, reports, messages, events, dashboard, school setup (read-only), change requests, moving in, the family API with consent, default deny on every route | `apps/api` | tests on a real PostgreSQL, including the plan matrix (`plan.test.ts`) |
| Console API: blueprints, wizard, provisioning drivers, approvals, entitlements and the module catalogue, configuration (history, rollback, templates, preview), roles, requests, migration (import with Excel templates and dropdowns, contact lists for families without a phone, undo, test school, readiness, dues reconciliation), release sign-off in waves (every school migrated at start-up, four at a time), one-server timed jobs, daily backups, weekly restore drills, alerts, cells, health, support, flags and kill switches, billing from the entitlement, compliance, team, sandbox inbox, build callback | `apps/console-api` | tests that really create, migrate, back up and restore schools |
| One process: both APIs, the admin at `/`, the console at `/console/`; JSON logs in production | `apps/server` | production build run locally and audited |
| School admin: sign-in (privacy notice behind "Privacy"), dashboard, students, timetable, attendance, fees, invoices (receipts print the school's heading), homework, exams, staff, admissions, reports, messages, events, notices, classes and calendar, moving in (files to Gradeon, Excel templates with dropdowns, typing a register in, imports and totals, invites and consent by class, letters, export), school setup (read-only, "Ask Gradeon to change this"), phone home and dock, public status page, design-system page | `apps/admin` | see below |
| Console: sign-in, fleet, modules (every school against every module), school (overview, entitlements, configuration, roles, migration, versions, health, audit), onboarding wizard, releases, migrations, cells, builds, flags, blueprints, health (heartbeats, errors, restore drills), approvals, requests, support, test inbox, billing, compliance, team | `apps/console` | see below |
| App: with `SCHOOL` and `API_BASE_URL` it signs in for real and reads the family API (`/v1/f/*`) and the school's configuration (tabs, Home cards and order, quick buttons, languages, privacy and consent, the school's mark); without them, sample content for development | `lib/` + `apps/api/src/school/family.*` | `flutter test` (including the console-driven layout tests), family API tests |

UI checks, all repeatable:

- `node tools/audit-ui.mjs`: every page of both apps at 360, 390, 768 and 1440 wide, light and dark. Fails on console errors, failed calls, sideways scroll and anything clipped or outside the window.
- `node tools/e2e-flows.mjs` (50 flows): sign-in errors, add student, dashboard approval, timetable clash fix and publish, roll call, school setup, search and shortcuts, phone dock, homework, exams, staff, admissions, invoices, reports, messages, events, classes and calendar, moving in, console modules, plan, migration, release, flags, cells, compliance, team, support and erase guards, billing, the dropdown, the collapsed menu.
- `node tools/scan-gaps.mjs`, `scan-fit.mjs`, `scan-scroll.mjs`, `scan-cutoff.mjs`: uneven columns and blank cards; tabs and pills that do not fit; slow scroll areas and headings that scroll away; text cut off.
- `node tools/e2e-onboard.mjs`: onboards a new empty school through the console wizard and screenshots every admin page (the brand-new-school states).
- `flutter test test/tool/shoot_test.dart --dart-define=SHOOT_ROLE=parent|teacher|guest`: every app screen, headless, in any theme and size.

## Not done, on purpose or not yet

- **Needs the owner (accounts, vendors, decisions):** an SMS provider with DLT registration (until then every text, including family sign-in codes, goes to the test inbox), WhatsApp and email providers, a separate staging service, India hosting with point-in-time recovery and object storage, the alert webhook, a penetration test, the bug sweep on real phones, Razorpay, prices and plan packaging, brand art and fonts, and the design review of pages without canvas boards.
- **Phase 4 (make what exists real):** messages through real providers and the quiet-hours queue; the job queue for reminders by date and late fines; file storage (photos, documents, attachments, gallery, logo image); payments; library catalogue, transport stops and live bus, gallery (these modules are marked beta); push, deep links and an offline cache in the app; year-end (promotion, leaving dates, so record retention can act).
- **Phase 5:** report cards and certificates (and their headings), the modules marked "planned" in the catalogue, the assistant (OCR of paper forms), Tally.
- **Not verified here:** a real phone, iOS, the live console (its sign-in is the owner's).
- Visual match with the canvas was checked by eye against the boards, not by pixel diff, because the pages show real data and the boards show sample data.

## Rules worth remembering

- Never edit a migration once a real database has applied it: add a new file (the migrator and CI refuse changed files).
- `tools/dc-to-tsx.mjs` and `convert-all.sh` are for the first import of a board only. The generated views have been edited by hand since.
- Pages not in the canvas are composed only from approved components (`packages/web-ui`, `apps/console/src/console.css`).
