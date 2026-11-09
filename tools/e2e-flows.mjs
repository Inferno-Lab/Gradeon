#!/usr/bin/env node
// Drives the real admin and console in a browser through the flows people use, against the demo school, and fails on the first thing that
// does not behave. Run after `tools/dev-reset.sh` (it changes demo data). Usage: node tools/e2e-flows.mjs [outDir]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'e2e-shots';
mkdirSync(out, { recursive: true });
const API = process.env.API ?? 'http://localhost:4000';
const ADMIN = process.env.ADMIN ?? 'http://127.0.0.1:5173';
const CONSOLE = process.env.CONSOLE ?? 'http://127.0.0.1:5174';
const slug = 'greenfield';
const post = async (p, b, h = {}) => (await fetch(API + p, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) })).json();

const browser = await chromium.launch();
const errors = [];
let passed = 0;
async function flow(name, ctxOpts, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', ...ctxOpts.context });
  if (ctxOpts.storage) await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, ctxOpts.storage); if (ctxOpts.storage?.[2]) await ctx.route(/\/auth\/refresh$/, (r) => r.fulfill({ json: { accessToken: ctxOpts.storage[2], expiresInSeconds: 900 } }));
  const page = await ctx.newPage();
  const seen = [];
  page.on('pageerror', (e) => seen.push(`pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/40[01] \(|Failed to load resource/.test(m.text())) seen.push(`console ${m.text().slice(0, 140)}`); });
  try {
    await fn(page);
    if (seen.length) throw new Error(seen.join(' | '));
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    errors.push(`${name}: ${e.message.split('\n')[0]}`);
    console.log(`✗ ${name}: ${e.message.split('\n')[0]}`);
    await page.screenshot({ path: `${out}/FAIL-${name.replace(/\W+/g, '_')}.png` }).catch(() => undefined);
  }
  await ctx.close();
}
/** Opens one of the page's dropdowns and picks an option by its words (or by its place in the list). */
const pick = async (page, scope, label, option) => {
  await scope.getByLabel(label).click();
  const o = typeof option === 'number' ? page.getByRole('option').nth(option) : page.getByRole('option', { name: option, exact: true });
  await o.click();
};
const expectVisible = async (loc, what, timeout = 8000) => { await loc.first().waitFor({ state: 'visible', timeout }).catch(() => { throw new Error(`expected to see ${what}`); }); };

// ── tokens ───────────────────────────────────────────────────────────────
const h = { 'x-school': slug };
const a = await post('/v1/auth/login', { identifier: 'neha.menon@greenfield.edu.in', password: 'nest2026' }, h);
const t = await post('/v1/auth/verify', { challengeId: a.challenge.challengeId, code: '424242' }, h);
const adminStore = [`gradeon.admin.${slug}`, JSON.stringify({ user: t.user }), t.accessToken];
const ca = await post('/console/v1/auth/login', { identifier: 'kaushal@gradeon.app', password: 'nest2026' });
const ct = await post('/console/v1/auth/verify', { challengeId: ca.challenge.challengeId, code: '424242' });
const consoleStore = ['gradeon.console', JSON.stringify({ user: ct.user }), ct.accessToken];
const school = (await (await fetch(`${API}/console/v1/schools`, { headers: { authorization: `Bearer ${ct.accessToken}` } })).json()).find((s) => s.slug === slug);

// ── admin ────────────────────────────────────────────────────────────────
await flow('admin: wrong password shows an error, then the demo code signs in', {}, async (p) => {
  await p.goto(`${ADMIN}/s/${slug}/login`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /^Sign in/ }).click();
  await expectVisible(p.getByText('Enter your email or phone number to continue').or(p.getByText('Enter your password to continue')), 'an empty-form error');
  await p.getByLabel('Email or phone number').fill('neha.menon@greenfield.edu.in');
  await p.locator('#lg-pw').fill('wrong-password');
  await p.getByRole('button', { name: /^Sign in/ }).click();
  await expectVisible(p.getByRole('alert'), 'the wrong-password message');
  await p.locator('#lg-pw').fill('nest2026');
  await p.getByRole('button', { name: /^Sign in/ }).click();
  await expectVisible(p.getByText('Verify and sign in'), 'the code step');
  await p.getByLabel('6-digit code').fill('111111');
  await expectVisible(p.getByRole('alert'), 'the wrong-code message');
  await p.getByRole('button', { name: /Type the demo code/ }).click();
  await p.waitForURL(`${ADMIN}/s/${slug}/`, { timeout: 15000 });
  await expectVisible(p.getByRole('heading', { name: 'Dashboard' }), 'the dashboard');
});

await flow('admin: a forgotten password is replaced with a code, then signs in by phone number', {}, async (p) => {
  await p.goto(`${ADMIN}/s/${slug}/login`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Forgot it?' }).click();
  await expectVisible(p.getByText('Type your email or phone number first'), 'a request for the email first');
  await p.getByLabel('Email or phone number').fill('kavita.iyer@greenfield.edu.in');
  await p.getByRole('button', { name: 'Forgot it?' }).click();
  await expectVisible(p.getByText('Type it with your new password'), 'the reset step');
  await p.getByLabel('New password').fill('kavita-new-2026');
  await p.getByRole('button', { name: /Type the demo code/ }).click();
  await expectVisible(p.getByText('Your password is changed'), 'the changed-password note');
  const phone = (await (await fetch(`${API}/v1/staff`, { headers: { ...h, authorization: `Bearer ${t.accessToken}` } })).json()).find((s) => s.email === 'kavita.iyer@greenfield.edu.in').phone;
  await p.getByLabel('Email or phone number').fill(phone);
  await p.locator('#lg-pw').fill('kavita-new-2026');
  await p.getByRole('button', { name: /^Sign in/ }).click();
  await expectVisible(p.getByText('Verify and sign in'), 'the code step');
});

await flow('admin: dashboard approval, then undo', { storage: adminStore }, async (p) => {
  await p.goto(`${ADMIN}/s/${slug}/`, { waitUntil: 'networkidle' });
  await expectVisible(p.getByText('Needs you'), 'the needs-you card');
  await p.getByRole('button', { name: 'Approve' }).first().click();
  await expectVisible(p.getByRole('status'), 'the confirmation toast');
});

await flow('admin: add a student, find it, collect a fee', { storage: adminStore }, async (p) => {
  await p.goto(`${ADMIN}/s/${slug}/students`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Add student' }).first().click();
  await p.getByRole('button', { name: 'Add student' }).last().click();
  await expectVisible(p.getByText(/name/i).and(p.getByRole('alert')), 'a name error');
  await p.getByLabel('Full name').fill('Test Student Zed');
  await p.getByLabel('Date of birth').fill('2014-05-06');
  await p.getByLabel('Guardian', { exact: true }).fill('Zed Parent');
  await p.getByLabel('Guardian’s phone').fill('9820099887');
  await p.getByRole('button', { name: 'Add student' }).last().click();
  await expectVisible(p.getByRole('status'), 'the added toast');
  await p.getByLabel('Search students').fill('Test Student Zed');
  await expectVisible(p.getByText('Test Student Zed'), 'the new student in the list', 10000);
});

await flow('admin: a student drawer opens and closes', { storage: adminStore }, async (p) => {
  await p.goto(`${ADMIN}/s/${slug}/students`, { waitUntil: 'networkidle' });
  await p.locator('.rw').first().click();
  await expectVisible(p.locator('.drw'), 'the student drawer');
  await p.keyboard.press('Escape');
  await p.locator('.drw.open').waitFor({ state: 'detached', timeout: 3000 }).catch(() => undefined);
});

await flow('admin: timetable clash can be fixed and published', { storage: adminStore }, async (p) => {
  await p.goto(`${ADMIN}/s/${slug}/timetable`, { waitUntil: 'networkidle' });
  await expectVisible(p.getByText(/clash/i), 'the clash notice');
  await p.locator('.cell.bad, [class*=bad]').first().click();
  await expectVisible(p.getByRole('button', { name: /to cover/ }), 'the cover suggestion');
  await p.getByRole('button', { name: /to cover/ }).click();
  await expectVisible(p.getByText(/Clash fixed/), 'the fixed message');
  await p.getByRole('button', { name: /Publish/ }).first().click();
  await expectVisible(p.getByRole('status'), 'the published toast');
});

await flow('admin: roll call can be changed and saved', { storage: adminStore }, async (p) => {
  await p.goto(`${ADMIN}/s/${slug}/attendance`, { waitUntil: 'networkidle' });
  await expectVisible(p.getByText('Roll call'), 'the roll call');
  await p.getByRole('group', { name: /^Attendance for/ }).first().getByRole('button', { name: 'Absent' }).click();
  await expectVisible(p.getByText(/1 change/), 'the unsaved count');
  await p.getByRole('button', { name: 'Save roll call' }).click();
  await expectVisible(p.getByRole('status'), 'the saved toast');
});

await flow('admin: a notice is written and goes for approval or out', { storage: adminStore }, async (p) => {
  await p.goto(`${ADMIN}/s/${slug}/notices`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'New notice' }).click();
  await p.getByRole('button', { name: /Save as draft/ }).click();
  await expectVisible(p.getByText('Give the notice a title.'), 'the title error');
  await p.getByLabel('Title').fill('Sports day on Friday');
  await p.locator('#ntc-body').fill('Children come in sports uniform. School ends at noon.');
  await p.getByRole('button', { name: /Send now|Send for approval/ }).click();
  await expectVisible(p.getByText('Sports day on Friday'), 'the notice in the list');
});

await flow('admin: fees page lists overdue families and opens a payment', { storage: adminStore }, async (p) => {
  await p.goto(`${ADMIN}/s/${slug}/fees`, { waitUntil: 'networkidle' });
  await expectVisible(p.getByText('Overdue families'), 'the overdue list');
  await p.getByRole('button', { name: 'Collect' }).first().click();
  await expectVisible(p.getByText(/Collect a fee from/), 'the payment dialog');
  await p.keyboard.press('Escape');
});

await flow('admin: school setup is read-only, and a change is asked of Gradeon', { storage: adminStore }, async (p) => {
  await p.goto(`${ADMIN}/s/${slug}/settings`, { waitUntil: 'networkidle' });
  await expectVisible(p.getByRole('heading', { name: 'School setup' }), 'the School setup page');
  if (await p.getByRole('button', { name: 'Save changes' }).count()) throw new Error('the school can still save settings');
  if (!(await p.getByLabel('School name').isDisabled().catch(() => false)) && (await p.getByLabel('School name').getAttribute('readonly')) === null) throw new Error('the school name can still be edited');
  await p.getByRole('button', { name: 'Ask Gradeon to change this' }).click();
  await p.getByRole('button', { name: 'Send to Gradeon' }).click();
  await expectVisible(p.getByText('Say what you would like changed.'), 'the empty-request error');
  await p.getByLabel('What would you like changed?').fill('Please put Events in the app’s bottom tabs.');
  await p.getByRole('button', { name: 'Send to Gradeon' }).click();
  await expectVisible(p.getByText(/Sent to Gradeon/), 'the sent toast');
  await p.getByRole('button', { name: 'Modules' }).click();
  await expectVisible(p.getByText('Always on'), 'the modules list');
});

await flow('admin: search palette and keyboard shortcuts', { storage: adminStore }, async (p) => {
  await p.goto(`${ADMIN}/s/${slug}/`, { waitUntil: 'networkidle' });
  await p.keyboard.press('Control+k');
  await p.keyboard.type('Aarav', { delay: 40 });
  await expectVisible(p.getByText(/^Aarav /), 'a search result');
  await p.keyboard.press('Escape');
  await p.keyboard.press('g');
  await p.keyboard.press('s');
  await p.waitForURL(/\/students/);
});

await flow('admin: search opens on every page and the menu collapses', { storage: adminStore }, async (p) => {
  for (const path of ['', '/students', '/timetable', '/settings']) {
    await p.goto(`${ADMIN}/s/${slug}${path}`, { waitUntil: 'networkidle' });
    await p.keyboard.press('Control+k');
    await expectVisible(p.getByLabel('Search', { exact: true }), `the search box on ${path || '/'}`);
    await p.keyboard.press('Escape');
  }
  await p.getByRole('button', { name: 'Collapse the menu' }).click();
  await expectVisible(p.getByRole('button', { name: 'Expand the menu' }), 'the collapsed menu');
});

// Sign-out revokes its session on the server, so this flow gets a session of its own and the flows after it keep theirs.
const so = await post('/v1/auth/login', { identifier: 'neha.menon@greenfield.edu.in', password: 'nest2026' }, h);
const st = await post('/v1/auth/verify', { challengeId: so.challenge.challengeId, code: '424242' }, h);
const signOutStore = [adminStore[0], JSON.stringify({ user: st.user }), st.accessToken];
await flow('admin: sign out returns to the sign-in page', { storage: signOutStore }, async (p) => {
  await p.goto(`${ADMIN}/s/${slug}/`, { waitUntil: 'networkidle' });
  await p.locator('.mebtn').click();
  await p.getByRole('menuitem', { name: 'Sign out' }).click();
  await p.waitForURL(/\/login/);
});

await flow('admin: phone dock navigates', { storage: adminStore, context: { viewport: { width: 390, height: 844 } } }, async (p) => {
  await p.goto(`${ADMIN}/s/${slug}/`, { waitUntil: 'networkidle' });
  await expectVisible(p.getByText('Needs you'), 'the phone home');
  await p.getByRole('button', { name: 'People' }).click();
  await p.waitForURL(/\/students/);
  await p.getByRole('button', { name: 'More' }).click();
  await p.getByRole('link', { name: 'Timetable' }).click();
  await p.waitForURL(/\/timetable/);
});

// ── console ──────────────────────────────────────────────────────────────
await flow('console: wrong password shakes, right password and code sign in', {}, async (p) => {
  await p.goto(`${CONSOLE}/login`, { waitUntil: 'networkidle' });
  await p.getByLabel('Gradeon email').fill('kaushal@gradeon.app');
  await p.locator('#lg-pw').fill('nope');
  await p.getByRole('button', { name: /^Continue/ }).click();
  await expectVisible(p.getByRole('alert'), 'the wrong-password message');
  await p.locator('#lg-pw').fill('nest2026');
  await p.getByRole('button', { name: /^Continue/ }).click();
  await expectVisible(p.getByText('Verify and sign in'), 'the code step');
  await p.getByLabel('6-digit code').fill('424242');
  await p.waitForURL(`${CONSOLE}/`, { timeout: 15000 });
  await expectVisible(p.getByRole('heading', { name: 'Fleet' }), 'the fleet page');
});

const ver = `2026.10.${Math.floor(Math.random() * 900) + 50}`;
await flow('console: create, start, pause and roll back a release', { storage: consoleStore }, async (p) => {
  await p.goto(`${CONSOLE}/releases`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'New release' }).click();
  await p.getByLabel('Version').fill('bad');
  await p.getByRole('button', { name: 'Create', exact: true }).click();
  await expectVisible(p.getByText(/year, month and a number|Use year/i), 'the version error');
  await p.getByLabel('Version').fill(ver);
  await p.getByLabel('What changed').fill('Test release');
  await p.getByRole('button', { name: 'Create', exact: true }).click();
  await expectVisible(p.getByText(ver), 'the new release');
  await p.getByRole('button', { name: 'Start rollout' }).first().click();
  await expectVisible(p.getByRole('status'), 'the started toast');
  await p.getByRole('button', { name: /Roll back/ }).first().click();
  await p.getByRole('button', { name: 'Roll back', exact: true }).last().click();
  await expectVisible(p.getByText(/Rolled back/i), 'the rolled back state');
});

await flow('console: flags add and toggle', { storage: consoleStore }, async (p) => {
  await p.goto(`${CONSOLE}/flags`, { waitUntil: 'networkidle' });
  await p.getByLabel('Key').fill('Bad Key');
  await p.getByRole('button', { name: 'Add flag' }).click();
  await expectVisible(p.getByText(/lowercase letters/), 'the key error');
  const key = `e2e.flag-${Date.now() % 100000}`;
  await p.getByLabel('Key').fill(key);
  await p.getByRole('button', { name: 'Add flag' }).click();
  await expectVisible(p.getByText(key), 'the new flag');
  await p.getByRole('switch', { name: key }).or(p.getByRole('switch').last()).first().click();
});

await flow('console: team add validates, then adds', { storage: consoleStore }, async (p) => {
  await p.goto(`${CONSOLE}/team`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Add a person' }).click();
  await p.getByRole('button', { name: 'Add', exact: true }).click();
  await expectVisible(p.getByText('Enter their name.'), 'the name error');
  await p.getByLabel('Name', { exact: true }).fill('Test Person');
  await p.getByLabel('Work email').fill(`tp${Date.now() % 100000}@gradeon.app`);
  await p.getByLabel('First password').fill('long-enough-password');
  await p.getByRole('button', { name: 'Add', exact: true }).click();
  await expectVisible(p.getByText('Test Person'), 'the new person');
});

await flow('console: support needs a reason; erase needs the school code', { storage: consoleStore }, async (p) => {
  await p.goto(`${CONSOLE}/schools/${school.id}`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Erase school' }).click();
  await p.getByLabel(/Type/).fill('wrong');
  await p.getByRole('button', { name: 'Request erasure' }).click();
  await expectVisible(p.getByText(/isn’t the school code/), 'the wrong-code message');
  await p.keyboard.press('Escape');
  await p.getByRole('button', { name: 'Support session' }).click();
  await p.getByRole('button', { name: 'Start session' }).click();
  await expectVisible(p.getByText(/at least 8 letters/), 'the reason error');
  await p.keyboard.press('Escape');
  for (const tab of ['Entitlements', 'Versions', 'Health', 'Audit', 'Overview']) {
    await p.getByRole('tab', { name: tab }).click();
    await p.waitForTimeout(300);
  }
});

await flow('support: a session shows the banner and cannot change anything', {}, async (p) => {
  const r = await (await fetch(`${API}/console/v1/support`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ct.accessToken}` }, body: JSON.stringify({ schoolId: school.id, reason: 'End to end check of the support banner' }) })).json();
  if (!r.token) throw new Error(`no token: ${JSON.stringify(r)}`);
  await p.goto(`${ADMIN}/s/${slug}/settings#support=${r.token}`, { waitUntil: 'networkidle' });
  await expectVisible(p.getByText(/read-only/), 'the support banner');
  await expectVisible(p.getByLabel('School name'), 'the name field');
  if (!(await p.getByLabel('School name').evaluate((el) => el.readOnly))) throw new Error('the name field should be read-only');
  if (await p.getByRole('button', { name: 'Save changes' }).count()) throw new Error('there should be no Save button');
  const refused = await fetch(`${API}/v1/notices`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-school': slug, authorization: `Bearer ${r.token}` }, body: JSON.stringify({ title: 'From support', body: 'Support sessions are read-only.', audience: 'everyone', publish: false }) });
  if (refused.status !== 403) throw new Error(`the API should refuse support writes, got ${refused.status}`);
  await p.getByRole('button', { name: 'End session' }).click();
  await p.waitForURL(/\/login/);
  await fetch(`${API}/console/v1/support/${r.session.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${ct.accessToken}` } });
});

