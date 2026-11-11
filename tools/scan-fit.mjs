#!/usr/bin/env node
// Finds controls whose contents do not fit inside them: a pill, tab, button, chip or field whose text wraps to extra lines,
// whose children poke out of its box, or whose knob does not sit on the chosen tab.
// Usage: node tools/scan-fit.mjs [--only admin|console] [--sizes 1100x800,1280x800] [--dark]
import { chromium } from '@playwright/test';
import { adminPaths, consolePaths } from './lib/pages.mjs';

const args = process.argv.slice(2);
const val = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const only = val('--only');
const SIZES = (val('--sizes') ?? '1100x800,1280x800,1440x900,768x1024,390x844').split(',').map((s) => s.split('x').map(Number));
const API = process.env.API ?? 'http://localhost:4000';
const ADMIN = process.env.ADMIN ?? 'http://127.0.0.1:5173';
const CONSOLE = process.env.CONSOLE ?? 'http://127.0.0.1:5174';
const slug = process.env.SCHOOL ?? 'greenfield';

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
  for (const p of adminPaths) jobs.push({ name: `admin${p || '/'}`, url: `${ADMIN}/s/${slug}${p}`, key });
}
if (only !== 'admin') {
  const c = await consoleKey();
  for (const p of consolePaths(c.school)) jobs.push({ name: `console${p}`, url: `${CONSOLE}${p}`, key: c.key });
}

const scan = () => {
  const out = [];
  const nm = (el) => `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''} "${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28)}"`;
  const shown = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const lineHeight = (cs) => (cs.lineHeight === 'normal' ? parseFloat(cs.fontSize) * 1.25 : parseFloat(cs.lineHeight));
  // 1. a short control whose text wraps
  const sel = 'button,a.btn,.fp,.chip,.st,.tr,.wkp span,.sx,.mini,.ibtn,.kbd,.av,.lbl,.cb,[role=tab],.lgd span,.hws';
  for (const el of document.querySelectorAll(sel)) {
    if (!shown(el) || el.closest('.dock')) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.height > 64 || el.matches('.rlb,.nv')) continue;
    if (el.closest('.morph:not(.open)')) continue;
    // any single piece of text inside the control that breaks onto a second line
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let wrapped = null;
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.textContent.trim()) continue;
      const rg = document.createRange();
      rg.selectNodeContents(t);
      const rs = [...rg.getClientRects()].filter((x) => x.width > 1);
      const lines = new Set(rs.map((x) => Math.round(x.top / 5))).size;
      if (lines > 1 && getComputedStyle(t.parentElement).whiteSpace !== 'pre-wrap' && r.height <= 64 && parseFloat(cs.borderTopLeftRadius) >= 16) wrapped = t;
      for (const x of rs) {
        if (x.right > r.right + 2 || x.left < r.left - 2 || x.bottom > r.bottom + 2 || x.top < r.top - 2) { out.push(`contents outside the box: ${nm(el)} (${Math.round(r.width)}x${Math.round(r.height)})`); break; }
      }
    }
    if (wrapped) out.push(`text wraps inside a short control: ${nm(el)} (${Math.round(r.width)}x${Math.round(r.height)})`);
  }
  // 3. a segmented control's knob must sit exactly on the chosen tab
  for (const seg of document.querySelectorAll('.seg')) {
    if (!shown(seg)) continue;
    const kn = seg.querySelector('.kn');
    const on = seg.querySelector('button.on,button[aria-selected=true]');
    if (!kn || !on) continue;
    const k = kn.getBoundingClientRect(), b = on.getBoundingClientRect();
    if (Math.abs(k.left - b.left) > 2 || Math.abs(k.width - b.width) > 2) out.push(`knob off the tab: ${nm(seg)} knob ${Math.round(k.left)}+${Math.round(k.width)} tab ${Math.round(b.left)}+${Math.round(b.width)}`);
    const s = seg.getBoundingClientRect();
    if (seg.scrollWidth > seg.clientWidth + 2 && getComputedStyle(seg).overflowX === 'visible') out.push(`tabs wider than their track: ${nm(seg)}`);
    for (const t of seg.querySelectorAll('button')) { const r = t.getBoundingClientRect(); if (r.right > s.right + 1 && getComputedStyle(seg).overflowX === 'visible') { out.push(`tab outside its track: ${nm(t)}`); break; } }
  }
  // 4. words that only appear when a value is missing
  const tw = document.createTreeWalker(document.querySelector('.mn') ?? document.body, NodeFilter.SHOW_TEXT);
  for (let t = tw.nextNode(); t; t = tw.nextNode()) {
    const s = t.parentElement.textContent.trim();
    if (/undefined|NaN|\[object |null/.test(s) || /^·\s/.test(s)) out.push(`a missing value shows as text: "${s.slice(0, 40)}" in ${nm(t.parentElement)}`);
  }
  return [...new Set(out)].slice(0, 30);
};

const browser = await chromium.launch();
let n = 0;
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce', colorScheme: args.includes('--dark') ? 'dark' : 'light' });
  const page = await ctx.newPage();
  for (const j of jobs) {
    await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, j.key); if (j.key?.[2]) await ctx.route(/\/auth\/refresh$/, (r) => r.fulfill({ json: { accessToken: j.key[2], expiresInSeconds: 900 } }));
    await page.goto(j.url, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(500);
    const found = await page.evaluate(scan);
    if (found.length) { n += found.length; console.log(`${j.name} @${w}x${h}\n   ${found.join('\n   ')}`); }
  }
  await ctx.close();
}
await browser.close();
console.log(`\n${n} fit problems`);
process.exit(n ? 1 : 0);
