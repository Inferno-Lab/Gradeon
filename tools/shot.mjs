#!/usr/bin/env node
// Takes a screenshot of a page in headless Chromium, signed in to a school or the console.
// Usage: node tools/shot.mjs <url> <out.png> [width] [height] [--dark] [--school slug] [--console] [--full] [--audit] [--do '[{"click":"text=Modules"},{"fill":["sel","text"]},{"wait":300}]']
import { chromium } from '@playwright/test';
import { auditPage } from './lib/audit.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const [url, out, w = '1440', h = '900'] = args.filter((a, i) => !a.startsWith('--') && !['--school', '--do', '--wait'].includes(args[i - 1]));
const api = process.env.API ?? 'http://localhost:4000';
const slug = val('--school') ?? 'greenfield';

async function tokens() {
  if (flag('--console')) {
    const a = await (await fetch(`${api}/console/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'kaushal@tangent.app', password: 'nest2026' }) })).json();
    const t = await (await fetch(`${api}/console/v1/auth/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId: a.challenge.challengeId, code: '424242' }) })).json();
    return { key: 'tangent.console', value: JSON.stringify({ user: t.user }), token: t.accessToken };
  }
  const h = { 'content-type': 'application/json', 'x-school': slug };
  const a = await (await fetch(`${api}/v1/auth/login`, { method: 'POST', headers: h, body: JSON.stringify({ identifier: 'neha.menon@greenfield.edu.in', password: 'nest2026' }) })).json();
  const t = await (await fetch(`${api}/v1/auth/verify`, { method: 'POST', headers: h, body: JSON.stringify({ challengeId: a.challenge.challengeId, code: '424242' }) })).json();
  return { key: `tangent.admin.${slug}`, value: JSON.stringify({ user: t.user }), token: t.accessToken };
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: Number(w), height: Number(h) }, colorScheme: flag('--dark') ? 'dark' : 'light', reducedMotion: flag('--motion') ? 'no-preference' : 'reduce' });
if (!flag('--anon')) {
  const t = await tokens();
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, [t.key, t.value]);
  await ctx.route(/\/auth\/refresh$/, (r) => r.fulfill({ json: { accessToken: t.token, expiresInSeconds: 900 } }));
}
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(val('--wait') ?? 1200));
for (const a of JSON.parse(val('--do') ?? '[]')) {
  if (a.click) await page.locator(a.click).first().click();
  else if (a.fill) await page.locator(a.fill[0]).first().fill(a.fill[1]);
  else if (a.press) await page.keyboard.press(a.press);
  await page.waitForTimeout(a.wait ?? 400);
}
const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
let audit = [];
if (flag('--audit')) audit = await auditPage(page);
await page.screenshot({ path: out, fullPage: flag('--full') });
console.log(JSON.stringify({ out, overflowX: overflow.sw > overflow.cw + 1 ? overflow : false, errors, ...(audit.length ? { audit } : {}) }));
await browser.close();
