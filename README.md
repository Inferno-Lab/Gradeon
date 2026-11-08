# Gradeon

Gradeon is a school platform with four parts that work together:

| Part | What it is | Where |
| --- | --- | --- |
| **School admin** | The website a school's office and principal use: dashboard, students, attendance, fees, notices, timetable, its classes and calendar, moving in, and a read-only view of how Gradeon set the school up. | `apps/admin` |
| **Console** | Gradeon's own control room: onboard a school, set its modules, configuration and roles, move its data in, roll out releases, watch health and backups, give support, bill, manage the team. | `apps/console` |
| **Backend** | Two NestJS APIs (one for schools, one for the console) in one process, with a PostgreSQL database per school. | `apps/api`, `apps/console-api`, `apps/server`, `packages/*` |
| **Mobile app** | A Flutter app for parents and teachers ("Chalk & Glass" look; students do not sign in). Built for a school (`SCHOOL` and `API_BASE_URL`), it signs in for real and reads that school's data through the family API (`/v1/f/*`); built without them, it runs on demo content. | `lib/`, `android/`, `ios/` |

Start here depending on who you are:

- **New developer or coding agent:** [`AGENTS.md`](AGENTS.md) (rules and commands), then [`docs/HANDOFF.md`](docs/HANDOFF.md) (what was built, why, what is left and how to do it).
- **Want to see it running on the internet:** [`docs/deploy-free-test.md`](docs/deploy-free-test.md). The current test deployment is `https://gradeon.onrender.com` (admin at `/`, console at `/console/`).
- **The design:** the concept is [`docs/DESIGN.md`](docs/DESIGN.md) and the approved boards are in [`design/`](design/README.md). The long-term plan is [`docs/superpowers/specs/2026-10-14-gradeon-platform-design.md`](docs/superpowers/specs/2026-10-14-gradeon-platform-design.md).

## How it fits together

```
 Browser: school admin (React)  ─┐                          ┌─ one PostgreSQL database per school
 Browser: console (React)       ─┼─►  apps/server  ─────────┤
 Phone: Flutter app             ─┘   (NestJS, Fastify)      └─ one registry database (the list of schools)
                                      ├─ school API   /v1/*          (tenant chosen by the X-School header)
                                      ├─ console API  /console/v1/*  (Gradeon staff only)
                                      └─ serves the admin at / and the console at /console/
```

- **One database per school.** The *registry* database lists schools and holds each school's sealed connection string. A request to `/v1/...` names its school in the `X-School` header; the server looks the school up, opens (or reuses) a connection pool to that school's database and answers from it.
- **Everything configurable lives in data, and only Gradeon changes it.** A school's modules, features, plan limits, settings and locks are layered (platform defaults, plan, school settings, platform locks) and resolved by `packages/config-engine`. The console changes them (with history, rollback and a second approver for risky ones); the school API has no configuration writes, and the admin and the app only read them. The school's own data (timetable, classes, terms, holidays, fee structures) stays with the school while the console allows it.
- **Default deny.** Every school route declares the module or feature it belongs to, or says it is core; `apps/api/test/plan.test.ts` fails on any route that does not.
- **Onboarding is a recipe.** The console's wizard collects the school's details, then a *blueprint* (a versioned list of seven steps: database, keys and storage, migrations and defaults, domain, first admin, app build profile, store checklist) creates the school. Each step is retryable and logged. Where it runs (`local`, `free-test`, `aws-cell`) only changes which driver does the step.
- **Risky console actions need a second person** (erase, suspend, push plan changes, run migrations...). Support staff can open a school's admin read-only for 30 minutes with a signed token; the school API refuses every write from it.

## Run it on your computer

Needs Node 24 and pnpm 10 (`corepack enable`). No Docker: a throwaway PostgreSQL is started from an npm package.

```bash
pnpm install
pnpm build                          # once, builds the shared packages
bash tools/dev-reset.sh &           # starts PostgreSQL (port 54329), the server (4000) and creates the Greenfield demo school; takes ~1 minute
pnpm --filter @gradeon/admin dev    # http://localhost:5173/s/greenfield
pnpm --filter @gradeon/console dev  # http://localhost:5174
```

Sign in:

| Where | Address | Credentials |
| --- | --- | --- |
| School admin (demo school) | `http://localhost:5173/s/greenfield` | `neha.menon@greenfield.edu.in` / `nest2026`, then press "Type the demo code" (`424242`) |
| Console | `http://localhost:5174` | `kaushal@gradeon.app` / `nest2026`, code `424242` |
| Phone app on the demo school | a build with `SCHOOL=greenfield` | parent `priya.sharma@example.com`, teacher `kavita.iyer@greenfield.edu.in`; password `nest2026`, code `424242` |

