# Design

The approved design of the app, the school admin and the console is **Tangent Hue**: its spec, its boards and the empty
state of every page and tab are in [`hue/`](hue/README.md) (sources in `hue/src`, built with `node design/hue/build.mjs`;
the canvas pages it writes to `hue/canvas` and `hue/preview` are generated and not kept in git). How a page looks in
words: [`docs/DESIGN.md`](../docs/DESIGN.md) for the admin and the console, [`docs/design-system.md`](../docs/design-system.md)
for the app.

## Rules the owner set for the design

- Admin and console use Tangent Hue's layouts and empty states in the **Nest** look (14 November 2026): warm neutral
  surfaces that never take the school's tint, pill controls, white cards with a hairline, ink main actions. The app uses
  Tangent Hue's layouts in its old **Chalk & Glass** look.
- Admin and console look like one consistent product (shared menu, tiles, chips, dialogs, motion).
- Errors vibrate (the `shk1`/`shk2` classes, `useShake`); the sign-in does it too.
- Every page and tab that can be empty has its own scene (`EmptyState`); a small list inside a page has an `EmptyNote`.
- Motion is smooth everywhere, never slow (120, 200 or 300 ms: `--t1/2/3`), never bouncy, and stops under reduced motion.
- No browser widgets or browser tooltips: dates, times, numbers, colours, ticks and files use the shared fields (enforced
  by `packages/web-ui/src/rules.test.ts`).

## Logo

`logo/` holds the working logo the owner picked on 2026-11-05 (not final yet, so do not derive the product palette from its
colours): a "fingerprint" mark, four whorl lines whose outer line closes into the letter's bar.
