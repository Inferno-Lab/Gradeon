#!/usr/bin/env node
// Scrolls a long page and reports how long each frame took, so scrolling that feels slow shows up as numbers.
// Usage: node tools/perf-scroll.mjs [path] [--css "selector{...}"] (path is under the admin, default /students)
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const val = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const API = process.env.API ?? 'http://localhost:4000';
const ADMIN = process.env.ADMIN ?? 'http://127.0.0.1:5173';
const slug = process.env.SCHOOL ?? 'greenfield';
const path = args.find((a) => a.startsWith('/')) ?? '/students';
const post = async (p, body, headers = {}) => (await fetch(`${API}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })).json();
const h = { 'x-school': slug };
const a = await post('/v1/auth/login', { identifier: 'neha.menon@greenfield.edu.in', password: 'nest2026' }, h);
const t = await post('/v1/auth/verify', { challengeId: a.challenge.challengeId, code: '424242' }, h);
const key = [`gradeon.admin.${slug}`, JSON.stringify({ user: t.user }), t.accessToken];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, key); if (key?.[2]) await ctx.route(/\/auth\/refresh$/, (r) => r.fulfill({ json: { accessToken: key[2], expiresInSeconds: 900 } }));
const page = await ctx.newPage();
await page.goto(`${ADMIN}/s/${slug}${path}`, { waitUntil: 'networkidle' });
if (val('--css')) await page.addStyleTag({ content: val('--css') });
await page.waitForTimeout(1500);
const r = await page.evaluate(async () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  const times = [];
  let last = performance.now();
  for (let i = 0; i < 90; i++) {
    scrollTo(0, (max * i) / 89);
    await new Promise((res) => requestAnimationFrame(res));
    const now = performance.now();
    times.push(now - last);
    last = now;
  }
  times.sort((x, y) => x - y);
  return { max, frames: times.length, median: +times[45].toFixed(1), p90: +times[80].toFixed(1), worst: +times[89].toFixed(1) };
});
console.log(JSON.stringify({ path, css: val('--css') ?? '', ...r }));
await browser.close();