On the hosted test track (`https://gradeon.onrender.com`) the school logins are the same. The console there uses `BOOTSTRAP_PASSWORD` and `DEMO_CODE` from Render's Environment page.

Texts and emails are never sent for real yet: they land in the console's **Test inbox**. That is where a new school's invite and sign-in codes appear. A real SMS provider (with DLT registration) is the step that lets real families sign in; see `docs/production-plan.md`.

Operations: every school is backed up daily and a weekly restore drill puts one back into a scratch database (console → Health). Set `ALERT_WEBHOOK_URL` to a Slack or Discord webhook to hear about new errors, a school not answering, a failed backup or drill.

## Check that nothing is broken

```bash
pnpm typecheck && pnpm test         # types and the unit and API tests (the API tests start a real PostgreSQL)
node tools/audit-ui.mjs             # every page, 4 widths, light and dark: errors, overflow, clipped text
node tools/e2e-flows.mjs            # 49 click-through flows in a real browser (run after dev-reset; it changes demo data)
node tools/scan-cutoff.mjs          # text cut by an ellipsis, hidden scrollbars, clipped boxes (the audit does not see these)
node tools/scan-gaps.mjs            # side-by-side columns that end unevenly, blank inside cards, content short of the edge
node tools/scan-fit.mjs             # tab knobs off their tab, text wrapping in pills or spilling out, 'undefined' on screen
node tools/scan-scroll.mjs          # slow scroll areas and table headings that scroll away
node tools/e2e-onboard.mjs          # onboards a new empty school through the wizard and screenshots every page
tool/verify.sh                      # Flutter analyzer and tests
```

The audit and flows default to `127.0.0.1`; if your dev servers listen on `localhost` only (IPv6), run them with `ADMIN=http://localhost:5173 CONSOLE=http://localhost:5174`.

`tools/shot.mjs <url> out.png [width] [height] [--dark] [--console] [--audit] [--do '[...]']` takes one screenshot while signed in, which is how pages are looked at without a window.

## Repository map

```
apps/
  admin/          React school admin (Vite, TanStack Router and Query)
  console/        React console
  api/            school API (NestJS 11 on Fastify)
  console-api/    console API: wizard, provisioning drivers, releases, approvals, health, billing
  server/         runs both APIs in one process and serves the two web apps
packages/
  contracts/      zod schemas and types shared by every app (the API's language)
  config-engine/  modules, plans, layered settings, locks
  db/             Drizzle schemas, reviewed SQL migrations, migrator, backups and restore, the import engine, Greenfield demo seed, dev PostgreSQL
  security/       scrypt passwords, AES-GCM sealing, JWT
  tenancy/        registry lookup and bounded pool manager
  nest-kit/       shared Nest pieces (errors, validation pipe, exception filter, error reports, alerts, rate limits)
  api-client/     typed HTTP client with token refresh
  web-ui/         the "Nest" design language as React: CSS, shell, sidebar, dialogs, forms, illustrations
design/canvas/    the approved design boards and nest.css (source of truth for how it must look)
lib/              Flutter app (see AGENTS.md for its rules)
tools/            audit, end-to-end, screenshot and one-time conversion scripts
docs/             architecture, deployment, status and the hand-off guide
render.yaml       the free test deployment (one Render web service)
.github/          CI and the mobile build workflow
```

## Deploying

The free test track is one Render web service plus a free Neon database: [`docs/deploy-free-test.md`](docs/deploy-free-test.md). `render.yaml` describes it, so connecting the repository is enough. Pushing or merging to `main` redeploys it.

## The Flutter app

The app (parents and teachers; Chalk & Glass; sample content in `assets/mock` for development only) lives at the repository root. Release builds talk only to a school: they refuse to start without `SCHOOL` and `API_BASE_URL`, and the console's build workflow leaves the sample content out. How to run it, the demo accounts, its architecture and rules are in [`AGENTS.md`](AGENTS.md); machine setup is in [`docs/dev-environment.md`](docs/dev-environment.md). In short:

```bash
flutter pub get && flutter run          # demo content, no backend needed
flutter run --dart-define=SCHOOL=greenfield --dart-define=API_BASE_URL=https://gradeon.onrender.com   # the demo school's real data (password nest2026, code 424242)
```

Demo accounts on demo content (password `demo123`, OTP `123456`): parent Priya Sharma, teacher Kavita Iyer. On a school build the same people sign in with `nest2026` and code `424242`. Students do not sign in.
