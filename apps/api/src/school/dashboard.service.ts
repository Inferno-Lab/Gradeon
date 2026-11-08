import { Injectable } from '@nestjs/common';
import {
  addDays, dayLabel, dayMonth, dayName, istMinutes, istNow, istToday, latestSchoolDay, schoolDaysEnding,
  type DashboardData, type FeeSummary, type SearchHit, type ShellData,
} from '@gradeon/contracts';
import type { TenantCtx } from '../tenancy/tenant.js';
import { ApprovalsService } from './approvals.service.js';
import { AttendanceService } from './attendance.service.js';
import { FeesService } from './fees.service.js';
import { SettingsService } from './support.js';

/** The run-up to exams that the sidebar card counts down through. */
const REVISION_WINDOW_DAYS = 17;

const NO_FEES: FeeSummary = { monthLabel: '', due: 0, collected: 0, pending: 0, overdue: 0, overdueFamilies: 0, pct: 0, collectedDelta: 0, byHead: [], daily: [], dailyTarget: 0 };

@Injectable()
export class DashboardService {
  constructor(
    private readonly settings: SettingsService,
    private readonly approvals: ApprovalsService,
    private readonly attendance: AttendanceService,
    private readonly fees: FeesService,
  ) {}

  async get(t: TenantCtx, user: { id: string; name: string }, count = 6): Promise<DashboardData> {
    const OFF_DAYS = await this.settings.offDays(t);
    const today = istToday();
    const last = latestSchoolDay(today, OFF_DAYS);
    const doc = await this.settings.doc(t);
    const v = doc.values;
    const rollIds = ((v['dashboard.rollClasses'] as string[] | undefined) ?? []).slice(0, 6);
    const { modules } = await this.settings.effective(t);
    // A module the school does not have is not queried at all, so its numbers never leave the server.
    // `none` stands in for the result (only the fields the dashboard reads), so it is not typed as a full query result.
    const on = <T>(m: string, run: () => Promise<T>, none: unknown): Promise<T> => (modules.includes(m) ? run() : Promise.resolve(none as T));
    const noRows = { rows: [] };
    const [me, week, feeSummary, needs, counts, unmarked, present, prevPresent, hw, rolls, events, classCount, studentTotal] = await Promise.all([
      t.pool.query<{ name: string; role_name: string | null }>("select u.name, (select string_agg(r.name, ', ') from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = u.id) role_name from users u where u.id = $1", [user.id]),
      on('attendance', () => this.attendance.week(t, count), []),
      on('fees', () => this.fees.summary(t, count), NO_FEES),
      this.approvals.needsYou(t),
      this.approvals.counts(t),
      on('attendance', () => this.attendance.unmarked(t), []),
      on('attendance', () => t.pool.query<{ present: string }>("select count(*) filter (where m.status in ('present','late')) present from attendance_sessions s join attendance_marks m on m.session_id = s.id where s.date = $1", [last]), { rows: [{ present: '0' }] }),
      on('attendance', () => t.pool.query<{ pct: number | null }>("select avg(case when m.status in ('present','late') then 1.0 else 0.0 end) pct from attendance_sessions s join attendance_marks m on m.session_id = s.id where s.date = $1", [addDays(last, -7)]), { rows: [{ pct: null }] }),
      on('homework', () => this.homeworkWeek(t, last, count), Array.from({ length: count }, () => 0)),
      on('attendance', () => this.classRolls(t, last, rollIds), []),
      on('events', () => t.pool.query<{ id: string; at: Date; title: string; note: string }>("select id, starts_at at, title, note from events where (starts_at at time zone 'Asia/Kolkata')::date = $1 order by starts_at", [last]), noRows),
      t.pool.query<{ n: string }>('select count(*) n from classes'),
      t.pool.query<{ n: string }>("select count(*) n from students where status = 'active'"),
    ]);
    const total = Number(studentTotal.rows[0]!.n);
    const presentNow = Number(present.rows[0]!.present);
    const lastWeekPct = prevPresent.rows[0]?.pct ?? null;
    const nowPct = total ? presentNow / total : 0;
    const examsStart = (v['term.examsStart'] as string | undefined) ?? addDays(last, 30);
    const daysToGo = Math.max(0, Math.round((new Date(examsStart).getTime() - new Date(today).getTime()) / 86_400_000));
    const stamp = istNow();
    const clock = `${String(stamp.getUTCHours()).padStart(2, '0')}:${String(stamp.getUTCMinutes()).padStart(2, '0')}`;
    const timeline = events.rows.map((e) => {
      const ist = new Date(e.at.getTime() + 5.5 * 3600_000);
      return { id: e.id, minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes(), time: `${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}`, title: e.title, subtitle: e.note };
    });
    const mins = istMinutes();
    const isToday = last === today;
    let nowIdx = -1;
    if (isToday) timeline.forEach((e, i) => { if (e.minutes <= mins) nowIdx = i; });
    const first = timeline[0]?.minutes ?? 0;
    const lastM = timeline[timeline.length - 1]?.minutes ?? 1;
    const progress = !isToday ? 100 : Math.max(0, Math.min(100, Math.round(((mins - first) / Math.max(1, lastM - first)) * 100)));
    const goalA = Number(v['attendance.goalPct'] ?? 95);
    const goalH = Number(v['homework.goalPct'] ?? 85);
    const days = schoolDaysEnding(last, count, OFF_DAYS);
    return {
      modules,
      greetingName: me.rows[0]?.name ?? user.name, roleLabel: me.rows[0]?.role_name ?? (user.id.startsWith('support:') ? 'Gradeon support' : ''), schoolName: String(v['school.name'] ?? t.info.name),
      day: { date: last, label: dayLabel(last), isToday, clock },
      term: { name: String(v['term.name'] ?? 'Term 1'), examsLabel: `Exams start ${dayMonth(examsStart)}`, daysToGo, progress: Math.max(0, Math.min(100, Math.round(100 * (1 - daysToGo / REVISION_WINDOW_DAYS)))) },
      subtitle: { marked: Number(classCount.rows[0]!.n) - unmarked.length, classes: Number(classCount.rows[0]!.n) },
      present: {
        value: presentNow, total, deltaPct: lastWeekPct === null ? 0 : Math.round((nowPct - lastWeekPct) * 1000) / 10,
        versus: `vs last ${dayName(addDays(last, -7))}`,
      },
      fees: { collected: feeSummary.collected, due: feeSummary.due, pct: feeSummary.pct, deltaPct: feeSummary.collectedDelta, overdueFamilies: feeSummary.overdueFamilies, monthLabel: feeSummary.monthLabel },
      approvals: { count: needs.length, avatars: needs.slice(0, 3).map((n) => ({ initials: n.initials, tone: n.tone })) },
      charts: {
        attendance: { goal: goalA, points: week },
        fees: { goal: feeSummary.dailyTarget, points: feeSummary.daily },
        homework: { goal: goalH, points: hw.map((h, i) => ({ date: days[i]!, label: dayName(days[i]!, true), full: `${dayName(days[i]!)} ${dayMonth(days[i]!)}${days[i] === last ? ' · today' : ''}`, pct: h, isToday: days[i] === last })) },
      },
      feeHeads: feeSummary.byHead,
      classRolls: rolls,
      needsYou: needs,
      timeline: timeline.map((e, i) => ({ id: e.id, time: e.time, title: e.title, subtitle: e.subtitle, state: !isToday ? 'done' : i < nowIdx ? 'done' : i === nowIdx ? 'now' : 'next' })),
      timelineProgress: progress,
      badges: { attendance: unmarked.length, admissions: counts.admissions, messages: counts.messages },
    };
  }

