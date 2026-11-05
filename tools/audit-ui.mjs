#!/usr/bin/env node
// Opens every page of the admin and the console at four widths in light and dark, and reports console errors, failed API calls,
// horizontal overflow and anything clipped or pushed outside the window. Exits non-zero when it finds something.
// Usage: node tools/audit-ui.mjs [--only admin|console] [--shots dir] [--full] [--quick] [--light|--dark] [--sizes 1440x900,390x844]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { auditPage } from './lib/audit.mjs';

const args = process.argv.slice(2);
const val = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const only = val('--only');
const shots = val('--shots');
if (shots) mkdirSync(shots, { recursive: true });
const API = process.env.API ?? 'http://localhost:4000';
const ADMIN = process.env.ADMIN ?? 'http://127.0.0.1:5173';
const CONSOLE = process.env.CONSOLE ?? 'http://127.0.0.1:5174';
const slug = process.env.SCHOOL ?? 'greenfield';
const SIZES = val('--sizes') ? val('--sizes').split(',').map((x) => x.split('x').map(Number)) : args.includes('--quick') ? [[390, 844], [1440, 900]] : [[360, 740], [390, 844], [768, 1024], [1440, 900]];

const post = async (path, body, headers = {}) => (await fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })).json();
async function adminSession() {
  const h = { 'x-school': slug };
  const a = await post('/v1/auth/login', { identifier: 'neha.menon@greenfield.edu.in', password: 'nest2026' }, h);
  const t = await post('/v1/auth/verify', { challengeId: a.challenge.challengeId, code: '424242' }, h);
  return [`gradeon.admin.${slug}`, JSON.stringify({ user: t.user }), t.accessToken];
}
async function consoleSession() {
  const a = await post('/console/v1/auth/login', { identifier: 'kaushal@gradeon.app', password: 'nest2026' });
  const t = await post('/console/v1/auth/verify', { challengeId: a.challenge.challengeId, code: '424242' });
  const list = await (await fetch(`${API}/console/v1/schools`, { headers: { authorization: `Bearer ${t.accessToken}` } })).json();
  return { key: ['gradeon.console', JSON.stringify({ user: t.user }), t.accessToken], school: list.find((s) => s.slug === slug)?.id };
}

const adminPaths = ['', '/students', '/timetable', '/settings', '/attendance', '/fees', '/notices', '/homework', '/exams', '/staff', '/admissions', '/invoices', '/reports', '/messages', '/events', '/design', '/nope'];
const jobs = [];
if (only !== 'console') {
  const key = await adminSession();
  for (const p of adminPaths) jobs.push({ name: `admin${p || '/'}`, url: `${ADMIN}/s/${slug}${p}`, key });
}
if (only !== 'admin') {
  const c = await consoleSession();
  const paths = ['/', `/schools/${c.school}`, '/onboarding', '/onboarding/new', '/cells', '/releases', '/migrations', '/builds', '/flags', '/blueprints', '/health', '/approvals', '/requests', '/modules', '/support', '/inbox', '/billing', '/compliance', '/team', '/nope'];
  for (const p of paths) jobs.push({ name: `console${p}`, url: `${CONSOLE}${p}`, key: c.key });
}

const browser = await chromium.launch();
let problems = 0;
for (const dark of args.includes('--light') ? [false] : args.includes('--dark') ? [true] : [false, true]) {
  for (const [w, h] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: dark ? 'dark' : 'light', reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    for (const j of jobs) {
      const errors = [];
      const onErr = (m) => { if (m.type() === 'error') errors.push(m.text()); };
      const onFail = (r) => { if (r.status() >= 400 && r.status() !== 404 || r.status() === 404 && !/\/nope/.test(j.url)) errors.push(`${r.status()} ${r.request().method()} ${r.url().replace(API, '').replace(ADMIN, '').replace(CONSOLE, '')}`); };
      page.on('console', onErr); page.on('response', onFail); page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
      await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, j.key); if (j.key?.[2]) await ctx.route(/\/auth\/refresh$/, (r) => r.fulfill({ json: { accessToken: j.key[2], expiresInSeconds: 900 } }));
      await page.goto(j.url, { waitUntil: 'networkidle' }).catch((e) => errors.push(`goto ${e.message}`));
      await page.waitForTimeout(500);
      const over = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      const found = await auditPage(page).catch(() => []);
      if (over.sw > over.cw + 1) found.unshift(`page scrolls sideways: ${over.sw} > ${over.cw}`);
      if (shots) await page.screenshot({ path: `${shots}/${j.name.replace(/[\/]/g, '_')}-${w}-${dark ? 'dark' : 'light'}.png`, fullPage: args.includes('--full') });
      page.removeAllListeners('console'); page.removeAllListeners('response'); page.removeAllListeners('pageerror');
      const all = [...errors.map((e) => `error: ${e.slice(0, 160)}`), ...found];
      if (all.length) { problems++; console.log(`✗ ${j.name} @${w} ${dark ? 'dark' : 'light'}\n   ${all.join('\n   ')}`); }
    }
    await ctx.close();
  }
}
await browser.close();
console.log(problems ? `\n${problems} page views with problems` : '\nAll pages clean');
process.exit(problems ? 1 : 0);
