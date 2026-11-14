import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { totp } from '@tangent/security';
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
    const first = (await login('kaushal@tangent.app', 'nest2026')).json.challenge;
    expect(first).toMatchObject({ channel: 'app', enroll: { uri: expect.stringContaining('otpauth://totp/') } });
    expect((await verify(first.challengeId, '000000')).status).toBe(401);
    const ok = await verify(first.challengeId, totp(first.enroll.secret));
    expect(ok.status).toBe(200);
    admin = ok.json.accessToken;
    const again = (await login('kaushal@tangent.app', 'nest2026')).json.challenge;
    expect(again.channel).toBe('app');
    expect(again.enroll).toBeUndefined();
    // A code already used is refused (no replay); the authenticator's next code works (the window allows one step ahead).
    expect((await verify(again.challengeId, totp(first.enroll.secret))).status).toBe(401);
    expect((await verify(again.challengeId, totp(first.enroll.secret, Date.now() + 30_000))).status).toBe(200);
    const team = (await h.c('GET', '/console/v1/team', { token: admin })).json;
    expect(team.find((m: { email: string }) => m.email === 'kaushal@tangent.app').authenticator).toBe(true);
  });

  it('lets a super admin reset a lost authenticator, never set someone’s password; the person changes their own', async () => {
    await h.invite(admin, { name: 'Tia Ops', email: 'tia@tangent.app', roles: ['support'] }, 'first-long-password');
    const first = (await login('tia@tangent.app', 'first-long-password')).json.challenge;
    expect((await verify(first.challengeId, totp(first.enroll.secret))).status).toBe(200);
    const tia = (await h.c('GET', '/console/v1/team', { token: admin })).json.find((m: { email: string }) => m.email === 'tia@tangent.app');
    expect((await h.c('PUT', `/console/v1/team/${tia.id}`, { token: admin, body: { resetAuthenticator: true } })).status).toBe(204);
    const again = (await login('tia@tangent.app', 'first-long-password')).json.challenge;
    expect(again.enroll).toBeDefined();
    const tiaToken = (await verify(again.challengeId, totp(again.enroll.secret))).json.accessToken;
    // My account: the current password is needed, then the new one works and the old one does not.
    expect((await h.c('POST', '/console/v1/auth/password', { token: tiaToken, body: { current: 'wrong-one', next: 'second-long-password' } })).status).toBe(400);
    expect((await h.c('POST', '/console/v1/auth/password', { token: tiaToken, body: { current: 'first-long-password', next: 'second-long-password' } })).status).toBe(204);
    expect((await login('tia@tangent.app', 'first-long-password')).status).toBe(401);
    expect((await login('tia@tangent.app', 'second-long-password')).status).toBe(200);
  });

  it('locks an account after five wrong passwords', async () => {
    for (let i = 0; i < 5; i++) await login('tia@tangent.app', 'not-the-password');
    const locked = await login('tia@tangent.app', 'second-long-password');
    expect(locked.json.code).toBe('locked');
  });
});