  private async homeworkWeek(t: TenantCtx, last: string, count: number): Promise<number[]> {
    const OFF_DAYS = await this.settings.offDays(t);
    const days = schoolDaysEnding(last, count, OFF_DAYS);
    const { rows } = await t.pool.query<{ d: string; pct: number | null }>(
      `select to_char(h.assigned_on,'YYYY-MM-DD') d, avg(case when hs.on_time then 100.0 else 0.0 end) pct from homework h join homework_submissions hs on hs.homework_id = h.id where h.assigned_on = any($1::date[]) group by 1`, [days]);
    const m = new Map(rows.map((r) => [r.d, Math.round(Number(r.pct ?? 0))]));
    return days.map((d) => m.get(d) ?? 0);
  }

  private async classRolls(t: TenantCtx, last: string, ids: string[]): Promise<DashboardData['classRolls']> {
    const { rows } = await t.pool.query<{ id: string; name: string; size: string; present: string; late: string; absent: string; marked: string }>(
      `select c.id, c.name, (select count(*) from students s where s.class_id = c.id) size,
         count(m.status) filter (where m.status = 'present') present, count(m.status) filter (where m.status = 'late') late,
         count(m.status) filter (where m.status in ('absent','leave')) absent, count(m.status) marked
       from classes c left join attendance_sessions ses on ses.class_id = c.id and ses.date = $2 left join attendance_marks m on m.session_id = ses.id
       where ($1::text[] is null or cardinality($1::text[]) = 0 or c.id = any($1)) group by c.id, c.name, c.grade, c.section order by c.grade, c.section limit 6`, [ids.length ? ids : null, last]);
    return rows.map((r) => {
      const size = Number(r.size);
      const marked = Number(r.marked);
      return { classId: r.id, name: r.name, size, present: Number(r.present), late: Number(r.late), absent: Number(r.absent), unmarked: Math.max(0, size - marked), pct: marked ? Math.round(((Number(r.present) + Number(r.late)) / marked) * 100) : 0 };
    });
  }

