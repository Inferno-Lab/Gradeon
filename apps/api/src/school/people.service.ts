import { Injectable } from '@nestjs/common';
import { newId } from '@gradeon/db';
import {
  PERMISSIONS, initials,
  type EnquiryCreate, type EnquiryEnrol, type EnquiryPatch, type EnquiryRow, type EnquiryStage, type RoleRow, type StaffCreate, type StaffPatch, type StaffRow, type StudentDetail,
} from '@gradeon/contracts';
import { hashPassword, randomToken } from '@gradeon/security';
import { ApiError, forbidden, notFound } from '@gradeon/nest-kit';
import type { TenantCtx } from '../tenancy/tenant.js';
import { AuthService } from '../auth/auth.service.js';
import { StudentsService } from './students.service.js';
import { AuditService, Messenger, SettingsService } from './support.js';

type User = { id: string; name: string };

interface StaffSql {
  id: string; name: string; email: string | null; phone: string | null; status: string; designation: string; department: string | null; joined_on: string | null; max_periods: number; periods: string;
}

/** Staff, the admissions pipeline and the roles that decide what each person may do. */
@Injectable()
export class PeopleService {
  constructor(
    private readonly audit: AuditService,
    private readonly messenger: Messenger,
    private readonly students: StudentsService,
    private readonly auth: AuthService,
    private readonly settings: SettingsService,
  ) {}

  /** The console decides whether the school may put its own staff into roles (the roles themselves are always Gradeon's). */
  private async schoolAssignsRoles(t: TenantCtx): Promise<boolean> {
    return (await this.settings.value<boolean>(t, 'staff.schoolAssignsRoles', true)) !== false;
  }

  // Staff

  async staff(t: TenantCtx, q: { query?: string; id?: string } = {}): Promise<StaffRow[]> {
    const { rows } = await t.pool.query<StaffSql>(
      `select u.id, u.name, u.email, u.phone, u.status, s.designation, s.department, s.joined_on::text, s.max_periods_per_week max_periods,
         (select count(*) from timetable_slots ts where ts.teacher_id = u.id) periods
       from users u join staff s on s.user_id = u.id
       where ($1::text is null or u.id = $1) and ($2::text is null or u.name ilike '%' || $2 || '%' or s.designation ilike '%' || $2 || '%' or s.department ilike '%' || $2 || '%')
       order by (s.designation = 'Principal') desc, u.name limit 300`, [q.id ?? null, q.query?.replace(/[\\%_]/g, (c) => `\\${c}`) ?? null]);
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [subs, roles] = await Promise.all([
      t.pool.query<{ user_id: string; id: string; name: string }>('select ss.user_id, s.id, s.name from staff_subjects ss join subjects s on s.id = ss.subject_id where ss.user_id = any($1) order by s.name', [ids]),
      t.pool.query<{ user_id: string; id: string; name: string }>('select ur.user_id, r.id, r.name from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = any($1) order by r.name', [ids]),
    ]);
    return rows.map((r) => ({
      id: r.id, name: r.name, initials: initials(r.name), email: r.email, phone: r.phone, designation: r.designation, department: r.department,
      subjects: subs.rows.filter((s) => s.user_id === r.id).map((s) => ({ id: s.id, name: s.name })),
      roles: roles.rows.filter((x) => x.user_id === r.id).map((x) => ({ id: x.id, name: x.name })),
      periodsPerWeek: Number(r.periods), maxPeriods: r.max_periods, status: r.status === 'active' ? 'active' : 'inactive', joinedOn: r.joined_on,
    }));
  }

