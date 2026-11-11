import { Injectable } from '@nestjs/common';
import { initials, type ApprovalDecision, type ApprovalKind, type ApprovalRow, type Permission } from '@gradeon/contracts';
import { ApiError, forbidden, notFound } from '@gradeon/nest-kit';
import type { TenantCtx } from '../tenancy/tenant.js';
import { AttendanceService } from './attendance.service.js';
import { NoticesService } from './notices.service.js';
import { AuditService, Messenger, SettingsService } from './support.js';

interface Row {
  id: string; kind: ApprovalKind; title: string; subtitle: string; requester_name: string; subject_ref: string | null;
  payload: Record<string, unknown>; status: ApprovalRow['status']; created_at: Date; decided_at: Date | null; decision_note?: string; decided_by_name?: string | null;
}

const TONE: Record<ApprovalKind, ApprovalRow['tone']> = { leave: 'blue', fee_waiver: 'mint', attendance: 'amber', notice: 'violet', admission: 'coral', photo: 'violet' };
const ACTION: Record<ApprovalKind, string> = { leave: 'Review', fee_waiver: 'Approve', attendance: 'Remind', notice: 'Publish', admission: 'Approve', photo: 'Use photo' };
/** What a person needs to be allowed to decide each kind. */
const KIND_NEEDS: Record<ApprovalKind, string | null> = { leave: null, fee_waiver: 'fees', notice: 'notices', admission: 'people.admissions', attendance: 'attendance', photo: null };
const NEEDS: Record<ApprovalKind, Permission[]> = {
  leave: ['approvals.decide'], fee_waiver: ['approvals.decide', 'fees.waive'], notice: ['approvals.decide', 'notices.publish'], admission: ['approvals.decide'], attendance: ['attendance.read'],
  photo: ['approvals.decide', 'students.write'],
};

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly audit: AuditService,
    private readonly messenger: Messenger,
    private readonly settings: SettingsService,
    private readonly attendance: AttendanceService,
    private readonly notices: NoticesService,
  ) {}

  private toRow(r: Row, doneText: string): ApprovalRow {
    return {
      id: r.id, kind: r.kind, title: r.title, subtitle: r.subtitle, initials: initials(r.requester_name), tone: TONE[r.kind], action: ACTION[r.kind], doneText,
      status: r.status, createdAt: r.created_at.toISOString(), decidedAt: r.decided_at?.toISOString() ?? null,
      requesterName: r.requester_name, decidedByName: r.decided_by_name ?? null, decisionNote: r.decision_note ?? '',
    };
  }

  private async doneText(t: TenantCtx, r: Row): Promise<string> {
    if (r.kind === 'leave') return 'Leave request reviewed';
    if (r.kind === 'fee_waiver') return 'Concession approved';
    if (r.kind === 'admission') return 'Admission approved';
    if (r.kind === 'photo') return 'New photo in use';
    const noticeId = (r.payload as { noticeId?: string }).noticeId;
    const n = noticeId ? await t.pool.query<{ n: string }>(
      `select count(distinct sg.guardian_id) n from notices x left join students s on x.class_id is null or s.class_id = x.class_id
       join student_guardians sg on sg.student_id = s.id where x.id = $1`, [noticeId]) : null;
    return `Notice sent to ${Number(n?.rows[0]?.n ?? 0).toLocaleString('en-IN')} families`;
  }

  /** The queue behind "Needs you": open requests, plus one line for classes that have not marked attendance. */
