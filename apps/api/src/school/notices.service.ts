import { Injectable, type OnModuleInit } from '@nestjs/common';
import { enqueue, newId, type Job } from '@gradeon/db';
import type { NoticeCreate, NoticeRow } from '@gradeon/contracts';
import { ApiError, forbidden, notFound } from '@gradeon/nest-kit';
import { TenantService, type TenantCtx } from '../tenancy/tenant.js';
import { FilesService } from './files.service.js';
import { HubService } from './hub.service.js';
import { StreamService } from './stream.service.js';
import { AuditService, Messenger, SettingsService } from './support.js';

type User = { id: string; name: string; permissions: readonly string[] };
type Row = {
  id: string; title: string; body: string; audience: string; class_id: string | null; class_name: string | null; category: string; pinned: boolean; needs_ack: boolean;
  status: 'draft' | 'pending' | 'published'; author: string | null; author_id: string | null; published_at: Date | null; publish_at: Date | null; edited_at: Date | null; created_at: Date;
};

/** The people a notice reaches, as SQL over users (parents, students, staff), for counts and messages alike. */
const REACH = `
  select distinct u.id, u.phone from users u
  where u.status = 'active' and (
    (n.audience in ('everyone','parents','class') and u.id in (select g.user_id from guardians g join student_guardians sg on sg.guardian_id = g.id join students s on s.id = sg.student_id
      where s.status = 'active' and (n.class_id is null or s.class_id = n.class_id)))
    or (n.audience in ('everyone','students','class') and u.id in (select s.user_id from students s where s.status = 'active' and (n.class_id is null or s.class_id = n.class_id)))
    or (n.audience in ('everyone','staff') and n.class_id is null and u.kind = 'staff'))`;

/**
 * Notices from the office and from teachers: written, scheduled, approved where the school asks, published, corrected and taken
 * down. A notice reaches parents, students, staff or one class; the office sees how many opened it and who has not acknowledged.
 */
@Injectable()
export class NoticesService implements OnModuleInit {
  constructor(
    private readonly audit: AuditService,
    private readonly messenger: Messenger,
    private readonly settings: SettingsService,
    private readonly files: FilesService,
    private readonly hubs: HubService,
    private readonly stream: StreamService,
    private readonly tenants: TenantService,
  ) {}

  onModuleInit(): void {
    this.hubs.handle('notices.publish', (job) => this.publishDue(job));
  }

  private readonly sql = `select n.*, c.name class_name, u.name author from notices n left join classes c on c.id = n.class_id left join users u on u.id = n.author_id where n.deleted_at is null`;

  private async rows(t: TenantCtx, where = '', params: unknown[] = []): Promise<NoticeRow[]> {
    const { rows } = await t.pool.query<Row>(`${this.sql} ${where} order by n.pinned desc, coalesce(n.published_at, n.publish_at, n.created_at) desc limit 200`, params);
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [files, reach] = await Promise.all([
      this.files.list(t, 'notice_attachment', ids),
      t.pool.query<{ id: string; audience: string; read: string; acked: string }>(
        `select n.id, (select count(*) from (${REACH}) x) audience,
           (select count(*) from notice_reads r where r.notice_id = n.id) read, (select count(*) from notice_reads r where r.notice_id = n.id and r.acked_at is not null) acked
         from notices n where n.id = any($1) and n.status = 'published'`, [ids]),
    ]);
    return rows.map((r) => {
      const c = reach.rows.find((x) => x.id === r.id);
      return {
        id: r.id, title: r.title, body: r.body, audience: r.audience, classId: r.class_id, className: r.class_name, category: r.category, pinned: r.pinned, needsAck: r.needs_ack,
        status: r.status !== 'published' && r.publish_at ? 'scheduled' : r.status, author: r.author ?? 'School office', authorId: r.author_id,
        publishedAt: r.published_at?.toISOString() ?? null, publishAt: r.publish_at?.toISOString() ?? null, editedAt: r.edited_at?.toISOString() ?? null, createdAt: r.created_at.toISOString(),
        files: files.filter((f) => f.ownerId === r.id && f.status === 'clean').map((f) => ({ id: f.id, name: f.name, mime: f.mime })),
        reach: { audience: Number(c?.audience ?? 0), read: Number(c?.read ?? 0), acked: Number(c?.acked ?? 0) },
      };
    });
  }

  /** The office's list: everything. A teacher's: what they wrote. */
  list(t: TenantCtx, user: User): Promise<NoticeRow[]> {
    return user.permissions.includes('notices.publish') ? this.rows(t) : this.rows(t, 'and n.author_id = $1', [user.id]);
  }

