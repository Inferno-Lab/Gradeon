import { pageForPath } from '@gradeon/config-engine';
import type { MenuGroup, ShellData } from '@gradeon/contracts';
import { IC, type NavGroup } from '@gradeon/web-ui';

/**
 * The menu comes from the server (`ShellData.menu`), built from the module definitions in config-engine: the modules the school
 * has, the person's permissions, and Moving in only until go-live. Nothing here lists pages.
 */
export function adminNav(menu: MenuGroup[], base: string, badges?: ShellData['badges']): NavGroup[] {
  const count = (id: string) => {
    const n = id === 'att' ? badges?.attendance : id === 'adm' ? badges?.admissions : id === 'msg' ? badges?.messages : 0;
    return n ? String(n) : undefined;
  };
  return menu.map((g) => ({
    name: g.group,
    items: g.pages.map((p) => ({ id: p.id, label: p.label, icon: IC[p.icon as keyof typeof IC] ?? IC.dash, keys: p.keys, href: `${base}${p.href === '/' ? '' : p.href}` || '/', count: count(p.id) })),
  }));
}

/** The module (or feature) a path needs, or null for pages every school has. */
export function moduleForPath(path: string): string | null {
  const p = pageForPath(path);
  if (!p || p.module === 'school' || p.module === 'people') return p?.feature ?? null;
  return p.feature ?? p.module;
}

/** The menu item a path belongs to: its own, or the closest one above it (`/students/x` is Students). */
export function activeNav(path: string): string {
  return pageForPath(path)?.id ?? '';
}

/** `G` then a letter, like the shortcuts on the menu. */
export function shortcutTargets(groups: NavGroup[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const g of groups) for (const i of g.items) m.set(i.keys.replace('G ', '').toLowerCase(), i.href);
  return m;
}
