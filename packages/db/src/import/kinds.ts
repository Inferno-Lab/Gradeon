import type pg from 'pg';
import { newId } from '../ids.js';

type Q = pg.Pool | pg.PoolClient;
export type Row = Record<string, string>;
type Rec = Record<string, unknown>;
/** One table's rows, keyed by `pk`. New rows are added whole; rows that exist change only in `cols` (an empty list leaves them be). */
export interface Write { table: string; pk: string[]; cols: string[]; rows: Rec[] }
type Total = { label: string; value: string };
/** One kind of data: what it looks up first, how it checks a row, and what it writes. */
export interface Impl<L> {
  load(db: Q, rows: Row[]): Promise<L>;
  check(r: Row, l: L): { key: string; errors: string[]; exists: boolean };
  writes(rows: Row[], l: L): Write[];
  totals(rows: Row[], l: L): Total[];
  export(db: Q): Promise<Row[]>;
  notes?(db: Q, rows: Row[], l: L): Promise<string[]>;
}

// ── reading what people type ───────────────────────────────────────────────
const lc = (s: string) => s.trim().toLowerCase();
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const digits = (s: string) => s.replace(/\D/g, '').slice(-10);
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** A day as 2026-04-18, from that or from the Indian 18/04/2026, 18-04-2026, 18.04.2026 or 18 Apr 2026. Null when it is not a real day. */
export function isoDay(v: string): string | null {
  const s = v.trim();
  let y = 0, m = 0, d = 0;
  let x = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (x) [y, m, d] = [Number(x[1]), Number(x[2]), Number(x[3])];
  else if ((x = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s))) [d, m, y] = [Number(x[1]), Number(x[2]), Number(x[3])];
  else if ((x = /^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s,]+(\d{4})$/.exec(s))) [d, m, y] = [Number(x[1]), MONTHS.indexOf(x[2]!.toLowerCase()) + 1, Number(x[3])];
  else return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null;
}
/** Whole rupees or counts: "18,500", "₹18500", "18500.00". */
export function whole(v: string): number | null {
  const n = Number(v.replace(/[₹,\s]/g, '').replace(/^rs\.?/i, ''));
  return v.trim() !== '' && Number.isInteger(n) ? n : null;
}
const yes = (v: string) => /^(y|yes|true|1|current|active)$/i.test(v.trim());
const hhmm = (v: string) => { const x = /^([01]?\d|2[0-3])[:.]([0-5]\d)$/.exec(v.trim()); return x ? `${x[1]!.padStart(2, '0')}:${x[2]}` : null; };
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const dayNum = (v: string) => { const s = lc(v); const n = Number(s); return Number.isInteger(n) && n >= 1 && n <= 7 ? n : DAYS.indexOf(s.slice(0, 3)) + 1 || null; };
const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10', xi: '11', xii: '12' };
const EARLY: Record<string, number> = { nursery: -2, lkg: -1, ukg: 0 };