  /** Who may send this, to whom, pinned or not; and which category. A teacher writes to the classes they teach. */
  private async check(t: TenantCtx, user: User, b: NoticeCreate): Promise<void> {
    const whole = b.audience !== 'class';
    if (whole && !user.permissions.includes('notices.publish')) throw forbidden('Only someone allowed to publish notices can write to the whole school. Choose one of your classes.');
    if (b.pinned && !user.permissions.includes('notices.pin')) throw forbidden('Your role cannot pin notices.');
    if (!whole && !user.permissions.includes('notices.publish')) {
      const teaches = await t.pool.query('select 1 from classes c where c.id = $1 and (c.class_teacher_id = $2 or exists (select 1 from timetable_slots s where s.class_id = c.id and s.teacher_id = $2))', [b.classId, user.id]);
      if (!teaches.rowCount) throw forbidden('You can write to the classes you teach.');
    }
    const cats = await this.settings.value<{ key: string }[]>(t, 'notices.categories', []);
    if (cats.length && !cats.some((c) => c.key === b.category)) throw new ApiError('validation', 'Choose one of the school’s categories.', { fields: { category: 'Choose a category.' } });
    if (b.publishAt && new Date(b.publishAt) <= new Date()) throw new ApiError('validation', 'Choose a time that has not passed yet.', { fields: { publishAt: 'That time has passed.' } });
  }

  async create(t: TenantCtx, user: User, b: NoticeCreate): Promise<NoticeRow> {
    await this.check(t, user, b);
    const id = newId('ntc');
    const canPublish = user.permissions.includes('notices.publish');
    const wantsOut = b.publish || !!b.publishAt;
    const needsApproval = wantsOut && !canPublish && (await this.settings.value<string>(t, 'approvals.notice', 'required')) === 'required';
    const now = b.publish && !b.publishAt && !needsApproval;
    const status = !wantsOut ? 'draft' : needsApproval ? 'pending' : now ? 'published' : 'draft';
    await t.pool.query(
      'insert into notices (id, title, body, audience, class_id, status, author_id, published_at, category, pinned, needs_ack, publish_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      [id, b.title, b.body, b.audience, b.audience === 'class' ? b.classId : null, status, user.id, now ? new Date() : null, b.category, b.pinned, b.needsAck, b.publishAt ?? null]);
    await this.attach(t, id, b.fileIds);
    if (status === 'pending') {
      await t.pool.query("insert into approvals (id, kind, title, subtitle, requester_name, requested_by, subject_ref, payload) values ($1,'notice',$2,$3,$4,$5,$6,$7)",
        [newId('apr'), b.title, `Written by ${user.name}${b.publishAt ? `, to go out ${new Date(b.publishAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}` : ''}`, user.name, user.id, id, JSON.stringify({ noticeId: id })]);
    }
    if (b.publishAt && !needsApproval) await enqueue(this.hubs.hub.o.pool as never, 'notices.publish', t.info.id, { noticeId: id }, new Date(b.publishAt));
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: `notice.${b.publishAt && status === 'draft' ? 'scheduled' : status}`, entity: 'notice', entityId: id, detail: { title: b.title } });
    if (status === 'published') await this.announce(t, id);
    return (await this.rows(t, 'and n.id = $1', [id]))[0]!;
  }

  /** Files already uploaded for the notice (kind notice_attachment) become its attachments. */
  private async attach(t: TenantCtx, id: string, fileIds: string[]): Promise<void> {
    if (fileIds.length) await t.pool.query("update files set owner_id = $1 where id = any($2) and kind = 'notice_attachment'", [id, fileIds]);
  }

  private async own(t: TenantCtx, user: User, id: string): Promise<Row> {
    const n = (await t.pool.query<Row>(`${this.sql} and n.id = $1`, [id])).rows[0];
    if (!n) throw notFound('That notice');
    if (n.author_id !== user.id && !user.permissions.includes('notices.publish')) throw forbidden('You can change only the notices you wrote.');
    return n;
  }

