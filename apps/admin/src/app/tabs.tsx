import { useParams } from '@tanstack/react-router';
import { Segmented } from '@gradeon/web-ui';
import { useApp } from './context';
import { useShellChrome } from './Layout';

/**
 * A page's tabs, as its module defines them (config-engine `pages[].tabs`, already filtered by the school's features and the
 * person's permissions). Each tab has its own address (`/attendance/leave`), so a link or a reload lands on it.
 */
export function usePageTabs(path: string): { tab: string; tabs: React.ReactNode } {
  const app = useApp();
  const { shell } = useShellChrome();
  const { tab: asked } = useParams({ strict: false }) as { tab?: string };
  const list = shell?.menu.flatMap((g) => g.pages).find((p) => p.href === path)?.tabs ?? [];
  const tab = list.find((t) => t.key === asked)?.key ?? list[0]?.key ?? asked ?? '';
  const tabs = list.length > 1
    ? <Segmented label="Sections" value={tab} onChange={(k) => app.go(k === list[0]!.key ? path : `${path}/${k}`)} options={list.map((t) => ({ value: t.key, label: t.label }))} />
    : null;
  return { tab, tabs };
}
