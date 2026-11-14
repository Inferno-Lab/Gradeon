import { createHash } from 'node:crypto';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { enqueue, newId, type Job } from '@tangent/db';
import type { FileKind, FileRow, FileStart, FileUpload } from '@tangent/contracts';
import { ApiError, forbidden, notFound } from '@tangent/nest-kit';
import type { AuthedUser, TenantCtx } from '../tenancy/tenant.js';
import { HubService } from './hub.service.js';
import { SettingsService } from './support.js';

const IMAGES = ['image/jpeg', 'image/png', 'image/webp'];
const DOCS = [...IMAGES, 'application/pdf'];
const MB = 1024 * 1024;

/** What each kind of file may be, how big, which module it belongs to, and the permission that may add one (families: their own). */
const RULES: Record<FileKind, { mimes: string[]; max: number; module: string; write: string | 'family' | 'console' | 'participant' }> = {
  homework_submission: { mimes: DOCS, max: 15 * MB, module: 'homework.onlineSubmission', write: 'family' },
  homework_attachment: { mimes: DOCS, max: 15 * MB, module: 'homework', write: 'homework.write' },
  notice_attachment: { mimes: DOCS, max: 15 * MB, module: 'notices', write: 'notices.write' },
  chat: { mimes: DOCS, max: 10 * MB, module: 'chat', write: 'participant' },
  student_photo: { mimes: IMAGES, max: 5 * MB, module: 'people', write: 'students.write' },
  student_document: { mimes: DOCS, max: 15 * MB, module: 'people', write: 'students.write' },
  logo: { mimes: ['image/png', 'image/jpeg'], max: 2 * MB, module: 'people', write: 'console' },
  gallery: { mimes: IMAGES, max: 15 * MB, module: 'gallery', write: 'gallery.write' },
  receipt: { mimes: ['application/pdf'], max: 2 * MB, module: 'fees', write: 'console' },
  report_card: { mimes: ['application/pdf'], max: 5 * MB, module: 'exams', write: 'console' },
};

/** The first bytes of each type we accept: a file must be what it says it is. */
function sniff(b: Buffer): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