/** "8 A", "8A", "VIII-A", "Class 8 - A" and "Std. 8 A" are one class. */
export function classKey(v: string): string {
  const t = v.toLowerCase().replace(/\b(class|std|standard|grade|section|sec)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  if (t[0] && ROMAN[t[0]]) t[0] = ROMAN[t[0]]!;
  return t.join('');
}
/** Grade and section from a class name, as numbers and capitals: "VIII-A" gives 8 and "A"; "LKG" gives -1 and "A". */
function gradeSection(v: string): { grade: number; section: string; label: string } | null {
  const x = /^(\d{1,2}|nursery|lkg|ukg)([a-z]{0,3})$/.exec(classKey(v));
  if (!x) return null;
  const grade = x[1]! in EARLY ? EARLY[x[1]!]! : Number(x[1]);
  const section = (x[2] || 'a').toUpperCase();
  return { grade, section, label: `${x[1]! in EARLY ? x[1]!.toUpperCase().replace('NURSERY', 'Nursery') : grade} ${section}` };
}
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const ist = (day: string, time = '00:00') => `${day}T${time}:00+05:30`;
const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const ok = (key: string, errors: string[], exists: boolean) => ({ key, errors, exists });
const kind = <L>(impl: Impl<L>) => impl;

// ── what most kinds look up ────────────────────────────────────────────────
type ClassRow = { id: string; name: string; grade: number; section: string; class_teacher_id: string | null; year_id: string };
async function classMap(db: Q) {
  const { rows } = await db.query<ClassRow>('select id, name, grade, section, class_teacher_id, year_id from classes');
  return new Map(rows.map((r) => [classKey(r.name), r]));
}
async function studentMap(db: Q) {
  const { rows } = await db.query<{ id: string; admission_no: string; class_id: string }>('select id, admission_no, class_id from students');
  return new Map(rows.map((r) => [lc(r.admission_no), r]));
}
async function subjectMap(db: Q) {
  const { rows } = await db.query<{ id: string; name: string; color: string; per_week: number }>('select id, name, color, per_week from subjects');
  return new Map(rows.map((r) => [norm(r.name), r]));
}
async function staffMap(db: Q) {
  const { rows } = await db.query<{ id: string; email: string }>("select id, email from users where kind = 'staff' and email is not null");
  return new Map(rows.map((r) => [lc(r.email), r.id]));
}
const needStudent = (m: Map<string, unknown>, adm: string) => (m.has(lc(adm)) ? [] : [`No student has admission number ${adm}: import students first.`]);

// ── the kinds ──────────────────────────────────────────────────────────────
type YearRow = { id: string; label: string; starts_on: string; ends_on: string; current: boolean };
const years = kind({
  async load(db) { return new Map((await db.query<YearRow>('select id, label, starts_on::text, ends_on::text, current from academic_years')).rows.map((r) => [lc(r.label), r])); },
  check(r, l) {
    const [s, e] = [isoDay(r.starts_on!), isoDay(r.ends_on!)];
    const errors = !s || !e ? ['Write the dates as 2026-04-01 or 01/04/2026.'] : s >= e ? ['The year ends before it starts.'] : [];
    return ok(lc(r.label!), errors, l.has(lc(r.label!)));
  },
  writes(rows, l) {
    const anyCurrent = rows.some((r) => yes(r.current!));
    const out: Rec[] = rows.map((r) => {
      const was = l.get(lc(r.label!));
      return { id: was?.id ?? newId('yr'), label: r.label, starts_on: isoDay(r.starts_on!), ends_on: isoDay(r.ends_on!), current: yes(r.current!) || (!anyCurrent && !!was?.current) };
    });
    // One year is current: marking one in the file unmarks the rest.
    if (anyCurrent) for (const y of l.values()) if (y.current && !rows.some((r) => lc(r.label!) === lc(y.label))) out.push({ ...y, current: false });
    return [{ table: 'academic_years', pk: ['id'], cols: ['starts_on', 'ends_on', 'current'], rows: out }];
  },
  totals: (rows) => [{ label: 'Years', value: String(rows.length) }, { label: 'Current', value: rows.find((r) => yes(r.current!))?.label ?? 'unchanged' }],
  async export(db) { return (await db.query<Row>("select id, label, starts_on::text, ends_on::text, case when current then 'yes' else '' end as current from academic_years order by starts_on")).rows; },
});

type TermLookups = { years: Map<string, string>; terms: Map<string, string> };
const terms = kind<TermLookups>({
  async load(db) {
    const y = (await db.query<{ id: string; label: string }>('select id, label from academic_years')).rows;
    const t = (await db.query<{ id: string; year_id: string; name: string }>('select id, year_id, name from terms')).rows;
    return { years: new Map(y.map((r) => [lc(r.label), r.id])), terms: new Map(t.map((r) => [`${r.year_id}|${lc(r.name)}`, r.id])) };
  },
  check(r, l) {
    const year = l.years.get(lc(r.year!));
    const [s, e] = [isoDay(r.starts_on!), isoDay(r.ends_on!)];
    const errors = [...(!year ? [`Year “${r.year}” is not set up: import academic years first.`] : []), ...(!s || !e ? ['Write the dates as 2026-04-01 or 01/04/2026.'] : s > e ? ['The term ends before it starts.'] : [])];
    return ok(`${year}|${lc(r.name!)}`, errors, l.terms.has(`${year}|${lc(r.name!)}`));
  },
  writes: (rows, l) => [{ table: 'terms', pk: ['id'], cols: ['starts_on', 'ends_on'], rows: rows.map((r) => {
    const year = l.years.get(lc(r.year!))!;
    return { id: l.terms.get(`${year}|${lc(r.name!)}`) ?? newId('trm'), year_id: year, name: r.name, starts_on: isoDay(r.starts_on!), ends_on: isoDay(r.ends_on!) };
  }) }],
  totals: (rows) => [{ label: 'Terms', value: String(rows.length) }],
  async export(db) { return (await db.query<Row>('select t.id, y.label as year, t.name, t.starts_on::text, t.ends_on::text from terms t join academic_years y on y.id = t.year_id order by t.starts_on')).rows; },
});

const holidays = kind<Map<string, string>>({
  async load(db) {
    const { rows } = await db.query<{ id: string; title: string; day: string }>("select id, title, (starts_at at time zone 'Asia/Kolkata')::date::text as day from events where kind = 'holiday'");
    return new Map(rows.map((r) => [`${lc(r.title)}|${r.day}`, r.id]));
  },
  check(r, l) {
    const s = isoDay(r.starts_on!);
    const e = r.ends_on ? isoDay(r.ends_on) : s;
    return ok(`${lc(r.name!)}|${s}`, !s || !e ? ['Write the dates as 2026-11-08 or 08/11/2026.'] : e < s ? ['The holiday ends before it starts.'] : [], l.has(`${lc(r.name!)}|${s}`));
  },
  writes: (rows, l) => [{ table: 'events', pk: ['id'], cols: ['ends_at'], rows: rows.map((r) => {
    const s = isoDay(r.starts_on!)!;
    return { id: l.get(`${lc(r.name!)}|${s}`) ?? newId('evt'), title: r.name, starts_at: ist(s), ends_at: ist(r.ends_on ? isoDay(r.ends_on)! : s, '23:59'), kind: 'holiday', note: '', audience: 'everyone', venue: '' };
  }) }],
  totals: (rows) => [{ label: 'Holidays', value: String(rows.length) }],
  async export(db) {
    return (await db.query<Row>("select id, title as name, (starts_at at time zone 'Asia/Kolkata')::date::text as starts_on, (ends_at at time zone 'Asia/Kolkata')::date::text as ends_on from events where kind = 'holiday' order by starts_at")).rows;
  },
});

type SubjectRow = { id: string; name: string; color: string; per_week: number };
const TONES = ['v', 'g', 'a', 'b', 'c', 'n'];
const subjects = kind<Map<string, SubjectRow>>({
  load: (db) => subjectMap(db),
  check: (r, l) => ok(norm(r.name!), r.per_week && whole(r.per_week) === null ? ['Periods a week is a whole number.'] : [], l.has(norm(r.name!))),
  writes: (rows, l) => {
    let n = l.size;
    return [{ table: 'subjects', pk: ['id'], cols: ['per_week'], rows: rows.map((r) => {
      const was = l.get(norm(r.name!));
      return { id: was?.id ?? newId('sub'), name: was?.name ?? r.name, color: was?.color ?? TONES[n++ % TONES.length], per_week: r.per_week ? whole(r.per_week) : was?.per_week ?? 5 };
    }) }];
  },
  totals: (rows) => [{ label: 'Subjects', value: String(rows.length) }],
  async export(db) { return (await db.query<Row>('select id, name, per_week::text from subjects order by name')).rows; },
});

type ClassLookups = { year: string | null; classes: Map<string, ClassRow>; staff: Map<string, string> };
const classes = kind<ClassLookups>({
  async load(db) {
    const year = (await db.query<{ id: string }>('select id from academic_years order by current desc, starts_on desc limit 1')).rows[0]?.id ?? null;
    return { year, classes: await classMap(db), staff: await staffMap(db) };
  },
  check(r, l) {
    const gs = gradeSection(r.grade && r.section ? `${r.grade} ${r.section}` : r.class!);
    const errors = [
      ...(!l.year ? ['Add the academic year first (Academic years, or School setup).'] : []),
      ...(!gs ? [`“${r.class}” does not read as a class: write it like 8 A, VIII-A or LKG B.`] : []),
      ...(r.class_teacher && !l.staff.has(lc(r.class_teacher)) ? [`No staff member has the email ${r.class_teacher}: import staff first.`] : []),
    ];
    return ok(classKey(r.class!), errors, l.classes.has(classKey(r.class!)));
  },
  writes: (rows, l) => [{ table: 'classes', pk: ['id'], cols: ['grade', 'section', 'class_teacher_id'], rows: rows.map((r) => {
    const gs = gradeSection(r.grade && r.section ? `${r.grade} ${r.section}` : r.class!)!;
    const was = l.classes.get(classKey(r.class!));
    return { id: was?.id ?? newId('cls'), year_id: was?.year_id ?? l.year, name: was?.name ?? gs.label, grade: gs.grade, section: gs.section, class_teacher_id: r.class_teacher ? l.staff.get(lc(r.class_teacher)) : was?.class_teacher_id ?? null };
  }) }],
  totals: (rows) => [{ label: 'Classes', value: String(rows.length) }, { label: 'With a class teacher', value: String(rows.filter((r) => r.class_teacher).length) }],
  async export(db) {
    return (await db.query<Row>("select c.id, c.name as class, c.grade::text, c.section, coalesce(u.email, '') as class_teacher from classes c left join users u on u.id = c.class_teacher_id order by c.grade, c.section")).rows;
  },
});

const PERIOD_KINDS = ['period', 'break', 'lunch', 'recess', 'assembly'];
const periods = kind<Set<number>>({
  async load(db) { return new Set((await db.query<{ idx: number }>('select idx from periods')).rows.map((r) => r.idx)); },
  check(r, l) {
    const n = whole(r.number!);
    const errors = [...(n === null || n < 0 ? ['Number is a whole number like 1.'] : []), ...(!hhmm(r.starts_at!) || !hhmm(r.ends_at!) ? ['Write times as 08:00.'] : hhmm(r.starts_at!)! >= hhmm(r.ends_at!)! ? ['The period ends before it starts.'] : []),
      ...(r.kind && !PERIOD_KINDS.includes(lc(r.kind)) ? [`Kind is one of ${PERIOD_KINDS.join(', ')}.`] : [])];
    return ok(String(n), errors, n !== null && l.has(n));
  },
  writes: (rows) => [{ table: 'periods', pk: ['idx'], cols: ['label', 'starts_at', 'ends_at', 'kind'], rows: rows.map((r) => ({ idx: whole(r.number!), label: r.label, starts_at: hhmm(r.starts_at!), ends_at: hhmm(r.ends_at!), kind: r.kind ? lc(r.kind) : 'period' })) }],
  totals: (rows) => [{ label: 'Periods', value: String(rows.filter((r) => !r.kind || lc(r.kind) === 'period').length) }, { label: 'Breaks', value: String(rows.filter((r) => r.kind && lc(r.kind) !== 'period').length) }],
  async export(db) { return (await db.query<Row>('select idx::text as id, idx::text as number, label, starts_at, ends_at, kind from periods order by idx')).rows; },
});

type UserRow = { id: string; kind: string; name: string; phone: string | null; email: string | null };
type StaffLookups = { byEmail: Map<string, UserRow>; byPhone: Map<string, string>; roles: Map<string, string>; subjects: Map<string, SubjectRow>; staff: Map<string, Rec> };
const staff = kind<StaffLookups>({
  async load(db) {
    const users = (await db.query<UserRow>('select id, kind, name, phone, email from users')).rows;
    const roles = (await db.query<{ id: string; key: string; name: string }>('select id, key, name from roles')).rows;
    const st = (await db.query<Rec & { user_id: string }>('select user_id, designation, department, joined_on::text from staff')).rows;
    return {
      byEmail: new Map(users.filter((u) => u.email).map((u) => [lc(u.email!), u])), byPhone: new Map(users.filter((u) => u.phone).map((u) => [digits(u.phone!), u.id])),
      roles: new Map(roles.flatMap((r) => [[lc(r.name), r.id], [lc(r.key), r.id]] as [string, string][])), subjects: await subjectMap(db), staff: new Map(st.map((s) => [s.user_id, s])),
    };
  },
  check(r, l) {
    const was = l.byEmail.get(lc(r.email!));
    const phoneOwner = r.phone ? l.byPhone.get(digits(r.phone)) : undefined;
    const unknown = (r.subjects ?? '').split(/[;|]/).map((s) => s.trim()).filter((s) => s && !l.subjects.has(norm(s)));
    const errors = [
      ...(!/^\S+@\S+\.\S+$/.test(r.email!) ? ['The email does not look right.'] : []),
      ...(was && was.kind !== 'staff' ? ['This email belongs to a family’s account.'] : []),
      ...(r.phone && digits(r.phone).length < 10 ? ['Use a 10-digit phone number.'] : []),
      ...(phoneOwner && phoneOwner !== was?.id ? ['Someone else already has this phone number.'] : []),
      ...(r.role && !l.roles.has(lc(r.role)) ? [`There is no role “${r.role}”: Gradeon makes roles in the console.`] : []),
      ...(unknown.length ? [`Subjects not set up yet: ${unknown.join(', ')}. Import subjects first.`] : []),
      ...(r.joined_on && !isoDay(r.joined_on) ? ['Write the joining date as 2019-06-10 or 10/06/2019.'] : []),
    ];
    return ok(lc(r.email!), errors, !!was);
  },
  writes(rows, l) {
    const users: Rec[] = [], st: Rec[] = [], roles: Rec[] = [], subs: Rec[] = [];
    for (const r of rows) {
      const was = l.byEmail.get(lc(r.email!));
      const id = was?.id ?? newId('usr');
      const old = l.staff.get(id);
      users.push({ id, kind: 'staff', name: r.name, email: r.email!.trim().toLowerCase(), phone: r.phone || was?.phone || null });
      st.push({ user_id: id, designation: r.designation || old?.designation || 'Teacher', department: r.department || old?.department || null, joined_on: r.joined_on ? isoDay(r.joined_on) : old?.joined_on ?? null });
      if (r.role) roles.push({ user_id: id, role_id: l.roles.get(lc(r.role)) });
      for (const s of (r.subjects ?? '').split(/[;|]/).map((x) => x.trim()).filter(Boolean)) subs.push({ user_id: id, subject_id: l.subjects.get(norm(s))!.id });
    }
    return [
      { table: 'users', pk: ['id'], cols: ['name', 'phone'], rows: users },
      { table: 'staff', pk: ['user_id'], cols: ['designation', 'department', 'joined_on'], rows: st },
      { table: 'user_roles', pk: ['user_id', 'role_id'], cols: [], rows: roles },
      { table: 'staff_subjects', pk: ['user_id', 'subject_id'], cols: [], rows: subs },
    ];
  },
  totals: (rows) => [{ label: 'Staff', value: String(rows.length) }, { label: 'With a role', value: String(rows.filter((r) => r.role).length) }],
  async notes(db) {
    const n = Number((await db.query<{ n: string }>("select count(*) n from users where kind = 'staff' and password_hash is null and invited_at is null")).rows[0]!.n);
    return n ? [`${n} staff are not invited yet. Their invitations go out from Go live, when the school is ready.`] : [];
  },
  async export(db) {
    return (await db.query<Row>(`select u.name, u.email, coalesce(u.phone, '') as phone, s.designation, coalesce(s.department, '') as department, coalesce(s.joined_on::text, '') as joined_on,
      coalesce((select string_agg(r.name, '; ') from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = u.id), '') as role,
      coalesce((select string_agg(sb.name, '; ' order by sb.name) from staff_subjects ss join subjects sb on sb.id = ss.subject_id where ss.user_id = u.id), '') as subjects
      from users u join staff s on s.user_id = u.id where u.kind = 'staff' order by u.name`)).rows;
  },
});

type GuardianRow = { id: string; user_id: string | null; name: string; phone: string | null; email: string | null; relation: string };
type StudentLookups = { classes: Map<string, ClassRow>; students: Map<string, Rec & { id: string }>; people: Map<string, Rec & { id: string }>; next: { year: string; n: number }; guardians: Map<string, GuardianRow>; users: Map<string, string>; links: Set<string> };
const person = (name: string, dob: string) => `${norm(name)}|${dob}`;
const STATUS: Record<string, string> = { active: 'active', inactive: 'inactive', left: 'inactive', tc: 'inactive', transferred: 'inactive', passedout: 'inactive' };
const students = kind<StudentLookups>({
  async load(db) {
    const st = (await db.query<Rec & { id: string; admission_no: string }>('select id, admission_no, name, class_id, roll_no, dob::text, blood_group, house, address, status, admitted_on::text from students')).rows;
    const gs = (await db.query<GuardianRow>('select id, user_id, name, phone, email, relation from guardians')).rows;
    const us = (await db.query<{ id: string; phone: string }>('select id, phone from users where phone is not null')).rows;
    const links = (await db.query<{ s: string; g: string }>('select student_id s, guardian_id g from student_guardians')).rows;
    const year = today().slice(0, 4);
    const last = (await db.query<{ n: number | null }>("select max(substring(admission_no from 6)::int) n from students where admission_no ~ ('^' || $1 || '/[0-9]{1,8}$')", [year])).rows[0]!.n;
    return {
      classes: await classMap(db), students: new Map(st.map((s) => [lc(s.admission_no), s])), people: new Map(st.map((s) => [person(String(s.name), String(s.dob)), s])),
      next: { year, n: Math.max(501, (last ?? 0) + 1) },
      guardians: new Map(gs.filter((g) => g.phone).map((g) => [digits(g.phone!), g])), users: new Map(us.map((u) => [digits(u.phone), u.id])), links: new Set(links.map((x) => `${x.s}|${x.g}`)),
    };
  },
  check(r, l) {
    const errors = [
      ...(!l.classes.has(classKey(r.class!)) ? [`Class “${r.class}” is not set up: import classes first.`] : []),
      ...(!isoDay(r.dob!) ? ['Write the date of birth as 2012-04-18 or 18/04/2012.'] : []),
      ...(r.admitted_on && !isoDay(r.admitted_on) ? ['Write the admission date as 2019-06-10 or 10/06/2019.'] : []),
      ...(digits(r.guardian_phone!).length < 10 ? ['The guardian’s phone needs 10 digits: families sign in with it.'] : []),
      ...(r.guardian2_phone && digits(r.guardian2_phone).length < 10 ? ['The second guardian’s phone needs 10 digits.'] : []),
      ...(r.status && !STATUS[norm(r.status)] ? ['Status is active or inactive (left, TC and transferred count as inactive).'] : []),
    ];
    // No admission number (a sheet of new children): the same child is the same name and date of birth, and Gradeon numbers new ones.
    if (!r.admission_no) return ok(`new|${person(r.name!, isoDay(r.dob!) ?? '')}`, errors, l.people.has(person(r.name!, isoDay(r.dob!) ?? '')));
    return ok(lc(r.admission_no), errors, l.students.has(lc(r.admission_no)));
  },
  writes(rows, l) {
    const users: Rec[] = [], guardians = new Map<string, Rec>(), studs: Rec[] = [], links: Rec[] = [];
    // One family, one guardian: brothers and sisters join the guardian who already has the phone, here or earlier in the file.
    const guardian = (name: string, phone: string, email: string, relation: string) => {
      const d = digits(phone);
      const planned = guardians.get(d);
      if (planned) return planned.id as string;
      const was = l.guardians.get(d);
      let userId = was?.user_id ?? l.users.get(d) ?? null;
      if (!userId) {
        userId = newId('usr');
        l.users.set(d, userId);
        users.push({ id: userId, kind: 'guardian', name, phone });
      }
      guardians.set(d, { id: was?.id ?? newId('gdn'), user_id: userId, name: was?.name ?? name, phone: was?.phone ?? phone, email: was?.email || email || null, relation: was?.relation ?? (relation || 'Parent') });
      return guardians.get(d)!.id as string;
    };
    for (const r of rows) {
      const was = r.admission_no ? l.students.get(lc(r.admission_no)) : l.people.get(person(r.name!, isoDay(r.dob!)!));
      const id = was?.id ?? newId('stu');
      studs.push({
        id, admission_no: r.admission_no?.trim() || (was?.admission_no as string | undefined) || `${l.next.year}/${String(l.next.n++).padStart(4, '0')}`, name: r.name, class_id: l.classes.get(classKey(r.class!))!.id, roll_no: r.roll_no || (was?.roll_no as string) || '', dob: isoDay(r.dob!),
        blood_group: r.blood_group || was?.blood_group || null, house: r.house || was?.house || null, address: r.address || was?.address || null,
        status: r.status ? STATUS[norm(r.status)] : was?.status ?? 'active', admitted_on: r.admitted_on ? isoDay(r.admitted_on) : was?.admitted_on ?? null,
      });
      const g1 = guardian(r.guardian_name!, r.guardian_phone!, r.guardian_email!, r.relation!);
      if (!l.links.has(`${id}|${g1}`)) links.push({ student_id: id, guardian_id: g1, is_primary: true });
      if (r.guardian2_phone) {
        const g2 = guardian(r.guardian2_name || 'Second guardian', r.guardian2_phone, '', r.guardian2_relation!);
        if (g2 !== g1 && !l.links.has(`${id}|${g2}`)) links.push({ student_id: id, guardian_id: g2, is_primary: false });
      }
    }
    return [
      { table: 'users', pk: ['id'], cols: [], rows: users },
      { table: 'guardians', pk: ['id'], cols: ['user_id', 'email'], rows: [...guardians.values()] },
      { table: 'students', pk: ['id'], cols: ['name', 'class_id', 'roll_no', 'dob', 'blood_group', 'house', 'address', 'status', 'admitted_on'], rows: studs },
      { table: 'student_guardians', pk: ['student_id', 'guardian_id'], cols: [], rows: links },
    ];
  },
  totals(rows) {
    const byClass = new Map<string, number>();
    for (const r of rows) byClass.set(classKey(r.class!), (byClass.get(classKey(r.class!)) ?? 0) + 1);
    return [{ label: 'Students', value: String(rows.length) }, { label: 'Classes', value: String(byClass.size) }, { label: 'Families (by phone)', value: String(new Set(rows.map((r) => digits(r.guardian_phone!))).size) }];
  },
  async export(db) {
    return (await db.query<Row>(`select s.admission_no, s.name, c.name as class, s.roll_no, s.dob::text, coalesce(s.blood_group, '') as blood_group, coalesce(s.house, '') as house, coalesce(s.address, '') as address,
      coalesce(s.admitted_on::text, '') as admitted_on, s.status,
      coalesce(g1.name, '') as guardian_name, coalesce(g1.phone, '') as guardian_phone, coalesce(g1.email, '') as guardian_email, coalesce(g1.relation, '') as relation,
      coalesce(g2.name, '') as guardian2_name, coalesce(g2.phone, '') as guardian2_phone, coalesce(g2.relation, '') as guardian2_relation
      from students s join classes c on c.id = s.class_id
      left join lateral (select g.* from student_guardians sg join guardians g on g.id = sg.guardian_id where sg.student_id = s.id and sg.is_primary limit 1) g1 on true
      left join lateral (select g.* from student_guardians sg join guardians g on g.id = sg.guardian_id where sg.student_id = s.id and not sg.is_primary limit 1) g2 on true
      order by c.grade, c.section, s.roll_no, s.name`)).rows;
  },
});

const STAGES = ['enquiry', 'applied', 'test', 'offer', 'enrolled', 'declined'];
const admissions = kind<Map<string, string>>({
  async load(db) {
    const { rows } = await db.query<{ id: string; child_name: string; phone: string }>('select id, child_name, phone from enquiries');
    return new Map(rows.map((r) => [`${norm(r.child_name)}|${digits(r.phone)}`, r.id]));
  },
  check(r, l) {
    const grade = whole(r.grade_sought!) ?? gradeSection(r.grade_sought!)?.grade ?? null;
    const errors = [...(grade === null ? ['Grade is a number like 3 (or LKG, UKG).'] : []), ...(r.stage && !STAGES.includes(lc(r.stage)) ? [`Stage is one of ${STAGES.join(', ')}.`] : []),
      ...(r.test_on && !isoDay(r.test_on) ? ['Write the test date as 2026-12-02 or 02/12/2026.'] : [])];
    const key = `${norm(r.child_name!)}|${digits(r.phone ?? '')}`;
    return ok(key, errors, l.has(key));
  },
  writes: (rows, l) => [{ table: 'enquiries', pk: ['id'], cols: ['grade_sought', 'guardian_name', 'email', 'source', 'stage', 'test_on', 'note'], rows: rows.map((r) => ({
    id: l.get(`${norm(r.child_name!)}|${digits(r.phone ?? '')}`) ?? newId('enq'), child_name: r.child_name, grade_sought: whole(r.grade_sought!) ?? gradeSection(r.grade_sought!)!.grade, guardian_name: r.guardian_name,
    phone: r.phone ?? '', email: r.email || null, source: r.source ? lc(r.source) : 'walk-in', stage: r.stage ? lc(r.stage) : 'enquiry', test_on: r.test_on ? isoDay(r.test_on) : null, note: r.note ?? '',
  })) }],
  totals: (rows) => STAGES.map((s) => ({ label: s[0]!.toUpperCase() + s.slice(1), value: String(rows.filter((r) => (r.stage ? lc(r.stage) : 'enquiry') === s).length) })).filter((t) => t.value !== '0'),
  async export(db) {
    return (await db.query<Row>("select child_name, grade_sought::text, guardian_name, phone, coalesce(email, '') as email, source, stage, coalesce(test_on::text, '') as test_on, note from enquiries order by created_at")).rows;
  },
});

const feeKey = (grade: string, title: string) => `${whole(grade) ?? 0}|${lc(title)}`;
const feeStructures = kind<Map<string, string>>({
  async load(db) {
    const { rows } = await db.query<{ id: string; grade: number | null; title: string }>('select id, grade, title from fee_structures');
    return new Map(rows.map((r) => [`${r.grade ?? 0}|${lc(r.title)}`, r.id]));
  },
  check(r, l) {
    const errors = [...(r.grade && whole(r.grade) === null ? ['Grade is a number like 8, or blank for every grade.'] : []), ...(whole(r.amount!) === null || whole(r.amount!)! < 0 ? ['Amount is whole rupees, like 18500.'] : []),
      ...(!isoDay(r.due_on!) ? ['Write the due date as 2026-11-10 or 10/11/2026.'] : [])];
    return ok(feeKey(r.grade ?? '', r.title!), errors, l.has(feeKey(r.grade ?? '', r.title!)));
  },
  writes: (rows, l) => [{ table: 'fee_structures', pk: ['id'], cols: ['head', 'amount', 'due_on'], rows: rows.map((r) => ({
    id: l.get(feeKey(r.grade ?? '', r.title!)) ?? newId('fst'), grade: r.grade ? whole(r.grade) : null, head: lc(r.head!), title: r.title, amount: whole(r.amount!), due_on: isoDay(r.due_on!),
  })) }],
  totals: (rows) => [{ label: 'Fees', value: String(rows.length) }, { label: 'Grades', value: String(new Set(rows.map((r) => r.grade || 'all')).size) }],
  async export(db) { return (await db.query<Row>("select id, coalesce(grade::text, '') as grade, head, title, amount::text, due_on::text from fee_structures order by grade nulls first, due_on, title")).rows; },
});

type InvoiceRow = { id: string; student_id: string; title: string; amount: number; waived_amount: number };
type DueLookups = { students: Map<string, { id: string }>; invoices: Map<string, InvoiceRow> };
async function invoiceMap(db: Q) {
  const { rows } = await db.query<InvoiceRow>('select id, student_id, title, amount, waived_amount from fee_invoices');
  return new Map(rows.map((r) => [`${r.student_id}|${lc(r.title)}`, r]));
}
const sumBy = (rows: Row[], key: (r: Row) => string, amount: (r: Row) => number) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + amount(r));
  return m;
};
const feeDues = kind<DueLookups>({
  async load(db) { return { students: await studentMap(db), invoices: await invoiceMap(db) }; },
  check(r, l) {
    const s = l.students.get(lc(r.admission_no!));
    const [amount, waived] = [whole(r.amount!), r.waived ? whole(r.waived) : 0];
    const errors = [...needStudent(l.students, r.admission_no!), ...(amount === null || amount < 0 ? ['Amount is whole rupees, like 18500.'] : []),
      ...(waived === null || waived < 0 || (amount !== null && waived > amount) ? ['Waived is whole rupees, no more than the amount.'] : []), ...(!isoDay(r.due_on!) ? ['Write the due date as 2026-11-10 or 10/11/2026.'] : [])];
    return ok(`${s?.id}|${lc(r.title!)}`, errors, !!s && l.invoices.has(`${s.id}|${lc(r.title!)}`));
  },
  writes: (rows, l) => [{ table: 'fee_invoices', pk: ['id'], cols: ['head', 'amount', 'due_on', 'waived_amount'], rows: rows.map((r) => {
    const sid = l.students.get(lc(r.admission_no!))!.id;
    return { id: l.invoices.get(`${sid}|${lc(r.title!)}`)?.id ?? newId('inv'), student_id: sid, head: lc(r.head!), title: r.title, amount: whole(r.amount!), due_on: isoDay(r.due_on!), waived_amount: r.waived ? whole(r.waived) : 0 };
  }) }],
  totals(rows) {
    const net = (r: Row) => whole(r.amount!)! - (r.waived ? whole(r.waived)! : 0);
    const heads = sumBy(rows, (r) => lc(r.head!), net);
    return [{ label: 'Dues', value: String(rows.length) }, { label: 'Total due', value: rupees([...heads.values()].reduce((a, b) => a + b, 0)) }, ...[...heads].map(([h, v]) => ({ label: `Due: ${h}`, value: rupees(v) }))];
  },
  async export(db) {
    return (await db.query<Row>('select s.admission_no, i.head, i.title, i.amount::text, i.due_on::text, i.waived_amount::text as waived from fee_invoices i join students s on s.id = i.student_id order by s.admission_no, i.due_on')).rows;
  },
});

