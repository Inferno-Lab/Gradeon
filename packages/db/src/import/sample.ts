import { IMPORT_KINDS } from '@gradeon/contracts';
import { BLOOD, FIRST_FEMALE, FIRST_MALE, HOUSES, LAST } from '../seed/names.js';
import { toCsv } from './files.js';

/**
 * A realistic school as the files it would bring: every kind in Gradeon's templates, plus the student list as another
 * system exports it (Fedena-style columns, Indian dates, first and last names apart). Seeded, so a size always gives the
 * same school. Used by the import tests and by `tools/generate-school.mjs` for staging.
 */
export interface SampleSchool {
  /** File name -> CSV text, in the order they should be imported. */
  files: { name: string; kind: string; csv: string }[];
  /** The same students in another system's export shape. */
  fedenaStudents: string;
  /** What the imported school must add up to. */
  expect: { students: number; classes: number; staff: number; families: number; due: number; paid: number; attendanceMarks: number };
}

export function sampleSchool(students = 300, seed = 7): SampleSchool {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (iso: string, n: number) => day(new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000));
  const year = 2026;
  const sections = Math.max(1, Math.round(students / 12 / 35));
  const classes: { name: string; grade: number; section: string }[] = [];
  for (let g = 1; g <= 12; g++) for (let k = 0; k < sections; k++) classes.push({ name: `${g} ${'ABCDEF'[k]}`, grade: g, section: 'ABCDEF'[k]! });
  const subjects = ['English', 'Hindi', 'Mathematics', 'Science', 'Social Studies', 'Computer'];
  const staffCount = Math.max(subjects.length, classes.length);
  const staff = Array.from({ length: staffCount }, (_, i) => {
    const first = pick(rnd() < 0.6 ? FIRST_FEMALE : FIRST_MALE);
    const last = pick(LAST);
    return { name: `${first} ${last}`, email: `${first}.${last}.${i}@school.test`.toLowerCase(), phone: `97${pad(i, 8)}`, subject: subjects[i % subjects.length]! };
  });
  const kids: string[][] = [];
  const families: string[] = [];
  let lastFamily = '';
  for (let i = 0; i < students; i++) {
    const c = classes[i % classes.length]!;
    const female = rnd() < 0.5;
    const last = pick(LAST);
    // About one child in eight shares a family with the one before (a brother or sister in another class).
    const family = i > 0 && rnd() < 0.12 ? lastFamily : `98${pad(i, 8)}`;
    if (family !== lastFamily || i === 0) families.push(family);
    lastFamily = family;
    const dob = `${year - 5 - c.grade}-${pad(1 + Math.floor(rnd() * 12))}-${pad(1 + Math.floor(rnd() * 28))}`;
    kids.push([`${year - Math.min(c.grade, 6)}/${pad(i + 1, 4)}`, `${pick(female ? FIRST_FEMALE : FIRST_MALE)} ${last}`, c.name, pad(Math.floor(i / classes.length) + 1), dob, pick(BLOOD), pick(HOUSES), `${1 + i} Main Road, Pune`,
      `${year - Math.min(c.grade, 6)}-06-10`, 'active', `${pick(FIRST_FEMALE)} ${last}`, family, '', 'Mother', '', '', '']);
  }
  const uniqueFamilies = new Set(families).size;
  const fees = [{ head: 'tuition', title: 'Term 1 tuition', amount: 18500, due: `${year}-06-15` }, { head: 'tuition', title: 'Term 2 tuition', amount: 18500, due: `${year}-11-10` }, { head: 'activities', title: 'Activities', amount: 2100, due: `${year}-07-01` }];
  const dues: string[][] = [];
  const pays: string[][] = [];
  let due = 0, paid = 0, receipt = 1;
  for (const k of kids) for (const f of fees) {
    dues.push([k[0]!, f.head, f.title, String(f.amount), f.due, '0']);
    due += f.amount;
    // Everyone paid term 1; most paid activities; nobody paid term 2 yet.
    if (f.title === 'Term 1 tuition' || (f.title === 'Activities' && rnd() < 0.8)) {
      pays.push([`OLD-${pad(receipt++, 5)}`, k[0]!, f.title, String(f.amount), addDays(f.due, -Math.floor(rnd() * 10)), pick(['cash', 'upi', 'cheque']), '']);
      paid += f.amount;
    }
  }
  const schoolDays: string[] = [];
  for (let d = `${year}-10-01`; schoolDays.length < 10; d = addDays(d, 1)) if (new Date(`${d}T00:00:00Z`).getUTCDay() !== 0) schoolDays.push(d);
  const attendance = schoolDays.flatMap((d) => kids.map((k) => [d, k[0]!, rnd() < 0.92 ? 'P' : rnd() < 0.5 ? 'A' : 'L']));
  const marks = kids.flatMap((k) => subjects.slice(0, 3).map((sub) => ['Unit test 1', k[2]!, sub, k[0]!, rnd() < 0.03 ? 'AB' : String(40 + Math.floor(rnd() * 60)), '100', `${year}-07-20`, `${year}-07-24`]));
  const timetable = classes.flatMap((c, ci) => [1, 2, 3, 4, 5].flatMap((d) => [1, 2, 3, 4, 5, 6].map((p) => {
    const t = staff[(ci + d + p) % staff.length]!;
    return [c.name, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][d - 1]!, String(p), t.subject, t.email, `R-${ci + 1}`];
  })));
  const rows: Record<string, string[][]> = {
    years: [[`${year}-${pad((year + 1) % 100)}`, `${year}-04-01`, `${year + 1}-03-31`, 'yes']],
    terms: [[`${year}-${pad((year + 1) % 100)}`, 'Term 1', `${year}-04-01`, `${year}-09-30`], [`${year}-${pad((year + 1) % 100)}`, 'Term 2', `${year}-10-01`, `${year + 1}-03-31`]],
    holidays: [['Diwali break', `${year}-11-08`, `${year}-11-12`], ['Republic Day', `${year + 1}-01-26`, '']],
    subjects: subjects.map((x, i) => [x, String(i < 2 ? 6 : 5)]),
    periods: [['1', 'Period 1', '08:00', '08:40', ''], ['2', 'Period 2', '08:40', '09:20', ''], ['3', 'Period 3', '09:20', '10:00', ''], ['4', 'Break', '10:00', '10:20', 'break'], ['5', 'Period 4', '10:20', '11:00', ''], ['6', 'Period 5', '11:00', '11:40', ''], ['7', 'Period 6', '11:40', '12:20', '']].map((r) => r),
    staff: staff.map((t) => [t.name, t.email, t.phone, 'Teacher', '', `${year - 4}-06-01`, 'Teacher', t.subject]),
    classes: classes.map((c, i) => [c.name, String(c.grade), c.section, staff[i % staff.length]!.email]),
    students: kids,
    admissions: [['Ira Rao', '3', 'Meera Rao', '9811100001', '', 'website', 'applied', '', ''], ['Kabir Shah', '1', 'Anil Shah', '9811100002', '', 'walk-in', 'enquiry', '', 'Sibling in 4 A']],
    fee_structures: fees.map((f) => ['', f.head, f.title, String(f.amount), f.due]),
    fee_dues: dues,
    payments: pays,
    attendance,
    marks,
    // Periods 1-3 and 5-7 are lessons; the timetable uses the lesson numbers.
    timetable: timetable.map((r) => [r[0]!, r[1]!, String([1, 2, 3, 5, 6, 7][Number(r[2]) - 1]), r[3]!, r[4]!, r[5]!]),
    library_loans: kids.slice(0, Math.ceil(students / 10)).map((k, i) => [k[0]!, ['Wings of Fire', 'Malgudi Days', 'The Jungle Book'][i % 3]!, `${year}-11-${pad(10 + (i % 15))}`, '']),
    transport: kids.filter((_, i) => i % 3 === 0).map((k, i) => [k[0]!, `Route ${1 + (i % 6)} · Baner`]),
  };
  // Every generated family has a phone, so there is no contact list to bring.
  const files = IMPORT_KINDS.filter((kind) => rows[kind.key]).map((kind, i) => ({ name: `${pad(i + 1)}-${kind.key}.csv`, kind: kind.key, csv: toCsv([kind.columns.map((c) => c.key), ...rows[kind.key]!]) }));
  const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const fedenaStudents = toCsv([
    ['Admission no', 'First name', 'Middle name', 'Last name', 'Batch name', 'Roll number', 'Date of birth', 'Blood group', 'Admission date', 'Father name', 'Father mobile phone'],
    ...kids.map((k) => { const [first, ...rest] = k[1]!.split(' '); return [k[0]!, first!, '', rest.join(' '), k[2]!.replace(' ', '-'), k[3]!, ddmm(k[4]!), k[5]!, ddmm(k[8]!), k[10]!, `+91 ${k[11]!}`]; }),
  ]);
  return { files, fedenaStudents, expect: { students, classes: classes.length, staff: staff.length, families: uniqueFamilies, due, paid, attendanceMarks: attendance.length } };
}
