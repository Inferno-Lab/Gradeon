// One seed colour in, every token out. OKLCH maths with gamut mapping by chroma reduction (what the real generator will do).
const lin2srgb = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
function oklch(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
const inGamut = (rgb) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);
export function maxC(L, h) { let lo = 0, hi = 0.4; for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (inGamut(oklch(L, mid, h))) lo = mid; else hi = mid; } return lo; }
export function hex(L, C, h) {
  const c = Math.min(C, maxC(L, h));
  return '#' + oklch(L, c, h).map((v) => Math.round(Math.min(1, Math.max(0, lin2srgb(Math.min(1, Math.max(0, v))))) * 255).toString(16).padStart(2, '0')).join('');
}
const lum = (x) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// frac of the hue's available chroma at that lightness, capped: a blue and a green seed both come out as vivid as they can be
const rel = (L, frac, cap, h) => hex(L, Math.min(cap, frac * maxC(L, h)), h);

export function seedTokens(h, dark) {
  const n = (L, C) => hex(L, C, h);
  return dark ? {
    bg: n(0.155, 0.012), s1: n(0.205, 0.016), s2: n(0.245, 0.018), s3: n(0.29, 0.02), line: n(0.285, 0.02), line2: n(0.39, 0.022),
    t1: n(0.96, 0.01), t2: n(0.79, 0.02), t3: n(0.66, 0.02),
    deep: rel(0.215, 0.7, 0.05, h), deep2: rel(0.275, 0.7, 0.06, h), deep3: rel(0.34, 0.7, 0.065, h), hero: rel(0.31, 0.8, 0.085, h), hero2: rel(0.37, 0.8, 0.09, h),
    'on-deep': n(0.97, 0.015), 'on-deep2': n(0.82, 0.04), bright: rel(0.88, 0.9, 0.19, h), 'on-bright': rel(0.2, 0.7, 0.05, h),
    brand: rel(0.86, 0.85, 0.17, h), 'brand-h': rel(0.91, 0.85, 0.15, h), 'on-brand': rel(0.2, 0.7, 0.05, h),
    'brand-soft': rel(0.285, 0.6, 0.06, h), 'brand-soft2': rel(0.35, 0.65, 0.08, h), 'brand-ink': rel(0.86, 0.75, 0.14, h), 'brand-line': rel(0.46, 0.7, 0.1, h),
    heat1: rel(0.27, 0.5, 0.04, h), heat2: rel(0.35, 0.6, 0.07, h), heat3: rel(0.46, 0.7, 0.1, h), heat4: rel(0.62, 0.8, 0.13, h), heat5: rel(0.8, 0.85, 0.15, h),
    'heat-lo-t': n(0.96, 0.01), 'heat-hi-t': rel(0.18, 0.7, 0.04, h),
    shadow: '0 1px 2px rgb(0 0 0 / .4), 0 12px 32px rgb(0 0 0 / .5)',
  } : {
    bg: n(0.965, 0.009), s1: '#ffffff', s2: n(0.955, 0.012), s3: n(0.925, 0.016), line: n(0.915, 0.012), line2: n(0.84, 0.018),
    t1: n(0.2, 0.02), t2: n(0.42, 0.02), t3: n(0.53, 0.018),
    deep: rel(0.25, 0.75, 0.07, h), deep2: rel(0.315, 0.75, 0.08, h), deep3: rel(0.38, 0.75, 0.085, h), hero: rel(0.27, 0.8, 0.075, h), hero2: rel(0.335, 0.8, 0.085, h),
    'on-deep': n(0.97, 0.015), 'on-deep2': n(0.83, 0.04), bright: rel(0.89, 0.9, 0.19, h), 'on-bright': rel(0.22, 0.75, 0.06, h),
    brand: rel(0.5, 0.92, 0.2, h), 'brand-h': rel(0.44, 0.92, 0.18, h), 'on-brand': '#ffffff',
    'brand-soft': rel(0.945, 0.9, 0.045, h), 'brand-soft2': rel(0.895, 0.9, 0.075, h), 'brand-ink': rel(0.38, 0.9, 0.13, h), 'brand-line': rel(0.8, 0.8, 0.09, h),
    heat1: rel(0.95, 0.9, 0.03, h), heat2: rel(0.88, 0.9, 0.07, h), heat3: rel(0.77, 0.9, 0.11, h), heat4: rel(0.61, 0.9, 0.14, h), heat5: rel(0.44, 0.9, 0.13, h),
    'heat-lo-t': n(0.2, 0.02), 'heat-hi-t': '#ffffff',
    shadow: '0 1px 2px rgb(0 0 0 / .06), 0 12px 32px rgb(0 0 0 / .12)',
  };
}