type PayLookups = DueLookups & { payments: Map<string, string> };
const payments = kind<PayLookups>({
  async load(db) {
    const { rows } = await db.query<{ id: string; receipt_no: string }>('select id, receipt_no from payments');
    return { students: await studentMap(db), invoices: await invoiceMap(db), payments: new Map(rows.map((r) => [r.receipt_no, r.id])) };
  },
  check(r, l) {
    const s = l.students.get(lc(r.admission_no!));
    const amount = whole(r.amount!);
    const errors = [...needStudent(l.students, r.admission_no!), ...(s && !l.invoices.has(`${s.id}|${lc(r.fee_title!)}`) ? [`This student has no fee “${r.fee_title}”: import opening dues first.`] : []),
      ...(amount === null || amount <= 0 ? ['Amount is whole rupees, more than 0.'] : []), ...(!isoDay(r.paid_on!) ? ['Write the payment date as 2026-06-10 or 10/06/2026.'] : [])];
    return ok(r.receipt_no!.trim(), errors, l.payments.has(r.receipt_no!.trim()));
  },
  writes: (rows, l) => [{ table: 'payments', pk: ['id'], cols: ['invoice_id', 'amount', 'method', 'reference', 'paid_on'], rows: rows.map((r) => {
    const sid = l.students.get(lc(r.admission_no!))!.id;
    return { id: l.payments.get(r.receipt_no!.trim()) ?? newId('pay'), invoice_id: l.invoices.get(`${sid}|${lc(r.fee_title!)}`)!.id, amount: whole(r.amount!), method: r.method ? lc(r.method) : 'cash',
      reference: r.reference || null, receipt_no: r.receipt_no!.trim(), paid_on: isoDay(r.paid_on!) };
  }) }],
  totals(rows) {
    const methods = sumBy(rows, (r) => (r.method ? lc(r.method) : 'cash'), (r) => whole(r.amount!)!);
    return [{ label: 'Payments', value: String(rows.length) }, { label: 'Total paid', value: rupees([...methods.values()].reduce((a, b) => a + b, 0)) }, ...[...methods].map(([m, v]) => ({ label: `Paid by ${m}`, value: rupees(v) }))];
  },
  async notes(db) {
    const { rows } = await db.query<{ n: string }>(`select count(*) n from fee_invoices i where i.amount - i.waived_amount < (select coalesce(sum(p.amount), 0) from payments p where p.invoice_id = i.id)`);
    const over = Number(rows[0]!.n);
    return over ? [`${over} fees now show more paid than due: check them against the old system before go-live.`] : [];
  },
  async export(db) {
    return (await db.query<Row>(`select p.receipt_no, s.admission_no, i.title as fee_title, p.amount::text, p.paid_on::text, p.method, coalesce(p.reference, '') as reference
      from payments p join fee_invoices i on i.id = p.invoice_id join students s on s.id = i.student_id order by p.paid_on, p.receipt_no`)).rows;
  },
});

