// Every admin and console address, from where the apps define them, so the browser checks follow the menus instead of lists kept here.
import { readFileSync } from 'node:fs';
import { ADMIN_PAGES } from '../../packages/config-engine/dist/index.js';

/** Each page, then each of its tabs after the first (the first is the page's own address). */
export const adminPaths = ADMIN_PAGES.flatMap((p) => {
  const base = p.path === '/' ? '' : p.path;
  return [base, ...(p.tabs ?? []).slice(1).map((t) => `${base}/${t.key}`)];
});

// The console's menu (apps/console/src/app/nav.ts) is TypeScript the tools cannot import: its pages and tabs are read from the source.
const nav = readFileSync(new URL('../../apps/console/src/app/nav.ts', import.meta.url), 'utf8');
const block = (name) => { const at = nav.indexOf(`export const ${name}`); return nav.slice(at, nav.indexOf('\n];', at) + 3); };
const defs = block('DEFS');
const items = [...defs.matchAll(/\{ id: '[^']+'.*?to: '([^']+)'(.*?)(?=\{ id: '|\] \},\n\];|$)/gs)];
const tabsOf = (rest) => [...(rest.match(/tabs: \[(.*)\]/s)?.[1] ?? '').matchAll(/key: '([^']+)'/g)].map((m) => m[1]);
const school = block('SCHOOL_TABS');

/** Console pages and their tabs, then the schools list, the wizard, a school's tabs and a page that does not exist. */
export const consolePaths = (schoolId) => [
  ...items.flatMap(([, to, rest]) => [to, ...tabsOf(rest).slice(1).map((k) => `${to}/${k}`)]),
  '/schools', '/onboarding/new',
  ...[...school.matchAll(/key: '([^']+)'/g)].map((m, i) => (i === 0 ? `/schools/${schoolId}` : `/schools/${schoolId}/${m[1]}`)),
  '/nope',
];
