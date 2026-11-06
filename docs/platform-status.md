# Platform build status (2026-11-06; Phases 1 to 3 of docs/production-plan.md, whose Status section is the detail)

Merged to `main` (work branch `feat/platform`). The plan is `docs/superpowers/specs/2026-10-14-gradeon-platform-design.md`; this file says what of it exists.
Deploying the free test track: `docs/deploy-free-test.md`. The full hand-off (decisions, how to continue, what is left) is `docs/HANDOFF.md`; the design concept is `docs/DESIGN.md`. Live test deployment: `https://gradeon.onrender.com` (admin `/`, console `/console/`).

## What exists and is checked

| Part | Where | Checks |
| --- | --- | --- |
| Workspace (pnpm + Turborepo), CI, Render blueprint | root, `.github/workflows`, `render.yaml` | `pnpm build`, `typecheck`, `test` all green |
| Contracts, config engine, security, db (schemas, migrations, migrator, Greenfield seed, the import engine), tenancy, api-client, web-ui | `packages/*` | 4 + 9 + 4 + 13 + 1 + 6 + 9 unit tests |
| School API (sign-in with code, lockout, refresh rotation, students, attendance, fees, invoices, approvals, timetable, homework, exams, staff, admissions, reports, messages, events, dashboard, settings and plan usage, search, audit, support-session read-only tokens, the family API) | `apps/api` | 57 tests on a real PostgreSQL |
| Console API (blueprints, wizard, provisioning drivers, approvals, release sign-off in waves (every school is migrated at start-up), migrations, one-server timed jobs, streaming backups, cells, health, support, flags and kill switches, billing, compliance, team, sandbox inbox, build callback, demo seed on first start) | `apps/console-api` | 29 tests; schools are really created and signed in to |
| One process: both APIs, the admin at `/`, the console at `/console/` | `apps/server` | production build run locally and audited |
| School admin: sign-in, dashboard, students, timetable, attendance, fees, invoices, homework, exams, staff, admissions, reports, messages, events, notices, classes and calendar, moving in (files to Gradeon, imports and totals, family and staff invites, letters, export), settings (General, Modules, App layout, Roles and access, Notifications, Message templates, Privacy and consent, Audit log), phone home and dock, public status page, design-system page | `apps/admin` | see below |
| Console: sign-in, fleet, school (overview, entitlements, configuration, roles, migration (import, fix, undo, test school, export), versions, health, audit), onboarding wizard, releases (editable waves), migrations, cells (add, manage, move a school), builds, flags (with kill switches), blueprints and rules, health, approvals, support, test inbox, billing, compliance, team | `apps/console` | see below |
| App: with the `SCHOOL` and `API_BASE_URL` build profile it signs in for real and reads the family API (`/v1/f/*`); without it, demo content | `lib/` + `apps/api/src/school/family.*` | `flutter test` 43 pass, 12 family API tests, a live probe against a running school |

UI checks, all repeatable:

- `node tools/audit-ui.mjs`: every page of both apps at 360, 390, 768 and 1440 wide, light and dark. Fails on console errors, failed calls, sideways scroll and anything clipped or outside the window.
- `node tools/e2e-flows.mjs` (45 flows, including classes and calendar, moving in and migration): sign-in errors, add student, dashboard approval, timetable clash fix and publish, roll call, settings and its tabs, search and shortcuts, phone dock, homework, exams, staff, admissions, invoices, reports, messages, events, console release, flags, cells, compliance, team, support and erase guards, billing, the dropdown, the collapsed menu.
- `node tools/scan-gaps.mjs`, `scan-fit.mjs`, `scan-scroll.mjs`, `scan-cutoff.mjs`: uneven columns and blank cards; tabs and pills that do not fit; slow scroll areas and headings that scroll away; text cut off.
- `node tools/e2e-onboard.mjs`: onboards a new empty school through the console wizard, signs in to it with the code from the test inbox, and screenshots every admin page (the brand-new-school states).
- `node tools/shot.mjs <url> out.png [w] [h] [--dark] [--console] [--audit] [--do '[...]']`: one screenshot, signed in.

## Not done, on purpose or not yet

- **Mobile**: library catalogue and reservations, gallery, transport stops and live position, assistant, push registration, offline store, deep links; moving `lib/` to `apps/mobile`, the Gradeon picker app, store pipelines and code push (plan section 19). A real phone and the liquid glass shader were not checked.
- **Admin**: none of the new pages has had the owner's design review (no canvas boards exist for them); no Hindi or Marathi for admin text; quiet hours only mark sandbox messages as held.
- **Console**: a data-copying move between servers (aws-cell), catalog update offers, real backups beyond Neon, release deployment that does more than record versions, Razorpay and GST invoices.
- **Hosting and security**: only the free test track; tokens are still in `localStorage` (plan section 17 asks for cookies, CSP, passkeys, TOTP, rate limits per IP, a password reset flow); AWS, Razorpay and SMS providers need the owner's accounts.
- **Not verified**: a real phone, iOS, the live console (its sign-in is the owner's). The live admin was audited after the last deploy.
- Visual match with the canvas was checked by eye against the boards, not by pixel diff, because the pages show real data and the boards show sample data.

## Rules worth remembering

- Never regenerate migrations once a real database has applied them: add a new file (the migrator refuses changed files).
- `tools/dc-to-tsx.mjs` and `convert-all.sh` are for the first import of a board only. The generated views have been edited by hand since.
- Pages not in the canvas are composed only from approved components (`packages/web-ui`, `apps/console/src/console.css`).