const MARK: Record<string, string> = { present: 'present', p: 'present', '1': 'present', absent: 'absent', a: 'absent', '0': 'absent', late: 'late', l: 'late', leave: 'leave', lv: 'leave', onleave: 'leave' };
type AttLookups = { students: Map<string, { id: string; class_id: string }>; sessions: Map<string, string>; marks: Map<string, string> };
const attendance = kind<AttLookups>({
  async load(db, rows) {
    const dates = [...new Set(rows.map((r) => isoDay(r.date!)).filter(Boolean))];
    const ss = (await db.query<{ id: string; class_id: string; date: string }>('select id, class_id, date::text from attendance_sessions where date = any($1::date[])', [dates])).rows;
    const ms = (await db.query<{ session_id: string; student_id: string; status: string }>('select session_id, student_id, status from attendance_marks where session_id = any($1)', [ss.map((s) => s.id)])).rows;
    return { students: await studentMap(db), sessions: new Map(ss.map((s) => [`${s.class_id}|${s.date}`, s.id])), marks: new Map(ms.map((m) => [`${m.session_id}|${m.student_id}`, m.status])) };
  },
  check(r, l) {
    const s = l.students.get(lc(r.admission_no!));
    const day = isoDay(r.date!);
    const errors = [...needStudent(l.students, r.admission_no!), ...(!day ? ['Write the date as 2026-10-14 or 14/10/2026.'] : day > today() ? ['That date has not happened yet.'] : []), ...(!MARK[norm(r.status!)] ? ['Status is present, absent, late or leave (P, A, L also work).'] : [])];
    const sess = s && day ? l.sessions.get(`${s.class_id}|${day}`) : undefined;
    return ok(`${day}|${lc(r.admission_no!)}`, errors, !!sess && l.marks.has(`${sess}|${s!.id}`));
  },
  writes(rows, l) {
    const sessions = new Map<string, Rec>();
    const marks: Rec[] = [];
    for (const r of rows) {
      const s = l.students.get(lc(r.admission_no!))!;
      const day = isoDay(r.date!)!;
      const k = `${s.class_id}|${day}`;
      const id = l.sessions.get(k) ?? (sessions.get(k)?.id as string | undefined) ?? newId('ses');
      if (!l.sessions.has(k)) sessions.set(k, { id, class_id: s.class_id, date: day, submitted_at: ist(day, '09:00') });
      marks.push({ session_id: id, student_id: s.id, status: MARK[norm(r.status!)] });
    }
    return [{ table: 'attendance_sessions', pk: ['id'], cols: [], rows: [...sessions.values()] }, { table: 'attendance_marks', pk: ['session_id', 'student_id'], cols: ['status'], rows: marks }];
  },
  totals(rows) {
    const present = rows.filter((r) => ['present', 'late'].includes(MARK[norm(r.status!)]!)).length;
    return [{ label: 'School days', value: String(new Set(rows.map((r) => isoDay(r.date!))).size) }, { label: 'Marks', value: String(rows.length) }, { label: 'Present or late', value: rows.length ? `${Math.round((present / rows.length) * 1000) / 10}%` : '–' }];
  },
  async export(db) {
    return (await db.query<Row>('select s.date::text, st.admission_no, m.status from attendance_marks m join attendance_sessions s on s.id = m.session_id join students st on st.id = m.student_id order by s.date, st.admission_no')).rows;
  },
});