  /** A correction: the notice keeps its place and says it was edited; families are told again only when asked. */
  async update(t: TenantCtx, user: User, id: string, b: NoticeCreate & { tellAgain?: boolean }): Promise<NoticeRow> {
    const n = await this.own(t, user, id);
    await this.check(t, user, { ...b, publishAt: n.status === 'published' ? null : b.publishAt });
    await t.pool.query(
      'update notices set title = $2, body = $3, audience = $4, class_id = $5, category = $6, pinned = $7, needs_ack = $8, publish_at = $9, edited_at = case when status = $10 then now() else edited_at end where id = $1',
      [id, b.title, b.body, b.audience, b.audience === 'class' ? b.classId : null, b.category, b.pinned, b.needsAck, n.status === 'published' ? null : b.publishAt ?? null, 'published']);
    await this.attach(t, id, b.fileIds);
    if (n.status !== 'published' && b.publishAt) await enqueue(this.hubs.hub.o.pool as never, 'notices.publish', t.info.id, { noticeId: id }, new Date(b.publishAt));
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'notice.edited', entity: 'notice', entityId: id, detail: { title: b.title } });
    if (n.status === 'published' && b.tellAgain) await this.announce(t, id);
    return (await this.rows(t, 'and n.id = $1', [id]))[0]!;
  }

  /** Taken down: it leaves every app at once; the record stays in the audit log. */
  async remove(t: TenantCtx, user: User, id: string): Promise<void> {
    const n = await this.own(t, user, id);
    await t.pool.query('update notices set deleted_at = now() where id = $1', [id]);
    await t.pool.query("update approvals set status = 'withdrawn', decided_at = now() where kind = 'notice' and subject_ref = $1 and status = 'pending'", [id]);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'notice.deleted', entity: 'notice', entityId: id, detail: { title: n.title } });
    await this.stream.emit(t, [], { type: 'notification', data: { notice: id } });
  }

  /** Approved: out now, or at its time if it was scheduled. */
  async approved(t: TenantCtx, id: string): Promise<void> {
    const n = (await t.pool.query<{ publish_at: Date | null }>('select publish_at from notices where id = $1', [id])).rows[0];
    if (n?.publish_at && n.publish_at > new Date()) await enqueue(this.hubs.hub.o.pool as never, 'notices.publish', t.info.id, { noticeId: id }, n.publish_at);
    else await this.publish(t, id);
  }

  /** Publishes a notice now (approved, or its time came) and tells everyone it reaches. */
  async publish(t: TenantCtx, id: string): Promise<void> {
    const r = await t.pool.query("update notices set status = 'published', published_at = now(), publish_at = null where id = $1 and status <> 'published' and deleted_at is null", [id]);
    if (r.rowCount) await this.announce(t, id);
  }

  private async publishDue(job: Job): Promise<string> {
    const s = await this.hubs.schoolPool(job.schoolId ?? '');
    if (!s) return 'School not found.';
    const id = String(job.payload.noticeId);
    const n = (await s.pool.query<{ status: string; publish_at: Date | null }>('select status, publish_at from notices where id = $1 and deleted_at is null', [id])).rows[0];
    // Rescheduled, taken down, or still waiting for approval: nothing to do on this run.
    if (!n || n.status === 'pending' || n.status === 'published' || !n.publish_at || n.publish_at > new Date(Date.now() + 30_000)) return 'Not due.';
    await this.publish(await this.tenants.resolve(s.slug), id);
    return 'Published.';
  }

  async announce(t: TenantCtx, id: string): Promise<void> {
    const n = (await t.pool.query<{ title: string; audience: string; class_id: string | null }>("select title, audience, class_id from notices where id = $1 and status = 'published' and deleted_at is null", [id])).rows[0];
    if (!n) return;
    const people = (await t.pool.query<{ id: string; phone: string | null }>(`select * from (${REACH}) x`.replace(/\bn\.(audience|class_id)\b/g, (_m, k: string) => (k === 'audience' ? '$1::text' : '$2::text')), [n.audience, n.class_id])).rows;
    await this.messenger.notify(t, 'notice.published', people.filter((p) => p.phone).map((p) => ({ to: p.phone!, vars: { title: n.title } })));
    await this.stream.emit(t, people.map((p) => p.id), { type: 'notification', data: { notice: id } });
  }

  // The app: what a person reads, marks read and acknowledges.

  async forReader(t: TenantCtx, userId: string, classIds: string[], kind: 'staff' | 'guardian' | 'student'): Promise<(NoticeRow & { read: boolean; acked: boolean })[]> {
    const audiences = kind === 'staff' ? ['everyone', 'staff'] : kind === 'student' ? ['everyone', 'students', 'class'] : ['everyone', 'parents', 'class'];
    const list = (await this.rows(t, "and n.status = 'published' and n.audience = any($1) and (n.class_id is null or n.class_id = any($2))", [audiences, classIds]))
      .filter((n) => kind !== 'staff' || n.audience !== 'class');
    const reads = (await t.pool.query<{ notice_id: string; acked_at: Date | null }>('select notice_id, acked_at from notice_reads where user_id = $1 and notice_id = any($2)', [userId, list.map((n) => n.id)])).rows;
    return list.map((n) => ({ ...n, read: reads.some((r) => r.notice_id === n.id), acked: reads.some((r) => r.notice_id === n.id && r.acked_at) }));
  }

  async markRead(t: TenantCtx, userId: string, id: string, ack = false): Promise<void> {
    await t.pool.query(
      'insert into notice_reads (notice_id, user_id, acked_at) values ($1,$2,$3) on conflict (notice_id, user_id) do update set acked_at = coalesce(notice_reads.acked_at, excluded.acked_at)',
      [id, userId, ack ? new Date() : null]);
  }

  /** For the office: the people a notice that asks for acknowledgement has not been acknowledged by yet. */
  async notAcked(t: TenantCtx, id: string): Promise<{ id: string; name: string; phone: string | null }[]> {
    const n = (await t.pool.query<{ audience: string; class_id: string | null }>('select audience, class_id from notices where id = $1', [id])).rows[0];
    if (!n) throw notFound('That notice');
    const sql = `select u.id, u.name, u.phone from users u where u.id in (select x.id from (${REACH}) x) and u.id not in (select user_id from notice_reads where notice_id = $3 and acked_at is not null) order by u.name`
      .replace(/\bn\.(audience|class_id)\b/g, (_m, k: string) => (k === 'audience' ? '$1::text' : '$2::text'));
    return (await t.pool.query(sql, [n.audience, n.class_id, id])).rows;
  }
}
