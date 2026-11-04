#!/usr/bin/env node
// Scrolls every box that scrolls on its own and checks two things: its column titles stay in view, and each frame of
// scrolling is quick (worst and 90th-percentile frame time). Usage: node tools/scan-scroll.mjs [--only admin|console] [--sizes 1440x900,390x844]
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const val = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const only = val('--only');
const SIZES = (val('--sizes') ?? '1440x900,390x844').split(',').map((s) => s.split('x').map(Number));
const API = process.env.API ?? 'http://localhost:4000';
const ADMIN = process.env.ADMIN ?? 'http://127.0.0.1:5173';
const CONSOLE = process.env.CONSOLE ?? 'http://127.0.0.1:5174';
const slug = process.env.SCHOOL ?? 'greenfield';
const post = async (path, body, headers = {}) => (await fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })).json();

const jobs = [];
if (only !== 'console') {
  const h = { 'x-school': slug };
  const a = await post('/v1/auth/login', { identifier: 'neha.menon@greenfield.edu.in', password: 'nest2026' }, h);
  const t = await post('/v1/auth/verify', { challengeId: a.challenge.challengeId, code: '424242' }, h);
  const key = [`gradeon.admin.${slug}`, JSON.stringify({ accessToken: t.accessToken, refreshToken: t.refreshToken, user: t.user })];
  for (const p of ['', '/students', '/timetable', '/attendance', '/fees', '/homework', '/exams', '/staff', '/admissions', '/invoices', '/reports', '/messages', '/events', '/settings']) jobs.push({ name: `admin${p || '/'}`, url: `${ADMIN}/s/${slug}${p}`, key });
}
if (only !== 'admin') {
  const a = await post('/console/v1/auth/login', { identifier: 'kaushal@gradeon.app', password: 'nest2026' });
  const t = await post('/console/v1/auth/verify', { challengeId: a.challenge.challengeId, code: '424242' });
  const key = ['gradeon.console', JSON.stringify({ accessToken: t.accessToken, refreshToken: t.refreshToken, user: t.user })];
  for (const p of ['/', '/cells', '/releases', '/migrations', '/builds', '/flags', '/blueprints', '/health', '/approvals', '/support', '/inbox', '/billing', '/compliance', '/team']) jobs.push({ name: `console${p}`, url: `${CONSOLE}${p}`, key });
}

const run = async () => {
  const out = [];
  const nm = (el) => `${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).slice(0, 2).join('.')}`;
  const boxes = [...document.querySelectorAll('.mn *')].filter((e) => { const cs = getComputedStyle(e); return /auto|scroll/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 20 && e.clientHeight > 80; });
  for (const box of boxes) {
    const times = [];
    let last = performance.now();
    const steps = 40;
    for (let i = 1; i <= steps; i++) {
      box.scrollTop = ((box.scrollHeight - box.clientHeight) * i) / steps;
      await new Promise((r) => requestAnimationFrame(r));
      const now = performance.now(); times.push(now - last); last = now;
    }
    times.sort((x, y) => x - y);
    const p90 = times[Math.floor(times.length * 0.9)], worst = times[times.length - 1];
    if (p90 > 25 || worst > 60) out.push(`slow scroll in ${nm(box)}: p90 ${p90.toFixed(0)} ms, worst ${worst.toFixed(0)} ms`);
    const th = box.querySelector('.grd.th');
    if (th && th.offsetParent) {
      const b = box.getBoundingClientRect(), r = th.getBoundingClientRect();
      if (r.top < b.top - 1 || r.bottom > b.bottom + 1) out.push(`column titles scroll away in ${nm(box)}`);
    }
    box.scrollTop = 0;
  }
  return out;
};

const browser = await chromium.launch();
let n = 0;
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  for (const j of jobs) {
    await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, j.key);
    await page.goto(j.url, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1200);
    const found = await page.evaluate(run);
    if (found.length) { n += found.length; console.log(`${j.name} @${w}x${h}\n   ${found.join('\n   ')}`); }
  }
  await ctx.close();
}
await browser.close();
console.log(`\n${n} scroll problems`);
process.exit(n ? 1 : 0);
