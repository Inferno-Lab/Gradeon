/// <reference types="node" />
// The design system's rules, checked over the admin's and console's source so they cannot drift back. Each failure names the
// part to use instead.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? (['node_modules', 'dist'].includes(e.name) ? [] : walk(p)) : [p];
});
const rel = (p: string) => path.relative(root, p).replace(/\\/g, '/');
const apps = ['apps/admin/src', 'apps/console/src'].flatMap((d) => walk(path.join(root, d)));
const ui = walk(path.join(root, 'packages/web-ui/src'));
const tsx = apps.filter((f) => f.endsWith('.tsx'));
const allTsx = [...tsx, ...ui.filter((f) => f.endsWith('.tsx'))];
// hue.css and hue-parts.css are generated from the approved boards (tools/gen-hue.mjs, design/hue/build.mjs).
const css = [...apps, ...ui].filter((f) => f.endsWith('.css') && !/hue(-parts)?\.css$/.test(f));
const cache = new Map<string, string>();
const read = (f: string) => cache.get(f) ?? cache.set(f, readFileSync(f, 'utf8')).get(f)!;

/** Every line of these files that matches, as "file:line  text". */
function hits(files: string[], re: RegExp, keep: (line: string, file: string) => boolean = () => true): string[] {
  return files.flatMap((f) => read(f).split(/\r?\n/).flatMap((line, i) => (re.test(line) && keep(line, f) ? [`${rel(f)}:${i + 1}  ${line.trim().slice(0, 120)}`] : [])));
}

// Printed receipts and handouts are black on white paper whatever the theme; the logo keeps its own colours.
const fixed = (f: string) => /InvoicesPage|MovingInPage|TangentIcon|ColourPicker|\.test\./.test(f);
// The token blocks in nest.css define the colours; the picker paints the colour space itself; masks only use alpha.
const definesColour = (line: string, f: string) => (/nest\.css$/.test(f) && /^(\.nest(\.dark)?\{)?--/.test(line.trim())) || /\bcpk/.test(line) || /mask/.test(line);
const comment = (line: string) => /^\s*(\/\/|\/\*|\*)/.test(line);

// The scales. Art numerals (the 404 page, illustrations) are drawings, not type; font-size 0 hides text.
// Tangent Hue's scales, as the approved boards use them (design/hue/base.css).
const SIZES = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28, 30, 34, 38, 40, 44, 52, 56, 64, 72];
const WEIGHTS = [400, 500, 600, 650, 700, 800];
const RADII = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 999];
const SPACE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 52, 56];
const art = (line: string) => /\.es-nf \.n\b|\.il\b/.test(line);
/** Whether any pixel number in the captured values is off the scale (percentages and `auto` are layout, not scale values). */
const offScale = (line: string, re: RegExp, ok: (n: number) => boolean) => [...line.matchAll(re)].some((m) => [...m[1]!.matchAll(/(-?\d+(?:\.\d+)?)(px|%|em|rem|vh|vw|ch|s|ms)?/g)].some((x) => (x[2] ?? 'px') === 'px' && !ok(Math.abs(Number(x[1])))));

