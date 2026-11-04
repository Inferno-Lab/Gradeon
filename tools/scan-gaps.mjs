#!/usr/bin/env node
// Looks for empty space: a hole under the last card, cards side by side with unequal heights, a card with a big blank inside,
// and content that stops short of the right edge. Usage: node tools/scan-gaps.mjs [--only admin|console] [--sizes 1440x900,1920x1080] [--dark]
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const val = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const only = val('--only');
const SIZES = (val('--sizes') ?? '1440x900,1920x1080,1280x720').split(',').map((s) => s.split('x').map(Number));
const API = process.env.API ?? 'http://localhost:4000';
const ADMIN = process.env.ADMIN ?? 'http://127.0.0.1:5173';
const CONSOLE = process.env.CONSOLE ?? 'http://127.0.0.1:5174';
const slug = process.env.SCHOOL ?? 'greenfield';
const adminTabs = ['general', 'modules', 'layout', 'roles', 'notifications', 'templates', 'privacy', 'audit'];

const post = async (path, body, headers = {}) => (await fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })).json();
async function adminKey() {
  const h = { 'x-school': slug };
  const a = await post('/v1/auth/login', { identifier: 'neha.menon@greenfield.edu.in', password: 'nest2026' }, h);
  const t = await post('/v1/auth/verify', { challengeId: a.challenge.challengeId, code: '424242' }, h);
  return [`gradeon.admin.${slug}`, JSON.stringify({ accessToken: t.accessToken, refreshToken: t.refreshToken, user: t.user })];
}
async function consoleKey() {
  const a = await post('/console/v1/auth/login', { identifier: 'kaushal@gradeon.app', password: 'nest2026' });
  const t = await post('/console/v1/auth/verify', { challengeId: a.challenge.challengeId, code: '424242' });
  const list = await (await fetch(`${API}/console/v1/schools`, { headers: { authorization: `Bearer ${t.accessToken}` } })).json();
  return { key: ['gradeon.console', JSON.stringify({ accessToken: t.accessToken, refreshToken: t.refreshToken, user: t.user })], school: list.find((s) => s.slug === slug)?.id };
}

const jobs = [];
if (only !== 'console') {
  const key = await adminKey();
  for (const p of ['', '/students', '/timetable', '/attendance', '/fees', '/notices', '/homework', '/exams', '/staff', '/admissions', '/invoices', '/reports', '/messages', '/events', ...adminTabs.map((t) => `/settings?tab=${t}`)]) jobs.push({ name: `admin${p || '/'}`, url: `${ADMIN}/s/${slug}${p}`, key, tab: p.startsWith('/settings') ? p.split('=')[1] : null });
}
if (only !== 'admin') {
  const c = await consoleKey();
  for (const p of ['/', `/schools/${c.school}`, '/onboarding', '/onboarding/new', '/cells', '/releases', '/migrations', '/builds', '/flags', '/blueprints', '/health', '/approvals', '/support', '/inbox', '/billing', '/compliance', '/team']) jobs.push({ name: `console${p}`, url: `${CONSOLE}${p}`, key: c.key });
}

