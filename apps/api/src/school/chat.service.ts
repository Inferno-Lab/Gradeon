import { Injectable } from '@nestjs/common';
import { newId } from '@tangent/db';
import { ApiError, forbidden, notFound } from '@tangent/nest-kit';
import type { TenantCtx } from '../tenancy/tenant.js';
import { StreamService } from './stream.service.js';
import { Messenger } from './support.js';

export type ChatSender = { id: string; name: string; kind: 'staff' | 'guardian' | 'student' };

/**
 * One conversation's writes, for the app and the admin alike: a message (with files), taking one back, reporting one to the
 * office, "typing", "read". Each tells the other side at once through the live stream, and by a phone notification.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly stream: StreamService,
    private readonly messenger: Messenger,
  ) {}

  /** The people in a conversation who use the app: the family's account or the student, and the member of staff. */
  async people(t: TenantCtx, threadId: string): Promise<{ users: string[]; family: { phone: string | null; userId: string | null } }> {
    const r = (await t.pool.query<{ assigned_to: string | null; g_user: string | null; phone: string | null; student_user_id: string | null }>(
      'select th.assigned_to, g.user_id g_user, g.phone, th.student_user_id from threads th left join guardians g on g.id = th.guardian_id where th.id = $1', [threadId])).rows[0];
    if (!r) throw notFound('That conversation');
    const familyUser = r.student_user_id ?? r.g_user;
    return { users: [r.assigned_to, familyUser].filter((x): x is string => !!x), family: { phone: r.phone, userId: familyUser } };
  }

  async post(t: TenantCtx, from: ChatSender, threadId: string, text: string, fileIds: string[] = []): Promise<string> {
    const files = fileIds.length ? (await t.pool.query<{ id: string }>("select id from files where id = any($1) and status = 'clean' and deleted_at is null and kind = 'chat'", [fileIds])).rows.map((r) => r.id) : [];
    if (files.length !== fileIds.length) throw new ApiError('validation', 'One of the files is still being checked or did not arrive. Try again in a moment.');
    const id = newId('tmsg');
    // Seeded demo threads can sit later today than the clock; a new message stays last. A message waits unread until the other side opens it.
    await t.pool.query(
      `insert into thread_messages (id, thread_id, from_kind, sender_name, sender_id, body, file_ids, created_at)
       values ($1,$2,$3,$4,$5,$6,$7, greatest(now(), coalesce((select max(created_at) + interval '1 millisecond' from thread_messages where thread_id = $2), now())))`,
      [id, threadId, from.kind, from.name, from.id, text, JSON.stringify(files)]);
    await t.pool.query("update threads set last_at = now(), status = 'open', assigned_to = case when $3 = 'staff' then coalesce(assigned_to, $2) else assigned_to end where id = $1", [threadId, from.id, from.kind]);
    const who = await this.people(t, threadId);
    await this.stream.emit(t, who.users, { type: 'chat.message', data: { threadId, messageId: id } });
    // The other side hears about it on their phone too (the app hides it while that conversation is open).
    const preview = `${from.name}: ${text.slice(0, 80)}${files.length ? ' 📎' : ''}`;
    if (from.kind === 'staff' && who.family.phone) await this.messenger.send(t, { channel: 'push', to: who.family.phone, body: preview, key: 'chat.message', vars: { from: from.name, text: text.slice(0, 80), route: `/chat/${threadId}` } });
    return id;
  }

  async typing(t: TenantCtx, from: ChatSender, threadId: string): Promise<void> {
    const who = await this.people(t, threadId);
    await this.stream.emit(t, who.users.filter((u) => u !== from.id), { type: 'chat.typing', data: { threadId, userId: from.id, name: from.name } });
  }

  async read(t: TenantCtx, reader: ChatSender, threadId: string): Promise<void> {
    await t.pool.query('update thread_messages set read_at = now() where thread_id = $1 and from_kind <> $2 and read_at is null and deleted_at is null', [threadId, reader.kind]);
    const who = await this.people(t, threadId);
    await this.stream.emit(t, who.users.filter((u) => u !== reader.id), { type: 'chat.read', data: { threadId } });
  }

  /** Takes back one's own message: the others see "message deleted" in its place. */
  async remove(t: TenantCtx, by: ChatSender, messageId: string): Promise<void> {
    const m = (await t.pool.query<{ thread_id: string; sender_id: string | null }>('select thread_id, sender_id from thread_messages where id = $1 and deleted_at is null', [messageId])).rows[0];
    if (!m) throw notFound('That message');
    if (m.sender_id !== by.id) throw forbidden('Only the person who sent a message can delete it.');
    await t.pool.query("update thread_messages set deleted_at = now(), body = '', file_ids = '[]'::jsonb where id = $1", [messageId]);
    await this.stream.emit(t, (await this.people(t, m.thread_id)).users, { type: 'chat.message', data: { threadId: m.thread_id, messageId } });
  }

  /** Reports a message to the office, with why; the office sees it in Messages and decides what to do. */
  async report(t: TenantCtx, by: ChatSender, messageId: string, reason: string): Promise<void> {
    const m = (await t.pool.query<{ thread_id: string; sender_id: string | null }>('select thread_id, sender_id from thread_messages where id = $1', [messageId])).rows[0];
    if (!m) throw notFound('That message');
    if (m.sender_id === by.id) throw new ApiError('validation', 'Delete your own message instead of reporting it.');
    await t.pool.query('update thread_messages set reported_at = now(), report_reason = $2 where id = $1', [messageId, reason]);
  }
}