  /** The small slice every page needs for the menu. */
  async shell(t: TenantCtx, modules: string[], features: string[]): Promise<ShellData> {
    const OFF_DAYS = await this.settings.offDays(t);
    const last = latestSchoolDay(istToday(), OFF_DAYS);
    const v = (await this.settings.doc(t)).values;
    const [unmarked, counts] = await Promise.all([modules.includes('attendance') ? this.attendance.unmarked(t) : Promise.resolve([]), this.approvals.counts(t)]);
    const examsStart = (v['term.examsStart'] as string | undefined) ?? addDays(last, 30);
    const daysToGo = Math.max(0, Math.round((new Date(examsStart).getTime() - new Date(istToday()).getTime()) / 86_400_000));
    return {
      school: { name: String(v['school.name'] ?? t.info.name), shortName: String(v['school.shortName'] ?? t.info.shortName), logoText: String(v['brand.logoText'] ?? '') || String(v['school.shortName'] ?? t.info.shortName).slice(0, 1).toUpperCase(), place: String(v['school.place'] ?? ''),
        color: String(v['brand.color'] ?? ''), address: String(v['school.address'] ?? ''), phone: String(v['school.phone'] ?? ''), receiptNote: String(v['fees.receiptNote'] ?? ''), studentWord: String(v['vocab.student'] ?? '').trim() || 'Student', classWord: String(v['vocab.class'] ?? '').trim() || 'Class',
        paymentMethods: Array.isArray(v['fees.paymentMethods']) ? (v['fees.paymentMethods'] as string[]) : ['cash', 'upi', 'card', 'netbanking', 'cheque'] },
      term: { name: String(v['term.name'] ?? 'Term 1'), examsLabel: `Exams start ${dayMonth(examsStart)}`, daysToGo, progress: Math.max(0, Math.min(100, Math.round(100 * (1 - daysToGo / REVISION_WINDOW_DAYS)))) },
      badges: { attendance: unmarked.length, admissions: counts.admissions, messages: counts.messages }, modules, features,
    };
  }

  async search(t: TenantCtx, q: string, perms: string[], modules: string[]): Promise<SearchHit[]> {
    const needle = q.trim();
    const all: SearchHit[] = [
      { group: 'Go to', title: 'Dashboard', hint: 'Overview', href: '/', keys: 'G D' },
      ...(perms.includes('students.read') ? [{ group: 'Go to' as const, title: 'Students', hint: 'People', href: '/students', keys: 'G S' }] : []),
      ...(perms.includes('timetable.read') && modules.includes('timetable') ? [{ group: 'Go to' as const, title: 'Timetable', hint: 'Teach', href: '/timetable', keys: 'G T' }] : []),
      ...(perms.includes('settings.read') ? [{ group: 'Go to' as const, title: 'Settings', hint: 'School', href: '/settings', keys: 'G ,' }] : []),
    ];
    const pages = all.filter((p) => !needle || p.title.toLowerCase().includes(needle.toLowerCase()));
    if (!needle) return [...pages, ...(perms.includes('students.read') ? [{ group: 'Actions' as const, title: 'Add student', hint: 'People', href: 'action:add-student', keys: 'N S' }] : [])];
    const out: SearchHit[] = [];
    if (perms.includes('students.read')) {
      const like = `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const { rows } = await t.pool.query<{ id: string; name: string; class_name: string; admission_no: string }>(
        `select s.id, s.name, c.name class_name, s.admission_no from students s join classes c on c.id = s.class_id where s.name ilike $1 or s.admission_no ilike $1 order by lower(s.name) limit 6`, [like]);
      out.push(...rows.map((r) => ({ group: 'People' as const, title: r.name, hint: r.class_name, href: `/students?open=${r.id}`, keys: r.class_name })));
      if (rows[0] && perms.includes('fees.collect') && modules.includes('fees')) out.push({ group: 'Actions', title: `Collect fee for ${rows[0].name}`, hint: 'Fees', href: `/students?open=${rows[0].id}&pay=1`, keys: 'N F' });
    }
    return [...pages, ...out];
  }
}
