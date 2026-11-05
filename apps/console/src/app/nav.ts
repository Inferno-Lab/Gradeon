import { IC, type NavGroup } from '@gradeon/web-ui';
import { url } from './base';

interface Def { id: string; label: string; icon: keyof typeof IC; keys: string; to: string }

const DEFS: { name: string; items: Def[] }[] = [
  { name: 'Operate', items: [
    { id: 'fleet', label: 'Fleet', icon: 'fleet', keys: 'G F', to: '/' },
    { id: 'onb', label: 'Onboarding', icon: 'onb', keys: 'G O', to: '/onboarding' },
    { id: 'cells', label: 'Cells', icon: 'cells', keys: 'G C', to: '/cells' },
    { id: 'rel', label: 'Releases', icon: 'rel', keys: 'G R', to: '/releases' },
    { id: 'mig', label: 'Migrations', icon: 'mig', keys: 'G M', to: '/migrations' },
  ] },
  { name: 'Ship', items: [
    { id: 'app', label: 'Mobile builds', icon: 'app', keys: 'G B', to: '/builds' },
    { id: 'flag', label: 'Flags', icon: 'flag', keys: 'G L', to: '/flags' },
    { id: 'bp', label: 'Blueprints', icon: 'bp', keys: 'G P', to: '/blueprints' },
  ] },
  { name: 'Care', items: [
    { id: 'health', label: 'Health', icon: 'health', keys: 'G H', to: '/health' },
    { id: 'appr', label: 'Approvals', icon: 'appr', keys: 'G A', to: '/approvals' },
    { id: 'req', label: 'Requests', icon: 'inbox', keys: 'G Q', to: '/requests' },
    { id: 'sup', label: 'Support', icon: 'sup', keys: 'G S', to: '/support' },
    { id: 'inbox', label: 'Test inbox', icon: 'inbox', keys: 'G X', to: '/inbox' },
    { id: 'bill', label: 'Billing', icon: 'bill', keys: 'G I', to: '/billing' },
    { id: 'comp', label: 'Compliance', icon: 'sup', keys: 'G Y', to: '/compliance' },
    { id: 'team', label: 'Team', icon: 'team', keys: 'G T', to: '/team' },
  ] },
];

/** The console menu. Counts come from the data the page already has. */
export function consoleNav(counts?: { onboarding?: number; builds?: number; approvals?: number; requests?: number }): NavGroup[] {
  return DEFS.map((g) => ({
    name: g.name,
    items: g.items.map((i) => ({
      id: i.id, label: i.label, icon: IC[i.icon], keys: i.keys, href: url(i.to),
      count: i.id === 'onb' && counts?.onboarding ? String(counts.onboarding) : i.id === 'app' && counts?.builds ? String(counts.builds) : i.id === 'appr' && counts?.approvals ? String(counts.approvals) : i.id === 'req' && counts?.requests ? String(counts.requests) : undefined,
    })),
  }));
}

export function shortcutTargets(groups: NavGroup[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const g of groups) for (const i of g.items) m.set(i.keys.replace('G ', '').toLowerCase(), i.href);
  return m;
}

export const PAGE_TITLES: Record<string, string> = Object.fromEntries(DEFS.flatMap((g) => g.items.map((i) => [i.to.slice(1), i.label])));
