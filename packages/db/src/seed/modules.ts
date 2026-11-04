import { addDays, istToday, latestSchoolDay } from '@gradeon/contracts';
import type { Pool, PoolClient } from 'pg';
import { newId } from '../ids.js';
import { bulkInsert } from './bulk.js';
import { rng } from './names.js';

type Db = Pool | PoolClient;

const SUBJECTS_5 = ['sub_maths', 'sub_english', 'sub_science', 'sub_hindi', 'sub_social'];
const gradeOf = (pct: number) => (pct >= 91 ? 'A1' : pct >= 81 ? 'A2' : pct >= 71 ? 'B1' : pct >= 61 ? 'B2' : pct >= 51 ? 'C1' : 'C2');

const count = async (db: Db, table: string): Promise<number> => Number((await db.query<{ n: string }>(`select count(*) n from ${table}`)).rows[0]!.n);

/**
 * Sample content for the modules that came after the first release: exams and marks, family messages, events with replies,
 * admissions and data requests. Every part checks that its table is empty first, so it is safe to run again, on a new demo
 * school or on one that was created before these modules existed.
 */
export async function seedModulesDemo(db: Db, todayIn?: string): Promise<string[]> {
  const did: string[] = [];
  const last = latestSchoolDay(todayIn ?? istToday(), [0]);
  const r = rng(20261018);
  const admin = (await db.query<{ id: string }>("select u.id from users u join user_roles ur on ur.user_id = u.id where ur.role_id = 'role_principal' order by u.created_at limit 1")).rows[0]?.id ?? null;
  const classes = new Set((await db.query<{ id: string }>('select id from classes')).rows.map((c) => c.id));
  if (!classes.has('cls_8a')) return did;

  if ((await count(db, 'exams')) === 0) {
    const students = async (cls: string) => (await db.query<{ id: string; name: string; pct: number | null }>(
      `select s.id, s.name, e.pct from students s left join exam_results e on e.student_id = s.id and e.exam = 'Unit test 1' where s.class_id = $1 order by s.roll_no`, [cls])).rows;
    const exams: unknown[][] = [];
    const subjects: unknown[][] = [];
    const marks: unknown[][] = [];
    const mk = (id: string, name: string, cls: string, from: string, to: string, status: string, createdBy: string | null) => {
      exams.push([id, name, cls, from, to, status, status === 'published' ? `${addDays(last, -12)}T09:00:00Z` : null, createdBy]);
    };
    const unit = addDays(last, -14);
    mk('exm_8a_ut1', 'Unit test 1', 'cls_8a', unit, addDays(unit, 4), 'published', admin);
    mk('exm_8b_ut1', 'Unit test 1', 'cls_8b', unit, addDays(unit, 4), 'marking', admin);
    mk('exm_8a_mid', 'Mid-term exams', 'cls_8a', addDays(last, 8), addDays(last, 13), 'upcoming', admin);
    for (const e of ['exm_8a_ut1', 'exm_8b_ut1']) SUBJECTS_5.forEach((s, i) => subjects.push([e, s, addDays(unit, i), 100]));
    SUBJECTS_5.forEach((s, i) => subjects.push(['exm_8a_mid', s, addDays(last, 8 + i), 100]));
    // Unit test 1 for 8 A repeats each student's recorded percentage so results and the student page agree.
    for (const s of await students('cls_8a')) {
      const pct = s.pct ?? 72;
      const jitter = s.name === 'Aarav Sharma' ? [0, 0, 0, 0] : [r.int(-6, 6), r.int(-6, 6), r.int(-6, 6), r.int(-6, 6)];
      const parts = [...jitter.map((j) => Math.min(100, Math.max(20, pct + j)))];
      parts.push(Math.min(100, Math.max(0, pct * 5 - parts.reduce((a, b) => a + b, 0))));
      SUBJECTS_5.forEach((sub, i) => marks.push(['exm_8a_ut1', s.id, sub, parts[i], false]));
    }
    // 8 B is still being marked: Maths and English are in, the rest are not.
    for (const s of await students('cls_8b')) {
      const pct = s.pct ?? 70;
      for (const sub of SUBJECTS_5.slice(0, 2)) marks.push(['exm_8b_ut1', s.id, sub, Math.min(100, Math.max(20, pct + r.int(-8, 8))), false]);
    }
    await bulkInsert(db, 'exams', ['id', 'name', 'class_id', 'starts_on', 'ends_on', 'status', 'published_at', 'created_by'], exams);
    await bulkInsert(db, 'exam_subjects', ['exam_id', 'subject_id', 'on_date', 'max_marks'], subjects);
    await bulkInsert(db, 'exam_marks', ['exam_id', 'student_id', 'subject_id', 'score', 'absent'], marks, { chunk: 2000 });
    did.push('exams');
  }

  const hw = await db.query("update homework set description = 'Finish the questions in your notebook and bring it to class. Ask your teacher if anything is unclear.' where description = ''");
  if (hw.rowCount) {
    await db.query('update homework_submissions set score = 11 + (abs(hashtext(student_id || homework_id)) % 10) where handed_at is not null and score is null');
    did.push('homework');
  }

  if ((await count(db, 'threads')) === 0) {
    const g = (await db.query<{ student_id: string; student: string; guardian_id: string; guardian: string }>(
      `select s.id student_id, s.name student, g.id guardian_id, g.name guardian from students s join student_guardians sg on sg.student_id = s.id join guardians g on g.id = sg.guardian_id
       where s.class_id = 'cls_8a' order by s.roll_no limit 8`)).rows;
    const staff = (await db.query<{ id: string; name: string }>("select id, name from users where name in ('Meera Nair','Kavita Iyer') order by name")).rows;
    const subjects = ['Question about Maths homework', 'Request to change the bus stop', 'Receipt for Term 1 fees', 'Absent on Monday: fever', 'Can we meet about my child’s progress?', 'Library book lost', 'Permission for the science trip', 'Uniform size exchange'];
    const bodies = [
      'Hello, my child could not follow question 7 of the linear equations sheet. Could the teacher explain it once more?',
      'We have moved to Aundh. Could the bus stop be changed to the Aundh gate from next week?',
      'Please share the receipt for the Term 1 tuition. We need it for office records.',
      'My child had a fever on Monday and could not attend. Better now and will return tomorrow.',
      'We would like to meet the class teacher this week about the unit test result. Which day suits?',
      'The book borrowed last week has been misplaced. What should we do?',
      'Is the science trip permission slip due on Friday? Sending the signed copy with him.',
      'The uniform we bought is one size small. Can we exchange it at the office?',
    ];
    const replies = ['Thank you for telling us. We will look into it and reply by tomorrow.', 'Noted. The office will update this and confirm in the app.'];
    const th: unknown[][] = [];
    const msgs: unknown[][] = [];
    g.forEach((x, i) => {
      const id = `thr_${i + 1}`;
      // Hours ago from now, so a reply at now() always sorts after the seed (fixed clock-of-day times failed morning CI).
      const at = new Date(Date.now() - (i + 2) * 3_600_000);
      const replied = i % 3 === 0;
      const assigned = replied ? staff[i % staff.length]?.id ?? admin : null;
      th.push([id, x.guardian_id, x.student_id, subjects[i], i === 5 ? 'closed' : 'open', assigned, new Date(at.getTime() + (replied ? 3_600_000 : 0)).toISOString()]);
      msgs.push([newId('tmsg'), id, 'guardian', x.guardian, bodies[i], at.toISOString(), replied || i === 5 ? at.toISOString() : null]);
      if (replied) msgs.push([newId('tmsg'), id, 'staff', staff[i % staff.length]?.name ?? 'School office', replies[i % 2], new Date(at.getTime() + 3_600_000).toISOString(), null]);
    });
    await bulkInsert(db, 'threads', ['id', 'guardian_id', 'student_id', 'subject', 'status', 'assigned_to', 'last_at'], th);
    await bulkInsert(db, 'thread_messages', ['id', 'thread_id', 'from_kind', 'sender_name', 'body', 'created_at', 'read_at'], msgs);
    did.push('messages');
  }

  if ((await count(db, 'events')) < 10) {
    const ev: unknown[][] = [
      ['evt_sports', 'Sports day', `${addDays(last, 11)}T02:30:00Z`, `${addDays(last, 11)}T09:30:00Z`, 'event', 'Bring a water bottle and wear house colours', 'Main ground', 'everyone'],
      ['evt_ptm_c8', 'Parent-teacher meeting, Class 8', `${addDays(last, 5)}T09:00:00Z`, `${addDays(last, 5)}T12:00:00Z`, 'ptm', 'Ten-minute slots, book in the app', 'Class 8 rooms', 'parents'],
      ['evt_diwali', 'Diwali break', `${addDays(last, 20)}T00:00:00Z`, `${addDays(last, 26)}T00:00:00Z`, 'holiday', 'School reopens on the next working Monday', '', 'everyone'],
      ['evt_science', 'Science exhibition', `${addDays(last, 15)}T04:00:00Z`, `${addDays(last, 15)}T08:30:00Z`, 'event', 'Projects from classes 6 to 9', 'Auditorium', 'everyone'],
      ['evt_staff', 'Staff meeting', `${addDays(last, 2)}T10:30:00Z`, `${addDays(last, 2)}T11:30:00Z`, 'routine', 'Mid-term planning', 'Staff room', 'staff'],
      ['evt_midterm', 'Mid-term exams begin', `${addDays(last, 8)}T03:00:00Z`, `${addDays(last, 13)}T08:00:00Z`, 'exam', 'Timetable is on the exams page', '', 'everyone'],
    ];
    await bulkInsert(db, 'events', ['id', 'title', 'starts_at', 'ends_at', 'kind', 'note', 'venue', 'audience'], ev, { onConflict: 'on conflict (id) do nothing' });
    const kids = (await db.query<{ id: string }>("select id from students where class_id in ('cls_8a','cls_8b') order by roll_no limit 40")).rows;
    const rsvp: unknown[][] = [];
    for (const e of ['evt_sports', 'evt_ptm_c8', 'evt_science']) kids.forEach((k) => { const x = r.next(); if (x < 0.8) rsvp.push([e, k.id, x < 0.55 ? 'going' : x < 0.7 ? 'maybe' : 'cant']); });
    await bulkInsert(db, 'event_rsvps', ['event_id', 'student_id', 'status'], rsvp, { onConflict: 'on conflict do nothing' });
    did.push('events');
  }

  if ((await count(db, 'enquiries')) === 0) {
    const e: [string, number, string, string, string, string | null][] = [
      ['Ishaan Rao', 1, 'Meena Rao', 'applied', 'website', null], ['Tara Bhatt', 3, 'Rajesh Bhatt', 'applied', 'walk-in', null], ['Zoya Ansari', 5, 'Farida Ansari', 'test', 'referral', addDays(last, 3)],
      ['Veer Kulkarni', 2, 'Sunil Kulkarni', 'offer', 'phone', null], ['Navya Reddy', 6, 'Anita Reddy', 'enquiry', 'website', null], ['Aryan Thakur', 4, 'Vikram Thakur', 'applied', 'event', null],
      ['Mihika Shah', 1, 'Dipti Shah', 'test', 'walk-in', addDays(last, 5)], ['Rehan Qureshi', 7, 'Salma Qureshi', 'enquiry', 'phone', null], ['Diya Menon', 2, 'Suresh Menon', 'declined', 'website', null],
    ];
    await bulkInsert(db, 'enquiries', ['id', 'child_name', 'grade_sought', 'guardian_name', 'phone', 'stage', 'source', 'test_on', 'created_at'],
      e.map((x, i) => [`enq_${i + 1}`, x[0], x[1], x[2], `+91 98${String(220 + i)} ${String(40100 + i * 37).slice(0, 5)}`, x[3], x[4], x[5], `${addDays(last, -(i % 6))}T06:00:00Z`]));
    did.push('admissions');
  }

  // Priya's second child, so the app's child switcher has something to switch. Students do not get a login.
  const priya = (await db.query<{ gid: string }>("select g.id gid from guardians g join users u on u.id = g.user_id where u.email = 'priya.sharma@example.com' limit 1")).rows[0];
  if (priya && !(await db.query('select 1 from student_guardians where guardian_id = $1 and student_id <> $2', [priya.gid, 'stu_aarav'])).rowCount) {
    const sib = (await db.query<{ id: string }>("select id from students where class_id = 'cls_5b' order by roll_no limit 1")).rows[0];
    if (sib) {
      await db.query("update students set name = 'Ananya Sharma' where id = $1", [sib.id]);
      await db.query('insert into student_guardians (student_id, guardian_id, is_primary) values ($1,$2,false) on conflict do nothing', [sib.id, priya.gid]);
    }
    did.push('family');
  }

  if ((await count(db, 'data_requests')) === 0) {
    await bulkInsert(db, 'data_requests', ['id', 'kind', 'subject_name', 'requested_by', 'status', 'note', 'created_at', 'resolved_at'], [
      ['dsr_1', 'access', 'Aarav Sharma', 'Priya Sharma', 'open', 'A copy of the records kept about Aarav.', `${addDays(last, -2)}T06:30:00Z`, null],
      ['dsr_2', 'correction', 'Anika Rao', 'Lakshmi Rao', 'done', 'Date of birth was wrong on the record. Corrected from the birth certificate.', `${addDays(last, -9)}T06:30:00Z`, `${addDays(last, -7)}T06:30:00Z`],
    ]);
    did.push('privacy');
  }
  return did;
}

/** Brings an older demo school up to date with the sample content of newer modules. Does nothing for a real school. */
export async function topUpDemo(pool: Pool): Promise<string[]> {
  const demo = await pool.query<{ value: unknown }>("select value from settings where key = 'demo.mode'").then((q) => q.rows[0]?.value === true).catch(() => false);
  if (!demo) return [];
  const client = await pool.connect();
  try {
    await client.query('begin');
    const did = await seedModulesDemo(client);
    await client.query('commit');
    return did;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
