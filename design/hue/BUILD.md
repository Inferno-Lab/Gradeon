# Building Gradeon Hue into the product

The working checklist for the one-pass build of Hue, the icon system and the empty states into the admin, the console and the app (started 12 November 2026 on `design/system-v2`, after `main` @ 863abf3). Every row is ticked only after it is checked in the running product.

## Decisions

1. **Colour.** One seed per school: the hue of the school's brand colour (`brand.color`, set in the console). `packages/contracts/src/hue.ts` is `palette.mjs` in TypeScript: `hueTokens(seed, mode)` gives every token for `light`, `dark` and `amoled` (dark on true black). Every integer hue passes the contrast pairs (worst margin 1.15, a fixed status colour), so the console accepts any colour and never refuses one. The per-token colour editor (`theme.colors`, `WEB_TOKENS`, `APP_TOKENS`, `APP_SHARED`) goes: nobody picks a hex value. The console itself is the cobalt seed (262).
2. **Web tokens** are Hue's names (`--bg --s1 --s2 --s3 --line --line2 --t1 --t2 --t3 --deep… --brand… --ok --ok-s --ok-i --ok-d --on-ok…`, spectrum `--c --cs --ci` under `.sp-<colour>`). Every old Nest variable is renamed through one table (below); none survives (`rules.test.ts` fails on them).
3. **Web components keep their class names** (pages, tests and the e2e flows use them) and are restyled to the Hue boards: deep frame and menu, a light sheet with a 24 px radius, bright "you are here", brand actions, Mona Sans in two voices, the Hue scales. Class names are internal; the look is the system.
4. **Icons** come only from `code/icons.ts` (`IC`, `GLYPH`) through one `<Icon>` piece; hand-drawn 24-grid icons are replaced one by one. The app uses `AppIcons`.
5. **Empty states**: the web kit (`packages/web-ui/src/empty/`) ports `empty.css`; each page's scene is the approved board's scene. Pages that are new since the approval get a scene in the same kit, drawn on the canvas too. The app gets `EmptyKit` and one scene per screen.
6. **App**: Chalk & Glass is replaced: Hue palette from the seed (sent by the server as today, new keys), Mona Sans and Noto Sans Devanagari (downloaded with the owner's yes, OFL), deep header, sheet, tab bar with a bright active block, Hue scales.

## Old → new web variables

| Nest | Hue | | Nest | Hue |
| --- | --- | --- | --- | --- |
| `--bd` | `--deep` (behind the frame) | | `--v` | `--brand` |
| `--frame` | `--bg` | | `--onV` | `--on-brand` |
| `--card` | `--s1` | | `--vS` | `--brand-soft` |
| `--sunk` | `--s2` | | `--vD` | `--brand-ink` |
| `--line` | `--line` | | `--v2` | `--brand-line` |
| `--line2` | `--line2` | | `--vL` | `--brand-soft2` |
| `--field` | `--ink3` | | `--g` `--gS` `--gD` | `--ok` `--ok-s` `--ok-i` |
| `--ink` `--ink2` `--ink3` | `--ink` `--ink2` `--ink3` (Hue's t1–t3; --t1..3 stay motion timings on the web) | | `--a` `--aS` `--aD` | `--warn` `--warn-s` `--warn-i` |
| `--pri` `--priT` | `--brand` `--on-brand` | | `--c` `--cS` `--cD` | `--bad` `--bad-s` `--bad-i` |
| `--ci` `--onCi` | `--deep` `--on-deep` | | `--cF` `--onCF` | `--bad` `--on-bad` |
| `--knob` | `--s1` | | `--present` | `--line2` |
| `--sh1` `--sh2` `--sh3` | `--shadow` | | `--subj-<id>` | `.sp-<colour>` |

## The owner's standard (12 November)

"The design system must be the same caliber as the canvas; nothing else, because the canvas is what I approved." So:
- A page with a board is rebuilt from the board's composition (its markup and classes), bound to real data, then compared side by side with the board shot (`design/hue/shots/<Board>.png`) at 1440 and checked at phone width and in dark.
- Boarded web pages: dashboard ← Today, students ← Students, fees ← Fees, attendance ← Attendance, timetable ← Timetable, menu ← Sidebar, sign-in ← SignIn; console fleet ← Fleet, school ← School, modules ← Modules. App: parent home ← ParentHome, fees ← ParentFees, results ← ParentResults, teacher home ← TeacherHome, roll call ← RollCall, empty home ← EmptyHome, the kit ← AppKit.
- Every other page is built only from the canvas's parts (Components, AppKit).
- Hue's component CSS (`design/hue/base.css`, `base2.css`) is ported into web-ui as `hue-parts.css` under `.nest`; class names that already meant something else in Nest are renamed in the port: Hue `.rw` → `.fx`, `.tr` → `.trow`, `.tile` → `.ht`, `.mini` → `.mcard`, `.st` → `.stb`, `.float` → `.flt`, `.sheet` → `.psheet`, `.col` → `.vc`.

## Progress log

- Done (committed e7cb365 and after): contracts hue.ts + migrations; web tokens renamed; nest/shell/blocks/controls/polish restyled; Icon + icon map + every drawn icon replaced; sign-in rebuilt from SignIn; EmptyState (shadow-DOM scenes from the boards) wired on every truly-empty page (38 scenes incl. new audit, privacy, support sessions on EmptyAdmin6/EmptyConsole3); EmptyCard is the compact Hue card; illustrations deleted; /design style guide rebuilt; subjects use `subjectColour` (contracts).
- Dev servers for checks: PostgreSQL 54339, server 4010 (scratchpad server-ds.sh), admin vite 5183, console vite 5184; `API=http://localhost:4010 node tools/shot.mjs <url> <png> 1440 960 [--console]`.
- Rebuilt and compared with their boards: dashboard (Today), fees overview (Fees), roll call (Attendance), timetable (Timetable, also fixes six-day weeks), sign-in (SignIn), menu (Sidebar). Students already matches the board's language and keeps its extra functions.
- Next: console Fleet, School, Modules; then the app (Flutter) from ParentHome, ParentFees, ParentResults, TeacherHome, RollCall, EmptyHome, AppKit and EmptyApp1–4; then rules tests, audit-ui, e2e, docs, canvas, push.

## Checklist

Status: ☐ to do · ◐ built, not checked · ☑ built and checked.

### Foundations
- ☐ contracts: `hue.ts` (engine, spectrum, contrast test over all 360 hues), brand payload sends seed and palettes
- ☐ console: brand colour is the only colour control; old theme editor and console theme removed
- ☐ web-ui: tokens, fonts, base, shell (menu, dock, search), controls, blocks, dialogs, menus, toasts, fields, login
- ☐ web-ui: `<Icon>`, `code/icons.ts`, every hand-drawn icon replaced
- ☐ web-ui: empty kit
- ☐ app: palette, type, motion tokens, widgets (page frame, header, sheet, tab bar, cards, rows, chips, buttons, fields, sheets, toast)
- ☐ app: `AppIcons`, every icon
- ☐ app: `EmptyKit`
- ☐ rules tests (web and app) fail on any old token, font, icon or empty art

(Pages, screens and their empty states are listed below as the inventory finds them.)
