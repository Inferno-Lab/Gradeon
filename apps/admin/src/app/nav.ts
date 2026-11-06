import { IC, type NavGroup } from '@gradeon/web-ui';

interface Def {
  id: string;
  label: string;
  icon: keyof typeof IC;
  keys: string;
  /** Where it goes. Pages that do not exist yet go to a "not yet" screen under /p. */
  to: string;
  /** The module that must be on for it to show. `core` is always on. */
  module: string;
}

const DEFS: { name: string; items: Def[] }[] = [
  { name: 'Teach', items: [
    { id: 'dash', label: 'Dashboard', icon: 'dash', keys: 'G D', to: '/', module: 'core' },
    { id: 'att', label: 'Attendance', icon: 'att', keys: 'G A', to: '/attendance', module: 'attendance' },
    { id: 'tt', label: 'Timetable', icon: 'tt', keys: 'G T', to: '/timetable', module: 'timetable' },
    { id: 'hw', label: 'Homework', icon: 'hw', keys: 'G H', to: '/homework', module: 'homework' },
    { id: 'ex', label: 'Exams', icon: 'ex', keys: 'G X', to: '/exams', module: 'exams' },
  ] },
  { name: 'People', items: [
    { id: 'stu', label: 'Students', icon: 'stu', keys: 'G S', to: '/students', module: 'people' },
    { id: 'staff', label: 'Staff', icon: 'staff', keys: 'G F', to: '/staff', module: 'people' },
    { id: 'adm', label: 'Admissions', icon: 'adm', keys: 'G M', to: '/admissions', module: 'people.admissions' },
  ] },
  { name: 'Money', items: [
    { id: 'fee', label: 'Fees', icon: 'fee', keys: 'G E', to: '/fees', module: 'fees' },
    { id: 'inv', label: 'Invoices', icon: 'inv', keys: 'G I', to: '/invoices', module: 'fees' },
    { id: 'rep', label: 'Reports', icon: 'rep', keys: 'G R', to: '/reports', module: 'core' },
  ] },
  { name: 'Reach', items: [
    { id: 'notice', label: 'Notices', icon: 'notice', keys: 'G N', to: '/notices', module: 'notices' },
    { id: 'msg', label: 'Messages', icon: 'msg', keys: 'G G', to: '/messages', module: 'chat' },
    { id: 'evt', label: 'Events', icon: 'evt', keys: 'G V', to: '/events', module: 'events' },
  ] },
  { name: 'School', items: [
    { id: 'setup', label: 'Classes and calendar', icon: 'cells', keys: 'G Y', to: '/setup', module: 'core' },
    { id: 'move', label: 'Moving in', icon: 'mig', keys: 'G U', to: '/moving-in', module: 'core' },
    { id: 'set', label: 'School setup', icon: 'set', keys: 'G ,', to: '/settings', module: 'core' },
  ] },
];

export const PAGE_TITLES: Record<string, string> = Object.fromEntries(DEFS.flatMap((g) => g.items.map((i) => [i.to.replace('/p/', ''), i.label])));

/** The menu for a school: only the modules it has on, with counts where the data has them. */
export function adminNav(modules: string[], base: string, badges?: { attendance: number; admissions: number; messages?: number }): NavGroup[] {
  const on = new Set(['core', ...modules]);
  return DEFS.map((g) => ({
    name: g.name,
    items: g.items
      .filter((i) => on.has(i.module))
      .map((i) => ({
        id: i.id, label: i.label, icon: IC[i.icon], keys: i.keys, href: `${base}${i.to === '/' ? '' : i.to}` || '/',
        count: i.id === 'att' && badges?.attendance ? String(badges.attendance) : i.id === 'adm' && badges?.admissions ? String(badges.admissions) : i.id === 'msg' && badges?.messages ? String(badges.messages) : undefined,
      })),
  })).filter((g) => g.items.length);
}

/** The module or feature a page needs, or null for pages every school has. */
export function moduleForPath(path: string): string | null {
  const item = DEFS.flatMap((g) => g.items).find((i) => i.to === path);
  return item && item.module !== 'core' ? item.module : null;
}

/** `G` then a letter, like the shortcuts on the menu. */
export function shortcutTargets(groups: NavGroup[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const g of groups) for (const i of g.items) m.set(i.keys.replace('G ', '').toLowerCase(), i.href);
  return m;
}
