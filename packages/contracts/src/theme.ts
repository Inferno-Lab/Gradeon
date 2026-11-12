import { SPECTRUM, hueContrast, hueOf, type HueMode, type SpectrumColour } from './hue.js';

// Colour helpers around the Hue engine (hue.ts). Nobody picks a colour token: the console sets the school's brand colour and
// every colour of its admin and app is worked out from that colour's hue.

export type WebMode = 'light' | 'dark';
export type AppMode = HueMode;

/** The school's brand colour until the console sets one. */
export const DEFAULT_BRAND = '#6A4CF5';

/** White or near-black, whichever reads better on `ground` (a colour someone chose, like a logo tile). */
export function readableOn(ground: string): string {
  return hueContrast('#FFFFFF', ground) >= hueContrast('#1A1A1C', ground) ? '#FFFFFF' : '#1A1A1C';
}

/** The spectrum colour nearest to a colour kept with the school's data (a subject's colour). */
export function spectrumFor(colour: string | null | undefined): SpectrumColour {
  if (!colour || !/^#[0-9a-fA-F]{6}$/.test(colour)) return 'teal';
  const h = hueOf(colour), dist = (x: number) => Math.min(Math.abs(x - h), 360 - Math.abs(x - h));
  return (Object.entries(SPECTRUM) as [SpectrumColour, number][]).sort((a, b) => dist(a[1]) - dist(b[1]))[0]![0];
}

/** Houses 1 to 4, in the spectrum. */
export const HOUSE_COLOURS: SpectrumColour[] = ['green', 'blue', 'pink', 'amber'];

/** A notice or event category's tone (kept in the school's settings as v, g, a or c) as a spectrum colour. */
export const TONE_COLOURS: Record<'v' | 'g' | 'a' | 'c', SpectrumColour> = { v: 'violet', g: 'green', a: 'amber', c: 'red' };

// A subject is drawn in the same spectrum colour in the admin and the app: well-known subjects by name, others by the tone kept with them.
const SUBJECT_COLOURS: Record<string, SpectrumColour> = { maths: 'blue', mathematics: 'blue', science: 'green', english: 'red', hindi: 'pink', social: 'teal', computer: 'indigo', computers: 'indigo', art: 'cyan', pe: 'lime', physical: 'lime', music: 'violet' };
const STORED_TONES: Record<string, SpectrumColour> = { v: 'violet', c: 'red', g: 'green', a: 'amber', b: 'blue', n: 'teal' };

/** The spectrum colour of a subject, from its name or the tone (or colour) kept with it. */
export function subjectColour(name: string, stored?: string | null): SpectrumColour {
  const k = (name.trim().toLowerCase().split(/\s+/)[0] ?? '');
  return SUBJECT_COLOURS[k] ?? (stored ? STORED_TONES[stored] : undefined) ?? spectrumFor(stored);
}