describe('the design system', { timeout: 30_000 }, () => {
  it('has no browser widgets in the apps', () => {
    expect(hits(tsx, /\btype=["'{]?\s*["']?(date|time|month|color|number|checkbox|file|datetime-local|week|range)\b/, (l) => !/querySelector/.test(l)), 'use DateField, TimeField, MonthField, NumberField, ColourField, Checkbox or FilePick from @tangent/web-ui').toEqual([]);
    expect(hits(tsx, /<select\b/), 'use Select from @tangent/web-ui').toEqual([]);
  });

  it('shows tips with our tooltip, not the browser’s', () => {
    expect(hits(tsx, /<[a-z][a-z0-9]*\b(?:[^<>]|=>)*?\stitle=/), 'use data-tip="…" (the shared tooltip)').toEqual([]);
  });

  it('has one shell per app, mounted by its signed-in layout', () => {
    expect(hits(tsx, /<Shell\b|useChrome\(/, (_, f) => !/app[\\/](Layout|useChrome)\.tsx$/.test(f)), 'render pages in PageScope; read the shell with useShellChrome()').toEqual([]);
  });

  it('builds overlays from the shared parts', () => {
    expect(hits(tsx, /className=\{?["'`](scrim|mod|toast|popm|sxp|pvr)\b/), 'use Dialog, SearchDialog, ToastSlot, Menu or Pop from @tangent/web-ui').toEqual([]);
    expect(hits(allTsx.filter((f) => !/Toast\.tsx$/.test(f)), /setToast\(/), 'time toasts with useToast() from @tangent/web-ui').toEqual([]);
  });

  it('times every motion with the tokens', () => {
    // The duration is the first time in each part of a transition or animation (a second one is a delay). Endless loops
    // (spinners, shimmer, floats) and the reduced-motion rules keep theirs.
    const durations = (line: string) => !/1ms!important/.test(line) && [...line.matchAll(/\b(?:transition|animation)(?:-duration)?\s*:\s*['"`]?([^;}'"`]*)/g)]
      .some((m) => !/infinite/.test(m[1]!) && m[1]!.split(',').some((part) => !(part.match(/var\(--t\d\)|\d*\.?\d+m?s\b/)?.[0] ?? 'var').startsWith('var')));
    expect(hits(css, /./, durations), 'use var(--t1), var(--t2) or var(--t3)').toEqual([]);
    expect(hits(tsx, /\b(transition|animation)\s*:/, durations), 'use var(--t1), var(--t2) or var(--t3)').toEqual([]);
    expect(hits([...css, ...tsx], /var\(--sp\)/), 'the overshoot curve is gone: use var(--e)').toEqual([]);
  });

  it('defines each keyframe once', () => {
    const seen = new Map<string, string>();
    const twice: string[] = [];
    for (const f of css) for (const m of read(f).matchAll(/@keyframes\s+([\w-]+)/g)) {
      if (seen.has(m[1]!)) twice.push(`${m[1]} in ${rel(f)} and ${seen.get(m[1]!)}`); else seen.set(m[1]!, rel(f));
    }
    expect(twice, 'keep one definition (shared ones live in packages/web-ui)').toEqual([]);
  });

  it('takes every colour from a token', () => {
    const raw = /#[0-9a-fA-F]{3,8}\b(?![\w-])|\b(rgba?|hsla?)\(|(?<![\w-])(white|black)(?![\w-])/;
    expect(hits([...css, ...allTsx].filter((f) => !fixed(f)), raw, (line, f) => !comment(line) && !definesColour(line, f) && !/white-space/.test(line)),
      'use a colour token (var(--ink), var(--on-deep), color-mix(in srgb,var(--on-deep) 14%,transparent)…); the console can change every token').toEqual([]);
    expect(hits([...css, ...allTsx], /var\(--(b|bS|r|rS|rF|sbg)\)|\.btn\.v\b|\bbtn v\b/), 'retired: use --v, --vS, --c, --cS, --cF, --frame; the blue button is gone (btn pri)').toEqual([]);
  });

  const files = [...css, ...allTsx].filter((f) => !fixed(f));

  it('sets type from the scale', () => {
    const size = /(?:\bfont\s*:\s*['"`]?[1-9]00\s+|font-size\s*:\s*|fontSize\s*:\s*['"`]?)(\d+(?:\.\d+)?)/g;
    expect(hits(files, /font/i, (l) => !art(l) && [...l.matchAll(size)].some((m) => Number(m[1]) !== 0 && !SIZES.includes(Number(m[1])))), `font sizes are ${SIZES.join(', ')} px`).toEqual([]);
    const weight = /(?:\bfont\s*:\s*['"`]?|font-weight\s*:\s*|fontWeight\s*:\s*['"`]?)([1-9]00)\b/g;
    expect(hits(files, /font/i, (l) => [...l.matchAll(weight)].some((m) => !WEIGHTS.includes(Number(m[1])))), `font weights are ${WEIGHTS.join(', ')}`).toEqual([]);
  });

  it('rounds corners from the scale', () => {
    const radius = /(?:border(?:-(?:top|bottom)-(?:left|right))?-radius\s*:\s*|border(?:Top|Bottom)?(?:Left|Right)?Radius\s*:\s*)['"`]?([^;}'"`,\n]+)/g;
    expect(hits(files, /adius/, (l) => offScale(l, radius, (n) => RADII.includes(n))), `radii are ${RADII.join(', ')} px or 50%`).toEqual([]);
  });

  it('spaces things from the scale', () => {
    const space = /(?:(?<![\w-])(?:padding|margin)(?:-(?:top|right|bottom|left|inline|block))?\s*:\s*|(?<![\w-])(?:row-|column-)?gap\s*:\s*|\b(?:padding|margin)(?:Top|Right|Bottom|Left|Inline|Block)?\s*:\s*|\b(?:row|column)?[gG]ap\s*:\s*)['"`]?([^;}'"`,\n]+)/g;
    expect(hits(files, /padding|margin|gap/i, (l) => offScale(l, space, (n) => n > 56 || SPACE.includes(n))), `spacing up to 56 px is ${SPACE.join(', ')}`).toEqual([]);
  });
});
