#!/usr/bin/env node
// End to end: onboard a new empty school through the console wizard, then sign in to its admin with the password from the test inbox
// and screenshot every page, so the brand-new-school (empty) states are checked with real data.
// Usage: node tools/e2e-onboard.mjs [outDir]   (needs the server on :4000, console on :5174, admin on :5173)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { adminPaths } from './lib/pages.mjs';

const out = process.argv[2] ?? 'e2e-shots';
mkdirSync(out, { recursive: true });
const API = process.env.API ?? 'http://localhost:4000';
const CONSOLE = process.env.CONSOLE ?? 'http://127.0.0.1:5174';
const ADMIN = process.env.ADMIN ?? 'http://127.0.0.1:5173';
const slug = `brs${String(Date.now()).slice(-6)}`;
const post = async (path, body) => (await fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();

const a = await post('/console/v1/auth/login', { identifier: 'kaushal@gradeon.app', password: 'nest2026' });
const t = await post('/console/v1/auth/verify', { challengeId: a.challenge.challengeId, code: '424242' });
const stored = JSON.stringify({ user: t.user });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, ['gradeon.console', stored]);
await ctx.route(/\/auth\/refresh$/, (r) => r.fulfill({ json: { accessToken: t.accessToken, expiresInSeconds: 900 } }));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
const step = (s) => console.log(`• ${s}`);

step('open the wizard');
await page.goto(`${CONSOLE}/onboarding/new`, { waitUntil: 'networkidle' });
await page.getByLabel('School name').fill('Banyan Ridge School');
await page.getByLabel('Address name').fill(slug);
await page.getByLabel('Contact name').fill('Mira Joshi');
await page.getByLabel('Phone').fill('9820011223');
await page.getByLabel('Email').fill('principal@banyanridge.in');
await page.getByRole('button', { name: 'Continue' }).click();
step('plan, branding, placement');
await page.getByRole('button', { name: 'Continue' }).click();
await page.getByRole('button', { name: 'Continue' }).click();
await page.getByRole('button', { name: 'Continue' }).click();
step('first admin and starting data');
await page.getByLabel('Name', { exact: true }).fill('Mira Joshi');
await page.getByLabel('Email').fill('principal@banyanridge.in');
await page.getByLabel('Phone').fill('9820011223');
await page.getByRole('button', { name: 'Continue' }).click();
await page.getByRole('radio', { name: /^Empty/ }).first().click();
await page.getByRole('button', { name: 'Continue' }).click();
step('review');
await page.getByRole('button', { name: 'Launch', exact: true }).waitFor();
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/01-review.png` });
await page.getByRole('button', { name: 'Launch', exact: true }).click();
await page.waitForURL(/\/schools\//, { timeout: 30000 });
step('watch provisioning');
await page.getByText('Live', { exact: true }).first().waitFor({ timeout: 90000 });
await page.screenshot({ path: `${out}/02-school-live.png` });

step('read the invite from the test inbox');
const msgs = await (await fetch(`${API}/console/v1/sandbox?school=${slug}`, { headers: { authorization: `Bearer ${t.accessToken}` } })).json();
const invite = msgs.find((m) => m.channel === 'email');
const password = /password ([^\s.]+?)\./.exec(invite.body)?.[1] ?? /password (\S+)\./.exec(invite.body)?.[1];
if (!password) throw new Error(`no password in invite: ${invite.body}`);

step('sign in to the new school admin');
const school = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const ap = await school.newPage();
ap.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/v1/')) errors.push(`admin ${r.status()} ${r.request().method()} ${r.url().replace(ADMIN, '')}`); });
ap.on('pageerror', (e) => errors.push(`admin pageerror: ${e.message}`));
ap.on('console', (m) => { if (m.type() === 'error') errors.push(`admin console: ${m.text()}`); });
await ap.goto(`${ADMIN}/s/${slug}/login`, { waitUntil: 'networkidle' });
await ap.getByLabel('Email or phone number').fill('principal@banyanridge.in');
await ap.locator('#lg-pw').fill(password);
await ap.getByRole('button', { name: /^Sign in/ }).click();
await ap.getByText('Verify and sign in').waitFor();
// A real school sends the code by text; on the test track it lands in the console's inbox.
await ap.waitForTimeout(600);
const after = await (await fetch(`${API}/console/v1/sandbox?school=${slug}`, { headers: { authorization: `Bearer ${t.accessToken}` } })).json();
const codeMsg = after.find((m) => /(\d{6})/.test(m.body) && !/password/.test(m.body));
const code = /(\d{6})/.exec(codeMsg?.body ?? '')?.[1] ?? '424242';
await ap.getByLabel('6-digit code').fill(code);
await ap.waitForURL(`${ADMIN}/s/${slug}`, { timeout: 15000 }).catch(() => undefined);
await ap.waitForTimeout(2500);
ap.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
for (const [name, path] of adminPaths.map((p) => [p.slice(1).replace(/\//g, '-') || 'dashboard', p])) {
  await ap.goto(`${ADMIN}/s/${slug}${path}`, { waitUntil: 'networkidle' });
  await ap.waitForTimeout(1200);
  const o = await ap.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  if (o.sw > o.cw + 1) errors.push(`overflow on ${name}: ${o.sw} > ${o.cw}`);
  await ap.screenshot({ path: `${out}/admin-${name}.png`, fullPage: false });
  step(`captured ${name}`);
}
console.log(JSON.stringify({ slug, errors }, null, 2));
await browser.close();
process.exit(errors.length ? 1 : 0);