type MarkLookups = { classes: Map<string, ClassRow>; subjects: Map<string, SubjectRow>; students: Map<string, { id: string }>; exams: Map<string, string>; examSubjects: Set<string>; marks: Set<string> };
const ABSENT = ['ab', 'absent', 'a', '-'];
const marks = kind<MarkLookups>({
  async load(db) {
    const ex = (await db.query<{ id: string; name: string; class_id: string }>('select id, name, class_id from exams')).rows;
    const es = (await db.query<{ exam_id: string; subject_id: string }>('select exam_id, subject_id from exam_subjects')).rows;
    const em = (await db.query<{ exam_id: string; student_id: string; subject_id: string }>('select exam_id, student_id, subject_id from exam_marks')).rows;
    return { classes: await classMap(db), subjects: await subjectMap(db), students: await studentMap(db), exams: new Map(ex.map((e) => [`${lc(e.name)}|${e.class_id}`, e.id])),
      examSubjects: new Set(es.map((e) => `${e.exam_id}|${e.subject_id}`)), marks: new Set(em.map((m) => `${m.exam_id}|${m.student_id}|${m.subject_id}`)) };
  },
  check(r, l) {
    const cls = l.classes.get(classKey(r.class!));
    const sub = l.subjects.get(norm(r.subject!));
    const st = l.students.get(lc(r.admission_no!));
    const max = r.max_marks ? whole(r.max_marks) : 100;
    const absent = ABSENT.includes(lc(r.score!));
    const score = absent ? 0 : Number(r.score);
    const errors = [...(!cls ? [`Class “${r.class}” is not set up: import classes first.`] : []), ...(!sub ? [`Subject “${r.subject}” is not set up: import subjects first.`] : []), ...needStudent(l.students, r.admission_no!),
      ...(max === null || max <= 0 ? ['Out of is a whole number, like 100.'] : []), ...(!absent && (!Number.isFinite(score) || score < 0 || (max !== null && score > max)) ? [`Score is a number from 0 to ${max ?? 100}, or AB for absent.`] : []),
      ...[r.starts_on, r.ends_on].filter((d) => d && !isoDay(d)).map(() => 'Write exam dates as 2026-07-20 or 20/07/2026.')];
    const exam = cls ? l.exams.get(`${lc(r.exam!)}|${cls.id}`) : undefined;
    return ok(`${lc(r.exam!)}|${classKey(r.class!)}|${norm(r.subject!)}|${lc(r.admission_no!)}`, errors, !!exam && !!st && !!sub && l.marks.has(`${exam}|${st.id}|${sub.id}`));
  },
  writes(rows, l) {
    const exams = new Map<string, Rec>(), subs = new Map<string, Rec>(), mk: Rec[] = [];
    for (const r of rows) {
      const cls = l.classes.get(classKey(r.class!))!;
      const k = `${lc(r.exam!)}|${cls.id}`;
      const examId = l.exams.get(k) ?? (exams.get(k)?.id as string | undefined) ?? newId('exm');
      if (!l.exams.has(k) && !exams.has(k)) {
        const from = r.starts_on ? isoDay(r.starts_on)! : today();
        exams.set(k, { id: examId, name: r.exam, class_id: cls.id, starts_on: from, ends_on: r.ends_on ? isoDay(r.ends_on) : from, status: 'published', published_at: new Date().toISOString() });
      }
      const subjectId = l.subjects.get(norm(r.subject!))!.id;
      if (!subs.has(`${examId}|${subjectId}`)) subs.set(`${examId}|${subjectId}`, { exam_id: examId, subject_id: subjectId, max_marks: r.max_marks ? whole(r.max_marks) : 100 });
      const absent = ABSENT.includes(lc(r.score!));
      mk.push({ exam_id: examId, student_id: l.students.get(lc(r.admission_no!))!.id, subject_id: subjectId, score: absent ? null : r.score!.trim(), absent });
    }
    return [
      { table: 'exams', pk: ['id'], cols: [], rows: [...exams.values()] },
      { table: 'exam_subjects', pk: ['exam_id', 'subject_id'], cols: ['max_marks'], rows: [...subs.values()] },
      { table: 'exam_marks', pk: ['exam_id', 'student_id', 'subject_id'], cols: ['score', 'absent'], rows: mk },
    ];
  },
  totals: (rows) => [{ label: 'Exams', value: String(new Set(rows.map((r) => `${lc(r.exam!)}|${classKey(r.class!)}`)).size) }, { label: 'Marks', value: String(rows.length) }, { label: 'Absent', value: String(rows.filter((r) => ABSENT.includes(lc(r.score!))).length) }],
  async export(db) {
    return (await db.query<Row>(`select e.name as exam, c.name as class, sb.name as subject, s.admission_no, case when m.absent then 'AB' else coalesce(m.score::text, '') end as score, es.max_marks::text, e.starts_on::text, e.ends_on::text
      from exam_marks m join exams e on e.id = m.exam_id join classes c on c.id = e.class_id join subjects sb on sb.id = m.subject_id join students s on s.id = m.student_id
      left join exam_subjects es on es.exam_id = m.exam_id and es.subject_id = m.subject_id order by e.starts_on, c.grade, c.section, sb.name, s.admission_no`)).rows;
  },
});

