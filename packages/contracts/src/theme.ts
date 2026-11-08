import { z } from 'zod';

// Every colour in the admin, the console and the app, with the default each starts from. The console changes any of them,
// per school (admin and app) and for itself (console). Only changed colours are stored: { 'web.light.v': '#2F5BD3', ... }.

/** A colour as #RRGGBB, or #RRGGBBAA when it is see-through. */
export const HEX_COLOUR = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

export type WebMode = 'light' | 'dark';
export type AppMode = 'light' | 'dark' | 'amoled';

/** How a colour follows its base when only the base is changed: a soft fill, readable text, text on top of it, and so on. */
type Derive = 'soft' | 'wash' | 'line' | 'text' | 'on' | 'solid';

export interface WebToken { key: string; label: string; group: string; help: string; light: string; dark: string; from?: string; derive?: Derive }
export interface AppToken { key: string; label: string; group: string; help: string; light: string; dark: string; amoled?: string; from?: string; derive?: Derive }
export interface SharedToken { key: string; label: string; group: string; help: string; value: string; from?: string; derive?: Derive }

const w = (key: string, group: string, label: string, help: string, light: string, dark: string, from?: string, derive?: Derive): WebToken => ({ key, group, label, help, light, dark, from, derive });

/** The admin's and the console's colours (CSS variables on `.nest`). */
export const WEB_TOKENS: WebToken[] = [
  w('bd', 'Surfaces', 'Page', 'Behind the frame, at the very edge of the window.', '#E9E9E6', '#0A0A0B'),
  w('frame', 'Surfaces', 'Frame and menu', 'The frame around every page and the side menu.', '#F3F3F1', '#111113'),
  w('card', 'Surfaces', 'Cards', 'Cards, dialogs, menus and fields.', '#FFFFFF', '#19191C'),
  w('sunk', 'Surfaces', 'Wells and hover', 'Recessed areas, table headers, and rows under the pointer.', '#F6F6F4', '#1E1E22'),
  w('ci', 'Surfaces', 'Dark card', 'Inverted cards, toasts and floating bars.', '#1A1A1C', '#26262A'),
  w('onCi', 'Surfaces', 'Text on the dark card', '', '#FFFFFF', '#FFFFFF', 'ci', 'on'),
  w('knob', 'Surfaces', 'Switch knob', 'The round knob of every on/off switch.', '#FFFFFF', '#FFFFFF'),
  w('line', 'Lines', 'Hairlines', 'Card edges and dividers.', '#E5E5E1', '#2A2A2E'),
  w('line2', 'Lines', 'Control borders', 'Buttons and chips with an outline.', '#D6D6D1', '#34343A'),
  w('field', 'Lines', 'Field borders', 'Text fields and selects.', '#8A8A84', '#6B6B72'),
  w('ink', 'Text', 'Text', 'Headings and body text.', '#1A1A1C', '#F2F2F3'),
  w('ink2', 'Text', 'Secondary text', 'Supporting lines under a title.', '#4D4D53', '#B8B8BE'),
  w('ink3', 'Text', 'Captions', 'Labels, meta and placeholders. Keep it readable on cards and wells.', '#6A6A70', '#8E8E96'),
  w('pri', 'Actions', 'Main button', 'The filled button for the main action.', '#1A1A1C', '#F2F2F3'),
  w('priT', 'Actions', 'Text on the main button', '', '#FFFFFF', '#1A1A1C', 'pri', 'on'),
  w('v', 'Accent', 'Accent', 'Selection, links, the highlighted bar in a chart.', '#2F5BD3', '#7C9CF0'),
  w('onV', 'Accent', 'Text on the accent', '', '#FFFFFF', '#111113', 'v', 'on'),
  w('vS', 'Accent', 'Accent fill', 'Soft fill behind accent text.', '#EDF2FD', '#1E2A47', 'v', 'soft'),
  w('vD', 'Accent', 'Accent text', 'Links and accent words on cards.', '#2449C8', '#C9D6FB', 'v', 'text'),
  w('v2', 'Accent', 'Accent chart bars', 'Bars and lines that are not highlighted.', '#C8D5F6', '#2C3A5E', 'v', 'line'),
  w('vL', 'Accent', 'Accent wash', 'Selected rows.', '#F2F5FC', '#172036', 'v', 'wash'),
  w('g', 'Good', 'Good', 'Paid, present, healthy.', '#1E7A45', '#6CC08E'),
  w('gS', 'Good', 'Good fill', '', '#E3F2E8', '#17301F', 'g', 'soft'),
  w('gD', 'Good', 'Good text', '', '#1E7A45', '#6CC08E', 'g', 'text'),
  w('a', 'Warning', 'Warning', 'Due soon, waiting, late. Never used as text.', '#E0A21B', '#C99419'),
  w('aS', 'Warning', 'Warning fill', '', '#FBF0D9', '#35290F', 'a', 'soft'),
  w('aD', 'Warning', 'Warning text', '', '#8F5400', '#E2B24F', 'a', 'text'),
  w('c', 'Danger', 'Danger', 'Overdue, absent, failed.', '#B42318', '#F0857A'),
  w('cS', 'Danger', 'Danger fill', '', '#FCEBE9', '#3A1D1A', 'c', 'soft'),
  w('cD', 'Danger', 'Danger text', '', '#B42318', '#F0857A', 'c', 'text'),
  w('cF', 'Danger', 'Delete button', 'The confirm button in a delete dialog.', '#B42318', '#B42318', 'c', 'solid'),
  w('onCF', 'Danger', 'Text on the delete button', '', '#FFFFFF', '#FFFFFF', 'cF', 'on'),
  w('present', 'Charts', 'Muted series', 'A chart series that is there for comparison.', '#B9B9B3', '#5A5A61'),
  w('scrim', 'Charts', 'Overlay', 'Behind dialogs and panels. Usually see-through.', '#1111136B', '#0000009E'),
];

