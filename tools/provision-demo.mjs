#!/usr/bin/env node
// Creates the Greenfield demo school through the console API, the same way the new-school wizard does.
// Usage: node tools/provision-demo.mjs [apiBase] [email] [password] [code]
const [base = 'http://localhost:4000', email = 'kaushal@tangent.app', password = 'nest2026', code = '424242'] = process.argv.slice(2);

async function call(path, body, token) {
  const res = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${json.message ?? res.status}`);
  return json;
}

const step = await call('/console/v1/auth/login', { identifier: email, password });
const { accessToken } = await call('/console/v1/auth/verify', { challengeId: step.challenge.challengeId, code });
const cells = await call('/console/v1/cells', null, accessToken);
const cell = cells[0];
const existing = await call('/console/v1/schools?query=greenfield', null, accessToken);
if (existing.some((s) => s.slug === 'greenfield')) {
  console.log('Greenfield already exists.');
  process.exit(0);
}
const payload = {
  basics: { name: 'Greenfield International School', shortName: 'Greenfield', slug: 'greenfield', board: 'International', address: '42, Baner Road, Baner', city: 'Pune', contactName: 'Neha Menon', contactPhone: '+91 98220 41200', contactEmail: 'neha.menon@greenfield.edu.in', gstin: '', language: 'en' },
  plan: { plan: 'premium', modules: ['people', 'attendance', 'fees', 'notices', 'timetable', 'homework', 'events', 'exams', 'chat', 'transport', 'library', 'gallery'], addOns: [], locks: [], students: 1500 },
  branding: { color: '#6A4CF5', logoText: 'G', appName: 'Greenfield', tagline: 'Curiosity first. Kindness always.' },
  placement: { target: cell.target, cell: cell.key, addressing: 'path', customDomain: '' },
  admin: { name: 'Neha Menon', email: 'neha.menon@greenfield.edu.in', phone: '+91 98220 41200', invite: 'both', roles: ['principal'] },
  data: { start: 'demo' },
};
const run = await call('/console/v1/wizard/launch', { payload }, accessToken);
console.log(`Setting up Greenfield (run ${run.id})...`);
for (;;) {
  await new Promise((ok) => setTimeout(ok, 800));
  const r = await call(`/console/v1/runs/${run.id}`, null, accessToken);
  process.stdout.write(`\r${r.steps.map((s) => ({ done: '#', running: '>', failed: 'X', skipped: '-', pending: '.' })[s.status]).join('')}  ${r.status}   `);
  if (r.status === 'succeeded') { console.log('\nGreenfield is live. Sign in with neha.menon@greenfield.edu.in / nest2026 / 424242'); break; }
  if (r.status === 'failed') { console.log(`\nStopped: ${r.steps.find((s) => s.status === 'failed')?.error}`); process.exit(1); }
}
