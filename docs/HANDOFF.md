# Hand-off guide

Written 2026-10-18 and updated 2026-10-19 for whoever continues this work (a person, or another Claude account with no memory of the earlier sessions). Read it top to bottom once, then use it as a reference. It says what was asked, what was built, **how and why it was built that way**, what is left, and **how to do each remaining part**.

Related files: [`README.md`](../README.md) (overview and run commands), [`AGENTS.md`](../AGENTS.md) (rules for the Flutter app and agent workflow), [`docs/platform-status.md`](platform-status.md) (short status table), [`docs/deploy-free-test.md`](deploy-free-test.md) (deploying), [`design/README.md`](../design/README.md) (the design boards), [`docs/superpowers/specs/2026-10-14-gradeon-platform-design.md`](superpowers/specs/2026-10-14-gradeon-platform-design.md) (the full plan, 1,150 lines; section numbers below refer to it).

---

## 1. The brief, as the owner gave it

The owner (Kaushal) runs Gradeon. In order, over several sessions:

1. Built a Flutter school app (students, parents, teachers) on mock JSON, redesigned as "Chalk & Glass". Done on branch `redesign/chalk-glass`.
2. Asked for a plan for a platform around it: an **admin panel** (school staff), a **console** (Gradeon developers/staff), a **backend**, all in **one repository**, role-based access, a configurable app so features can be shown/hidden without code changes. The result is the 1,150-line plan.
3. Designed the admin and console in a design canvas ("Nest" language), then said: the design is "crazy and impeccable" but **replace the childish parts** (pencil-shaped columns, the fee jars, the bird mascot "Nesti") — **in the build, not in the canvas**. Also: onboarding a school and deploying for it must be done **from the console and be configurable** (blueprints, deploy targets). The test deployment must be **hosted free** and all three (app, admin, console) must work together there.
4. Final instruction: "implement the entire plan end to end", design **byte-identical to the canvas** except the childish items, jars become filled bars, **no UI bugs** ("I do not want to go through the debugging arc, so test thoroughly"), **deploy on Render** (it is fine if it shuts down), keep it **free**, ask for step-by-step instructions when something needs the owner (accounts), and **bars must not be thin**.
5. After the first deploy the owner reported a black screen. That was two real bugs (section 8.4), fixed.
6. Then: build everything still marked "coming soon" and fix the admin and console UI bugs (overlapping or cut-off things, no scrollbars). Done in the second session (section 12).
7. Then two rounds of UI bug reports: empty spaces, dropdowns clipped behind cards, the browser's dropdown, heavy toggles, charts without tooltips, glow effects, slow scrolling, the collapsed menu that could not be expanded; then distorted timetable tabs, columns ending unevenly (Reports, Events), laggy scroll areas and table headings that scroll away. Fixed in shared code, with scan scripts so they stay fixed (section 13). The owner's rule from this round: **never fix empty space by making a card bigger**.

Standing rules from the owner: no Chalk & Glass in admin/console; admin and console are one consistent language; the login has an animation and **vibrating errors**; empty pages have artwork; smooth animation everywhere; no themed metaphors beyond the references the owner picked (see `design/README.md`).

What "the entire plan" means in practice: the plan's build order (section 24) has 11 steps and describes a production system for 500 schools on AWS. That cannot be finished in one go. What was built is the **free test track slice of steps 0–2, 8 and parts of 3–5**: a working multi-tenant backend, the school admin for the core jobs, a complete console, provisioning from the console, and a free hosted deployment. Section 9 lists precisely what is left.

## 2. What exists

### 2.1 Running system

- **Deployed test track:** `https://gradeon.onrender.com` (Render free web service `gradeon`, Neon Postgres). Admin at `/`, console at `/console/`. Demo school at `/s/greenfield`. See section 8.
- **Local:** `bash tools/dev-reset.sh` plus the two Vite dev servers (README).

### 2.2 Code by area

