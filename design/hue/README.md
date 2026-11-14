# Gradeon Hue

> **Web (admin and console), 14 November 2026:** Hue's layouts and empty states in the Nest look. The board stylesheets here (`base.css`, `base2.css`, `empty.css`) carry it: Manrope and Bricolage, pill controls, 24px cards, uppercase labels, and no tinted panels in the scenes. Web surfaces are the fixed neutrals of `WEB_NEUTRALS` (`packages/contracts/src/hue.ts`); the app keeps the seeded surfaces.

The approved design system for the Flutter app, the school admin and the console (approved by the owner on 10 November 2026; built on `design/system-v2`, November 2026). It replaced Chalk & Glass in the app and Nest in admin and console. The empty states for every page ([EMPTY-STATES.md](EMPTY-STATES.md)) were built with it. `build.mjs` writes the product files straight from the boards: `packages/web-ui/src/hue-parts.css`, `icons.ts`, `empty/scenes.ts` and `lib/core/widgets/app_icons.dart`. Canvas: https://claude.ai/artifact/4RCDhHVgQxkny97QSknsd8 (private to the owner).

## Files

| Path | What it is |
| --- | --- |
| `palette.mjs` | The colour engine: `seedTokens(hue, dark)` turns one hue into every school token, `fixedTokens(dark)` gives status colours, `SEEDS` the four demo seeds, `tokensCss()` the CSS. |
| `base.css`, `base2.css` | Every component class the boards use (the reference for building `packages/web-ui` and `lib/core/widgets`). |
| `src/<Board>.html` | Board sources: markup plus an optional trailing `<script props='{…}'>` class body. `[[i:name]]` / `[[if:]]` / `[[ib:]]` insert a Phosphor icon (regular, fill, bold); `[[p:name]]` / `[[pf:]]` / `[[pb:]]` insert only its path data. |
| `build.mjs` | Builds `canvas/` (the canvas project: boards, `hue.css`, `canvas.json`) and `preview/`. Board list, sizes and dark copies are in `BOARDS`. |
| `canvas/` | The canvas as published. Publish this folder's files to update the canvas. |
| `preview/preview.html` | A small local renderer for the boards (`preview.html?f=Today&w=1440`). |
| `qa.mjs` | Renders boards in Playwright, records heights, flags overflow, clipping and wrapping, writes contact sheets to `shots/` (ignored). |
| `contrast.mjs` | Checks every text/background pair against WCAG AA for each seed, light and dark. |
| `empty.css` | The empty-state kit: words block, scene parts, the six motion beats, the one-column fallback and reduced motion. |
| `anim.mjs` | Captures a board at three moments of the 10 s loop (`node anim.mjs Board x y w h`) to check motion. |
| `icon-map.mjs` | **One meaning, one icon**: every page, module and tab (`PAGES`), the small symbols and statuses (`GLYPHS`) and the four sizes. Boards say `[[i:@fees]]`; nothing else picks a page icon. |
| `code/icons.ts`, `code/app_icons.dart` | Generated from `icon-map.mjs` by `build.mjs`: the web set (`IC`, `GLYPH`, `ICON_SIZE`) and the app set (`AppIcons`). The Hue build copies them in; never edit them. |
| `icons.mjs`, `chk.mjs` | Icon paths read from the vendored `packages/phosphor_flutter` fonts; `node chk.mjs name…` checks names exist. |

```bash
cd design/hue
node build.mjs            # boards -> canvas/ and preview/, icon sets -> code/
node qa.mjs               # every board (layout and icon rules); or: node qa.mjs @tag Today Fees
node contrast.mjs         # "every pair passes"
```

## The five rules

1. **One seed colour per school.** The console stores one hue (0–360) per school. Every surface, text colour, state and the dark theme are worked out from it. Nobody picks a hex value.
2. **Deep frames, bright points.** The school's deep colour frames the product (web: the menu and the frame around a rounded light sheet; app: the header and the tab bar). The bright colour marks "you are here" and the one number that matters.
3. **Colour always means something.** Brand is for actions. Twelve fixed spectrum hues name things (subjects, houses, payment methods) and are the same in every school. Green, amber, red and blue mean status only. The heat ramp means "how much".
4. **One family, two voices.** Mona Sans (variable): the display voice is `font-stretch:112%`, weight 700, tight tracking, for numbers, names and titles; the text voice is normal width for reading. Noto Sans Devanagari for Hindi and Marathi at the same sizes with taller lines.
5. **Soft shapes, flat colour.** White panels on a tinted ground. No gradients, no glows. Shadow only under things that float (menus, dialogs, toasts).

## Tokens

Per seed (light and dark): `bg s1 s2 s3 line line2 t1 t2 t3 deep deep2 deep3 hero hero2 on-deep on-deep2 bright on-bright brand brand-h on-brand brand-soft brand-soft2 brand-ink brand-line heat1…heat5 heat-lo-t heat-hi-t shadow`.
Fixed, per status `ok warn bad info`: solid `--ok`, text on it `--on-ok`, soft background `--ok-s`, ink on soft `--ok-i`, on the deep colour `--ok-d`.
Spectrum classes `.sp-<name>` set `--c` (solid), `--cs` (soft), `--ci` (ink), named by colour so any school can give them any meaning: rose, red, orange, amber, lime, green, teal, cyan, blue, indigo, violet, pink. Ink on soft is 7.6:1 or more in light and dark.
A block in another school's colour uses `class="s-<seed> scope"` (add `dark` for dark).

