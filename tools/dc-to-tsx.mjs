#!/usr/bin/env node
// One-time converter: turns a canvas board (design/canvas/<Name>.dc.html) into
//   <out>/<name>.view.tsx   the markup as a React component that renders values from `v` (and loop variables)
//   <out>/<name>.css        the board's own CSS, scoped under .pg-<name> so pages never collide
//   <out>/<name>.logic.txt  the board's script, kept next to it as the reference for the hand-written hook
// The generated files are then edited by hand; the canvas stays the source of truth for how it must look.
//
// Usage: node tools/dc-to-tsx.mjs <Board> <pageName> <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'htmlparser2';
import postcss from 'postcss';
import prefix from 'postcss-prefix-selector';

const [board, page, outDir] = process.argv.slice(2);
if (!board || !page || !outDir) throw new Error('Usage: dc-to-tsx.mjs <Board> <pageName> <outDir>');
const src = fs.readFileSync(path.join('design/canvas', `${board}.dc.html`), 'utf8');

const doc = parseDocument(src, { lowerCaseTags: false, lowerCaseAttributeNames: false, recognizeSelfClosing: false });
const find = (node, name) => {
  if (node.name === name) return node;
  for (const c of node.children ?? []) { const r = find(c, name); if (r) return r; }
  return null;
};
const xdc = find(doc, 'x-dc');
const helmet = (xdc.children ?? []).find((c) => c.name === 'helmet');
const template = (xdc.children ?? []).filter((c) => c.type === 'tag' && c.name !== 'helmet');
if (template.length !== 1) throw new Error(`Expected one root element, found ${template.length}`);

// ---- CSS
const styleNode = helmet && find(helmet, 'style');
const css = styleNode ? styleNode.children.map((c) => c.data).join('') : '';
const scoped = postcss([
  prefix({
    prefix: `.pg-${page}`,
    transform: (p, selector, prefixed) => (/^(body|html|:root)\b/.test(selector) ? '' : selector.startsWith('.nest') ? selector : prefixed),
  }),
]).process(css, { from: undefined }).css.replace(/^[^{}]*\{\s*\}\s*$/gm, '').replace(/^\{[^}]*\}\s*$/gm, '');

// ---- JSX
const SVG_ATTR = (n) => n.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const RENAME = { class: 'className', for: 'htmlFor', tabindex: 'tabIndex', readonly: 'readOnly', autocomplete: 'autoComplete', autoComplete: 'autoComplete', maxlength: 'maxLength', colspan: 'colSpan', viewbox: 'viewBox' };
const HOLE = /\{\{\s*([^}]*?)\s*\}\}/g;

function expr(raw, scope) {
  const e = raw.trim();
  if (e === 'true' || e === 'false' || /^-?\d+(\.\d+)?$/.test(e)) return e;
  const head = e.split('.')[0];
  const root = scope.has(head) ? '' : 'v.';
  return `${root}${e}`;
}

function attrValue(name, value, scope) {
  const whole = /^\{\{\s*([^}]*?)\s*\}\}$/.exec(value);
  if (whole) return `{${expr(whole[1], scope)}}`;
  if (!HOLE.test(value)) { HOLE.lastIndex = 0; return JSON.stringify(value); }
  HOLE.lastIndex = 0;
  const tpl = value.replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(HOLE, (_, e) => `\${${expr(e, scope)} ?? ''}`);
  return `{\`${tpl}\`}`;
}

function styleObject(value, scope) {
  const decls = value.split(';').map((d) => d.trim()).filter(Boolean);
  const parts = decls.map((d) => {
    const i = d.indexOf(':');
    const prop = d.slice(0, i).trim();
    let val = d.slice(i + 1).trim();
    const key = prop.startsWith('--') ? JSON.stringify(prop) : prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const hasHole = HOLE.test(val);
    HOLE.lastIndex = 0;
    if (!hasHole) return `${key}: ${JSON.stringify(val)}`;
    const whole = /^\{\{\s*([^}]*?)\s*\}\}$/.exec(val);
    if (whole) return `${key}: ${expr(whole[1], scope)}`;
    val = val.replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(HOLE, (_, e) => `\${${expr(e, scope)} ?? ''}`);
    return `${key}: \`${val}\``;
  });
  return `{{ ${parts.join(', ')} } as CSSProperties}`;
}

function escText(t) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
}

function text(data, scope) {
  if (!/\S/.test(data)) return /\n/.test(data) ? '' : '{" "}';
  let out = '';
  let last = 0;
  for (const m of data.matchAll(HOLE)) {
    out += escText(data.slice(last, m.index));
    out += `{${expr(m[1], scope)}}`;
    last = m.index + m[0].length;
  }
  out += escText(data.slice(last));
  return out;
}

