// src/*.html (markup + optional <script> class body) -> canvas boards, hue.css, canvas.json. node build.mjs
import fs from 'node:fs';
import { iconPath } from './icons.mjs';
import { tokensCss } from './palette.mjs';
const HERE = new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const OUTS = [HERE + 'canvas/', HERE + 'preview/'];
const FONTS = 'https://fonts.googleapis.com/css2?family=Mona+Sans:wdth,wght@75..125,200..900&amp;family=Noto+Sans+Devanagari:wght@400;500;600;700&amp;display=swap';

// name, page, x, y, w, h, title, { dark: [name, x, y, title], live }
const W = 1440, G = 1520, P = 470, EW = 2190, EG = 2270;
export const BOARDS = [
  ['Main', 'system', 0, 0, W, 960, 'Gradeon Hue · the idea', { live: 1 }],
  ['Colour', 'system', G, 0, W, 960, 'Colour · one seed, every token'],
  ['Type', 'system', 2 * G, 0, W, 960, 'Type · one family, two voices'],
  ['Components', 'system', 0, 1300, W, 1500, 'Web components', { live: 1, dark: ['ComponentsDark', G, 1300, 'Web components · dark'] }],
  ['AppKit', 'system', 2 * G, 1300, W, 960, 'App components'],
  ['Today', 'admin', 0, 0, W, 960, 'Today', { dark: ['TodayDark', G, 0, 'Today · dark'] }],
  ['Students', 'admin', 2 * G, 0, W, 960, 'Students', { live: 1 }],
  ['Fees', 'admin', 0, 1300, W, 960, 'Fees'],
  ['Attendance', 'admin', G, 1300, W, 960, 'Attendance · roll call', { live: 1 }],
  ['Timetable', 'admin', 2 * G, 1300, W, 960, 'Timetable'],
  ['SignIn', 'admin', 0, 2600, W, 900, 'Sign in'],
  ['Sidebar', 'admin', G, 2600, 248, 940, 'Menu (shared part)'],
  ['Fleet', 'console', 0, 0, W, 960, 'Fleet', { dark: ['FleetDark', G, 0, 'Fleet · dark'] }],
  ['School', 'console', 2 * G, 0, W, 960, 'One school · in its own colour', { live: 1 }],
  ['Modules', 'console', 0, 1300, W, 960, 'Modules'],
  ['ParentHome', 'app', 0, 0, 390, 844, 'Parent · home', { dark: ['ParentHomeDark', 3 * P, 0, 'Parent · home, dark'] }],
  ['ParentFees', 'app', P, 0, 390, 844, 'Parent · fees'],
  ['ParentResults', 'app', 2 * P, 0, 390, 844, 'Parent · results'],
  ['TeacherHome', 'app', 0, 1184, 390, 844, 'Teacher · home', { dark: ['TeacherHomeDark', 3 * P, 1184, 'Teacher · home, dark'] }],
  ['RollCall', 'app', P, 1184, 390, 844, 'Teacher · roll call', { live: 1 }],
  ['EmptyHome', 'app', 2 * P, 1184, 390, 844, 'Brand-new school'],
  ['EmptyFrame', 'empty-admin', 0, 0, W, 960, 'The frame · words, scene, phone, still'],
  ['EmptyAdmin1', 'empty-admin', G, 0, W, 2000, 'Admin · Teach', { dark: ['EmptyAdmin1Dark', 6 * G, 0, 'Admin · Teach, dark'] }],
  ['EmptyAdmin2', 'empty-admin', 2 * G, 0, W, 1300, 'Admin · People'],
  ['EmptyAdmin3', 'empty-admin', 3 * G, 0, W, 1700, 'Admin · Money'],
  ['EmptyAdmin4', 'empty-admin', 4 * G, 0, W, 1700, 'Admin · Reach'],
  ['EmptyAdmin5', 'empty-admin', 5 * G, 0, W, 1700, 'Admin · School'],
  ['EmptyConsole1', 'empty-console', 0, 0, W, 2000, 'Console · Operate', { dark: ['EmptyConsole1Dark', 4 * G, 0, 'Console · Operate, dark'] }],
  ['EmptyConsole2', 'empty-console', G, 0, W, 1700, 'Console · Ship and connect'],
  ['EmptyConsole3', 'empty-console', 2 * G, 0, W, 1700, 'Console · Care'],
  ['EmptyConsole4', 'empty-console', 3 * G, 0, W, 1300, 'Console · Billing, compliance, team'],
  ['EmptyApp1', 'empty-app', 0, 0, EW, 964, 'Parent · every day', { dark: ['EmptyApp1Dark', 4 * EG, 0, 'Parent · every day, dark'] }],
  ['EmptyApp2', 'empty-app', EG, 0, EW, 964, 'Parent · school life'],
  ['EmptyApp3', 'empty-app', 2 * EG, 0, EW, 964, 'Parent · bus, books, leave, alerts, search'],
  ['EmptyApp4', 'empty-app', 3 * EG, 0, EW, 964, 'Teacher'],
];
const NOTES = {
  t_found: [0, -260, 'Foundations', 4480, 'system'], t_parts: [0, 1040, 'Parts', 4480, 'system'],
  t_admin: [0, -260, 'School admin', 4480, 'admin'], t_admin2: [0, 1040, 'Money, roll call, timetable', 4480, 'admin'], t_admin3: [0, 2340, 'Sign in and the menu', 4480, 'admin'],
  t_console: [0, -260, 'Gradeon console', 4480, 'console'], t_console2: [0, 1040, 'Modules', 4480, 'console'],
  t_parents: [0, -260, 'Parents', 1800, 'app'], t_teachers: [0, 924, 'Teachers, and a brand-new school', 1800, 'app'],
  t_ea: [0, -260, 'Empty states · school admin', 9000, 'empty-admin'], t_ec: [0, -260, 'Empty states · Gradeon console', 7000, 'empty-console'],
  t_ep: [0, -260, 'Empty states · parent and teacher app', 11000, 'empty-app'],
};

