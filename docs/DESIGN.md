# Tangent "Nest" design concept

> **Admin and console: Hue layouts in the Nest look** (14 November 2026). Tangent Hue gives the layouts, parts, icons and empty states; the look is Nest's, as described below: warm neutrals that never take a school's tint (`WEB_NEUTRALS` in `packages/contracts/src/hue.ts`), Manrope and Bricolage Grotesque, pill buttons and fields, 24px cards with a hairline, the ink main action, the spot illustrations (`packages/web-ui/src/illustrations`) and Nest's motion. The school's colour stays in the accents. Tangent Hue (built on `design/system-v2`) The approved boards and the spec are in [`design/hue/`](../design/hue/README.md): one hue per school (`packages/contracts/src/hue.ts`, injected by `useHue`), the deep frame, the bright "now", Mona Sans, Phosphor icons through `<Icon>`, and board scenes through `<EmptyState>`. Where this file and `design/hue` disagree, `design/hue` wins; the layout rules and the parts list below still hold.

The design language of the **school admin** and the **console**. (The mobile app: `docs/design-system.md`.) This file is written so it can be turned into a skill: it states the idea, the tokens, every component, the motion, the states, the page recipes and the checks, with the reasons. The source of truth for exact values is `packages/web-ui/src/nest.css`; the approved boards are in `design/hue/` (see `design/README.md`).

## 1. The idea

A calm, bright, rounded workspace for people who run a school all day: office staff, principals, and the small Tangent team behind them. It should feel like a well-made modern SaaS product, not a school and not a toy.