type SlotLookups = { classes: Map<string, ClassRow>; subjects: Map<string, SubjectRow>; staff: Map<string, string>; periods: Set<number>; slots: Map<string, string> };
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const timetable = kind<SlotLookups>({
  async load(db) {
    const ps = (await db.query<{ idx: number }>('select idx from periods')).rows;
    const sl = (await db.query<{ id: string; class_id: string; day: number; period: number }>('select id, class_id, day, period from timetable_slots')).rows;
    return { classes: await classMap(db), subjects: await subjectMap(db), staff: await staffMap(db), periods: new Set(ps.map((p) => p.idx)), slots: new Map(sl.map((s) => [`${s.class_id}|${s.day}|${s.period}`, s.id])) };
  },
  check(r, l) {
    const cls = l.classes.get(classKey(r.class!));
    const [day, period] = [dayNum(r.day!), whole(r.period!)];
    const errors = [...(!cls ? [`Class “${r.class}” is not set up: import classes first.`] : []), ...(!day ? ['Day is a weekday name or 1 (Monday) to 7 (Sunday).'] : []),
      ...(period === null || !l.periods.has(period) ? [`Period ${r.period} is not set up: import periods and bells first.`] : []), ...(!l.subjects.has(norm(r.subject!)) ? [`Subject “${r.subject}” is not set up: import subjects first.`] : []),
      ...(!l.staff.has(lc(r.teacher!)) ? [`No staff member has the email ${r.teacher}: import staff first.`] : [])];
    return ok(`${cls?.id}|${day}|${period}`, errors, !!cls && l.slots.has(`${cls.id}|${day}|${period}`));
  },
  writes: (rows, l) => [{ table: 'timetable_slots', pk: ['id'], cols: ['subject_id', 'teacher_id', 'room', 'published_teacher_id', 'published_subject_id'], rows: rows.map((r) => {
    const cls = l.classes.get(classKey(r.class!))!;
    const [day, period] = [dayNum(r.day!)!, whole(r.period!)!];
    const [subjectId, teacherId] = [l.subjects.get(norm(r.subject!))!.id, l.staff.get(lc(r.teacher!))!];
    return { id: l.slots.get(`${cls.id}|${day}|${period}`) ?? newId('slt'), class_id: cls.id, day, period, subject_id: subjectId, teacher_id: teacherId, room: r.room || null, published_teacher_id: teacherId, published_subject_id: subjectId };
  }) }],
  totals: (rows) => [{ label: 'Lessons', value: String(rows.length) }, { label: 'Classes', value: String(new Set(rows.map((r) => classKey(r.class!))).size) }, { label: 'Teachers', value: String(new Set(rows.map((r) => lc(r.teacher!))).size) }],
  async export(db) {
    return (await db.query<Row & { d: number }>(`select c.name as class, t.day as d, t.period::text, sb.name as subject, u.email as teacher, coalesce(t.room, '') as room
      from timetable_slots t join classes c on c.id = t.class_id join subjects sb on sb.id = t.subject_id join users u on u.id = t.teacher_id order by c.grade, c.section, t.day, t.period`)).rows.map(({ d, ...r }) => ({ ...r, day: DAY_NAMES[d - 1] ?? String(d) }));
  },
});

