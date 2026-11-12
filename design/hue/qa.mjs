// node qa.mjs [@tag] [Name ...] : renders boards from preview/, writes shots/<Name>.png, heights.json and contact sheets, prints layout issues
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const { chromium } = await import(new URL('../../node_modules/.pnpm/playwright@1.64.1/node_modules/playwright/index.mjs', import.meta.url));
const HERE = new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), dir = HERE + 'preview', out = HERE + 'shots';
const all = fs.readdirSync(dir).filter((f) => f.endsWith('.dc.html')).map((f) => f.slice(0, -8));
const args = process.argv.slice(2), tag = args[0]?.startsWith('@') ? args.shift().slice(1) : 'sheet';
const names = args.length ? args : all;
const width = (n) => n.startsWith('Sidebar') ? 248 : n.startsWith('EmptyApp') ? 2190 : /^(Parent|Teacher|RollCall|EmptyHome)/.test(n) ? 390 : 1440;
const types = { '.css': 'text/css', '.html': 'text/html', '.png': 'image/png' };
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(u.startsWith('/shots/') ? out : dir, u.replace('/shots/', '')); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/html' }); r.end(d); }); }).listen(8125);
const HF = HERE + 'heights.json', heights = fs.existsSync(HF) ? JSON.parse(fs.readFileSync(HF, 'utf8')) : {};
const b = await chromium.launch();
for (const n of names) {
  const w = width(n), p = await b.newPage({ viewport: { width: w, height: 600 }, reducedMotion: 'reduce' });
  p.on('pageerror', (e) => console.log(n, 'ERR', e.message)); p.on('console', (m) => m.type() === 'error' && console.log(n, 'console', m.text()));
  await p.goto(`http://127.0.0.1:8125/preview.html?f=${n}&w=${w}`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(900);
  const r = await p.evaluate(() => {
    const root = document.getElementById('root'), R = root.getBoundingClientRect(), out = [], txt = (el) => (el.textContent || '').trim().slice(0, 28);
    for (const el of root.querySelectorAll('*')) {
      const q = el.getBoundingClientRect(); if (!q.width) continue;
      if (q.right > R.right + 1 || q.left < R.left - 1) out.push(`over[${el.className}] ${txt(el)}`);
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible' && !el.hasAttribute('data-scroll')) out.push(`cut[${el.className}] ${txt(el)}`);
      if (el.matches('.btn,.tag,.tabr a,.seg button,.seg span,.st,kbd,.search,.nv,.chip,.th') && el.scrollHeight > el.clientHeight + 3) out.push(`wrap[${el.className}] ${txt(el)}`);
    }
    // icon rules (README "Icons"): four sizes, bold at 16 px and under, hidden from screen readers, named controls, web tooltips
    for (const s of root.querySelectorAll('svg.i')) {
      const w = Math.round(s.getBoundingClientRect().width), at = s.parentElement.className || s.parentElement.tagName;
      if (!w || s.closest('.stat')) continue;
      if (![14, 16, 20, 24].includes(w)) out.push(`icon-size ${w}[${at}]`);
      if (w <= 16 && s.dataset.k !== 'b') out.push(`icon-weight ${s.dataset.k}@${w}[${at}]`);
      if (s.getAttribute('aria-hidden') !== 'true') out.push(`icon-hidden[${at}]`);
    }
    for (const c of root.querySelectorAll('button,a')) if (!c.textContent.trim() && !c.getAttribute('aria-label')) out.push(`no-name[${c.className}]`);
    for (const c of root.querySelectorAll('.ib')) if (!c.dataset.tip) out.push(`no-tip[${c.getAttribute('aria-label')}]`);
    return { h: Math.ceil(root.scrollHeight), out: [...new Set(out)].slice(0, 10) };
  });
  heights[n] = r.h; console.log(n, r.h, r.out.length ? '\n  ' + r.out.join('\n  ') : 'ok');
  await p.screenshot({ path: `${out}/${n}.png`, fullPage: true }); await p.close();
}
fs.writeFileSync(HF, JSON.stringify(heights));
const chunk = (a, k) => a.length ? [a.slice(0, k), ...chunk(a.slice(k), k)] : [];
const sheets = [...chunk(names.filter((n) => width(n) === 1440), 2).map((c) => [c, 790]), ...chunk(names.filter((n) => width(n) !== 1440), 4).map((c) => [c, 390])];
let i = 0;
for (const [c, iw] of sheets) {
  const html = `<body style="margin:0;display:flex;gap:8px;background:#777;padding:6px;align-items:flex-start;font:11px sans-serif;color:#fff">${c.map((n) => `<figure style="margin:0"><img src="/shots/${n}.png" style="width:${iw}px;display:block"><figcaption>${n}</figcaption></figure>`).join('')}</body>`;
  fs.writeFileSync(`${out}/_s.html`, html);
  const p = await b.newPage({ viewport: { width: 1600, height: 400 } }); await p.goto('http://127.0.0.1:8125/shots/_s.html'); await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/${tag}-${++i}.png`, fullPage: true }); await p.close();
}
await b.close(); srv.close();
