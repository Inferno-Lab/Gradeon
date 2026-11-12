import { useEffect, useSyncExternalStore } from 'react';
import { CONSOLE_HUE, hueCss } from '@gradeon/contracts';

export type Theme = 'light' | 'dark';
const KEY = 'gradeon.theme';
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* storage can be blocked */ }
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

let current: Theme = read();
if (typeof matchMedia !== 'undefined') {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    try { if (localStorage.getItem(KEY)) return; } catch { /* ignore */ }
    current = read();
    listeners.forEach((l) => l());
  });
}

export function setTheme(t: Theme | null): void {
  try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch { /* ignore */ }
  current = read();
  // Everything swaps in the same frame: without this, each element fades its own colours and cards flash grey.
  const root = document.documentElement;
  root.classList.add('theme-swap');
  root.dataset.theme = current;
  listeners.forEach((l) => l());
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-swap')));
}

/** Puts a seed's colours (Gradeon Hue) on every `.nest` on the page, portals and sign-in pages included. hue.css holds the console's. */
export function useHue(hue: number | undefined): void {
  const css = hue === undefined || hue === CONSOLE_HUE ? '' : hueCss(hue, '.nest.nest');
  useEffect(() => {
    let tag = document.getElementById('gradeon-theme');
    if (!css) { tag?.remove(); return; }
    if (!tag) { tag = document.createElement('style'); tag.id = 'gradeon-theme'; document.head.append(tag); }
    tag.textContent = css;
  }, [css]);
}

/** The theme follows the device unless a person has chosen one. The `.nest` root gets the `dark` class from it. */
export function useTheme(): { theme: Theme; cls: string; toggle: () => void } {
  const theme = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => current, () => 'light' as Theme);
  return { theme, cls: theme === 'dark' ? 'dark' : '', toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') };
}
