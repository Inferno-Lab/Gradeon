> This file is the **mobile app's** Chalk & Glass system. The school admin and the console use a different language, "Nest": see `docs/DESIGN.md`. Both share one vocabulary: a palette the console edits, type roles, one spacing scale, and the same motion steps.

# Chalk & Glass design system

Source of truth in code: `lib/core/theme/` (`app_colors.dart`, `app_typography.dart`, `tokens.dart`) and `lib/core/widgets/`. Live catalogue: Settings → About → long-press the version row. `test/design_rules_test.dart` fails on anything outside the system, so the rules below are enforced, not advice.

## Idea

A chalkboard classroom in daylight (and at night). Paper cards on a chalk-coloured page, subject "pigments" as notebook covers, one warm accent (marigold) for the single most important action on a screen. **Glass is only for things that float over content** (and is a solid fill: nothing blurs).

1. **Marigold is the one thing to do.** At most one marigold button per screen (Pay, Submit, Mark attendance).
2. **Glass floats; paper holds.** Dock, top buttons, pills, sheets, toasts and bottom action bars are glass; content sits on paper cards.
3. **Every value comes from the system.** Colour from the palette, text from a role, spacing and radii from the scales, timing from `AppMotion`.
4. **Movement follows the finger.** Only what the finger moves (dock pill, segmented knob, switch, slider, press release) uses the spring; things that appear ease in and never bounce.

## Colour: the school's palette

Every colour comes from `AppPalette`. Its defaults (`app_palette_defaults.dart`) are generated from the console's catalogue (`APP_TOKENS` and `APP_SHARED` in `packages/contracts/src/theme.ts`, `node tools/gen-app-palette.mjs`); a school's palette arrives with `/v1/brand` (worked out on the server from its `theme.colors` setting, console → school → Configuration → Colours → App) and is kept for the next start, so the first frame is already in the school's colours.

- Per theme (Chalk, Blackboard, AMOLED; AMOLED falls back to Blackboard): `chalk` page, `paper`/`paper2` surfaces, `ink`/`ink2`/`ink3` text, `line`/`line2` rules, `scrim`, `shadow`, `mariText`, `mariSoft`, `okSoft`, `badSoft`, `badText`, `lateSoft`, `lateText` (`context.app`).
- The same in every theme: `AppColors.mari` and `mariInk`, `ok`, `bad`, `late`, `off`, `subject(id)` (fill and the text that reads on it), `houses`.
- Always-dark or always-light art (the camera, the photo viewer, a paper answer sheet, the map) uses a theme's colours by name (`AppColors.blackboard.chalk`, `AppColors.light.paper`) or a blend of palette colours, never a literal.
- Text on any fill is `AppPalette.on(fill)`: white or ink, whichever reads.

## Type: roles

`context.type.<role>` (coloured for the theme) or `AppText.<role>(color:)`. A screen may set only colour, tabular figures and a tighter line height; it never changes size or weight (pick another role). Only shared widgets call `anek()`, to size text to their own geometry.

| Role | Size · weight · width | Use |
| --- | --- | --- |
| `dx` | 68 · 780 · 125 | Hero numerals |
| `dl` | 48 · 760 · 122 | Large numerals on cards |
| `h1` | 34 · 730 · 118 | Page titles |
| `h2` | 24 · 690 · 112 | Section titles, big amounts |
| `num` | 22 · 740 · 112 · tabular | Counts and amounts in rows |
| `h3` | 19 · 650 · 108 | Card titles |
| `t` | 16.5 · 600 · 103 | Row and sheet titles |
| `label` | 16 · 650 · 108 | Button labels |
| `b` | 15.5 · 420 | Body |
| `ts` | 15 · 620 · 103 | Small titles (settings rows, list rows) |
| `chip` | 14 · 650 · 104 | Chips, strong small text |
| `s` | 14 · 450 | Secondary text |
| `cap` / `capB` | 13 · 520 / 650 | Captions; a value inside a caption |
| `stamp` | 12 · 760 · 118 · +.09em | Stamps (1 DAY, NOT MARKED) |
| `mono` | IBM Plex Mono 12 | Times and codes |
| `o` | 11 · 700 · 118 · +.1em | Overlines |
| `tiny` | 11 · 650 · 106 | Badges, dock and quick-action labels, axis ticks |

