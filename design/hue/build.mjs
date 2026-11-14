// src/*.html (markup + optional <script> class body) -> canvas boards, hue.css, canvas.json. node build.mjs
import fs from 'node:fs';
import { iconPath } from './icons.mjs';
import { PAGES, UI, GLYPHS, SIZES } from './icon-map.mjs';
import { tokensCss } from './palette.mjs';
const HERE = new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const OUTS = [HERE + 'canvas/', HERE + 'preview/'];
const FONTS = 'https://fonts.googleapis.com/css2?family=Mona+Sans:wdth,wght@75..125,200..900&amp;family=Noto+Sans+Devanagari:wght@400;500;600;700&amp;display=swap';

// name, page, x, y, w, h, title, { dark: [name, x, y, title], live }
const W = 1440, G = 1520, P = 470, EW = 2190, EG = 2270;
export const BOARDS = [
  ['Main', 'system', 0, 0, W, 960, 'Tangent Hue · the idea', { live: 1 }],
  ['Colour', 'system', G, 0, W, 960, 'Colour · one seed, every token'],
  ['Type', 'system', 2 * G, 0, W, 960, 'Type · one family, two voices'],
  ['Components', 'system', 0, 1300, W, 1500, 'Web components', { live: 1, dark: ['ComponentsDark', G, 1300, 'Web components · dark'] }],
  ['AppKit', 'system', 2 * G, 1300, W, 960, 'App components'],
  ['Icons', 'system', 2 * G, 2400, W, 960, 'Icons · one meaning, one icon'],
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
  ['EmptyAdmin6', 'empty-admin', 7 * G, 0, W, 1100, 'Admin · added since the approval: audit log and privacy requests'],
  ['EmptyAdmin7', 'empty-admin', 8 * G, 0, W, 4200, 'Admin · every tab: approvals, leave, periods, receipts, library, transport, the app, the year'],
  ['EmptyConsole1', 'empty-console', 0, 0, W, 2000, 'Console · Operate', { dark: ['EmptyConsole1Dark', 4 * G, 0, 'Console · Operate, dark'] }],
  ['EmptyConsole2', 'empty-console', G, 0, W, 1700, 'Console · Ship and connect'],
  ['EmptyConsole3', 'empty-console', 2 * G, 0, W, 1700, 'Console · Care'],
  ['EmptyConsole4', 'empty-console', 3 * G, 0, W, 1300, 'Console · Billing, compliance, team'],
  ['EmptyConsole5', 'empty-console', 5 * G, 0, W, 3000, 'Console · every tab: compliance, integrations, modules, requests'],
  ['EmptyApp1', 'empty-app', 0, 0, EW, 964, 'Parent · every day', { dark: ['EmptyApp1Dark', 4 * EG, 0, 'Parent · every day, dark'] }],
  ['EmptyApp2', 'empty-app', EG, 0, EW, 964, 'Parent · school life'],
  ['EmptyApp3', 'empty-app', 2 * EG, 0, EW, 964, 'Parent · bus, books, leave, alerts, search'],
  ['EmptyApp4', 'empty-app', 3 * EG, 0, EW, 964, 'Teacher'],
];
const NOTES = {
  t_found: [0, -260, 'Foundations', 4480, 'system'], t_parts: [0, 1040, 'Parts', 4480, 'system'],
  t_admin: [0, -260, 'School admin', 4480, 'admin'], t_admin2: [0, 1040, 'Money, roll call, timetable', 4480, 'admin'], t_admin3: [0, 2340, 'Sign in and the menu', 4480, 'admin'],
  t_console: [0, -260, 'Tangent console', 4480, 'console'], t_console2: [0, 1040, 'Modules', 4480, 'console'],
  t_parents: [0, -260, 'Parents', 1800, 'app'], t_teachers: [0, 924, 'Teachers, and a brand-new school', 1800, 'app'],
  t_ea: [0, -260, 'Empty states · school admin', 9000, 'empty-admin'], t_ec: [0, -260, 'Empty states · Tangent console', 7000, 'empty-console'],
  t_ep: [0, -260, 'Empty states · parent and teacher app', 11000, 'empty-app'],
};

