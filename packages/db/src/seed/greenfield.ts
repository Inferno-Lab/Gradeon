import { ROLE_TEMPLATES, addDays, istToday, latestSchoolDay, schoolDaysEnding } from '@gradeon/contracts';
import type { Pool, PoolClient } from 'pg';
import { newId } from '../ids.js';
import { bulkInsert } from './bulk.js';
import { seedModulesDemo } from './modules.js';
import { AREAS, BLOOD, FIRST_FEMALE, FIRST_MALE, HOUSES, LAST, rng, type Rng } from './names.js';

export interface SeedInput {
  school: {
    name: string;
    shortName: string;
    tagline: string;
    place?: string;
    phone: string;
    email: string;
    address: string;
    color: string;
    logoText: string;
    language: 'en' | 'hi' | 'mr';
  };
  admin: { name: string; email: string; phone: string; passwordHash: string };
  modules: string[];
  demoMode: boolean;
  /** `empty` is a brand-new school: roles, periods and settings only. `demo` adds a full year of sample data. */
  data: 'empty' | 'demo';
  /** Hash used for every demo staff and guardian login. Needed for `demo`. */
  demoPasswordHash?: string;
  today?: string;
}

export interface SeedReport {
  students: number;
  classes: number;
  staff: number;
  ms: number;
}

const SUBJECTS: { id: string; key: string; name: string; color: string; perWeek: number; teachers: number }[] = [
  { id: 'sub_maths', key: 'M', name: 'Maths', color: 'v', perWeek: 7, teachers: 13 },
  { id: 'sub_english', key: 'E', name: 'English', color: 'c', perWeek: 7, teachers: 13 },
  { id: 'sub_science', key: 'S', name: 'Science', color: 'g', perWeek: 6, teachers: 11 },
  { id: 'sub_hindi', key: 'H', name: 'Hindi', color: 'a', perWeek: 5, teachers: 9 },
  { id: 'sub_social', key: 'So', name: 'Social', color: 'b', perWeek: 5, teachers: 9 },
  { id: 'sub_computer', key: 'C', name: 'Computer', color: 'n', perWeek: 5, teachers: 9 },
  { id: 'sub_pe', key: 'PE', name: 'PE', color: 'n', perWeek: 5, teachers: 9 },
];

const NAMED_TEACHERS: Record<string, { name: string; room: string }> = {
  sub_maths: { name: 'Kavita Iyer', room: 'B-204' },
  sub_english: { name: 'Meera Nair', room: 'A-102' },
  sub_science: { name: 'Rahul Verma', room: 'Lab 2' },
  sub_hindi: { name: 'Sunita Desai', room: 'B-206' },
  sub_social: { name: 'Anil Kumar', room: 'B-210' },
  sub_computer: { name: 'Tanvi Gokhale', room: 'IT Lab' },
  sub_pe: { name: 'Rohan Das', room: 'Ground' },
};

/** The timetable of class 8 A, from the approved design. Rows are Monday to Friday, columns are periods 1 to 8. */
const TT_8A = [
  ['M', 'E', 'S', 'H', 'So', 'C', 'M', 'PE'],
  ['E', 'M', 'H', 'S', 'M', 'So', 'C', 'PE'],
  ['S', 'M', 'E', 'M', 'H', 'So', 'PE', 'C'],
  ['M', 'H', 'S', 'E', 'So', 'M', 'C', 'E'],
  ['H', 'S', 'M', 'E', 'M', 'PE', 'So', 'C'],
];

const NAMED_8A: { name: string; roll: string; house: string; guardian: string; rate: number; adm: string; fee: string }[] = [
  { name: 'Aarav Sharma', roll: '08', house: 'Emerald', guardian: 'Priya Sharma', rate: 0.96, adm: '2019/0412', fee: 'paid' },
  { name: 'Diya Mehta', roll: '14', house: 'Ruby', guardian: 'Rohan Mehta', rate: 0.92, adm: '2019/0433', fee: 'due:18500' },
  { name: 'Kabir Singh', roll: '21', house: 'Sapphire', guardian: 'Harpreet Singh', rate: 0.84, adm: '2019/0457', fee: 'over:24950' },
  { name: 'Myra Kapoor', roll: '11', house: 'Amber', guardian: 'Neeta Kapoor', rate: 0.98, adm: '2019/0421', fee: 'paid' },
  { name: 'Vivaan Joshi', roll: '27', house: 'Emerald', guardian: 'Sameer Joshi', rate: 0.94, adm: '2020/0118', fee: 'paid' },
  { name: 'Anika Rao', roll: '04', house: 'Ruby', guardian: 'Lakshmi Rao', rate: 0.91, adm: '2019/0402', fee: 'due:6200' },
  { name: 'Ishaan Gupta', roll: '19', house: 'Sapphire', guardian: 'Amit Gupta', rate: 0.82, adm: '2019/0449', fee: 'over:18500' },
  { name: 'Sara Khan', roll: '16', house: 'Amber', guardian: 'Farah Khan', rate: 0.97, adm: '2019/0438', fee: 'paid' },
  { name: 'Arnav Nair', roll: '23', house: 'Emerald', guardian: 'Deepa Nair', rate: 0.93, adm: '2021/0076', fee: 'paid' },
  { name: 'Kiara Patel', roll: '09', house: 'Ruby', guardian: 'Nikhil Patel', rate: 0.95, adm: '2019/0416', fee: 'due:18500' },
];

