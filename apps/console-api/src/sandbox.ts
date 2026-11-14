import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { newId } from '@tangent/db';
import type { SandboxMessage } from '@tangent/contracts';
import { Db, Needs } from './core.js';

/** The message sandbox: SMS, email and WhatsApp land here instead of being sent. */
@Injectable()
export class Sandbox {
  constructor(private readonly db: Db) {}

  async put(m: { schoolSlug: string; channel: SandboxMessage['channel']; to: string; subject?: string; body: string }): Promise<void> {
    await this.db.pool.query('insert into sandbox_messages (id, school_slug, channel, to_addr, subject, body) values ($1,$2,$3,$4,$5,$6)', [newId('msg'), m.schoolSlug, m.channel, m.to, m.subject ?? null, m.body]);
  }

  async list(school?: string, limit = 100): Promise<SandboxMessage[]> {
    const { rows } = await this.db.pool.query<{ id: string; school_slug: string; channel: SandboxMessage['channel']; to_addr: string; subject: string | null; body: string; created_at: Date }>(
      'select * from sandbox_messages where ($1::text is null or school_slug = $1) order by created_at desc limit $2', [school ?? null, limit]);
    return rows.map((r) => ({ id: r.id, schoolSlug: r.school_slug, channel: r.channel, to: r.to_addr, subject: r.subject, body: r.body, createdAt: r.created_at.toISOString() }));
  }
}

@Controller('console/v1/sandbox')
export class SandboxController {
  constructor(private readonly sandbox: Sandbox) {}

  @Get() @Needs('sandbox.read')
  list(@Query('school') school?: string): Promise<SandboxMessage[]> {
    return this.sandbox.list(school || undefined);
  }
}
