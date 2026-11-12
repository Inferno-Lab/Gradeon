/** Every avatar is neutral and follows the theme: colour is kept for data and state. The name is still taken so callers stay as they are. */
export function tintFor(_name: string): { bg: string; fg: string } {
  return { bg: 'var(--s2)', fg: 'var(--ink2)' };
}

/** Colours for the approval tones used on the dashboard, from the theme so they work in dark mode too. */
export const TONES: Record<string, { bg: string; fg: string }> = {
  blue: { bg: 'var(--brand-soft)', fg: 'var(--brand-ink)' }, violet: { bg: 'var(--brand-soft)', fg: 'var(--brand-ink)' }, mint: { bg: 'var(--ok-s)', fg: 'var(--ok-i)' },
  amber: { bg: 'var(--warn-s)', fg: 'var(--warn-i)' }, coral: { bg: 'var(--bad-s)', fg: 'var(--bad)' },
};