| Area | Path | What it does |
| --- | --- | --- |
| Shared types | `packages/contracts` | zod schemas and TypeScript types for every request/response of both APIs, the 7 provisioning `STEP_KEYS`, permission keys, console roles/permissions, date helpers (IST). Everything that crosses the wire is defined here first. |
| Config engine | `packages/config-engine` | Module manifests (which modules exist, what each requires), plans, `closeModules` (add required, drop dependents), `resolveConfig` (layers: platform defaults, plan entitlements, school settings, platform locks, audience), `validateSettingsChanges` (schema + locks), `contrastRatio` (WCAG, used for brand colours). |
| Security | `packages/security` | scrypt password hashing, AES-256-GCM `seal/unseal` for connection strings, HS256 JWT sign/verify, constant-time compare. |
| Database | `packages/db` | Drizzle schemas for the school database and the registry; **hand-reviewed SQL migrations** with `-- kind: expand|backfill|contract` headers; migrator (advisory lock, checksums, refuses edited applied files); the Greenfield seed (1,498 students, 42 classes, 24 days of attendance, fees, timetable with one deliberate teacher clash, approvals); `dev.ts` starts a throwaway PostgreSQL with `pg_ctl`. |
| Tenancy | `packages/tenancy` | `Registry` (looks up a school by slug, unseals its URL, 15 s positive / 5 s negative cache) and `PoolManager` (LRU of connection pools per school). |
| Nest kit | `packages/nest-kit` | `ApiError` with machine codes and field errors, `ZodPipe`, `ApiExceptionFilter`. |
| API client | `packages/api-client` | `createHttp` (bearer token, `X-School` header, one refresh-and-retry on 401, sign-out when refresh fails, network-error message) plus `schoolApi` and `consoleApi` typed from contracts. Tested. |
| Web UI | `packages/web-ui` | The Nest design as React: `nest.css` (verbatim from the canvas), `shell.css` (menu stickiness, dock, sheet, account menu), `blocks.css` (grid, status pills, usage bars, key-value rows, tables, option cards, support banner), `Shell`, `Sidebar`, `Dock`, `Palette` (Ctrl K), `Dialog`, `Toast`, `Field`/`SelectField`/`useShake`, `Select` and `Pop` (dropdown and menu drawn on the page root so nothing clips them), `Tooltips` (`data-tip`), `EvenRows` (lines up side-by-side columns), `SegFit` (sizes segmented knobs), `EmptyCard`, 12 illustrations, `Roll` digits, `useTheme`, `useMedia`, and the sign-in page (`login/`). `controls.css` holds the dropdown, tooltip and switch; `polish.css` (loaded last) the scroll, fit and sticky-header rules. |
| School API | `apps/api` | NestJS 11 on Fastify. Sign-in (password then one-time code; 5 wrong passwords lock the account for 15 minutes; a code lasts 10 minutes with 3 tries; demo code only in demo schools), refresh-token rotation with replay detection, students (list/filter/sort/page, summary, views, detail, create, CSV import/export, message, assign fee), attendance (day view, roll call save, reminders), fees (summary, invoices, payments with receipts, reminders), approvals (decide with undo), notices (draft → pending → published, approval rule from settings), timetable (view, loads, teacher options, patch, cover, publish with clash detection), dashboard (+shell data), settings (versioned, locks, audit, plan usage), search, audit log, health, metrics. Homework, exams, staff, admissions, invoices, reports, messages, events, data requests and the family API for the app (`/v1/f/*`). Permission guard (`@Require`) and module guard (`@RequireModule`, which also honours kill switches). 57 tests on a real PostgreSQL. |
| Console API | `apps/console-api` | Auth (password + code, sessions), schools, plans, catalog, **wizard** (drafts, review, dry run, launch), **provisioning** (blueprints + drivers `local`, `free-test`, `aws-cell`; runs with per-step logs, retry, skip optional), **actions** (suspend, resume, erase, push entitlements, run migrations, set domain, build app, backup) with **second-person approval** and typed confirmation, **releases** in waves with auto-halt and rollback, migrations view, health prober and incidents, support sessions (read-only signed token for one school), flags, billing (monthly invoices, idempotent), team, audit (filterable per school), policy (approvals, waves, halt thresholds, freeze), sandbox message inbox, build callback, demo seed on first start, cells, compliance desk. 29 tests. |
| Server | `apps/server` | One process: both APIs, and (if `apps/admin/dist` and `apps/console/dist` exist) serves the admin at `/` and the console at `/console/` with SPA fallback and long caching for hashed files. |
| School admin | `apps/admin` | Sign-in, dashboard (widgets can be hidden), students, timetable, attendance roll call, fees, **invoices and receipts, homework, exams with a marks grid and results, staff, admissions board, reports with CSV, messages inbox, events calendar**, notices, phone home and dock, design-system page, support banner, a public status page at `/status`. Settings: General, Modules, **App layout, Roles and access, Notifications, Message templates, Privacy and consent**, Audit log. |
| Console | `apps/console` | Fleet, school (Overview/Entitlements/Versions/Health/Audit), onboarding (list + 7-step wizard with drafts), **cells (add, manage, close to new schools, move a school)**, releases (**editable waves**), migrations, mobile builds, flags (**with kill switches**), blueprints (**new blueprint, step parameters, rollout rules, maintenance window**), health, approvals, support, test inbox, billing, **compliance desk (agreements, 72-hour breach clock, sub-processors)**, team, an alerts dialog on the bell. |
| Mobile app | `lib/` | Original demo app. Built with `--dart-define=SCHOOL=<slug> --dart-define=API_BASE_URL=<address>` it runs on **the school's real data**: `ApiClient` (token, `X-School`, one refresh), real password + code sign-in, and every Remote repository reads the family API (`/v1/f/*`, section 9.3). Without those defines it is the demo app on mock JSON. |
| Tooling | `tools/` | `audit-ui.mjs`, `e2e-flows.mjs`, `e2e-onboard.mjs`, `shot.mjs`, `dev-reset.sh`, `provision-demo.mjs`, plus one-time conversion scripts (section 5). |
| Delivery | `render.yaml`, `.github/workflows/ci.yml`, `mobile-build.yml`, `.node-version` | Render blueprint; CI (platform build+types+tests, Flutter analyze+test; green on GitHub); Android build workflow started by the console. |

### 2.3 How the pieces behave (the parts that are not obvious)

- **Tenant selection.** School API calls carry `X-School: <slug>`. The admin gets the slug from the URL: `/s/<slug>/...` (router basepath), or `<slug>.<VITE_BASE_DOMAIN>` if that build variable is set, or `VITE_DEFAULT_SCHOOL`. A bare host name is **not** treated as a school (that was a deployed bug, section 8.4).
- **Sign-in.** `POST /v1/auth/login` returns either `{step:'otp', challenge}` or tokens (when the school turned two-step off). The code goes to the **sandbox inbox** (console → Test inbox). Demo schools (setting `demo.mode`) also return `demoCode` so the page can offer "Type the demo code". The console never returns the code in production (`NODE_ENV=production`), so on a hosted test track the code is the owner's `DEMO_CODE` environment value.
- **Settings.** Versioned: a save sends `expectedVersion`; a stale one gets a conflict. Locked keys (set by the platform per school) are read-only in the UI and refused by the API. The admin never writes `modules.enabled` outside the plan (`closeModules` + entitlement check).
- **Roles.** Permissions are strings (`students.read`, `settings.write`...). A role template bundles them; users get roles. The UI hides or disables what a permission does not allow and the API enforces it.
- **Support sessions.** The console issues a JWT with `support: true`, the school as audience, read permissions only and 30 minutes (display says one hour max). The admin reads it from `#support=<token>`, shows a red frame and "End session", and the API refuses non-GET requests from it.
- **Provisioning.** `Blueprints.pick(target, plan)` chooses the active blueprint; `Provisioner` runs enabled steps in order, saving a log after each; a restart marks interrupted runs failed so they can be retried from the failing step. Steps are idempotent (database step reuses an existing database).
- **Modules per school (Phase 2B).** The catalogue (`MODULES` in `config-engine`) lists every module and the features inside it; a school's entitlement holds its modules, features switched off, per-module dates and its trial end. `activeModules` and `activeFeatures` say what it has today, and `resolveConfig` hands that to the admin and the app. The school API's `PermissionsGuard` refuses anything outside it, and refuses any route that does not declare `@RequireModule(key)` or `@Core()`. The console's Modules page and each school's Entitlements tab push changes through `entitlements.push`; taking anything away needs a second person.
- **Releases.** One process serves every school, so the code reaches every school when it is deployed, and the server migrates every school's database at start-up before it takes requests (`Bootstrap.upgradeSchools`). A release is a version name plus waves computed from policy (`internal`, `pilot`, `rest`): starting it signs schools off wave by wave with health checks and halts on a breach; "roll back" puts the previous version labels back. It does not stage or undo code (redeploy for that); real staged deployments need a second cell.
- **Timed jobs** (backups, OTP/session sweep, console sweep, health probes) go through `scheduleJob` (`packages/db/src/jobs.ts`): a `jobs` row in the registry is claimed atomically, so one server runs each job, and a job that fell due while the server slept runs when it wakes.
- **Backups** stream gzipped JSON lines table by table (`packages/db/src/backup.ts`, format 2; format 1 still restores). Set `BACKUP_DATABASE_URL` to keep them outside the registry. A full-year 3,000-student-sized school: backup 2 s, restore 33 s, about 130 MB of memory.
- **Connection pooler ready:** statement and idle-transaction limits are database defaults (school 0007, registry 0008), not connection options, and the migrator locks per transaction, so PgBouncer or Neon's `-pooler` address works. Default pools: 20 schools × 3 connections.
- **Free test track database layout.** `free-test` schools get a database on the same Postgres server as the registry (`SHARED_PG_ADMIN_URL`): the driver creates a role `school_<slug>_app` and a database `school_<slug>` and stores the sealed connection string. If `NEON_API_KEY` is set it creates a Neon project per school instead.