// empty-state frame: [[es:icon|Page|where]] [[w:heading|text|button|link?]] scene [[/w:caption?]] [[/es]]; phone: [[ph:title|p or t|tab|back]] ... [[/ph]]
const TABS = {
  p: [['house', 'Home'], ['megaphone', 'Notices'], ['wallet', 'Fees'], ['chat-circle', 'Chat'], ['user-circle', 'Profile']],
  t: [['house', 'Home'], ['chalkboard-teacher', 'Classes'], ['notebook', 'Homework'], ['chat-circle', 'Chat'], ['user-circle', 'Profile']],
};
const WHO = { p: '<span class="chip ond"><span class="av sm sp sp-art">AS</span>Aarav[[ib:caret-down]]</span>', t: '<span class="chip ond"><span class="av sm sp sp-maths">KI</span>Kavita[[ib:caret-down]]</span>' };
let tabs = '';
const macros = (s) => s
  .replace(/\[\[es:([\w-]+)\|([^|\]]+)\|([^\]]+)\]\]/g, (_, ic, page, where) => `<div class="es-item"><div class="es-where">[[i:${ic}]]<b>${page}</b><span>${where}</span></div><div class="es-wrap">`)
  .replace(/\[\[\/es\]\]/g, '</div></div>')
  .replace(/\[\[w:([^|\]]+)\|([^|\]]+)\|([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_, h, p, b, l) => `<section class="es"><div class="es-w"><h2 class="es-h">${h}</h2><p class="es-p">${p}</p><div class="es-a"><button class="btn pri lg">${b}</button>${l ? `<a class="es-l" href="#">${l}</a>` : ''}</div></div><div class="es-s" aria-hidden="true">`)
  .replace(/\[\[\/w(?::([^\]]+))?\]\]/g, (_, cap) => `<span class="es-cap">${cap || 'Example names and numbers'}</span></div></section>`)
  .replace(/\[\[ph:([^|\]]+)\|([pt])\|(-?\d)\|([01])\]\]|\[\[\/ph\]\]/g, (m, title, role, tab, back) => {
    if (m === '[[/ph]]') return `</div></div></div><nav class="tabs">${tabs}</nav></div>`;
    tabs = TABS[role].map(([ic, n], i) => `<a${i === +tab ? ' class="on"' : ''}>[[i${i === +tab ? 'f' : ''}:${ic}]]${n}</a>`).join('');
    return `<div class="hue s-emerald phone"><div class="stat"><span>9:41</span><span class="rw" style="gap:6px">[[if:cell-signal-full]][[if:wifi-high]][[if:battery-full]]</span></div><header class="phead" style="padding-bottom:44px"><div class="ptop">${back === '1' ? '<button class="pib ond" aria-label="Back">[[ib:caret-left]]</button>' : ''}<h1>${title}</h1><span class="sp"></span>${WHO[role]}</div></header><div class="sheet rise"><div class="pb" style="padding:16px 16px 20px"><div class="es-wrap">`;
  });

