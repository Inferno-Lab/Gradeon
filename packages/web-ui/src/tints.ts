/** Every avatar is neutral and follows the theme: colour is kept for data and state. The name is still taken so callers stay as they are. */
export function tintFor(_name: string): { bg: string; fg: string } {
  return { bg: 'var(--sunk)', fg: 'var(--ink2)' };
}

/** Colours for the approval tones used on the dashboard, from the theme so they work in dark mode too. */
export const TONES: Record<string, { bg: string; fg: string }> = {
  blue: { bg: 'var(--vS)', fg: 'var(--vD)' }, violet: { bg: 'var(--vS)', fg: 'var(--vD)' }, mint: { bg: 'var(--gS)', fg: 'var(--gD)' },
  amber: { bg: 'var(--aS)', fg: 'var(--aD)' }, coral: { bg: 'var(--rS)', fg: 'var(--r)' },
};
