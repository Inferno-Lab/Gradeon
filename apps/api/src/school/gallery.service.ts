import { Injectable } from '@nestjs/common';
import type { AlbumInput, AlbumRow, GalleryReportRow, PhotoRow } from '@tangent/contracts';
import { newId } from '@tangent/db';
import { ApiError, notFound } from '@tangent/nest-kit';
import type { TenantCtx } from '../tenancy/tenant.js';
import { FilesService } from './files.service.js';
import { AuditService, SettingsService } from './support.js';

type User = { id: string; name: string };

/**
 * Albums by class and event, with photos kept in storage (files of kind 'gallery'). The children in each photo are tagged, and
 * while the school asks for photo consent a photo with a child whose family has not said yes never reaches families.
 */
@Injectable()
export class GalleryService {
  constructor(
    private readonly files: FilesService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  async albums(t: TenantCtx, forClasses?: string[]): Promise<AlbumRow[]> {
    const { rows } = await t.pool.query(
      `select a.*, c.name class_name, (select count(*) from files f where f.kind = 'gallery' and f.owner_id = a.id and f.deleted_at is null and f.status = 'clean')::int photos,
         (select f.id from files f where f.kind = 'gallery' and f.owner_id = a.id and f.deleted_at is null and f.status = 'clean' order by f.created_at limit 1) cover
       from gallery_albums a left join classes c on c.id = a.class_id
       where $1::text[] is null or (a.published and (a.class_id is null or a.class_id = any($1))) order by a.created_at desc`, [forClasses ?? null]);
    return rows.map((a) => ({ id: a.id, title: a.title, classId: a.class_id, className: a.class_name, eventId: a.event_id, published: a.published, photos: a.photos, coverFileId: a.cover, createdAt: a.created_at.toISOString() }));
  }

  async saveAlbum(t: TenantCtx, user: User, b: AlbumInput, id?: string): Promise<AlbumRow> {
    if (id) {
      const r = await t.pool.query('update gallery_albums set title = $2, class_id = $3, event_id = $4 where id = $1', [id, b.title, b.classId, b.eventId]);
      if (!r.rowCount) throw notFound('That album');
    } else {
      id = newId('alb');
      await t.pool.query('insert into gallery_albums (id, title, class_id, event_id, created_by) values ($1,$2,$3,$4,$5)', [id, b.title, b.classId, b.eventId, user.id]);
    }
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'gallery.album.saved', entity: 'album', entityId: id, detail: { title: b.title } });
    return (await this.albums(t)).find((a) => a.id === id)!;
  }

  async publish(t: TenantCtx, user: User, id: string, published: boolean): Promise<AlbumRow> {
    if (published && !(await t.pool.query("select 1 from files where kind = 'gallery' and owner_id = $1 and deleted_at is null and status = 'clean'", [id])).rowCount) {
      throw new ApiError('validation', 'Add at least one photo before sharing the album.');
    }
    const r = await t.pool.query('update gallery_albums set published = $2 where id = $1', [id, published]);
    if (!r.rowCount) throw notFound('That album');
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: published ? 'gallery.album.published' : 'gallery.album.hidden', entity: 'album', entityId: id });
    return (await this.albums(t)).find((a) => a.id === id)!;
  }

  async deleteAlbum(t: TenantCtx, user: User, id: string): Promise<void> {
    const r = await t.pool.query('delete from gallery_albums where id = $1 returning title', [id]);
    if (!r.rowCount) throw notFound('That album');
    await t.pool.query("update files set deleted_at = now() where kind = 'gallery' and owner_id = $1 and deleted_at is null", [id]);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'gallery.album.deleted', entity: 'album', entityId: id, detail: { title: r.rows[0].title } });
  }

  /** Photos with the children in them and each family's answer; for families, only the photos consent allows. */
  async photos(t: TenantCtx, albumId: string, forFamily = false): Promise<PhotoRow[]> {
    const files = await this.files.list(t, 'gallery', [albumId]);
    const tags = (await t.pool.query<{ file_id: string; student_id: string; name: string; consent: boolean | null }>(
      `select gt.file_id, gt.student_id, s.name,
         (select bool_and(u.photo_consent) from student_guardians sg join guardians g on g.id = sg.guardian_id join users u on u.id = g.user_id where sg.student_id = s.id) consent
       from gallery_tags gt join students s on s.id = gt.student_id where gt.file_id = any($1)`, [files.map((f) => f.id)])).rows;
    const ask = await this.settings.value<boolean>(t, 'privacy.photoConsent', true);
    return files
      .filter((f) => f.status === 'clean' || !forFamily)
      .map((f) => ({ ...f, students: tags.filter((x) => x.file_id === f.id).map((x) => ({ id: x.student_id, name: x.name, consent: x.consent })) }))
      .filter((p) => !forFamily || !ask || p.students.every((s) => s.consent === true));
  }

  /** A family reports a photo: the office sees it here and removes the photo or keeps it, with why. */
  async report(t: TenantCtx, user: User, fileId: string, reason: string): Promise<void> {
    const f = (await t.pool.query("select 1 from files where id = $1 and kind = 'gallery' and deleted_at is null", [fileId])).rowCount;
    if (!f) throw notFound('That photo');
    await t.pool.query('insert into gallery_reports (id, file_id, user_id, reason) values ($1,$2,$3,$4)', [newId('grp'), fileId, user.id, reason]);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'gallery.photo.reported', entity: 'file', entityId: fileId, detail: { reason } });
  }

  async reports(t: TenantCtx): Promise<GalleryReportRow[]> {
    const { rows } = await t.pool.query(
      `select r.id, r.file_id, f.owner_id album_id, a.title album, u.name by_name, r.reason, r.created_at from gallery_reports r join files f on f.id = r.file_id
       left join gallery_albums a on a.id = f.owner_id left join users u on u.id = r.user_id where r.resolved_at is null and f.deleted_at is null order by r.created_at`);
    return rows.map((r) => ({ id: r.id, fileId: r.file_id, albumId: r.album_id, album: r.album, by: r.by_name ?? 'A family', reason: r.reason, createdAt: r.created_at.toISOString() }));
  }

  /** Removes the reported photo, or keeps it; either way every open report of that photo is closed. */
  async resolve(t: TenantCtx, user: User, reportId: string, remove: boolean): Promise<void> {
    const r = (await t.pool.query<{ file_id: string }>('select file_id from gallery_reports where id = $1', [reportId])).rows[0];
    if (!r) throw notFound('That report');
    if (remove) await t.pool.query('update files set deleted_at = now() where id = $1', [r.file_id]);
    await t.pool.query('update gallery_reports set resolved_at = now(), resolution = $2 where file_id = $1 and resolved_at is null', [r.file_id, remove ? 'removed' : 'kept']);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: remove ? 'gallery.photo.removed' : 'gallery.report.kept', entity: 'file', entityId: r.file_id });
  }

  async tag(t: TenantCtx, user: User, fileId: string, studentIds: string[]): Promise<void> {
    const f = (await t.pool.query("select 1 from files where id = $1 and kind = 'gallery' and deleted_at is null", [fileId])).rowCount;
    if (!f) throw notFound('That photo');
    await t.pool.query('delete from gallery_tags where file_id = $1', [fileId]);
    for (const s of [...new Set(studentIds)]) await t.pool.query('insert into gallery_tags (file_id, student_id) values ($1,$2) on conflict do nothing', [fileId, s]);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'gallery.photo.tagged', entity: 'file', entityId: fileId, detail: { count: studentIds.length } });
  }
}
