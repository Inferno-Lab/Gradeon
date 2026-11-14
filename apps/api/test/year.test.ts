import { addDays } from '@tangent/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness.js';

// Year-end changes the whole school (classes, students, the current year), so it runs on a database of its own.
let h: Harness;
let token: string;
beforeAll(async () => {
  h = await startHarness();
  token = await h.login();
}, 240_000);
afterAll(async () => {
  await h?.close();
});

describe('year-end', () => {
  it('promotes only into a drafted year, and starts the year only after a promotion into it', async () => {
    const view = (await h.call('GET', '/v1/year', { token })).json;
    const current = view.years.find((y: any) => y.status === 'current');
    const preview = (await h.call('GET', '/v1/year/promotion', { token })).json;
    const moves = preview.classes.map((c: any) => ({ fromClassId: c.fromClassId, toClassId: c.toClassId }));
    // Into the current year: refused (a promotion goes into the next year).
    expect((await h.call('POST', '/v1/year/promotion', { token, body: { toYear: current.id, moves, detained: [], leaving: [] } })).status).toBe(409);
    const startsOn = addDays(current.endsOn, 1);
    expect((await h.call('POST', '/v1/year', { token, body: { label: 'Next year', startsOn, endsOn: addDays(startsOn, 364) } })).status).toBe(204);
    const draft = (await h.call('GET', '/v1/year', { token })).json.years.find((y: any) => y.status === 'draft');
    expect((await h.call('POST', `/v1/year/${draft.id}/start`, { token })).status).toBe(409);
    const run = await h.call('POST', '/v1/year/promotion', { token, body: { toYear: draft.id, moves, detained: [], leaving: [] } });
    expect(run.status).toBe(200);
    expect(run.json.moved + run.json.left).toBeGreaterThan(0);
    expect((await h.call('POST', `/v1/year/${draft.id}/start`, { token })).status).toBe(204);
    const after = (await h.call('GET', '/v1/year', { token })).json.years;
    expect(after.find((y: any) => y.id === draft.id).status).toBe('current');
    expect(after.find((y: any) => y.id === current.id).status).toBe('archived');
  }, 120_000);
});