/** Width and height from a PNG, JPEG or WebP header, without decoding the image. */
export function dimensions(b: Buffer): { width: number; height: number } | null {
  const t = sniff(b);
  if (t === 'image/png') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (t === 'image/webp' && b.subarray(12, 16).toString('latin1') === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (t === 'image/webp' && b.subarray(12, 16).toString('latin1') === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (t === 'image/jpeg') {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1]!;
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

/**
 * Files in the school's storage through the Hub. The client asks for an upload address, uploads straight to storage, then says
 * done: the file is checked (size, type by its first bytes), scanned, and only then readable. Reading is a presigned address valid
 * five minutes, given only to someone allowed to see the file.
 */
@Injectable()
export class FilesService implements OnModuleInit {
  constructor(
    private readonly hubs: HubService,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit(): void {
    this.hubs.handle('files.scan', (job) => this.scanJob(job));
  }

  private async storage(t: { info: { id: string; slug: string } }) {
    const r = await this.hubs.hub.resolve('storage', t.info.id, t.info.slug).catch((e: Error) => { throw new ApiError('school_unavailable', e.message); });
    if (!r.adapter.storage) throw new ApiError('school_unavailable', 'File storage is not set up for this school yet.');
    return { s: r.adapter.storage, ctx: r.ctx };
  }

  private async children(t: TenantCtx, userId: string): Promise<string[]> {
    // A parent's children, or a student's own record.
    const { rows } = await t.pool.query<{ student_id: string }>(
      "select distinct sg.student_id from student_guardians sg join guardians g on g.id = sg.guardian_id where g.user_id = $1 union select id from students where user_id = $1 and status = 'active'", [userId]);
    return rows.map((r) => r.student_id);
  }

  private async isStaff(t: TenantCtx, userId: string): Promise<boolean> {
    return (await t.pool.query("select 1 from users where id = $1 and kind = 'staff'", [userId])).rowCount === 1;
  }

  /** Whether this person may add a file of this kind to this owner. */
  private async mayWrite(t: TenantCtx, user: AuthedUser, kind: FileKind, ownerId: string): Promise<void> {
    const rule = RULES[kind];
    const cfg = await this.settings.effective(t);
    if (!cfg.modules.includes(rule.module) && !cfg.features.includes(rule.module)) throw new ApiError('locked', 'This feature is not part of your school’s plan.');
    if (rule.write === 'console') throw forbidden('Only Tangent adds these files.');
    // A family's new photo of their own child waits for the office ("pending:<student>") before it is used.
    if (kind === 'student_photo' && ownerId.startsWith('pending:')) {
      if (!(await this.children(t, user.id)).includes(ownerId.slice(8))) throw forbidden('You can send a photo only of your own child.');
      return;
    }
    if (rule.write === 'family') {
      const [, studentId] = ownerId.split(':');
      if (!studentId || !(await this.children(t, user.id)).includes(studentId)) throw forbidden('You can hand in work only for your own children.');
      return;
    }
    if (rule.write === 'participant') {
      const th = (await t.pool.query<{ staff_id: string | null; guardian_user: string | null; student_user: string | null }>(
        'select th.assigned_to staff_id, g.user_id guardian_user, th.student_user_id student_user from threads th left join guardians g on g.id = th.guardian_id where th.id = $1', [ownerId])).rows[0];
      if (!th) throw notFound('That conversation');
      if (th.guardian_user === user.id || th.student_user === user.id || th.staff_id === user.id || user.permissions.includes('messages.write')) return;
      throw forbidden('That conversation is not yours.');
    }
    if (!user.permissions.includes(rule.write)) throw forbidden('You do not have access to this. Ask your principal to change your role.');
  }

  /** Whether this person may read a file. */
  private async mayRead(t: TenantCtx, user: AuthedUser, f: { kind: FileKind; owner_id: string | null }): Promise<void> {
    if (await this.isStaff(t, user.id)) {
      const need: Partial<Record<FileKind, string>> = { student_photo: 'students.read', student_document: 'students.read', homework_submission: 'homework.read', gallery: 'gallery.read', chat: 'messages.read' };
      const p = need[f.kind];
      if (!p || user.permissions.includes(p)) return;
      throw forbidden('You do not have access to this file.');
    }
    const kids = await this.children(t, user.id);
    const owner = f.owner_id ?? '';
    const ok = await (async () => {
      switch (f.kind) {
        case 'homework_submission': return kids.includes(owner.split(':')[1] ?? '');
        case 'student_photo': case 'student_document': return kids.includes(owner);
        case 'homework_attachment': return (await t.pool.query('select 1 from homework h join students s on s.class_id = h.class_id where h.id = $1 and s.id = any($2)', [owner, kids])).rowCount! > 0;
        case 'notice_attachment': return (await t.pool.query("select 1 from notices where id = $1 and status = 'published'", [owner])).rowCount! > 0;
        case 'chat': return (await t.pool.query('select 1 from threads th left join guardians g on g.id = th.guardian_id where th.id = $1 and (g.user_id = $2 or th.student_user_id = $2)', [owner, user.id])).rowCount! > 0;
        case 'gallery': return (await t.pool.query('select 1 from gallery_albums where id = $1 and published', [owner])).rowCount! > 0;
        case 'logo': return true;
        default: return false;
      }
    })();
    if (!ok) throw forbidden('You do not have access to this file.');
  }

  /** Bytes the school keeps in storage (files not deleted). */
  async usage(t: TenantCtx): Promise<number> {
    return Number((await t.pool.query<{ n: string }>('select coalesce(sum(bytes), 0) n from files where deleted_at is null')).rows[0]!.n);
  }

  async start(t: TenantCtx, user: AuthedUser, b: FileStart): Promise<FileUpload> {
    const rule = RULES[b.kind];
    if (!rule.mimes.includes(b.mime)) throw new ApiError('validation', `That kind of file is not accepted here. Use ${rule.mimes.map((m) => m.split('/')[1]!.toUpperCase()).join(', ')}.`, { fields: { file: 'This type is not accepted.' } });
    if (b.bytes > rule.max) throw new ApiError('validation', `The file is too large: at most ${rule.max / MB} MB.`, { fields: { file: 'Too large.' } });
    await this.mayWrite(t, user, b.kind, b.ownerId);
    return this.reserve(t, user.id, b);
  }

  /** Records an upload and returns its address. Also used by the console for the school's logo. */
  async reserve(t: TenantCtx, userId: string | null, b: FileStart): Promise<FileUpload> {
    const limitGb = t.info.entitlement.limits.storageGb;
    if (limitGb > 0 && (await this.usage(t)) + b.bytes > limitGb * 1024 * MB) throw new ApiError('locked', `The school's ${limitGb} GB of storage is full. Tangent can raise the limit.`);
    const id = newId('fil');
    const key = `schools/${t.info.slug}/${b.kind}/${id}/${b.name.replace(/[^\w.-]+/g, '_').slice(-80)}`;
    const { s, ctx } = await this.storage(t);
    const upload = await s.presignPut(ctx, key, b.mime, RULES[b.kind].max);
    await t.pool.query('insert into files (id, kind, owner_id, name, mime, bytes, storage_key, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8)', [id, b.kind, b.ownerId, b.name, b.mime, b.bytes, key, userId]);
    return { fileId: id, upload };
  }

  /** The client finished uploading: the bytes are checked against what was promised, then the file waits for its scan. */
  async done(t: TenantCtx, userId: string | null, id: string): Promise<FileRow> {
    const f = (await t.pool.query('select * from files where id = $1 and deleted_at is null', [id])).rows[0];
    if (!f) throw notFound('That file');
    if (userId && f.created_by !== userId) throw forbidden('That upload is not yours.');
    if (f.status !== 'uploading') return this.row(f);
    const { s, ctx } = await this.storage(t);
    const data = await s.get(ctx, f.storage_key).catch(() => null);
    if (!data) throw new ApiError('validation', 'The upload did not arrive. Try again.');
    const type = sniff(data);
    if (data.length > RULES[f.kind as FileKind].max || !type || type !== f.mime) {
      await s.remove(ctx, f.storage_key).catch(() => undefined);
      await t.pool.query('update files set deleted_at = now() where id = $1', [id]);
      throw new ApiError('validation', 'That file is not what it says it is, or is too large. It was not kept.');
    }
    const dim = dimensions(data);
    await t.pool.query("update files set status = 'pending', bytes = $2, sha256 = $3, width = $4, height = $5 where id = $1",
      [id, data.length, createHash('sha256').update(data).digest('hex'), dim?.width ?? null, dim?.height ?? null]);
    // Every upload is scanned by the Virus scanning connection. Without one, the test track takes the type check alone (the file is
    // usable at once); in live mode nothing unscanned is kept, so families never receive an unchecked file.
    if (!(await this.hubs.hub.platform('scanning'))) {
      if ((await this.hubs.hub.mode()) === 'live') {
        await s.remove(ctx, f.storage_key).catch(() => undefined);
        await t.pool.query('update files set deleted_at = now() where id = $1', [id]);
        throw new ApiError('locked', 'Uploads are paused while Tangent sets up the virus check. Try again later.');
      }
      await this.markScanned(t.pool, id, null);
    } else await enqueue(this.hubs.hub.o.pool as never, 'files.scan', t.info.id, { fileId: id });
    return this.row((await t.pool.query('select * from files where id = $1', [id])).rows[0]);
  }

  private async markScanned(pool: TenantCtx['pool'], id: string, virus: string | null): Promise<void> {
    await pool.query("update files set status = $2 where id = $1 and status = 'pending'", [id, virus ? 'infected' : 'clean']);
  }

  private async scanJob(job: Job): Promise<string> {
    const s = await this.hubs.schoolPool(job.schoolId ?? '');
    if (!s) return 'School not found.';
    const f = (await s.pool.query('select * from files where id = $1', [String(job.payload.fileId)])).rows[0];
    if (!f || f.status !== 'pending') return 'Nothing to scan.';
    const r = await this.hubs.hub.resolve('storage', s.id, s.slug);
    const data = await r.adapter.storage!.get(r.ctx, f.storage_key);
    const result = await this.hubs.hub.scan(data);
    if (!result) throw new Error('The virus scanning connection is gone: the file waits until one is set up.');
    const virus = result.clean ? null : result.found ?? 'unknown';
    await this.markScanned(s.pool, f.id, virus);
    if (virus) await r.adapter.storage!.remove(r.ctx, f.storage_key).catch(() => undefined);
    return virus ? `Infected (${virus}): removed.` : 'Clean.';
  }

  row(f: Record<string, any>): FileRow {
    return { id: f.id, kind: f.kind, ownerId: f.owner_id, name: f.name, mime: f.mime, bytes: Number(f.bytes), status: f.status, width: f.width, height: f.height, createdAt: new Date(f.created_at).toISOString() };
  }

  /** A link to read the file, valid five minutes. */
  /** The school's logo image itself (for printed receipts and report cards), or null while it has only letters. */
  async logoBytes(t: TenantCtx): Promise<Buffer | null> {
    const id = await this.settings.value<string>(t, 'brand.logoFileId', '');
    const f = id ? (await t.pool.query("select storage_key from files where id = $1 and deleted_at is null and status = 'clean'", [id])).rows[0] : null;
    if (!f) return null;
    const r = await this.hubs.hub.resolve('storage', t.info.id, t.info.slug);
    return r.adapter.storage!.get(r.ctx, f.storage_key).catch(() => null);
  }

  /** The school's logo, for its sign-in pages and menus: a link valid an hour, or null while there is none (or it cannot be read). */
  async logoUrl(t: TenantCtx): Promise<string | null> {
    const id = await this.settings.value<string>(t, 'brand.logoFileId', '');
    return id ? this.url(t, null, id, false, 3600).catch(() => null) : null;
  }

  async url(t: TenantCtx, user: AuthedUser | null, id: string, download = false, seconds = 300): Promise<string> {
    const f = (await t.pool.query('select * from files where id = $1 and deleted_at is null', [id])).rows[0];
    if (!f) throw notFound('That file');
    if (user) await this.mayRead(t, user, f);
    else if (f.kind !== 'logo') throw forbidden('Sign in to see this file.');
    if (f.status === 'infected') throw new ApiError('locked', 'This file failed the virus check and was removed.');
    if (f.status !== 'clean') throw new ApiError('conflict', 'This file is still being checked. Try again in a moment.');
    const { s, ctx } = await this.storage(t);
    return s.presignGet(ctx, f.storage_key, seconds, download ? f.name : undefined);
  }

  async list(t: TenantCtx, kind: FileKind, ownerIds: string[]): Promise<FileRow[]> {
    if (!ownerIds.length) return [];
    const { rows } = await t.pool.query("select * from files where kind = $1 and owner_id = any($2) and deleted_at is null and status <> 'infected' order by created_at", [kind, ownerIds]);
    return rows.map((r) => this.row(r));
  }

  async remove(t: TenantCtx, user: AuthedUser, id: string): Promise<void> {
    const f = (await t.pool.query('select * from files where id = $1 and deleted_at is null', [id])).rows[0];
    if (!f) throw notFound('That file');
    if (f.created_by !== user.id) await this.mayWrite(t, user, f.kind, f.owner_id ?? '');
    await t.pool.query('update files set deleted_at = now() where id = $1', [id]);
    const { s, ctx } = await this.storage(t);
    await s.remove(ctx, f.storage_key).catch(() => undefined);
  }
}
