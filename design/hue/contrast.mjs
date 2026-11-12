// node contrast.mjs : WCAG contrast of the text/background pairs the system uses, every seed, light and dark
import { seedTokens, fixedTokens, SEEDS } from './palette.mjs';
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const L = (h) => { const n = parseInt(h.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
const cr = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// [text, background, minimum]
const PAIRS = [['t1', 'bg', 4.5], ['t1', 's1', 4.5], ['t2', 's1', 4.5], ['t2', 'bg', 4.5], ['t3', 's1', 3], ['on-deep', 'deep', 4.5], ['on-deep2', 'deep', 4.5], ['on-deep', 'hero', 4.5], ['on-deep2', 'hero', 4.5],
  ['bright', 'hero', 3], ['on-bright', 'bright', 4.5], ['on-brand', 'brand', 4.5], ['brand-ink', 'brand-soft', 4.5], ['brand-ink', 's1', 4.5], ['brand', 's1', 3],
  ['ok-i', 'ok-s', 4.5], ['warn-i', 'warn-s', 4.5], ['bad-i', 'bad-s', 4.5], ['info-i', 'info-s', 4.5], ['on-ok', 'ok', 4.5], ['on-warn', 'warn', 4.5], ['on-bad', 'bad', 4.5], ['heat-lo-t', 'heat1', 4.5], ['heat-hi-t', 'heat5', 4.5]];
let fails = 0, low = 99;
for (const [seed, h] of Object.entries(SEEDS)) for (const dark of [false, true]) {
  const t = { ...fixedTokens(dark), ...seedTokens(h, dark) }, k = (n) => t[n] ?? t['--' + n];
  for (const [a, b, min] of PAIRS) {
    if (!k(a) || !k(b) || !/^#/.test(k(a)) || !/^#/.test(k(b))) { console.log('skip', a, b, k(a), k(b)); continue; }
    const r = cr(k(a), k(b)); low = Math.min(low, r / min);
    if (r < min) { fails++; console.log(`FAIL ${seed}${dark ? ' dark' : ''} ${a} on ${b}: ${r.toFixed(2)} < ${min}`); }
  }
}
console.log(fails ? `${fails} pairs below the line` : 'every pair passes', '· tightest margin', low.toFixed(2));