  async createStaff(t: TenantCtx, user: User, body: StaffCreate): Promise<StaffRow> {
    // When only Gradeon assigns roles, a new person starts with none (and sees nothing) until Gradeon gives them one.
    const assigns = await this.schoolAssignsRoles(t);
    const role = assigns ? (await t.pool.query<{ id: string; name: string }>('select id, name from roles where id = $1', [body.roleId])).rows[0] : { id: '', name: 'none yet' };
    if (!role) throw new ApiError('validation', 'Choose a role from the list.', { fields: { roleId: 'Choose a role from the list.' } });
    const dup = await t.pool.query('select 1 from users where lower(email) = $1', [body.email]);
    if (dup.rowCount) throw new ApiError('validation', 'Someone already uses that email.', { fields: { email: 'Someone already uses that email.' } });
    const id = newId('usr');
    const temp = `${randomToken(6).replace(/[^a-zA-Z0-9]/g, 'k').slice(0, 8)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const known = body.subjectIds.length ? (await t.pool.query<{ id: string }>('select id from subjects where id = any($1)', [body.subjectIds])).rows.map((s) => s.id) : [];
    const client = await t.pool.connect();
    try {
      await client.query('begin');
      await client.query("insert into users (id, kind, name, email, phone, password_hash) values ($1,'staff',$2,$3,$4,$5)", [id, body.name, body.email, body.phone, await hashPassword(temp)]);
      await client.query('insert into staff (user_id, designation, department, joined_on) values ($1,$2,$3,current_date)', [id, body.designation, body.department ?? null]);
      for (const s of known) await client.query('insert into staff_subjects (user_id, subject_id) values ($1,$2)', [id, s]);
      if (role.id) await client.query('insert into user_roles (user_id, role_id) values ($1,$2)', [id, role.id]);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      if ((err as { code?: string }).code === '23505') throw new ApiError('validation', 'Someone already uses that email or phone number.', { fields: { email: 'Someone already uses that email or phone number.' } });
      throw err;
    } finally {
      client.release();
    }
    await this.messenger.notify(t, 'staff.invite', [{ to: body.phone, email: body.email, vars: { name: body.name.split(' ')[0]!, password: temp } }]);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'staff.added', entity: 'staff', entityId: id, detail: { name: body.name, role: role.name } });
    return (await this.staff(t, { id }))[0]!;
  }

  async patchStaff(t: TenantCtx, user: User, id: string, body: StaffPatch): Promise<StaffRow> {
    const me = id === user.id;
    if (me && (body.roleId || body.status === 'inactive')) throw forbidden('You cannot change your own role or switch yourself off. Ask another administrator.');
    const cur = (await t.pool.query<{ designation: string }>('select designation from staff where user_id = $1', [id])).rows[0];
    if (!cur) throw notFound('That person');
    if (body.roleId && !(await this.schoolAssignsRoles(t))) throw forbidden('Gradeon assigns roles at your school. Ask Gradeon to change this person’s role.');
    const client = await t.pool.connect();
    try {
      await client.query('begin');
      if (body.designation !== undefined || body.department !== undefined) {
        await client.query('update staff set designation = coalesce($2, designation), department = case when $3 then $4 else department end where user_id = $1',
          [id, body.designation ?? null, body.department !== undefined, body.department ?? null]);
      }
      if (body.status) {
        await client.query('update users set status = $2 where id = $1', [id, body.status]);
        if (body.status === 'inactive') await client.query('update sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [id]);
      }
      if (body.subjectIds) {
        await client.query('delete from staff_subjects where user_id = $1', [id]);
        for (const s of body.subjectIds) await client.query('insert into staff_subjects (user_id, subject_id) select $1, id from subjects where id = $2', [id, s]);
      }
      if (body.roleId) {
        const r = await client.query('select 1 from roles where id = $1', [body.roleId]);
        if (!r.rowCount) throw new ApiError('validation', 'Choose a role from the list.');
        await client.query('delete from user_roles where user_id = $1', [id]);
        await client.query('insert into user_roles (user_id, role_id) values ($1,$2)', [id, body.roleId]);
      }
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    if (body.roleId || body.status === 'inactive') await this.auth.bumpVersion(t, id);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'staff.changed', entity: 'staff', entityId: id, detail: Object.fromEntries(Object.entries(body).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v)])) });
    return (await this.staff(t, { id }))[0]!;
  }

  // Admissions

  private enquiryRow(r: { id: string; child_name: string; grade_sought: number; guardian_name: string; phone: string; email: string | null; source: string; stage: EnquiryStage; test_on: string | null; note: string; student_id: string | null; created_at: Date }): EnquiryRow {
    return {
      id: r.id, childName: r.child_name, initials: initials(r.child_name), gradeSought: r.grade_sought, guardianName: r.guardian_name, phone: r.phone, email: r.email, source: r.source,
      stage: r.stage, testOn: r.test_on, note: r.note, studentId: r.student_id, createdAt: r.created_at.toISOString(),
    };
  }

  private readonly enquirySql = 'select id, child_name, grade_sought, guardian_name, phone, email, source, stage, test_on::text, note, student_id, created_at from enquiries';

  async enquiries(t: TenantCtx): Promise<EnquiryRow[]> {
    const { rows } = await t.pool.query(`${this.enquirySql} order by created_at desc, id limit 300`);
    return rows.map((r) => this.enquiryRow(r));
  }

  private async enquiry(t: TenantCtx, id: string): Promise<EnquiryRow> {
    const { rows } = await t.pool.query(`${this.enquirySql} where id = $1`, [id]);
    if (!rows[0]) throw notFound('That application');
    return this.enquiryRow(rows[0]);
  }

  async createEnquiry(t: TenantCtx, user: User, body: EnquiryCreate): Promise<EnquiryRow> {
    const id = newId('enq');
    await t.pool.query('insert into enquiries (id, child_name, grade_sought, guardian_name, phone, email, source, note) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, body.childName, body.gradeSought, body.guardianName, body.phone, body.email || null, body.source, body.note]);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'admission.enquiry', entity: 'enquiry', entityId: id, detail: { child: body.childName } });
    return this.enquiry(t, id);
  }

  async patchEnquiry(t: TenantCtx, user: User, id: string, body: EnquiryPatch): Promise<EnquiryRow> {
    const cur = await this.enquiry(t, id);
    if (cur.stage === 'enrolled') throw new ApiError('conflict', 'This child is already enrolled. Change them from the Students page.');
    if (body.stage === 'enrolled') throw new ApiError('validation', 'Use “Enrol” to turn an application into a student.');
    const stage = body.stage ?? cur.stage;
    if (stage === 'test' && !(body.testOn ?? cur.testOn)) throw new ApiError('validation', 'Pick the day of the entrance test.', { fields: { testOn: 'Pick the day of the test.' } });
    await t.pool.query('update enquiries set stage = $2, test_on = $3, note = $4, updated_at = now() where id = $1', [id, stage, stage === 'test' ? (body.testOn ?? cur.testOn) : (body.testOn === undefined ? cur.testOn : body.testOn), body.note ?? cur.note]);
    if (body.stage === 'offer' && cur.stage !== 'offer' && cur.phone) {
      await this.messenger.notify(t, 'admissions.offer', [{ to: cur.phone, email: cur.email, vars: { child: cur.childName } }]);
    }
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'admission.moved', entity: 'enquiry', entityId: id, detail: { child: cur.childName, to: stage } });
    return this.enquiry(t, id);
  }

  async enrol(t: TenantCtx, user: User, id: string, body: EnquiryEnrol): Promise<StudentDetail> {
    const e = await this.enquiry(t, id);
    if (e.stage === 'enrolled') throw new ApiError('conflict', 'This child is already enrolled.');
    if (e.stage === 'declined') throw new ApiError('conflict', 'This application was declined. Move it back to a stage first.');
    if (e.phone.trim().length < 8) throw new ApiError('validation', 'Add the guardian’s phone number to the application first.');
    const student = await this.students.create(t, { name: e.childName, classId: body.classId, dob: body.dob, guardianName: e.guardianName, guardianPhone: e.phone }, user);
    await t.pool.query("update enquiries set stage = 'enrolled', student_id = $2, updated_at = now() where id = $1", [id, student.id]);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'admission.enrolled', entity: 'enquiry', entityId: id, detail: { child: e.childName, admissionNo: student.admissionNo } });
    return student;
  }

  // Roles

  async roles(t: TenantCtx): Promise<RoleRow[]> {
    const { rows } = await t.pool.query<{ id: string; key: string; name: string; description: string; permissions: string[]; locked: boolean; people: string }>(
      'select r.id, r.key, r.name, r.description, r.permissions, r.locked, (select count(*) from user_roles ur where ur.role_id = r.id) people from roles r order by r.locked desc, r.name');
    const known = new Set<string>(PERMISSIONS);
    return rows.map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description, permissions: r.permissions.filter((p) => known.has(p)) as RoleRow['permissions'], locked: r.locked, people: Number(r.people) }));
  }
}