- **One floating frame.** The whole product sits in a large rounded "frame" lifted off a quiet neutral page. Inside: a quiet menu on the left and the page on the right. It feels like an object, not a full-bleed web page.
- **Neutral and ink as the voice, one blue for data, colour only for state.** Ink marks what is current and primary (the menu's current page, the primary button); blue carries data, links and selection; amber is a warning, green is done, red says "look at this". Nothing is coloured just to decorate.
- **Big friendly numbers, small honest labels.** Headings and figures use a characterful display face; everything else is a clean sans. Numbers are the heroes (attendance, money, counts) and roll when they change.
- **Rounded everything, but disciplined.** Pills for controls, large radii for containers, never sharp corners, never mixed radii in one group.
- **Motion that explains, quickly.** Things rise in, grow from their button, vibrate when wrong, draw their lines once. Everyday controls answer in 120–200 ms with no bounce; nothing moves without a reason; reduced motion turns it all into instant states.
- **Honest.** No invented features, no fake numbers dressed as data (decorative sample cards are allowed only on the sign-in panel), no cute mascots. Empty and error states are first-class pages with an illustration, one true sentence and the next step.
- **What it is not:** it is not "Chalk & Glass" (no glass blur, no chalkboard), not playful (no mascots, pencil-shaped bars, jars, dot rows, confetti characters), not dense enterprise grey.

Why: the owner wanted admin and console to look like one consistent, premium product (references picked by the owner: modern SaaS dashboards, rounded cards, bold numerals) and explicitly rejected themed metaphors. Childish elements from the first canvas draft were replaced in the build (`design/README.md`).

## 2. Tokens

All tokens are CSS variables on `.nest` (light) and `.nest.dark` (dark). **Never hard-code colours in components; use the variables** (`rules.test.ts` fails on any hex, `rgb()` or named colour outside the token blocks; printed receipts and the logo are the named exceptions). The theme follows the device (`prefers-color-scheme`) unless the person chose one from the account menu (`localStorage tangent.theme`); the root gets the `dark` class, and every colour swaps in the same frame (`theme-swap` turns transitions off for one frame).

**Every colour follows the school's hue from the console** (`brand.color`; `hueTokens(h, mode)` in `packages/contracts/src/hue.ts`, generated defaults in `packages/web-ui/src/hue.css` by `node tools/gen-hue.mjs`). The older catalogue described here was `WEB_TOKENS` (label, group, light and dark default for each variable below). A school's admin colours are the `theme.colors` setting (console → school → Configuration → Colours); the console's own are under Team → Console colours (`console_settings` key `theme`). Only changed colours are stored; `useThemeColors` writes them as one `<style>` over every `.nest` (sign-in pages included). A changed base carries its derived colours (soft fill, text, chart line, text on it) unless those are changed too; derived text is checked against its own soft fill. The editor is a full picker (saturation square, hue and opacity, hex, `rgb()` or `hsl()`, the eyedropper) with live previews and a warning for any pair below 4.5:1. `nest.css` defaults must equal the catalogue (a test checks).

### Colour (light / dark)

Neutral surfaces and ink, one blue accent for data, links, focus and selection, and colour only for state. Every pair below is checked by `node tools/check-contrast.mjs` (text 4.5:1, field borders 3:1).

| Role | Variable | Light | Dark | Use |
| --- | --- | --- | --- | --- |
| Page background | `--bd` | `#E9E9E6` | `#0A0A0B` | Behind the frame |
| Frame and menu | `--frame` | `#F3F3F1` | `#111113` | The big rounded surface and the side menu |
| Card | `--card` | `#FFFFFF` | `#19191C` | Cards, tiles, inputs, dialogs |
| Sunk | `--sunk` | `#F6F6F4` | `#1E1E22` | Inset areas, tracks, hover fill, chips, avatars |
| Lines | `--line` / `--line2` | `#E5E5E1` / `#D6D6D1` | `#2A2A2E` / `#34343A` | Hairlines only |
| Field border | `--field` | `#8A8A84` | `#6B6B72` | Inputs, selects, checkboxes, the search pill (3:1) |
| Ink | `--ink` / `--ink2` / `--ink3` | `#1A1A1C` / `#4D4D53` / `#6A6A70` | `#F2F2F3` / `#B8B8BE` / `#8E8E96` | Text: primary / secondary / tertiary (≥ 4.8 on every surface) |
| Primary button, current page | `--pri` / `--priT`; hover `--priH` (pri 86% over card) | ink / white | inverted | Black pill (white in dark); the menu's current page |
| **Accent (blue)** | `--v` (`--vS` soft, `--vD` text, `--v2` chart bars, `--vL` wash) | `#2F5BD3` | `#7C9CF0` | Data, links, selection, the "today" column. Never a button. |
| Text on a solid blue | `--onV` | `#FFFFFF` | `#111113` | White on dark-mode blue fails (2.67:1), so it has its own token |
| **Amber** | `--a` (`--aS`, `--aD`) | `#E0A21B` | `#C99419` | A warning fill only; amber text is `--aD`, text on amber is `#1A1A1C` |
| **Green** | `--g` (`--gS`, `--gD`) | `#1E7A45` | `#6CC08E` | Done, healthy, paid; text on a solid green is `--card` |
| **Danger** | `--c` (`--cS` fill, `--cD` text, `--cF` delete button, `--onCF` text on it) | `#B42318` | `#F0857A` (`--cF` `#B42318`) | Errors, overdue, danger, absent. `--r`, `--rS`, `--rF` and `--b`, `--bS`, `--sbg` are retired (the guard fails on them). |
| Present | `--present` | `#B9B9B3` | `#5A5A61` | "Present" marks and segments (the ordinary case stays quiet) |
| Ink tile | `--ci`, text `--onCi` | `#1A1A1C` | `#26262A` | Inverted cards, toasts, floating bars, the sign-in panel; see-through white on it is `color-mix(in srgb,var(--onCi) N%,transparent)` |
| Switch knob | `--knob` | `#FFFFFF` | `#FFFFFF` | Every on/off switch |
| Subjects | `--subj-<id>` | the app's subject colours | same | The timetable; one palette with the app (`app.subject.*`) |
| Overlay | `--scrim` | `#1111136B` | `#0000009E` | Behind dialogs and panels |

Colour rules:

- Tiles are cards with a hairline (`t-v`, `t-a`, `t-l`, `t-p`, `t-g`); `t-i` is the one ink tile. Colour is kept for data and state, never for decoration.
- Text on a solid blue is `--onV`; on the delete red `--onCF`; on the ink tile `--onCi`; amber is a fill (`--aS`) with `--aD` text.
- Contrast: body text ≥ 4.5:1, field borders ≥ 3:1. Any brand colour is allowed: text on it is white or ink, whichever reads (`readableOn`, `markStyle`).
- Status is never colour alone: pill text says Healthy/Degraded/Down; charts have labels and tooltips.
- Avatars are neutral (`tintFor` gives everyone `--sunk` / `--ink2`), so they follow the theme.
- No gradients on bars, charts or the school mark: flat colours.

### Type

**Ten sizes, three weights** (the guard fails on any other): 11, 12, 13, 14, 15, 17, 22, 28, 34, 38 px; 500, 600, 700. Art numerals (the 404 page, illustrations) are drawings, not type.

| Role | Face · weight · size | Use |
| --- | --- | --- |
| figure | Bricolage 700 · 38 | Tile numbers, amounts |
| page | Bricolage 700 · 34 | Page titles |
| big number | Bricolage 700 · 28 | Numbers inside cards |
| section | Bricolage 700 · 22 | Card and section titles |
| title | Manrope 700 · 17 | Row titles, dialog titles |
| field | Manrope 600 · 15 | Text inside inputs |
| body | Manrope 500 · 14 (strong 700) | Text and tables |
| small | Manrope 500 · 13 (strong 700) | Meta, help, menu items |
| caption | Manrope 600 · 12 | Chips, captions |
| label | Manrope 700 · 11 uppercase +.08em | Group labels, table headers |

- Numbers use `font-variant-numeric: tabular-nums` (class `num`). Devanagari: Noto Sans Devanagari.
- Sentence case everywhere. Plain words ("Waiting for approval", "Not marked"), never jargon in front of staff.

### Shape, depth, spacing

- Radii (the only values): 2 (hairline marks), 6 (bars, checkbox, code), 10 (menu rows, small squares), 14 (inputs, menus, tooltips), 18 (inner panels, row cards, stat tiles), 24 (cards, dialogs, panels, toasts), 28 (the frame), 999 (pills, buttons, chips) or 50%. A shape inside another takes the outer radius minus the gap.
- Shadows: `--sh1` hairline (cards), `--sh2` hover lift, `--sh3` floating (frame, dialogs, toast), all neutral (no coloured or glowing shadows). In dark, shadows become pure black or none.
- Spacing scale (px, the only values up to 56): 0, 1, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 56. Grid gap 16; card padding 24; label to field 6; field to field 16; touch targets ≥ 40.
- Control heights: 22 (counters, trend pills), 26 (chips, status), 34 (`sm` buttons, small fields), 42 (buttons, icon buttons, fields, selects, search: a field and its button line up), 50 (the sign-in form only).
- Layout: 12-column grid (`grid`, spans `s3 s4 s5 s6 s7 s8 s12`), collapsing to one column under 1100 px. Page width fills the frame.
- Focus: 2.5 px ink ring (black, white in dark), 3 px offset, following each control's own shape. Never remove it.

## 3. Structure of a page

```
page background (flat)
└─ frame (rounded 28, sh3)                       ← .fr
   ├─ menu (272 px, collapsible to 88 px)         ← .sb  (sticky, scrolls itself on short windows)
   │    workspace/school block · group labels · items (icon, label, shortcut hint or count)
   │    context card (term countdown / "requests to approve") · account block (menu: theme, sign out)
   └─ main (.mn)
        title row (h1 34px display, one-line sub, spacer, search pill, actions)
        content grid of tiles and cards
   overlays: palette (Ctrl K), dialogs, drawer, toast, bulk bar, support frame
```

- **Menu items** are links (work with middle-click and keyboard), the current page is an ink pill (white in dark), hover is the sunk fill, show `G D`-style keyboard hints (press `G` then a letter) or a count badge. Groups: admin Teach / People / Money / Reach / School; console Operate / Ship / Care.
- **Phone (≤ 900 px):** the menu is replaced by a floating **dock** (pill, ink background, four icons; the current one opens to show its name) and a **More** sheet that lists the full menu and sign out. The dashboard becomes a dedicated phone home (two big tiles, a summary, "Needs you" with Approve/Undo, a bars card). All other pages stack to one column; tables scroll sideways inside their card or stack their controls; card title rows wrap; segmented controls scroll.
- **Page header:** `h1` + one short sentence of context ("1,498 enrolled across 42 sections"). Primary action on the right, black pill. Search pill shows `Ctrl K`.
- **Command palette:** Ctrl/Cmd K or `/`; groups (People, Go to, Actions); arrows, Enter, Esc; shows shortcuts.

## 4. Components (use the real ones from `packages/web-ui`)

| Component | Spec |
| --- | --- |
| **Button** `.btn` | Pill, 42 px (34 `sm`), 700 14 px, 1.5 px border. States: hover changes colour in `--t1` (secondary: sunk fill and `--ink3` border; `pri`: `--priH`; `dng`: deeper soft red; `wht`, `dngf`: 8% darker), press scales .97 in `--t1`, focus ring, disabled .4 with no press, busy shows a spinner in place of the icon. Variants: `pri` (ink; **one per card, dialog or toolbar**; list-row actions are secondary), `wht` (on the ink tile only), `ghost`, `dng` (soft red), `dngf` (the delete confirm). There is no blue button. `MenuButton` opens a `Menu` under it (chevron turns while open). |
| **Chip** `.chip` | 26 px pill, 12 px/700; tones plain, `v c a g k`. Counts and states ("56", "Not yet", "Draft"). |
| **Status pill** `.st` | 26 px pill with a dot: `g` Healthy/Paid/Live, `a` Degraded/Waiting, `v` Updating/Setting up, `c` Down/Overdue, `n` neutral. Always includes a word. |
| **Card** `.card` | White, 1 px line, radius 24, padding 24, `sh1`. Header row `.ch`: title 17–22 px display + chip + optional small button; wraps on phones. |
| **Tile** `.tile t-*` | Coloured feature card, radius 28, a label chip, a big display number, a one-line explanation, optional corner arrow button. 3–4 per row at the top of a page. |
| **Fields** `.inp`/`Field` | 42 px (50 on sign-in, 34 `sm`), radius 14, 1.5 px border; resting border `--field`; focus = blue border plus a crisp 1 px line, no glow; label above (13.5 px/700); hint below in `--ink3`; error: red border, tint, message with a warning icon, and the field **vibrates** (see motion). `Field` takes text-like types only. **No browser widgets:** `DateField` (type "12 Nov" or pick from a Monday-first calendar; `compact` for a table row), `TimeField` (type "8:47" or pick a quarter hour), `MonthField`, `NumberField` (minus and plus) and `NumberInput` (a cell), `ColourField` (any colour: `ColourPicker`'s square, hue and opacity sliders, hex/`rgb()`/`hsl()` input, eyedropper), `Checkbox` (`.cb`, with or without words), `FilePick` (our button opens the file chooser). All work from the keyboard. |
| **Switch** `.sw` | 38×22 flat pill, 16 px knob; grey off, blue on, no spring and no shadow. Always paired with a label. |
| **Dropdown** `Select` / `SelectField` | Replaces the browser's `<select>`. A 50 px field (or `compact` 40 px pill for page headers) with a round chevron chip; the list is drawn in a portal on the page root with fixed coordinates, so no card, table or dialog can clip it; it flips upward near the bottom, scrolls inside, gets a search box above 10 options, and works with the keyboard (arrows, Home/End, Enter, Esc, type-ahead). Never use a bare `<select>`. |
| **Tooltip** `data-tip` | One shared tooltip (`Tooltips`, mounted by `Shell`); never the browser's `title`. Put `data-tip="Title (newline) more"` on any chart column, bar or segment; every `.us` usage row gets one for free; the collapsed menu uses it for names. A tip that repeats a cell's own words (a name cut off by its column) shows only when the text is actually cut off, after a short wait. |
| **Segmented** `Segmented` | Pill track with a white knob that glides under the chosen tab in `--t2`, measured from the real tab (never a guessed width); tabs, view switches, ranges. |
| **Menu and popovers** `Menu` / `Pop` | Everything that opens from a button (menus, the time list, the calendar, the colour picker) is one `Pop`: drawn on the page root so nothing clips it, under its button (over it when there is no room, beside it for the collapsed menu, right-aligned for a button at the right), grows from the button, arrows move inside, Escape, Tab or a click outside close it and focus returns. The dashboard's range and New menus are ordinary `MenuButton`s. |
| **Table** `.grd` | CSS-grid rows (`--cols`), 58–64 px, hairline separators, hover tint, header row 11.5 px uppercase. Rows are links where they open something. Wrap in `.scroll-x` with a min-width on phones. |
| **Usage bar** `.bar` | **14 px tall**, full radius, `--sunk` track, flat blue fill; `warn` variant flat amber; label left, value right. **Bars are never thin** (owner rule). Segmented tick bars (`tk3`, 20 ticks, 24 px tall) for SMS credits; release progress is 60 ticks. |
| **Charts** | Columns: wide, rounded tops, today highlighted in blue, other days in `--v2`, previous period as a ghost behind, hover bubble. Lines: 3 px blue, drawn once, flat `--vS` area below, dashed previous line, follow-pointer tooltip. Roll bars: segmented present/late/absent, filled. Fee bars: filled, labelled with percent. No pencils, jars or dot rows. Goal line dashed with a chip. Empty chart: columns hidden, one sentence ("Attendance appears here after the first roll call is marked."). |
| **Ticket** `.tkt` | The plan card: flat dark fill, notched sides (CSS mask), dashed perforation, plan name display 23 px, two icon lines, a white pill button, status chip and counts on the right. |
| **Dialog** `Dialog` | Centered card over a blurred scrim, tag chip above the title, focus trapped, Esc and scrim close, focus returns where it was. Dark variant for dangerous actions (erase). Typed-confirmation input for irreversible actions. Search is the same layer (`SearchDialog`), 18% from the top. |
| **Panel** `Panel` | A record opened beside its list (student detail): slides in from the right; Esc and scrim close it. |
| **Toast** `ToastSlot` + `useToast()` | Dark pill, bottom centre (above the dock on a phone), green check or red cross circle + one sentence, optionally one button (Undo). `useToast` times every toast: 4 s, 6 s with an action, held while the pointer is over it; an error stays until its close button. No page keeps its own toast timer (the guard fails on `setToast(`). |
| **Save bar** | Floating dark pill "You have unsaved changes · Discard · Save" when a form is dirty. |
| **Support frame** | Red inset frame around the window plus a red pill "Tangent support in <school> · read-only · mm:ss left · End session". |
| **Avatar** `.av` | 34–76 px circle, initials, tint pair; stacks overlap by 8 px with a ring. |
| **Illustration** | 12 flat object scenes (register, noticeboard, receipt, notebooks, search-paper, checklist, plug, padlock, torn-page, envelope, map-pin, calendar): thick near-black outline, flat blue/amber/red/green fills from the theme, soft ellipse shadow, strokes draw in once. **No faces, characters, animals, mascots.** Colours follow the theme. |
| **Empty card** `EmptyCard` | Header (title, chip with the zero, a ghost placeholder pill), centred illustration, 22 px display heading, 14.5 px body, 1–2 actions. Variants: empty, error (red chip, "Try again"), not found (404 tile with the big "4 0 4" and "This page skipped class."). |
| **Skeleton** `.skc` | Shimmering rounded block with the final layout's size, so nothing jumps when data arrives. |

## 5. Motion

One timing scale, on `.nest` in `nest.css`: **`--t1` 120 ms** (press, toggle, a checkbox), **`--t2` 200 ms** (popups, menus, the tab knob, tooltips), **`--t3` 300 ms** (dialogs, panels, sheets, toasts, content arriving). Entering uses `--e` = `cubic-bezier(.22,1,.36,1)`; leaving uses the next step down with `--ei` = `cubic-bezier(.4,0,1,1)`. There is no overshoot curve: everyday controls never bounce. Endless loops (spinner, skeleton shimmer, the sign-in floats) keep their own lengths. The guard test (`packages/web-ui/src/rules.test.ts`) fails on any other literal duration.

| Pattern | Behaviour |
| --- | --- |
| **Rise** | Content arriving enters 6 px lower with a fade in `--t3`; the stagger is capped at 100 ms, so a form is usable within about 400 ms of the page opening. The menu, search and dock are mounted once per app, so changing page only brings in the new page. |
| **Grow from the button** | Popups (menus, lists, calendar, the colour picker) scale from .96 at the edge they open from, in `--t2`. Dialogs and search do the same from the centre (or top) in `--t3`. |
| **Leave** | Every overlay fades out instead of vanishing: `Presence` keeps it for 200 ms marked `data-leaving` (not clickable, not focusable) and gives focus back at once. |
| **Roll digits** | Each digit scrolls on a vertical strip to its new value (`Roll`, 1.1 em per digit); separators stay still. |
| **Vibrate (errors)** | `nShkA`/`nShkB`: ±9 px horizontal shake over .6 s. Two keyframe names alternate (`shk1`/`shk2` on a wrapper, `useShake().hit()`), so the same error can vibrate again and again. Used for wrong passwords, wrong codes, invalid fields. Shake the card or the field, never the frame. |
| **Draw** | Chart lines and illustration strokes draw once (dash offset). |
| **Sign-in** | A panel with floating sample cards, rolling digits, a toast that appears, and a padlock illustration that rocks when a credential is wrong; the form shakes. |
| **Hover, focus, theme** | Hover is a colour change in `--t1`; the focus ring appears at once; switching light and dark swaps every colour in one frame. Tooltips wait 400 ms, then move between neighbours at once. |
| **Reduced motion** | `prefers-reduced-motion` (and the `rm` class) makes animations instant and turns transitions off (`transition: none`). Never rely on motion to convey meaning. |

Animate transform and opacity only; never animate layout properties in lists.

### Scrolling and fitting (rules added 2026-10-18)

- Every scroll area has a visible, themed bar (thin, neutral grey, a pill) and a plain background (`polish.css`; add `.lscroll` to a list that can grow long, `.scl` to any other box).
- A list longer than about 12 rows scrolls inside its card (`max-height: min(66dvh, 680px)`); the page never grows with the data.
- The menu fits a short window: tighter rows under 900 px high, no context card under 780 px, and the account block stays pinned at the bottom.
- Text that names a person or thing wraps to two lines before it is cut; a one-line ellipsis is for previews only, and the full text is in the `title`.
- A scroll area keeps a plain background and chains to the page at its ends: painted-in edge shadows and `overscroll-behavior: contain` made scrolling feel stuck and slow.
- No glow anywhere: no soft coloured shadows, halo gradients, pulsing rings or blurred focus rings. Focus and hover change a border or a fill; the only ring is a crisp 1 px line.
- Empty space is fixed by arranging content, never by stretching cards: put short and tall things in one full-width column, give a short block siblings of equal weight (a row of tiles, a 2- or 3-column grid), make lists scroll inside a capped card, and add real information (a summary, a guide) before adding height. `tools/scan-gaps.mjs` measures holes, unequal side-by-side cards and blank insides.
- Columns side by side end on one line. Mark the row `data-even` and the lists in it `data-even-scroll`: `EvenRows` (mounted by `Shell`) trims the taller column's list so it scrolls inside, or shows more of a capped list, and never stretches a card. `data-even="fill"` also lets the last row's lists grow to the bottom of the window, and `data-fill` does that for a single list. `tools/scan-gaps.mjs` reports any row whose columns end more than 16 px apart.
- A segmented control's knob is measured from the real tab by `Segmented`; never build a `.seg` by hand or size a knob from guessed text widths. `tools/scan-fit.mjs` checks knobs, wrapped pill text, text outside its box and missing values shown as `undefined`.
- A table that scrolls inside its card keeps its column titles (`.grd.th`) pinned at the top, and on a phone its first column stays put while it scrolls sideways.
- Reduced motion turns transitions off (`transition: none`). A bare 1 ms `transition-duration` turns `transition: all` on for every element and makes scrolling and layout work stutter.
- The menu collapses to a logo with the expand button under it; names show in the tooltip and the account menu opens beside the menu on the page root.
- On a phone a list keeps only its main columns (class `hs` hides the rest) or stacks its row; a board scrolls sideways with snap.

## 6. States (every page must have all of them)

1. **Loading:** skeletons shaped like the final page (`aria-busy`). Spinners only inside buttons.
2. **Empty (brand-new school):** `EmptyCard` with what will appear here and what to do; never a blank table or a lone "No data".
3. **Error:** `EmptyCard error` with the server's honest sentence and "Try again".
4. **Partial/forbidden:** if a permission is missing, show the page read-only with a plain sentence ("You can look at attendance but not change it."), disabled controls with a title, not a hidden page.
5. **Conflict/locked:** a stale settings save explains who changed it; locked settings are disabled with a note.
6. **Success:** toast + the page already updated (optimistic where safe, with Undo for approvals).
7. **Waking server (free hosting):** skeletons stay until the first answer.

Copy rules: say what happened and what to do, in the person's words ("That didn't load", "Nothing has been posted yet"); no codes or stack traces; numbers formatted for India (`1,49,800`, `₹22L`, IST dates "Sat 17 Oct").

## 7. Page recipes

- **Dashboard:** welcome tile (avatar, greeting, quick buttons) · three KPI tiles (present today with rolling digits and delta chip; fees collected; ink: approvals waiting with avatar stack) · wide chart tile (tabs Attendance/Fees/Homework, range menu) · "Needs you" list with Approve/Review/Remind/Publish and Undo · class roll bars · fees by type · "Today at school" timeline · dashed "Add a widget".
- **List page (Students):** header with Import/Export/Add · view tabs (All / My class / Fees overdue / New) with counts · filter pills + dashed Add filter · four-figure summary strip · table card with sortable headers, select-all, row kebab, bulk bar, pagination footer · drawer for detail.
- **Timetable:** class menu, Week/Day/List segmented, publish button, week stepper, subject legend, grid with colour per subject, clash cell outlined red with a fix panel on the right, load ring and unplaced list.
- **Settings:** left section list (General, Modules…), grouped rows (label+help left, control right), the brand colour with live preview and contrast chip (read-only; colours are set in the console), toggles, plan ticket + SMS credits card, dirty save bar.
- **Roll call / simple list pages:** table card + a summary tile + a save card; big three-way toggle per row (Present green, Late amber, Absent red).
- **Console fleet:** release tile (progress ticks, wave dots, pause/roll back), schools tile, health tile (stacked bar and counts), requests chart, cells list with ring gauges, schools table, incident card, "waiting schools" tile.
- **Console school:** breadcrumb, logo + name + status chip, tabs, vertical step timeline with a dark log, ticket, usage card, store checklist.
- **Wizard:** left step list (done steps get a green check) and one card per step; one decision per screen; review screen lists exactly what Launch will do; rehearse before launch.
- **Dangerous action:** dark dialog, red tag, explain consequences, typed slug, vibrate on mismatch, solid red button.

## 8. Rules checklist (a design review should check each)

1. Uses only variables from `nest.css` (a colour the console cannot change is a bug); works in light and dark and with a school’s own colours.
2. Type, radii and spacing from the scales (§2); no new one-off sizes. `rules.test.ts` fails on anything else.
3. One primary action per card, dialog or toolbar; row actions are secondary; destructive actions are red and confirmed.
4. All bars ≥ 14 px (usage) and charts have chunky marks.
5. Every interactive element has a visible focus ring, a label (icon-only buttons have `aria-label`) and a ≥ 40 px target.
6. Errors: red, near the field, say what to do, vibrate.
7. Empty/loading/error states exist and use the shared components.
8. No horizontal page scroll at 360 px; tables scroll inside their card; nothing clipped (`tools/audit-ui.mjs` proves it).
9. Reduced motion respected.
10. No mascots, faces, pencils, jars, dot rows, glass blur, emoji icons; icons are the 24 px 1.7 px-stroke set in `icons.ts`.
11. Copy is plain, sentence case, India-formatted.
12. New class names do not collide with `nest.css` (search first) and page CSS is scoped `.pg-<page>`.

## 9. Anti-patterns (do not)

- Glass/blur panels, chalk textures, or anything from the mobile app's language.
- Thin bars, hairline progress lines used as data, pencil/jar/dot metaphors.
- Cartoon characters or animals for empty states.
- Colour-only status.
- Modals for things a menu or panel can do; a hand-built popup, list or picker where a shared part (`Menu`, `Pop`, `Select`, the fields) fits.
- Hiding a page because of permissions (show it read-only).
- Fake data presented as real (placeholder numbers belong only on the sign-in panel).
- Different looks for admin vs console.

## 10. Turning this into a skill

A skill built from this file should: (1) load `nest.css` tokens and the component list as the vocabulary, (2) require the states in section 6 and the checklist in section 8 for every new page, (3) tell the model to reuse `packages/web-ui` components and `blocks.css` before writing CSS, (4) point at `design/hue/` for the approved boards, and (5) require running `node tools/audit-ui.mjs` and `node tools/e2e-flows.mjs` before declaring a page done.
