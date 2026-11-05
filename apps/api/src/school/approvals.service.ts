import { Injectable } from '@nestjs/common';
import { newId } from '@gradeon/db';
import { initials, type ApprovalDecision, type ApprovalKind, type ApprovalRow, type NoticeCreate, type NoticeRow, type Permission } from '@gradeon/contracts';
import { ApiError, forbidden, notFound } from '@gradeon/nest-kit';
import type { TenantCtx } from '../tenancy/tenant.js';
import { AttendanceService } from './attendance.service.js';
import { AuditService, Messenger, SettingsService } from './support.js';

interface Row {
  id: string; kind: ApprovalKind; title: string; subtitle: string; requester_name: string; subject_ref: string | null;
  payload: Record<string, unknown>; status: 'pending' | 'approved' | 'rejected'; created_at: Date; decided_at: Date | null;
}

const TONE: Record<ApprovalKind, ApprovalRow['tone']> = { leave: 'blue', fee_waiver: 'mint', attendance: 'amber', notice: 'violet', admission: 'coral' };
const ACTION: Record<ApprovalKind, string> = { leave: 'Review', fee_waiver: 'Approve', attendance: 'Remind', notice: 'Publish', admission: 'Approve' };
/** What a person needs to be allowed to decide each kind. */
const NEEDS: Record<ApprovalKind, Permission[]> = {
  leave: ['approvals.decide'], fee_waiver: ['approvals.decide', 'fees.waive'], notice: ['approvals.decide', 'notices.publish'], admission: ['approvals.decide'], attendance: ['attendance.read'],
};

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly audit: AuditService,
    private readonly messenger: Messenger,
    private readonly settings: SettingsService,
    private readonly attendance: AttendanceService,
  ) {}

  private toRow(r: Row, doneText: string): ApprovalRow {
    return {
      id: r.id, kind: r.kind, title: r.title, subtitle: r.subtitle, initials: initials(r.requester_name), tone: TONE[r.kind], action: ACTION[r.kind], doneText,
      status: r.status, createdAt: r.created_at.toISOString(), decidedAt: r.decided_at?.toISOString() ?? null,
    };
  }

  private async doneText(t: TenantCtx, r: Row): Promise<string> {
    if (r.kind === 'leave') return 'Leave request reviewed';
    if (r.kind === 'fee_waiver') return 'Concession approved';
    if (r.kind === 'admission') return 'Admission approved';
    const noticeId = (r.payload as { noticeId?: string }).noticeId;
    const n = noticeId ? await t.pool.query<{ n: string }>(
      `select count(distinct sg.guardian_id) n from notices x left join students s on x.class_id is null or s.class_id = x.class_id
       join student_guardians sg on sg.student_id = s.id where x.id = $1`, [noticeId]) : null;
    return `Notice sent to ${Number(n?.rows[0]?.n ?? 0).toLocaleString('en-IN')} families`;
  }

  /** The queue behind "Needs you": open requests, plus one line for classes that have not marked attendance. */
  async needsYou(t: TenantCtx): Promise<ApprovalRow[]> {
    const { rows } = await t.pool.query<Row>(
      "select * from approvals where status = 'pending' and kind in ('leave','fee_waiver','notice') order by case kind when 'leave' then 1 when 'fee_waiver' then 2 else 3 end, created_at, id limit 8");
    const items = await Promise.all(rows.map(async (r) => this.toRow({ ...r, created_at: r.created_at, decided_at: r.decided_at }, await this.doneText(t, r))));
    const unmarked = await this.attendance.unmarked(t);
    if (unmarked.length) {
      items.splice(2, 0, {
        id: 'att_reminder', kind: 'attendance', title: `${unmarked.length} ${unmarked.length === 1 ? 'class has' : 'classes have'} not marked`, subtitle: unmarked.map((c) => c.name).join(' · '),
        initials: 'AT', tone: 'amber', action: 'Remind', doneText: `Reminder sent to ${unmarked.length} teachers`, status: 'pending', createdAt: new Date().toISOString(), decidedAt: null,
      });
    }
    return items;
  }

  async list(t: TenantCtx, status: 'pending' | 'approved' | 'rejected' | 'all' = 'pending', kind?: ApprovalKind): Promise<ApprovalRow[]> {
    const { rows } = await t.pool.query<Row>(
      `select * from approvals where ($1 = 'all' or status = $1) and ($2::text is null or kind = $2) order by created_at desc, id limit 200`, [status, kind ?? null]);
    return Promise.all(rows.map(async (r) => this.toRow(r, await this.doneText(t, r))));
  }

  async counts(t: TenantCtx): Promise<{ admissions: number; approvals: number; messages: number }> {
    const { rows } = await t.pool.query<{ admissions: string; approvals: string; messages: string }>(
      "select (select count(*) from enquiries where stage in ('applied','test','offer')) admissions, (select count(*) from approvals where status = 'pending') approvals, (select count(distinct m.thread_id) from thread_messages m join threads x on x.id = m.thread_id where x.status = 'open' and m.from_kind = 'guardian' and m.read_at is null) messages");
    return { admissions: Number(rows[0]!.admissions), approvals: Number(rows[0]!.approvals), messages: Number(rows[0]!.messages) };
  }

  async decide(t: TenantCtx, user: { id: string; name: string; permissions: string[] }, id: string, body: ApprovalDecision): Promise<ApprovalRow> {
    const { rows } = await t.pool.query<Row>('select * from approvals where id = $1', [id]);
    const r = rows[0];
    if (!r) throw notFound('That request');
    if (!NEEDS[r.kind].every((p) => user.permissions.includes(p))) throw forbidden('You are not allowed to decide this kind of request.');
    if (r.kind === 'fee_waiver' && body.decision !== 'undo') {
      // Who may approve a waiver is the school's rule, set by Gradeon in the console.
      const rule = await this.settings.value<string>(t, 'approvals.feeWaiver', 'principal');
      const keys = (await t.pool.query<{ key: string }>('select r.key from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = $1', [user.id])).rows.map((x) => x.key);
      const allowed = rule === 'anyone' || keys.includes('principal') || (rule === 'office' && keys.includes('office'));
      if (!allowed) throw forbidden(rule === 'office' ? 'Only the principal or the office can decide fee waivers at your school.' : 'Only the principal can decide fee waivers at your school.');
    }
    if (body.decision === 'undo' ? r.status === 'pending' : r.status !== 'pending') throw new ApiError('conflict', body.decision === 'undo' ? 'That request is still open.' : 'Someone has already decided this request.');
    const next = body.decision === 'approve' ? 'approved' : body.decision === 'reject' ? 'rejected' : 'pending';
    const client = await t.pool.connect();
    try {
      await client.query('begin');
      let payload = r.payload;
      if (r.kind === 'fee_waiver') payload = await this.applyWaiver(client, r, body.decision, payload);
      if (r.kind === 'notice') await this.applyNotice(client, r, body.decision, user.id);
      await client.query('update approvals set status = $2, decided_by = $3, decided_at = $4, payload = $5 where id = $1', [id, next, body.decision === 'undo' ? null : user.id, body.decision === 'undo' ? null : new Date(), JSON.stringify(payload)]);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: `approval.${body.decision}`, entity: r.kind, entityId: id, detail: { title: r.title } });
    if (body.decision !== 'undo' && r.kind === 'leave') await this.tellLeave(t, r, next);
    if (body.decision === 'approve' && r.kind === 'notice') await this.announce(t, (r.payload as { noticeId?: string }).noticeId);
    const after = await t.pool.query<Row>('select * from approvals where id = $1', [id]);
    return this.toRow(after.rows[0]!, await this.doneText(t, after.rows[0]!));
  }

  /** A concession takes a percentage off the student's first unpaid tuition invoice; undo puts it back. */
  private async applyWaiver(client: { query: (q: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }, r: Row, decision: ApprovalDecision['decision'], payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (decision === 'approve') {
      const pct = Number(payload.percent ?? 0);
      const inv = await client.query(
        `select i.id, i.amount from fee_invoices i where i.student_id = $1 and i.head = 'tuition' and i.amount > coalesce((select sum(amount) from payments where invoice_id = i.id),0) order by i.due_on limit 1`, [r.subject_ref]);
      const target = inv.rows[0] as { id: string; amount: number } | undefined;
      if (!target) throw new ApiError('conflict', 'This student has no unpaid tuition invoice to reduce.');
      const waived = Math.round((target.amount * pct) / 100);
      await client.query('update fee_invoices set waived_amount = $2 where id = $1', [target.id, waived]);
      return { ...payload, invoiceId: target.id, waived };
    }
    if (decision === 'undo' || decision === 'reject') {
      if (payload.invoiceId) await client.query('update fee_invoices set waived_amount = 0 where id = $1', [payload.invoiceId]);
      const { invoiceId: _i, waived: _w, ...rest } = payload;
      return rest;
    }
    return payload;
  }

  private async applyNotice(client: { query: (q: string, p?: unknown[]) => Promise<unknown> }, r: Row, decision: ApprovalDecision['decision'], userId: string): Promise<void> {
    const noticeId = (r.payload as { noticeId?: string }).noticeId;
    if (!noticeId) return;
    if (decision === 'approve') await client.query("update notices set status = 'published', published_at = now() where id = $1", [noticeId]);
    else await client.query("update notices set status = $2, published_at = null where id = $1", [noticeId, decision === 'undo' ? 'pending' : 'draft']);
    void userId;
  }

  /** Tells whoever asked: the family for a child's leave, the staff member for their own. */
  async tellLeave(t: TenantCtx, r: { subject_ref: string | null; payload: Record<string, unknown> }, status: string): Promise<void> {
    if (!r.subject_ref) return;
    const p = r.payload as { studentLeave?: boolean; from?: string; to?: string };
    const who = p.studentLeave
      ? await t.pool.query<{ phone: string | null; email: string | null; name: string }>(
        'select g.phone, g.email, s.name from students s join student_guardians sg on sg.student_id = s.id join guardians g on g.id = sg.guardian_id where s.id = $1', [r.subject_ref])
      : await t.pool.query<{ phone: string | null; email: string | null; name: string }>("select phone, email, 'you' as name from users where id = $1", [r.subject_ref]);
    await this.messenger.notify(t, 'leave.decided', who.rows.filter((w) => w.phone || w.email).map((w) => ({
      to: w.phone ?? '', email: w.email, vars: { who: w.name, from: p.from ?? '', to: p.to ?? '', status },
    })));
  }

  /** A published notice reaches the people it was written for. */
  private async announce(t: TenantCtx, noticeId: string | undefined): Promise<void> {
    const n = (await t.pool.query<{ title: string; audience: string; class_id: string | null }>('select title, audience, class_id from notices where id = $1 and status = $2', [noticeId, 'published'])).rows[0];
    if (!n) return;
    const families = n.audience === 'staff' ? { rows: [] } : await t.pool.query<{ phone: string }>(
      `select distinct g.phone from guardians g join student_guardians sg on sg.guardian_id = g.id join students s on s.id = sg.student_id
       where s.status = 'active' and g.phone is not null and ($1::text is null or s.class_id = $1)`, [n.class_id]);
    const staff = n.audience === 'parents' || n.class_id ? { rows: [] } : await t.pool.query<{ phone: string }>(
      "select u.phone from users u join staff s on s.user_id = u.id where u.status = 'active' and u.phone is not null");
    await this.messenger.notify(t, 'notice.published', [...families.rows, ...staff.rows].map((x) => ({ to: x.phone, vars: { title: n.title } })));
  }

  // Notices

  async notices(t: TenantCtx): Promise<NoticeRow[]> {
    const { rows } = await t.pool.query<{ id: string; title: string; body: string; audience: string; status: NoticeRow['status']; author: string | null; published_at: Date | null; created_at: Date }>(
      `select n.id, n.title, n.body, n.audience, n.status, u.name author, n.published_at, n.created_at from notices n left join users u on u.id = n.author_id order by coalesce(n.published_at, n.created_at) desc limit 100`);
    return rows.map((r) => ({ id: r.id, title: r.title, body: r.body, audience: r.audience, status: r.status, author: r.author ?? 'System', publishedAt: r.published_at?.toISOString() ?? null, createdAt: r.created_at.toISOString() }));
  }

  async createNotice(t: TenantCtx, user: { id: string; name: string; permissions: string[] }, body: NoticeCreate): Promise<NoticeRow> {
    const id = newId('ntc');
    const canPublish = user.permissions.includes('notices.publish');
    const needsApproval = body.publish && !canPublish && (await this.settings.value<string>(t, 'approvals.notice', 'required')) === 'required';
    const status = !body.publish ? 'draft' : needsApproval ? 'pending' : 'published';
    if (body.publish && !canPublish && !needsApproval) throw forbidden('You are not allowed to publish notices.');
    await t.pool.query('insert into notices (id, title, body, audience, class_id, status, author_id, published_at) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, body.title, body.body, body.audience, body.classId ?? null, status, user.id, status === 'published' ? new Date() : null]);
    if (status === 'pending') {
      await t.pool.query("insert into approvals (id, kind, title, subtitle, requester_name, subject_ref, payload) values ($1,'notice',$2,$3,$4,$5,$6)",
        [newId('apr'), body.title, `Drafted by ${user.name}`, user.name, id, JSON.stringify({ noticeId: id })]);
    }
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: `notice.${status}`, entity: 'notice', entityId: id, detail: { title: body.title } });
    if (status === 'published') await this.announce(t, id);
    return (await this.notices(t)).find((n) => n.id === id)!;
  }
}
