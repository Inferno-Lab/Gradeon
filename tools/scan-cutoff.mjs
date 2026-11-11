#!/usr/bin/env node
// Looks for what the eye catches and audit-ui does not: text cut by an ellipsis, boxes that hide their own content vertically,
// and scrollable areas whose scrollbar is hidden. Usage: node tools/scan-cutoff.mjs [--only admin|console] [--sizes 1280x720,1440x900]
import { chromium } from '@playwright/test';
import { consolePaths } from './lib/pages.mjs';

const args = process.argv.slice(2);
const val = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const only = val('--only');
const SIZES = (val('--sizes') ?? '1280x720,1440x900,768x1024,390x844').split(',').map((s) => s.split('x').map(Number));
const API = process.env.API ?? 'http://localhost:4000';
const ADMIN = process.env.ADMIN ?? 'http://127.0.0.1:5173';
const CONSOLE = process.env.CONSOLE ?? 'http://127.0.0.1:5174';
const slug = process.env.SCHOOL ?? 'greenfield';
const extra = (process.env.PATHS ?? '').split(',').filter(Boolean);

const post = async (path, body, headers = {}) => (await fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })).json();
async function adminKey() {
  const h = { 'x-school': slug };
  const a = await post('/v1/auth/login', { identifier: 'neha.menon@greenfield.edu.in', password: 'nest2026' }, h);
  const t = await post('/v1/auth/verify', { challengeId: a.challenge.challengeId, code: '424242' }, h);
  return [`gradeon.admin.${slug}`, JSON.stringify({ user: t.user }), t.accessToken];
}
async function consoleKey() {
  const a = await post('/console/v1/auth/login', { identifier: 'kaushal@gradeon.app', password: 'nest2026' });
  const t = await post('/console/v1/auth/verify', { challengeId: a.challenge.challengeId, code: '424242' });
  const list = await (await fetch(`${API}/console/v1/schools`, { headers: { authorization: `Bearer ${t.accessToken}` } })).json();
  return { key: ['gradeon.console', JSON.stringify({ user: t.user }), t.accessToken], school: list.find((s) => s.slug === slug)?.id };
}

const jobs = [];
if (only !== 'console') {
  const key = await adminKey();
  for (const p of ['', '/students', '/timetable', '/settings', '/attendance', '/fees', '/notices', ...extra.filter((e) => e.startsWith('a:')).map((e) => e.slice(2))]) jobs.push({ name: `admin${p || '/'}`, url: `${ADMIN}/s/${slug}${p}`, key });
}
if (only !== 'admin') {
  const c = await consoleKey();
  for (const p of consolePaths(c.school)) jobs.push({ name: `console${p}`, url: `${CONSOLE}${p}`, key: c.key });
}

const scan = () => {
  const out = [];
  const name = (el) => `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || el.closest('svg') && el.tagName !== 'svg') continue;
    const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) out.push(`text cut: ${name(el)} "${txt}"`);
    else if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 2 && el.children.length && cs.textOverflow !== 'ellipsis') out.push(`hides sideways: ${name(el)} ${el.scrollWidth}>${el.clientWidth} "${txt}"`);
    if ((cs.overflowY === 'hidden' || cs.overflowY === 'clip') && el.scrollHeight > el.clientHeight + 2 && r.height > 20) out.push(`hides below: ${name(el)} ${el.scrollHeight}>${el.clientHeight} "${txt}"`);
    if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2 && r.height > 60) {
      const hiddenBar = cs.scrollbarWidth === 'none' || getComputedStyle(el, '::-webkit-scrollbar').display === 'none';
      if (hiddenBar) out.push(`scrolls with no bar: ${name(el)}`);
    }
    if (el.matches('input,textarea') && el.placeholder && cs.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 1) out.push(`input text cut: ${name(el)} "${el.placeholder}"`);
    if (el.matches('input[placeholder]') && !el.value) {
      const c = document.createElement('canvas').getContext('2d'); c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      if (c.measureText(el.placeholder).width > el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) out.push(`placeholder cut: ${name(el)} "${el.placeholder}"`);
    }
  }
  return [...new Set(out)].slice(0, 25);
};

const browser = await chromium.launch();
let n = 0;
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  for (const j of jobs) {
    await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, j.key); if (j.key?.[2]) await ctx.route(/\/auth\/refresh$/, (r) => r.fulfill({ json: { accessToken: j.key[2], expiresInSeconds: 900 } }));
    await page.goto(j.url, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(400);
    const found = await page.evaluate(scan);
    if (found.length) { n += found.length; console.log(`${j.name} @${w}x${h}\n   ${found.join('\n   ')}`); }
  }
  await ctx.close();
}
await browser.close();
console.log(`\n${n} findings`);