## 3. Design decisions and why

| Decision | Why |
| --- | --- |
| **Database per school** (not `school_id` + row-level security) | One missed filter would leak children's data between schools; per-school backup, restore, erasure and moves become trivial. Cost: a registry and a pool manager. (Plan section 6 and section 25.) |
| **TypeScript monorepo (pnpm + Turborepo), NestJS on Fastify, Drizzle, zod contracts** | One language for admin, console, API; contracts shared so a changed field breaks the build everywhere. Drizzle over Prisma: many small databases, no heavy per-database client. |
| **Hand-reviewed SQL migrations with expand/backfill/contract kinds** | During a deploy the previous instance keeps serving while the new one migrates every school, so every migration must be safe while old code still runs (contract only after the code that used the old shape is gone). The migrator verifies checksums; **never edit an applied migration, add a new file**. |
| **Config in data, layered** | The owner wants to show/hide features without code. Layers make "who may change what" explicit (platform locks beat school settings). |
| **Console-driven onboarding through editable blueprints** | The owner wants onboarding and deployment to be configurable. A blueprint is data; a target picks drivers. The same wizard works on a laptop, the free track and (later) AWS. |
| **Second-person approval for risky actions; typed confirmation for erase** | Erasing or suspending a school is irreversible or disruptive; one person must not be able to do it alone. |
| **Read-only support access with a short signed token and a visible banner** | Support must see what staff see without ever being able to change data; the banner prevents forgetting. |
| **Admin and console on the "Nest" language; mobile keeps Chalk & Glass** | Owner decision. They share one stylesheet (`nest.css`) so they cannot drift. |
| **Canvas → React by converter, then hand edits** | The boards were drawn in a design tool; converting preserves markup and class names exactly (the "byte-identical" requirement) instead of re-drawing. After the first import they are normal React files. |
| **Page CSS scoped by `.pg-<page>`; shared pieces in `blocks.css`** | Board CSS reuses short class names (`.sm`, `.err`, `.big`, `.roll`), which collided when pages shared one stylesheet. Scoping per page fixed that; new pages reuse only the shared blocks. **Beware new class names**: `.roll` already exists in `nest.css` (rolling digits); a page-level `.roll` collapsed a card (renamed `.rcall`). |
| **One free web service serves everything** | Render's free tier gives one always-on-ish service; serving the SPAs from the API process means no CORS, no URLs to wire, one cold start. In production they are separate (CDN for SPAs). The console is built with Vite `base: /console/` (`CONSOLE_BASE`). |
| **Phone: a different home screen plus a dock; other pages stack** | The canvas has a phone board with a dock. `useIsPhone()` swaps the dashboard for `PhoneDashboard`; the dock and a "More" sheet replace the side menu under 900 px on every page. |
| **Menu is sticky** (`.fr{overflow:clip}`, `.sb{position:sticky}`) | On a long page the menu used to scroll away. `overflow:hidden` would break sticky; `clip` keeps the rounded frame. |
| **Settings page saves only changed keys with the version** | Prevents clobbering, and gives a precise audit entry. |
| **Seed demo school on first start** (`SEED_DEMO=true`) | A hosted test track must have something to show without anyone running a script. |
| **Console never returns the sign-in code in production** | Otherwise the code would add no security on a public host. |
| **UI checks are scripts, not screenshots by eye** | The owner does not want a debugging arc. `audit-ui.mjs` finds overflow/clipping/errors across 4 widths × 2 themes; `e2e-flows.mjs` clicks the real flows. They found real bugs (stale memo hid the search box, clipped buttons, dead layout at 360 px). Keep them green. |

## 4. The design canvas

Saved in the repository at `design/canvas/` and described in [`design/README.md`](../design/README.md): the boards, how to view them (`preview.html`), how they became React, the **deliberate differences** (mascot, pencils, dots, jars replaced; fake features removed; password field on console sign-in; disabled SSO/Passkey; account menu; thicker bars) and the owner's design rules. Read it before touching any page.

## 5. How the code was produced (so you can reason about it)

1. `tools/dc-to-tsx.mjs <Board> <page> <dir>` turned a board into `<page>.view.tsx`, `<page>.css` (scoped), `<page>.logic.txt` (the board's own script) and `<page>.aside.txt` (the board's menu, replaced by the shared `Sidebar`): references while porting, removed afterwards; the board in `design/canvas` is the reference. `tools/convert-all.sh` lists what was converted. **Do not re-run it over edited views.**
2. One-time Python scripts then edited the converted views (real values, working controls, extra states); they were removed in 2026-11 once applied, and git history has them.
3. Each page has a `<Page>Page.tsx` hook that owns data and state and passes a values object to the view. Pages without a board use `app/Page.tsx` (admin and console each have one) and the shared blocks.
4. Data comes from TanStack Query with query keys like `['students', ...]`; mutations invalidate by key prefix (`predicate`), so a payment refreshes the fees page, the student list and the dashboard together.
5. Every write that can fail on the server shows its message through `Field` errors (red, vibrating) or a toast; every list has an `EmptyCard` state; every page has loading and error states.

## 6. Running, checking, debugging

Commands are in the README. Practical notes learned the hard way:

- `bash tools/dev-reset.sh` **hangs in the foreground of some shells**: run it in the background and poll `/tmp/reset.log` for "Greenfield is live".
- The dev server (`tsx src/main.ts`) imports `@gradeon/api` and `@gradeon/console-api` **from their `dist/`**. After changing either, run `pnpm --filter @gradeon/api build` (or `console-api`) and restart, or you are testing old code.
- Editing frontend files while `audit-ui.mjs` runs triggers Vite hot reload and produces false "hook order" errors. Finish edits, then audit.
- `e2e-flows.mjs` changes demo data (approves, publishes, adds a student). Re-run `dev-reset.sh` before the next full run; `ONLY="text"` runs matching flows.
- Git Bash rewrites values starting with `/` (`CONSOLE_BASE=/console/` becomes a Windows path): prefix `MSYS_NO_PATHCONV=1`. Large quote-heavy heredocs in some tool shells fail: write files with an editor tool.
- Running a second server against the **same dev PostgreSQL** with a new registry and `SEED_DEMO=true` re-creates the role `school_greenfield_app` with a new password and breaks the local demo school. Use `dev-reset.sh` afterwards.
- Vite dev: admin proxies `/v1` to port 4000; console proxies `/console` and `/v1`.
- The Flutter SDK on the owner's machine is `D:\dev\flutter` (`docs/dev-environment.md`).

## 7. Testing strategy

