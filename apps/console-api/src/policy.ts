import { Body, Controller, Get, HttpCode, Injectable, Put } from '@nestjs/common';
import { ACTIONS, type ConsoleRole, type PolicyDoc } from '@gradeon/contracts';
import { ApiError } from '@gradeon/nest-kit';
import { Db, Me, Needs, type ConsoleUser } from './core.js';

export const DEFAULT_POLICY: PolicyDoc = {
  approvals: Object.fromEntries(ACTIONS.map((a) => [a, { needed: a === 'school.erase' || a === 'school.move' || a === 'backup.restore', roles: ['super_admin'] as ConsoleRole[] }])),
  waves: [
    { name: 'Internal', matches: 'internal', batch: 1 },
    { name: 'Pilot', matches: 'pilot', batch: 5 },
    { name: 'Everyone else', matches: 'rest', batch: 10 },
  ],
  halt: { errorRatePct: 2, p95Ms: 1500 },
  freeze: false,
  naming: { slugPattern: '^[a-z][a-z0-9-]{2,30}[a-z0-9]$', bundlePrefix: 'in.gradeon.' },
  maintenanceWindow: 'Sun 01:00–03:00 IST',
};

/** Rules the console runs on: which actions need a second person, how a release rolls, and the freeze switch. All data, all editable. */
@Injectable()
export class Policy {
  constructor(private readonly db: Db) {}

  async get(): Promise<PolicyDoc> {
    const { rows } = await this.db.pool.query<{ value: PolicyDoc }>("select value from console_settings where key = 'policy'");
    const stored = rows[0]?.value;
    return stored ? { ...DEFAULT_POLICY, ...stored, approvals: { ...DEFAULT_POLICY.approvals, ...stored.approvals } } : DEFAULT_POLICY;
  }

  async set(user: string, doc: PolicyDoc): Promise<PolicyDoc> {
    if (doc.halt.errorRatePct < 0 || doc.halt.p95Ms < 100) throw new ApiError('validation', 'The halt thresholds do not make sense.');
    if (!doc.waves.length || doc.waves.some((w) => w.batch < 1 || !w.name.trim())) throw new ApiError('validation', 'Each wave needs a name and a batch size of at least 1.');
    if (doc.waves.at(-1)!.matches !== 'rest') throw new ApiError('validation', 'The last wave must be “Everyone else”, so no school is left out of a release.');
    if (!doc.naming.bundlePrefix.trim()) throw new ApiError('validation', 'The app bundle prefix cannot be empty.');
    await this.db.pool.query("insert into console_settings (key, value, updated_by) values ('policy', $1, $2) on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()", [JSON.stringify(doc), user]);
    await this.db.audit(user, 'policy.changed', 'policy', 'policy', { freeze: doc.freeze });
    return this.get();
  }
}

@Controller('console/v1/policy')
export class PolicyController {
  constructor(private readonly policy: Policy) {}

  @Get() @Needs('schools.read')
  get(): Promise<PolicyDoc> {
    return this.policy.get();
  }

  @Put() @HttpCode(200) @Needs('policy.write')
  set(@Me() me: ConsoleUser, @Body() body: PolicyDoc): Promise<PolicyDoc> {
    return this.policy.set(me.email, body);
  }
}