const SEM = { ok: 150, warn: 75, bad: 25, info: 250 };
export const SPECTRUM = { rose: 0, red: 30, orange: 60, amber: 90, lime: 120, green: 150, teal: 185, cyan: 215, blue: 250, indigo: 275, violet: 305, pink: 335 };
const tri = (H, dark) => (dark ? [rel(0.72, 0.85, 0.16, H), rel(0.3, 0.6, 0.065, H), rel(0.87, 0.7, 0.11, H)] : [rel(0.6, 0.9, 0.17, H), rel(0.945, 0.9, 0.045, H), rel(0.4, 0.9, 0.13, H)]);
export function fixedTokens(dark) {
  const t = {};
  for (const [k, H] of Object.entries(SEM)) {
    const L = dark ? 0.74 : k === 'warn' ? 0.8 : 0.52;
    t[k] = rel(L, 0.9, 0.2, H); t[`on-${k}`] = dark || k === 'warn' ? hex(0.2, 0.03, H) : '#ffffff';
    t[`${k}-d`] = rel(0.82, 0.9, 0.17, H); t[`${k}-s`] = dark ? rel(0.29, 0.6, 0.06, H) : rel(0.95, 0.9, 0.045, H); t[`${k}-i`] = dark ? rel(0.87, 0.7, 0.11, H) : rel(k === 'warn' ? 0.42 : 0.4, 0.9, 0.13, H);
  }
  return t;
}
export const SEEDS = { emerald: 162, cobalt: 262, saffron: 62, maroon: 12 };
const block = (sel, o) => `${sel}{${Object.entries(o).map(([k, v]) => `--${k}:${v}`).join(';')}}\n`;
export function tokensCss() {
  let css = block('.hue', fixedTokens(false)) + block('.hue.dark,.hue .dark', fixedTokens(true));
  for (const [k, H] of Object.entries(SPECTRUM)) { const [c, s, i] = tri(H, false), [dc, ds, di] = tri(H, true); css += block(`.sp-${k}`, { c, cs: s, ci: i }) + block(`.dark .sp-${k},.dark.sp-${k}`, { c: dc, cs: ds, ci: di }); }
  for (const [k, h] of Object.entries(SEEDS)) css += block(`.s-${k}`, seedTokens(h, false)) + block(`.dark.s-${k},.dark .s-${k}`, seedTokens(h, true));
  return css;
}
if (process.argv[1].endsWith('palette.mjs')) {
  for (const [k, h] of Object.entries(SEEDS)) for (const dark of [false, true]) {
    const t = { ...seedTokens(h, dark), ...fixedTokens(dark) }, c = (a, b) => contrast(t[a], t[b]).toFixed(1);
    console.log(k.padEnd(8), dark ? 'dark ' : 'light', `t1/bg ${c('t1', 'bg')} t2/s1 ${c('t2', 's1')} t3/s1 ${c('t3', 's1')} t3/bg ${c('t3', 'bg')} onbrand/brand ${c('on-brand', 'brand')} ink/soft ${c('brand-ink', 'brand-soft')} ondeep2/deep ${c('on-deep2', 'deep')} onbright/bright ${c('on-bright', 'bright')} ondeep/hero ${c('on-deep', 'hero')} bright/hero ${c('bright', 'hero')} ok ${c('on-ok', 'ok')} bad ${c('on-bad', 'bad')} info ${c('on-info', 'info')} warn ${c('on-warn', 'warn')} ok-i/s ${c('ok-i', 'ok-s')} warn-i/s ${c('warn-i', 'warn-s')} brandink/s1 ${c('brand-ink', 's1')} brand/s1 ${c('brand', 's1')}`);
  }
}
