import { useParams } from '@tanstack/react-router';
import { Segmented } from '@gradeon/web-ui';
import { useApp } from './context';
import { tabsOf } from './nav';

/** A page's tabs (app/nav.ts), each with its own address (`/releases/database`), so a link or a reload lands on it. */
export function usePageTabs(path: string): { tab: string; tabs: React.ReactNode } {
  const app = useApp();
  const { tab: asked } = useParams({ strict: false }) as { tab?: string };
  const list = tabsOf(path, app.can);
  const tab = list.find((t) => t.key === asked)?.key ?? list[0]?.key ?? '';
  const tabs = list.length > 1
    ? <Segmented label="Sections" value={tab} onChange={(k) => app.go(k === list[0]!.key ? path : `${path}/${k}`)} options={list.map((t) => ({ value: t.key, label: t.label }))} />
    : null;
  return { tab, tabs };
}