/** On the latest school day these classes have not marked attendance yet (the "Needs you" reminder). */
const UNMARKED = ['6 A', '7 C', '9 B', '10 A'];

const OFF_DAYS = [0];
const PERIOD_ROWS: [number, string, string, string, 'period' | 'break' | 'lunch'][] = [
  [0, 'P1', '08:10', '08:50', 'period'],
  [1, 'P2', '08:50', '09:30', 'period'],
  [2, 'P3', '09:30', '10:10', 'period'],
  [3, 'P4', '10:30', '11:10', 'period'],
  [4, 'P5', '11:10', '11:50', 'period'],
  [5, 'P6', '12:30', '13:10', 'period'],
  [6, 'P7', '13:10', '13:50', 'period'],
  [7, 'P8', '13:50', '14:30', 'period'],
  [12, 'Break', '10:10', '10:30', 'break'],
  [14, 'Lunch', '11:50', '12:30', 'lunch'],
];

type Db = Pool | PoolClient;

export async function seedSchool(pool: Pool, input: SeedInput): Promise<SeedReport> {
  const started = Date.now();
  const client = await pool.connect();
  try {
    await client.query('begin');
    const report = await run(client, input);
    await client.query('commit');
    return { ...report, ms: Date.now() - started };
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function run(db: PoolClient, input: SeedInput): Promise<Omit<SeedReport, 'ms'>> {
  const today = input.today ?? istToday();
  const last = latestSchoolDay(today, OFF_DAYS);
  const r = rng(20261014);
  const year = Number(last.slice(0, 4));
  const yearStart = `${last >= `${year}-04-01` ? year : year - 1}-04-01`;
  const yearId = 'yr_current';
  const startY = Number(yearStart.slice(0, 4));

  await db.query('insert into academic_years (id,label,starts_on,ends_on,current) values ($1,$2,$3,$4,true)', [
    yearId, `${startY}–${String(startY + 1).slice(2)}`, yearStart, `${startY + 1}-03-31`,
  ]);

  // Roles, periods and subjects exist in every school, empty or not.
  await bulkInsert(db, 'roles', ['id', 'key', 'name', 'description', 'permissions', 'locked'],
    ROLE_TEMPLATES.map((t) => [`role_${t.key}`, t.key, t.name, t.description, JSON.stringify(t.permissions), t.key === 'principal']));
  await bulkInsert(db, 'periods', ['idx', 'label', 'starts_at', 'ends_at', 'kind'], PERIOD_ROWS);
  await bulkInsert(db, 'subjects', ['id', 'name', 'color', 'per_week'], SUBJECTS.map((s) => [s.id, s.name, s.color, s.perWeek]));

  const adminId = newId('usr');
  await bulkInsert(db, 'users', ['id', 'kind', 'name', 'email', 'phone', 'password_hash'], [
    [adminId, 'staff', input.admin.name, input.admin.email.toLowerCase(), input.admin.phone, input.admin.passwordHash],
  ]);
  await db.query("insert into staff (user_id, designation, department, joined_on) values ($1,'Principal','Administration',$2)", [adminId, addDays(last, -2000)]);
  await db.query('insert into user_roles (user_id, role_id) values ($1,$2)', [adminId, 'role_principal']);

  const examsStart = addDays(last, 6);
  const s = input.school;
  const settings: [string, unknown][] = [
    ['school.name', s.name], ['school.shortName', s.shortName], ['school.tagline', s.tagline], ['school.place', s.place ?? ''], ['school.phone', s.phone],
    ['school.email', s.email], ['school.address', s.address], ['school.language', s.language], ['brand.color', s.color],
    ['brand.logoText', s.logoText], ['modules.enabled', input.modules], ['approvals.feeWaiver', 'principal'],
    ['approvals.notice', 'required'], ['attendance.notifyParents', true], ['attendance.lockAfterDays', 2],
    ['fees.lateFeePct', 0], ['fees.remindDaysBefore', 3], ['fees.dailyTarget', 150000], ['attendance.goalPct', 95],
    ['homework.goalPct', 85], ['students.pinnedClass', 'cls_8a'], ['dashboard.rollClasses', ['cls_8a', 'cls_8b', 'cls_9a', 'cls_9b', 'cls_10a', 'cls_10b']], ['term.name', 'Term 1'], ['term.examsStart', examsStart], ['security.twoFactor', true],
    ['demo.mode', input.demoMode], ['vocab.student', 'Student'], ['vocab.class', 'Class'],
  ];
  await bulkInsert(db, 'settings', ['key', 'value', 'updated_by'], settings.map(([k, v]) => [k, JSON.stringify(v), 'system']));
  await bulkInsert(db, 'meta', ['key', 'value'], [
    ['settings.version', JSON.stringify(1)], ['timetable.version', JSON.stringify(1)],
    ['timetable.publishedAt', JSON.stringify(new Date().toISOString())], ['seeded.mode', JSON.stringify(input.data)],
  ]);
  await db.query("insert into audit_log (id, actor_id, actor_name, action, entity, detail) values ($1,$2,$3,'school.created','school',$4)", [
    newId('aud'), adminId, 'System', JSON.stringify({ name: s.name }),
  ]);

  if (input.data === 'empty') return { students: 0, classes: 0, staff: 1 };
  if (!input.demoPasswordHash) throw new Error('Demo data needs demoPasswordHash.');

  const days24 = schoolDaysEnding(last, 24, OFF_DAYS);
  const ctx = { db, r, last, today, days24, yearId, demoHash: input.demoPasswordHash, adminId };
  const teachers = await seedStaff(ctx);
  const classes = await seedClasses(ctx, teachers);
  const students = await seedStudents(ctx, classes);
  await seedAttendance(ctx, classes, students);
  await seedFees(ctx, students);
  await seedTimetable(ctx, classes, teachers);
  await seedLearning(ctx, classes, students);
  await seedOffice(ctx, classes, students, teachers);
  await seedModulesDemo(db, today);
  return { students: students.length, classes: classes.length, staff: teachers.length + 1 };
}

interface Ctx {
  db: Db;
  r: Rng;
  last: string;
  today: string;
  days24: string[];
  yearId: string;
  demoHash: string;
  adminId: string;
}
interface Teacher { id: string; name: string; subjectId: string; named: boolean }
interface ClassRow { id: string; name: string; grade: number; section: string; teacherId: string; size: number }
interface StudentRow { id: string; classId: string; className: string; grade: number; name: string; rate: number; named: (typeof NAMED_8A)[number] | null; guardianId: string }

async function seedStaff(ctx: Ctx): Promise<Teacher[]> {
  const { db, r } = ctx;
  const used = new Set<string>(['Neha Menon']);
  const teachers: Teacher[] = [];
  const userRows: unknown[][] = [];
  const staffRows: unknown[][] = [];
  const ssRows: unknown[][] = [];
  const roleRows: unknown[][] = [];
  for (const sub of SUBJECTS) {
    for (let i = 0; i < sub.teachers; i++) {
      let name = i === 0 ? NAMED_TEACHERS[sub.id]!.name : '';
      while (!name || used.has(name)) name = `${r.pick([...FIRST_FEMALE, ...FIRST_MALE])} ${r.pick(LAST)}`;
      used.add(name);
      const id = newId('usr');
      const [first, ...rest] = name.split(' ');
      const email = `${first!.toLowerCase()}.${rest.join('').toLowerCase()}@greenfield.edu.in`;
      userRows.push([id, 'staff', name, email, `+91 9${String(1000 + userRows.length).padStart(4, '0')} ${String(20000 + userRows.length * 7).slice(0, 5)}`, ctx.demoHash]);
      staffRows.push([id, 'Teacher', sub.name, addDays(ctx.last, -r.int(200, 3000)), 30]);
      ssRows.push([id, sub.id]);
      roleRows.push([id, name === 'Meera Nair' ? 'role_office' : 'role_teacher']);
      teachers.push({ id, name, subjectId: sub.id, named: i === 0 });
    }
  }
  await bulkInsert(db, 'users', ['id', 'kind', 'name', 'email', 'phone', 'password_hash'], userRows);
  await bulkInsert(db, 'staff', ['user_id', 'designation', 'department', 'joined_on', 'max_periods_per_week'], staffRows);
  await bulkInsert(db, 'staff_subjects', ['user_id', 'subject_id'], ssRows);
  await bulkInsert(db, 'user_roles', ['user_id', 'role_id'], roleRows);
  return teachers;
}

async function seedClasses(ctx: Ctx, teachers: Teacher[]): Promise<ClassRow[]> {
  const rows: ClassRow[] = [];
  const sizes: Record<string, number> = {};
  const names: string[] = [];
  for (let g = 1; g <= 10; g++) for (const sec of ['A', 'B', 'C', 'D', ...(g >= 9 ? ['E'] : [])]) names.push(`${g} ${sec}`);
  // 1,498 students over 42 classes, with 8 A fixed at 36 (the approved design).
  names.forEach((n) => { sizes[n] = n === '8 A' ? 36 : 35; });
  let extra = 1498 - Object.values(sizes).reduce((a, b) => a + b, 0);
  for (const n of names) { if (extra > 0 && n !== '8 A') { sizes[n]!++; extra--; } }
  const free = teachers.filter((t) => !t.named);
  names.forEach((n, i) => {
    const [g, sec] = n.split(' ');
    rows.push({ id: `cls_${g}${sec!.toLowerCase()}`, name: n, grade: Number(g), section: sec!, teacherId: free[i % free.length]!.id, size: sizes[n]! });
  });
  rows.find((c) => c.name === '8 A')!.teacherId = teachers.find((t) => t.subjectId === 'sub_maths' && t.named)!.id;
  await bulkInsert(ctx.db, 'classes', ['id', 'year_id', 'name', 'grade', 'section', 'class_teacher_id'], rows.map((c) => [c.id, ctx.yearId, c.name, c.grade, c.section, c.teacherId]));
  return rows;
}

async function seedStudents(ctx: Ctx, classes: ClassRow[]): Promise<StudentRow[]> {
  const { db, r } = ctx;
  const out: StudentRow[] = [];
  const stuRows: unknown[][] = [];
  const guardRows: unknown[][] = [];
  const linkRows: unknown[][] = [];
  const seq: Record<number, number> = {};
  const usedAdm = new Set(NAMED_8A.map((n) => n.adm));
  const admYear = (g: number) => Number(ctx.last.slice(0, 4)) - g + 1;
  const usedNames = new Set<string>(NAMED_8A.map((n) => n.name));
  for (const c of classes) {
    const named = c.name === '8 A' ? NAMED_8A : [];
    const rolls = r.shuffle(Array.from({ length: c.size }, (_, i) => String(i + 1).padStart(2, '0')).filter((x) => !named.some((n) => n.roll === x)));
    for (let i = 0; i < c.size; i++) {
      const nm = named[i];
      const female = r.chance(0.5);
      let name = nm?.name ?? '';
      let last = name.split(' ')[1] ?? '';
      while (!name || (!nm && usedNames.has(name))) {
        last = r.pick(LAST);
        name = `${r.pick(female ? FIRST_FEMALE : FIRST_MALE)} ${last}`;
      }
      usedNames.add(name);
      const id = nm ? `stu_${nm.name.split(' ')[0]!.toLowerCase()}` : newId('stu');
      let adm = nm?.adm;
      if (!adm) {
        const y = admYear(c.grade);
        do { seq[y] = (seq[y] ?? 400) + 1; adm = `${y}/${String(seq[y]).padStart(4, '0')}`; } while (usedAdm.has(adm));
      }
      usedAdm.add(adm);
      const gname = nm?.guardian ?? `${r.pick([...FIRST_FEMALE, ...FIRST_MALE])} ${last}`;
      const gid = newId('gdn');
      const dobYear = Number(ctx.last.slice(0, 4)) - (c.grade + 5);
      const dob = `${dobYear}-${String(r.int(1, 12)).padStart(2, '0')}-${String(r.int(1, 28)).padStart(2, '0')}`;
      const rate = nm?.rate ?? Math.min(0.995, Math.max(0.76, 0.925 + (r.next() - 0.5) * 0.16));
      stuRows.push([id, adm, name, c.id, nm?.roll ?? rolls[i - named.length] ?? String(i + 1), dob, r.pick(BLOOD), nm?.house ?? r.pick(HOUSES),
        `${r.int(1, 60)}, ${r.pick(['Ivory Towers', 'Palms', 'Lake Homes', 'Green Park', 'Sunrise Apts', 'Orchid'])}, ${r.pick(AREAS)}, Pune`, addDays(`${admYear(c.grade)}-06-10`, r.int(0, 10))]);
      guardRows.push([gid, gname, '', null, 'Parent']);
      linkRows.push([id, gid, true]);
      out.push({ id, classId: c.id, className: c.name, grade: c.grade, name, rate, named: nm ?? null, guardianId: gid });
    }
  }
  guardRows.forEach((row, i) => { row[2] = `+91 98${String(100 + Math.floor(i / 100)).padStart(3, '0')} ${String(10000 + (i % 100) * 87 + Math.floor(i / 100)).slice(0, 5)}`; });
  // Priya Sharma (Aarav's mother) can sign in as a parent.
  const priya = guardRows.find((g) => g[1] === 'Priya Sharma')!;
  const priyaUser = newId('usr');
  await bulkInsert(db, 'users', ['id', 'kind', 'name', 'email', 'phone', 'password_hash'], [[priyaUser, 'guardian', 'Priya Sharma', 'priya.sharma@example.com', priya[2], ctx.demoHash]]);
  await bulkInsert(db, 'students', ['id', 'admission_no', 'name', 'class_id', 'roll_no', 'dob', 'blood_group', 'house', 'address', 'admitted_on'], stuRows);
  await bulkInsert(db, 'guardians', ['id', 'name', 'phone', 'email', 'relation'], guardRows);
  await db.query('update guardians set user_id = $1, email = $2 where id = $3', [priyaUser, 'priya.sharma@example.com', priya[0]]);
  await bulkInsert(db, 'student_guardians', ['student_id', 'guardian_id', 'is_primary'], linkRows);
  return out;
}

async function seedAttendance(ctx: Ctx, classes: ClassRow[], students: StudentRow[]): Promise<void> {
  const { db, r, last, days24 } = ctx;
  const sessions: unknown[][] = [];
  const marks: unknown[][] = [];
  const byClass = new Map<string, StudentRow[]>();
  students.forEach((s) => byClass.set(s.classId, [...(byClass.get(s.classId) ?? []), s]));
  // School-wide mood per day: mostly steady, with one bad day (the dip in the design) four school days back.
  const mood = days24.map((_, i) => (i === days24.length - 4 ? -0.14 : i === days24.length - 2 ? -0.05 : (r.next() - 0.5) * 0.07));
  const staffByClass = new Map(classes.map((c) => [c.id, c.teacherId]));
  for (const c of classes) {
    for (let di = 0; di < days24.length; di++) {
      const day = days24[di]!;
      if (day === last && UNMARKED.includes(c.name)) continue;
      const sid = `att_${c.id}_${day}`;
      const minute = 2 * 60 + 20 + ((classes.indexOf(c) * 7 + di * 3) % 110);
      sessions.push([sid, c.id, day, staffByClass.get(c.id), `${day}T${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00Z`]);
      for (const s of byClass.get(c.id) ?? []) {
        const present = r.chance(Math.min(0.995, s.rate + mood[di]!));
        let status = 'present';
        if (!present) status = r.chance(0.18) ? 'leave' : r.chance(0.3) ? 'late' : 'absent';
        // The approved design shows Kabir arriving late and Ishaan absent in the last days.
        if (s.named?.name === 'Aarav Sharma' && di === days24.length - 2) status = 'late';
        marks.push([sid, s.id, status]);
      }
    }
  }
  await bulkInsert(db, 'attendance_sessions', ['id', 'class_id', 'date', 'marked_by', 'submitted_at'], sessions, { chunk: 1500 });
  await bulkInsert(db, 'attendance_marks', ['session_id', 'student_id', 'status'], marks, { chunk: 5000 });
}

async function seedFees(ctx: Ctx, students: StudentRow[]): Promise<void> {
  const { db, r, last } = ctx;
  const monthStart = `${last.slice(0, 7)}-01`;
  const inv: unknown[][] = [];
  const pay: unknown[][] = [];
  let receipt = 8000;
  const nextReceipt = (): string => { receipt++; if (receipt === 8812) receipt++; return `RCPT-2026-${String(receipt).padStart(5, '0')}`; };
  const days = schoolDaysEnding(last, 12, OFF_DAYS);
  const overdueDay = addDays(monthStart, 4);
  const dueDay = addDays(last, 6);
  const termOne = addDays(monthStart, -170);
  const named = new Set(students.filter((s) => s.named).map((s) => s.id));
  // 160 students pay this term in the current month (the "October cohort"): all named ones plus a random 150.
  const others = r.shuffle(students.filter((s) => !named.has(s.id) && s.className !== '8 A'));
  const cohort = new Set([...named, ...others.slice(0, 150).map((s) => s.id)]);
  let overdueFamilies = 0;
  const addInvoice = (s: StudentRow, head: string, title: string, amount: number, due: string, paidOn: string | null, receiptNo?: string, method = 'upi') => {
    const id = newId('inv');
    inv.push([id, s.id, head, title, amount, due]);
    if (paidOn) pay.push([newId('pay'), id, amount, method, method === 'cash' ? null : `UPI${r.int(10000000, 99999999)}`, receiptNo ?? nextReceipt(), paidOn]);
  };
  for (const s of students) {
    // Term 1 tuition: paid in the spring by almost everyone.
    addInvoice(s, 'tuition', 'Term 1 tuition', 18500, termOne, s.className === '8 A' || r.chance(0.985) ? addDays(termOne, r.int(-5, 20)) : null);
    if (!cohort.has(s.id)) continue;
    const nm = s.named;
    const pickDay = () => days[r.int(0, days.length - 1)]!;
    if (nm) {
      const [kind, amt] = nm.fee.split(':');
      if (kind === 'paid') {
        addInvoice(s, 'tuition', 'Term 2 tuition', 18500, overdueDay, s.name === 'Aarav Sharma' ? last : pickDay(), s.name === 'Aarav Sharma' ? 'RCPT-2026-08812' : undefined);
      } else if (kind === 'due' && amt === '18500') {
        addInvoice(s, 'tuition', 'Term 2 tuition', 18500, dueDay, null);
      } else if (kind === 'due') {
        addInvoice(s, 'tuition', 'Term 2 tuition', 18500, overdueDay, pickDay());
        addInvoice(s, 'transport', 'Transport, term 2', Number(amt), dueDay, null);
      } else if (amt === '24950') {
        addInvoice(s, 'tuition', 'Term 2 tuition', 18500, overdueDay, null);
        addInvoice(s, 'transport', 'Transport, term 2', 6450, overdueDay, null);
        overdueFamilies++;
      } else {
        addInvoice(s, 'tuition', 'Term 2 tuition', 18500, overdueDay, null);
        overdueFamilies++;
      }
      continue;
    }
    const roll = r.next();
    const paid = roll < 0.62;
    const overdue = !paid && overdueFamilies < 35 && r.chance(0.55);
    if (overdue) overdueFamilies++;
    const due = overdue ? overdueDay : paid ? overdueDay : dueDay;
    addInvoice(s, 'tuition', 'Term 2 tuition', 18500, due, paid ? pickDay() : null, undefined, r.pick(['upi', 'upi', 'cash', 'netbanking', 'card']));
    if (r.chance(0.4)) addInvoice(s, 'transport', 'Transport, term 2', 6450, due, paid || r.chance(0.3) ? pickDay() : null);
    if (r.chance(0.5)) addInvoice(s, 'activities', 'Activities, term 2', 2100, due, paid || r.chance(0.2) ? pickDay() : null);
    if (r.chance(0.3)) addInvoice(s, 'lab', 'Lab fee, term 2', 1200, due, paid ? pickDay() : null);
  }
  await bulkInsert(db, 'fee_invoices', ['id', 'student_id', 'head', 'title', 'amount', 'due_on'], inv, { chunk: 2000 });
  await bulkInsert(db, 'payments', ['id', 'invoice_id', 'amount', 'method', 'reference', 'receipt_no', 'paid_on'], pay, { chunk: 2000 });
}

interface SlotPlan { classId: string; day: number; period: number; subjectId: string; teacherId: string; room: string }

async function seedTimetable(ctx: Ctx, classes: ClassRow[], teachers: Teacher[]): Promise<void> {
  const { db, r } = ctx;
  const bySub = new Map<string, Teacher[]>();
  teachers.forEach((t) => bySub.set(t.subjectId, [...(bySub.get(t.subjectId) ?? []), t]));
  // One teacher per class and subject; named teachers take 8 A and 8 B so the design's clash is real.
  const teacherOf = new Map<string, string>();
  for (const sub of SUBJECTS) {
    const pool = bySub.get(sub.id)!;
    classes.forEach((c, i) => {
      const named = pool.find((t) => t.named)!;
      const isEight = c.grade === 8 && (c.section === 'A' || c.section === 'B');
      const t = isEight ? named : pool[(i % (pool.length - 1)) + 1]!;
      teacherOf.set(`${c.id}|${sub.id}`, t.id);
    });
  }
  const rahul = teachers.find((t) => t.subjectId === 'sub_science' && t.named)!;
  const busy = new Set<string>();
  const key = (t: string, d: number, p: number) => `${t}|${d}|${p}`;
  const slots: SlotPlan[] = [];
  const roomOf = (subId: string) => NAMED_TEACHERS[subId]!.room;
  const subByKey = new Map(SUBJECTS.map((s) => [s.key, s]));
  const push = (c: ClassRow, d: number, p: number, subId: string) => {
    const tid = teacherOf.get(`${c.id}|${subId}`)!;
    busy.add(key(tid, d, p));
    slots.push({ classId: c.id, day: d, period: p, subjectId: subId, teacherId: tid, room: roomOf(subId) });
  };
  // Rahul is kept free on Wednesday period 4, so he can cover the clash.
  busy.add(key(rahul.id, 3, 3));
  const eightA = classes.find((c) => c.name === '8 A')!;
  TT_8A.forEach((row, di) => row.forEach((k, pi) => push(eightA, di + 1, pi, subByKey.get(k)!.id)));
  // 8 B comes from a small randomised search. It must avoid 8 A's teachers everywhere except Wednesday period 4.
  const eightB = classes.find((c) => c.name === '8 B')!;
  let placedB = false;
  for (let attempt = 0; attempt < 2000 && !placedB; attempt++) {
    const mine: SlotPlan[] = [{ classId: eightB.id, day: 3, period: 3, subjectId: 'sub_maths', teacherId: teacherOf.get(`${eightB.id}|sub_maths`)!, room: roomOf('sub_maths') }];
    const left = new Map(SUBJECTS.map((s) => [s.id, s.perWeek]));
    left.set('sub_maths', left.get('sub_maths')! - 1);
    let ok = true;
    for (const [d, p] of r.shuffle(Array.from({ length: 40 }, (_, i) => [Math.floor(i / 8) + 1, i % 8] as const))) {
      if (d === 3 && p === 3) continue;
      const pick = r.shuffle(SUBJECTS.filter((s) => left.get(s.id)! > 0)).find((s) => !busy.has(key(teacherOf.get(`${eightB.id}|${s.id}`)!, d, p)));
      if (!pick) { ok = false; break; }
      left.set(pick.id, left.get(pick.id)! - 1);
      mine.push({ classId: eightB.id, day: d, period: p, subjectId: pick.id, teacherId: teacherOf.get(`${eightB.id}|${pick.id}`)!, room: roomOf(pick.id) });
    }
    if (ok) { slots.push(...mine); placedB = true; }
  }
  if (!placedB) throw new Error('Could not build the timetable for 8 B.');

  // Every other class: bipartite edge colouring (classes x teachers), so no teacher is ever in two rooms at once.
  const rest = classes.filter((c) => c !== eightA && c !== eightB);
  const edges: { c: ClassRow; subId: string; t: string }[] = [];
  for (const c of rest) for (const sub of SUBJECTS) for (let i = 0; i < sub.perWeek; i++) edges.push({ c, subId: sub.id, t: teacherOf.get(`${c.id}|${sub.id}`)! });
  const colours = colourEdges(edges.map((e) => [e.c.id, e.t] as [string, string]), 40);
  edges.forEach((e, i) => {
    const k = colours[i]!;
    slots.push({ classId: e.c.id, day: Math.floor(k / 8) + 1, period: k % 8, subjectId: e.subId, teacherId: e.t, room: roomOf(e.subId) });
  });
  const rows = slots.map((s) => [`slot_${s.classId}_${s.day}_${s.period}`, s.classId, s.day, s.period, s.subjectId, s.teacherId, s.room, s.teacherId, s.subjectId]);
  await bulkInsert(db, 'timetable_slots', ['id', 'class_id', 'day', 'period', 'subject_id', 'teacher_id', 'room', 'published_teacher_id', 'published_subject_id'], rows, { chunk: 1500 });
}

async function seedLearning(ctx: Ctx, classes: ClassRow[], students: StudentRow[]): Promise<void> {
  const { db, r, last } = ctx;
  const days = schoolDaysEnding(last, 6, OFF_DAYS);
  // Share handed in on time, per day, matching the rhythm of the approved design.
  const target = [0.82, 0.76, 0.88, 0.71, 0.9, 0.85];
  const hw: unknown[][] = [];
  const sub: unknown[][] = [];
  const byClass = new Map<string, StudentRow[]>();
  students.forEach((s) => byClass.set(s.classId, [...(byClass.get(s.classId) ?? []), s]));
  const subjects = SUBJECTS.map((s) => s.id);
  for (const c of classes) {
    days.forEach((day, i) => {
      const id = `hw_${c.id}_${day}`;
      const title = c.name === '8 A' && i === days.length - 2 ? 'Linear equations' : `${['Chapter review', 'Practice sheet', 'Reading and notes', 'Worksheet'][(i + c.grade) % 4]}`;
      const subjectId = c.name === '8 A' && i === days.length - 2 ? 'sub_maths' : subjects[(i + c.grade) % subjects.length]!;
      hw.push([id, c.id, subjectId, title, day, addDays(day, 1)]);
      for (const s of byClass.get(c.id) ?? []) {
        const diligence = s.rate > 0.9 ? 0.06 : -0.06;
        const onTime = r.chance(Math.min(0.99, target[i]! + diligence));
        const late = !onTime && r.chance(0.5);
        const handed = onTime ? `${addDays(day, 1)}T0${r.int(2, 9)}:${String(r.int(10, 59))}:00Z` : late ? `${addDays(day, 2)}T05:10:00Z` : null;
        sub.push([id, s.id, handed, onTime]);
      }
    });
  }
  await bulkInsert(db, 'homework', ['id', 'class_id', 'subject_id', 'title', 'assigned_on', 'due_on'], hw, { chunk: 1500 });
  await bulkInsert(db, 'homework_submissions', ['homework_id', 'student_id', 'handed_at', 'on_time'], sub, { chunk: 4000 });
  // Yesterday evening: Aarav handed in "Linear equations".
  await db.query("update homework_submissions set handed_at = $1, on_time = true where homework_id = $2 and student_id = 'stu_aarav'", [`${addDays(last, -1)}T14:10:00Z`, `hw_cls_8a_${days[days.length - 2]}`]);

  const results = students.map((s) => {
    const pct = s.named?.name === 'Aarav Sharma' ? 91 : Math.round(Math.min(99, Math.max(38, 72 + (s.rate - 0.9) * 120 + (r.next() - 0.5) * 30)));
    return [s.id, 'Unit test 1', pct >= 91 ? 'A1' : pct >= 81 ? 'A2' : pct >= 71 ? 'B1' : pct >= 61 ? 'B2' : pct >= 51 ? 'C1' : 'C2', pct];
  });
  await bulkInsert(db, 'exam_results', ['student_id', 'exam', 'grade', 'pct'], results, { chunk: 4000 });

  const loans: unknown[][] = [];
  const books = ['The Hobbit', 'Wings of Fire', 'Matilda', 'Malgudi Days', 'Charlotte’s Web', 'The Jungle Book', 'Hatchet', 'Swami and Friends'];
  for (const s of students) {
    const n = s.name === 'Aarav Sharma' ? 2 : r.chance(0.3) ? r.int(1, 2) : 0;
    for (let i = 0; i < n; i++) loans.push([newId('lib'), s.id, r.pick(books), addDays(last, r.int(2, 12)), null]);
  }
  await bulkInsert(db, 'library_loans', ['id', 'student_id', 'title', 'due_on', 'returned_on'], loans, { chunk: 3000 });
  const routes = students.filter((s) => s.name === 'Aarav Sharma' || r.chance(0.4)).map((s) => [s.id, s.name === 'Aarav Sharma' ? 'Route 4' : `Route ${r.int(1, 8)}`]);
  await bulkInsert(db, 'transport_assignments', ['student_id', 'route'], routes, { chunk: 3000 });
}

async function seedOffice(ctx: Ctx, classes: ClassRow[], students: StudentRow[], teachers: Teacher[]): Promise<void> {
  const { db, last, adminId } = ctx;
  const meera = teachers.find((t) => t.name === 'Meera Nair')!;
  const kavita = teachers.find((t) => t.name === 'Kavita Iyer')!;
  const kabir = students.find((s) => s.name === 'Kabir Singh')!;
  const noticeRows: unknown[][] = [
    ['ntc_sports', 'Sports day on 28 October', 'Sports day will be held on the main ground from 8 am. Please send children in house colours with a water bottle.', 'everyone', null, 'published', adminId, `${addDays(last, -3)}T05:00:00Z`],
    ['ntc_fees', 'Term 2 fee reminder', 'Term 2 fees are due this month. Pay in the app to receive the receipt instantly.', 'parents', null, 'published', adminId, `${addDays(last, -6)}T05:00:00Z`],
    ['ntc_library', 'Library week', 'Children can borrow up to three books this week. Overdue books may be returned without a fine.', 'everyone', null, 'published', meera.id, `${addDays(last, -9)}T05:00:00Z`],
    ['ntc_ptm', 'PTM notice, Class 5', 'The parent-teacher meeting for Class 5 is on Friday at 3:30 pm. Please confirm in the app.', 'class', 'cls_5a', 'pending', meera.id, null],
  ];
  await bulkInsert(db, 'notices', ['id', 'title', 'body', 'audience', 'class_id', 'status', 'author_id', 'published_at'], noticeRows);
  const leaveFrom = addDays(last, 2);
  await bulkInsert(db, 'approvals', ['id', 'kind', 'title', 'subtitle', 'requester_name', 'subject_ref', 'payload'], [
    ['apr_leave_kavita', 'leave', 'Kavita Iyer asked for leave', '16–17 Oct · Maths, Class 8 A', 'Kavita Iyer', kavita.id, JSON.stringify({ from: leaveFrom, to: addDays(leaveFrom, 1) })],
    ['apr_waiver_kabir', 'fee_waiver', 'Concession for Kabir Singh', '25% sibling · ₹4,625 a term', 'Kabir Singh', kabir.id, JSON.stringify({ percent: 25, amountPerTerm: 4625 })],
    ['apr_notice_ptm', 'notice', 'PTM notice, Class 5', 'Drafted by Meera Nair', 'Meera Nair', 'ntc_ptm', JSON.stringify({ noticeId: 'ntc_ptm' })],
  ]);
  await bulkInsert(db, 'events', ['id', 'title', 'starts_at', 'kind', 'note'], [
    ['evt_assembly', 'Assembly', `${last}T02:20:00Z`, 'routine', 'Main ground'],
    ['evt_periods', 'Periods 1–4', `${last}T02:40:00Z`, 'routine', `${classes.length} classes`],
    ['evt_unit_test', 'Unit test, Maths', `${last}T04:45:00Z`, 'exam', 'Hall 2 · 9 A, B, C'],
    ['evt_cover', 'Substitution', `${last}T06:00:00Z`, 'cover', 'Rahul takes 7 C'],
    ['evt_bus', 'Bus 4 check', `${last}T07:30:00Z`, 'routine', 'Depot'],
    ['evt_ptm', 'PTM, Class 5', `${last}T10:00:00Z`, 'event', '34 of 41 confirmed'],
  ]);
  await bulkInsert(db, 'audit_log', ['id', 'at', 'actor_id', 'actor_name', 'action', 'entity', 'detail'], [
    [newId('aud'), `${addDays(last, -2)}T05:00:00Z`, adminId, 'Neha Menon', 'notice.published', 'notice', JSON.stringify({ title: 'Sports day on 28 October' })],
    [newId('aud'), `${addDays(last, -1)}T05:00:00Z`, adminId, 'Neha Menon', 'settings.changed', 'settings', JSON.stringify({ key: 'fees.remindDaysBefore' })],
  ]);
}

export { UNMARKED, OFF_DAYS, NAMED_8A, SUBJECTS };

/**
 * Proper edge colouring of a bipartite multigraph with `k` colours (König): each edge gets a colour so that
 * no two edges at a node share one. Works whenever the highest node degree is at most `k`.
 */
export function colourEdges(edges: [string, string][], k: number): number[] {
  const left = new Map<string, (number | undefined)[]>();
  const right = new Map<string, (number | undefined)[]>();
  const slot = (m: Map<string, (number | undefined)[]>, id: string) => m.get(id) ?? m.set(id, new Array(k).fill(undefined)).get(id)!;
  const out = new Array<number>(edges.length).fill(-1);
  const free = (arr: (number | undefined)[]) => arr.findIndex((x) => x === undefined);
  edges.forEach(([u, v], idx) => {
    const lu = slot(left, u);
    const rv = slot(right, v);
    const a = free(lu);
    const b = free(rv);
    if (a < 0 || b < 0) throw new Error('A node has more edges than colours.');
    if (rv[a] === undefined) { lu[a] = idx; rv[a] = idx; out[idx] = a; return; }
    // a is free at u but used at v: flip the a/b alternating path that starts at v, then a is free at v too.
    const path: number[] = [];
    let node = v;
    let onRight = true;
    let col = a;
    for (;;) {
      const arr = onRight ? slot(right, node) : slot(left, node);
      const e = arr[col];
      if (e === undefined) break;
      path.push(e);
      node = onRight ? edges[e]![0] : edges[e]![1];
      onRight = !onRight;
      col = col === a ? b : a;
    }
    for (const e of path) { const [x, y] = edges[e]!; slot(left, x)[out[e]!] = undefined; slot(right, y)[out[e]!] = undefined; }
    for (const e of path) { const [x, y] = edges[e]!; out[e] = out[e] === a ? b : a; slot(left, x)[out[e]!] = e; slot(right, y)[out[e]!] = e; }
    lu[a] = idx; slot(right, v)[a] = idx; out[idx] = a;
  });
  return out;
}