const a = (key: string, group: string, label: string, help: string, light: string, dark: string, amoled?: string, from?: string, derive?: Derive): AppToken => ({ key, group, label, help, light, dark, amoled, from, derive });
const s = (key: string, group: string, label: string, help: string, value: string, from?: string, derive?: Derive): SharedToken => ({ key, group, label, help, value, from, derive });

/** The app's colours that differ between Chalk (light), Blackboard (dark) and AMOLED. AMOLED falls back to Blackboard. */
export const APP_TOKENS: AppToken[] = [
  a('chalk', 'Surfaces', 'Page', 'Behind everything.', '#EEF0EC', '#0D1814', '#000000'),
  a('paper', 'Surfaces', 'Cards', 'Cards, sheets and floating controls.', '#FBFCF9', '#14231E', '#0B110F'),
  a('paper2', 'Surfaces', 'Wells', 'Fields and recessed areas.', '#F3F5F1', '#1A2C26', '#111916'),
  a('ink', 'Text', 'Text', '', '#10201B', '#E8EFEA'),
  a('ink2', 'Text', 'Secondary text', '', '#36443F', '#BCC8C2'),
  a('ink3', 'Text', 'Captions', '', '#56635E', '#93A29B'),
  a('line', 'Lines', 'Hairlines', 'Usually see-through.', '#10201B17', '#E8EFEA17'),
  a('line2', 'Lines', 'Outlines', 'Usually see-through.', '#10201B2B', '#E8EFEA2B'),
  a('scrim', 'Lines', 'Overlay', 'Behind sheets.', '#0A141157', '#00000080'),
  a('shadow', 'Lines', 'Shadow', 'Under floating controls: the dock, top buttons, sheets.', '#10201B33', '#00000066'),
  a('mariText', 'Main action', 'Main colour as text', '', '#8A5600', '#F6BA45', undefined, 'mari', 'text'),
  a('mariSoft', 'Main action', 'Main colour fill', '', '#FCEBC4', '#3A2B0C', undefined, 'mari', 'soft'),
  a('okSoft', 'States', 'Good fill', '', '#DCEFE3', '#173A28', undefined, 'ok', 'soft'),
  a('badSoft', 'States', 'Bad fill', '', '#F8DED9', '#41201B', undefined, 'bad', 'soft'),
  a('badText', 'States', 'Bad as text', '', '#C23B2A', '#FF8A78', undefined, 'bad', 'text'),
  a('lateSoft', 'States', 'Late fill', '', '#FBEBCB', '#3B2C0F', undefined, 'late', 'soft'),
  a('lateText', 'States', 'Late as text', '', '#8F5400', '#F6BA45', undefined, 'late', 'text'),
];

