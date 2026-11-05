import { describe, expect, it } from 'vitest';
import { rollDigits } from './digits';
import { tintFor } from './tints';
import { evenTarget, share } from './EvenRows';

describe('evenTarget', () => {
  it('shrinks the taller list to match a column that cannot shrink', () => {
    expect(evenTarget([{ h: 600, area: null }, { h: 760, area: 500 }])).toEqual([-1, 340]);
  });
  it('leaves a list alone when its column is already the shorter one', () => {
    expect(evenTarget([{ h: 600, area: null }, { h: 500, area: 300 }])).toEqual([-1, -1]);
  });
  it('brings two lists down to the shorter column, never below the floor', () => {
    expect(evenTarget([{ h: 900, area: 700 }, { h: 650, area: 400 }])).toEqual([450, -1]);
    expect(evenTarget([{ h: 900, area: 200 }, { h: 300, area: 100 }])).toEqual([96, -1]);
  });
  it('takes height from the tallest list first and keeps every list above the floor', () => {
    expect(share([232, 176], -109)).toEqual([123, 176]);
    expect(share([232, 176], -200)).toEqual([96, 112]);
  });
  it('lets two lists grow into the room under the last row, as far as the shorter one has rows', () => {
    expect(evenTarget([{ h: 650, area: 600, content: 1200 }, { h: 650, area: 540, content: 700 }], 96, 120)).toEqual([720, 660]);
    expect(evenTarget([{ h: 648, area: 648, content: 704 }, { h: 700, area: 594, content: 2728 }], 96, 20)).toEqual([704, 598]);
  });
  it('shows more of a capped list to reach a taller column, but never more than its rows', () => {
    expect(evenTarget([{ h: 736, area: null }, { h: 698, area: 496, content: 640 }])).toEqual([-1, 534]);
    expect(evenTarget([{ h: 736, area: null }, { h: 600, area: 300, content: 320 }])).toEqual([-1, 320]);
    expect(share([300, 200], 50, [320, 400])).toEqual([300, 250]);
  });
});

describe('rollDigits', () => {
  it('rolls digits and leaves separators still', () => {
    const d = rollDigits('1,498');
    expect(d.map((x) => x.c).join('')).toBe('1,498');
    expect(d.filter((x) => x.isD)).toHaveLength(4);
    expect(d[1]).toMatchObject({ isD: false, notD: true, y: 0 });
    expect(d[0]!.y).toBeCloseTo(1.1);
    expect(d[4]!.y).toBeCloseTo(8.8);
  });
});

describe('tintFor', () => {
  it('gives everyone the same neutral avatar, from the theme', () => {
    for (const name of ['', 'Neha Menon', '🙂']) expect(tintFor(name)).toEqual({ bg: 'var(--sunk)', fg: 'var(--ink2)' });
  });
});