// empty states: [[es:icon|Page|where]] label ... [[/es]]; [[t:classes|heading|text|button|link?]] words; phone: [[ph:title|p or t|tab|back]] header extras [[sheet]] content [[/ph]]
const TABS = {
  p: [['@home', 'Home'], ['@notices', 'Notices'], ['@fees', 'Fees'], ['@messages', 'Chat'], ['@profile', 'Profile']],
  t: [['@home', 'Home'], ['@classes', 'Classes'], ['@homework', 'Homework'], ['@messages', 'Chat'], ['@profile', 'Profile']],
};
const WHO = { p: '<span class="chip ond"><span class="av sm sp sp-rose">MT</span>Maya[[ib:caret-down]]</span>', t: '<span class="chip ond"><span class="av sm sp sp-blue">EO</span>Ms Ortiz[[ib:caret-down]]</span>' };
let tabs = '';
// the Icons board lists the map itself, so the board and the code can never disagree
const iconCells = (o, k) => Object.entries(o).map(([m, n]) => `<div class="icc">${k === 'b' ? `[[ib:@${m}]]` : `[[i:@${m}]][[if:@${m}]]`}<b>${m}</b><small>${n}</small></div>`).join('');
const macros = (s) => s
  .replace(/\[\[iconmap:(pages|glyphs)\]\]/g, (_, w) => w === 'pages' ? iconCells(PAGES, 'r') : iconCells(GLYPHS, 'b'))
  // [[es:@icon|…]] names a scene after its icon; [[es:@icon.key|…]] gives a tab its own scene under that icon
  .replace(/\[\[es:(@?[\w-]+)(?:\.\w+)?\|([^|\]]+)\|([^\]]+)\]\]/g, (_, ic, page, where) => `<div class="es-item"><div class="es-where">[[ib:${ic}]]<b>${page}</b><span>${where}</span></div>`)
  .replace(/\[\[\/es\]\]/g, '</div>')
  .replace(/\[\[t:([\w ]*)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_, cls, h, p, b, l) => `<div class="ew ${cls}"><h2>${h}</h2><p>${p}</p><div class="acts"><button class="btn pri lg">${b}</button>${l ? `<a class="lk" href="#">${l}</a>` : ''}</div></div>`)
  .replace(/\[\[ph:([^|\]]+)\|([pt])\|(-?\d)\|([01])\]\]|\[\[sheet\]\]|\[\[\/ph\]\]/g, (m, title, role, tab, back) => {
    if (m === '[[sheet]]') return '</header><div class="sheet rise"><div class="pb" style="padding:18px 18px 20px;gap:16px">';
    if (m === '[[/ph]]') return `</div></div><nav class="tabs">${tabs}</nav></div>`;
    tabs = TABS[role].map(([ic, n], i) => `<a${i === +tab ? ' class="on"' : ''}>[[i${i === +tab ? 'f' : ''}:${ic}]]${n}</a>`).join('');
    return `<div class="hue s-emerald phone"><div class="stat"><span>9:41</span><span class="rw" style="gap:6px">[[if:cell-signal-full]][[if:wifi-high]][[if:battery-full]]</span></div><header class="phead" style="padding-bottom:44px"><div class="ptop">${back === '1' ? '<button class="pib ond" aria-label="Back">[[ib:caret-left]]</button>' : ''}<h1>${title}</h1><span class="sp"></span>${WHO[role]}</div>`;
  });