await flow('console: billing generates invoices once', { storage: consoleStore }, async (p) => {
  await p.goto(`${CONSOLE}/billing`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Create invoices' }).click();
  await expectVisible(p.getByRole('status'), 'the result toast');
  await p.getByRole('button', { name: 'Create invoices' }).click();
  await expectVisible(p.getByText(/already have an invoice|invoice/), 'the repeat message');
});

// ── the pages that used to say "opens in a coming release" ─────────────────
const A = (path) => `${ADMIN}/s/${slug}${path}`;

await flow('admin: set homework, tick a hand-in and save it', { storage: adminStore }, async (p) => {
  await p.goto(A('/homework'), { waitUntil: 'networkidle' });
  await expectVisible(p.getByText('All homework'), 'the homework list');
  await p.getByRole('button', { name: 'Set homework' }).first().click();
  const d = p.getByRole('dialog');
  await d.getByRole('button', { name: 'Set homework' }).click();
  await expectVisible(d.getByText('Choose a class.'), 'the class error');
  await pick(p, d, 'Class', 'Class 8 A');
  await pick(p, d, 'Subject', 'Maths');
  await d.getByLabel('Title').fill('E2E homework');
  await d.getByRole('button', { name: 'Set homework' }).click();
  await expectVisible(p.getByText(/Homework set\./), 'the set toast');
  await expectVisible(p.getByRole('dialog').getByText(/^0 of \d+ handed in$/), 'the hand-in sheet');
  await p.getByRole('dialog').getByRole('checkbox').first().check();
  await p.getByRole('button', { name: 'Save hand-ins' }).click();
  await expectVisible(p.getByText(/Hand-ins are up to date/), 'the saved toast');
  await expectVisible(p.getByRole('dialog').getByText(/^1 of \d+ handed in$/), 'the count after saving');
});

await flow('admin: exams show marking and open the marks grid and results', { storage: adminStore }, async (p) => {
  await p.goto(A('/exams'), { waitUntil: 'networkidle' });
  await expectVisible(p.getByRole('heading', { name: 'Marking' }), 'the marking group');
  await p.getByRole('button', { name: /Open Unit test 1, Class 8 B/ }).click();
  await expectVisible(p.getByRole('dialog').getByText(/marks entered/), 'the marks sheet');
  const cell = p.getByRole('dialog').getByRole('textbox', { name: /, Science$/ }).first();
  await cell.fill('31');
  await p.getByRole('button', { name: /Save 1 mark/ }).click();
  await expectVisible(p.getByText('Marks saved.'), 'the saved toast');
  await p.getByRole('tab', { name: 'Results' }).click();
  await expectVisible(p.getByText(/^Average \d+%/), 'the results summary');
  await p.keyboard.press('Escape');
  await p.getByRole('button', { name: 'New exam' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Add exam' }).click();
  await expectVisible(p.getByText('Name the exam.'), 'the name error');
});

await flow('admin: add a staff member, find them and switch them off', { storage: adminStore }, async (p) => {
  await p.goto(A('/staff'), { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Add staff' }).click();
  await p.getByRole('dialog').getByRole('button', { name: /Add and send invite/ }).click();
  await expectVisible(p.getByText('Enter the name.'), 'the name error');
  await p.getByLabel('Full name').fill('E2E Teacher');
  await p.getByLabel('Email').fill('e2e.teacher@greenfield.edu.in');
  await p.getByLabel('Phone').fill('+91 98000 12345');
  await p.getByRole('button', { name: 'Maths', exact: true }).click();
  await p.getByRole('button', { name: /Add and send invite/ }).click();
  await expectVisible(p.getByText(/E2E Teacher was added/), 'the added toast');
  await p.getByLabel('Search staff').fill('E2E');
  await p.getByRole('button', { name: 'Open E2E Teacher' }).click();
  await p.getByRole('button', { name: 'Switch off' }).click();
  await expectVisible(p.getByText(/was switched off/), 'the switched-off toast');
});

await flow('admin: an enquiry moves along the admissions board', { storage: adminStore }, async (p) => {
  await p.goto(A('/admissions'), { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'New enquiry' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Add enquiry' }).click();
  await expectVisible(p.getByText('Enter the child’s name.'), 'the name error');
  await p.getByLabel('Child’s name').fill('E2E Child');
  await p.getByLabel('Guardian’s name').fill('E2E Guardian');
  await p.getByLabel('Phone').fill('+91 98000 55555');
  await p.getByRole('button', { name: 'Add enquiry' }).click();
  await expectVisible(p.getByText('Enquiry added.'), 'the added toast');
  const card = p.locator('.admk', { hasText: 'E2E Child' });
  await card.getByRole('button', { name: 'Mark applied' }).click();
  await expectVisible(p.getByText(/E2E Child moved to Applied/), 'the moved toast');
  await p.locator('.admk', { hasText: 'E2E Child' }).getByRole('button', { name: 'Book test' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Book the test' }).click();
  await expectVisible(p.getByText(/E2E Child moved to Test/), 'the test toast');
});

await flow('admin: invoices filter, receipts open and print', { storage: adminStore }, async (p) => {
  await p.goto(A('/invoices'), { waitUntil: 'networkidle' });
  await expectVisible(p.getByText('Still to pay'), 'the summary');
  await p.getByRole('tab', { name: 'Overdue' }).click();
  await expectVisible(p.getByRole('button', { name: 'Collect' }).first(), 'a Collect button');
  await p.getByRole('tab', { name: 'Receipts' }).click();
  await p.getByRole('button', { name: /Open receipt RCPT/ }).first().click();
  await expectVisible(p.getByRole('button', { name: 'Print receipt' }), 'the print button');
});

await flow('admin: reports open and offer a download', { storage: adminStore }, async (p) => {
  await p.goto(A('/reports'), { waitUntil: 'networkidle' });
  await expectVisible(p.getByRole('heading', { name: 'Attendance by class' }), 'the first report');
  await p.getByRole('button', { name: /Fees by type/ }).click();
  await expectVisible(p.getByText(/^Billed:/), 'the fees summary');
  await expectVisible(p.getByRole('button', { name: 'Download CSV' }), 'the download button');
});

await flow('admin: a family message is read and answered', { storage: adminStore }, async (p) => {
  await p.goto(A('/messages'), { waitUntil: 'networkidle' });
  await expectVisible(p.getByText('Your reply'), 'the conversation');
  await p.getByRole('button', { name: 'Send reply' }).click();
  await expectVisible(p.getByText('Write a reply first.'), 'the empty-reply error');
  await p.getByLabel('Your reply').fill('Thank you, we will look into this today.');
  await p.getByRole('button', { name: 'Send reply' }).click();
  await expectVisible(p.locator('.mb.staff .mbb', { hasText: 'we will look into this today' }), 'the reply in the thread');
});

await flow('admin: an event is added, shown on the calendar and removed', { storage: adminStore }, async (p) => {
  await p.goto(A('/events'), { waitUntil: 'networkidle' });
  await expectVisible(p.getByText('Coming up'), 'the list');
  await p.getByRole('button', { name: 'Add event' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Add event' }).click();
  await expectVisible(p.getByText('Name the event.'), 'the name error');
  await p.getByLabel('Name').fill('E2E open house');
  await p.getByRole('dialog').getByRole('button', { name: 'Add event' }).click();
  await expectVisible(p.getByText(/E2E open house was added/), 'the added toast');
  await p.getByRole('button', { name: /Edit E2E open house/ }).click();
  await p.getByRole('button', { name: 'Remove' }).click();
  await p.getByRole('button', { name: 'Yes, remove' }).click();
  await expectVisible(p.getByText(/E2E open house was removed/), 'the removed toast');
});

await flow('admin: school setup tabs show roles, messages and layout read-only, and data requests still work', { storage: adminStore }, async (p) => {
  await p.goto(A('/settings'), { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Roles and access' }).click();
  await expectVisible(p.getByText('Office staff'), 'the role list');
  for (const name of ['New role', 'Save role', 'Delete role']) if (await p.getByRole('button', { name }).count()) throw new Error(`the school still has "${name}"`);
  if (!(await p.getByRole('checkbox').first().isDisabled())) throw new Error('role permissions should be read-only');
  await p.getByRole('button', { name: 'Notifications' }).click();
  if (!(await p.getByRole('switch', { name: /Child marked absent or late by email/ }).isDisabled())) throw new Error('notification switches should be read-only');
  await p.getByRole('button', { name: 'Message templates' }).click();
  await expectVisible(p.getByText(/Gradeon sets this up for your school/).first(), 'the read-only note');
  await p.getByRole('button', { name: 'App layout' }).click();
  await expectVisible(p.getByText('Tabs along the bottom'), 'the layout');
  await p.getByRole('button', { name: 'Privacy and consent' }).click();
  await p.getByRole('button', { name: 'Log a request' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Log request' }).click();
  await expectVisible(p.getByText('Whose data is this about?'), 'the request error');
  await p.keyboard.press('Escape');
});

await flow('admin: the dashboard widgets can be hidden and added back', { storage: adminStore }, async (p) => {
  await p.goto(A('/'), { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /Choose what the dashboard shows/ }).click();
  await p.getByRole('switch', { name: 'Class rolls' }).click();
  await p.getByRole('button', { name: 'Done' }).click();
  if (await p.getByText('Class rolls · today').count()) throw new Error('the hidden widget is still shown');
  await p.getByRole('button', { name: /Choose what the dashboard shows/ }).click();
  await p.getByRole('switch', { name: 'Class rolls' }).click();
  await p.getByRole('button', { name: 'Done' }).click();
  await expectVisible(p.getByText('Class rolls · today'), 'the widget back');
});

await flow('status: the public status page opens without signing in', {}, async (p) => {
  await p.goto(`${ADMIN}/status`, { waitUntil: 'networkidle' });
  await expectVisible(p.getByRole('heading', { name: /Everything is working|Some things are slow|Something is down/ }), 'the overall state');
  await expectVisible(p.getByText('Recent incidents'), 'the incidents card');
});

await flow('console: a cell is added and managed, a school can be moved', { storage: consoleStore }, async (p) => {
  await p.goto(`${CONSOLE}/cells`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Add a cell' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Add cell' }).click();
  await expectVisible(p.getByText(/Use 3 to 24 letters/), 'the name error');
  await p.getByLabel('Name').fill('e2e-cell');
  await p.getByLabel('Region').fill('this computer');
  await pick(p, p.getByRole('dialog'), 'Runs on', 'This computer');
  await p.getByRole('dialog').getByRole('button', { name: 'Add cell' }).click();
  await expectVisible(p.getByText(/Cell e2e-cell added/), 'the added toast');
  await p.getByRole('button', { name: 'Manage' }).last().click();
  await p.getByRole('switch', { name: 'Accept new schools' }).click();
  await p.getByRole('button', { name: 'Save', exact: true }).click();
  await expectVisible(p.getByText(/was updated/), 'the updated toast');
  await expectVisible(p.getByText('Closed to new schools'), 'the closed chip');
  await p.getByRole('button', { name: 'Move' }).first().click();
  await expectVisible(p.getByText(/shares a database server|a second person approves/i), 'the move explanation');
  await p.keyboard.press('Escape');
});

await flow('console: compliance logs an agreement and a breach', { storage: consoleStore }, async (p) => {
  await p.goto(`${CONSOLE}/compliance`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Log a breach' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Log breach' }).click();
  await expectVisible(p.getByText('Choose a school.'), 'the school error');
  await pick(p, p.getByRole('dialog'), 'School', 1);
  await p.getByLabel('What happened').fill('E2E: an export went to the wrong address');
  await p.getByRole('dialog').getByRole('button', { name: 'Log breach' }).click();
  await expectVisible(p.getByText(/within 72 hours/), 'the logged toast');
  await p.getByRole('button', { name: 'Tell the school' }).first().click();
  await expectVisible(p.getByText(/was told/), 'the notified toast');
});

await flow('console: a feature can be paused and the blueprint page edits waves', { storage: consoleStore }, async (p) => {
  await p.goto(`${CONSOLE}/flags`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Pause it' }).click();
  await expectVisible(p.getByText(/Paused\. It takes effect/), 'the paused toast');
  await p.getByRole('switch', { name: /paused/i }).first().click();
  await p.goto(`${CONSOLE}/blueprints`, { waitUntil: 'networkidle' });
  await expectVisible(p.getByText('How a release rolls out'), 'the waves card');
  await p.getByRole('button', { name: 'Add a wave' }).click();
  await expectVisible(p.getByLabel('Name of wave 3'), 'a new wave');
  await p.getByRole('button', { name: 'New blueprint' }).click();
  await p.getByRole('dialog').getByRole('button', { name: /Create and switch on/ }).click();
  await expectVisible(p.getByText('Give it a name.'), 'the blueprint name error');
  await p.keyboard.press('Escape');
});

await flow('console: the bell shows alerts', { storage: consoleStore }, async (p) => {
  await p.goto(`${CONSOLE}/`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /requests to approve|Approvals/ }).first().click();
  await expectVisible(p.getByRole('dialog').getByText('Alerts'), 'the alerts dialog');
});


await flow('console: the module grid takes a feature from a school only after a review, and sends it for a second person', { storage: consoleStore }, async (p) => {
  await p.goto(`${CONSOLE}/modules`, { waitUntil: 'networkidle' });
  await expectVisible(p.getByRole('table', { name: 'Modules by school' }), 'the module grid');
  await expectVisible(p.getByText('Not built yet'), 'the planned modules');
  await p.getByRole('button', { name: 'Take away' }).isDisabled().then((d) => { if (!d) throw new Error('Take away should wait for a chosen school'); });
  await p.getByLabel(/^Choose Greenfield/).check();
  await pick(p, p, 'Module or feature', 'Fees: Families pay in the app');
  await p.getByRole('button', { name: 'Take away' }).click();
  const review = p.getByRole('dialog');
  await expectVisible(review.getByText('− Fees: Families pay in the app'), 'the review of what is taken away');
  await expectVisible(review.getByText(/needs a second person/), 'the approval note');
  await review.getByRole('button', { name: 'Push' }).click();
  await expectVisible(p.getByText(/waiting for a second person in Approvals/), 'the waiting toast');
});

await flow('console: a school’s plan tab edits modules, features, dates and limits, and reviews before pushing', { storage: consoleStore }, async (p) => {
  await p.goto(`${CONSOLE}/schools/${school.id}`, { waitUntil: 'networkidle' });
  await p.getByRole('tab', { name: 'Entitlements' }).click();
  await expectVisible(p.getByText('Plan and limits'), 'the plan card');
  if (!(await p.getByRole('button', { name: 'Review changes' }).isDisabled())) throw new Error('nothing changed yet, so Review should wait');
  await p.getByRole('switch', { name: 'Gallery' }).click();
  await p.getByRole('button', { name: 'Review changes' }).click();
  await expectVisible(p.getByRole('dialog').getByText('− Gallery'), 'Gallery in the review');
  await p.getByRole('button', { name: 'Keep editing' }).click();
  await p.getByRole('switch', { name: 'Gallery' }).click();
  if (!(await p.getByRole('button', { name: 'Review changes' }).isDisabled())) throw new Error('back to the start, so Review should wait again');
});

await flow('console: a school’s request is answered, and its configuration changes with a note', { storage: consoleStore }, async (p) => {
  await p.goto(`${CONSOLE}/requests`, { waitUntil: 'networkidle' });
  await expectVisible(p.getByText('Please put Events in the app’s bottom tabs.'), 'the school’s request');
  await p.getByRole('button', { name: 'Answer' }).first().click();
  await p.getByLabel('Your answer').fill('Done: Events is in the tabs.');
  await p.getByRole('button', { name: 'Mark done' }).click();
  await expectVisible(p.getByText(/Marked done/), 'the answered toast');
  await p.goto(`${CONSOLE}/schools/${school.id}`, { waitUntil: 'networkidle' });
  await p.getByRole('tab', { name: 'Configuration' }).click();
  await p.getByLabel('Tagline').fill('Curious minds, kind hearts');
  await p.getByLabel('Why (kept in the history)').fill('Browser flow');
  await p.getByRole('button', { name: 'Save 1 change' }).click();
  await expectVisible(p.getByText(/Saved\. The school/), 'the saved toast');
  await expectVisible(p.getByText('Browser flow', { exact: false }), 'the change in the history');
  await p.getByRole('tab', { name: 'Roles' }).click();
  await expectVisible(p.getByText('Who has which role'), 'the roles tab');
});

await flow('console: every menu page opens', { storage: consoleStore }, async (p) => {
  for (const path of ['/', '/onboarding', '/modules', '/cells', '/releases', '/migrations', '/builds', '/flags', '/blueprints', '/health', '/approvals', '/support', '/inbox', '/billing', '/compliance', '/team']) {
    await p.goto(`${CONSOLE}${path}`, { waitUntil: 'networkidle' });
    await expectVisible(p.locator('main h1'), `a title on ${path}`);
  }
});

await flow('admin: the menu collapses, can be opened again, and its account menu opens beside it', { storage: adminStore }, async (p) => {
  await p.goto(A('/fees'), { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Collapse the menu' }).click();
  await expectVisible(p.getByRole('button', { name: 'Expand the menu' }), 'the expand button in the collapsed menu');
  await p.getByRole('link', { name: 'Homework' }).hover();
  await expectVisible(p.getByRole('tooltip'), 'the name of the menu item');
  await p.locator('.mebtn').click();
  const box = await p.getByRole('menu').boundingBox();
  if (!box || box.x < 80 || box.x + box.width > 1440) throw new Error('the account menu is clipped by the narrow menu');
  await p.keyboard.press('Escape');
  await p.getByRole('button', { name: 'Expand the menu' }).click();
  await expectVisible(p.getByText('Greenfield').first(), 'the school name after expanding');
});

await flow('admin: a dropdown lists every option above the cards and a bar has a tooltip', { storage: adminStore }, async (p) => {
  await p.goto(A('/attendance'), { waitUntil: 'networkidle' });
  await p.getByRole('combobox', { name: 'Class' }).click();
  const list = p.getByRole('listbox');
  await expectVisible(list, 'the list of classes');
  const top = await p.evaluate(() => { const l = document.querySelector('[role=listbox]'); const r = l.getBoundingClientRect(); return document.elementFromPoint(r.left + 20, r.top + 20)?.closest('[role=listbox]') !== null; });
  if (!top) throw new Error('something paints over the open list');
  await p.getByRole('searchbox').or(p.getByLabel('Search the list')).fill('3 B');
  await p.getByRole('option', { name: 'Class 3 B' }).click();
  await expectVisible(p.getByText(/Class 3 B/).first(), 'the chosen class');
  await p.goto(A('/fees'), { waitUntil: 'networkidle' });
  await p.locator('.us').first().hover();
  await expectVisible(p.getByRole('tooltip').getByText(/collected/), 'the tooltip on a fee bar');
});

await flow('admin: classes and calendar add a holiday, refuse a bad one, and bill a fee to its grade', { storage: adminStore }, async (p) => {
  await p.goto(A('/setup'), { waitUntil: 'networkidle' });
  await expectVisible(p.getByRole('heading', { name: 'Academic years' }), 'the years card');
  await p.locator('section', { has: p.getByRole('heading', { name: 'Holidays' }) }).getByRole('button', { name: 'Add' }).click();
  await p.getByLabel('Holiday', { exact: true }).fill('E2E founders day');
  await p.getByLabel('From', { exact: true }).fill('2027-01-12');
  await p.getByLabel('To (optional)').fill('2027-01-10');
  await p.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expectVisible(p.getByRole('dialog').getByText(/ends before it starts/), 'the date error');
  await p.getByLabel('To (optional)').fill('');
  await p.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expectVisible(p.getByText('E2E founders day was saved.'), 'the saved toast');
  await p.getByRole('button', { name: 'Open E2E founders day' }).click();
  await p.getByRole('button', { name: 'Remove' }).click();
  await expectVisible(p.getByText('E2E founders day was removed.'), 'the removed toast');
  await p.getByRole('tab', { name: 'Classes' }).click();
  await expectVisible(p.getByRole('button', { name: 'Open 8 A' }), 'class 8 A');
  await p.getByRole('tab', { name: 'Fees' }).click();
  await p.locator('section', { has: p.getByRole('heading', { name: 'Fee structures' }) }).getByRole('button', { name: 'Add' }).click();
  await p.getByLabel('Grade (blank for all)').fill('8');
  await p.getByLabel('Fee', { exact: true }).fill('E2E science fair');
  await p.getByLabel('Amount', { exact: true }).fill('750');
  await p.getByLabel('Due on', { exact: true }).fill('2026-12-15');
  await p.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expectVisible(p.getByText('E2E science fair was saved.'), 'the fee saved');
  await p.getByRole('button', { name: 'Open E2E science fair' }).click();
  await p.getByRole('button', { name: 'Add to students’ fees' }).click();
  await expectVisible(p.getByText(/E2E science fair was added to \d+ students’ fees/), 'the billed toast');
});

await flow('admin: moving in sends a file to Gradeon, invites a class and prints its letters', { storage: adminStore }, async (p) => {
  await p.goto(A('/moving-in'), { waitUntil: 'networkidle' });
  await expectVisible(p.getByRole('heading', { name: 'Send us your files' }), 'the files card');
  await p.locator('input[type=file]').setInputFiles({ name: 'e2e-subjects.csv', mimeType: 'text/csv', buffer: Buffer.from('Subject,Periods a week\nE2E Robotics,2\nE2E Dance,x\n') });
  await p.getByLabel('What is in it (optional)').fill('Two new subjects');
  await p.getByRole('button', { name: 'Send to Gradeon' }).click();
  await expectVisible(p.getByText('Sent to Gradeon. The team will import it and tell you.'), 'the sent toast');
  await expectVisible(p.getByText('e2e-subjects.csv'), 'the file in the list');
  const row = p.locator('.rw', { hasText: '8 A' });
  if (await row.getByRole('button', { name: 'Invite' }).count()) {
    await row.getByRole('button', { name: 'Invite' }).click();
    await expectVisible(p.getByText(/Invited \d+ famil/), 'the invited toast');
  }
  await p.evaluate(() => { window.print = () => undefined; });
  const [letters] = await Promise.all([p.waitForEvent('popup'), row.getByRole('button', { name: 'Letters' }).click()]);
  await letters.waitForFunction(() => document.querySelectorAll('section').length > 0);
  if (!(await letters.content()).includes('phone number ending')) throw new Error('the letters do not say which phone to sign in with');
  await letters.close();
});

await flow('console: migration imports the school’s file after fixing a row in the grid, then undoes it', { storage: consoleStore }, async (p) => {
  await p.goto(`${CONSOLE}/schools/${school.id}`, { waitUntil: 'networkidle' });
  await p.getByRole('tab', { name: 'Migration' }).click();
  await expectVisible(p.getByText('Ready to go live'), 'the readiness card');
  const file = p.locator('.rw', { hasText: 'e2e-subjects.csv' });
  await expectVisible(file, 'the file the school sent');
  await pick(p, p, 'What to import', /Subjects/);
  await file.getByRole('button', { name: 'Open' }).click();
  await expectVisible(p.getByText('The school’s own sheet'), 'the source');
  await expectVisible(p.getByText('1 with problems'), 'the bad row counted');
  const cell = p.getByLabel('Line 3, Periods a week');
  await cell.fill('3');
  await cell.blur();
  await expectVisible(p.getByText('0 with problems'), 'the row fixed');
  await p.getByRole('button', { name: /^Import 2 rows/ }).click();
  await expectVisible(p.getByText(/Imported subjects: 2 added/), 'the imported toast');
  await expectVisible(p.locator('.rw', { hasText: 'e2e-subjects.csv' }).getByText('Imported'), 'the file marked imported');
  await p.getByRole('button', { name: 'Undo' }).first().click();
  await expectVisible(p.getByText(/Undone\./), 'the undone toast');
});

await flow('console: go-live reconciles the dues with the old system, and a restore drill runs from Health', { storage: consoleStore }, async (p) => {
  await p.goto(`${CONSOLE}/schools/${school.id}`, { waitUntil: 'networkidle' });
  await p.getByRole('tab', { name: 'Migration' }).click();
  const owed = p.getByText(/owed here; type the old system’s total to compare/);
  await expectVisible(owed, 'the dues waiting for the old system’s total');
  const total = (await owed.first().textContent()).match(/₹([\d,]+)/)[1].replace(/,/g, '');
  await p.getByLabel('The old system’s total dues (₹)').fill(total);
  await p.getByRole('button', { name: 'Compare' }).click();
  await expectVisible(p.getByText(/the same as the old system/), 'the dues reconciled');
  const tick = p.locator('.rw', { hasText: 'The school’s staff are trained' });
  await tick.getByRole('button', { name: 'Mark done' }).click();
  await expectVisible(tick.getByRole('button', { name: 'Undo' }), 'the item ticked');
  await tick.getByRole('button', { name: 'Undo' }).click();
  await p.goto(`${CONSOLE}/health`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Run a drill now' }).click();
  await expectVisible(p.getByText(/^Restored [\d,]+ rows of /), 'the drill’s result', 90000);
  await expectVisible(p.locator('.rw', { hasText: /rows · [\d,]+ students/ }), 'the drill listed');
});

await flow('admin: the sign-in page shows the school’s mark and its privacy notice', {}, async (p) => {
  await p.goto(`${ADMIN}/s/${slug}/login`, { waitUntil: 'networkidle' });
  const mark = p.locator('.pnl .lg').first();
  const bg = await mark.evaluate((el) => getComputedStyle(el).backgroundColor);
  if (!/rgb\(106, 76, 245\)/.test(bg)) throw new Error(`the mark should be in the school's colour, got ${bg}`);
  await p.getByRole('button', { name: 'Privacy' }).click();
  await expectVisible(p.getByRole('region', { name: 'Privacy' }), 'the privacy notice');
  if (!(await p.getByRole('link', { name: 'Help' }).getAttribute('href'))?.startsWith('mailto:')) throw new Error('Help should write to support');
});

await flow('design system: the menu keeps its scroll between pages, and search opens without jumping', { storage: adminStore, context: { viewport: { width: 1440, height: 640 } } }, async (p) => {
  await p.goto(A('/'), { waitUntil: 'networkidle' });
  const sb = p.locator('aside.sb');
  const top = await sb.evaluate((el) => { el.scrollTop = el.scrollHeight; return el.scrollTop; });
  if (top < 20) throw new Error('the menu should scroll on a short window');
  await sb.getByRole('link', { name: 'Fees' }).click();
  await p.waitForURL(/\/fees/);
  await sb.getByRole('link', { name: 'Notices' }).click();
  await p.waitForURL(/\/notices/);
  const after = await sb.evaluate((el) => el.scrollTop);
  if (Math.abs(after - top) > 1) throw new Error(`the menu scrolled back from ${top} to ${after} when the page changed`);
  await p.keyboard.press('Control+k');
  const tops = await p.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 12; i++) { await new Promise((r) => requestAnimationFrame(r)); out.push(document.querySelector('.pal')?.getBoundingClientRect().top ?? -1); }
    return out;
  });
  const settled = tops.filter((t) => t >= 0);
  // It may grow a little (scale .96 to 1) but must not jump: the top stays within a few pixels of where it ends.
  if (!settled.length || Math.max(...settled) - Math.min(...settled) > 12) throw new Error(`the search box moved while opening: ${tops.map(Math.round).join(', ')}`);
});

await flow('design system: a dialog opened while the last one is still fading starts fresh', { storage: adminStore }, async (p) => {
  await p.goto(A('/setup'), { waitUntil: 'networkidle' });
  await p.locator('section', { has: p.getByRole('heading', { name: 'Holidays' }) }).getByRole('button', { name: 'Add' }).click();
  await expectVisible(p.getByRole('dialog'), 'the holiday dialog');
  // Close it and open another within its fade (200 ms), the way a quick hand or a slow machine does.
  await p.evaluate(async () => {
    const byText = (sel, text) => [...document.querySelectorAll(sel)].find((e) => e.textContent.trim() === text);
    byText('[role=dialog] button', 'Cancel').click();
    await new Promise((r) => setTimeout(r, 30));
    byText('[role=tab]', 'Fees').click();
    await new Promise((r) => setTimeout(r, 30));
    const sec = [...document.querySelectorAll('section')].find((x) => x.querySelector('h2,h3')?.textContent.trim() === 'Fee structures');
    [...sec.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click();
  });
  await expectVisible(p.getByRole('dialog').getByText('Add to fee structures'), 'the fee dialog');
  const head = (await p.getByRole('dialog').getByLabel('Fee head').textContent())?.trim();
  if (head !== 'Tuition') throw new Error(`the fee dialog kept the holiday dialog's state: fee head is "${head}"`);
});

await flow('design system: every overlay opens and closes from the keyboard, and a date is picked without a mouse', { storage: adminStore }, async (p) => {
  await p.goto(A('/events'), { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Add event' }).first().focus();
  await p.keyboard.press('Enter');
  const dlg = p.getByRole('dialog', { name: 'Add event' });
  await expectVisible(dlg, 'the dialog');
  // A dropdown inside the dialog: opens with the arrow key, Escape closes it and not the dialog.
  await dlg.getByLabel('Kind').focus();
  await p.keyboard.press('ArrowDown');
  await expectVisible(p.getByRole('listbox'), 'the dropdown list');
  await p.keyboard.press('Escape');
  await p.getByRole('listbox').waitFor({ state: 'hidden' });
  await expectVisible(dlg, 'the dialog still open');
  // The calendar: Enter opens it on the chosen day, the right arrow moves a day, Enter picks it.
  const day = dlg.getByLabel('Day', { exact: true });
  const before = await day.inputValue();
  await dlg.getByRole('button', { name: 'Choose from a calendar' }).first().focus();
  await p.keyboard.press('Enter');
  await expectVisible(p.getByRole('dialog', { name: 'Calendar' }), 'the calendar');
  await p.keyboard.press('ArrowRight');
  await p.keyboard.press('Enter');
  await p.getByRole('dialog', { name: 'Calendar' }).waitFor({ state: 'hidden' });
  const next = new Date(Date.parse(`${before} UTC`) + 86_400_000);
  const want = `${next.getUTCDate()} ${next.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })} ${next.getUTCFullYear()}`;
  if ((await day.inputValue()) !== want) throw new Error(`picked ${await day.inputValue()}, expected ${want} (the day after ${before})`);
  // The time list: arrows and Enter pick, Escape closes and gives focus back.
  const times = dlg.getByRole('button', { name: 'Choose a time' }).first();
  await times.focus();
  await p.keyboard.press('Enter');
  await expectVisible(p.getByRole('listbox', { name: 'Starts at' }), 'the list of times');
  await p.keyboard.press('ArrowDown');
  await p.keyboard.press('Enter');
  if (!/^\d\d:\d\d$/.test(await dlg.getByLabel('Starts at', { exact: true }).inputValue())) throw new Error('no time was picked');
  await times.focus();
  await p.keyboard.press('Enter');
  await p.keyboard.press('Escape');
  await p.getByRole('listbox', { name: 'Starts at' }).waitFor({ state: 'hidden' });
  if (!(await times.evaluate((el) => el === document.activeElement))) throw new Error('focus did not come back to the time button');
  await p.keyboard.press('Escape');
  await dlg.waitFor({ state: 'hidden' });
  // The account menu: Enter opens it on its first item, arrows move, Escape closes and gives focus back.
  const me = p.locator('.mebtn');
  await me.focus();
  await p.keyboard.press('Enter');
  const menu = p.getByRole('menu', { name: 'Account' });
  await expectVisible(menu, 'the account menu');
  await p.keyboard.press('ArrowDown');
  if (!(await p.evaluate(() => document.activeElement?.getAttribute('role') === 'menuitem'))) throw new Error('the arrow key did not move inside the menu');
  await p.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
  if (!(await me.evaluate((el) => el === document.activeElement))) throw new Error('focus did not come back to the account button');
  // A record panel: opens from a row, Escape closes it.
  await p.goto(A('/students'), { waitUntil: 'networkidle' });
  await p.locator('[role=row][tabindex="0"]').first().focus();
  await p.keyboard.press('Enter');
  await expectVisible(p.getByRole('dialog', { name: 'Student profile' }), 'the student panel');
  await p.keyboard.press('Escape');
  await p.getByRole('dialog', { name: 'Student profile' }).waitFor({ state: 'hidden' });
});

await browser.close();
console.log(`\n${passed} flows passed${errors.length ? `, ${errors.length} failed:\n - ${errors.join('\n - ')}` : ''}`);
process.exit(errors.length ? 1 : 0);