- Unit: contracts, config engine (layers, locks, contrast), security, db (migrator, seed invariants), api-client (refresh, sign-out), web-ui helpers, registry.
- API: `apps/api/test/{api,modules,family}.test.ts` (57) and `apps/console-api/test` (29) run against a real PostgreSQL started by the tests; schools are really provisioned and signed in to.
- Layout scans (section 13): `tools/scan-gaps.mjs`, `scan-fit.mjs`, `scan-scroll.mjs`, `scan-cutoff.mjs`.
- UI audit and flows as above; CI runs build, typecheck, tests and Flutter analyze/test on every push (`.github/workflows/ci.yml`; the browser scripts need running servers, so they are run by hand, ideally before every deploy).
- **Not covered:** pixel comparison against the canvas (pages show real data, boards show sample data), real devices, iOS, screen readers beyond labels and roles, load.

## 8. The deployment

### 8.1 What runs

One Render web service `gradeon` (free, Singapore, auto-deploys from `main`; work on a branch only reaches the live site once merged to `main`) runs `node apps/server/dist/main.js`. Build command (in `render.yaml`): `corepack pnpm install --frozen-lockfile --prod=false && CONSOLE_BASE=/console/ corepack pnpm exec turbo run build --concurrency=2` (avoid `corepack enable` — it tries to write shims under `/usr/bin` and fails with EROFS on Render). Neon (free) holds the registry and each school's database.

### 8.2 Environment variables (set in Render → Environment)

| Variable | Meaning |
| --- | --- |
| `REGISTRY_DATABASE_URL`, `SHARED_PG_ADMIN_URL` | The Neon **direct** (non-pooled) connection string, for both. |
| `SECRETS_KEY` | Seals school connection strings. **Never change it**: every school becomes unreadable. |
| `JWT_SECRET` | Signs tokens. Changing it signs everyone out. |
| `BOOTSTRAP_EMAIL`, `BOOTSTRAP_PASSWORD` | The first console super admin (created only when no console user exists). Changing the password later does nothing; use the console's Team page. |
| `DEMO_CODE` | The six-digit second step for console sign-in. |
| `SEED_DEMO=true`, `ALLOW_DEMO=true` | Creates the Greenfield demo school if missing. Production refuses `SEED_DEMO` and `DEMO_CODE` unless `ALLOW_DEMO=true`, which only the test track sets. |
| `ALERT_WEBHOOK_URL` | Optional. A Slack or Discord incoming webhook: new kinds of error, a school not answering (and back), a failed daily backup or restore drill, a school not migrated at start-up. Without it, alerts only reach the log. |
| `BACKUP_DATABASE_URL` | Optional. Keeps school backups in a database of their own instead of the registry (recommended in production). |
| `TENANT_MAX_POOLS`, `TENANT_PER_POOL` | Connection pools: schools held open × connections each (defaults 20 × 3). |
| `BUILD_CALLBACK_TOKEN`, `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH` | Android builds (optional). |
| `RENDER_EXTERNAL_URL` | Provided by Render; used as the admin/API base address. |

### 8.3 Free-tier behaviour

Sleeps after 15 minutes idle; the first request takes about a minute (the pages show skeletons meanwhile). Neon free: 0.5 GB. Anyone with the address can open the demo school (public demo credentials). A restart interrupts a school setup in progress; the console shows it failed and offers Retry.

### 8.4 The first-deploy black screen (fixed) and what it teaches

Two independent bugs: (1) `CONSOLE_BASE` never reached the console build because **Turborepo strips environment variables it is not told about**; the console's assets were requested from `/assets/` (admin's folder) and 404'd, leaving a blank page. `turbo.json` now lists `CONSOLE_BASE` and `VITE_*` in the build task's `env`. (2) The admin treated the first part of any host name with three parts (`gradeon.onrender.com`) as a school address, asked for school `gradeon`, got "not found", and showed that message in black on the dark page. Host-based schools now only count under `VITE_BASE_DOMAIN`, and the not-found screen is a styled card. Lesson: test the **production build served the way production serves it** (`node apps/server/dist/main.js`, assets under the real base) and with a host name that is not `localhost`/`127.0.0.1`. `tools/audit-ui.mjs` can target it with `API=… ADMIN=… CONSOLE=…`.

### 8.5 Redeploying and troubleshooting

Push or merge to `main`, or Render → service → Manual Deploy → Deploy latest commit. Logs: Render → Logs. A health check hits `/health`. If the console shows a blank page, check `index.html`'s asset paths start with `/console/`. If sign-in says the school was not found, check the address is `/s/<slug>`. If provisioning a school fails at the database step, check `SHARED_PG_ADMIN_URL` is the direct string and its role can `CREATE ROLE` and `CREATE DATABASE`.

## 9. What is left, why, and how to do it

**This section was written on 2026-10-19.** Much of it has been done since (sections 14 to 17); the current list of what is left, and why, is the Status section of `docs/production-plan.md`. Lines below that have changed are marked *(now: …)*.

Status against the plan's build order (section 24), as of 2026-10-19: **0** foundations — partial (monorepo, CI done; no Dart workspace/Melos, no `apps/mobile` move, no ADR folder, no OpenTofu/EKS/Argo; `docs/DESIGN.md` covers both surfaces). **1** platform core — done for the test track (tenancy, identity with code + password, permissions, config engine, audit, provisioning with three drivers); missing passkeys/TOTP, files/jobs/realtime/renderer, the 500-school synthetic fleet and tenancy property tests. **2** vertical slice attendance — done, including the app on the real API; no push. **3** people and academics — mostly (students, staff, admissions, timetable, homework, exams with marks and results, events calendar; no report-card designer, certificates, subjects/years UI). **4** finance — partly (invoices, payments, receipts, reminders, reports; no Razorpay, autopay, late fees, reconciliation, Tally). **5** communication — partly (notices with approvals, events with replies, family messages, templates and notification rules; no real SMS/WhatsApp/email/push providers, no realtime chat). **6** operations — partly (leave; transport route and library loans read-only; no live bus, catalogue or gallery). **7** admin experience — every menu page and settings tab exists; no setup checklist, year-end rollover, live app preview or guided tours. **8** console complete — done for the test track (cells, move-school bookkeeping, blueprints and parameters, compliance desk, status page, kill switches); missing catalog update offers and data-copying moves. **9** mobile distribution — Android workflow only. **10** production readiness — not started.

Why not done: the plan describes a production system for 500 schools over eleven steps; the owner asked for the whole plan, but a free, working, tested slice that all parts share had to come first, and each remaining item is a feature-sized project (a backend module, its admin screens and, for most, the app screens). Items that need the owner's accounts or paid services (AWS, Razorpay, SMS/WhatsApp providers, Apple/Google store accounts) cannot be done without them.

### 9.1 Add an admin page (the pattern, and what is already built)

Built on 2026-10-18: homework, exams (marks grid, ranks, publish), staff, admissions (enquiry → applied → test → offer → enrolled), invoices and receipts, reports (7, with CSV), messages (family inbox), events (calendar and replies), data requests. Backend: `apps/api/src/school/{learning,people,office,family}.service.ts` with controllers in `modules.controllers.ts` and `family.controller.ts`; migrations `0001`–`0003` under `packages/db/migrations/school/`; sample content in `packages/db/src/seed/modules.ts` (also applied to an existing demo school at start, `Bootstrap.upgradeDemo`). To add another page:

