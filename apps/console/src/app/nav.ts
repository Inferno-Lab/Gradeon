import { IC, type NavGroup } from '@gradeon/web-ui';
import type { ConsolePermission } from '@gradeon/contracts';
import { url } from './base';

export interface Tab { key: string; label: string; needs?: ConsolePermission }
interface Def { id: string; label: string; icon: keyof typeof IC; keys: string; to: string; needs?: ConsolePermission; tabs?: Tab[] }

/** The console menu, grouped by what is being worked on (docs/product-map.md §4.1). A page's tabs each have an address. */
export const DEFS: { name: string; items: Def[] }[] = [
  { name: 'Schools', items: [
    { id: 'fleet', label: 'Fleet', icon: 'fleet', keys: 'G F', to: '/' },
    { id: 'onb', label: 'Onboarding', icon: 'onb', keys: 'G O', to: '/onboarding' },
    { id: 'req', label: 'Requests', icon: 'inbox', keys: 'G Q', to: '/requests' },
    { id: 'sup', label: 'Support sessions', icon: 'sup', keys: 'G S', to: '/support', needs: 'support.access' },
  ] },
  { name: 'Product', items: [
    { id: 'mod', label: 'Plans and modules', icon: 'mod', keys: 'G M', to: '/modules', tabs: [{ key: 'schools', label: 'Schools' }, { key: 'plans', label: 'Plans' }, { key: 'planned', label: 'Planned' }] },
    { id: 'bp', label: 'Blueprints', icon: 'bp', keys: 'G P', to: '/blueprints' },
    { id: 'flag', label: 'Flags', icon: 'flag', keys: 'G L', to: '/flags' },
  ] },
  { name: 'Platform', items: [
    { id: 'rel', label: 'Releases', icon: 'rel', keys: 'G R', to: '/releases', tabs: [{ key: 'releases', label: 'Releases' }, { key: 'rules', label: 'Rollout rules' }, { key: 'database', label: 'Database changes' }] },
    { id: 'app', label: 'Mobile builds', icon: 'app', keys: 'G B', to: '/builds' },
    { id: 'int', label: 'Integrations', icon: 'plug', keys: 'G I', to: '/integrations', needs: 'integrations.read', tabs: [
      { key: 'connections', label: 'Connections' }, { key: 'routing', label: 'Routing' }, { key: 'templates', label: 'Approved templates' },
      { key: 'activity', label: 'Activity' }, { key: 'webhooks', label: 'Webhooks' }, { key: 'inbox', label: 'Test inbox', needs: 'sandbox.read' },
    ] },
    { id: 'cells', label: 'Cells', icon: 'cells', keys: 'G C', to: '/cells' },
    { id: 'health', label: 'Health', icon: 'health', keys: 'G H', to: '/health' },
  ] },
  { name: 'Business', items: [
    { id: 'bill', label: 'Billing', icon: 'bill', keys: 'G $', to: '/billing', needs: 'billing.read' },
    { id: 'comp', label: 'Compliance', icon: 'book', keys: 'G Y', to: '/compliance', tabs: [{ key: 'agreements', label: 'Agreements' }, { key: 'breaches', label: 'Breaches' }, { key: 'processors', label: 'Sub-processors' }, { key: 'requests', label: 'Data requests' }] },
  ] },
  { name: 'Console', items: [
    { id: 'appr', label: 'Approvals', icon: 'appr', keys: 'G A', to: '/approvals' },
    { id: 'team', label: 'Team', icon: 'team', keys: 'G T', to: '/team' },
    { id: 'set', label: 'Console settings', icon: 'set', keys: 'G ,', to: '/settings', tabs: [{ key: 'colours', label: 'Colours' }, { key: 'rules', label: 'Rules for risky changes' }] },
  ] },
];

/** A school's page: its tabs, each with its own address (`/schools/<id>/roles`), docs/product-map.md §4.2. */
export const SCHOOL_TABS: Tab[] = [
  { key: 'overview', label: 'Overview' }, { key: 'plan', label: 'Plan and modules' }, { key: 'configuration', label: 'Configuration', needs: 'schools.configure' },
  { key: 'roles', label: 'Roles', needs: 'schools.configure' }, { key: 'data', label: 'Data' }, { key: 'messaging', label: 'Messaging', needs: 'integrations.read' },
  { key: 'technical', label: 'Technical' }, { key: 'audit', label: 'Audit', needs: 'audit.read' },
];

/** Every page and its tabs, for the router: a page with tabs also answers at `<page>/<tab>`. */
export const PAGES = DEFS.flatMap((g) => g.items);

/** The tabs of a page this person may open. */
export function tabsOf(to: string, can: (p: string) => boolean): Tab[] {
  return (PAGES.find((p) => p.to === to)?.tabs ?? []).filter((t) => !t.needs || can(t.needs));
}

/** The console menu, limited to what the person's roles may open. Counts come from the data the shell already has. */
export function consoleNav(can: (p: string) => boolean, counts?: { onboarding?: number; approvals?: number; requests?: number }): NavGroup[] {
  return DEFS.map((g) => ({
    name: g.name,
    items: g.items.filter((i) => !i.needs || can(i.needs)).map((i) => ({
      id: i.id, label: i.label, icon: IC[i.icon], keys: i.keys, href: url(i.to),
      count: i.id === 'onb' && counts?.onboarding ? String(counts.onboarding) : i.id === 'appr' && counts?.approvals ? String(counts.approvals) : i.id === 'req' && counts?.requests ? String(counts.requests) : undefined,
    })),
  })).filter((g) => g.items.length);
}

/** The menu item a path belongs to: its own, the closest one above it, and Fleet for a school's page. */
export function activeNav(path: string): string {
  if (path.startsWith('/schools')) return 'fleet';
  return PAGES.find((i) => i.to === path)?.id ?? PAGES.filter((i) => i.to !== '/' && path.startsWith(`${i.to}/`)).sort((a, b) => b.to.length - a.to.length)[0]?.id ?? '';
}

export function shortcutTargets(groups: NavGroup[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const g of groups) for (const i of g.items) m.set(i.keys.replace('G ', '').toLowerCase(), i.href);
  return m;
}
