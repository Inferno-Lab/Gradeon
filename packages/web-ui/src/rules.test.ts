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
const css = [...apps, ...ui].filter((f) => f.endsWith('.css'));
const cache = new Map<string, string>();
const read = (f: string) => cache.get(f) ?? cache.set(f, readFileSync(f, 'utf8')).get(f)!;

/** Every line of these files that matches, as "file:line  text". */
function hits(files: string[], re: RegExp, keep: (line: string, file: string) => boolean = () => true): string[] {
  return files.flatMap((f) => read(f).split(/\r?\n/).flatMap((line, i) => (re.test(line) && keep(line, f) ? [`${rel(f)}:${i + 1}  ${line.trim().slice(0, 120)}`] : [])));
}

describe('the design system', { timeout: 30_000 }, () => {
  it('has no browser widgets in the apps', () => {
    expect(hits(tsx, /\btype=["'{]?\s*["']?(date|time|month|color|number|checkbox|file|datetime-local|week|range)\b/), 'use DateField, TimeField, MonthField, NumberField, ColourField, Checkbox or FilePick from @gradeon/web-ui').toEqual([]);
    expect(hits(tsx, /<select\b/), 'use Select from @gradeon/web-ui').toEqual([]);
  });

  it('shows tips with our tooltip, not the browser’s', () => {
    expect(hits(tsx, /<[a-z][a-z0-9]*\b(?:[^<>]|=>)*?\stitle=/), 'use data-tip="…" (the shared tooltip)').toEqual([]);
  });

  it('has one shell per app, mounted by its signed-in layout', () => {
    expect(hits(tsx, /<Shell\b|useChrome\(/, (_, f) => !/app[\\/](Layout|useChrome)\.tsx$/.test(f)), 'render pages in PageScope; read the shell with useShellChrome()').toEqual([]);
  });

  it('builds overlays from the shared parts', () => {
    expect(hits(tsx, /className=\{?["'`](scrim|mod|toast|popm|sxp|pvr)\b/), 'use Dialog, SearchDialog, ToastSlot, Menu or Pop from @gradeon/web-ui').toEqual([]);
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
});