1. **Contracts first** (`packages/contracts/src/modules.ts`, permissions in `permissions.ts`).
2. **Migration:** a new SQL file (kind header; never edit an applied file), the Drizzle table in `schema.ts`, and demo content in `seed/modules.ts` (guarded so it can run twice).
3. **Service + controller** with `@RequireModule`, `@Require`, `ZodPipe`, audit entries; tests in `apps/api/test/modules.test.ts`.
4. **api-client** method, then the page (copy `HomeworkPage.tsx` or `InvoicesPage.tsx`: `Page`, shared blocks, `EmptyCard`, `Dialog`, `Segmented`, kit helpers in `app/kit.tsx`), route in `router.tsx`, menu entry in `app/nav.ts`, module manifest in `config-engine/src/modules.ts`.
5. Add the route to `tools/audit-ui.mjs` and a flow to `tools/e2e-flows.mjs`. Pages without a canvas board still need the owner's design review (none of the pages above has had one).
6. Messages sent by the school go through `Messenger.notify(key, …)` so Notifications and Message templates apply; add the message to `MESSAGE_EVENTS` in `contracts/src/modules.ts`.

### 9.2 Settings tabs

All built (`apps/admin/src/pages/settings/panels.tsx`). Roles and access edits `roles` (custom roles, a role cannot grant what its author lacks, the principal role is fixed; people get changes at their next sign-in). App layout edits `app.dock/home/quick` (resolved against enabled modules into `config.app`). Notifications edit `notify.rules` and quiet hours; Message templates edit `templates.messages`; Privacy edits `privacy.*` and keeps data requests. *(now: the settings live in the console's Configuration tab; the admin's Settings became the read-only School setup. The app reads `config.app` (tabs, Home cards in order, quick buttons) and asks families for consent; quiet hours still only mark messages as held until the Phase 4 queue.)*

### 9.3 The mobile app on real data

Done: the family API (`apps/api/src/school/family.{service,controller}.ts`, `/v1/f/*`, tested in `apps/api/test/family.test.ts`) answers in the shapes the app's models already parse, scoped to the signed-in parent or teacher. `lib/core/network/api_client.dart` is the real client (tests in `test/remote_api_test.dart`); `RemoteAuthRepository` signs in with password then code (`OtpRequired`), and the demo cards work against a demo school because it hands out its code. `test/tool/live_probe_test.dart` reads every screen's data from a running school and parses it with the app's models (run it after `dev-reset.sh`, see its header). Demo family on Greenfield: parent Priya (children Aarav and Ananya) and teacher Kavita; password `nest2026`, code `424242`. Students do not sign in.

Not done *(now: the shell follows `/v1/config`: tabs, Home, quick buttons, profile tiles, languages, consent)*: library (only loans, no catalogue or reservations), gallery (empty), transport (route only, no stops or live position), assistant, push registration, offline store, deep links; moving `lib/` to `apps/mobile`, the Gradeon picker app, store pipelines and code push (plan section 19). A real phone was not checked *(the liquid glass shader is no longer used: `Glass` is a solid fill)*.

### 9.4 Hosting and production (plan sections 5–11, 18–22)

Everything here needs paid or owner-owned services: AWS accounts and OpenTofu for cells (EKS, RDS/Aurora or per-cell Postgres, Valkey, S3, KMS), Argo CD, Cloudflare for domains (the `domain` step currently records the address; implement the Cloudflare/Route53 driver and certificate validation in `drivers.ts`), the **GitHub App** for build-profile commits, Razorpay (billing and school fee payments), SMS (DLT), WhatsApp, email and push providers (replace the `Messenger` sandbox in `apps/api/src/school/support.ts` with providers behind the same interface), Sentry/Grafana. The `aws-cell` driver exists and needs `CELL_<KEY>_ADMIN_URL` per cell.

### 9.5 Security hardening before real schools

Done: access JWT (15 min, HS256, `iss`/`aud`/`alg`/`typ` checked, key derived per audience, `JWT_SECRET_PREVIOUS` for rotation). Web refresh tokens are httpOnly `SameSite=Strict` cookies with CSRF double-submit (`gd_csrf` + `x-csrf`) and Origin check; the phone keeps the refresh token in the body and in `flutter_secure_storage`. Admin and console keep the access token in memory *(now: nothing reads tokens from browser storage)*. `AuthGuard` checks `sid` and `users.token_version` on every request (about 30 s cache). `POST /v1/auth/logout-all`. Helmet (HSTS, CSP, Referrer-Policy, Permissions-Policy), production refuses `CORS_ORIGINS=*`, `@fastify/rate-limit` (300/min) plus stricter login/verify/refresh limits, 256 KB body limit (2 MB on CSV import), scrypt N=32768 with rehash, school indexes and daily OTP/session sweep, `statement_timeout` / `idle_in_transaction_session_timeout` as database defaults, `TENANT_MAX_POOLS` × `TENANT_PER_POOL`. Deploying this signs everyone out once (new keys and cookies).

Still open: passkeys; SSO (the sign-in buttons are disabled placeholders); CSP nonces, Trusted Types and SRI; penetration test. *(now done: TOTP for console staff, password reset by code, a cap of five codes per account in fifteen minutes, consent in the app, data requests including erasure, full export.)*

Remove the public demo credentials from any environment with real data; keep `DEMO_CODE`/`SEED_DEMO` off (production refuses them unless `ALLOW_DEMO=true`).

### 9.6 Console gaps

Done on 2026-10-18: creating a cell, editing it, closing it to new schools, moving a school (bookkeeping on the test track: cells of one kind share a database server), blueprint creation and step parameters, release waves and maintenance window, kill switches (`kill.<module>` flags stop the module in the school API within 15 seconds and remove it from the config), compliance desk, public status page, alerts dialog, `api_version` set at provisioning.

Still open: a move that copies data between servers (aws-cell), catalog "update available" offers (plan 12.4), release "deployment" that does more than record versions, invoices via Razorpay and GST documents, targets as data (they are still the three built-in drivers).

### 9.7 Quality items

- Run the owner's review on every page that has no board; adjust spacing/wording on request.
- A pixel-diff harness against `design/canvas` with matching sample data (Playwright + `pixelmatch`, both installed).
- Screen-reader pass; keyboard-only pass of the wizard and dialogs; Hindi/Marathi strings for admin and console (the sign-in language switch only stores the choice; admin text is English).
- Per-surface `PRODUCT.md`/`DESIGN.md` (plan step 0).
- Small known items: the Greenfield seed's homework "handed in" times can be later than the latest school day; `package` unit tests for `apps/admin` and `apps/console` do not exist (the browser scripts cover them).

