import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness.js';

let h: Harness;
let t: string;
let second: string;

beforeAll(async () => {
  h = await startHarness();
  t = await h.signIn();
  await h.c('POST', '/console/v1/team', { token: t, body: { name: 'Second Admin', email: 'second@gradeon.app', roles: ['super_admin'], password: 'another-long-pass' } });
  second = await h.signIn('second@gradeon.app', 'another-long-pass');
}, 240_000);
afterAll(async () => {
  await h?.close();
});

const hookPath = (url: string) => new URL(url).pathname;
const custom = { url: 'https://sms.example.test/send', method: 'POST', body: '{"to":"{to}","text":"{text}"}', statusWebhook: true, statusIdPath: 'id', statusPath: 'status' };

describe('connections', () => {
  let id = '';
  it('checks a provider’s fields, seals secrets and never returns them', async () => {
    const missing = await h.c('POST', '/console/v1/integrations/connections', { token: t, body: { provider: 'custom-http', name: 'Our SMS', scope: 'platform', settings: { method: 'POST' } } });
    expect(missing.status).toBe(400);
    expect(missing.json.fields.url).toBeDefined();
    const made = await h.c('POST', '/console/v1/integrations/connections', { token: t, body: { provider: 'custom-http', name: 'Our SMS', scope: 'platform', settings: custom, secrets: { apiKey: 'sk_live_abcdef1234' } } });
    expect(made.status).toBe(200);
    id = made.json.id;
    const view = await h.c('GET', '/console/v1/integrations', { token: t });
    expect(JSON.stringify(view.json)).not.toContain('sk_live_abcdef');
    expect(view.json.connections.find((c: any) => c.id === id)).toMatchObject({ state: 'test', secretsSet: [{ key: 'apiKey', ending: '1234' }] });
    const row = (await h.registry.query('select secrets_sealed from integration_connections where id = $1', [id])).rows[0];
    expect(row.secrets_sealed).toMatch(/^v1\./);
    expect(row.secrets_sealed).not.toContain('sk_live');
  });

  it('goes live only after a passing test, and only with a second person', async () => {
    expect((await h.c('POST', `/console/v1/integrations/connections/${id}/live`, { token: t })).status).toBe(400);
    await h.registry.query('update integration_connections set health_ok = true where id = $1', [id]);
    const asked = await h.c('POST', `/console/v1/integrations/connections/${id}/live`, { token: t });
    expect(asked.json).toMatchObject({ action: 'integration.live', status: 'pending_approval', schoolId: null });
    expect((await h.c('POST', `/console/v1/actions/${asked.json.id}/approve`, { token: t })).status).toBe(403);
    expect((await h.c('POST', `/console/v1/actions/${asked.json.id}/approve`, { token: second })).json.status).toBe('done');
    expect((await h.registry.query('select state from integration_connections where id = $1', [id])).rows[0].state).toBe('live');
    // New keys on a live connection take it back to test: live again only through a second person.
    await h.c('PUT', `/console/v1/integrations/connections/${id}`, { token: t, body: { secrets: { apiKey: 'sk_live_new_9999' } } });
    expect((await h.registry.query('select state from integration_connections where id = $1', [id])).rows[0].state).toBe('test');
  });

  it('routes, refuses to delete a routed connection, and takes delivery reports on its webhook', async () => {
    expect((await h.c('PUT', '/console/v1/integrations/routes', { token: t, body: { capability: 'payments', schoolId: null, connectionId: id } })).status).toBe(400);
    expect((await h.c('PUT', '/console/v1/integrations/routes', { token: t, body: { capability: 'sms', schoolId: null, connectionId: id, settings: { senderId: 'GRDEON' } } })).status).toBe(204);
    expect((await h.c('DELETE', `/console/v1/integrations/connections/${id}`, { token: t })).status).toBe(409);
    await h.registry.query("insert into message_log (id, school_slug, channel, to_addr, body, status, connection_id, provider_message_id) values ('msg_t1','demo','sms','9822011002','Hello','sent',$1,'m-1')", [id]);
    const url = (await h.c('GET', '/console/v1/integrations', { token: t })).json.connections.find((c: any) => c.id === id).webhookUrl;
    expect((await h.s('POST', hookPath(url), { school: 'demo', body: { id: 'm-1', status: 'delivered' } })).status).toBe(200);
    expect((await h.registry.query("select status from message_log where id = 'msg_t1'")).rows[0].status).toBe('delivered');
    expect((await h.s('POST', `/hooks/${id}/not-the-token`, { school: 'demo', body: {} })).status).toBe(404);
    const events = await h.c('GET', `/console/v1/integrations/connections/${id}/events`, { token: t });
    expect(events.json[0]).toMatchObject({ ok: true });
  });

  it('refuses a payment webhook whose signature does not match', async () => {
    const made = await h.c('POST', '/console/v1/integrations/connections', { token: t, body: { provider: 'razorpay', name: 'Razorpay test', scope: 'platform', settings: { keyId: 'rzp_test_1' }, secrets: { keySecret: 's', webhookSecret: 'whsec' } } });
    const url = (await h.c('GET', '/console/v1/integrations', { token: t })).json.connections.find((c: any) => c.id === made.json.id).webhookUrl;
    const res = await h.api.inject({ method: 'POST', url: hookPath(url), headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'forged' }, payload: JSON.stringify({ event: 'payment_link.paid' }) });
    expect(res.statusCode).toBe(401);
    expect((await h.registry.query('select ok from integration_hook_events where connection_id = $1', [made.json.id])).rows[0].ok).toBe(false);
  });

  it('keeps the allow-list and shows Activity to readers only', async () => {
    expect((await h.c('PUT', '/console/v1/integrations/allow-list', { token: t, body: { allowList: [' 9822011002 ', 'you@gradeon.app', '9822011002'] } })).json.allowList).toEqual(['9822011002', 'you@gradeon.app']);
    const act = await h.c('GET', '/console/v1/integrations/activity?status=delivered', { token: t });
    expect(act.json.rows.some((r: any) => r.id === 'msg_t1')).toBe(true);
    expect((await h.c('GET', '/console/v1/integrations', {})).status).toBe(401);
  });
});
