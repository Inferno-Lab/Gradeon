import { Body, Controller, Get, HttpCode, Injectable, Param, Post, Put } from '@nestjs/common';
import { ComplianceCreate, ComplianceUpdate, SUBPROCESSORS, type ComplianceRow, type PublicStatus } from '@gradeon/contracts';
import { newId } from '@gradeon/db';
import { ApiError, ZodPipe, notFound } from '@gradeon/nest-kit';
import { Db, Me, Needs, Public, type ConsoleUser } from './core.js';
import { Integrations } from './integrations.js';

interface ItemSql {
  id: string; school_id: string; school_name: string; kind: ComplianceRow['kind']; title: string; status: ComplianceRow['status']; note: string; created_by: string;
  created_at: Date; deadline_at: Date | null; closed_at: Date | null; contact: { email?: string } | null; slug: string;
}

/** Agreements with each school, breach notices with their 72-hour clock, and the sub-processors the platform uses. */
@Injectable()
export class Compliance {
  constructor(private readonly db: Db, private readonly integrations: Integrations) {}

  private row(r: ItemSql): ComplianceRow {
    return { id: r.id, schoolId: r.school_id, schoolName: r.school_name, kind: r.kind, title: r.title, status: r.status, note: r.note, createdBy: r.created_by, createdAt: r.created_at.toISOString(), deadlineAt: r.deadline_at?.toISOString() ?? null, closedAt: r.closed_at?.toISOString() ?? null };
  }

  private async one(id: string): Promise<ItemSql> {
    const { rows } = await this.db.pool.query<ItemSql>('select c.*, s.name school_name, s.contact, s.slug from compliance_items c join schools s on s.id = c.school_id where c.id = $1', [id]);
    if (!rows[0]) throw notFound('That item');
    return rows[0];
  }

  async list(): Promise<{ items: ComplianceRow[]; subprocessors: typeof SUBPROCESSORS }> {
    const { rows } = await this.db.pool.query<ItemSql>(
      "select c.*, s.name school_name, s.contact, s.slug from compliance_items c join schools s on s.id = c.school_id where s.deleted_at is null order by (c.status in ('open','notified')) desc, c.created_at desc limit 200");
    return { items: rows.map((r) => this.row(r)), subprocessors: SUBPROCESSORS };
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
    await this.db.pool.query("update compliance_items set status = $2, note = case when $3 <> '' then $3 else note end, closed_at = case when $2 in ('closed','signed') then now() else closed_at end where id = $1", [id, body.status, body.note]);
    if (cur.kind === 'breach' && body.status === 'notified') {
      // Through the Hub like every message: the school's email route, or the Test inbox on the test track.
      await this.integrations.hub.send({ schoolId: cur.school_id, schoolSlug: cur.slug, channel: 'email', to: cur.contact?.email ?? 'the school contact', subject: `Security notice: ${cur.title}`,
        body: `Gradeon has recorded an incident that may affect ${cur.school_name}: ${cur.title}. ${body.note || cur.note}\nYou can use this to meet your 72-hour notification duty.`, messageKey: 'compliance.breach' });
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

  @Public() @Get('public/status')
  status(): Promise<PublicStatus> {
    return this.compliance.publicStatus();
  }
}
