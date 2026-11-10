import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(4001),
  REGISTRY_DATABASE_URL: z.string().min(10),
  /** A separate database for school backups (recommended in production); without it they are kept in the registry. */
  BACKUP_DATABASE_URL: z.string().min(10).optional(),
  SECRETS_KEY: z.string().min(16),
  JWT_SECRET: z.string().min(16),
  JWT_SECRET_PREVIOUS: z.string().min(16).optional(),
  CORS_ORIGINS: z.string().default('*'),
  APP_VERSION: z.string().default('0.1.0'),
  /** Postgres server where `local` and shared test schools get their own database. Defaults to the registry's server. */
  SHARED_PG_ADMIN_URL: z.string().optional(),
  /** Where `free-test` schools get their own Neon project instead of a shared server. */
  NEON_API_KEY: z.string().optional(),
  NEON_REGION: z.string().default('aws-ap-southeast-1'),
  /** Where school admin sites are served from. */
  // On Render the service's own address is known; elsewhere the local development addresses are the default.
  ADMIN_BASE_URL: z.string().default(process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:5173'),
  API_BASE_URL: z.string().default(process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:4000'),
  BASE_DOMAIN: z.string().default('gradeon.app'),
  /** Must match the school API's: sandbox sends everything to the Test inbox, live needs a live connection per capability. */
  MESSAGING_MODE: z.enum(['sandbox', 'live']).default('sandbox'),
  /** Build profile commits and mobile build dispatches. Both stay switched off without a token. */
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_REPO: z.string().optional(),
  /** What the build workflow sends back to say a build is finished. Without it the callback stays closed. */
  BUILD_CALLBACK_TOKEN: z.string().min(16).optional(),
  GITHUB_BRANCH: z.string().default('main'),
  BOOTSTRAP_EMAIL: z.string().default('kaushal@gradeon.app'),
  BOOTSTRAP_NAME: z.string().default('Kaushal Bhatt'),
  BOOTSTRAP_PASSWORD: z.string().default('nest2026'),
  /** Fixed sign-in code for the demo console. Never set in a real deployment. */
  DEMO_CODE: z.string().regex(/^\d{6}$/).optional(),
  /** Creates the Greenfield demo school on first start when there is none. */
  SEED_DEMO: z.enum(['true', 'false']).default('false'),
  ALLOW_DEMO: z.enum(['true', 'false']).default('false'),
  PROBE_SECONDS: z.coerce.number().int().default(60),
  /** A Slack or Discord incoming webhook: new errors, a school not answering, failed backups and failed restore drills are posted there. */
  ALERT_WEBHOOK_URL: z.string().url().optional(),
  STEP_PAUSE_MS: z.coerce.number().int().default(350),
  TENANT_MAX_POOLS: z.coerce.number().int().min(1).max(500).default(20),
  TENANT_PER_POOL: z.coerce.number().int().min(1).max(20).default(3),
});
export type Env = z.infer<typeof Env>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`The console is not configured correctly:\n${lines}`);
  }
  const env = parsed.data;
  // The service's own address (Render sets RENDER_EXTERNAL_URL) is always allowed: a renamed service or a stale CORS_ORIGINS cannot lock anyone out.
  const own = source.RENDER_EXTERNAL_URL;
  if (own) env.CORS_ORIGINS = env.CORS_ORIGINS === '*' ? own : [...new Set([...env.CORS_ORIGINS.split(',').map((o) => o.trim()), own])].join(',');
  if (env.NODE_ENV === 'production') {
    const problems: string[] = [];
    if (env.JWT_SECRET.length < 32) problems.push('JWT_SECRET must be at least 32 characters.');
    if (env.SECRETS_KEY.length < 32) problems.push('SECRETS_KEY must be at least 32 characters.');
    if (env.JWT_SECRET === env.SECRETS_KEY) problems.push('JWT_SECRET and SECRETS_KEY must be different.');
    if (env.CORS_ORIGINS === '*') problems.push('CORS_ORIGINS must list the admin and console origins, not *.');
    if (env.SEED_DEMO === 'true' && env.ALLOW_DEMO !== 'true') problems.push('SEED_DEMO is not allowed in production unless ALLOW_DEMO=true.');
    if (env.DEMO_CODE && env.ALLOW_DEMO !== 'true') problems.push('DEMO_CODE is not allowed in production unless ALLOW_DEMO=true.');
    if (problems.length) throw new Error(`The console is not configured correctly:\n${problems.map((p) => `  ${p}`).join('\n')}`);
  }
  return env;
}

export const ENV = Symbol('ENV');
