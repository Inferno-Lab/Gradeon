const PEOPLE = ['blue', 'rose', 'teal', 'amber', 'violet', 'green', 'orange', 'cyan', 'pink', 'indigo', 'lime', 'red'];

/** A person's avatar colour: one spectrum colour picked from the name, so the same person always looks the same (both themes). */
export function tintFor(name: string): { bg: string; fg: string } {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const c = PEOPLE[h % PEOPLE.length];
  return { bg: `var(--sp-${c}-cs)`, fg: `var(--sp-${c}-ci)` };
}

/** Colours for the approval tones used on the dashboard, from the theme so they work in dark mode too. */
export const TONES: Record<string, { bg: string; fg: string }> = {
  blue: { bg: 'var(--sp-blue-cs)', fg: 'var(--sp-blue-ci)' }, violet: { bg: 'var(--sp-violet-cs)', fg: 'var(--sp-violet-ci)' }, mint: { bg: 'var(--ok-s)', fg: 'var(--ok-i)' },
  amber: { bg: 'var(--warn-s)', fg: 'var(--warn-i)' }, coral: { bg: 'var(--bad-s)', fg: 'var(--bad)' },
};
