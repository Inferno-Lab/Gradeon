# Design canvas

`design/canvas/` is the approved design: every board the owner signed off, saved as the files they were drawn in. It is the **source of truth for how the admin and the console must look**. If a page and a board disagree, the board wins, except for the deliberate changes listed below.

## Files

| Board | What it shows | Built as |
| --- | --- | --- |
| `Main.dc.html` | School admin dashboard | `apps/admin/src/pages/dashboard` |
| `AdminStudents.dc.html` | Students list, filters, student drawer | `apps/admin/src/pages/students` |
| `AdminTimetable.dc.html` | Week grid, clash fix, publish | `apps/admin/src/pages/timetable` |
| `AdminSettings.dc.html` | Settings: name, brand colour, toggles, plan | `apps/admin/src/pages/settings` |
| `AdminPhone.dc.html` | Phone home with the dock | `apps/admin/src/pages/phone` |
| `AdminLogin.dc.html`, `ConsoleLogin.dc.html` | Sign-in with the animated panel | `packages/web-ui/src/login` |
| `AdminDark.dc.html` | The dashboard in dark | same page, dark theme |
| `ConsoleFleet.dc.html`, `ConsoleFleetLight.dc.html` | Console fleet board, dark and light | `apps/console/src/pages/fleet` |
| `ConsoleSchool.dc.html` | One school in the console: setup steps, ticket, usage, stores | `apps/console/src/pages/school` |
| `Components.dc.html`, `Language.dc.html`, `Moments.dc.html`, `Empties.dc.html` | The design system: components, type and colour, motion, empty and error states | `packages/web-ui` and `apps/admin/src/design/DesignPage.tsx` (a living style guide built from the real components) |
| `Cast.dc.html`, `Nesti.dc.html` | The retired mascot ("Nesti") | **not built**; kept only as history |
| `nest.css` | The shared stylesheet of every board | copied verbatim to `packages/web-ui/src/nest.css` |
| `preview.html` | A small shim that renders a board in any browser | see below |

## Look at a board

The boards use a design tool's component format. `preview.html` renders them without the tool:

```bash
cd design/canvas && python -m http.server 8099
# then open http://127.0.0.1:8099/preview.html?f=ConsoleFleet&w=1440
#   f = board name without .dc.html     w = width in px
#   p = JSON props, e.g. p={"theme":"dark","reduceMotion":true}
```

`tools/shot.mjs` can screenshot that URL with `--anon`, which is how boards were compared with the built pages.

## How the boards became React

1. `tools/dc-to-tsx.mjs` converted each board into a React view (`*.view.tsx`), a scoped stylesheet (`*.css`, every selector prefixed `.pg-<page>`) and a copy of its script (`*.logic.txt`, kept next to the page as reference for what the board's own logic did). `tools/convert-all.sh` lists the boards it was run on. **It was a first import only.** The views were then edited by hand (small one-time Python scripts in `tools/edit-*.py` did the bulk edits) to take real data, work on phones and drop the retired elements. Never re-run the converter over an edited view.
2. Each page has a hook component (`DashboardPage.tsx`, `StudentsPage.tsx`...) that fetches data with TanStack Query and passes one values object `v` into the view. The view keeps the board's markup and class names.
3. Markup and class names are the board's. Colours and sizes come from `nest.css` variables, so a change to the design is a change to that file and the boards.

## Deliberate differences from the boards

The owner asked for the build to be identical to the canvas **except the childish elements**, which are replaced in the build (the boards were not changed):

| Board element | In the build |
| --- | --- |
| "Nesti" the bird mascot (Cast, Nesti, and "wave", "book", "party" poses in several boards) | Flat object illustrations drawn from school objects (register, noticeboard, receipt, notebooks, padlock, envelope, calendar, plug, map pin, checklist, torn page, search paper): `packages/web-ui/src/illustrations`. No faces, characters or animals. |
| Pencil-shaped chart columns | Rounded, chunky columns; roll bars are segmented filled bars |
| Dot rows | Segmented tick bars |
| Fee jars | Filled bars |

Other differences, each because a board element did not work in the real product:

- The console sign-in has a password field (the board had email only; the console needs a password).
- "Single sign-on" and "Passkey" on the sign-in are shown disabled with "soon" (they were dead buttons).
- The console menu's "On call · Hand over" card (invented, no feature behind it) became a "requests to approve" card. The "2 engineers on it" and "Join the call" parts of the incident card are gone for the same reason. The "Requests per minute" range switch is gone because only the last 24 hours are measured.
- The theme follows the device; the menu's account block has a "Switch to dark / light" and "Sign out". The boards have no theme control.
- Bars were made thicker after the owner said "bars are not thin": usage bars 14 px, chart columns wide.
- Pages the boards do not cover (console wizard, releases, approvals, billing, team, attendance, fees, notices...) are composed only from the approved pieces (`packages/web-ui/src/blocks.css`, `apps/console/src/console.css`, `apps/admin/src/app/pages.css`). They have **not been design-reviewed by the owner**.

## Rules the owner set for the design

- Admin and console use the **Nest** language (this folder), not Chalk & Glass. The mobile app keeps Chalk & Glass.
- Admin and console look like one consistent product (shared menu, tiles, chips, dialogs, motion).
- Errors vibrate (the `shk1`/`shk2` classes, `useShake`); the sign-in does it too.
- Every empty page has an illustration, an honest sentence and a next step (`EmptyCard`).
- Motion is smooth everywhere and stops under reduced motion.
- 2026-11: violet, amber and coral replaced by neutral, ink and one blue; contrast fixed (`tools/check-contrast.mjs`). The canvas copy of `nest.css` has the same tokens; the rest of it is not synced.

## Logo

`logo/` holds the working Gradeon logo the owner picked on 2026-11-05 (not final yet, so do not derive the product palette from its colours): a "fingerprint G", four whorl lines whose outer line closes into the G's bar (no two children are the same). Ink `#0B3B36`, accent `#16A08A` (`#5FE0C6` and mint `#EFF8F6` on dark). Use `gradeon-mark.svg` on light, `gradeon-mark-reversed.svg` on dark, `gradeon-favicon.svg` below 48 px (thicker lines), `gradeon-app-icon.svg` for app and store icons. The wordmark is Inter Tight 700, lower case on purpose (the symbol already plays the capital G), tracking −0.04em; in sentences, receipts and store listings the name is written "Gradeon"; `gradeon-lockup.png` and `gradeon-lockup-dark.png` show the mark and wordmark together. It is the app icon, browser icon, console mark and Gradeon's sign-in mark (affeb42); the admin and console colours are still the Nest violet.
