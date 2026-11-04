import { useSyncExternalStore } from 'react';

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
  document.documentElement.dataset.theme = current;
  listeners.forEach((l) => l());
}

/** The theme follows the device unless a person has chosen one. The `.nest` root gets the `dark` class from it. */
export function useTheme(): { theme: Theme; cls: string; toggle: () => void } {
  const theme = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => current, () => 'light' as Theme);
  return { theme, cls: theme === 'dark' ? 'dark' : '', toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') };
}