const scan = () => {
  const out = [];
  const nm = (el) => `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 60 && r.height > 24 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const boxed = (el) => {
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    const hasBg = bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg);
    const hasBorder = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none';
    return (hasBg || hasBorder) && parseFloat(cs.borderTopLeftRadius) >= 12;
  };
  const main = document.querySelector('.mn');
  if (!main) return ['no .mn'];
  const mr = main.getBoundingClientRect();
  const mcs = getComputedStyle(main);
  const padB = parseFloat(mcs.paddingBottom);
  const padR = parseFloat(mcs.paddingRight);
  let bottom = 0;
  const boxes = [...main.querySelectorAll('*')].filter((e) => vis(e) && boxed(e) && !e.closest('.popm,.sxp,.scrim,.mod,.drw,.toast,.save,.bulk'));
  for (const el of boxes) bottom = Math.max(bottom, el.getBoundingClientRect().bottom);
  const hole = Math.round(mr.bottom - padB - bottom);
  if (hole > 60) out.push(`hole under the last card: ${hole}px`);
  // side by side with unequal heights
  const parents = new Set([main, ...main.querySelectorAll('*')]);
  for (const p of parents) {
    const kids = [...p.children].filter((k) => vis(k) && boxed(k));
    if (kids.length < 2) continue;
    const rows = new Map();
    for (const k of kids) { const t = Math.round(k.getBoundingClientRect().top / 8); rows.set(t, [...(rows.get(t) ?? []), k]); }
    for (const row of rows.values()) {
      if (row.length < 2) continue;
      const hs = row.map((k) => Math.round(k.getBoundingClientRect().height));
      const lefts = new Set(row.map((k) => Math.round(k.getBoundingClientRect().left / 10)));
      if (lefts.size < 2) continue;
      const mx = Math.max(...hs), mn = Math.min(...hs);
      if (mx - mn > 90) out.push(`side by side, unequal: ${row.map((k, i) => `${nm(k)}=${hs[i]}`).join(' | ')}`);
    }
  }
  // columns side by side whose last cards end at different heights
  const bottomOf = (el) => {
    if (boxed(el)) return el.getBoundingClientRect().bottom;
    let b = null;
    for (const d of el.querySelectorAll('*')) {
      if (!vis(d) || !boxed(d)) continue;
      // a card inside a list that scrolls only reaches as far down as the list's own window
      let bottom = d.getBoundingClientRect().bottom;
      for (let a = d.parentElement; a && a !== el; a = a.parentElement) if (/auto|scroll|hidden/.test(getComputedStyle(a).overflowY)) bottom = Math.min(bottom, a.getBoundingClientRect().bottom);
      b = Math.max(b ?? 0, bottom);
    }
    return b;
  };
  for (const p of [main, ...main.querySelectorAll('*')]) {
    const cs = getComputedStyle(p);
    if (!(cs.display.includes('grid') || (cs.display.includes('flex') && !cs.flexDirection.startsWith('column')))) continue;
    // boards (admissions, exams) are lanes of cards, whose lengths are the data
    if (p.closest('header,.hd,.popm,.sxp,.mod,.drw,.ch,.tgrow,.adm,.exb')) continue;
    // a navigation rail (settings sections, wizard steps) is a menu, not a column of content
    const kids = [...p.children].filter((k) => vis(k) && k.getBoundingClientRect().height > 60 && k.tagName !== 'NAV' && getComputedStyle(k).position !== 'sticky');
    const rows = new Map();
    for (const k of kids) { const t = Math.round(k.getBoundingClientRect().top / 12); rows.set(t, [...(rows.get(t) ?? []), k]); }
    for (const row of rows.values()) {
      const cols = row.map((k) => [k, bottomOf(k)]).filter(([, b]) => b != null);
      if (cols.length < 2 || new Set(cols.map(([k]) => Math.round(k.getBoundingClientRect().left / 10))).size < 2) continue;
      const bs = cols.map(([, b]) => b);
      const d = Math.round(Math.max(...bs) - Math.min(...bs));
      if (d > 16) out.push(`columns end unevenly by ${d}px: ${cols.map(([k, b]) => `${nm(k)}@${Math.round(b)}`).join(' | ')}`);
    }
  }
  // blank inside a card
  for (const el of boxes) {
    const r = el.getBoundingClientRect();
    if (r.height < 260 || r.width < 240) continue;
    const cs = getComputedStyle(el);
    let content = r.top + parseFloat(cs.paddingTop);
    for (const d of el.querySelectorAll('*')) {
      if (!vis(d) && !(d.getBoundingClientRect().height > 0)) continue;
      const dcs = getComputedStyle(d);
      if (dcs.display === 'none' || dcs.position === 'absolute' || dcs.position === 'fixed') continue;
      const b = d.getBoundingClientRect().bottom;
      if (b <= r.bottom + 1) content = Math.max(content, b);
    }
    const blank = Math.round(r.bottom - parseFloat(cs.paddingBottom) - content);
    if (blank > 150) out.push(`blank inside ${nm(el)} (${Math.round(r.width)}x${Math.round(r.height)}): ${blank}px`);
  }
  // stops short of the right edge
  const right = mr.right - padR;
  for (const k of [...main.children].filter((e) => vis(e))) {
    const r = k.getBoundingClientRect();
    if (r.width > 300 && right - r.right > 120 && k.tagName !== 'HEADER' && !k.matches('.seg')) out.push(`stops short of the right edge: ${nm(k)} by ${Math.round(right - r.right)}px`);
  }
  return [...new Set(out)];
};

const browser = await chromium.launch();
let n = 0;
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce', colorScheme: args.includes('--dark') ? 'dark' : 'light' });
  const page = await ctx.newPage();
  for (const j of jobs) {
    await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, j.key);
    await page.goto(j.url.split('?')[0], { waitUntil: 'networkidle' }).catch(() => {});
    if (j.tab) {
      const names = { general: 'General', modules: 'Modules', layout: 'App layout', roles: 'Roles and access', notifications: 'Notifications', templates: 'Message templates', privacy: 'Privacy and consent', audit: 'Audit log' };
      await page.getByRole('button', { name: new RegExp(`^${names[j.tab]}`) }).first().click().catch(() => page.getByText(names[j.tab], { exact: false }).first().click().catch(() => {}));
    }
    await page.waitForTimeout(500);
    const found = await page.evaluate(scan);
    if (found.length) { n += found.length; console.log(`${j.name} @${w}x${h}\n   ${found.join('\n   ')}`); }
  }
  await ctx.close();
}
await browser.close();
console.log(`\n${n} gaps`);
process.exit(n ? 1 : 0);