/** Request kinds the school has: a fee waiver needs Fees, a notice Notices, an admission the Admissions feature. Leave is always there. */
  async kinds(t: TenantCtx): Promise<ApprovalKind[]> {
    const cfg = await this.settings.effective(t);
    const has = (k: string) => cfg.modules.includes(k) || cfg.features.includes(k);
    return (Object.entries(KIND_NEEDS) as [ApprovalKind, string | null][]).filter(([, need]) => !need || has(need)).map(([k]) => k);
  }

  /** The kinds this person may act on: a module the school has, and the permissions to decide it (a teacher sees no fee waivers). */
  private async mine(t: TenantCtx, perms: readonly string[]): Promise<ApprovalKind[]> {
    return (await this.kinds(t)).filter((k) => NEEDS[k].every((p) => perms.includes(p)));
  }

  async needsYou(t: TenantCtx, perms: readonly string[]): Promise<ApprovalRow[]> {
    const kinds = await this.mine(t, perms);
    const { rows } = await t.pool.query<Row>(
      "select * from approvals where status = 'pending' and kind in ('leave','fee_waiver','notice') and kind = any($1) order by case kind when 'leave' then 1 when 'fee_waiver' then 2 else 3 end, created_at, id limit 8", [kinds]);
    const items = await Promise.all(rows.map(async (r) => this.toRow({ ...r, created_at: r.created_at, decided_at: r.decided_at }, await this.doneText(t, r))));
    const unmarked = kinds.includes('attendance') ? await this.attendance.unmarked(t) : [];
    if (unmarked.length) {
      items.splice(2, 0, {
        id: 'att_reminder', kind: 'attendance', title: `${unmarked.length} ${unmarked.length === 1 ? 'class has' : 'classes have'} not marked`, subtitle: unmarked.map((c) => c.name).join(' · '),
        initials: 'AT', tone: 'amber', action: 'Remind', doneText: `Reminder sent to ${unmarked.length} teachers`, status: 'pending', createdAt: new Date().toISOString(), decidedAt: null,
      });
    }
    return items;
  }

  /**
   * The Approvals page: what waits for this person (kinds they may decide), what they sent (a teacher's notice, an office
   * waiver), and what has been decided, with who decided and why.
   */
  async list(t: TenantCtx, user: { id: string; permissions: readonly string[] }, view: 'waiting' | 'sent' | 'decided' = 'waiting', kind?: ApprovalKind): Promise<ApprovalRow[]> {
    const mine = await this.mine(t, user.permissions);
    const where = view === 'waiting' ? "a.status = 'pending' and a.kind = any($3)" : view === 'sent' ? 'a.requested_by = $4' : "a.status <> 'pending' and a.kind = any($3)";
    const { rows } = await t.pool.query<Row>(
      `select a.*, (select name from users u where u.id = a.decided_by) decided_by_name from approvals a
       where ${where} and ($2::text is null or a.kind = $2) and a.kind = any($1) and $3::text[] is not null and $4::text is not null order by coalesce(a.decided_at, a.created_at) desc, a.id limit 200`,
      [await this.kinds(t), kind ?? null, mine, user.id]);
    return Promise.all(rows.map(async (r) => this.toRow(r, await this.doneText(t, r))));
  }

  async counts(t: TenantCtx, perms: readonly string[]): Promise<{ admissions: number; approvals: number; messages: number }> {
    const [cfg, kinds] = await Promise.all([this.settings.effective(t), this.mine(t, perms)]);
    const { rows } = await t.pool.query<{ admissions: string; approvals: string; messages: string }>(
      "select (select count(*) from enquiries where stage in ('applied','test','offer')) admissions, (select count(*) from approvals where status = 'pending' and kind = any($1)) approvals, (select count(distinct m.thread_id) from thread_messages m join threads x on x.id = m.thread_id where x.status = 'open' and m.from_kind = 'guardian' and m.read_at is null) messages", [kinds]);
    // A badge for a module the school does not have would point at a page it cannot open.
    return {
      admissions: cfg.features.includes('people.admissions') && perms.includes('admissions.read') ? Number(rows[0]!.admissions) : 0,
      approvals: Number(rows[0]!.approvals),
      messages: cfg.modules.includes('chat') && perms.includes('messages.read') ? Number(rows[0]!.messages) : 0,
    };
  }

  async decide(t: TenantCtx, user: { id: string; name: string; permissions: string[] }, id: string, body: ApprovalDecision): Promise<ApprovalRow> {
    const { rows } = await t.pool.query<Row>('select * from approvals where id = $1', [id]);
    const r = rows[0];
    if (!r) throw notFound('That request');
    if (!NEEDS[r.kind].every((p) => user.permissions.includes(p))) throw forbidden('You are not allowed to decide this kind of request.');
    if (body.decision === 'undo' ? r.status === 'pending' : r.status !== 'pending') throw new ApiError('conflict', body.decision === 'undo' ? 'That request is still open.' : 'Someone has already decided this request.');
    const next = body.decision === 'approve' ? 'approved' : body.decision === 'reject' ? 'rejected' : 'pending';
    const client = await t.pool.connect();
    try {
      await client.query('begin');
      let payload = r.payload;
      if (r.kind === 'fee_waiver') payload = await this.applyWaiver(client, r, body.decision, payload);
      if (r.kind === 'notice') await this.applyNotice(client, r, body.decision, user.id);
      if (r.kind === 'photo') await this.applyPhoto(client, r, body.decision);
      await client.query('update approvals set status = $2, decided_by = $3, decided_at = $4, payload = $5, decision_note = $6 where id = $1',
        [id, next, body.decision === 'undo' ? null : user.id, body.decision === 'undo' ? null : new Date(), JSON.stringify(payload), body.decision === 'undo' ? '' : body.note ?? '']);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: `approval.${body.decision}`, entity: r.kind, entityId: id, detail: { title: r.title } });
    if (body.decision !== 'undo' && r.kind === 'leave') await this.tellLeave(t, r, next);
    if (body.decision === 'approve' && r.kind === 'notice') await this.notices.approved(t, String((r.payload as { noticeId?: string }).noticeId ?? ''));
    const after = await t.pool.query<Row>('select * from approvals where id = $1', [id]);
    return this.toRow(after.rows[0]!, await this.doneText(t, after.rows[0]!));
  }

  /** A concession takes a percentage off the student's first unpaid invoice of a head that takes concessions (tuition by default); undo puts it back. */
  private async applyWaiver(client: { query: (q: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }, r: Row, decision: ApprovalDecision['decision'], payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (decision === 'approve') {
      const pct = Number(payload.percent ?? 0);
      const inv = await client.query(
        `select i.id, i.amount from fee_invoices i where i.student_id = $1 and i.head in (select key from fee_heads where concession) and i.amount > coalesce((select sum(amount - refunded) from payments where invoice_id = i.id),0) order by i.due_on limit 1`, [r.subject_ref]);
      const target = inv.rows[0] as { id: string; amount: number } | undefined;
      if (!target) throw new ApiError('conflict', 'This student has no unpaid fee that takes concessions to reduce.');
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
    // Approval publishes after the decision is saved (now, or at its scheduled time); a decline sends it back to its author as a draft.
    if (decision !== 'approve') await client.query("update notices set status = $2, published_at = null where id = $1", [noticeId, decision === 'undo' ? 'pending' : 'draft']);
    else await client.query("update notices set status = 'draft' where id = $1 and status = 'pending'", [noticeId]);
    void userId;
  }

  /** A family's new photo of their child becomes the child's photo (the old one goes); declined, it is deleted. */
  private async applyPhoto(client: { query: (q: string, p?: unknown[]) => Promise<unknown> }, r: Row, decision: ApprovalDecision['decision']): Promise<void> {
    const p = r.payload as { fileId?: string; studentId?: string };
    if (!p.fileId || !p.studentId) return;
    if (decision === 'approve') {
      await client.query("update files set deleted_at = now() where kind = 'student_photo' and owner_id = $1 and id <> $2 and deleted_at is null", [p.studentId, p.fileId]);
      await client.query('update files set owner_id = $1 where id = $2', [p.studentId, p.fileId]);
    } else if (decision === 'reject') await client.query('update files set deleted_at = now() where id = $1', [p.fileId]);
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

}
