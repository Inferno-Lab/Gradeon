# Gradeon Hue

The approved design system for the Flutter app, the school admin and the console (approved by the owner on 10 November 2026; not built yet). It replaces Chalk & Glass in the app and the current look of admin and console once it is implemented. The empty states for every page ([EMPTY-STATES.md](EMPTY-STATES.md)) were approved with it, and the plan is to build both together, once the work in progress on `main` has landed. Canvas: https://claude.ai/artifact/4RCDhHVgQxkny97QSknsd8 (private to the owner).

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
| `icons.mjs`, `chk.mjs` | Icon paths read from the vendored `packages/phosphor_flutter` fonts; `node chk.mjs name…` checks names exist. |

```bash
cd design/hue
node build.mjs            # boards -> canvas/ and preview/
node qa.mjs               # every board; or: node qa.mjs @tag Today Fees
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
Spectrum classes `.sp-<name>` set `--c` (solid), `--cs` (soft), `--ci` (ink): art, sanskrit, hindi, social, evs, sport, science, music, maths, computers, english, marathi.
A block in another school's colour uses `class="s-<seed> scope"` (add `dark` for dark).

Contrast: all four demo seeds pass AA in light and dark (tightest margin 1.15). A custom hue must pass the same check before the console lets it be published.

## Scales

- Radius: 7 tags, 10 small controls, 12 controls, 20 panels, 24 sheet, hero and app cards, 28 app sheet.
- Web type: figure 64–96, page title 30/36, panel title 17/22, body 15/22, small 13/18, label 600 13/16, caption 12/16.
- App type: headline 34/38, card title 19/24, body 16/22, row title 600 16/22, tab label 600 12/14.
- Heights: web controls 40 (small 32, large 52); app buttons 56, fields 52, every target 44 or more.
- Web frame: 248 px menu, a sheet with 24 px radius and 24/32 padding, 20 px grid gap.
- App frame: status bar 44, deep header, sheet rising over it by 28, tab bar 84 with the active tab as a bright block.

## Boards

System: Main, Colour, Type, Components (+ dark), AppKit. Admin: Today (+ dark), Students, Fees, Attendance, Timetable, SignIn, Sidebar. Console: Fleet (+ dark), School, Modules. App: ParentHome (+ dark), ParentFees, ParentResults, TeacherHome (+ dark), RollCall, EmptyHome. Empty states: EmptyFrame (the kit), EmptyAdmin1–5 (+ dark), EmptyConsole1–4 (+ dark), EmptyApp1–4 (+ dark); see [EMPTY-STATES.md](EMPTY-STATES.md).

Examples must be neutral and international (owner's rule). The empty-state boards follow it; the first system, admin, console and app boards above still show the old Indian demo school (names, ₹, lakh, Hindi and Marathi) and should be made neutral before or while building.