type LoanLookups = { students: Map<string, { id: string }>; loans: Map<string, string> };
const libraryLoans = kind<LoanLookups>({
  async load(db) {
    const { rows } = await db.query<{ id: string; student_id: string; title: string; due_on: string }>('select id, student_id, title, due_on::text from library_loans');
    return { students: await studentMap(db), loans: new Map(rows.map((r) => [`${r.student_id}|${lc(r.title)}|${r.due_on}`, r.id])) };
  },
  check(r, l) {
    const s = l.students.get(lc(r.admission_no!));
    const due = isoDay(r.due_on!);
    const errors = [...needStudent(l.students, r.admission_no!), ...(!due ? ['Write the due date as 2026-11-20 or 20/11/2026.'] : []), ...(r.returned_on && !isoDay(r.returned_on) ? ['Write the return date as 2026-11-18 or 18/11/2026.'] : [])];
    return ok(`${s?.id}|${lc(r.title!)}|${due}`, errors, !!s && l.loans.has(`${s.id}|${lc(r.title!)}|${due}`));
  },
  writes: (rows, l) => [{ table: 'library_loans', pk: ['id'], cols: ['returned_on'], rows: rows.map((r) => {
    const sid = l.students.get(lc(r.admission_no!))!.id;
    const due = isoDay(r.due_on!)!;
    return { id: l.loans.get(`${sid}|${lc(r.title!)}|${due}`) ?? newId('lon'), student_id: sid, title: r.title, due_on: due, returned_on: r.returned_on ? isoDay(r.returned_on) : null };
  }) }],
  totals: (rows) => [{ label: 'Loans', value: String(rows.length) }, { label: 'Still out', value: String(rows.filter((r) => !r.returned_on).length) }],
  async export(db) {
    return (await db.query<Row>("select s.admission_no, l.title, l.due_on::text, coalesce(l.returned_on::text, '') as returned_on from library_loans l join students s on s.id = l.student_id order by l.due_on")).rows;
  },
});