// @fees means "the icon for fees" in icon-map.mjs; data-k (r, f, b) lets qa.mjs check the weight rules
const named = (n) => { if (n[0] !== '@') return n; const v = PAGES[n.slice(1)] ?? UI[n.slice(1)] ?? GLYPHS[n.slice(1)]; if (!v) throw new Error(`no icon meaning "${n}"`); return v; };
const svg = (d, k) => `<svg class="i" data-k="${k}" viewBox="0 0 256 256" aria-hidden="true"><path d="${d}"/></svg>`;
const icons = (s) => s
  .replace(/\[\[i([fb]?):(@?[\w-]+)\]\]/g, (_, k, n) => svg(iconPath(named(n), k || 'r'), k || 'r'))
  .replace(/\[\[p([fb]?):(@?[\w-]+)\]\]/g, (_, k, n) => iconPath(named(n), k || 'r'));

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
  v: 3, createdOnFiles: { v: 1, at: '2026-11-09T19:30:00Z' }, title: 'Tangent design system', launch: { view: 'canvas', page: 'system' },
  pages: [{ id: 'system', name: 'The system' }, { id: 'admin', name: 'School admin' }, { id: 'console', name: 'Tangent console' }, { id: 'app', name: 'Parent and teacher app' }, { id: 'empty-admin', name: 'Empty states · admin' }, { id: 'empty-console', name: 'Empty states · console' }, { id: 'empty-app', name: 'Empty states · app' }],
  boards: cv.boards, order: cv.order,
  notes: Object.fromEntries(Object.entries(NOTES).map(([k, [x, y, text, maxW, page]]) => [k, { x, y, text, kind: 'title1', maxW, page }])),
  designSystems: [],
}, null, 1);
for (const out of OUTS) {
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(out)) if (/\.dc\.html$|^ink\.css$/.test(f)) fs.rmSync(out + f);
  for (const [f, t] of Object.entries(files)) if (!(out.endsWith('gprev/') && f === 'canvas.json')) fs.writeFileSync(out + f, t);
}
// the web empty states: each approved scene ([[es:@page|…]] … [[/es]] in the admin and console boards) and the kit's CSS, for
// packages/web-ui's EmptyState, which shows them in their own style scope so the boards' markup stays exactly as approved
const scenes = {};
for (const f of fs.readdirSync(`${HERE}src`).filter((n) => /^Empty(Admin|Console)\d\.html$/.test(n)).sort()) {
  for (const m of fs.readFileSync(`${HERE}src/${f}`, 'utf8').matchAll(/\[\[es:@(\w+)(?:\.(\w+))?\|[^\]]*\]\]([\s\S]*?)\[\[\/es\]\]/g)) scenes[m[2] ?? m[1]] = icons(macros(m[3])).replace(/\s*\n\s*/g, ' ').trim();
}
const sceneCss = ['base.css', 'base2.css', 'empty.css'].map((n) => fs.readFileSync(`${HERE}${n}`, 'utf8')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '');
fs.writeFileSync(`${HERE}../../packages/web-ui/src/empty/scenes.ts`, `// Generated by design/hue/build.mjs from design/hue/src/Empty{Admin,Console}*.html and the kit's CSS. Do not edit.
/* eslint-disable */
export const SCENE_CSS = ${JSON.stringify(sceneCss)};
export const SCENES = {
${Object.entries(scenes).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`).join('\n')}
} as const;
`);
// the boards' component CSS for pages rebuilt from a board (`<main className="mn hb">`): `.hue X` becomes `.nest .hb X`, the text
// colours --t1..3 become --ink..ink3 (on the web --t1..3 are motion timings), and classes Nest uses for something else are renamed
const RENAME = { rw: 'fx', tr: 'trow', tile: 'ht', mini: 'mcard', st: 'stb', float: 'flt', sheet: 'psheet', col: 'vc' };
const parts = ['base.css', 'base2.css'].map((n) => fs.readFileSync(`${HERE}${n}`, 'utf8')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/([^{}]+)\{([^{}]*)\}/g, (all, sel, body) => {
    const s = sel.split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
      if (!x.startsWith('.hue')) return null;
      if (x === '.hue') return null;
      // the product's own tooltip (Tip.tsx) shows every data-tip; the board's CSS one would draw a second
      if (x.includes('[data-tip]')) return null;
      return x.replace(/^\.hue\.([\w-]+)/, '.nest .hb .$1, .nest .hb.$1').replace(/^\.hue /, '.nest .hb ').replace(/\.(rw|tr|tile|mini|st|float|sheet|col)(?![\w-])/g, (m, c) => `.${RENAME[c]}`);
    }).filter(Boolean);
    // Hue's text font is --ft; on the web it is --fb (--fd is the same name in both)
    return s.length ? `${s.join(',')}{${body.replace(/var\(--t([123])\)/g, (m, n) => `var(--ink${n === '1' ? '' : n})`).replace(/var\(--ft\)/g, 'var(--fb)').trim()}}\n` : '';
  });
fs.writeFileSync(`${HERE}../../packages/web-ui/src/hue-parts.css`, `/* Generated by design/hue/build.mjs from design/hue/base.css and base2.css (the canvas's components). Do not edit. */\n${parts}`);
// the product's icon sets, written straight into packages/web-ui and lib/core/widgets so there is no copy to go stale
const camel = (n) => n.replace(/-(\w)/g, (_, c) => c.toUpperCase()), gen = 'Generated by design/hue/build.mjs from design/hue/icon-map.mjs. Do not edit.';
const tsRows = (o, ks) => Object.entries(o).map(([k, n]) => `  ${k}: ${ks.length > 1 ? `{ ${ks.map((q) => `${q}: '${iconPath(n, q)}'`).join(', ')} }` : `'${iconPath(n, ks[0])}'`},`).join('\n');
fs.writeFileSync(`${HERE}../../packages/web-ui/src/icons.ts`, `// ${gen}
// Phosphor paths on a 256 grid, drawn filled: <svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">.
/** Pages, modules and tabs: r regular, f when selected. */
export const IC = {
${tsRows(PAGES, ['r', 'f'])}
} as const;
/** Everyday actions and objects: r regular (20 px and up), b bold (16 px and under). */
export const UI = {
${tsRows(UI, ['r', 'b'])}
} as const;
/** Small symbols and statuses: bold, 14 or 16 px. */
export const GLYPH = {
${tsRows(GLYPHS, ['b'])}
} as const;
export const ICON_SIZE = { ${Object.entries(SIZES).map(([k, v]) => `${k}: ${v}`).join(', ')} } as const;
`);
const dart = (o, cls, suffix = '') => Object.entries(o).map(([k, n]) => `  static const IconData ${k}${suffix} = ${cls}.${camel(n)};`).join('\n');
fs.writeFileSync(`${HERE}../../lib/core/widgets/app_icons.dart`, `// ${gen}
import 'package:flutter/widgets.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

/// One icon per meaning: pages and tabs (regular, \`…On\` when selected), small symbols (bold), the four sizes.
abstract final class AppIcons {
${dart(PAGES, 'PhosphorIconsRegular')}

${dart(PAGES, 'PhosphorIconsFill', 'On')}

${dart(UI, 'PhosphorIconsRegular')}

${dart(GLYPHS, 'PhosphorIconsBold')}

${Object.entries(SIZES).map(([k, v]) => `  static const double size${k[0].toUpperCase()}${k.slice(1)} = ${v};`).join('\n')}
}
`);
console.log(`built ${cv.order.length} boards${missing.length ? `; no source yet: ${missing.join(', ')}` : ''}`);
