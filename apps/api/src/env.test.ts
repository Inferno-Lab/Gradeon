import { describe, expect, it } from 'vitest';
import { Limiter, assertCsrf, assertOrigin } from '@gradeon/nest-kit';
import { loadEnv } from './env.js';

const secrets = {
  REGISTRY_DATABASE_URL: 'postgres://gradeon:gradeon@127.0.0.1:5432/registry',
  SECRETS_KEY: 's'.repeat(32),
  JWT_SECRET: 'j'.repeat(32),
};

describe('loadEnv in production', () => {
  const base = { NODE_ENV: 'production' as const, ...secrets, CORS_ORIGINS: 'https://admin.example' };

  it('starts when secrets are long, different, and CORS is a list', () => {
    expect(() => loadEnv(base)).not.toThrow();
  });
  it('refuses a short secret, the same two secrets, and a wildcard CORS list', () => {
    expect(() => loadEnv({ ...base, JWT_SECRET: 'short-secret-16ch' })).toThrow(/32 characters/);
    expect(() => loadEnv({ ...base, JWT_SECRET: base.SECRETS_KEY })).toThrow(/different/);
    expect(() => loadEnv({ ...base, CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS/);
  });
  it('refuses demo switches unless ALLOW_DEMO is on', () => {
    expect(() => loadEnv({ ...base, SEED_DEMO: 'true' })).toThrow(/SEED_DEMO/);
    expect(() => loadEnv({ ...base, DEMO_CODE: '424242' })).toThrow(/DEMO_CODE/);
    expect(() => loadEnv({ ...base, SEED_DEMO: 'true', ALLOW_DEMO: 'true' })).not.toThrow();
  });
});

describe('Limiter', () => {
  it('allows a burst then refuses with a retry time', () => {
    const lim = new Limiter(2, 60_000);
    lim.check('a');
    lim.check('a');
    expect(() => lim.check('a')).toThrow(/Too many tries/);
  });
});

describe('CSRF helpers', () => {
  it('accepts a matching cookie and header, and an allowed Origin', () => {
    expect(() => assertCsrf('abc', 'abc')).not.toThrow();
    expect(() => assertCsrf('abc', 'nope')).toThrow();
    expect(() => assertOrigin(undefined, 'https://a.example')).not.toThrow();
    expect(() => assertOrigin('https://a.example', 'https://a.example,https://b.example')).not.toThrow();
    expect(() => assertOrigin('https://evil.example', 'https://a.example')).toThrow();
  });
});
