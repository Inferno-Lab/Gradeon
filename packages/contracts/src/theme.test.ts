import { describe, expect, it } from 'vitest';
import { APP_SHARED, APP_TOKENS, THEME_KEYS, ThemeColorsSchema, WEB_TOKENS, contrast, mix, resolveApp, resolveWeb, webThemeCss } from './theme.js';

describe('theme', () => {
  it('resolves to the defaults when nothing changed', () => {
    expect(resolveWeb({}, 'dark').v).toBe('#7C9CF0');
    expect(webThemeCss({})).toBe('');
    expect(resolveApp({}, 'amoled').chalk).toBe('#000000');
    expect(resolveApp({}, 'amoled').ink).toBe('#E8EFEA');
  });

  it('carries fills and text along with a changed base, unless they are changed too', () => {
    const t = resolveWeb({ 'web.light.v': '#0F7C86' }, 'light');
    expect(t.v).toBe('#0F7C86');
    expect(t.vS).not.toBe('#EDF2FD');
    expect(contrast(t.vD!, t.card!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.onV!, t.v!)).toBeGreaterThanOrEqual(4.5);
    expect(resolveWeb({ 'web.light.v': '#0F7C86', 'web.light.vS': '#ABCDEF' }, 'light').vS).toBe('#ABCDEF');
    // The other mode is untouched.
    expect(resolveWeb({ 'web.light.v': '#0F7C86' }, 'dark').vS).toBe('#1E2A47');
    const css = webThemeCss({ 'web.light.v': '#0F7C86' });
    expect(css.startsWith('.nest.nest{')).toBe(true);
    expect(css).toContain('--v:#0F7C86');
    expect(css).not.toContain('.dark');
  });

  it('lets AMOLED follow a changed Blackboard colour, and changed shared colours reach every theme', () => {
    expect(resolveApp({ 'app.dark.ink': '#FFFFFF' }, 'amoled').ink).toBe('#FFFFFF');
    const m = resolveApp({ 'app.mari': '#6A4CF5' }, 'light');
    expect(m.mari).toBe('#6A4CF5');
    expect(m.mariInk).toBe('#FFFFFF');
    expect(resolveApp({ 'app.mari': '#6A4CF5' }, 'dark').mariSoft).not.toBe('#3A2B0C');
  });

  it('accepts only colours the design uses', () => {
    expect(ThemeColorsSchema.safeParse({ 'web.dark.ink': '#FFFFFF', 'app.subject.art': '#7CC4E880' }).success).toBe(true);
    expect(ThemeColorsSchema.safeParse({ 'web.dark.nope': '#FFFFFF' }).success).toBe(false);
    expect(ThemeColorsSchema.safeParse({ 'web.dark.ink': 'white' }).success).toBe(false);
    expect(THEME_KEYS.size).toBe(WEB_TOKENS.length * 2 + APP_TOKENS.length * 3 + APP_SHARED.length);
  });

  it('mixes and measures like the specs', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });
});
