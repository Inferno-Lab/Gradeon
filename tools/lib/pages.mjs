// Every admin address, from the module definitions (config-engine), so the browser checks follow the menu instead of a list kept here.
import { ADMIN_PAGES } from '../../packages/config-engine/dist/index.js';

/** Each page, then each of its tabs after the first (the first is the page's own address). */
export const adminPaths = ADMIN_PAGES.flatMap((p) => {
  const base = p.path === '/' ? '' : p.path;
  return [base, ...(p.tabs ?? []).slice(1).map((t) => `${base}/${t.key}`)];
});
