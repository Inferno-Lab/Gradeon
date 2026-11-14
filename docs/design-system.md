> This is the **mobile app's** side of **Gradeon Hue**, the one design system of the app, the school admin and the
> console. The approved boards and the full spec are in [`design/hue/`](../design/hue/README.md); admin and console are
> in [`docs/DESIGN.md`](DESIGN.md).

# Gradeon Hue in the app

Source of truth in code: `lib/core/theme/` (`app_colors.dart`, `app_typography.dart`, `tokens.dart`,
`app_palette_defaults.dart`) and `lib/core/widgets/`. Live catalogue: Settings → About → long-press the version row.
`test/design_rules_test.dart` fails on anything below that drifts.

## Idea

Hybrid, like the admin and the console (owner's call, 14 Nov 2026): Gradeon Hue's layouts, parts, icons and empty
scenes, worn in the old **Chalk & Glass** look. Every screen sits on the chalk ground (no coloured header band); the
dock floats as a paper pill with an ink tab that slides; type is Anek on its width axis. The neutrals never take the
school's tint (`APP_NEUTRALS` in `packages/contracts/src/hue.ts`): chalk, paper and ink from the old app, an ink
**deep** for the dock and headline cards, and marigold **bright** for the one thing that matters now (the period on
now, the chosen tab, the Pay button). Actions are the school's **brand**; state is ok, warn, bad and info; subjects take
one of twelve **spectrum** colours. The boards each screen is built from are in `design/hue/src` (ParentHome,
TeacherHome, ParentFees, ParentResults, RollCall, AppKit, EmptyApp1–4).

## Colour

- `context.app` (an `AppColors` for the theme: light, dark, AMOLED): `chalk` (page), `paper`/`paper2`/`paper3`
  (surfaces), `ink`/`ink2`/`ink3`, `line`/`line2`, `deep`/`deep2`/`deep3`/`hero`, `onDeep`/`onDeep2`, `bright`/`onBright`,
  `brand`/`onBrand`, `mariSoft`/`mariText` (brand soft fill and its ink), `okSoft`/`okText`, `lateSoft`/`lateText`
  (warn), `badSoft`/`badText`, `infoSoft`/`infoText`.
- `c.subjectFor(id)` and `c.spectrumFor('blue')`: a subject's or spectrum colour (fill, on, soft, ink) in the theme.
  The static `AppColors.subject(id)` / `spectrum()` / `houses` follow the app's theme too (`AppColors.activeDark`, set by
  `AppTheme.resolve`).
- `c.onDeepSide`: the theme as it reads on the deep colour, for anything drawn on an ink card.
- Defaults are generated from the hue engine (`appTokens` in `packages/contracts/src/hue.ts`) by `node tools/gen-hue.mjs`;
  at run time the school's palette from `/v1/brand` (the same `appTokens`) replaces them (`AppPalette`). Text on any fill: `AppPalette.on(fill)`.

## Type

`context.type.<role>` or `AppText.<role>(color:)`, set in Anek Latin (Anek Devanagari for Hindi and Marathi) through
`hueText()`. Display roles (`dx`, `dl`, `h1`–`h3`) use the wide cut. A screen sets only colour, tabular figures and line
height; it never changes size or weight.

## Shapes and space

Radii (`AppRadius`): hair 2, xs 7, sm 10, md 12, field 16, panel 20, card 24, sheet 28, pill 999. Spacing:
0, 1, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 56. Buttons are 56 tall (`Btn`, kinds primary, ink, bright, quiet,
danger, plain), fields 52.

## The frame

- `PageFrame` draws the deep header and the sheet. Its first child is the header (title, the figure that answers the
  page) unless it is a loading, empty or error state. Floating top buttons are `GlassIconButton` (a deep2 disc).
- Bottom bars: a floating `Glass` pill, or the board's deep action bar flush with the edge (`edgeBar: true`, as
  `TeacherActionBar`).
- The tab bar is deep with the chosen tab on bright (`dock.dart`).
- `CellArt` (the SignIn board's cells) is the brand art for sign-in, splash and the first-run welcome.

## Empty states

`ViewStateView(emptyArt:, emptyTitle:, emptyBody:, emptyHint:, emptyActions:)` with an `EmptyArt` scene from
`empty_kit.dart`: the app boards' animated scenes (a 10 s loop built from `Beat`). Copy says what will appear and what
the user can do. Check with `--dart-define=EMPTY_DATA=true`.

## Icons

Phosphor, through `AppIcons` (`lib/core/widgets/app_icons.dart`, generated from `design/hue/icon-map.mjs` with the web
icons): regular for content, fill for the chosen tab, bold for small UI marks.

## Motion

`AppMotion` (`press`, `t1`–`t4`, `spring`, `stagger`, `loop`, `intro`) with `kEase` (arriving), `kEaseIn` (leaving),
`kSpring` (under the finger). Taps go through `Pressable`.
