// Checks the theme's colour pairs against WCAG 2.1 in light and dark, read straight from packages/web-ui/src/nest.css.
// Text needs 4.5:1, field borders 3:1. Usage: node tools/check-contrast.mjs
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../packages/web-ui/src/nest.css', import.meta.url), 'utf8');
const block = (start) => {
  const at = css.indexOf(start);
  const body = css.slice(at, css.indexOf('}', at));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
};
const light = block('.nest{--bd:');
const themes = { light, dark: { ...light, ...block('.nest.dark{--bd:') } };
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

// [foreground, background, minimum]. A literal hex is used as is (text on amber is always dark ink).
const PAIRS = [
  ['ink', 'card', 4.5], ['ink', 'frame', 4.5], ['ink2', 'frame', 4.5], ['ink2', 'card', 4.5], ['ink2', 'sunk', 4.5],
  ['ink3', 'card', 4.5], ['ink3', 'frame', 4.5], ['ink3', 'sunk', 4.5], ['field', 'card', 3], ['field', 'frame', 3],
  ['v', 'card', 4.5], ['onV', 'v', 4.5], ['vD', 'vS', 4.5], ['vD', 'vL', 4.5], ['aD', 'aS', 4.5], ['#1A1A1C', 'a', 4.5],
  ['gD', 'gS', 4.5], ['g', 'card', 4.5], ['r', 'card', 4.5], ['r', 'rS', 4.5], ['#FFFFFF', 'rF', 4.5], ['priT', 'pri', 4.5],
  ['b', 'bS', 4.5], ['cD', 'cS', 4.5], ['card', 'g', 4.5], ['ink2', 'vS', 4.5],
];
let bad = 0;
for (const [name, t] of Object.entries(themes)) {
  for (const [fg, bg, min] of PAIRS) {
    const a = fg.startsWith('#') ? fg : t[fg];
    const b = bg.startsWith('#') ? bg : t[bg];
    const r = ratio(a, b);
    const ok = r >= min;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(5)} ${fg.padEnd(8)} on ${bg.padEnd(6)} ${r.toFixed(2)} (needs ${min})`);
  }
}
console.log(bad ? `\n${bad} pairs fail` : '\nEvery pair passes');
process.exit(bad ? 1 : 0);
