import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(4000),
  /** The registry database: where the school list lives. */
  REGISTRY_DATABASE_URL: z.string().min(10),
  /** Seals school connection strings at rest. */
  SECRETS_KEY: z.string().min(16),
  JWT_SECRET: z.string().min(16),
  /** Previous JWT secret, so a rotation does not sign everyone out at once. */
  JWT_SECRET_PREVIOUS: z.string().min(16).optional(),
  CORS_ORIGINS: z.string().default('*'),
  APP_VERSION: z.string().default('0.1.0'),
  /** This server's public address: webhook addresses, payment return links and sandbox file links start with it. */
  API_BASE_URL: z.string().default(process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:4000'),
  TENANT_MAX_POOLS: z.coerce.number().int().min(1).max(500).default(20),
  TENANT_PER_POOL: z.coerce.number().int().min(1).max(20).default(3),
  /** Lets a hosted test track keep SEED_DEMO / DEMO_CODE while NODE_ENV=production. */
  ALLOW_DEMO: z.enum(['true', 'false']).default('false'),
});
export type Env = z.infer<typeof Env>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`The server is not configured correctly:\n${lines}`);
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
    if (source.SEED_DEMO === 'true' && env.ALLOW_DEMO !== 'true') problems.push('SEED_DEMO is not allowed in production unless ALLOW_DEMO=true.');
    if (source.DEMO_CODE && env.ALLOW_DEMO !== 'true') problems.push('DEMO_CODE is not allowed in production unless ALLOW_DEMO=true.');
    if (problems.length) throw new Error(`The server is not configured correctly:\n${problems.map((p) => `  ${p}`).join('\n')}`);
  }
  return env;
}

export const ENV = Symbol('ENV');