/** The app's colours that are the same in every theme: the main action, the states, subjects and houses. */
export const APP_SHARED: SharedToken[] = [
  s('mari', 'Main action', 'Main action', 'The one most important button on a screen (Pay, Submit).', '#F2A007'),
  s('mariInk', 'Main action', 'Text on the main action', '', '#2B1C00', 'mari', 'on'),
  s('ok', 'States', 'Good', 'Present, paid, done.', '#23784A'),
  s('bad', 'States', 'Bad', 'Absent, overdue.', '#C23B2A'),
  s('late', 'States', 'Late', 'Late, due soon.', '#B06F00'),
  s('off', 'States', 'Off', 'Holidays and things that do not count.', '#6F7A76'),
  s('subject.maths', 'Subjects', 'Maths', '', '#2F5BD3'),
  s('subject.science', 'Subjects', 'Science', '', '#23784A'),
  s('subject.english', 'Subjects', 'English', '', '#C23B2A'),
  s('subject.hindi', 'Subjects', 'Hindi', '', '#B8306F'),
  s('subject.social', 'Subjects', 'Social studies', '', '#1C6F80'),
  s('subject.computer', 'Subjects', 'Computers', '', '#5E3A9C'),
  s('subject.art', 'Subjects', 'Art', '', '#7CC4E8'),
  s('subject.pe', 'Subjects', 'Sport', '', '#9BC53D'),
  s('subject.music', 'Subjects', 'Music', '', '#B8306F'),
  s('subject.other', 'Subjects', 'Any other subject', '', '#56635E'),
  s('house.1', 'Houses', 'House 1', 'Avatars of students in the first house.', '#23784A'),
  s('house.2', 'Houses', 'House 2', '', '#2F5BD3'),
  s('house.3', 'Houses', 'House 3', '', '#B8306F'),
  s('house.4', 'Houses', 'House 4', '', '#E0A81E'),
];

/** The school's brand colour until the console sets one. */
export const DEFAULT_BRAND = '#6A4CF5';

/** Subjects share one palette across the admin (timetable) and the app; on the web they are --subj-<id>. */
export const SUBJECTS = APP_SHARED.filter((t) => t.group === 'Subjects').map((t) => t.key.slice('subject.'.length));

/** Every key a theme may hold. */
export const THEME_KEYS = new Set<string>([
  ...WEB_TOKENS.flatMap((t) => [`web.light.${t.key}`, `web.dark.${t.key}`]),
  ...APP_TOKENS.flatMap((t) => [`app.light.${t.key}`, `app.dark.${t.key}`, `app.amoled.${t.key}`]),
  ...APP_SHARED.map((t) => `app.${t.key}`),
]);

/** Changed colours by key. Keys outside the catalogue are refused, so a typo never sits there unused. */
export const ThemeColorsSchema = z.record(z.string(), z.string().regex(HEX_COLOUR, 'Use a colour like #2F5BD3 (or #2F5BD380 when see-through)'))
  .refine((m) => Object.keys(m).every((k) => THEME_KEYS.has(k)), { message: 'That colour is not one the design uses.' });
export type ThemeColors = z.infer<typeof ThemeColorsSchema>;

// ── colour arithmetic (small and exact; no library) ─────────────────────────────────────────────────────────────────────
export interface Rgba { r: number; g: number; b: number; a: number }

export function parseHex(hex: string): Rgba {
  const h = hex.replace('#', '');
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
}

export function toHex({ r, g, b, a: al }: Rgba): string {
  const p = (x: number) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0');
  return `#${p(r)}${p(g)}${p(b)}${al < 1 ? p(al * 255) : ''}`.toUpperCase();
}

/** `t` of `x` over `1 - t` of `y`. */
export function mix(x: string, y: string, t: number): string {
  const p = parseHex(x), q = parseHex(y);
  return toHex({ r: p.r * t + q.r * (1 - t), g: p.g * t + q.g * (1 - t), b: p.b * t + q.b * (1 - t), a: 1 });
}

export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const c = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

