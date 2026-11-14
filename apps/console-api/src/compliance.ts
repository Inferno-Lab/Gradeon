import { Body, Controller, Get, HttpCode, Inject, Injectable, Param, Post, Put, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { CAPABILITY_LABELS, ComplianceCreate, ComplianceUpdate, breachNotice, providerDef, type ComplianceRow, type DataRequestAcross, type PublicStatus, type SubprocessorRow } from '@tangent/contracts';
import { newId } from '@tangent/db';
import { ApiError, ZodPipe, notFound } from '@tangent/nest-kit';
import { Db, Me, Needs, Public, type ConsoleUser } from './core.js';
import { Integrations } from './integrations.js';
import { ENV, type Env } from './env.js';
import { withSchoolDb } from './school-db.js';

interface ItemSql {
  id: string; school_id: string; school_name: string; kind: ComplianceRow['kind']; title: string; status: ComplianceRow['status']; note: string; created_by: string;
  created_at: Date; deadline_at: Date | null; closed_at: Date | null; contact: { email?: string } | null; slug: string;
  signed_on: string | null; signed_by: string | null; file_name: string | null;
}
const COLS = 'c.id, c.school_id, c.kind, c.title, c.status, c.note, c.created_by, c.created_at, c.deadline_at, c.closed_at, c.signed_on::text, c.signed_by, c.file_name, s.name school_name, s.contact, s.slug';

/** Agreements with each school, breach notices with their 72-hour clock, and the sub-processors the platform uses. */
@Injectable()
export class Compliance {
  constructor(private readonly db: Db, private readonly integrations: Integrations, @Inject(ENV) private readonly env: Env) {}

  private row(r: ItemSql): ComplianceRow {
    return { id: r.id, schoolId: r.school_id, schoolName: r.school_name, kind: r.kind, title: r.title, status: r.status, note: r.note, createdBy: r.created_by, createdAt: r.created_at.toISOString(), deadlineAt: r.deadline_at?.toISOString() ?? null, closedAt: r.closed_at?.toISOString() ?? null, signedOn: r.signed_on, signedBy: r.signed_by, fileName: r.file_name };
  }

  private async one(id: string): Promise<ItemSql> {
    const { rows } = await this.db.pool.query<ItemSql>(`select ${COLS} from compliance_items c join schools s on s.id = c.school_id where c.id = $1`, [id]);
    if (!rows[0]) throw notFound('That item');
    return rows[0];
  }

  async list(): Promise<{ items: ComplianceRow[]; subprocessors: SubprocessorRow[] }> {
    const { rows } = await this.db.pool.query<ItemSql>(
      `select ${COLS} from compliance_items c join schools s on s.id = c.school_id where s.deleted_at is null order by (c.status in ('open','notified')) desc, c.created_at desc limit 200`);
    // Every provider with a live connection handles some school's data: what for, for whom, and where if the connection says.
    const live = await this.db.pool.query<{ provider: string; settings: Record<string, unknown>; school_id: string | null; school_name: string | null }>(
      "select c.provider, c.settings, c.school_id, s.name school_name from integration_connections c left join schools s on s.id = c.school_id where c.state = 'live' and c.provider <> 'sandbox' order by c.provider");
    const subprocessors = live.rows.map((c) => {
      const def = providerDef(c.provider);
      return { name: def?.name ?? c.provider, purpose: (def?.capabilities ?? []).map((k) => CAPABILITY_LABELS[k]).join(', '), serves: c.school_name ?? 'Every school', region: String(c.settings.region ?? c.settings.location ?? '') };
    });
    return { items: rows.map((r) => this.row(r)), subprocessors };
  }

  /** Open data requests (a copy, a correction, erasure) at every running school, newest first, for the one list. */
  async requests(): Promise<DataRequestAcross[]> {
    const schools = (await this.db.pool.query<{ id: string; name: string }>("select id, name from schools where status in ('live','suspended') and deleted_at is null and db_url_sealed is not null")).rows;
    const out: DataRequestAcross[] = [];
    for (const s of schools) {
      const rows = await withSchoolDb(this.db, this.env.SECRETS_KEY, s.id, (pool) => pool.query<{ id: string; kind: string; subject_name: string; requested_by: string; status: string; created_at: Date }>(
        "select id, kind, subject_name, requested_by, status, created_at from data_requests where status = 'open' order by created_at desc limit 50")).catch(() => ({ rows: [] }));
      for (const r of rows.rows) out.push({ id: r.id, schoolId: s.id, schoolName: s.name, kind: r.kind, subjectName: r.subject_name, requestedBy: r.requested_by, status: r.status, createdAt: r.created_at.toISOString() });
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async file(id: string): Promise<{ name: string; data: Buffer }> {
    const r = (await this.db.pool.query<{ file_name: string | null; file: Buffer | null }>('select file_name, file from compliance_items where id = $1', [id])).rows[0];
    if (!r?.file) throw notFound('That file');
    return { name: r.file_name ?? 'agreement', data: r.file };
  }

  async create(user: ConsoleUser, body: ComplianceCreate): Promise<ComplianceRow> {
    const school = await this.db.pool.query('select 1 from schools where id = $1 and deleted_at is null', [body.schoolId]);
    if (!school.rowCount) throw new ApiError('validation', 'Choose a school from the list.', { fields: { schoolId: 'Choose a school from the list.' } });
    if (body.kind === 'dpa') {
      const open = await this.db.pool.query("select 1 from compliance_items where school_id = $1 and kind = 'dpa' and status = 'open'", [body.schoolId]);
      if (open.rowCount) throw new ApiError('conflict', 'This school already has an agreement waiting to be signed.');
    }
    const id = newId('cmp');
    await this.db.pool.query("insert into compliance_items (id, school_id, kind, title, note, created_by, deadline_at) values ($1,$2,$3,$4,$5,$6, case when $3 = 'breach' then now() + interval '72 hours' else null end)",
      [id, body.schoolId, body.kind, body.title, body.note, user.email]);
    await this.db.audit(user.email, `compliance.${body.kind}.opened`, 'school', body.schoolId, { title: body.title });
    return this.row(await this.one(id));
  }

  /** Signing an agreement or notifying a school of a breach is recorded with who and when. Notifying also files the notice in the school's test inbox. */
  async update(user: ConsoleUser, id: string, body: ComplianceUpdate): Promise<ComplianceRow> {
    const cur = await this.one(id);
    const allowed: Record<ComplianceRow['kind'], ComplianceRow['status'][]> = { dpa: ['open', 'signed'], breach: ['open', 'notified', 'closed'] };
    if (!allowed[cur.kind].includes(body.status)) throw new ApiError('validation', 'That status does not apply to this kind of item.');
    if (cur.status === 'closed' || (cur.kind === 'dpa' && cur.status === 'signed')) throw new ApiError('conflict', 'This item is already finished.');
    if (body.status === 'signed') {
      if (!body.signedOn || !body.signedBy || !body.file) throw new ApiError('validation', 'Attach the signed agreement, the day it was signed and who signed it.');
      const data = Buffer.from(body.file.data, 'base64');
      if (data.length > 5 * 1024 * 1024) throw new ApiError('validation', 'The signed file must be 5 MB or smaller.');
      await this.db.pool.query('update compliance_items set signed_on = $2, signed_by = $3, file_name = $4, file = $5 where id = $1', [id, body.signedOn, body.signedBy, body.file.name, data]);
    }
    await this.db.pool.query("update compliance_items set status = $2, note = case when $3 <> '' then $3 else note end, closed_at = case when $2 in ('closed','signed') then now() else closed_at end where id = $1", [id, body.status, body.note]);
    if (cur.kind === 'breach' && body.status === 'notified') {
      // Through the Hub like every message: the school's email route, or the Test inbox on the test track.
      await this.integrations.hub.send({ schoolId: cur.school_id, schoolSlug: cur.slug, channel: 'email', to: cur.contact?.email ?? 'the school contact', subject: `Security notice: ${cur.title}`,
        body: breachNotice(cur.school_name, cur.title, body.note || cur.note), messageKey: 'compliance.breach' });
    }
    await this.db.audit(user.email, `compliance.${cur.kind}.${body.status}`, 'school', cur.school_id, { title: cur.title });
    return this.row(await this.one(id));
  }

  /** What the public status page shows: whether things are working, school by school, and what is open. Names only, no data. */
  async publicStatus(): Promise<PublicStatus> {
    const [schools, incidents] = await Promise.all([
      this.db.pool.query<{ name: string; health: string }>("select name, health from schools where deleted_at is null and status in ('live','suspended') order by name"),
      this.db.pool.query<{ id: string; title: string; state: string; started_at: Date; resolved_at: Date | null }>("select id, title, state, started_at, resolved_at from incidents where state = 'open' or resolved_at > now() - interval '7 days' order by started_at desc limit 10"),
    ]);
    const bad = schools.rows.filter((s) => s.health === 'down').length;
    const slow = schools.rows.filter((s) => s.health === 'degraded').length;
    return {
      updatedAt: new Date().toISOString(),
      state: bad ? 'down' : slow || incidents.rows.some((i) => i.state === 'open') ? 'degraded' : 'ok',
      schools: schools.rows.map((s) => ({ name: s.name, state: s.health === 'down' ? 'down' : s.health === 'degraded' ? 'degraded' : 'ok' })),
      incidents: incidents.rows.map((i) => ({ id: i.id, title: i.title, open: i.state === 'open', startedAt: i.started_at.toISOString(), resolvedAt: i.resolved_at?.toISOString() ?? null })),
    };
  }
}

@Controller('console/v1')
export class ComplianceController {
  constructor(private readonly compliance: Compliance) {}

  @Get('compliance') @Needs('schools.read')
  list(): ReturnType<Compliance['list']> {
    return this.compliance.list();
  }

  @Post('compliance') @HttpCode(200) @Needs('compliance.write')
  create(@Me() me: ConsoleUser, @Body(new ZodPipe(ComplianceCreate)) body: ComplianceCreate): Promise<ComplianceRow> {
    return this.compliance.create(me, body);
  }

  @Put('compliance/:id') @HttpCode(200) @Needs('compliance.write')
  update(@Me() me: ConsoleUser, @Param('id') id: string, @Body(new ZodPipe(ComplianceUpdate)) body: ComplianceUpdate): Promise<ComplianceRow> {
    return this.compliance.update(me, id, body);
  }

  @Get('compliance/requests') @Needs('audit.read')
  requests(): Promise<DataRequestAcross[]> {
    return this.compliance.requests();
  }

  @Get('compliance/:id/file') @Needs('schools.read')
  async file(@Param('id') id: string, @Res() reply: FastifyReply): Promise<void> {
    const f = await this.compliance.file(id);
    void reply.header('content-type', /\.pdf$/i.test(f.name) ? 'application/pdf' : 'application/octet-stream').header('content-disposition', `attachment; filename="${f.name.replace(/"/g, '')}"`).send(f.data);
  }

  @Public() @Get('public/status')
  status(): Promise<PublicStatus> {
    return this.compliance.publicStatus();
  }
}
