/** Schools here run on Indian time. All "today" logic goes through these helpers so the API and the UIs agree. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function istNow(now: Date = new Date()): Date {
  return new Date(now.getTime() + IST_OFFSET_MS);
}

/** YYYY-MM-DD for the given instant in IST. */
export function istToday(now: Date = new Date()): string {
  return istNow(now).toISOString().slice(0, 10);
}

/** Minutes since midnight in IST. */
export function istMinutes(now: Date = new Date()): number {
  const d = istNow(now);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function parseDay(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 Sunday .. 6 Saturday. */
export function weekday(day: string): number {
  return parseDay(day).getUTCDay();
}

export const DEFAULT_OFF_DAYS: readonly number[] = [0];

export function isSchoolDay(day: string, offDays: readonly number[] = DEFAULT_OFF_DAYS): boolean {
  return !offDays.includes(weekday(day));
}

/** The latest school day on or before `day`. */
export function latestSchoolDay(day: string, offDays: readonly number[] = DEFAULT_OFF_DAYS): string {
  let d = day;
  for (let i = 0; i < 8 && !isSchoolDay(d, offDays); i++) d = addDays(d, -1);
  return d;
}

/** The `n` school days ending at `end` (inclusive if it is one), oldest first. */
export function schoolDaysEnding(end: string, n: number, offDays: readonly number[] = DEFAULT_OFF_DAYS): string[] {
  const out: string[] = [];
  let d = latestSchoolDay(end, offDays);
  while (out.length < n) {
    out.push(d);
    d = latestSchoolDay(addDays(d, -1), offDays);
  }
  return out.reverse();
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dayName(day: string, short = false): string {
  const n = DAY_NAMES[weekday(day)]!;
  return short ? n.slice(0, 3) : n;
}

/** "14 Oct" */
export function dayMonth(day: string): string {
  const d = parseDay(day);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "Wed 14 Oct" */
export function dayLabel(day: string): string {
  return `${dayName(day, true)} ${dayMonth(day)}`;
}

/** Indian digit grouping: 1842300 -> "18,42,300". */
/** "Pupil" becomes "Pupils"; a word that already ends in s is left alone. ponytail: English plurals only; the school's words are English. */
export const plural = (word: string): string => (/s$/i.test(word) ? word : `${word}s`);

export function inr(n: number): string {
  const x = String(Math.round(Math.abs(n)));
  const last = x.slice(-3);
  const rest = x.slice(0, -3);
  const body = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last}` : last;
  return n < 0 ? `-${body}` : body;
}

/** Lakhs with one decimal, "1.8L", for compact chart labels. */
export function lakhs(n: number): string {
  const v = n / 100000;
  return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}L`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}
