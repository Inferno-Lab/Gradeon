import { Body, Controller, Get, HttpCode, Injectable, Put } from '@nestjs/common';
import { ACTIONS, ROLE_TEMPLATES, RoleTemplatesPut, ThemeColorsSchema, type ConsoleRole, type PolicyDoc, type RoleTemplate, type ThemeColors } from '@gradeon/contracts';
import { ZodPipe } from '@gradeon/nest-kit';
import { ApiError } from '@gradeon/nest-kit';
import { Db, Me, Needs, Public, type ConsoleUser } from './core.js';

export const DEFAULT_POLICY: PolicyDoc = {
  approvals: Object.fromEntries(ACTIONS.map((a) => [a, { needed: ['school.erase', 'school.move', 'backup.restore', 'config.apply', 'integration.live', 'integration.mode', 'retention.erase'].includes(a), roles: ['super_admin'] as ConsoleRole[] }])),
  waves: [
    { name: 'Internal', matches: 'internal', batch: 1 },
    { name: 'Pilot', matches: 'pilot', batch: 5 },
    { name: 'Everyone else', matches: 'rest', batch: 10 },
  ],
  halt: { errorRatePct: 2, p95Ms: 1500 },
  freeze: false,
  freezeReason: '',
  naming: { slugPattern: '^[a-z][a-z0-9-]{2,30}[a-z0-9]$', bundlePrefix: 'com.gradeon.' },
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
    if (doc.freeze && (doc.freezeReason ?? '').trim().length < 5) throw new ApiError('validation', 'Say why changes are frozen.');
    if (Object.values(doc.approvals).some((r) => r.needed && !r.roles.length)) throw new ApiError('validation', 'Each rule needs at least one role that may approve it.');
    await this.db.pool.query("insert into console_settings (key, value, updated_by) values ('policy', $1, $2) on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()", [JSON.stringify(doc), user]);
    await this.db.audit(user, 'policy.changed', 'policy', 'policy', { freeze: doc.freeze, reason: doc.freezeReason ?? '' });
    return this.get();
  }
}

/** The roles a new school starts with (decision D6): data the console edits, the built-in ones until it does. */
@Injectable()
export class RoleTemplates {
  constructor(private readonly db: Db) {}

  async get(): Promise<RoleTemplate[]> {
    const { rows } = await this.db.pool.query<{ value: RoleTemplate[] }>("select value from console_settings where key = 'role_templates'");
    return rows[0]?.value?.length ? rows[0].value : ROLE_TEMPLATES;
  }

  async set(user: string, list: RoleTemplate[]): Promise<RoleTemplate[]> {
    const keys = list.map((r) => r.key);
    if (new Set(keys).size !== keys.length) throw new ApiError('validation', 'Two starting roles have the same key.');
    // Demo schools and every school's principal rely on these; they can be renamed and changed, not removed.
    const missing = ROLE_TEMPLATES.filter((t) => !keys.includes(t.key));
    if (missing.length) throw new ApiError('validation', `${missing.map((t) => t.name).join(', ')} cannot be removed; change what it can do instead.`);
    await this.db.pool.query("insert into console_settings (key, value, updated_by) values ('role_templates', $1, $2) on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()", [JSON.stringify(list), user]);
    await this.db.audit(user, 'role_templates.changed', 'policy', 'role_templates', { roles: list.length });
    return this.get();
  }
}

@Controller('console/v1/role-templates')
export class RoleTemplatesController {
  constructor(private readonly roles: RoleTemplates) {}

  @Get() @Needs('schools.read')
  get(): Promise<RoleTemplate[]> {
    return this.roles.get();
  }

  @Put() @HttpCode(200) @Needs('blueprints.write')
  set(@Me() me: ConsoleUser, @Body(new ZodPipe(RoleTemplatesPut)) body: RoleTemplate[]): Promise<RoleTemplate[]> {
    return this.roles.set(me.email, body);
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

/** The console's own colours (only `web.*` keys), kept beside the policy. Read before sign-in, so the sign-in page wears them too. */
@Controller('console/v1/theme')
export class ConsoleThemeController {
  constructor(private readonly db: Db) {}

  @Public() @Get()
  async get(): Promise<ThemeColors> {
    const { rows } = await this.db.pool.query<{ value: ThemeColors }>("select value from console_settings where key = 'theme'");
    return rows[0]?.value ?? {};
  }

  @Put() @HttpCode(200) @Needs('policy.write')
  async set(@Me() me: ConsoleUser, @Body() body: unknown): Promise<ThemeColors> {
    const parsed = ThemeColorsSchema.safeParse(body);
    if (!parsed.success || Object.keys(parsed.data).some((k) => !k.startsWith('web.'))) throw new ApiError('validation', parsed.success ? 'The console only has admin-style colours.' : parsed.error.issues[0]!.message);
    await this.db.pool.query("insert into console_settings (key, value, updated_by) values ('theme', $1, $2) on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()", [JSON.stringify(parsed.data), me.email]);
    await this.db.audit(me.email, 'theme.changed', 'policy', 'theme', { colours: Object.keys(parsed.data).length });
    return parsed.data;
  }
}
