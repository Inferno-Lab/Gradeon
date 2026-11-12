// node anim.mjs Board [x y w h] : screenshots a board at 1 s, 3.5 s and 7 s of the empty-state loop into shots/<Board>-t<n>.png
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const { chromium } = await import(new URL('../../node_modules/.pnpm/playwright@1.64.1/node_modules/playwright/index.mjs', import.meta.url));
const HERE = new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const [n, x = 0, y = 0, w = 1440, h = 700] = process.argv.slice(2), W = n.startsWith('EmptyApp') ? 2190 : 1440;
const srv = http.createServer((q, r) => fs.readFile(path.join(HERE, 'preview', decodeURIComponent(q.url.split('?')[0])), (e, d) => { r.writeHead(e ? 404 : 200, { 'content-type': q.url.includes('.css') ? 'text/css' : 'text/html' }); r.end(d); })).listen(8126);
const b = await chromium.launch(), p = await b.newPage({ viewport: { width: W, height: 1400 } });
await p.goto(`http://127.0.0.1:8126/preview.html?f=${n}&w=${W}`); await p.evaluate(() => document.fonts.ready);
for (const t of [1, 3.5, 7]) {
  await p.evaluate((t) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t * 1000; }), t);
  await p.screenshot({ path: `${HERE}shots/${n}-t${t}.png`, clip: { x: +x, y: +y, width: +w, height: +h } });
}
await b.close(); srv.close();
