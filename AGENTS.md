# Gradeon — guide for coding agents and new developers

Gradeon is a school platform: a TypeScript backend, a school admin, a console and the Flutter school app (parents and teachers; students do not sign in) in the **Chalk & Glass** design. The Flutter app runs on local JSON mock data by default; built with `SCHOOL` and `API_BASE_URL` it signs in and reads the school's real data through the family API (`/v1/f/*`, see `docs/HANDOFF.md` section 9.3 and `docs/API_CONTRACT.md`). Read this file first. It is the single source of truth: `CLAUDE.md` and `AGENT.md` only point here.

Branch work happens on feature branches off `main`; the Render test deployment builds from `main`, so a change reaches `https://gradeon.onrender.com` only after it is merged (or pushed) to `main`. The Chalk & Glass redesign of the app was merged to `main`; `redesign/chalk-glass` and `apple_glass` remain on GitHub as history.

## The platform (admin, console, backend) lives next to the app

This repository is also a TypeScript monorepo: `apps/admin` (school admin), `apps/console` (Gradeon control room), `apps/api` + `apps/console-api` + `apps/server` (NestJS backend, one PostgreSQL database per school), `packages/*` (contracts, config engine, db, security, tenancy, api-client, web-ui). **Read [`docs/HANDOFF.md`](docs/HANDOFF.md) first for anything outside `lib/`**: what exists, why it is built that way, how to run and verify it, how it is deployed (`https://gradeon.onrender.com`), and what is left with step-by-step instructions. The look of admin and console is in [`docs/DESIGN.md`](docs/DESIGN.md) and the approved boards in [`design/`](design/README.md); the Chalk & Glass rules below apply to the Flutter app only.

Platform commands (Node 24, pnpm 10):

```bash
pnpm install && pnpm build          # once
pnpm typecheck && pnpm test         # types and tests (API tests start a real PostgreSQL)
bash tools/dev-reset.sh &           # local PostgreSQL + server + Greenfield demo school (run in the background)
pnpm --filter @gradeon/admin dev    # http://localhost:5173/s/greenfield
pnpm --filter @gradeon/console dev  # http://localhost:5174
node tools/audit-ui.mjs             # every page, 4 widths, light/dark: errors, overflow, clipping
node tools/e2e-flows.mjs            # 50 browser flows (re-run dev-reset first; it changes data)
node tools/scan-gaps.mjs            # columns ending unevenly; also scan-fit.mjs (tabs, pills) and scan-scroll.mjs (scroll areas)
```