## 10. Things that went wrong (so they are not repeated)

- Environment variables vanished in Turborepo (8.4). Always declare build-time env in `turbo.json`.
- A hook-based page cached its values in `useMemo` without the menu/search state in its dependencies, so Ctrl K never opened on the dashboard. When a page builds a values object in `useMemo`, include every piece of shared chrome state.
- Class-name collisions between pages and `nest.css` (`.roll`, `.sm`, `.err`, `.big`, `.act`, `.sw`) collapsed layouts. Scope page CSS; check new class names with a search in `nest.css`.
- Case-insensitive file systems: `roll.ts` vs `Roll.tsx` collided on Windows (renamed `digits.ts`).
- Dev tooling: see section 6.
- A flaky assumption in tests: the demo code only exists for demo schools. A real new school's code is in the test inbox (`e2e-onboard.mjs` reads it from there).

## 11. If you only have an hour

1. `README.md` → run locally.
2. `node tools/audit-ui.mjs --quick` and `node tools/e2e-flows.mjs` to see the baseline is green.
3. Pick a section 9.1 page (Attendance shows the shape; Homework is the most valuable next, then Exams and Staff), follow the steps, keep the audit and flows green, push, and check the Render deploy.

## 12. Second session (2026-10-18): what changed and what to know

- **UI bugs fixed across both apps** (`packages/web-ui/src/polish.css`, loaded last): visible themed scrollbars everywhere, scroll shadows on anything that scrolls, the menu fits short windows (account block pinned, hidden scrollbar removed), long lists scroll inside their card (`.lscroll`), tiles size to their own width (container queries), phone tables keep their main columns, names wrap to two lines instead of being cut. `tools/scan-cutoff.mjs` finds text cut by an ellipsis, hidden-scrollbar areas and clipped boxes (audit-ui does not).
- **Traps found**: `.nest .rw` has a fixed `height:64px` (a table row that wraps needs `height:auto`); `Page` loads `pages.css`, the settings page does not, so shared controls live in `web-ui/blocks.css`; `h2` titles in `.card>.ch` need `min-width:max-content` or they wrap one letter at a time beside chips.
- **Checks**: `pnpm typecheck && pnpm test` (API 57, console API 29), `tools/audit-ui.mjs`, `tools/e2e-flows.mjs` (36 flows then, 38 now), `tool/verify.sh`.

## 13. UI fix sessions (2026-10-18/19): what changed, why, and the rules that came out of it

Everything below is in shared code (`packages/web-ui`), so it applies to every page of both websites.

