import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const secrets = {
  REGISTRY_DATABASE_URL: 'postgres://tangent:tangent@127.0.0.1:5432/registry',
  SECRETS_KEY: 's'.repeat(32),
  JWT_SECRET: 'j'.repeat(32),
};

describe('console loadEnv in production', () => {
  const base = { NODE_ENV: 'production' as const, ...secrets, CORS_ORIGINS: 'https://console.example' };

  it('starts when secrets are long, different, and CORS is a list', () => {
    expect(() => loadEnv(base)).not.toThrow();
  });
  it('refuses a wildcard CORS list and demo switches unless ALLOW_DEMO is on', () => {
    expect(() => loadEnv({ ...base, CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS/);
    expect(() => loadEnv({ ...base, SEED_DEMO: 'true' })).toThrow(/SEED_DEMO/);
    expect(() => loadEnv({ ...base, DEMO_CODE: '424242' })).toThrow(/DEMO_CODE/);
    expect(() => loadEnv({ ...base, DEMO_CODE: '424242', ALLOW_DEMO: 'true' })).not.toThrow();
  });
});
