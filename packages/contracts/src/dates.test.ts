import { describe, expect, it } from 'vitest';
import { addDays, inr, isSchoolDay, latestSchoolDay, lakhs, plural, schoolDaysEnding, weekday } from './dates.js';

describe('dates', () => {
  it('knows the weekday (14 Oct 2026 is a Wednesday)', () => {
    expect(weekday('2026-10-14')).toBe(3);
    expect(isSchoolDay('2026-10-18')).toBe(false);
  });
  it('steps back from a Sunday to Saturday', () => {
    expect(latestSchoolDay('2026-10-18')).toBe('2026-10-17');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });
  it('lists school days oldest first and skips Sundays', () => {
    expect(schoolDaysEnding('2026-10-14', 6)).toEqual(['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-12', '2026-10-13', '2026-10-14']);
  });
  it('groups rupees the Indian way', () => {
    expect(inr(1842300)).toBe('18,42,300');
    expect(inr(999)).toBe('999');
    expect(inr(100000)).toBe('1,00,000');
    expect(lakhs(210000)).toBe('2.1L');
  });
  it('names more than one the school’s way', () => {
    expect(['Student', 'Pupil', 'Class', 'Batch', 'Nursery', 'Day'].map(plural)).toEqual(['Students', 'Pupils', 'Classes', 'Batches', 'Nurseries', 'Days']);
  });
});