| Owner's report | Root cause | Fix | Where |
| --- | --- | --- | --- |
| Dropdowns hidden behind cards | Menus were positioned inside cards with `overflow` and inside page headers that later cards painted over | `Select` and `Pop` render in a portal on the `.nest` root with fixed coordinates, flip upward near the bottom, close on outside click; `.hd` sits above the cards (`z-index`) | `Select.tsx`, `controls.css`, `polish.css` |
| The browser's own dropdown | Native `<select>` | `Select` with a search box above 10 options and full keyboard support; every `<select>` replaced; the e2e flows pick options with a `pick()` helper | `Select.tsx`, pages, `tools/e2e-flows.mjs` |
| Heavy toggles | 48×28 switch with a springy shadowed knob | 38×22 flat switch | `controls.css` |
| Charts not interactive | The dashboard's hover bubble had no hover rule | One `Tooltips` component mounted by `Shell`; `data-tip` on marks; every `.us` usage row gets a tooltip automatically | `Tip.tsx` |
| Glow | Radial gradients, coloured shadows, pulsing rings, 5 px focus halos | All removed; focus is a crisp 1 px line | `nest.css`, page CSS |
| Collapsed menu could not be expanded | The hidden text still took width and pushed the toggle out of the 88 px menu | Collapsed header stacks logo and toggle; names in tooltips; account menu opens beside the menu in a portal | `Sidebar.tsx`, `polish.css` |
| Empty spaces | Grids aligned to start, narrow wrappers (`maxWidth: 560`), a 780 px cap on settings | Layouts rearranged: full-width rows, tiles, two-column modules, the roles and templates list above the editor, summary tiles on near-empty console pages, wide empty states with the picture beside the words. **Stretching cards was tried and rejected by the owner** | page files, `empty.css` |
| Columns ending unevenly | Side-by-side columns of different content heights | `EvenRows`: on a row marked `data-even`, the lists marked `data-even-scroll` give up height (they scroll inside) or show more of a capped list, so columns end on one line without stretching anything; `data-even="fill"` and `data-fill` let a last list grow to the bottom of the window. Measured with `offsetTop`/`offsetHeight`, so entry animations do not confuse it; `scrollbar-gutter: stable` so capping does not rewrap text and loop | `EvenRows.tsx` (unit-tested in `ui.test.ts`), `blocks.css` |
| Distorted timetable tabs | The board-converted views sized the segmented knob from guessed text widths | `SegFit` measures the selected tab after every change, resize and font load | `SegFit.tsx` |
| Slow, laggy scrolling | The reduced-motion rule set only `transition-duration: 1ms`, which enabled `transition: all` on every element (Windows' "animation effects off" turns reduced motion on); scroll areas repainted painted-in shadows; tooltips opened and closed while rows slid under the mouse | `transition: none` under reduced motion; plain scroll backgrounds and `will-change: scroll-position`; tooltips wait until scrolling stops | `nest.css`, `polish.css`, `Tip.tsx` |
| Table headings scrolled away | — | `.grd.th` is sticky inside scrolling tables; on phones the first column is sticky while the table scrolls sideways | `polish.css` |

Also fixed: the timetable's "Not placed yet" rows showed no subject (`u.n` instead of `u.name`), empty states nested in cards showed a second frame and title, grids asked for more width than a phone has (`minmax(min(Npx,100%),1fr)`), and a dangling selector at the end of `apps/admin/src/app/pages.css`.

New scan scripts (need running servers, like the audit):

- `tools/scan-gaps.mjs`: side-by-side columns ending more than 16 px apart, blank inside cards, content stopping short of the right edge, holes under the last card (informational: a short page has space under it).
- `tools/scan-fit.mjs`: segmented knobs off their tab, text wrapping inside a pill, text outside its box, `undefined`/`NaN`/`null` or a dangling `·` shown as text.
- `tools/scan-scroll.mjs`: frame times while each scroll area scrolls, and column titles that scroll away.

Traps from these sessions: Vite on this machine binds `localhost` (IPv6) unless started with `--host 127.0.0.1`, and the tools use `127.0.0.1`; `dev-reset.sh` stops every Node process of the repository, including the Vite servers, so start them again after it.

## 14. Phase 1 and 2A (2026-11-04/05): what changed and what to know

The plan is `docs/production-plan.md` (its Status section lists what is done). The rules that now hold:

- **Schools configure nothing.** The school API has no settings or role writes; `settings.write` and `roles.manage` are gone (migration `0006_roles_config_to_console`). The console API owns configuration (`apps/console-api/src/config.ts`): `GET/PATCH /console/v1/schools/:id/config` (stale version → 409; keys marked `risky` go through Approvals as `config.apply`), rollback, roles, staff roles, templates, preview and the requests schools send. **A new setting** goes into `SchoolSettingsSchema` and `SETTINGS_META` (`packages/contracts/src/settings-meta.ts`); the console's Configuration tab renders it with no new screen. Mark it `notUsedYet` until something acts on it.
- **Accounts.** Family logins are made when a student is added, imported or enrolled (`students.service.ts` `create`); families sign in with `POST /v1/auth/code`; `POST /v1/auth/reset/start|finish` resets a password (codes carry a purpose, migration `0005`). Tokens carry `kind`; family tokens only reach `/v1/f`, `/v1/auth`, `/v1/me`, `/v1/config`, `/v1/brand`, `/v1/errors` (`guards.ts`). Console staff use an authenticator app unless `DEMO_CODE` is set (test track).
- **Operations.** Errors: `error_reports` in the registry, fed by the exception filter and `POST /v1/errors` / `POST /console/v1/errors`; listed on the console's Health page. Backups: `packages/db/src/backup.ts` (gzipped JSON of every table, any PostgreSQL), daily per live school, kept 14, restore needs a second approver. Receipt numbers are taken under an advisory lock.
- **Browser tools** send their token as a request header (`setExtraHTTPHeaders`); the admin and console keep tokens in memory only and come back from the refresh cookie.
- **App.** `SchoolConfig` (`lib/core/services/school_config.dart`) loads `/v1/config` when the shell opens; family tabs come from `app.dock` and `ShellController.showTab('chat')` takes a tab key. A release build needs `SCHOOL` and `API_BASE_URL`.
- **Checks**: `pnpm typecheck && pnpm test`, `tools/audit-ui.mjs`, `tools/e2e-flows.mjs`, `tool/verify.sh`; CI runs all of them, plus `tools/check-name.mjs` and `tools/check-migrations.mjs`.

## 15. Phase 3, moving in (2026-11-06): what changed and what to know

- **The import engine** is `packages/db/src/import`: `engine.ts` (preview, commit, undo, templates, export, the Fedena and Entab presets), `kinds.ts` (one `Impl` per kind: `load` lookups, `check` a row, `writes` as `{table, pk, cols, rows}`, `totals`, `export`, optional `notes`), `files.ts` (CSV, .xlsx reader, ZIP writer) and `sample.ts` (the realistic test school). The kinds and their columns are in `packages/contracts/src/import.ts` (`IMPORT_KINDS`, in import order). **A new module ships its importer**: add the kind there (with its `module`) and an `Impl` in `kinds.ts`, add it to `sample.ts`, and the console, templates, export and tests pick it up.
- **How a batch works:** one transaction under `pg_advisory_xact_lock(hashtext('imports'))` with no statement timeout; rows with problems are left out; each write records the rows it created and the rows it changed (as they were), and undo puts them back in reverse order. Only the newest batch from the last 30 days can be undone. Column matches are remembered per kind and set of headers (`import_mappings`). Messages meant for people are thrown as `ImportError`; the exception filter answers them as 400s by name.
- **Who uses it:** Gradeon's team in the console (`apps/console-api/src/migration.ts`, `/console/v1/schools/:id/import/*`, `schools.configure`); the school's own screens use the same engine: Classes and calendar saves a typed row (`apps/api/src/school/setup.ts`) and the Students page import (`importCsv`). Files the school sends sit in `import_uploads` (text, or a data URL for Excel, PDF or photos) until the team opens one. The import routes take up to 26 MB (`BIG_BODIES` in `nest-kit/src/http.ts`); everything else keeps 256 KB.
- **Go-live** is on the admin's Moving in page (`apps/api/src/school/moving-in.ts`): family invites make the guardian's login if there is none, then set `users.invited_at`; staff from Migration have no password until "Send staff their invites". The console's readiness list counts staff with a password as invited.
- **Locks:** `classes.schoolEdits`, `calendar.schoolEdits`, `feeStructures.schoolEdits` (console, Academic year and Fees) stop the school's edits with "Ask Gradeon". `setup.write` (migration `0009`) goes to every role that could add students.
- **Watch out:** `exam_marks.score` is `numeric` in the database although the drizzle schema says text, and the drizzle schema does not list the Phase 3 tables (the SQL migrations are the truth). The Git Bash here eats backslashes in heredocs: write scripts with the Write tool.

## 16. The UI foundation (2026-11-08): what changed and what to know

- **One shell per app.** `apps/*/src/app/Layout.tsx` mounts the menu, search, phone dock and "More" sheet once, inside the signed-in route; the active menu item comes from the path (`activeNav` in `nav.ts`). Pages render in `PageScope` (their `pg-<page>` style scope, content and own overlays) and read the shell with `useShellChrome()`. The sidebar keeps its scroll and open menus across pages and nothing replays.
- **Overlays.** `.mod` is a fixed grid layer, so opening animations never move a dialog or the search box (the old jump). `Presence` keeps a closed overlay for `LEAVE_MS` (200 ms) with `data-leaving` and `inert`, and `useReturnFocus` gives focus back the moment it starts leaving. `Page`'s `overlays` and `toast` go through it already; a board view wraps its own (`<Presence>{v.dialog}</Presence>`, `<ToastSlot toast={…} />`). Everything that opens from a button is one `Pop` (`Menu.tsx`); `Menu` and `MenuButton` are uses of it.
- **Fields** live in `packages/web-ui/src/fields.tsx`: date, time, month, number, colour, swatches, checkbox, file pick. `Field` refuses date, number and other non-text types at the type level.
- **Motion.** `--t1/--t2/--t3` (120/200/300 ms), `--e` in, `--ei` out; no overshoot curve. Keyframes are defined once (shared ones in `nest.css`).
- **No new dependency.** The plan proposed Base UI, Motion, React 19.3's view transitions and react-day-picker. The existing parts already did the behaviour (portals, placement, keyboard); the bugs were positioning, timing and missing exits, fixed at the root, and the calendar is a small month grid. Page changes animate with the content's own short rise instead of a view transition, which would block clicks while it runs.
- **The guard test** `packages/web-ui/src/rules.test.ts` runs with `pnpm test` and names the part to use instead.
- **Watch out:** class names are global; the calendar first used `.cal`, which the Events page already had (`pages.css`). Check new names against `nest.css`, `pages.css` and the page stylesheets.

## 17. Finishing Phases 0 to 3 (2026-11-08): what changed and what to know

Branch `feat/finish-phases-0-3`. The aim was to leave in Phases 0 to 3 only what needs the owner (accounts, vendors, decisions, design review) or belongs to a later phase; the production plan's Status section lists each such item with its reason.

- **Codes are capped per account** (`auth.service.ts`, `OTP_SENDS`): five sign-in or reset codes in fifteen minutes, outside demo mode, on top of the per-device rate limit. Families sign in only by code, so without the cap a phone number could be guessed against and, once SMS is real, run up the bill.
- **Alerts** (`packages/nest-kit/src/alerts.ts`): `alert(text)` logs and posts to `ALERT_WEBHOOK_URL`. A new error fingerprint alerts once (`recordError` returns whether the row is new); probes alert when a school stops and starts answering; backups, drills and start-up migrations alert on failure. Production logs are JSON (`ConsoleLogger({ json: true })`), and the exception filter logs school and request ID.
- **Restore drills and bring-forward** (`apps/console-api/src/backups.ts`, `packages/db/src/backup.ts`): the drill takes a fresh backup of a random live school, reads it back from the backup store and restores it into a scratch database (`gradeon_scratch_*` on `SHARED_PG_ADMIN_URL`, dropped afterwards), weekly through the `jobs` table and from Health. `restoreDatabase` refuses a backup taken at another migration version, so a restore now first brings an older backup forward (`bringForward`: migrate a scratch database up to the backup's version, restore, migrate the rest, back up again). Registry `0010_restore_drills`.
- **Start-up migration** runs four schools at a time (`upgradeSchools`), so deploy time no longer grows one school at a time.
- **Release apps carry no sample content:** `mobile-build.yml` strips `assets/mock/` and `InitialBinding` compiles the mock branch out in release.
- **Configuration reaching the screens:** brand colour on the school's mark (`markStyle` in web-ui, `SchoolMark` in the app); privacy notice on the sign-in pages (`/v1/brand` carries it) and in the app's Settings; consent (`POST /v1/f/consent`, school `0010_family_consent`, counted per class in Moving in); Home in the console's order (`homeSections` in `dashboard_view.dart`) with `QuickRow`; offered languages; vocabulary in the admin menu and the Students page (`plural` in contracts); new settings `fees.receiptNote`, `fees.paymentMethods` (checked on `POST /v1/fees/payments`), `app.languages`, `app.teachers` (mobile staff sign-in refused when off).
- **Catalogue honesty:** Transport, Library and Gallery are `beta` with blurbs that say what works; plans can carry `features` (registry `0011_plan_features`).
- **Go-live:** Migration's readiness reconciles open dues against the old system's total (`PATCH …/import/readiness`), and adds the timetable and two items the team ticks.
- **Dead or wrong things removed:** the "Reduce transparency" switch (nothing read it once glass became solid), a made-up founding year and office hours in the app's About, dead Privacy and Help links on the sign-in pages, receipts that did not name the school, a parent greeted by the child's name on tablets.
- **Checked:** `pnpm typecheck && pnpm test`, the page audit (every page, four widths, light and dark: clean), the 49 browser flows, the layout scans, `flutter analyze` and `flutter test`, and headless shots of every app screen for parents and teachers in light and dark from 360 wide to tablet. **Not checked:** a real phone, iOS, the live console.

## 18. Design systems and console colours (2026-11-09): what changed and what to know

Branch `feat/design-system`. The owner asked for one precise design system for the app and one for admin and console, with no inconsistency anywhere, and for **every colour to be set from the console per school, with full freedom**.

- **Colours are data.** `packages/contracts/src/theme.ts` is the catalogue: `WEB_TOKENS` (admin and console, light and dark), `APP_TOKENS` (Chalk, Blackboard, AMOLED) and `APP_SHARED` (main action, states, subjects, houses), each with a label, help and the default. A school's changes are the setting `theme.colors` (only changed keys, e.g. `web.dark.v`, `app.mari`, `app.subject.maths`); the console's own are `console_settings` key `theme` (`GET/PUT /console/v1/theme`, the GET is public so the sign-in page wears them). `resolveWeb`/`resolveApp` work out a full palette; a changed base carries its soft fill, text and "text on it" unless those are changed too (text is checked against its own soft fill). `webThemeCss` turns changes into one `<style>` over `.nest` (`useThemeColors` in web-ui; the admin reads it from `/v1/shell` and `/v1/brand`). `/v1/brand` also sends the app its `palette` per theme, worked out on the server; the app keeps it (`StorageKeys.palette`) so the first frame of the next start is already in the school's colours.
- **The editor** (`apps/console/src/app/ThemeEditor.tsx`): school → Configuration → Colours (Admin/App) and Team → Console colours. Every colour per theme, a live preview (admin light and dark; a phone in each app theme), contrast warnings below 4.5:1, "Default" per colour, "Accent from the brand colour". `ColourPicker`/`ColourField` in web-ui: saturation square, hue and opacity, hex/`rgb()`/`hsl()`, eyedropper. The six brand swatches are gone; any brand colour is allowed because text on it is chosen by contrast (`readableOn`, `markStyle`, `AppPalette.on`).
- **Changing a default colour:** edit the catalogue and `nest.css` together (a test compares them), then `pnpm --filter @gradeon/contracts build && node tools/gen-app-palette.mjs` to regenerate `lib/core/theme/app_palette_defaults.dart`.
- **Nest (admin, console):** retired `--b`, `--bS`, `--r`, `--rS`, `--rF`, `--sbg` and the blue button; tones are `v g a c n k`; new `--onCi`, `--onCF`, `--knob`, `--priH`, `--subj-<id>`. Ten type sizes, three weights, radius and spacing scales, fields 42 px (sign-in 50), every button state, focus ring following each shape, `useToast()` in web-ui for every toast (4 s, 6 s with an action, held under the pointer, errors until closed), one-frame theme swap, entrance stagger capped at 100 ms, the admin menu cached per school so it does not jump on load. `rules.test.ts` fails on raw colours, off-scale values, retired names and page-made toast timers.
- **Chalk & Glass (app):** `AppText` roles (with `num`, `ts`, `chip`, `capB`, `stamp`, `tiny`), `AppMotion` (`press`, `t1`–`t4`, `spring`, `stagger`, loops, `intro`) with `kEase`/`kEaseIn`/`kSpring`/`kLoop`, `AppRadius` steps, every literal colour replaced by a palette colour or a blend, taps through `Pressable`, counts through `'key'.trn(n)` with `_one` keys. `test/design_rules_test.dart` holds it. Fixed on the way: the ribbon's narrow free period and the now badge over a start time, quick actions that shrank ("Roll call"), Homework's filter moved under the title.
- **Dev:** `GRADEON_API` points the admin and console dev servers at another backend, so a second checkout can run its own servers beside the first.
- **Checked:** typecheck of every package, web-ui and contracts tests, the app's analyze and every test (54 passed), headless shots of parent and teacher screens in light and dark, and the colour change end to end in the browser (console → saved → the school's admin in the new accent). **Not checked in this pass** (the owner asked to skip the full run): the page audit, the 49 browser flows and the layout scans after the last changes, the platform API tests, and real devices.