Platform rules that have bitten us: **schools configure nothing** (every setting and role is changed from the console; the school's own data such as its timetable stays with the school behind a console switch like `timetable.schoolEdits`; a new setting goes into `SchoolSettingsSchema` and `SETTINGS_META`, never a school-side write route, and is marked `notUsedYet` until something uses it); every school API route declares its module or feature with `@RequireModule('fees')` / `@RequireModule('fees.onlinePayment')` or says `@Core()` (default deny; `apps/api/test/plan.test.ts` fails otherwise), and a new module or feature goes into `MODULES` in `config-engine` first; a module's data comes in through the one import engine (add its kind to `IMPORT_KINDS` and an `Impl` in `packages/db/src/import/kinds.ts`, HANDOFF §15), never a separate importer, and a column with fixed values lists them in `options` (the template's dropdown) and checks against the same constant; never edit an applied SQL migration (add a new file, CI checks); declare build-time env in `turbo.json`; `apps/server` imports the API packages from `dist/` (rebuild after changing them); the menu, search and dock are mounted once by each app's signed-in layout (`app/Layout.tsx`): a page renders in `PageScope` and reads the shell with `useShellChrome()`, never `Shell` or `useChrome`; check new CSS class names against `nest.css`; do not re-run `tools/dc-to-tsx.mjs` over edited views; keep `tools/audit-ui.mjs` and `tools/e2e-flows.mjs` green before every push and run `node tools/scan-cutoff.mjs` for text that is cut off; a table row (`.rw`) has a fixed height, so a wrapping row needs `height:auto`; shared controls belong in `packages/web-ui/src/blocks.css` (`pages.css` only loads on pages built with `Page`); the owner reviews design, so pages without a canvas board must be built only from `packages/web-ui` pieces; build from `@gradeon/web-ui` parts only: `Select` (never a bare `<select>`), `Menu`/`MenuButton`/`Pop` for anything that opens from a button, `Dialog`, `Panel`, `ToastSlot`, `Segmented`, the fields (`DateField`, `TimeField`, `MonthField`, `NumberField`, `ColourField`, `Checkbox`, `FilePick`: no browser widgets), `data-tip` for every tooltip (never `title=`), and `data-even`/`data-even-scroll` on side-by-side columns (`EvenRows`); wrap a conditionally shown overlay in `<Presence>` so it fades out; time every motion with `--t1/2/3` (120/200/300 ms), never a literal duration; **every colour is a token the console can change** (no hex, `rgb()` or `white` in a page: `var(--onCi)`, `color-mix(in srgb,var(--onCi) 14%,transparent)`…; a new colour goes into `WEB_TOKENS`/`APP_TOKENS` in `packages/contracts/src/theme.ts` and `nest.css` together, then `node tools/gen-app-palette.mjs`); type, radii and spacing come from the scales in `docs/DESIGN.md` §2; toasts are timed by `useToast()`; `packages/web-ui/src/rules.test.ts` fails on each of these; never stretch a card to fill space. **Every third party goes through the Integrations Hub** (`packages/integrations`, `docs/integrations.md`): send messages with `Messenger.send`/`notify` (never insert into `sandbox_messages` or call a provider directly), reach storage, payments and maps with `hub.resolve(capability, schoolId, slug)`, and add a provider as a `ProviderDef` plus an adapter; background work per school is a `job_queue` kind (`enqueue`, a handler registered with `HubService.handle`).

## Commands

```bash
flutter pub get
tool/verify.sh                     # analyze + all tests. Run before every commit.
flutter test test/some_test.dart   # one file
flutter run                        # mock data, no backend needed
flutter run --dart-define=EMPTY_DATA=true   # brand-new school with no content: check every empty state
flutter run --dart-define=ASSISTANT=true    # turns on the (future) assistant feature flag
flutter build apk --release --target-platform android-arm64,android-arm
```

Headless screenshots (no emulator needed; they look the same as on a device, since glass is a solid fill):

```bash
flutter test test/tool/shoot_test.dart --dart-define=SHOOT_DIR=D:/out --dart-define=SHOOT_ROLE=parent
#   SHOOT_ROLE=parent|teacher|guest   SHOOT_DARK=true   EMPTY_DATA=true   SHOOT_W=390 SHOOT_H=844
```

Release builds come from the console's build workflow (`.github/workflows/mobile-build.yml`), which sets `SCHOOL` and `API_BASE_URL` and leaves `assets/mock/` out; a release build without both refuses to start. See `docs/dev-environment.md` for machine setup and build pitfalls.

## Architecture in one screen

```
View (GetView/StatelessWidget)  →  Controller (GetxController + Loadable)  →  Repository (abstract)  →  DataSource
                                                                              ├─ Mock*  (assets/mock/*.json, MockJsonDataSource)
                                                                              └─ Remote* (RemoteDataSource → ApiClient)
```

- `lib/core/` shared infrastructure: `bindings/` (DI), `config/app_config.dart` (flags), `routes/`, `services/` (auth, storage, theme, session bus), `theme/`, `translations/`, `utils/`, `widgets/` (design system).
- `lib/data/` `models/`, `repositories/` (interface + Mock + Remote in one file per area), `datasources/`.
- `lib/features/<feature>/` `views/` and `controllers/` (and `widgets/` when a feature has reusable pieces). A view never talks to a repository; a controller never builds widgets.
- `InitialBinding` registers every repository: Mock when `AppConfig.useMockData`, Remote otherwise. Add a repository in **both** branches.
- `Loadable` gives a controller `state` (loading/success/empty/error), `run(...)`, and auto-reload when the `SessionBus` bumps (after any mock write) or the active child changes.
- Barrels: `core/widgets/ui.dart` re-exports `ui/*`; `teacher_tools_view.dart` re-exports the teacher screens. Import the barrel, put code in the part.

Details: `docs/architecture.md`. How to add a screen, a repository, or an AI feature: `docs/adding-a-feature.md`. Design rules and tokens: `docs/design-system.md`. HTTP shapes: `docs/API_CONTRACT.md`. Mock data shapes: `docs/MOCK_SCHEMA.md`.

## Rules that have bitten us (follow them)

1. **Translations.** All user-visible text goes through keys in `lib/core/translations/` (`'area.key'.tr`). Parameters use **`.trp({'name': value})`**, never `.trParams` (GetX replaces key prefixes, so `@n` eats `@name`). Hindi and Marathi fall back to English; add `en` first. `test/translation_keys_test.dart` fails on any literal key that is missing. Keys passed as widget parameters (`emptyTitle: 'x.y'`) are translated inside the widget, so they are not checked: double-check them.
2. **Never run repo-wide `dart fix --apply` or `dart format .`, and do not run `dart format` on a file you only touched in a few lines.** The code is hand-formatted to about 120 columns; the formatter's default is 80, so it rewraps whole files and buries your change in noise (it rewrote unrelated files and broke types once). Match the surrounding style by hand. Remove unused imports in the files you touched only.
3. **No empty screens.** Every list or collection screen must handle the "brand-new school" case with `ViewStateView(emptyArt:, emptyTitle:, emptyBody:, emptyHint:, emptyActions:)` and an `EmptyArt` illustration, in friendly copy that says what will appear and what the user can do. Check with `--dart-define=EMPTY_DATA=true` (also a switch on the design-system screen).
4. **Glass is for floating controls only** (dock, top icon buttons, pills, sheets, toast, bottom action bars). Never put a glass block behind page content such as a header, a card, or a greeting. Use `Glass`, `GlassIconButton`, `GlassSegmented`, `GlassSwitch`, `GlassSlider` from `core/widgets/`; do not draw your own. On colourful art use `onPigment: true`.
5. **Layout traps we hit**: `Container(alignment:)` expands to fill its parent. A `Row` without `crossAxisAlignment: stretch` gives a 0-height `ColoredBox`. A `Column` in a loose-height parent needs `mainAxisSize: min`. A `Column` with default centre alignment will float a shrink-wrapped child to the middle (use `stretch`). `Obx` with no observable read inside throws. Labels next to chips need `Expanded`/`Flexible` plus a gap and `ellipsis`.
6. **Dummy data lives in `assets/mock/*.json`.** Dates use relative tokens (`today-1`, `today+2T09:00`) resolved by `date_seed.dart`; keep them valid (`today-0T010:12` crashed headless runs). Mock calls answer in 30–90 ms by default; do not add artificial delays. `AppConfig.slowNetwork` (Developer switch) is how you test loading states.
7. **Do not add dependencies for a few lines of code.** `phosphor_flutter` is vendored under `packages/` on purpose.
8. **Sign-out** goes through `AuthService.signOut()` (clears the session, navigates to login first, then clears state). Do not clear state before navigating.
9. **Glass is a solid floating surface.** `Glass` blurs and refracts nothing: it is a filled, shadowed surface (paper on the page, brand ink with `onPigment`), so it costs nothing to scroll and reads the same in every theme. The liquid-glass shaders in `shaders/` are kept but not loaded (not in `pubspec.yaml`). Still: never nest one `Glass` inside another or inside an `Opacity`/fade; text on it is ink, white only with `onPigment`; and **never cover content with page-coloured fade bands** near floating controls (in dark themes they read as black shadows; only the thin status-bar scrim in `PageFrame` is allowed). Check floating controls over colourful art, scrolled, and in **dark mode** (the owner uses dark).
10. **Overlays need a Material.** Anything mounted above the Navigator (toasts) must sit in a `Material(type: MaterialType.transparency)` or its text gets the debug double underline.
11. **Screens that reorder after an action** must hold their position until the next load (the featured event card swapped to another event on the first RSVP, hiding the answer). Pin the choice in the controller.
12. **Any day of the week must have content.** The demo school teaches seven days (`weeklyOffDays` in `core/utils/schedule.dart`); add demo data for every weekday, never assume "today" has lectures. Filters go under the page title, not in a bottom bar.
13. **GetX controller lifetime.** A controller registered with `Get.lazyPut` is deleted when the route that created it is popped. A screen that is both a tab and a pushed route (Fees, Notices, Homework, Events...) then threw "FeesController not found" and rendered blank in release (Home → Pay → back → Fees tab). Every `lazyPut` in `app_pages.dart` uses `fenix: true` so a deleted controller is rebuilt on the next `Get.find`; keep it that way for new routes. Verify any new tab/route pair by opening it both ways on a device.
14. **Pull to refresh** goes through `PageFrame(onRefresh:)` (`_PullToRefresh`): one whole circle in the empty centre of the top row. Home has no refresh circle because pulling down there opens Search.
15. **Performance**: tabs are lazy (`LazyIndexedStack`); keep per-screen glass to the few floating controls; avoid animating layout; `Rise` stagger is capped. Release builds are what you judge speed on, not debug.
16. **The design system is enforced** (`test/design_rules_test.dart`, `docs/design-system.md`): colours from `context.app` / `AppColors` / `AppPalette` (the school's palette from the console, never `Color(0x…)` in a screen), text from a role (`context.type.<role>` or `AppText.<role>`, never `anek()`, `fontSize:` or `fontWeight:` in a screen), timing from `AppMotion` and the curve tokens, radii and spacing on their scales, taps through `Pressable`. Counts use `'key'.trn(n)` with a `_one` key for the singular.

## Conventions

- Dart: `very_good_analysis` (see `analysis_options.yaml`). `dart analyze lib test` must show no errors or warnings. Prefer small, focused files; a view file over ~500 lines should be split by screen or sheet.
- Controllers live in `controllers/`, never inside a view file. Shared helpers that two files need become public and move next to the controller or into `core/utils`.
- Comments say *why*, one line. Mark a deliberate limit with `// shortcut: <the limit>, <when to upgrade>`.
- Commits are atomic and use Conventional Commits (`fix(glass): …`, `refactor(fees): …`). Keep refactors separate from behaviour changes.
- Visual changes: look at them (headless shot at minimum; emulator for glass). Light, dark, AMOLED; small phone (360×640), phone (390×844), tablet (≥ 840 wide).
- Demo accounts: password `demo123`, OTP `123456` on demo content; `nest2026` and code `424242` on a school build against the demo school. Parent Priya, teacher Kavita (see `README.md`). Students do not sign in.

## Where things are

| I want to… | Look at |
| --- | --- |
| change colours, type, spacing | `core/theme/` (`tokens.dart`, `app_colors.dart`, `app_typography.dart`) |
| add or edit copy | `core/translations/en_redesign.dart` (redesign copy), `app_translations.dart` |
| add a route | `core/routes/app_routes.dart` + `app_pages.dart` (and a `Binding` if the controller is not on the shell) |
| add mock content | `assets/mock/*.json` + `docs/MOCK_SCHEMA.md` |
| toggle a feature or demo mode | `core/config/app_config.dart` |
| change glass | `core/widgets/glass.dart` (a solid fill; the shaders in `shaders/` are not loaded) |
| make an empty state | `core/widgets/states.dart`, `empty_art.dart` |
| see all the building blocks | design-system screen (Settings → About → long-press the version row) |

## Working with agents on this repo

- Start from this file; open `docs/` only for the area you touch.
- Slash commands in `.claude/commands/`: `/verify`, `/shoot`, `/new-screen`, `/new-repository`, `/new-ai-feature`.
- Parallel sessions: one writer per set of files; use a worktree per session. Never edit `assets/mock/*.json` and `en_redesign.dart` from two sessions at once (merge hot-spots).
- After a change, tell the user what you did **not** check (a real device, other roles, other themes).