Contrast: all four demo seeds pass AA in light and dark (tightest margin 1.15). A custom hue must pass the same check before the console lets it be published.

## Icons

One family: **Phosphor** (`packages/phosphor_flutter`, 256 grid), already shipped in the app; the web draws the same paths. No second icon set, no icons drawn by hand in a page.

1. **One meaning, one icon.** A page, module or tab has exactly one icon, set in `icon-map.mjs` and used the same in the menu, the dock, the app tabs, the Modules grid, Home tiles and the empty-state labels. Two meanings never share an icon (Timetable is a table, so the clock can mean late and waiting). Money is a wallet, never a currency sign.
2. **Weights.** Regular by default. Fill only for "selected" (the active tab, menu item or dock item). Bold for anything 16 px or smaller and for small symbols (check, x, plus, minus, carets, arrow, more, statuses). Never thin, light or duotone.
3. **Four sizes:** 14 (bold: chips, tags, checkboxes, breadcrumbs), 16 (bold: status pills, the module grid), 20 (web default, buttons, fields, menus, the menu), 24 (app tabs, quick tiles). At 16 px Phosphor regular draws a 1 px line and bold a 1.5 px line, which is why small icons are bold.
4. **Colour** comes from the text around it (`currentColor`): ink, `t2`, `t3` (3:1 or more on panels), the status ink on its soft colour, or the spectrum ink. Never a colour of its own.
5. **Words.** An icon next to words is hidden from screen readers (`aria-hidden`). An icon-only control has a spoken name (`aria-label`, or a translated `Semantics` label in the app) and, on the web, a tooltip with the same words (`data-tip`, never `title=`). A state shown by an icon alone (the Modules grid) gets a name per cell. Every action that matters keeps its words; status never relies on colour or icon alone.
6. **Targets:** web icon buttons 40 px, app 44 px or more; the icon size never sets the target.
7. **Adding an icon:** add the meaning to `icon-map.mjs` (check the name with `node chk.mjs`), run `node build.mjs`, then copy `code/` into the product. A meaning nobody uses is removed from the map.

`qa.mjs` fails a board on any icon off the four sizes, a non-bold icon at 16 px or less, an icon not hidden from screen readers, a control with no name, or a web icon button with no tooltip. The phone status bar on the boards is drawn OS chrome and is exempt.

### Building it into the product

Web (`packages/web-ui`, admin, console):
- Replace `packages/web-ui/src/icons.ts` (today a hand-drawn 24-grid stroke set of 30) with `code/icons.ts`, and draw icons through one small piece in `web-ui` (`<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d={…}/></svg>` at an `ICON_SIZE`). Switch the nav `icon:` keys in `apps/admin/src/app/nav.ts`, `apps/console/src/app/nav.ts` and the docks to the meaning names; this also fixes today's clashes (Classes and calendar drew the Cells icon, Moving in the Migrations icon, Compliance the Support icon, Requests and Test inbox the same icon).
- Replace every icon drawn straight into a page (about 100 `<svg>` in the admin and console views: dashboard, students, timetable, fleet, school, settings, wizard and others) with that piece; charts and illustrations stay as they are. Add a `rules.test.ts` check that fails on a 24-grid icon `<svg>` in a page.

App (`lib/`):
- Copy `code/app_icons.dart` to `lib/core/widgets/app_icons.dart`. Tabs, the drawer, Home tiles and empty states use `AppIcons.<meaning>` (and `…On` when selected: the active tab moves from Bold to **Fill**). Small symbols can keep `PhosphorIconsBold` directly; icon sizes come from `AppIcons.sizeXs/S/M/L`. Add a `design_rules_test.dart` check that a page or tab icon comes from `AppIcons`.

## Scales

- Radius: 7 tags, 10 small controls, 12 controls, 20 panels, 24 sheet, hero and app cards, 28 app sheet.
- Web type: figure 64–96, page title 30/36, panel title 17/22, body 15/22, small 13/18, label 600 13/16, caption 12/16.
- App type: headline 34/38, card title 19/24, body 16/22, row title 600 16/22, tab label 600 12/14.
- Heights: web controls 40 (small 32, large 52); app buttons 56, fields 52, every target 44 or more.
- Web frame: 248 px menu, a sheet with 24 px radius and 24/32 padding, 20 px grid gap.
- App frame: status bar 44, deep header, sheet rising over it by 28, tab bar 84 with the active tab as a bright block.

## Boards

System: Main, Colour, Type, Components (+ dark), AppKit, Icons (drawn from `icon-map.mjs`). Admin: Today (+ dark), Students, Fees, Attendance, Timetable, SignIn, Sidebar. Console: Fleet (+ dark), School, Modules. App: ParentHome (+ dark), ParentFees, ParentResults, TeacherHome (+ dark), RollCall, EmptyHome. Empty states: EmptyFrame (the kit), EmptyAdmin1–5 (+ dark), EmptyConsole1–4 (+ dark), EmptyApp1–4 (+ dark); see [EMPTY-STATES.md](EMPTY-STATES.md).

Examples must be neutral and international (owner's rule). The empty-state boards follow it; the first system, admin, console and app boards above still show the old Indian demo school (names, ₹, lakh, Hindi and Marathi) and should be made neutral before or while building.