/** WCAG contrast ratio, 1 to 21. See-through colours are judged as if opaque. */
export function contrast(x: string, y: string): number {
  const [hi, lo] = [luminance(x), luminance(y)].sort((m, n) => n - m) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** A colour moved toward `toward` until it reads at 4.5:1 on `ground` (or as far as it goes). */
function readable(base: string, ground: string, toward: string): string {
  for (let t = 1; t >= 0; t -= 0.05) {
    const c = mix(base, toward, t);
    if (contrast(c, ground) >= 4.5) return c;
  }
  return toward;
}

function derive(kind: Derive, base: string, ground: string, dark: boolean): string {
  switch (kind) {
    case 'on': return readableOn(base);
    case 'soft': return mix(base, ground, dark ? 0.22 : 0.12);
    case 'wash': return mix(base, ground, dark ? 0.12 : 0.06);
    case 'line': return mix(base, ground, dark ? 0.35 : 0.28);
    // Text sits on its soft fill as well as on cards; the fill is the harder of the two, so it is the one checked.
    case 'text': return readable(base, derive('soft', base, ground, dark), dark ? '#FFFFFF' : '#000000');
    case 'solid': return readable(base, '#FFFFFF', '#000000');
  }
}

/** A colour as the accent of one mode: as given in light, lifted until it reads on the dark cards in dark. */
export function accentFor(hex: string, mode: WebMode): string {
  return mode === 'light' ? hex.toUpperCase() : readable(hex, WEB_TOKENS.find((t) => t.key === 'card')!.dark, '#FFFFFF');
}

/** White or near-black, whichever reads better on `ground`. */
export function readableOn(ground: string): string {
  return contrast('#FFFFFF', ground) >= contrast('#1A1A1C', ground) ? '#FFFFFF' : '#1A1A1C';
}

// ── resolving: defaults, then changes, then colours that follow a changed base ─────────────────────────────────────────
/** The admin's or console's full palette for one mode. */
export function resolveWeb(changes: ThemeColors, mode: WebMode): Record<string, string> {
  const own = (k: string) => changes[`web.${mode}.${k}`];
  const out: Record<string, string> = {};
  for (const t of WEB_TOKENS) out[t.key] = own(t.key) ?? t[mode];
  for (const t of WEB_TOKENS) {
    if (!own(t.key) && t.from && t.derive && own(t.from)) out[t.key] = derive(t.derive, out[t.from]!, out.card!, mode === 'dark');
  }
  return out;
}

/** The CSS that puts a theme on every `.nest` on the page: only the colours that differ from the stylesheet. */
export function webThemeCss(changes: ThemeColors): string {
  const block = (mode: WebMode) => {
    const all = resolveWeb(changes, mode);
    return WEB_TOKENS.filter((t) => all[t.key]!.toUpperCase() !== t[mode].toUpperCase()).map((t) => `--${t.key}:${all[t.key]}`).join(';');
  };
  const subj = SUBJECTS.filter((id) => changes[`app.subject.${id}`]).map((id) => `--subj-${id}:${changes[`app.subject.${id}`]}`);
  const light = [block('light'), ...subj].filter(Boolean).join(';'), dark = block('dark');
  // The doubled class wins over nest.css's own `.nest` and `.nest.dark` without !important.
  return `${light ? `.nest.nest{${light}}` : ''}${dark ? `.nest.nest.dark{${dark}}` : ''}`;
}

/** The app's full palette for one theme, shared colours included (keys as in APP_TOKENS and APP_SHARED). */
export function resolveApp(changes: ThemeColors, mode: AppMode): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of APP_SHARED) out[t.key] = changes[`app.${t.key}`] ?? t.value;
  const own = (k: string) => changes[`app.${mode}.${k}`] ?? (mode === 'amoled' ? changes[`app.dark.${k}`] : undefined);
  for (const t of APP_TOKENS) out[t.key] = own(t.key) ?? (mode === 'amoled' ? t.amoled ?? t.dark : t[mode]);
  const changedBase = (k: string) => changes[`app.${k}`] !== undefined;
  for (const t of [...APP_SHARED, ...APP_TOKENS]) {
    const set = 'value' in t ? changes[`app.${t.key}`] : own(t.key);
    if (!set && t.from && t.derive && changedBase(t.from)) out[t.key] = derive(t.derive, out[t.from]!, out.paper!, mode !== 'light');
  }
  return out;
}
