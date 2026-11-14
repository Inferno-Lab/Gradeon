import { describe, expect, it } from 'vitest';
import { HUE_PAIRS, SPECTRUM_COLOURS, WEB_NEUTRALS, hueContrast, hueCss, hueOf, hueTokens, spectrumTokens, type HueMode } from './hue.js';

describe('Gradeon Hue', () => {
  it('gives the approved colours for a seed', () => {
    expect(hueTokens(162, 'light').deep).toBe('#0B281B');
    expect(hueTokens(162, 'dark').brand).toBe('#55F1B0');
  });

  // 360 hues × 3 modes: slow under a loaded machine, so it gets more time than the default 5 s.
  it('reaches WCAG AA on every pair for every hue in every mode, so the console can accept any colour', { timeout: 60_000 }, () => {
    for (let h = 0; h < 360; h++) for (const mode of ['light', 'dark', 'amoled'] as HueMode[]) {
      const t = hueTokens(h, mode);
      for (const [a, b, min] of HUE_PAIRS) expect(hueContrast(t[a]!, t[b]!), `${h} ${mode} ${a}/${b}`).toBeGreaterThanOrEqual(min);
      for (const c of SPECTRUM_COLOURS) { const s = spectrumTokens(c, mode); expect(hueContrast(s.ci, s.cs)).toBeGreaterThanOrEqual(4.5); }
    }
  });

  it('reads the seed from a brand colour', () => {
    expect(hueOf('#6A4CF5')).toBeGreaterThan(270);
    expect(hueOf('#6A4CF5')).toBeLessThan(295);
    expect(hueOf('#2F5BD3')).toBeGreaterThan(255);
    expect(hueOf('#888888')).toBe(262);
  });

  it('writes CSS for the light and dark sheets and the spectrum', () => {
    const css = hueCss(162);
    expect(css).toContain('.nest{--bg:');
    expect(css).toContain('.nest.dark,.nest .dark{');
    expect(css).toContain('.nest .sp-blue{--c:');
  });

  it('never tints the web pages and cards with the school colour, and keeps their text readable', () => {
    for (const h of [0, 60, 90, 150, 284]) {
      const css = hueCss(h);
      for (const k of ['bd', 'bg', 's1', 's2', 'line', 'ink'] as const) expect(css).toContain(`--${k}:${WEB_NEUTRALS.light[k === 'ink' ? 't1' : k]}`);
    }
    for (const mode of ['light', 'dark', 'amoled'] as HueMode[]) {
      const n = WEB_NEUTRALS[mode];
      for (const [t, g] of [['t1', 'bg'], ['t1', 's1'], ['t2', 's1'], ['on-deep', 'deep']]) expect(hueContrast(n[t]!, n[g]!)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