let asideJsx = '';
function conv(node, scope, pageRoot) {
  if (node.type === 'text') return text(node.data, scope);
  if (node.type === 'comment') return '';
  if (node.type !== 'tag' && node.type !== 'script' && node.type !== 'style') return '';
  const name = node.name;
  if (name === 'aside' && (node.attribs.class ?? '').split(/\s+/).includes('sb')) {
    const saved = convAside(node, scope);
    asideJsx = saved;
    return '{v.aside}';
  }
  const kids = (s = scope) => (node.children ?? []).map((c) => conv(c, s, false)).join('');
  if (name === 'sc-if') {
    const cond = /^\{\{\s*([^}]*?)\s*\}\}$/.exec(node.attribs.value)[1];
    return `{${expr(cond, scope)} && (<>${kids()}</>)}`;
  }
  if (name === 'sc-for') {
    const list = /^\{\{\s*([^}]*?)\s*\}\}$/.exec(node.attribs.list)[1];
    const as = node.attribs.as;
    const inner = new Set([...scope, as]);
    return `{${expr(list, scope)}.map((${as}: any, $i: number) => (<Fragment key={$i}>${kids(inner)}</Fragment>))}`;
  }
  if (name === 'dc-import') {
    const props = Object.entries(node.attribs).filter(([k]) => !k.startsWith('hint-') && k !== 'name').map(([k, v]) => `${SVG_ATTR(k)}=${attrValue(k, v, scope)}`).join(' ');
    return `<Import name="${node.attribs.name}" ${props} />`;
  }
  const attrs = [];
  for (const [k, v] of Object.entries(node.attribs)) {
    if (k.startsWith('hint-')) continue;
    let key = RENAME[k] ?? (k.startsWith('aria-') || k.startsWith('data-') ? k : SVG_ATTR(k));
    if (k === 'style') { attrs.push(`style=${styleObject(v, scope)}`); continue; }
    if (key === 'className' && pageRoot) {
      attrs.push(`className={\`pg-${page} ${tplInner(v, scope)}\`}`);
      continue;
    }
    if (['maxLength', 'tabIndex', 'colSpan', 'rowSpan', 'rows', 'cols'].includes(key) && /^-?\d+$/.test(v)) { attrs.push(`${key}={${v}}`); continue; }
    attrs.push(`${key}=${attrValue(k, v, scope)}`);
  }
  if (node.attribs.role === 'search' && (node.attribs.class ?? '').includes('srch')) attrs.push('onClick={v.openSearch}', 'tabIndex={0}', 'onKeyDown={(e: any) => e.key === "Enter" && v.openSearch()}', 'style={{ cursor: "text" }}');
  const open = `<${name}${attrs.length ? ' ' + attrs.join(' ') : ''}`;
  const VOID = new Set(['input', 'br', 'img', 'hr']);
  if (VOID.has(name)) return `${open} />`;
  const inner = kids();
  return inner ? `${open}>${inner}</${name}>` : `${open}></${name}>`;
}

function convAside(node, scope) {
  const copy = { ...node, name: 'aside__' };
  return conv({ ...copy, name: 'aside_' }, scope, false).replace(/^<aside_/, '<aside').replace(/<\/aside_>$/, '</aside>');
}

/** The inside of a template literal for an attribute value with holes. */
function tplInner(value, scope) {
  return value.replace(/`/g, '\`').replace(/\$\{/g, '\${').replace(HOLE, (_, e) => `\${${expr(e, scope)} ?? ''}`);
}

const hasClass = (n, c) => (n.attribs?.class ?? '').split(/\s+/).includes(c);
const elKids = (n) => (n.children ?? []).filter((c) => c.type === 'tag');
function shellify(root) {
  if (!hasClass(root, 'nest')) return null;
  const fr = elKids(root).find((c) => hasClass(c, 'fr'));
  const app = fr && elKids(fr).find((c) => hasClass(c, 'app'));
  if (!app || elKids(root).length !== 1) return null;
  const scope = new Set();
  const frClass = fr.attribs.class.split(/\s+/).filter((c) => c !== 'fr').join(' ').trim();
  const inApp = (app.children ?? []).filter((c) => c.name !== 'aside').map((c) => conv(c, scope, false)).join('');
  const afterApp = (fr.children ?? []).filter((c) => c !== app).map((c) => conv(c, scope, false)).join('');
  const aside = (app.children ?? []).find((c) => c.name === 'aside');
  if (aside) asideJsx = convAside(aside, scope);
  const fc = frClass ? ` frClass={\`${tplInner(frClass, scope)}\`}` : '';
  return `<Shell page="${page}" theme={v.themeCls} aside={v.aside}${fc}` + ` overlays={<>{v.palette}${afterApp}</>}>${inApp}</Shell>`;
}
const jsx = shellify(template[0]) ?? conv(template[0], new Set(), true);
const findAll = (node, pred, acc = []) => { if (pred(node)) acc.push(node); for (const c of node.children ?? []) findAll(c, pred, acc); return acc; };
const scriptNode = findAll(doc, (n) => n.name === 'script' && 'data-dc-script' in (n.attribs ?? {}))[0];
const logic = scriptNode ? scriptNode.children.map((c) => c.data).join('') : '';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${page}.css`), `/* Scoped from design/canvas/${board}.dc.html. Selectors are prefixed with .pg-${page}. */\n${scoped}\n`);
fs.writeFileSync(path.join(outDir, `${page}.logic.txt`), logic);
if (asideJsx) fs.writeFileSync(path.join(outDir, `${page}.aside.txt`), asideJsx);
fs.writeFileSync(
  path.join(outDir, `${page}.view.tsx`),
  `/* eslint-disable */\n// Markup converted from design/canvas/${board}.dc.html. Keep the markup and class names as designed.\nimport { Fragment, type CSSProperties } from 'react';\nimport { Import, Shell } from '@gradeon/web-ui';\nimport './${page}.css';\n\nexport function ${page[0].toUpperCase() + page.slice(1)}View({ v }: { v: any }) {\n  return (\n${jsx}\n  );\n}\n`,
);
console.log(`${board} -> ${outDir}/${page}.{view.tsx,css,logic.txt}`);