const svg = (d) => `<svg class="i" viewBox="0 0 256 256" aria-hidden="true"><path d="${d}"/></svg>`;
const icons = (s) => s
  .replace(/\[\[i([fb]?):([\w-]+)\]\]/g, (_, k, n) => svg(iconPath(n, k || 'r')))
  .replace(/\[\[p([fb]?):([\w-]+)\]\]/g, (_, k, n) => iconPath(n, k || 'r'));

function board(name, w, h, title, src) {
  const m = src.match(/<script(?:\s+props='([^']*)')?>([\s\S]*?)<\/script>\s*$/);
  const html = (m ? src.slice(0, m.index) : src).trim(), body = m ? m[2].trim() : 'renderVals() { return {}; }';
  const props = { ...(m && m[1] ? JSON.parse(m[1]) : {}), $preview: { width: w, height: h } };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<script src="./support.js"></script>
<link rel="stylesheet" href="hue.css">
</head>
<body>
<x-dc>
<helmet>
<link href="${FONTS}" rel="stylesheet">
<style>body{margin:0}</style>
</helmet>
${html}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='${JSON.stringify(props)}'>
class Component extends DCLogic {
${body}
}
</script>
</body>
</html>
`;
}

const files = {}, cv = { boards: {}, order: [] };
const add = (name, page, x, y, w, h, title, live, text) => {
  files[`${name}.dc.html`] = text;
  cv.boards[`${name}.dc.html`] = { x, y, w, h, title, page, ...(w > 400 && name !== 'Sidebar' ? { expand: 'fill' } : {}), ...(live ? { is_interactive: true } : {}) };
  cv.order.push(`${name}.dc.html`);
};
// qa.mjs measures each board; a board is never shorter than its content
const HF = `${HERE}heights.json`, tall = fs.existsSync(HF) ? JSON.parse(fs.readFileSync(HF, 'utf8')) : {};
const missing = [];
for (const [name, page, x, y, w, h0, title, o = {}] of BOARDS) {
  const h = Math.max(h0, tall[name] ?? 0, tall[o.dark?.[0]] ?? 0);
  const f = `${HERE}src/${name}.html`;
  if (!fs.existsSync(f)) { missing.push(name); continue; }
  const src = icons(macros(fs.readFileSync(f, 'utf8')));
  add(name, page, x, y, w, h, title, o.live, board(name, w, h, title, src));
  if (o.dark) { const [dn, dx, dy, dt] = o.dark; add(dn, page, dx, dy, w, h, dt, o.live, board(dn, w, h, dt, src.replace(/class="hue /g, 'class="hue dark ').replace(/theme="light"/g, 'theme="dark"'))); }
}
files['hue.css'] = tokensCss() + fs.readFileSync(`${HERE}base.css`, 'utf8') + fs.readFileSync(`${HERE}base2.css`, 'utf8') + fs.readFileSync(`${HERE}empty.css`, 'utf8');
files['canvas.json'] = JSON.stringify({
  v: 3, createdOnFiles: { v: 1, at: '2026-11-09T19:30:00Z' }, title: 'Gradeon design system', launch: { view: 'canvas', page: 'system' },
  pages: [{ id: 'system', name: 'The system' }, { id: 'admin', name: 'School admin' }, { id: 'console', name: 'Gradeon console' }, { id: 'app', name: 'Parent and teacher app' }, { id: 'empty-admin', name: 'Empty states · admin' }, { id: 'empty-console', name: 'Empty states · console' }, { id: 'empty-app', name: 'Empty states · app' }],
  boards: cv.boards, order: cv.order,
  notes: Object.fromEntries(Object.entries(NOTES).map(([k, [x, y, text, maxW, page]]) => [k, { x, y, text, kind: 'title1', maxW, page }])),
  designSystems: [],
}, null, 1);
for (const out of OUTS) {
  for (const f of fs.readdirSync(out)) if (/\.dc\.html$|^ink\.css$/.test(f)) fs.rmSync(out + f);
  for (const [f, t] of Object.entries(files)) if (!(out.endsWith('gprev/') && f === 'canvas.json')) fs.writeFileSync(out + f, t);
}
console.log(`built ${cv.order.length} boards${missing.length ? `; no source yet: ${missing.join(', ')}` : ''}`);