Sibling labels share one role; a label that does not fit ends in an ellipsis (or wraps), it never shrinks. Counts go through `'key'.trn(n)`, which uses the key's `_one` form for one ("1 file", never "1 files").

## Space, shape, size

- **Spacing** (padding, gaps, `SizedBox` gaps, `spacing:`), up to 56: 0, 1, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 56. The page gutter is 20.
- **Radii** (`AppRadius`): `hair` 2, `xs` 6, `sm` 10, `md` 14, `field` 18, `card` 24, `sheet` 34, `pill` 999. Glass pills use `pill`.
- **Sizes**: tap target ≥ 44; buttons 52 (small 40); top glass buttons 44; dock 64; tablet column ~720 from 840 wide (`AppBreakpoints.tablet`).
- **Elevation**: cards are flat with a hairline; floating glass has a soft shadow in `shadow`; sheets a deeper one.

## Motion (`AppMotion`, curves in `tokens.dart`)

| Token | Value | Use |
| --- | --- | --- |
| `press` | 90 ms | Finger down |
| `t1` | 120 ms | Colour changes, small fades |
| `t2` | 200 ms | Chips, stamps, crossfades, skeleton to content |
| `t3` | 300 ms | Screens, theme change, sheets and toasts leaving |
| `t4` | 420 ms | Sheets and toasts arriving, the Rise entrance |
| `spring` | 280 ms with `kSpring` | Dock pill, segmented knob, switch, slider, press release |
| `stagger` | 35 ms | Between the first five items arriving together |
| `celebrate` | 900 ms | A moment the person caused (the paid stamp) |
| `loopFast` / `loop` | 1000 / 1600 ms | Spinners; breathing loops (live dot, shimmer, scan line) |
| `introStep` / `intro` | 1800 / 2400 ms | The opening sequence |
| `toastHold` / `toastAction` | 3.2 / 5 s | How long a toast stays |

Curves: `kEase` arriving, `kEaseIn` leaving, `kSpring` under the finger only, `kLoop` for loops. Reduce motion (Settings or the system) replaces transforms with fades and stops the springs.

**Micro-interactions.** Every tap goes through `Pressable` (scale .97, cards .98, in `press`, spring back in `spring`; a semantics label); swipes and long presses keep their `GestureDetector`. Haptics (`core/utils/haptics.dart`): selection when something changes under the finger (dock, segmented control, switch, slider steps, child switcher, list choices); medium when something is submitted or confirmed (paid, scanned, graded, attendance saved). None on plain taps or scrolling. A sheet opens in `t4` and closes in `t3`; a toast arrives in `t4` with `kEase` and leaves in `t3`. Screens that reorder after an action hold their order until the next load.

## Building blocks (`core/widgets/ui.dart` barrel)

`labels` (Overline, Stamp, Dot, PulseDot, Chip2), `cover` (notebook Cover), `surfaces` (EduCard, Hr, DashedLine, Hatch, Grab, Gutter), `controls` (Pressable, Btn, Field), `avatar` (Avatar), `motion` (Rise). Pages: `PageFrame` (title row, scrolling body, bottom bar, status-bar scrim), `Dock`, `SheetBody`, `Toast`. States: `ViewStateView`, `EmptyState`, `EmptyArt`, `SkeletonList`, `ErrorState`.

## Glass

- For: dock, top icon buttons, pills and segmented controls, switches and sliders, sheets, toasts, bottom action bars. Filters sit under the page title (a segmented control), not in a bottom bar; the bottom belongs to the dock and the one action.
- Never for: page headers, cards, greetings, ribbons, or any block behind text.
- `Glass` is a solid floating surface: paper on the page, the ink with `onPigment: true` (on photos and subject colours), always with a soft shadow. The liquid-glass shaders in `shaders/` are kept for reference but are not loaded.

## Empty and loading states

Every collection screen defines an `EmptyArt` illustration, a title that states the fact ("No homework yet"), a body that says what will appear and when, an optional `emptyHint` chip, and `emptyActions` that lead somewhere useful. Loading uses skeletons at the final sizes, not a spinner on a blank page.

## Copy and accessibility

Short, concrete, friendly, sentence case; numbers carry units; counts through `.trn`. Text scale (Settings), 44 px minimum targets, Reduce motion, contrast checked in all three themes (the console warns when a school's colours fall below 4.5:1), icon-only buttons carry a `label`.
