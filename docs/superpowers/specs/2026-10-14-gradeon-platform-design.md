# Gradeon platform: architecture, backend, admin panel, console and design

Status: draft for review · 2026-10-14, revised 2026-10-18 (new design language, console-driven onboarding and deployment, free testing of all three products together)
Replaces: `2026-10-10-gradeon-platform-monorepo-design.md` (deleted; it is in git history).
Scope: this is the plan. What has been built from it, and how the build differs (Render + Neon instead of Oracle for the test track, plain CSS instead of Tailwind/Radix, permission strings instead of CASL, hand-written clients instead of generated ones), is in `docs/HANDOFF.md` and `docs/platform-status.md`.

**How to read this document.** Every part described here is in scope for the first production launch. Nothing is parked for a later stage. The build order in section 24 only says what gets built first, because each step depends on the one before it. Where something cannot be finished by code alone (a lawyer's sign-off, a store account, a payment-gateway KYC), section 27 lists it as gating work with its own owner.

---

## 1. Intent

Gradeon today is one Flutter app that reads mock JSON. It becomes a product that many schools buy, built so that 500 schools are an operating detail rather than a rebuild:

- Each school gets its **own branded mobile app** for families, students and teachers. It is published in the stores under the school's name from the school's own developer accounts. There is also an **Gradeon app** where a family picks its school.
- Each school gets its **own admin panel** where its staff run the school.
- Each school's **data lives in its own database**, encrypted with its own keys. It is never mixed with another school's data.
- We (the Gradeon team) get one **console** to onboard schools, set what each one can use, ship releases in waves, watch health, and handle support and billing.

Day-to-day change happens through **configuration, not code**: adding a school, turning a module on, renaming a tab, changing grading rules or a fee rule is a setting, not a release. Everything lives in **this one repo**: app, admin, console, backend, infrastructure and docs.

## 2. What "scalable" means here

These are design targets, not current load. The architecture is built and load-tested to them before launch (section 23).

| Dimension | Target |
| --- | --- |
| Schools | 500 live schools, with room to add capacity cell by cell and no redesign |
| People | 750,000 students, 1.5 million guardians, 60,000 staff (500 × an average 1,500-student school) |
| Peak | The 07:30–09:30 window: app opens, attendance marking in every class, gate scans. Sized at 3× the average weekday hour. |
| Broadcast | A notice to every family of a 5,000-student school reaches every device within 60 seconds (p95) |
| API | 99.9% monthly availability per school; p95 under 300 ms for reads and under 500 ms for writes, measured at the load balancer |
| Admin | Interaction to Next Paint under 200 ms on an Intel Core i3 laptop with 8 GB and Chrome at 1366 × 768 |
| Mobile | Cold start under 2.5 s on a mid-range Android phone; works offline for the last synced day |
| Recovery | Any one school restorable to any second in the last 35 days (RPO 5 min, RTO 1 h for one school, 4 h for a whole region) |
| Onboarding | A new school is live, with its admin panel and the Gradeon app, the same day it signs. Its own store apps follow once the stores approve. |

## 3. Goals, product boundaries, anti-goals

**Goals**
1. One repo and one source of truth for data shapes, permissions and configuration, shared by app, admin, console and backend.
2. Hard isolation: no school's data, credentials, users, files or keys are reachable from another school's request, job or database.
3. Most of the product is configurable per school, with safe drafts, previews, approvals and rollback.
4. Roles that each school defines itself, with conditions ("own classes only"), plus platform-only permissions for us that no school role can ever reach.
5. One version of the code for every school, shipped in waves with automatic halt and rollback.
6. Admin and console interfaces that school staff and our team enjoy using: fast, animated, exact (sections 16–18).

**Product boundaries (deliberately never built)**
- **Server-driven screens.** Configuration chooses and arranges *built* blocks; it never invents a new screen. A screen that does not exist in code cannot be described into existence, so a config mistake cannot ship a broken screen.
- **Third-party code plugins.** Integrations go through our own interfaces (payments, SMS, email, WhatsApp, SSO). We do not run code written by others.
- **Running in a school's own cloud account.** A large school gets a **dedicated cell** in our account (section 6.4). It does not get a deployment we cannot operate.

**Anti-goals (failure even if it "works")**
- Per-school forks or `if (school == 'greenfield')` anywhere.
- A config system where a typo in the admin or console can break apps (every layer is schema-validated, versioned, previewed and reversible).
- A shared database, shared login or shared encryption key across schools.
- An admin panel only developers can operate.
- Any animation that makes a task slower, hides content, or ignores Reduce Motion.

## 4. Decisions and who made them

| Decision | Made by |
| --- | --- |
| Many schools; each gets its own branded app and its own admin panel | You |
| Nothing about a school's data is shared with another school | You |
| Each school publishes under its own Apple and Google accounts | You |
| A developer console to manage everything | You |
| Built scalable from the start: everything a 500-school platform needs exists at launch | You |
| Take ideas from the pasted prompt only where they are genuinely good | You |
| Admin and console share one design language of our own, at the calibre of your references, built under the impeccable and ui-ux-pro-max rules (section 15) | You |
| The mascot character, pencil-shaped charts and fee jars on the canvas are childish and are replaced in the build (15.3); the canvas is not edited | You |
| Onboarding a school and deploying for it is done from the console, and is configurable (12.10) | You |
| Testing runs the app, admin and console together, hosted and managed for free, behaving like production (section 30) | You |
| Admin and console do **not** use Chalk & Glass; the mobile app keeps it | You |
| Admin and console are rich in animation and effects, built with the best libraries | You |
| Everything else in this document | My calls (listed in section 29) |

## 5. Stack

| Part | Choice | Why |
| --- | --- | --- |
| Mobile app | **Flutter** (existing), Dart pub workspaces + Melos | Already built. One codebase for Android and iOS, white-labelled at build time. |
| Backend | **TypeScript, NestJS 11 on Node 24 LTS (Fastify adapter)** | Module, guard and DI structure fits pluggable modules and authorization. Largest ecosystem and hiring pool. |
| Database | **PostgreSQL 18**, one database per school, many databases per cluster | Relational school data, strong constraints, JSONB for config, full-text search. |
| Data access | **Drizzle ORM** + reviewed SQL migrations (drizzle-kit) | A Drizzle instance per school is cheap. Prisma creates a heavyweight client per datasource, which is wrong for hundreds of databases behind one API. |
| Connection pooling | **PgBouncer** (transaction mode) per cell | Hundreds of school databases share a bounded number of server connections. |
| Cache, queues, realtime fan-out | **Valkey** (ElastiCache) per cell + **BullMQ** | Valkey is the open-source Redis line that ElastiCache runs. BullMQ is proven for jobs, schedules and rate limits. |
| Realtime | **`apps/realtime`**: NestJS + Socket.IO with the Valkey adapter | Chat, typing, read receipts, live bus location and presence. Scaled separately from the API. |
| Files | **S3**, one bucket per cell, a prefix and a **KMS key per school** | Per-school encryption keys allow crypto-erasure (section 21.4). |
| PDFs | **Typst** render service (`apps/renderer`) | Fast, deterministic output with excellent typography, including Devanagari. Used for receipts, report cards, ID cards, certificates and statements. |
| Admin + console | **React 19, Vite, TanStack Router/Query/Table/Virtual, Tailwind CSS v4, Radix primitives (shadcn source, fully re-skinned)** | Strongest stack for data-heavy, keyboard-heavy web tools. Section 16 covers the design and motion libraries. |
| Authorization | **CASL** abilities from roles stored in each school DB, compiled to SQL filters by our own small compiler | Roles are data and conditions are structured. The same rules filter queries in the API and hide UI in the clients. |
| Contracts | **Zod 4 → OpenAPI 3.1 + JSON Schema → generated clients**: TS via orval (TanStack Query hooks), Dart via openapi-generator `dart-dio` | One definition. App, admin, console and API cannot drift. |
| Feature flags | In-house evaluation in the config document, exposed through **OpenFeature** providers we write for TS (server and web) and Dart | Standard API in the code, no flag server per school, and no external service holding school data. |
| Monorepo | **pnpm workspaces + Turborepo** (TS), **Dart pub workspaces + Melos** (Dart), one root entry point | Each language keeps native tooling; Turborepo runs Dart tasks through thin wrappers. |
| Cloud | **AWS Mumbai (ap-south-1)** primary, **Hyderabad (ap-south-2)** for disaster recovery | Data stays in India. Two Indian regions give real DR. |
| Runtime | **EKS + Karpenter**, **Argo CD** (GitOps), **Helm**, **OpenTofu** | Cells are declarative and identical. Adding capacity is a pull request. |
| Edge | **CloudFront SaaS Manager** (one multi-tenant distribution, one tenant per school domain), **AWS WAF**, **Shield** | Thousands of school domains and certificates without one distribution each. |
| Secrets | **AWS Secrets Manager + External Secrets Operator**, **KMS** keys per school | Scoped and rotated, nothing in the repo. |
| Observability | **OpenTelemetry → self-hosted Grafana LGTM** (Loki, Grafana, Tempo, Mimir) in Mumbai; **self-hosted Sentry** for app, web and API errors | Telemetry stays in India and is scrubbed of personal data. |
| Product analytics | **Self-hosted PostHog**, staff surfaces only | DPDP forbids behavioural tracking of children (section 21.1), so family and student apps send only aggregate, non-identifying health metrics. |
| Messaging | **FCM** push; **Amazon SES** email; **MSG91** SMS (DLT-registered); **WhatsApp Business Cloud API**, all behind interfaces | Each channel can be swapped per school without code. |
| Payments | **Razorpay**, with **each school as its own merchant** (its own account and keys), behind a `PaymentGateway` interface with a mock implementation | Fee money goes straight to the school, never through us. |
| Mobile delivery | GitHub Actions + **fastlane**, macOS runners (EC2 Mac) per wave, **Shorebird** code push for Dart-only patches | Section 19. |

Considered and rejected:
- **All-Dart (Serverpod + Flutter web admin).** Smaller ecosystem, and Flutter web is weak for dense tables and forms.
- **One shared database with `school_id` and row-level security.** Section 6 explains why.
- **Next.js for the admin.** The admin is a logged-in tool, so server rendering adds a server tier per request for no user benefit. Static files on the CDN are faster and simpler.
- **Prisma.** One client engine per school database is too heavy for a pooled API.

## 6. Architecture

### 6.1 Overview

```
                    ┌──────────────────────── CONTROL PLANE (ours, ops account) ────────────────────────┐
                    │ apps/console (static) ─► apps/console-api ─► console DB (metadata only, no PII)    │
                    │ registry · placement · provisioning · plans · config catalog · releases · flags  │
                    │ fleet migrations · builds · health · support access · billing · compliance       │
                    └───────────────┬───────────────────────────────────────────────┬──────────────────┘
                      signed mgmt API (mTLS + per-school key)            tenant routing table (pushed)
             ┌──────────────────────┴───────────────┐                 ┌─────────────┴────────────────┐
             ▼                                      ▼                 ▼                              ▼
┌──────────────── CELL in-1 (≈100 schools) ────────────────┐   ┌──── CELL in-2 ────┐   ┌─ CELL ded-gis (dedicated) ─┐
│ api (pooled, stateless) · realtime · workers · renderer   │   │  same chart,      │   │ same chart, one school    │
│ PgBouncer ─► RDS PostgreSQL 18 Multi-AZ                   │   │  next 100 schools │   │                           │
│   db_gis  db_sra  db_dps  … (one database per school)     │   └───────────────────┘   └───────────────────────────┘
│ Valkey (keys and queues namespaced per school)            │
│ S3 cell bucket: /gis/* (KMS key gis) · /sra/* (key sra) … │
└──────────────────────────────▲───────────────────────────┘
                               │ HTTPS  gis.gradeon.app  ·  erp.greenfield.edu.in (custom)
                     CloudFront SaaS Manager tenant per school ─ WAF
          ┌────────────────────┼─────────────────────────┐
   Greenfield app        Gradeon app (school picker)    Greenfield admin (static SPA, same origin)
```

- **Cell.** The unit of capacity and blast radius: about 100 schools sharing one stateless API deployment, one realtime service, workers, a renderer, PgBouncer, one RDS cluster holding each school's separate database, one Valkey and one S3 bucket. A cell failing affects at most its schools. Cells are identical and created from the same Helm chart and OpenTofu module.
- **Control plane.** Our console and its API, in a separate AWS account. It stores facts *about* schools, never their students, marks or fees. It talks to cells only through a signed management API.
- **Edge.** Each school has a platform hostname (`<slug>.gradeon.app`, a placeholder until the real domain is registered) and can add its own domain. The admin SPA is served from the CDN on the same origin as the API (`/api/v1`), so the admin uses secure cookies and needs no CORS.

### 6.2 Tenancy and isolation

The **school is the database**, not a column.

1. A request arrives at the cell. The **tenant router** reads the `Host` header and looks it up in the routing table pushed by the control plane and cached in Valkey: `host → { slug, status, dbRef, kmsKeyId, bucketPrefix, plan, configVersion }`. The mobile white-label apps have their host built in. The Gradeon app gets it when the family picks the school.
2. An unknown, suspended or moving school is rejected before any business code runs.
3. The router hands the request a **school context**: a Drizzle instance on that school's connection pool, the school's KMS key reference, its bucket prefix, its Valkey key prefix and its queue names. Business code never sees a slug it can swap. There is no API that takes a school id as a parameter.
4. Each school database has **its own Postgres role and password**, held in Secrets Manager. A pool can only open its own database. A bug that swaps pools fails authentication instead of reading another school's data.
5. Pools are per school, per pod, with at most 3 connections and LRU eviction after 60 s idle. PgBouncer multiplexes them onto the cluster's server connections.
6. Jobs, realtime rooms, cache keys, file paths, logs, metrics and traces all carry the school slug, set by the router, not by feature code.
7. **Tests prove it** (section 23): property tests that fuzz host headers against pools, cross-school attempts on every endpoint, and a staging chaos test that swaps pool references and expects authentication failures.

### 6.3 Why not one shared database with `school_id`

- One missed `WHERE school_id = ?` (or one row-level-security policy gap) leaks children's data across schools. With a database per school, that class of bug cannot exist.
- Per-school backup, restore to a point in time, export, move and **erasure** are trivial with a database per school and painful with shared tables.
- A noisy school cannot bloat another school's indexes or vacuum.
- What it costs us, and how we pay it: migrations run per school, handled by the fleet migration orchestrator (section 12.5); connections are handled by PgBouncer and small pools; and cross-school analytics come from metrics, not queries (we do not need cross-school queries over personal data, and should not have them).

### 6.4 Placement and dedicated cells

- The console places each new school into the cell with the most headroom (database size, connection load and peak RPS), within the school's region.
- A **dedicated cell** (one school) is a plan option for very large schools or groups. It is the same chart with capacity one.
- **Moving a school between cells** is a console action: logical replication to the target cluster, catch-up, a 30–60 second write freeze at a scheduled time, routing-table switch, verification, then source cleanup. It is fully automated and logged.
- A **school group** (several campuses under one trust) is a set of separate schools linked in the console, with a group admin role that can switch between them in the admin panel (one login per school, linked through single sign-on). Data stays per campus.

## 7. Monorepo

### 7.1 Layout

```
gradeon/
├─ apps/
│  ├─ mobile/            Flutter app (today's lib/ moves here; Chalk & Glass)
│  ├─ api/               NestJS school API (one image, pooled per cell)
│  ├─ realtime/          Socket.IO service (chat, presence, live bus)
│  ├─ workers/           BullMQ workers (same codebase as api, different entry)
│  ├─ renderer/          Typst PDF service
│  ├─ admin/             React admin panel (static SPA, light-first)
│  ├─ console/           React console (static SPA, dark-first)
│  └─ console-api/       NestJS control-plane API
├─ packages/
│  ├─ contracts/         Zod: DTOs, events, app-config schema, permission catalog, error codes
│  ├─ modules/           one manifest per product module (section 9.2)
│  ├─ config-engine/     resolve, validate, diff and preview config layers (api, admin, console)
│  ├─ authz/             CASL ability builder + condition→SQL compiler + permission catalog
│  ├─ tenancy/           tenant router, school context, pool manager (api, realtime, workers)
│  ├─ db/                Drizzle schema per module, migrations, squawk lint config
│  ├─ api-client/        orval-generated TS client + TanStack Query hooks
│  ├─ web-ui/            shared React design system: tokens, components, motion, charts
│  ├─ web-motion/        motion tokens, presets, reduced-motion map, effect components
│  ├─ i18n/              message catalogs (en, hi, mr), ICU formatting, string-override loader
│  ├─ eslint-config/ tsconfig/ testing/   shared tooling
│  └─ dart/
│     ├─ gradeon_api/      generated Dart client
│     ├─ gradeon_core/     config runtime, ModuleRegistry, auth, networking, offline store
│     ├─ gradeon_ui/       Chalk & Glass design system + liquid-glass shader
│     └─ features/         one package per module: attendance/, fees/, homework/, …
├─ schools/              public per-school build profiles (no secrets)
├─ infra/
│  ├─ tofu/              accounts, VPCs, EKS, RDS, Valkey, S3, KMS, CloudFront, WAF
│  ├─ charts/            Helm: cell, control-plane, observability
│  ├─ argocd/            ApplicationSets: one app per cell per environment
│  └─ local/             docker compose: one cell + demo school + MinIO + Mailpit
├─ tools/               codegen, school scaffolder, synthetic-fleet generator, mock-JSON seeder
├─ docs/                specs, ADRs (docs/adr/NNNN-*.md), runbooks, PRODUCT.md, DESIGN.md per surface
├─ .github/workflows/   CI, release trains, mobile build matrix
└─ package.json  pnpm-workspace.yaml  turbo.json  pubspec.yaml (workspace)  melos.yaml
```

### 7.2 Tooling rules

- **One command:** `pnpm turbo run <task>` lints, tests, builds and generates across TS and Dart. Each Dart package has a tiny `package.json` that calls `melos`/`flutter`, so Turborepo orders and caches Dart too.
- **Affected-only CI** from the Turborepo graph. **Remote cache** in S3 (self-hosted turborepo-remote-cache).
- **One version per dependency:** pnpm catalogs (TS) and the pub workspace's single resolution (Dart). Renovate opens grouped weekly PRs.
- **Boundaries enforced:** apps import packages; packages never import apps; apps never import each other. TS uses `eslint-plugin-boundaries` and package `exports`. Dart uses `custom_lint` rules so `features/*` import only `gradeon_core`, `gradeon_ui` and `gradeon_api`.
- **Generated code** lives in `generated/`, is never hand-edited, and CI fails if it is stale.
- **Conventional Commits + Changesets**, **CODEOWNERS** per folder, **ADRs** for every change to this document.
- Pinned toolchains: `.nvmrc` (Node 24), `packageManager` (pnpm 10), `.fvmrc` (Flutter stable at build start).
- Both design skills are installed in full in the repo (`.claude/skills/impeccable`, `.claude/skills/ui-ux-pro-max`) from their upstream repositories. The copies on this machine are missing their scripts and data (section 15).

## 8. Contracts and code generation

```
packages/contracts (Zod 4)
  ├─► OpenAPI 3.1 (served at /api/docs via Scalar, and committed as docs/openapi.json)
  │       ├─► packages/api-client          (orval: typed fetch + TanStack Query hooks + zod)
  │       ├─► packages/dart/gradeon_api    (openapi-generator dart-dio)
  │       └─► Bruno collection             (generated, for manual API work)
  ├─► JSON Schema: app-config.json  ─► Dart config models + runtime validation in the app
  ├─► permission catalog            ─► authz (TS) + permission keys (Dart)
  └─► error-code catalog            ─► typed errors in every client, translated messages
```

- NestJS controllers declare Zod schemas for input and output (`nestjs-zod`), so validation, docs and clients come from one place.
- **Breaking-change gate:** `oasdiff` runs on every PR, and a breaking change without a version bump fails CI. Old app versions keep working because the API supports the last two minor contract versions (section 19.6).
- **Response shape:** `{ data, meta, error }` envelopes and field names follow today's `docs/MOCK_SCHEMA.md`, so the app's models map without UI changes. Where a field must differ, the mock JSON and `MOCK_SCHEMA.md` change in the same PR.
- **Pagination:** cursor-based for feeds and tables (`?cursor&limit&sort&q&filter[...]`), with `meta.total` estimated for large tables and exact under 10,000 rows.
- **Errors:** stable codes (`fees.installment_already_paid`), HTTP status, a translatable message key and parameters, a request id, and field errors for forms.

## 9. The configuration system

### 9.1 Layers

Resolved lowest to highest. A higher layer may change a value only where the lower layer allows it.

| # | Layer | Set by | Lives in | Examples |
| --- | --- | --- | --- | --- |
| 0 | **Build profile** | Us (written by the console) | `schools/<slug>/school.yaml` + vault | Bundle id, app name, icon, splash, Firebase project. A store build changes it. |
| 1 | **Platform defaults** | Code | `packages/modules` manifests | Every module, its settings with defaults, permissions, nav entries, home sections |
| 2 | **Plan + entitlements** | Us (console) | Signed entitlement document | Modules bought, limits (students, storage, SMS quota), add-ons |
| 3 | **Platform overrides + locks** | Us (console) | Same signed document | Forced values and locks: "school may change X", "X is fixed" |
| 4 | **School settings** | School admins | School DB | Modules on/off within the plan, terminology, branding, academic rules, fee rules, layouts |
| 5 | **Audience rules** | School admins | School DB | Show to roles, classes, app versions, or a percentage; schedules ("exam mode" during exams) |
| 6 | **User preferences** | Each user | Device + school DB | Theme, text size, language, notification choices, admin table layouts |

- The API resolves layers 1–5 into one **effective config document** per audience (role, class, app version, platform), cached in Valkey and keyed by config version.
- Apps fetch `GET /api/v1/app-config` (ETag), cache it on the device, and start offline from the cache. The admin uses the same engine for previews.
- Every layer is validated on write against the JSON Schema from `packages/contracts`, and the result is validated on read. An invalid document cannot be published.

### 9.2 Module manifests

Every product area is a module: people, admissions, attendance, staff-attendance, timetable, substitutions, homework, exams, results, report-cards, certificates, fees, payments, notices, events, messages, notifications, transport, library, gallery, leave, gate-pickup, id-cards, search, assistant, and so on. Each one has a manifest:

```ts
defineModule({
  key: 'fees',
  dependsOn: ['people', 'academics'],
  permissions: ['fees.structure.manage', 'fees.invoice.read', 'fees.invoice.create', 'fees.payment.collect',
                'fees.payment.refund', 'fees.concession.approve', 'fees.report.read', 'fees.export.tally'],
  settings: z.object({
    reminderDaysBefore: z.number().int().min(0).max(30).default(3),
    allowPartialPayment: z.boolean().default(false),
    methods: z.array(z.enum(['upi', 'card', 'netbanking', 'cash', 'cheque', 'dd', 'autopay'])).default(['upi', 'card', 'netbanking', 'cash']),
    receiptPrefix: z.string().max(12).default('RCPT'),
    lateFee: lateFeeRule.default({ kind: 'none' }),
  }),
  locks: { methods: 'platform' },
  app:   { routes: ['/fees', '/fees/pay', '/fees/receipt/:id'], nav: { icon: 'wallet', label: 'nav.fees' },
           homeSections: ['fees.dueBanner'], quickActions: ['fees.pay'], searchSources: ['fees.receipts'] },
  admin: { area: 'finance', screens: ['fees.setup', 'fees.invoices', 'fees.collect', 'fees.reconcile', 'fees.reports'] },
  jobs:  ['fees.reminders', 'fees.overdue', 'fees.lateFees', 'fees.autopay', 'fees.reconcile'],
  events:['fees.invoice.created', 'fees.payment.succeeded', 'fees.payment.failed'],
});
```

From manifests: the API mounts routes behind a module guard (disabled → `404 module_disabled`, jobs paused). The admin builds its navigation, settings forms and permission matrix. The app's `ModuleRegistry` builds dock tabs, routes, home sections, quick actions and search sources. The console shows the catalog with entitlements and locks. A deep link into a disabled module opens a friendly "not available at your school" page.

### 9.3 What schools configure

- **Modules:** on/off within the plan, order, audience (roles, classes), schedules.
- **App navigation per role:** which 4–5 modules sit in the dock, labels and icons from an approved set, what goes under "More".
- **App home per role:** which sections appear and in what order (Day Ribbon, Due stack, attendance, next exam, notices, both-children strip, bus ETA, quick actions), arranged by drag and drop with a live preview.
- **Quick actions:** per role, from each module's offered actions, with order, label override and badge source.
- **"Up next" rules:** the ordered rule list behind the app's "Up next" card. Each rule has a condition from an approved set (`fee_due_within`, `exam_within`, `homework_due_within`, `bus_eta_within`, `absent_today`, …), a priority, and a translatable message template with variables. Schools reorder, switch and edit them; they cannot write new condition code.
- **Terminology:** Class/Grade/Standard, Section/Division, Term/Semester, Roll no./Admission no., in every enabled language.
- **Branding (runtime):** brand colour (contrast-corrected automatically in OKLCH), logo, school name, holiday colours, subject colours. App icon and name are build-time.
- **Academics:** years, terms, classes, sections, subjects, period templates and bell timings, grading schemes and bands, exam types and weightage, pass rules, report-card templates.
- **Attendance:** statuses (Present, Absent, Late, Half day, Excused, custom; each with a colour token and whether it counts as present), daily or per-period mode, late cut-off, who may mark and correct, parent visibility.
- **Fees:** heads, structures, instalments, late-fee rules, concessions and scholarships, approval chains, payment methods (platform-locked), reminders, receipt format, autopay.
- **Communication:** who may message whom, office hours, quick replies, notice categories, approval workflow, broadcast limits.
- **Notifications:** templates per event × channel × language with variables, quiet hours, channel priority (push → WhatsApp → SMS fallback).
- **Custom fields:** on students, guardians, staff, admissions and more (text, number, date, choice, multi-choice, file), with validation and per-role visibility. They render in admin forms, admin tables, app profiles and exports.
- **Managed vocabularies:** blood groups, categories, relations, houses, religions (optional), transport zones and similar lists that schools edit in place.
- **Languages:** enabled languages, the default, and **string overrides** for any app or admin text, with a missing-translation filter.
- **Legal and contact:** privacy notice per language, terms, grievance officer details (DPDP), support contacts.
- **Feature flags:** per role, class, app version or percentage, with kill switches.

### 9.4 Making changes safe

- **Draft → preview → (approval) → publish.** Every change starts as a draft. The admin shows a **live preview of the real app** (section 13.12) for a chosen role and person. A school can require a second approver for publishing. Publishing creates an immutable version.
- **History, diff and one-click rollback** with author and reason.
- **Validation:** schema, dependencies (you cannot disable `people` while `fees` is on), contrast checks, plan limits, and "this change affects 1,240 families" impact counts.
- **Minimum app version** per config. Older apps get the last compatible config plus a gentle update prompt. Force-update is platform-only.
- **Kill switches** in the console per module or flag, per school or fleet-wide, applied within 30 seconds through the routing push.
- **Audit log** of every config, role and sensitive action (section 10.6).

## 10. Identity, roles and access

### 10.1 Tiers

| Tier | Works in | Examples |
| --- | --- | --- |
| Platform (us) | Console; time-boxed support access into a school admin | Super admin, support engineer, release manager, finance, compliance officer, read-only auditor |
| School staff | Admin panel + teacher tools in the app | Principal, vice principal, office admin, accountant, cashier, admissions officer, class teacher, subject teacher, transport manager, librarian, receptionist, IT admin |
| Families and students | App | Guardian, student |

### 10.2 Authentication

- **Users live in each school's database.** A guardian with children in two schools has two accounts; the app holds both and switches between them in one tap.
- **Families:** phone OTP (SMS or WhatsApp) or password; passkeys on supported phones; biometric unlock of the stored session.
- **Staff:** password + mandatory second factor (passkey preferred, TOTP accepted), optional Google Workspace or Microsoft 365 SSO per school.
- **Console:** Google Workspace SSO + passkey, reachable only through **AWS Verified Access**.
- **Tokens:** admin and console use httpOnly, `SameSite=Strict`, secure cookies with CSRF tokens. The mobile app uses a 15-minute access JWT and a rotating refresh token, hashed in the DB, with reuse detection that kills the whole token family. Device sessions are listed and revocable.
- **Passwords:** Argon2id; breached-password check (k-anonymity range query); lockout and rate limits per account and IP; OTP limits per phone.
- Paste and password managers are always allowed (WCAG 2.2 accessible authentication).

### 10.3 Authorization model

- **Permissions** are declared by module manifests and form a generated catalog (TS and Dart).
- **Roles** are data in each school DB: a name plus permissions, each with optional **conditions** from an approved list: `scope: self | own_children | own_classes | own_subjects | own_routes | all`, `class in […]`, `amount <= …`, `status in […]`, `time window`. Conditions are structured fields, never code.
- **Role templates** ship with every school (the staff roles in 10.1 plus guardian and student). Templates are versioned: new permissions arrive as "update available" without overwriting a school's edits.
- **Assignments:** many roles per user ("class teacher of 8 A" + "Maths teacher for 6 A, 7 B, 9 C").
- **Platform-only permissions** (entitlements, locks, payment-method changes, gateway credentials, whole-school export, deleting the school) cannot be granted by any school role.
- **Enforcement:** a NestJS guard checks the route's declared permission. Our compiler turns CASL conditions into Drizzle `where` clauses, so lists return only permitted rows. Field-level rules hide sensitive fields (health notes, guardian phone numbers) per role. Clients get abilities from `/api/v1/me` and hide what the user cannot do; the API is always the authority.

### 10.4 Sensitive actions and approvals

Refunds, concessions above a limit, deleting or archiving students, publishing config, role changes, mass messages and exports can each require **step-up authentication** (fresh passkey or TOTP) and, per school, a **two-person approval**. All of them go into one Approvals inbox.

### 10.5 Support access

Our support engineers enter a school's admin only through a console-granted session. It is time-boxed (60 minutes by default), has a stated reason, and can be read-only or read-write. The school can require its own approval for each session. The school's audit log shows the session, and the admin shows a visible banner while it is active.

### 10.6 Audit

An append-only audit table per school (who, what, when, before/after, request id, IP, device) with a hash chain, so tampering is detectable. It is filterable in the admin with a diff viewer and exportable. The console keeps its own audit of every platform action.

## 11. School API (`apps/api`, `apps/workers`, `apps/realtime`, `apps/renderer`)

### 11.1 Shape

A modular monolith: one NestJS module per product module, mirroring the manifests, plus core modules: tenancy, auth, people, config, authz, files, notifications, jobs, audit, search, imports/exports, reports, platform-management. Workers and realtime are separate entry points of the same codebase, scaled separately.

### 11.2 Data conventions

- UUIDv7 keys; `created_at`, `updated_at`, `created_by`, `updated_by`; `version` for optimistic locking (admin shows a "changed by someone else: reload or overwrite" dialog).
- Soft delete (`deleted_at`) where records are recoverable; hard delete with crypto-erasure for data-subject erasure (section 21.4).
- Money as integer paise + currency code. Timestamps in UTC; the school's timezone is in config. Dates without time (`date`) for school days.
- snake_case plural tables, FK indexes, partial indexes for hot queries, `pg_trgm` + `tsvector` for search.
- Migrations are expand → migrate → contract only, linted by **squawk** in CI (it blocks locking migrations such as a column add with a volatile default, or a non-concurrent index on a large table).

### 11.3 Data model by module

Tables are owned by the module that needs them. They are listed here so nothing is forgotten; detailed columns are written per module during its build step.

| Module | Tables |
| --- | --- |
| Core / config | `school_profile`, `config_layers`, `config_versions`, `config_drafts`, `feature_flags`, `string_overrides`, `vocabularies`, `vocabulary_items`, `custom_field_defs`, `files` (central registry) |
| Identity | `users`, `user_identities` (password, phone, passkey, SSO), `sessions`, `refresh_tokens`, `otp_requests`, `devices` (FCM tokens), `login_history` |
| Authz | `roles`, `role_permissions` (with conditions), `user_roles` (with scope bindings), `role_template_versions` |
| People | `students`, `guardians`, `guardian_links` (relation, primary, pickup-allowed), `staff`, `profiles_custom` (JSONB per entity), `documents`, `health_records` (encrypted), `consents` |
| Admissions | `enquiries`, `applications`, `application_stages`, `entrance_tests`, `offers` |
| Academics | `academic_years`, `terms`, `grade_levels`, `classes`, `sections`, `subjects`, `class_subjects` (teacher, periods/week), `enrollments` (roll no., status, year), `houses` |
| Timetable | `period_templates`, `period_slots` (class, break, lunch, assembly), `timetable_versions`, `timetable_entries`, `timetable_overrides`, `substitutions`, `rooms`, `holidays`, `calendar_days` |
| Attendance | `attendance_policies`, `attendance_statuses`, `attendance_sessions`, `attendance_records`, `staff_attendance`, `absence_explanations` |
| Leave | `leave_types`, `leave_requests` (student and staff), `leave_approvals` |
| Homework | `homework`, `homework_attachments`, `submissions`, `submission_files`, `grading` |
| Exams + results | `grading_schemes`, `grading_bands`, `exam_types`, `exams`, `exam_schedules`, `seating_plans`, `marks`, `marks_moderation`, `result_summaries` (computed with rank), `report_card_templates`, `report_cards` (PDF + publish state) |
| Certificates + ID cards | `certificate_templates` (TC, bonafide, character, custom), `certificates_issued` (serial, QR verify token), `id_card_templates`, `id_card_batches` |
| Fees | `fee_heads`, `fee_structures`, `fee_structure_items`, `installments`, `late_fee_rules`, `student_fee_assignments`, `concessions`, `concession_approvals`, `invoices`, `invoice_items`, `payments`, `payment_attempts` (gateway payloads), `receipts`, `refunds`, `refund_approvals`, `autopay_mandates`, `settlements`, `cash_closings`, `tally_exports` |
| Communication | `notice_categories`, `notices`, `notice_audiences`, `notice_reads`, `events`, `event_rsvps`, `threads`, `thread_members`, `messages`, `message_receipts`, `office_hours`, `quick_replies`, `broadcasts` |
| Notifications | `notification_templates` (event × channel × locale), `notifications` (in-app), `deliveries` (per channel, status, provider id), `preferences`, `quiet_hours` |
| Transport | `routes`, `stops` (order, geo, ETA offsets), `vehicles`, `drivers`, `route_assignments`, `trips`, `vehicle_positions` (time-partitioned, 90-day retention), `transport_alerts` |
| Library | `books` (ISBN metadata), `copies` (barcode), `loans`, `reservations`, `fines` |
| Gallery | `albums`, `album_items` (image variants), `photo_consents` (guardian opt-out flags faces for review) |
| Gate + pickup | `gate_passes`, `pickup_authorizations` (who may collect which child, with photo), `visitor_log` |
| Search | `search_documents` (tsvector, per-permission scope fields) |
| Reports | `report_definitions`, `report_runs`, `report_schedules` |
| Assistant | `assistant_threads`, `assistant_messages`, `assistant_feedback` (opt-in per school, section 11.12) |
| Audit + privacy | `audit_log` (hash chain), `dsr_requests` (access, correction, erasure, nomination), `retention_runs` |

### 11.4 Jobs (BullMQ)

Reminders (fees, homework, events), overdue status and late fees, invoice generation per schedule, autopay charges, result and rank computation, report-card generation, notification fan-out, scheduled notices, report exports, bulk imports, low-attendance alerts, gallery image variants and face-consent review, virus scanning, search indexing, retention and erasure runs, settlement reconciliation, Tally export, nightly integrity checks.

Each job type has its own queue. **Per-school fairness** comes from a token bucket in Valkey: one school's 50,000-message broadcast cannot starve another school's attendance alerts. Failed jobs retry with backoff and land in a dead-letter view in the console (metadata only).

### 11.5 Realtime

`apps/realtime` hosts chat (delivery and read receipts, typing), presence ("Kavita is editing this timetable"), live bus positions, and live counters in the admin (attendance marked, payments arriving). Rooms are namespaced per school. Authentication uses the same session as the API. Valkey pub/sub fans messages out across pods. Clients fall back to polling when the socket cannot connect.

### 11.6 Files

Pre-signed uploads go straight to `s3://cell-bucket/<school>/…`, encrypted with the school's KMS key. A worker scans every file (ClamAV) before it becomes visible, builds image variants (AVIF/WebP, three sizes) and extracts the text of PDFs for search. Downloads use short-lived signed URLs.

### 11.7 Notifications

Each event resolves its template for the recipient's language, picks channels by the school's channel priority and the recipient's preferences and quiet hours, and records every delivery (queued, sent, delivered, read, failed) with the provider's id. SMS uses DLT-registered templates (India requires it). WhatsApp uses approved templates. Email goes through SES with the school's verified sending domain or our platform domain.

### 11.8 Payments

- Each school connects **its own Razorpay account** (keys stored in the vault, set up through the console with the school present). Families pay through Razorpay Checkout (UPI, cards, netbanking), and **UPI AutoPay / e-mandates** cover recurring fees.
- Order creation is **idempotent** (idempotency key per invoice attempt). Webhooks are verified by signature, deduplicated and processed exactly once.
- The cashier screen records cash, cheque and DD collections with a day-end **cash closing**.
- **Reconciliation:** Razorpay settlements matched to payments and to bank credits; mismatches go into a review queue.
- **Tally export** (vouchers as Tally XML) for the school's accountant.
- A mock gateway with scripted outcomes (success, failure, pending, late webhook) is used in local, preview and tests.

### 11.9 Documents

Receipts, report cards, certificates (with a QR code that opens a public verification page showing only the certificate's validity), ID cards, fee statements and exported reports are rendered by `apps/renderer` from Typst templates. Templates are edited in the admin with a block-based designer (section 13.6) and previewed live.

### 11.10 Search

Per-school Postgres full-text + trigram search across students, guardians, staff, homework, notices, events, receipts and books, filtered by the caller's permissions at query time. It powers the app's search and the admin's command palette.

### 11.11 Imports and exports

Imports (CSV/XLSX) for students, guardians, staff, fee assignments, marks and books follow one flow: upload → map columns (remembered per school) → validate every row with exact errors → preview → import the valid rows → download a file of the rejected rows. Every table in the admin exports to CSV/XLSX/PDF with the current filters.

### 11.12 Assistant

The app already has an assistant feature flag and repository. It becomes a module:
- **Claude** through the Anthropic API. The model is set in config (default `claude-sonnet-5-5`, with `claude-haiku-5-5` for cheap classification).
- Read-only tools over the caller's own permitted data: timetable, homework, fees due, notices.
- Personal data is minimised in prompts, and no school data is used for training (API terms).
- The school opts in, and guardians are told.
- Every answer cites the screen it came from.
- Staff get drafting help in the admin: notice drafts, report-card remarks and message replies, always as an editable draft and never sent automatically.

## 12. Control plane and fleet operations (`apps/console-api`)

### 12.1 Registry
For each school: slug, legal name, short name, domains, region, cell, plan, status (`onboarding → live → suspended → offboarding → archived`), contacts, contract dates, GSTIN, versions (API, admin, app per store), config version, health, usage, onboarding progress.

### 12.2 Provisioning (driven by blueprints)
Provisioning is data, not code. A **blueprint** is a versioned, editable list of steps with parameters, kept in the catalog (12.4) and edited in the console. The console picks the blueprint by target, plan and region (12.11). The workflow is idempotent and resumable; every step is retryable, has a visible log, and can be dry-run first. A step can be skipped only where the blueprint marks it optional, and the reason is recorded. The default blueprint runs these steps in order:
1. **Database:** choose the cell and create the school's database, Postgres role and pool secret (`database`).
2. **Keys and storage:** the encryption key, bucket prefix policy, cache namespace, queue registrations and routing-table entry (`keys-storage`).
3. **Migrations and defaults:** run the latest migrations and seed defaults (role templates, statuses, vocabularies, templates, layouts), or the demo data if the wizard asked for it (`migrate-seed`).
4. **Domain:** the edge entry for the school's address (`<slug>.gradeon.app`, or a path in test), plus the custom domain with certificate validation if the school has one (`domain`).
5. **First admin:** push the entitlement document and create the first school admin, who gets an invite (`admin`). On the test track the invite lands in the console's test inbox.
6. **App build profile:** write the school's build profile (`schools/<slug>/school.yaml`) through the console's GitHub App as a signed commit to a protected path, which runs validation (`build-profile`, optional).
7. **Store checklist:** open the store-onboarding checklist for the school's Apple and Google accounts and queue the first app build (section 19.3) (`store-checklist`, optional).

The invites are sent and the school is recorded as `live` when the last step finishes. The step keys are fixed (`STEP_KEYS` in `packages/contracts`); a blueprint may switch off the optional ones and change their parameters, but not reorder them.

### 12.3 Plans, entitlements and billing
- **Plans:** module bundles, limits, add-ons (SMS packs, WhatsApp, dedicated cell, assistant). Per-school overrides and locks. The signed entitlement document is pushed to the cell and also pulled at API start.
- **Billing:** plans priced per student per year, GST-compliant invoices to schools, payment through our own Razorpay account, dunning (reminders, then a grace period, then read-only mode, never data loss), and usage metering (students, storage, messages).

### 12.4 Config catalog
Platform defaults and templates (role templates, notification templates, home layouts, "up next" rules, report-card templates, vocabularies) that new schools start from. When we change a template, existing schools see an "update available" diff in their admin and accept it there; nothing is forced except security fixes.

### 12.5 Fleet migration orchestrator
- Every migration is tagged `expand`, `backfill` or `contract`.
- Migrations run per school in **waves** (internal demo school → pilot schools → each cell in batches of 10), with a per-school advisory lock and timing recorded.
- The orchestrator halts automatically on the first failure in a wave, and the console shows each school's migration state.
- Backfills run as throttled jobs.
- `contract` migrations run only after every school runs code that no longer reads the old shape.

### 12.6 Releases
- **Release trains:** API, workers, realtime, renderer, admin and console version together. The same images are promoted from staging to production.
- Waves are internal, then pilot, then cells in order. Each wave is gated by automatic checks (error rate, p95 latency, job failures, synthetic journeys) and halts and rolls back by itself.
- The admin SPA is versioned per school through the CloudFront tenant's origin path, so a wave switches a school's admin at the same moment as its API.
- Release notes are written once and shown as "What's new" in the admin and the app.

### 12.7 Backups, restore and erasure
- RDS point-in-time recovery for 35 days, plus a nightly **per-school logical dump** encrypted with the school's key and copied to a separate backup account with S3 Object Lock and a Hyderabad replica.
- **Per-school restore** to any time: restore to a scratch instance, extract that school's database, verify, and swap with a write freeze. It is automated from the console.
- An automated restore drill runs every week on a random school in staging and every month in production (into isolation), with the result recorded.
- **Erasure of a school:** drop the database, delete the bucket prefix, then schedule deletion of the school's KMS key (7–30 day waiting period) once its last backup has expired. The backups become unreadable everywhere (crypto-erasure).

### 12.8 Health and alerting
Per-school and per-cell dashboards: availability, latency, error rate, queue backlog, job failures, database size and bloat, connection use, backup freshness, certificate expiry, store-credential expiry, SMS/WhatsApp delivery rates, payment webhook health. SLO burn-rate alerts go to on-call (Grafana OnCall). There are synthetic journeys per cell every 5 minutes: log in, mark attendance, pay with the mock gateway, receive a push.

### 12.9 Compliance desk
Data-processing agreements per school, sub-processor list, DSR tasks that need us as processor, breach workflow (detect → assess → notify the school within hours so it can meet the 72-hour Board notification → record), and retention policy per data class.

### 12.10 Onboarding and deploying from the console
Everything needed to bring a school on, and to change what is deployed for it afterwards, is a button in the console. Nobody uses a terminal for it, and the sequence is configurable (below).

**The new-school wizard.** Every step has defaults from the blueprint and the plan, is saved as a draft, and can be resumed by another console user.
1. **Basics:** name, short name, slug (checked live for clashes and rules), board, address, contacts, GSTIN, languages.
2. **Plan and modules:** pick a plan; switch modules, limits and add-ons on or off; set locks (what the school may and may not change later).
3. **Branding:** logo, brand colour (with a contrast check), app name, icon and splash, shown in a live phone preview.
4. **Placement:** region, cell (automatic or chosen), deploy target (12.11), and address (platform subdomain, path, or custom domain).
5. **First admin:** name, phone and email, how to deliver the invite, extra roles from the templates.
6. **Starting data:** empty, demo data, or an import template.
7. **Review:** a plain list of exactly what will happen, a dry run, the capacity check, and the approval if the plan requires one. **Launch** opens a live progress view of the provisioning steps.

**What the console can deploy.** Each of these is an *action* with who may run it, whether it needs approval, a dry run, live progress, a rollback and an audit entry:
- create, suspend, resume, offboard and erase a school;
- push a new plan, entitlements, locks and config overrides;
- release API, admin or app versions to one school, a wave or the fleet, and roll back;
- run or retry migrations, and move a school to another cell;
- add or change a custom domain;
- build the app for a school (Android and iOS), upload it to the school's store accounts, and ship a code-push patch;
- take a backup, run a restore, and run the restore drill.

**What is configurable.** All of the following are data in the catalog, edited in the console, versioned and diffed. A change needs a second approver, runs in a dry run against the staging fleet, and only then activates:
- **Blueprints:** which steps run, their order within the allowed order, which are optional, their parameters, per target, plan or region.
- **Wizard defaults and rules:** slug and bundle-id naming rules, default plans and modules per plan, required fields, which plans need approval.
- **Deploy policies:** wave definitions, automatic halt thresholds, maintenance windows, freeze switch, concurrency limits.
- **Deploy targets:** which drivers a target uses and which credentials it references (12.11).
- **Approval rules** for each action and each console role.

**How it runs.** `console-api` does not hold broad cloud rights. Per-school tasks (database, key, bucket, edge entry) call the target's drivers with narrowly scoped roles. Builds, infrastructure changes and releases are **GitHub Actions workflows** that the console dispatches with its GitHub App; the workflows use short-lived OIDC credentials, and their logs stream back to the console. The repository stays the source of truth for infrastructure and build code; the console is the button and the record.

**Guardrails:**
- One action in flight per school, and a global freeze switch.
- Danger actions need the typed school code and a second approver.
- The console can never read school records.
- Some steps are not ours to press: the school creates its own Apple and Google accounts and presses "Submit for review" (19.3), and a custom domain needs the school's DNS record. The console shows these as a checklist with the exact values to copy.

### 12.11 Deploy targets
A **target** is a set of drivers that carry out the blueprint steps in one kind of place. The same blueprint, wizard and actions run on every target; only the drivers differ, so nothing built for testing is thrown away.

| Step | `aws-cell` (production, staging) | `free-test` (section 30) | `local` (the laptop) |
| --- | --- | --- | --- |
| School database | RDS database and role | One Neon project per school, created through Neon's API | Local Postgres database |
| Encryption keys | KMS key per school | An app-held key per school (envelope encryption) | A fixed dev key |
| Files | S3 prefix | R2 prefix | MinIO |
| Cache and queues | Valkey namespace | Valkey in the same VM, or a free hosted one | Local Valkey |
| School address | CloudFront tenant | A path or subdomain on the free CDN | `localhost` |
| App builds | EC2 Mac and Linux runners | GitHub Actions (Android) | Local build |
| Messages | Live providers | Sandbox inbox in the console | Local inbox |

Adding a target means implementing the driver interface and writing its blueprint. A cell has exactly one target.

## 13. Admin panel: product (`apps/admin`)

The admin is built from the module manifests and the user's abilities: its navigation shows only enabled modules and permitted screens.

### 13.1 Global elements
- **Shell:** area rail, top bar (breadcrumbs, academic-year switcher, search/command, Approvals, notifications, help, profile).
- **Command palette (⌘K / Ctrl K):** jump to any screen, find any student, guardian, staff member, invoice, receipt, notice or book, and run actions ("Collect fee for Aarav", "Mark 8 A present", "New notice to Class 6"). Recent items and suggestions appear when empty.
- **Keyboard shortcuts:** `g` then a letter to go to an area, `n` new, `/` search, `?` the shortcut sheet, `j/k` table rows, `x` select, `Enter` open, `Esc` close. All are rebindable.
- **Approvals inbox:** leave, concessions, refunds, notice approvals, config publish, role changes, mass messages, in one queue with keyboard triage.
- **Notifications drawer**, **What's new** panel, contextual **Help** side panel, and a **guided tour** per role (5 steps, once, replayable from Help).
- **Presence and soft locks:** "Kavita is editing this timetable" shows live; saving a stale version opens the conflict dialog.
- **Academic-year switcher:** past years open read-only, with a visible "viewing 2025–26" state.
- **Offline banner**, and a **session-expired re-auth** dialog that keeps unsaved work and returns to the same place.
- **Setup checklist** until the school is fully configured (13.3).

### 13.2 Areas and screens

**Home** (school brand colour): Dashboard, Approvals, Activity.
- Dashboard: the "Needs you" queue (rules: attendance not submitted by N classes, leaves waiting, concessions waiting, overdue fees, unpublished timetable changes, homework to grade, failed deliveries, setup incomplete), each item with one action that deep-links to a pre-filtered screen; the Today timeline (periods, exams, events, substitutions); the KPI strip (present today, fees collected, outstanding, attendance rate, periods covered, each with its trend against last period), the weekly attendance column chart, teacher and class performance; charts; recent activity. It shows an "All caught up" state when the queue is empty. Widgets can be arranged per user.

**People** (Sapphire): Students, Guardians, Staff, Admissions, ID cards, Certificates, Imports, Duplicates.
- Student profile drawer: Overview, Attendance (calendar heatmap), Fees, Results, Homework, Guardians and pickup, Documents, Health (restricted), Transport, Library, Activity.
- Admissions pipeline: enquiry → application → test/interview → offer → enrolled. Shown as kanban or table, with document checklist, fees on offer and conversion to a student in one step.
- Duplicate finder and merge (fuzzy match on name, DOB and guardian phone) with a field-by-field merge preview.

**Academics** (Teal): Years & terms, Classes & sections, Subjects, Timetable, Substitutions, Attendance, Homework, Exams, Results, Report cards, Calendar.
- Timetable builder: day × period grid per section, with a subject palette in subject colours, drag and drop, teacher and room clash detection as you drag, teacher load view, versioning, and publish with a change summary sent to the affected people.
- Substitutions: when a teacher is absent, suggest free qualified teachers ranked by load. One click assigns and notifies.
- Attendance: register by class/date, staff attendance, corrections with reasons, absence explanations from guardians, reports, low-attendance alerts.
- Exams: create-exam stepper, schedule grid, seating plans, a **marks entry grid** that works like a spreadsheet (keyboard navigation, paste from Excel, validation against max marks, absent marker, autosave, moderation), result computation and publishing.
- Report cards: template designer (13.6), batch generation, review, then publish to the app.

**Finance** (Saffron): Fee setup, Assign, Invoices, Collect, Online payments, Receipts, Concessions, Refunds, Defaulters, Autopay, Reconciliation, Cash closing, Reports, Tally export.
- **Collect fee** (cashier): pick a student (palette or scan an ID-card barcode), see dues, select instalments, method, confirm, print or WhatsApp the receipt. It is built for keyboard speed: a regular payment takes four keystrokes after the student is found.
- Late-fee rule builder with a "try an example" calculator; concession rules with approval chains.

**Communication** (Amethyst): Notices, Events, Messages, Broadcasts, Notification templates, Delivery log.
- Notice composer: rich text (Tiptap), attachments, audience builder (all, grades, sections, roles, houses, transport routes, individuals) with a live recipient count, schedule, approval, a **real app preview**, then read receipts and reach analytics after sending.
- Office inbox: shared inbox for guardian messages, with assignment, office hours, quick replies, moderation of teacher–guardian threads per policy.

**Operations** (navy): Transport (routes on a map, stops, vehicles, drivers, assignments, live map, trip history, alerts), Library (catalogue with ISBN lookup, copies and barcode labels, loans, returns, reservations, fines), Gallery (albums, uploads, photo-consent review), Leave (students and staff), Gate & pickup (pickup authorisations with photos, gate passes, visitor log).

**Reports** (navy): report library per area, a report builder (dataset → filters → group → chart/table), saved reports, schedules (email as PDF/XLSX), exports.

**Setup** (navy): School profile & branding, Modules, App layout (dock, home, quick actions, "up next" rules) with live preview, Terminology, Languages & string overrides, Academic rules, Attendance rules, Fee rules, Communication rules, Notification templates, Custom fields, Vocabularies, Roles & permissions, Users & access, Integrations (gateway, SMS sender IDs and DLT templates, WhatsApp, email domain, SSO), Data & privacy (consents, DSR requests, retention, photo consent, exports), Audit log, Plan & usage, Year-end rollover, Setup checklist.

### 13.3 First-run setup
A resumable setup flow with a progress track:
1. Branding (with app preview)
2. Academic year and terms
3. Classes, sections and subjects (smart defaults for CBSE/ICSE/state boards)
4. Bell timings and period templates
5. Staff import and invites
6. Student and guardian import
7. Fee structures
8. Roles and modules
9. App layout
10. Invite families (QR posters and SMS/WhatsApp invites)

Each step has a preview, smart defaults, "do this step another time" (it stays on the checklist), and validation. When setup completes, a short celebration plays once. The checklist stays on the dashboard, and in the console, until it reaches 100%.

### 13.4 Year-end rollover
A guided wizard:
1. Review result status.
2. Choose the promotion rule per class: promote, detain or graduate, with exceptions.
3. Map sections for the new year.
4. Carry over fee dues and structures.
5. Archive the old year as read-only.
6. Preview every change with counts.
7. Run as a tracked job that can be undone within 72 hours.

### 13.5 Tables, forms and flows (shared patterns)
- **One DataTable** (TanStack Table + Virtual):
  - Server pagination, sorting with `aria-sort`, quick search, filter chips and an advanced filter builder.
  - Column visibility, reorder, resize and pinning; three densities.
  - **Saved views** per user and shared views per role.
  - Row selection with a floating bulk-action bar, row actions, and a detail drawer on row click.
  - CSV/XLSX/PDF export; virtual rows over 200.
  - Every state handled: loading skeleton, empty, no results with "clear filters", error with retry.
- **Forms:** React Hook Form + Zod from the contracts, top-aligned visible labels, helper text, inline validation on blur, error summary on submit with focus moved to it, autosave drafts for long forms, dirty-state guard, sticky save bar, step-up prompts for sensitive saves, custom fields rendered from definitions.
- **Pickers:** async student/staff search, date and range, file dropzone with progress and scan state, image crop, colour (contrast-checked), icon (approved set), audience builder.
- **Confirmations** name the item and the consequence. Destructive actions offer **Undo** for 10 seconds where reversible, and typed confirmation where not.

### 13.6 Template designers
Report cards, certificates, ID cards and receipts use a **block-based designer**:
- Blocks: header, student details, marks table, grading key, remarks, signatures, QR code, custom text, image.
- Blocks are ordered and configured in a side panel, with a live PDF preview from the renderer.
- No free-form canvas: every block is guaranteed to fit and to print.

### 13.7 People-facing guardrails
- Guardian phone numbers and health notes are masked by default and revealed with a logged click.
- Photo-consent flags appear on gallery uploads.
- Exports of personal data need a reason and are logged.

### 13.8 Responsive behaviour
- **Desktop and tablet (≥ 1024):** full rail and tables.
- **768–1023:** the rail collapses to icons, and drawers become wide sheets.
- **Phone (< 768):** a bottom bar with Home, Approvals, Search, Notifications and More. Tables become card lists with the same filters, and every approval, collect-fee, attendance and notice flow works one-handed. Principals use the admin on phones; it is designed for that, not shrunk.

### 13.9 Languages
The admin is fully translated (English, Hindi, Marathi) with ICU messages. Devanagari gets its own line-height and tested truncation. Numbers use Indian digit grouping (₹1,23,456.00), and dates follow the school's locale with absolute dates in tooltips.

### 13.10 Empty states
Every collection has an illustrated empty state (section 16.9) that says what will appear, why it is empty, and the one next action (plus "Import from Excel" where it applies).

### 13.11 Errors and resilience
- Widget-level and page-level error boundaries with retry.
- Queries keep previous data while refetching.
- Optimistic updates with rollback.
- Disabled double-submits.
- Friendly 403 and 404 pages.
- A "Report a problem" link attaches the request id.

### 13.12 Live app preview ("See as")
The preview is **the real Flutter app** compiled for the web (`apps/mobile` web target), shown in a device frame, running against the school's **draft** config through a preview token. Pick a role and a person ("see as Priya, parent of Aarav and Anaya"). It shows exactly what that person would see, without logging in as them. Liquid glass uses its blur fallback in the preview, which the frame labels.

## 14. Console: product (`apps/console`)

Ours only. It holds metadata, never school records.

- **Fleet board:**
  - Every school as a row: name, cell, status, plan, API/admin/app versions, config version, health signal, onboarding progress, last incident.
  - Filters, saved views, and grouping by cell, wave or plan.
  - Changes animate in place (section 18).
- **School page:**
  - Overview, entitlements and locks, config overrides, versions and migrations.
  - Mobile builds and store status, health, usage and billing.
  - Contacts and notes, support sessions, audit.
  - Danger zone: suspend, offboard, erase, with typed confirmation and a second approver.
- **New school and deployments:**
  - The new-school wizard (12.10), with saved drafts, a review with a dry run, and a live provisioning view with step logs.
  - An actions screen for deploying anything for a school or for the fleet (releases, builds, domains, migrations, moves, backups), each with its approval, progress and rollback.
  - The store-onboarding checklist and the setup progress mirrored from the admin.
- **Blueprints and targets:** the editable provisioning blueprints, wizard defaults and rules, deploy policies, approval rules and deploy targets (12.10, 12.11), with versions, diffs and dry runs.
- **Cells:** capacity (schools, database size, connections, peak RPS), placement, move-school runs, creation of a new cell (the console dispatches the infrastructure workflow, which opens the pull request to `infra/` and applies it after approval; Argo CD sync is tracked here).
- **Releases:** trains, waves and gates, live progress, halt, rollback, release notes.
- **Migrations:** per-school status per migration, failures, retry, backfill throttle.
- **Mobile builds:**
  - A matrix of schools × platforms × version with build and store state.
  - Credential health (expiring certificates, missing API keys) and store listing text and screenshots.
  - A Shorebird patch rollout view.
- **Catalog:** modules, role templates, notification templates, layouts, "up next" rules, report-card templates, with "offer update to schools".
- **Flags and kill switches:** per school or fleet, with history.
- **Health:** SLOs, burn rates, incidents, synthetic journeys and status-page publishing.
- **Support:** access requests and approvals, active sessions, ticket links.
- **Billing:** plans, invoices, payments, dunning, usage.
- **Compliance:** DPAs, sub-processors, DSR tasks, breach workflow.
- **Team and access:** console roles (super admin, support, release manager, finance, compliance, auditor) and the console's own audit log.

## 15. Design: references and how they were used

The admin and console follow **one design language of our own**, called **Nest** while we work on it. The references you chose set the calibre the product must reach. We took principles from them (how things grow, how density is handled, how empty and error moments feel) and copied no screen, chart or component. The visible design is the canvas at https://claude.ai/artifact/Q5TnE23fM6GZx93T2hhZhC (17 boards: design language, components, moments, empty states, the admin in light and dark, students, timetable, settings, phone, and the console login, fleet and school page).

Two earlier directions were withdrawn completely: the first themed concept, and a second round that borrowed a different look for each page. Nothing from either is kept.

### 15.1 What the references taught us

| Reference | What we took (the principle, not the look) |
| --- | --- |
| CareOps operations dashboard | A calm tinted floor under one floating frame; a dense KPI strip that still breathes. |
| Bloggr bento dashboard | Tiles of different sizes and tints on one grid, so the dashboard has rhythm instead of a wall of identical cards. |
| Toggl calendar and reports table | A week grid where colour carries meaning, and tables with generous rows and quiet headers. |
| Dark onboarding modal, "session is live" modal, dark toast | Dark overlays for moments that interrupt; light surfaces for what you choose. Blurred colour art behind a modal; a toast with avatars and two actions. |
| File-cabinet empty state, Tiimo illustration screens | An empty screen is a designed screen: an illustration, one honest sentence and the next step. |
| FlowBooks and Glimpse sign-ups | A split sign-in: an animated brand panel on one side, a quiet form on the other. |
| Performance report table | Pills for status, numbers aligned, a clear way to read a row. |
| Trip dates range calendar | A range picker whose highlight is one continuous band. |
| Collect UI: navigation, interaction, login, settings, profile | Collapsible sidebar, a floating nav pill, menus that grow out of their button, settings rows with the label on the left and the control on the right, a dark account menu. |

The two skills still govern the build. From **impeccable**: every interactive state, the craft floor and Reduce Motion. From **ui-ux-pro-max**: the 10-category checklist (16.12).

### 15.2 What you asked of the design
- **One look across every page.** Admin, console, login, empty states and overlays share the same tokens, shapes and motion. A page that looks like it came from another product is a bug.
- **A login with life.** Animated brand panel, step transitions, and wrong input that **vibrates** (16.6).
- **Empty pages with artwork of our own** (16.9), never a blank table.
- **Smooth motion everywhere**, from the best libraries (16.8), with Reduce Motion honoured.

### 15.3 Where the build differs from the canvas
The canvas is approved as the base. On your instruction, three kinds of element on it were judged **childish** and are **replaced in the build**. The canvas itself is not edited; the build is the source of truth for these:

| On the canvas | In the build |
| --- | --- |
| The bird-like mascot "Nesti" (login, empty states, 404, dashboard welcome, celebrations) | No character anywhere. Grown-up spot illustrations drawn from real school objects (16.9). The welcome tile shows the day's facts, not a figure. |
| Pencil-shaped columns for weekly charts | Slim rounded-top columns with hairline gridlines and a ghost of the previous period (16.7). |
| Dot rows for class attendance and "fee jars" with waves | A segmented bar with counts for present, late and absent, and a ring or segmented bar with a target marker for fees collected, pending and overdue (16.7). |

Everything else on the canvas is built as shown: layout, tokens, type, buttons, menus, tables, drawers, dialogs, toasts, the calendar, the command palette, the timetable, the settings page, the login flow and the console pages. Where a canvas page showed the mascot or one of the replaced charts, the build uses the replacement in the same place and size.

## 16. The Nest design system (admin and console)

One system serves both products. The admin defaults to light; the console defaults to dark and is otherwise identical: same cards, same type, same shapes, same motion. Each has a complete second theme.

### 16.1 Principles
- **Calm surfaces, one ink, one brand colour.** Colour is spent on the primary action, selection and data, not decoration. One dark pill button per screen is *the* action.
- **Things grow out of what you touched.** Menus, dropdowns, drawers and the phone nav morph out of their trigger. Nothing pops in from nowhere.
- **Wrong should wobble.** An error moves once, then stays calm, and says what to do.
- **Numbers move only when they change.** Live figures roll digit by digit and charts draw once. Re-visiting a page does not replay animation.
- **Nothing is blank.** Every empty, error, no-results and forbidden state has an illustration, a sentence and a next step.
- **Keyboard first.** `/` or Ctrl K finds anything; every nav item has a shortcut; focus rings are always visible.
- **Adult tone.** No toy shapes, no mascots, no exclamation-mark copy except in a celebration.

### 16.2 Layout
- **App frame:** a floating frame (28 px radius) inside a tinted floor.
- **Sidebar (272 px):** collapses to an 88 px rail; labels fade and tooltips carry shortcuts. Top to bottom: school logo and name, search, grouped navigation, a contextual card (for example "Term 1, exams in 6 days"), and the user.
- **Content:** a bento grid of tiles with different sizes and soft tints. Cards use 26 px inner padding and 20 px gaps.
- **Page header:** the date or context line above a display title; actions on the right (range menu, the dark "New" button), both morph menus.
- **Drawers** float in from the edge with rounded corners. **Bulk-action bar** is a dark floating pill. **Save bar** rises when anything changes.
- **Phone layout:** a floating dark pill with four icons; the active one expands to show its name.

### 16.3 Colour tokens
Every colour has a soft tint (surfaces), a deep tone (text on the tint) and a dark twin. These are the values on the canvas; CI checks every text and background pair against WCAG AA and the build adjusts any pair that fails (the third ink tone is the likeliest, and is only for non-essential meta text).

| Role | Light | Dark |
| --- | --- | --- |
| floor / frame / card | `#E9E5FB` / `#FBFAFE` / `#FFFFFF` | `#07060B` / `#0E0C15` / `#161320` |
| sunk (tracks, wells) | `#F4F2FA` | `#1D192B` |
| line / line-strong | `#EAE7F4` / `#DAD5EC` | `#241F35` / `#332D4D` |
| ink / ink-2 / ink-3 | `#14111F` / `#575270` / `#8C87A3` | `#F4F2FB` / `#B4AFCB` / `#7C7796` |
| violet (brand, focus, selection) / tint / deep | `#6A4CF5` / `#EEEAFF` / `#4A31C9` | `#8E78FF` / `#241D4D` / `#C4B8FF` |
| amber (attention, money) / tint | `#FFC23D` / `#FFF3D1` | `#FFCB52` / `#2E2410` |
| coral (people, notices) / tint | `#FF7A59` / `#FFE9E2` | `#FF8A6B` / `#33190F` |
| mint (done, healthy) / tint | `#17A673` / `#DFF6EC` | `#3DD6A0` / `#0E2A21` |
| blue (info) / tint | `#3B82F6` / `#E3EEFF` | `#6AA3FF` / `#14233F` |
| red (danger and errors only) / tint | `#E5484D` / `#FDECEC` | `#FF6369` / `#2D1318` |
| ink card (primary button, dark tiles) | `#17141F` | `#26213A` |

- The school's own brand colour appears on its logo, the sign-in page and the app preview. It never appears in the working chrome, so contrast never depends on a school's choice.
- Every status carries a dot and a word, never colour alone.

### 16.4 Type
- **Bricolage Grotesque** (500/700/800) for page titles, big numbers and empty-state headlines.
- **Manrope** (400–800) for everything else.
- **Noto Sans Devanagari**, chained by unicode range, for Hindi and Marathi, matched in weight.
- Scale: 12.5 meta (never smaller); 14–15 UI and tables; 16–17 forms and body; 18–24 card titles; 26–30 page titles; 40+ display and key figures with tight tracking (−0.03em) and tabular numerals.
- Line height 1.5 for body, 1.15 for headings; Devanagari gets +0.1.

### 16.5 Shape, depth, icons
- **Radii:** 12 (chips, small controls), 18 (inner wells, inputs), 26–28 (cards, frame, drawers, dialogs), full (buttons, pills, tabs).
- **Depth:** soft violet-tinted shadows for floating things; borders do the work in dark mode.
- **Icons:** one family (Lucide), 1.7 px stroke, round caps. Icon-only buttons always have a name and a tooltip with the shortcut.

### 16.6 Signature components
- **Morph menu:** the button's own box grows into the menu while options rise in a short stagger. Used for ranges, approvals, audiences and "New".
- **Sliding segmented control:** the highlight glides between options.
- **Sign-in (admin and console):** a split screen. The left panel is an animated brand panel (violet for the admin, deep ink for the console) with floating, abstract product cards and a toast that loops. The right side is the form: credentials, then a code, then a success state. **Errors vibrate:** a wrong or empty field shakes sideways (about 380 ms, four swings), turns red and shows the message under it; the lock on the brand panel shakes with it. Under Reduce Motion the shake is replaced by a red border, an icon pulse and the message.
- **Dark modals:** onboarding (blurred colour art, two pills, step dots) and celebration ("Greenfield is live", with a copy-link button that morphs into "Copied").
- **Toasts:** stacked, fan out on hover, with avatars and two actions for notifications.
- **Range calendar:** one continuous highlighted band, start and end tabs, quick ranges, a ring on today.
- **Radio cards, command palette** (grouped, keyboard-driven), **typed confirmation** (type the code, wrong text vibrates).
- **Ticket plan card** with a notch and tear line; **bulk-action pill**; **floating drawer**; **account menu** that scales in from the avatar; **save bar**; **copy button** that morphs.
- **Skeletons** after 300 ms that match the final layout, then crossfade to content.

### 16.7 Charts: quiet data
Charts are drawn in SVG and CSS in our own grammar, so they stay tiny. Large or unusual charts use ECharts with the same tokens. Charts never look like toys: no pencils, jars, coins or cartoon shapes.
- **Trend over time:** smooth line or area with a soft gradient, a dashed previous period, and a tooltip that follows the pointer.
- **Counts per day or week:** slim rounded-top columns (12 px), hairline gridlines, a pale ghost column behind each for the previous period, today in solid violet, value on hover.
- **Part of a whole** (present, late, absent; collected, pending, overdue): a segmented bar with counts and a target marker, or a thin ring with the figure in the centre. Segments draw once and the number rolls to its value.
- **Progress:** a tick bar (releases, setup, plan usage), the leading tick blinking while work is in flight.
- **Tables** carry inline sparklines and 10-day tick marks.
- Every chart has a text summary and a table view.

### 16.8 Motion
- **Libraries:** **Motion** (motion.dev) for layout morphs, shared elements, springs and presence; **GSAP** for authored sequences (the sign-in panel, illustration drawing, chart reveals); **View Transitions** for route continuity; **NumberFlow** for rolling numbers; **ECharts** for complex charts.
- **Tokens:**
  - Main curve is an expo-out (`cubic-bezier(.22,1,.36,1)`), plus a gentle overshoot spring for presses, switches and pops.
  - Durations: 120 ms press, 200 ms hover and colour, 350 ms menus and popovers, 600–900 ms entrances and morphs.
  - Lists rise in a capped stagger. Exits run at about 65% of the entry time.
- **Rules:** input is never blocked and every animation can be interrupted; only transform, opacity, clip and size animate on small elements; loops stop when hidden; effects are budgeted for an old office laptop and simplified if they miss 60 fps.
- **Reduce Motion:** every movement becomes an instant state change or a crossfade, and feedback stays visible.

### 16.9 Illustrations (replacing the mascot)
A set of **spot illustrations** in `packages/web-ui/illustrations`, flat and geometric, drawn from real school objects, in the brand palette with a fine outline detail. **No faces, characters or animals.** Each is an SVG with named layers, so an illustrator can later replace a file without touching code.

| Where | Scene |
| --- | --- |
| Students empty | An open register with empty rows and a pen resting on it |
| Notices empty | A noticeboard with a single pinned card |
| Payments empty | A receipt strip rolling out of a counter machine |
| Homework empty | A stack of notebooks and a ruler |
| Search with no match | A sheet of paper under a magnifier |
| All caught up | A completed checklist with a soft check mark |
| Error and retry | A plug just out of its socket |
| No access | A padlock on a folder |
| 404 | A torn page with oversized "404" type |
| Celebration (school is live) | A sealed envelope with a stamp |
| Console: empty fleet | A map grid with the first pin |
| Onboarding | An open timetable card and a calendar page |

Motion: strokes draw in once, the scene eases in with a slight parallax toward the pointer, and one slow idle movement (a page lifting, a pin settling). Under Reduce Motion the scene is static.

### 16.10 Components list (`packages/web-ui`)
AppFrame, Sidebar (collapsible, shortcut tooltips), SchoolSwitcher, SearchField, CommandPalette, MorphMenu, Segmented, FloatingNav, PageHeader, BentoTile, KpiTile, TrendChart, ColumnChart, SegmentBar, RingMeter, TickBar, DataTable (selection, bulk pill, saved views, virtual rows), Drawer, Dialog, ConfirmTyped, DarkModal, Toasts (stacked), SaveBar, WeekGrid, RangeCalendar, RadioCards, Switch, Checkbox, Field (inline errors with the vibrate), OtpInput, Chip, StatusChip, TrendChip, AvatarStack, Skeleton, EmptyState (with Illustration), Illustration, TicketCard, UsageBar, AccountMenu, SignInPanel, NotFound.

All are built on Radix primitives (focus, keyboard and screen readers) and shown live in Storybook in both themes.

### 16.11 Accessibility and craft floor
- WCAG 2.2 AA; visible 2.5 px violet focus rings; full keyboard use, including alternatives for drag; `aria-sort` on tables; live regions for changing counts; charts with a text summary and table view; targets at least 24 px with a pointer and 44 px on touch; zoom to 200%; long Hindi and Marathi strings tested.
- No nested cards; no emoji as icons; no colour-only meaning; no decorative gradients except named materials (the sign-in panel, the modal art, the ticket glow); browser surfaces (selection, caret, scrollbars) themed; copy names the action and errors say what to do.

### 16.12 Pre-delivery checklist (ui-ux-pro-max, per area)
Contrast in both themes · focus visible on every control · keyboard-only run of the area's core flow · icon buttons named · no colour-only meaning · inline errors with `aria-describedby` and an error summary on submit · feedback within 100 ms, skeletons after 300 ms · empty, error, no-results and forbidden states designed with illustrations · exits faster than entries, interruptible, Reduce Motion checked · CLS under 0.1 · no horizontal scroll at 360, 768, 1024, 1280, 1440, 1920 · zoom 200% · long Hindi/Marathi strings · sortable tables · charts with a table alternative · Lighthouse (sign-in, dashboard) performance ≥ 90 and accessibility 100 · axe: zero serious issues · impeccable detector clean · finish review recorded.

## 17. Console specifics
- The same system, dark by default; the same violet is the accent and the comparison colour. The console must never look like a different product from the admin.
- **Production marker:** the school switcher always shows the environment, with a pulsing red dot for production. Staging, test and local get their own chip colours.
- **Pinned schools** in the sidebar carry their cell as a small tag.
- **Release progress** is a violet tick bar that fills as schools update, with a blinking leading tick. Wave rows show done, rolling and pending states, and Pause turns the rolling marker amber.
- **Live table:** a school's version slides from the old value to the new one and its row glows once.
- **Provisioning view:** a vertical stepper with a live log; a failed step turns red, shakes once, and shows Retry and Skip (where the blueprint allows) beside the log.
- **Support session:** the whole frame takes a red border glow, and a red pill with a countdown and an End button sits at the top until the session ends.
- **Destructive actions** need the school code typed, show who must approve, and say exactly what happens; a wrong code vibrates.

## 18. Shared web engineering

- **Theme bootstrap:** a 1 KB inline script sets the theme and density before first paint (no flash). Themes are CSS variables from `packages/web-ui` tokens, generated into Tailwind v4 `@theme`.
- **Routing:** TanStack Router with typed search params, so filters and views live in the URL and are shareable. Route-level code splitting, with loaders that prefetch data on intent (hover or focus).
- **Data:** TanStack Query with `placeholderData` to keep previous data, optimistic updates and rollback, and realtime invalidation from socket events.
- **Performance budgets** (CI with size-limit + Lighthouse CI): first-load JS ≤ 180 KB gzip for the admin shell; each area chunk ≤ 120 KB; charts and editors lazy-loaded; ECharts modular imports; GSAP loaded only where used.
- **Errors:** error boundaries per route and per widget; Sentry with request-id correlation; zero console errors as a Playwright assertion.
- **Security headers:** strict CSP with nonces, Trusted Types, SRI on the shell, `frame-ancestors 'none'` (except the preview frame for the Flutter web build on the same origin), Permissions-Policy.

## 19. Mobile app

### 19.1 Restructure
- `lib/` moves to `apps/mobile`. Shared code splits into `gradeon_core` (config runtime, `ModuleRegistry`, auth, networking with `dio`, offline store), `gradeon_ui` (Chalk & Glass, unchanged design) and one package per feature.
- **Remote repositories** implement today's repository interfaces on top of the generated `gradeon_api` client, mapping DTOs to the existing models, so views and controllers do not change.
- `MockJsonDataSource` stays as the **demo school** profile for sales demos, screenshots and tests.
- The app's runtime config (`/app-config`) drives the dock, home sections, quick actions, terminology, string overrides, branding colours, modules and flags, with the current built-in layout as the fallback when no config has ever been fetched.
- **Offline:** a local SQLite store (drift) caches today's timetable, homework, notices, fees and the last 30 days of attendance; queued writes (attendance marking, homework submission) sync when back online, with conflict prompts.
- **Push:** FCM token registration per device and school; notification taps deep-link to routes; notification categories map to the user's preferences.
- **Realtime:** chat, typing, read receipts and bus tracking through `socket_io_client`, behind an interface.
- **Uploads:** presigned uploads with background resume (homework scans, chat attachments).
- The issues found in the earlier code review are fixed during the move: load races and leaked listeners in `Loadable`, the receipt mismatch, leave end-date validation, the marks-entry subject, the plaintext password in storage, and the stub remote repositories.

### 19.2 Two ways to get the app
- **School-branded apps:** one per school, in that school's Apple and Google accounts, built from `schools/<slug>/school.yaml` (bundle id, name, icon, splash, API host, Firebase project).
- **The Gradeon app:** our own listing. A family finds its school by code, QR poster or search, and can hold several schools (several children) in one app. It is built from the same code with one extra build profile and is live from day one. It is also the answer if a store rejects a school-branded app: Apple's 4.2.6 guidance points template providers to exactly this "picker" model.

### 19.3 Store compliance
- Apple 4.2.6 rejects template-built apps unless **the content provider submits them**. Each school is therefore the account holder, and **the school's own account owner presses "Submit for Review"**.
- We prepare everything: builds uploaded to the school's TestFlight with an API key the school creates for us, metadata, screenshots and review notes. The console's store checklist walks the school through each step.
- Google Play has an equivalent rule against operators publishing for others, so Play follows the same arrangement.
- Listings differ per school (the school's name, screenshots and description) to avoid repetitive-content rejections.
- The current guideline text is checked and recorded in an ADR before the first submission.

### 19.4 Release train
- One app version for every school.
- **Wave builds:** CI builds per school in parallel on EC2 Mac (iOS) and Linux (Android) runners and uploads to each school's TestFlight and Play internal track. Then it promotes to phased release, in the console's wave order.
- **Shorebird** patches Dart-only fixes to every school app and the Gradeon app without a store review, rolled out in the same waves.
- Most changes never need a release, because the app reads config at runtime.

### 19.5 Preview build
The Flutter **web** target is built from `apps/mobile` for the admin's live preview (13.12). Plugins without web support are stubbed behind interfaces, and the liquid-glass shader uses its blur fallback there.

### 19.6 Version support
The API keeps the last two contract minor versions working. Config can require a minimum app version, older apps get a soft update prompt, and force-update is a platform-only switch.

## 20. Infrastructure and environments

- **AWS Organization:**
  - Accounts: management, security and log archive, shared services (CI runners, ECR, Turborepo cache), ops (control plane, observability), backup (Object Lock), production cells, staging, development.
- **Network:** VPC per environment and region, private subnets for data stores, VPC endpoints for S3 and KMS, no public database endpoints.
- **Compute:** EKS per environment and region, **Karpenter** for nodes (Graviton), each cell in its own namespace with its own node pool and quotas, Argo CD ApplicationSets per cell.
- **Data:** RDS PostgreSQL 18 Multi-AZ per cell (Graviton, gp3/io2), PgBouncer as a deployment per cell, ElastiCache Valkey per cell (cluster mode), an S3 bucket per cell.
- **Edge:**
  - One CloudFront **multi-tenant distribution**, one **tenant per school domain** (platform subdomain + custom domains), and AWS WAF with managed rules plus rate rules per tenant.
  - The admin static assets are versioned per release; API requests are routed to the cell's load balancer.
- **Console:** separate distribution behind AWS Verified Access.
- **DR:**
  - RDS snapshots and per-school dumps copied to Hyderabad, plus images and charts mirrored.
  - A scripted region failover rebuilds cells from OpenTofu + Argo CD and restores databases there.
  - A full drill runs in staging every quarter.
- **Environments:**
  - **Local:** Docker Compose with one cell, the demo school, MinIO, Mailpit and the mock gateway (the `local` target).
  - **Test track:** the `free-test` target on free hosting plans, for testing app, admin and console together (section 30).
  - **Preview per PR:** an ephemeral namespace with a demo school, admin, console and API, deleted on merge.
  - **Staging:** a cell running the **synthetic fleet** of 500 school databases generated from the mock-data generator, plus the internal demo schools.
  - **Production.**

## 21. Security and privacy

### 21.1 DPDP (India)
- The Act and the DPDP Rules were notified on **14 November 2025**. Most obligations, including **verifiable parental consent** for children's data and the ban on tracking, behavioural monitoring and targeted advertising of children, apply from **May 2027**.
- **Schools are data fiduciaries; we are their processor.** We build:
  - Itemised notices per language.
  - Guardian consent capture verified against details the school already holds (Rule 10 allows this), and a consent ledger.
  - Purpose-bound retention schedules with automatic retention runs.
  - Data-principal requests (access, correction, erasure, nomination) through the app and the admin.
  - Grievance-officer details shown in the app.
  - Breach notification support for the 72-hour report.
  - No behavioural analytics or advertising SDKs in family or student apps.
- **A lawyer confirms the reading of the Rules and our DPA template before launch** (section 27).

### 21.2 Sensitive data
- Field-level encryption (envelope, with the school's KMS key) for health notes, government identifiers, bank details and pickup photos.
- **We never store full Aadhaar numbers.** At most the last four digits, where a school needs them for its records.

### 21.3 Hardening
- OWASP ASVS Level 2 throughout and Level 3 for auth, payments and the management API.
- Rate limits and lockouts; mTLS + signed requests on the management API.
- Signed short-lived file URLs; no personal data in logs, traces or analytics (scrubbed at the OpenTelemetry collector).
- Dependency, container and IaC scanning in CI (Trivy, Semgrep, osv-scanner); signed images (cosign) verified at deploy.
- Least-privilege IAM through IRSA.
- An external penetration test before pilot launch and every year after; a private bug-bounty programme opens at pilot launch.

### 21.4 Erasure
- A student erasure removes rows from that school's database and its search index.
- Their files are deleted, and the backups that still hold their data expire on the retention schedule. Each step is logged in `retention_runs` and `dsr_requests`.
- A school erasure is crypto-erasure (12.7).

### 21.5 Payments
Card data never touches our servers (Razorpay Checkout). Webhook secrets are per school, and webhook handlers are idempotent.

## 22. Observability, SLOs and incident response

- **OpenTelemetry** traces, metrics and logs from API, workers, realtime, renderer, PgBouncer and RDS, all labelled with the school and cell. They feed Grafana LGTM, with dashboards per school, cell and fleet.
- **SLOs** per school (availability, latency, push delivery, job lag), with burn-rate alerts to Grafana OnCall and a runbook link on every alert.
- **Sentry** (self-hosted) for app, admin, console and API errors, with release tracking per wave.
- **Status page** per school (`status.gradeon.app/<slug>`) and for the fleet, updated from the console.
- **Incident process:** severity levels, an incident channel, a timeline in the console, school notification templates, and blameless post-mortems as ADR-linked docs.

## 23. Testing and quality gates

| Layer | What |
| --- | --- |
| Unit | Services and rules: late fees, grading, ranks, attendance %, "up next" priority, config resolution, the condition→SQL compiler |
| Mutation | Stryker on `authz`, `config-engine`, `tenancy` and the money modules: mutation score ≥ 80% |
| Coverage | ≥ 80% lines on API services, ≥ 90% on the packages above |
| Integration | Every module against real Postgres 18 and Valkey (Testcontainers) |
| Authorization matrix | Generated: every role template × every endpoint × allowed/denied, plus conditions ("teacher cannot read another class") |
| Tenancy | Property tests fuzzing hosts against pools; cross-school attempts on every endpoint; staging chaos that swaps pool refs |
| Contract | Generated clients compile and run against the OpenAPI; `oasdiff` breaking-change gate |
| Migrations | squawk lint; apply up and down on a snapshot of the synthetic fleet; expand/contract checker |
| Config | Property tests: every valid random config resolves, and the app renders it; every module tested enabled and disabled |
| Admin, console | Component tests; Storybook interaction and visual tests; Playwright end-to-end (setup flow, add student, collect fee, mark attendance, publish config, rollover, provisioning, release wave); axe on every route; visual regression in both themes at 360/768/1280/1440/1920; Reduce Motion snapshots |
| Flutter | Unit and widget tests; goldens (light, dark, AMOLED, large text, reduce transparency); integration tests against the demo-school API |
| Load | k6 against the 500-school synthetic fleet at 1.5× the morning peak and a broadcast storm |
| Resilience | Pod kills, an RDS failover, Valkey failover and region-failover drills in staging |
| Restore | Weekly automated per-school restore drill |
| Design | impeccable detector and finish review per area; ui-ux-pro-max checklist (16.12) |

CI blocks merge on: types, lint, boundaries, tests, stale generated code, breaking API changes, migration lint, bundle budgets, Lighthouse thresholds, axe criticals, missing translation keys, licence policy and the security scanners.

## 24. Build order

Every step below is part of the launch. The order exists because each step needs the one before it. Each step ends at its exit check, and the next starts only after that check passes.

| Step | Builds | Exit check |
| --- | --- | --- |
| **0. Foundations** | Monorepo move, pnpm/Turborepo + pub workspaces/Melos, CI with affected builds and all gates, ADR folder. Full impeccable and ui-ux-pro-max install; `impeccable init` (PRODUCT.md); surface briefs and DESIGN.md for admin and console written from the approved canvas and the replacements in 15.3. OpenTofu accounts and networks; EKS dev and staging; Argo CD. | `pnpm turbo run test` green across TS and Dart; the app runs from `apps/mobile`; DESIGN.md exists for both surfaces and matches the canvas. |
| **1. Platform core** | `contracts` + codegen; `tenancy` (router, pools, school context); identity (OTP, passwords, passkeys, TOTP, sessions); `authz` + compiler + role templates; `config-engine` + `/app-config`; audit; files; jobs; realtime skeleton; renderer skeleton; console-api registry + provisioning v1 (blueprint engine and the `aws-cell`, `free-test` and `local` drivers); the staging cell; the synthetic fleet generator. | Provision a school from the console with the wizard on the local, free-test and staging targets; log in as each role; tenancy property tests pass; the staging cell holds 500 synthetic schools. |
| **2. Vertical slice: attendance** | Attendance end to end: API + jobs; admin shell + design system v1 (tokens, motion system, sidebar, morph menus, DataTable, KPI strip, charts); the app on the real API for attendance; console fleet board v1; Sentry + Grafana live. | A teacher marks attendance in the app, the admin shows it live, a guardian gets the push, and the console shows the school healthy; impeccable finish review passed for the admin shell. |
| **3. People and academics** | People, admissions, guardians, staff, imports, duplicates; years, classes, subjects, timetable builder, substitutions; homework; exams, marks grid, results, report-card designer and generation; certificates and ID cards; calendar; search; command palette. | Demo school fully set up through the admin; app academic screens on the real API; the Playwright journeys for this step pass. |
| **4. Finance** | Fee setup, assignment, invoices, Razorpay per school, autopay, cashier collect, receipts, concessions and refunds with approvals, late fees, defaulters and reminders, reconciliation, cash closing, Tally export, reports. | End-to-end payment in Razorpay test mode for both the online and counter paths; webhook idempotency and double-click tests pass; reconciliation matches. |
| **5. Communication** | Notices with approvals and app preview, events and RSVPs, chat and office inbox (realtime), broadcasts, notification templates, push + SMS (DLT) + WhatsApp + email, delivery log, quiet hours. | A 5,000-family broadcast reaches every test device within 60 s p95 in staging. |
| **6. Operations and assistant** | Transport with live tracking, library, gallery with photo consent, leave, gate and pickup, assistant module. | All app modules run on the real API; the mock path survives only as the demo school. |
| **7. Admin experience complete** | Setup flow, setup checklist, year-end rollover, live app preview (Flutter web), config center with drafts, approvals, history and rollback, roles matrix with diff, custom fields, vocabularies, string overrides, reports builder and schedules, guided tours, What's new, all illustrations and every signature component and motion in 16.6–16.9. | Every admin area has passed its impeccable finish review and the 16.12 checklist; DESIGN.md written for the admin. |
| **8. Console complete** | New-school wizard, blueprint and target editors, deploy actions with approvals and dry runs, cells and move-school, releases and waves with auto-halt, migration orchestrator, mobile builds matrix, catalog with update offers, flags and kill switches, health and status pages, support access, billing, compliance desk, team. | A full release goes through staging waves with an injected failure that halts and rolls back by itself; DESIGN.md written for the console. |
| **9. Mobile distribution** | Build-profile injection, the Gradeon picker app, wave build pipeline on EC2 Mac and Linux, fastlane per school, Shorebird, store checklists, offline store, deep links, push categories. | Demo school apps in TestFlight and Play internal; the Gradeon app is in review; a Shorebird patch reaches test devices. |
| **10. Production readiness** | Production cells, DR in Hyderabad, region-failover drill, k6 at 1.5× peak on the 500-school fleet, penetration test and fixes, DPDP readiness review, runbooks, on-call rota, status pages. | All SLOs met under load; the pen test has no open high-severity findings; the lawyer has signed off; the restore drill is green. **Pilot schools go live.** |

## 25. What we are not taking from the pasted prompt, and why

These are the only items not taken, each for a reason in the design, not for timing.

| Not taken | Reason | What we do instead |
| --- | --- | --- |
| `school_id` on every table + composite tenant uniques + Postgres RLS + tenant middleware | One gap leaks children's data across schools; per-school restore, erasure and moves become hard | A database per school (section 6) |
| A super admin and cross-school reports inside the school admin | Mixes our access with the school's | The console + time-boxed support access |
| `schools` and plans tables in the data database | The registry is ours, not a school's | Console database |
| "`docker compose up` brings up everything" as the production acceptance test | Describes one shared deployment | Compose for local only; the console provisions real cells |
| Next.js App Router | Server rendering adds cost and no benefit to a logged-in tool | React + Vite static SPA on the CDN |
| Prisma | One heavy client per school database behind a pooled API | Drizzle |
| PermissionsGuard cached in Redis with hand-written row scoping | Scoping rules scattered through the code | CASL rules compiled to SQL filters |
| WebSockets inside the API process | Does not scale independently | `apps/realtime` |
| One shared Redis | Noisy schools and cross-cell blast radius | Valkey per cell, namespaced per school |
| "Nothing static, ever" as an absolute rule | Creates settings nobody uses, each one a way to break an app | Configure what schools really differ on; defaults live in module manifests |
| Flat key/value settings and free-form layout JSONB | A typo can crash every school's app | Schema-validated, versioned layers with draft, preview, publish and rollback |
| "Soft Modern Pro" look: gradient blobs, Plus Jakarta Sans / Inter / Sora, glass on the top bar, six accent presets | You asked for the design to come from the two skills; impeccable lists these as category defaults | The reference-led system in sections 15–17 |
| Recharts | Weaker for large data and animated transitions; no colour-blind patterns | ECharts |
| Lottie | Heavy files for small moments | Motion and GSAP animating our own SVG |
| Counters and charts re-animating on every page visit | Moving numbers are unreadable for the duration of the animation | Numbers roll when they change; the morning assembly runs once a day |
| Flutter integration as the last phase | The app should talk to the real API from the first slice | Step 2 vertical slice |
| Pause for "continue" after every phase | A working-style choice, not architecture | Exit checks per step (section 24); you can still ask to pause |
| Hand-written Dart API calls | Drift from the API | Generated `gradeon_api` client under the existing repository interfaces |

## 26. What we adopted from the prompt

- **Data model:** the schema ideas (attendance statuses with "counts as present", grading schemes and bands, exam types with weightage, period templates and slots, fee heads/structures/instalments/late-fee rules/concessions, notification templates with variables, custom field definitions, lookup lists → managed vocabularies, `version` optimistic locking, audit before/after, UUIDv7, paise + currency).
- **API:** mock-shaped responses so the app maps without UI changes; one aggregated dashboard call with independently failing sections; payment idempotency keys and verified, idempotent webhooks; refresh-token rotation with reuse detection; ETag on config; the demo-school seed built from `assets/mock/*.json` with relative dates.
- **Admin features:** the setup flow and checklist, "needs attention" rules, the CSV import wizard with row-level errors, saved views, bulk actions with undo, detail drawers, the command palette, keyboard shortcuts and help sheet, a guided tour, the marks entry grid, the timetable clash detection, the fee collection flow with printable receipt, the notice composer with recipient count and phone preview, the audit diff viewer, the version-conflict dialog, session-expiry recovery and the offline banner.
- **Tooling and quality:** a Bruno collection (generated), 80% service coverage, Lighthouse and CLS targets, axe, Playwright journeys, Storybook, and a design-system showcase page.

## 27. Gating work outside code

Each item has an owner and must be done before the pilot. None of it is optional.

| Item | Owner | Why |
| --- | --- | --- |
| Lawyer review of DPDP obligations, our DPA, privacy notices and consent flows | You + counsel | Children's data; Rules apply from May 2027, pilots start before that, so we build to them now |
| Gradeon legal entity, GST registration, platform domain | You | Billing schools; the Gradeon app's store listing |
| Apple Developer Program (organisation, D-U-N-S) and Google Play organisation account for Gradeon | You | The Gradeon app |
| Each pilot school: its own Apple and Google organisation accounts and API keys for us | School, guided by the console checklist | 4.2.6: the school submits its own app |
| DLT registration (entity, sender IDs, templates) for SMS | You (platform), schools (their sender ID) | Indian SMS rules |
| WhatsApp Business verification and template approvals | You | WhatsApp channel |
| Razorpay KYC for each school's merchant account | School | Fees go to the school |
| AWS organisation, India region quotas, EC2 Mac capacity | You | Infrastructure |
| Penetration test vendor | You | Section 21.3 |
| Illustrator (optional) to polish the spot illustrations; we draw the first set ourselves | You | Section 16.9 |
| Cyber insurance | You | Operating children's data at scale |

## 28. Risks I want you to see

- **Size.** This is a large platform: three web apps, five services, an app restructure and a cloud foundation. Built fully before pilot, it is many months of work for a small team, even with agents. The order in section 24 keeps something demonstrable working from step 2 onward.
- **Cost before revenue.** EKS, RDS Multi-AZ per cell, observability and DR cost money from day one: roughly a few thousand US dollars a month for staging + one production cell (an estimate, not a quote). The synthetic 500-school staging fleet is the costliest test environment, and it is the only way to prove the scaling claims before real schools arrive.
- **Stores.** 4.2.6 and Play's equivalent depend on reviewers. The Gradeon picker app protects every school if a branded app is rejected.
- **Effects on old office PCs.** The effect-rich design is budgeted for an i3 laptop. Any effect that misses 60 fps there gets simplified before it ships, never shipped as is.

## 29. Calls I made (please check)

1. Pooled API per cell + a database per school, instead of one shared database or a full stack per school.
2. AWS Mumbai with Hyderabad DR; EKS, RDS PostgreSQL 18, Valkey, CloudFront SaaS Manager.
3. Drizzle instead of Prisma.
4. Each school is its own Razorpay merchant.
5. Both delivery paths built: school-branded apps (the school submits) and the Gradeon picker app.
6. The admin and console follow one design language of our own (section 15); the canvas shows it, with the mascot, pencil columns and fee jars replaced in the build (15.3).
7. Fonts: Bricolage Grotesque and Manrope, with Noto Sans Devanagari for Hindi and Marathi.
8. Motion stack: Motion, GSAP, View Transitions, NumberFlow, ECharts, dnd-kit; Lenis and Lottie rejected.
9. Light-default admin and dark-default console, one violet brand colour for both, each with a complete second theme.
10. The assistant module on Claude, opt-in per school.
11. Typst for every PDF.
12. Self-hosted observability, errors and analytics in India; no behavioural analytics in family and student apps.
13. Onboarding and deployment run from the console through editable blueprints and deploy targets, so the same wizard works on production, test and the laptop (12.10, 12.11).
14. The test track uses Oracle Cloud Always Free for the backend, Neon for databases, Cloudflare for static hosting and files, and GitHub Actions for builds (section 30).
15. Spot illustrations drawn from school objects replace the mascot; slim columns, segmented bars and rings replace pencils, dots and jars (15.3, 16.7, 16.9).

## 30. Before the real servers: testing the whole platform at no cost

Until the first school signs, we have no budget for servers. The platform still has to be built, tested and shown, and **the app, the admin panel and the console have to work together while we test**, exactly as they will for a real school: create a school in the console, deploy it, open its admin, run its app. So testing uses the same code and the same wizard as production. A single setting (the **deploy target**, 12.11) picks the place it runs. Nothing built for testing is thrown away later.

**1. The workshop: everything on one laptop.**
- One start command brings up the backend, the admin panel, the console and a demo school called Greenfield, already filled with the app's existing dummy data.
- The console's new-school wizard works here too, on the `local` target, so a second school can be created in a minute.
- The phone app connects over the office Wi-Fi. Payments run in the gateway's test mode, and SMS, WhatsApp and email land in a local inbox page.
- It works without internet and costs nothing. It needs Docker Desktop (free) and a laptop with 16 GB of memory to be comfortable.
- This is where daily building happens.

**2. The showroom: always online, free, no server at all.**
- A showcase build of the admin and the console runs entirely in the visitor's browser with the demo school built in, including a simulated new-school wizard. It is the same idea the app uses today with its dummy data.
- Hosted free on Cloudflare Pages, at a link we can send to anyone. Every visitor gets a private copy; changes stay in their browser and "Reset demo" starts fresh.
- The same site offers the Android app to download and a web version of the app.
- It cannot break or leak anything because it has no real data. It is for sales meetings and showing schools.

**3. The test track: the real platform, small, on free plans.**
This is the one that matters for testing together. It is a miniature of production on the `free-test` target. You open the test console, create a school with the wizard, and a few minutes later that school has its own database, its own admin address, an invite waiting in the sandbox inbox and an Android app you can install, all talking to each other.

| Part | Where it runs, free | Notes |
| --- | --- | --- |
| Admin, console, web version of the app, showroom | **Cloudflare Pages** | Static files on a free CDN. |
| Backend (school API, workers, realtime, console API) | **A free always-on virtual machine on Oracle Cloud's Always Free tier**, run with Docker Compose and exposed through a free Cloudflare Tunnel | Always on, no cold start. Oracle cut the free ARM allowance in 2026 to about 2 CPUs and 12 GB, which is enough for the test stack. Needs a card for identity checks and is not charged while we stay inside the free limits. Capacity in a region can be unavailable. **Fallback:** a free Render web service, which sleeps when idle and takes 30–60 seconds to wake. |
| Databases | **Neon free plan**: one project per test school and one for the console registry | The free plan allows 100 projects with 0.5 GB each and sleeps when idle. This matches our database-per-school design exactly, so the wizard's "create database" step is the same step as in production. |
| Files | **Cloudflare R2** | The free allowance is 10 GB with free downloads. |
| Email | A free transactional email plan | SMS and WhatsApp are simulated into the console's sandbox inbox, so you see exactly what a parent would get. |
| Payments | **Razorpay test mode** | No money moves. |
| Building the app | **GitHub Actions** | The wizard's "Build app" button runs the workflow and gives an Android install link, which can also go through Firebase App Distribution (free). iPhones need Apple's paid membership and TestFlight. |
| Releases and updates | The console's Releases screen dispatches the same workflow production uses; the VM pulls the new images | We update the test track from the console like a real fleet. |
| Addresses | Without a domain: `<test-site>/s/<slug>` for each school. With a domain (about ₹1,000 a year): `<slug>.test.<domain>` | A setting called tenant addressing picks one. |
| Health and alerts | The console's own health page, a free uptime pinger and a free error-tracking plan | Good enough for a small team. |

Differences from production, so nobody is surprised:
- It is one machine, so there is no failover, no disaster-recovery region, no firewall tier and no load testing worth quoting.
- Neon databases sleep when idle, so the first request after a quiet spell is slower.
- Keys are held by the app instead of a key-management service.
- There are no uptime promises, and free plans change their terms.

**4. Real schools: production.** The day a real school signs, its school is created from the same console on the `aws-cell` target in Mumbai (section 20). Nothing is rewritten.

**One rule that never bends:** only demo data goes into the showroom or the test track, never a real child's details. Free hosting gives no guarantees about where data sits or how it is protected, and India's rules for children's data are strict.

**Order:**
1. The workshop is ready at the end of build step 1 (the console's blueprint engine and the `local` target).
2. The test track opens at the end of build step 2, when the attendance slice works end to end, and gains each module as it lands.
3. The showroom follows once the admin screens exist (step 3 onward) and is updated with every release.

**Cost:** ₹0 for all three. Optional extras:
- A domain name (about ₹1,000 a year), for nicer school addresses.
- Google Play's one-time $25 registration, for testing through the Play Store. Until then the Android app is shared as a link.
- Apple's developer membership ($99 a year), only for testing on iPhones through TestFlight.

Free plans change their terms. The figures above were checked on 18 October 2026; check them again on the day we set things up.

## Sources

- Impeccable skill (upstream): https://github.com/pbakaus/impeccable
- ui-ux-pro-max skill (upstream): https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- DPDP Rules 2025 notification and timeline: https://www.mondaq.com/regulatory-update-notification-of-the-digital-personal-data-protection-rules-2025/1713500 · https://www.scconline.com/blog/post/2025/12/26/digital-personal-data-protection-rules-2025-key-highlights/ · https://www.amsshardul.com/insight/enforcement-of-the-dpdp-act-and-notification-of-the-dpdp-rules/
- CloudFront SaaS Manager: https://aws.amazon.com/blogs/aws/reduce-your-operational-overhead-today-with-amazon-cloudfront-saas-manager · https://docs.amazonaws.cn/en_us/AmazonCloudFront/latest/DeveloperGuide/distribution-config-options.html
- GSAP free licence: https://webflow.com/updates/gsap-becomes-free · https://gsap.com/community/standard-license/
- Apple 4.2.6: https://www.imore.com/apple-eases-template-based-apps · https://runtimewire.com/article/apple-guideline-426-app-generation-submission
- Free-tier terms checked 2026-10-18: Oracle Always Free ARM reduction https://www.infoq.com/news/2026/07/oracle-cloud-free-tier-limits/ · Neon free plan https://neon.com/faqs/free-plan-limits-and-quotas · Cloudflare R2 pricing https://developers.cloudflare.com/r2/pricing/
- Earlier sources (pub workspaces, Melos, white-label Flutter, single-tenant control planes, CASL): see the replaced spec in git history.
