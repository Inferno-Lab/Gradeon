// Gradeon Hue: one seed colour in, every colour of the admin, the console and the app out (design/hue/palette.mjs, approved
// 10 November 2026). OKLCH with gamut mapping by chroma reduction; hue.test.ts checks every integer hue against WCAG AA.

export type HueMode = 'light' | 'dark' | 'amoled';

const lin2srgb = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
function oklch(L: number, C: number, h: number): [number, number, number] {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
const inGamut = (rgb: number[]) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);
function maxC(L: number, h: number) { let lo = 0, hi = 0.4; for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (inGamut(oklch(L, mid, h))) lo = mid; else hi = mid; } return lo; }
function hex(L: number, C: number, h: number) {
  const c = Math.min(C, maxC(L, h));
  return '#' + oklch(L, c, h).map((v) => Math.round(Math.min(1, Math.max(0, lin2srgb(Math.min(1, Math.max(0, v))))) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
// A share of the chroma the hue can reach at that lightness, capped: a blue and a green seed come out as vivid as they can be.
const rel = (L: number, frac: number, cap: number, h: number) => hex(L, Math.min(cap, frac * maxC(L, h)), h);

const lum = (x: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number]; return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** WCAG contrast ratio, 1 to 21. */
export const hueContrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number]; return (x + 0.05) / (y + 0.05); };

/** The hue (0–359) of a #RRGGBB colour, in OKLCH; a grey gives the console's cobalt. */
export function hueOf(colour: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  if (Math.hypot(A, B) < 0.02) return CONSOLE_HUE;
  return Math.round(((Math.atan2(B, A) * 180) / Math.PI + 360) % 360) % 360;
}

/** The console's own seed (cobalt) and the seed of a school that has no brand colour yet. */
export const CONSOLE_HUE = 262;

/** Colours worked out from the school's seed. */
export function seedTokens(h: number, mode: HueMode): Record<string, string> {
  const n = (L: number, C: number) => hex(L, C, h);
  if (mode === 'light') return {
    bg: n(0.965, 0.009), s1: '#FFFFFF', s2: n(0.955, 0.012), s3: n(0.925, 0.016), line: n(0.915, 0.012), line2: n(0.84, 0.018),
    t1: n(0.2, 0.02), t2: n(0.42, 0.02), t3: n(0.53, 0.018),
    deep: rel(0.25, 0.75, 0.07, h), deep2: rel(0.315, 0.75, 0.08, h), deep3: rel(0.38, 0.75, 0.085, h), hero: rel(0.27, 0.8, 0.075, h), hero2: rel(0.335, 0.8, 0.085, h),
    'on-deep': n(0.97, 0.015), 'on-deep2': n(0.83, 0.04), bright: rel(0.89, 0.9, 0.19, h), 'on-bright': rel(0.22, 0.75, 0.06, h),
    brand: rel(0.5, 0.92, 0.2, h), 'brand-h': rel(0.44, 0.92, 0.18, h), 'on-brand': '#FFFFFF',
    'brand-soft': rel(0.945, 0.9, 0.045, h), 'brand-soft2': rel(0.895, 0.9, 0.075, h), 'brand-ink': rel(0.38, 0.9, 0.13, h), 'brand-line': rel(0.8, 0.8, 0.09, h),
    heat1: rel(0.95, 0.9, 0.03, h), heat2: rel(0.88, 0.9, 0.07, h), heat3: rel(0.77, 0.9, 0.11, h), heat4: rel(0.61, 0.9, 0.14, h), heat5: rel(0.44, 0.9, 0.13, h),
    'heat-lo-t': n(0.2, 0.02), 'heat-hi-t': '#FFFFFF', scrim: '#0B111066',
  };
  // AMOLED is the dark theme on true black: the page and the cards drop to black, everything else stays.
  const black = mode === 'amoled';
  return {
    bg: black ? '#000000' : n(0.155, 0.012), s1: black ? n(0.14, 0.012) : n(0.205, 0.016), s2: black ? n(0.18, 0.014) : n(0.245, 0.018), s3: n(0.29, 0.02), line: n(0.285, 0.02), line2: n(0.39, 0.022),
    t1: n(0.96, 0.01), t2: n(0.79, 0.02), t3: n(0.66, 0.02),
    deep: black ? '#000000' : rel(0.215, 0.7, 0.05, h), deep2: rel(0.275, 0.7, 0.06, h), deep3: rel(0.34, 0.7, 0.065, h), hero: rel(0.31, 0.8, 0.085, h), hero2: rel(0.37, 0.8, 0.09, h),
    'on-deep': n(0.97, 0.015), 'on-deep2': n(0.82, 0.04), bright: rel(0.88, 0.9, 0.19, h), 'on-bright': rel(0.2, 0.7, 0.05, h),
    brand: rel(0.86, 0.85, 0.17, h), 'brand-h': rel(0.91, 0.85, 0.15, h), 'on-brand': rel(0.2, 0.7, 0.05, h),
    'brand-soft': rel(0.285, 0.6, 0.06, h), 'brand-soft2': rel(0.35, 0.65, 0.08, h), 'brand-ink': rel(0.86, 0.75, 0.14, h), 'brand-line': rel(0.46, 0.7, 0.1, h),
    heat1: rel(0.27, 0.5, 0.04, h), heat2: rel(0.35, 0.6, 0.07, h), heat3: rel(0.46, 0.7, 0.1, h), heat4: rel(0.62, 0.8, 0.13, h), heat5: rel(0.8, 0.85, 0.15, h),
    'heat-lo-t': n(0.96, 0.01), 'heat-hi-t': rel(0.18, 0.7, 0.04, h), scrim: '#000000A3',
  };
}

const STATUS = { ok: 150, warn: 75, bad: 25, info: 250 } as const;
/** Twelve fixed hues that name things (subjects, houses, payment methods); the same in every school. */
export const SPECTRUM = { rose: 0, red: 30, orange: 60, amber: 90, lime: 120, green: 150, teal: 185, cyan: 215, blue: 250, indigo: 275, violet: 305, pink: 335 } as const;
export type SpectrumColour = keyof typeof SPECTRUM;
export const SPECTRUM_COLOURS = Object.keys(SPECTRUM) as SpectrumColour[];

/** Status colours (good, watch, act, note): solid, text on it, on the deep colour, soft fill, ink on the soft fill. */
export function fixedTokens(mode: HueMode): Record<string, string> {
  const dark = mode !== 'light', t: Record<string, string> = {};
  for (const [k, H] of Object.entries(STATUS)) {
    const L = dark ? 0.74 : k === 'warn' ? 0.8 : 0.52;
    t[k] = rel(L, 0.9, 0.2, H); t[`on-${k}`] = dark || k === 'warn' ? hex(0.2, 0.03, H) : '#FFFFFF';
    t[`${k}-d`] = rel(0.82, 0.9, 0.17, H); t[`${k}-s`] = dark ? rel(0.29, 0.6, 0.06, H) : rel(0.95, 0.9, 0.045, H);
    t[`${k}-i`] = dark ? rel(0.87, 0.7, 0.11, H) : rel(k === 'warn' ? 0.42 : 0.4, 0.9, 0.13, H);
  }
  return t;
}

/** One spectrum colour: solid, soft fill and ink on the soft fill. */
export function spectrumTokens(colour: SpectrumColour, mode: HueMode): { c: string; cs: string; ci: string } {
  const H = SPECTRUM[colour];
  return mode === 'light' ? { c: rel(0.6, 0.9, 0.17, H), cs: rel(0.945, 0.9, 0.045, H), ci: rel(0.4, 0.9, 0.13, H) }
    : { c: rel(0.72, 0.85, 0.16, H), cs: rel(0.3, 0.6, 0.065, H), ci: rel(0.87, 0.7, 0.11, H) };
}

/** Every colour for one seed and mode: seed colours, status colours and the spectrum as `sp.<colour>.c|cs|ci`. */
export function hueTokens(h: number, mode: HueMode): Record<string, string> {
  const out: Record<string, string> = { ...seedTokens(h, mode), ...fixedTokens(mode) };
  for (const c of SPECTRUM_COLOURS) for (const [k, v] of Object.entries(spectrumTokens(c, mode))) out[`sp.${c}.${k}`] = v;
  return out;
}

/** Text/background pairs that must reach WCAG AA, with the ratio each needs. */
export const HUE_PAIRS: [string, string, number][] = [
  ['t1', 'bg', 4.5], ['t1', 's1', 4.5], ['t2', 's1', 4.5], ['t2', 'bg', 4.5], ['t3', 's1', 3], ['on-deep', 'deep', 4.5], ['on-deep2', 'deep', 4.5], ['on-deep', 'hero', 4.5], ['on-deep2', 'hero', 4.5],
  ['bright', 'hero', 3], ['on-bright', 'bright', 4.5], ['on-brand', 'brand', 4.5], ['brand-ink', 'brand-soft', 4.5], ['brand-ink', 's1', 4.5], ['brand', 's1', 3],
  ['ok-i', 'ok-s', 4.5], ['warn-i', 'warn-s', 4.5], ['bad-i', 'bad-s', 4.5], ['info-i', 'info-s', 4.5], ['on-ok', 'ok', 4.5], ['on-warn', 'warn', 4.5], ['on-bad', 'bad', 4.5], ['heat-lo-t', 'heat1', 4.5], ['heat-hi-t', 'heat5', 4.5],
];

// On the web --t1/--t2/--t3 are the three motion timings, so the text colours are --ink, --ink2 and --ink3 there.
const WEB_NAME: Record<string, string> = { t1: 'ink', t2: 'ink2', t3: 'ink3' };

/**
 * The web's surfaces and ink: the warm neutrals of the Nest design (the owner's choice for admin and console, 14 November
 * 2026), the same for every school, so no page or card takes a tint from the school's colour. The school's colour stays in
 * the accents (brand, bright, heat). Dark cards ("deep") are ink, as Nest's ink tiles were. `bd` is the canvas around the
 * frame, `field` the outline of an input. The app keeps the seeded surfaces (hueTokens).
 */
export const WEB_NEUTRALS: Record<HueMode, Record<string, string>> = {
  light: {
    bd: '#E9E9E6', bg: '#F3F3F1', s1: '#FFFFFF', s2: '#F6F6F4', s3: '#EDEDEA', line: '#E5E5E1', line2: '#D6D6D1', field: '#8A8A84',
    t1: '#1A1A1C', t2: '#4D4D53', t3: '#6A6A70', deep: '#1A1A1C', deep2: '#2A2A2E', deep3: '#3A3A40', hero: '#1A1A1C', hero2: '#2A2A2E',
    'on-deep': '#FFFFFF', 'on-deep2': '#C2C2C7', scrim: '#1111136B',
  },
  dark: {
    bd: '#0A0A0B', bg: '#111113', s1: '#19191C', s2: '#1E1E22', s3: '#26262A', line: '#2A2A2E', line2: '#34343A', field: '#6B6B72',
    t1: '#F2F2F3', t2: '#B8B8BE', t3: '#8E8E96', deep: '#26262A', deep2: '#303035', deep3: '#3C3C42', hero: '#26262A', hero2: '#303035',
    'on-deep': '#FFFFFF', 'on-deep2': '#B8B8BE', scrim: '#0000009E',
  },
  amoled: {
    bd: '#000000', bg: '#000000', s1: '#121214', s2: '#18181B', s3: '#222226', line: '#26262A', line2: '#34343A', field: '#6B6B72',
    t1: '#F2F2F3', t2: '#B8B8BE', t3: '#8E8E96', deep: '#222226', deep2: '#2C2C31', deep3: '#38383E', hero: '#222226', hero2: '#2C2C31',
    'on-deep': '#FFFFFF', 'on-deep2': '#B8B8BE', scrim: '#000000B3',
  },
};

/**
 * The app's neutrals, which a school's seed never tints: the old Chalk & Glass app's chalk, paper and ink, an ink frame
 * (the dock and the headline card) and marigold for "you are here". Gradeon Hue's layouts, spectrum and status colours,
 * and the school's brand colour for actions, stay.
 */
export const APP_NEUTRALS: Record<HueMode, Record<string, string>> = {
  light: {
    bg: '#EEF0EC', s1: '#FBFCF9', s2: '#F3F5F1', s3: '#E6EAE4', line: '#10201B17', line2: '#10201B2B',
    t1: '#10201B', t2: '#36443F', t3: '#56635E', deep: '#10201B', deep2: '#22322C', deep3: '#34433D', hero: '#10201B', hero2: '#22322C',
    'on-deep': '#FFFFFF', 'on-deep2': '#BCC8C2', bright: '#F2A007', 'on-bright': '#2B1C00', scrim: '#0A141157',
  },
  dark: {
    bg: '#0D1814', s1: '#14231E', s2: '#1A2C26', s3: '#22362F', line: '#E8EFEA17', line2: '#E8EFEA2B',
    t1: '#E8EFEA', t2: '#BCC8C2', t3: '#93A29B', deep: '#22362F', deep2: '#2B4239', deep3: '#364E44', hero: '#22362F', hero2: '#2B4239',
    'on-deep': '#FFFFFF', 'on-deep2': '#BCC8C2', bright: '#F2A007', 'on-bright': '#2B1C00', scrim: '#00000080',
  },
  amoled: {
    bg: '#000000', s1: '#0B110F', s2: '#111916', s3: '#1A2420', line: '#E8EFEA17', line2: '#E8EFEA2B',
    t1: '#E8EFEA', t2: '#BCC8C2', t3: '#93A29B', deep: '#1A2420', deep2: '#24302B', deep3: '#2F3C36', hero: '#1A2420', hero2: '#24302B',
    'on-deep': '#FFFFFF', 'on-deep2': '#BCC8C2', bright: '#F2A007', 'on-bright': '#2B1C00', scrim: '#000000B3',
  },
};

/** Every colour the app gets for one seed and mode: [hueTokens] in the app's neutrals. */
export const appTokens = (h: number, mode: HueMode): Record<string, string> => ({ ...hueTokens(h, mode), ...APP_NEUTRALS[mode] });

/** The CSS for a seed: light on `.nest`, dark on `.nest.dark`, spectrum on `.sp-<colour>`. */
export function hueCss(h: number, scope = '.nest'): string {
  const decl = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `--${WEB_NAME[k] ?? k}:${v}`).join(';');
  // Each spectrum colour also as page-wide variables (--sp-rose-cs, --sp-rose-ci…), for things coloured by data such as avatars.
  const spread = (mode: HueMode) => Object.fromEntries(SPECTRUM_COLOURS.flatMap((c) => { const t = spectrumTokens(c, mode); return [[`sp-${c}-cs`, t.cs], [`sp-${c}-ci`, t.ci]]; }));
  const flat = (mode: HueMode) => ({ ...seedTokens(h, mode), ...WEB_NEUTRALS[mode], ...fixedTokens(mode), ...spread(mode) });
  let css = `${scope}{${decl(flat('light'))}}${scope}.dark,${scope} .dark{${decl(flat('dark'))}}`;
  for (const c of SPECTRUM_COLOURS) css += `${scope} .sp-${c}{${decl(spectrumTokens(c, 'light'))}}${scope}.dark .sp-${c},${scope} .dark .sp-${c}{${decl(spectrumTokens(c, 'dark'))}}`;
  return css;
}
