import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { totp } from '@gradeon/security';
import { startHarness, type Harness } from './harness.js';

// A console with no DEMO_CODE, like production: the second step is always an authenticator app.
let h: Harness;
let admin = '';
beforeAll(async () => {
  h = await startHarness({ DEMO_CODE: undefined as unknown as string });
}, 240_000);
afterAll(async () => {
  await h?.close();
});

const login = (identifier: string, password: string) => h.c('POST', '/console/v1/auth/login', { body: { identifier, password } });
const verify = (challengeId: string, code: string) => h.c('POST', '/console/v1/auth/verify', { body: { challengeId, code } });

describe('console authenticator', () => {
  it('sets one up at the first sign-in, then asks for its code every time', async () => {
    const first = (await login('kaushal@gradeon.app', 'nest2026')).json.challenge;
    expect(first).toMatchObject({ channel: 'app', enroll: { uri: expect.stringContaining('otpauth://totp/') } });
    expect((await verify(first.challengeId, '000000')).status).toBe(401);
    const ok = await verify(first.challengeId, totp(first.enroll.secret));
    expect(ok.status).toBe(200);
    admin = ok.json.accessToken;
    const again = (await login('kaushal@gradeon.app', 'nest2026')).json.challenge;
    expect(again.channel).toBe('app');
    expect(again.enroll).toBeUndefined();
    expect((await verify(again.challengeId, totp(first.enroll.secret))).status).toBe(200);
    const team = (await h.c('GET', '/console/v1/team', { token: admin })).json;
    expect(team.find((m: { email: string }) => m.email === 'kaushal@gradeon.app').authenticator).toBe(true);
  });

  it('lets a super admin reset a lost authenticator and a password', async () => {
    await h.c('POST', '/console/v1/team', { token: admin, body: { name: 'Tia Ops', email: 'tia@gradeon.app', roles: ['support'], password: 'first-long-password' } });
    const first = (await login('tia@gradeon.app', 'first-long-password')).json.challenge;
    expect((await verify(first.challengeId, totp(first.enroll.secret))).status).toBe(200);
    const tia = (await h.c('GET', '/console/v1/team', { token: admin })).json.find((m: { email: string }) => m.email === 'tia@gradeon.app');
    expect((await h.c('PUT', `/console/v1/team/${tia.id}`, { token: admin, body: { resetAuthenticator: true, password: 'second-long-password' } })).status).toBe(204);
    expect((await login('tia@gradeon.app', 'first-long-password')).status).toBe(401);
    expect((await login('tia@gradeon.app', 'second-long-password')).json.challenge.enroll).toBeDefined();
  });

  it('locks an account after five wrong passwords', async () => {
    for (let i = 0; i < 5; i++) await login('tia@gradeon.app', 'not-the-password');
    const locked = await login('tia@gradeon.app', 'second-long-password');
    expect(locked.json.code).toBe('locked');
  });
});