type RouteLookups = { students: Map<string, { id: string }>; routes: Set<string> };
const transport = kind<RouteLookups>({
  async load(db) {
    const { rows } = await db.query<{ student_id: string }>('select student_id from transport_assignments');
    return { students: await studentMap(db), routes: new Set(rows.map((r) => r.student_id)) };
  },
  check(r, l) {
    const s = l.students.get(lc(r.admission_no!));
    return ok(lc(r.admission_no!), needStudent(l.students, r.admission_no!), !!s && l.routes.has(s.id));
  },
  writes: (rows, l) => [{ table: 'transport_assignments', pk: ['student_id'], cols: ['route'], rows: rows.map((r) => ({ student_id: l.students.get(lc(r.admission_no!))!.id, route: r.route!.trim() })) }],
  totals: (rows) => [{ label: 'Students on a bus', value: String(rows.length) }, { label: 'Routes', value: String(new Set(rows.map((r) => lc(r.route!))).size) }],
  async export(db) { return (await db.query<Row>('select s.admission_no, t.route from transport_assignments t join students s on s.id = t.student_id order by t.route, s.admission_no')).rows; },
});

export const KINDS: Record<string, Impl<never>> = {
  years, terms, holidays, subjects, classes, periods, staff, students, admissions, fee_structures: feeStructures, fee_dues: feeDues, payments, attendance, marks, timetable, library_loans: libraryLoans, transport,
} as unknown as Record<string, Impl<never>>;
