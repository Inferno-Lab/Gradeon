// Phosphor glyph outlines as SVG path data, read straight from the TTFs the Flutter app already ships.
import fs from 'node:fs';
const PKG = new URL('../../packages/phosphor_flutter/lib', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const codes = Object.fromEntries([...fs.readFileSync(`${PKG}/src/phosphor_icons_regular.dart`, 'utf8').matchAll(/static const (\w+) = IconData\((0x[0-9a-f]+)/g)].map((m) => [m[1], +m[2]]));

function font(file) {
  const b = fs.readFileSync(file), t = {};
  for (let i = 0, n = b.readUInt16BE(4); i < n; i++) { const o = 12 + i * 16; t[b.toString('latin1', o, o + 4)] = b.readUInt32BE(o + 8); }
  const upm = b.readUInt16BE(t.head + 18), long = b.readInt16BE(t.head + 50), asc = b.readInt16BE(t.hhea + 4);
  // cmap: format 12 if present, else format 4
  const cmap = new Map();
  for (let i = 0, n = b.readUInt16BE(t.cmap + 2); i < n; i++) {
    const s = t.cmap + b.readUInt32BE(t.cmap + 4 + i * 8 + 4), f = b.readUInt16BE(s);
    if (f === 12) for (let g = 0, ng = b.readUInt32BE(s + 12); g < ng; g++) { const o = s + 16 + g * 12, a = b.readUInt32BE(o), z = b.readUInt32BE(o + 4), id = b.readUInt32BE(o + 8); for (let c = a; c <= z; c++) cmap.set(c, id + c - a); }
    if (f === 4) { const sc = b.readUInt16BE(s + 6) / 2, E = s + 14, S = E + sc * 2 + 2, D = S + sc * 2, R = D + sc * 2;
      for (let k = 0; k < sc; k++) { const e = b.readUInt16BE(E + k * 2), st = b.readUInt16BE(S + k * 2), d = b.readInt16BE(D + k * 2), r = b.readUInt16BE(R + k * 2);
        for (let c = st; c <= e && c < 0xffff; c++) { if (cmap.has(c)) continue; const g = r ? b.readUInt16BE(R + k * 2 + r + (c - st) * 2) : c; cmap.set(c, r ? (g ? (g + d) & 0xffff : 0) : (c + d) & 0xffff); } } }
  }
  const loc = (g) => t.glyf + (long ? b.readUInt32BE(t.loca + g * 4) : b.readUInt16BE(t.loca + g * 2) * 2);
  function contours(g, depth = 0) {
    const o = loc(g); if (loc(g + 1) === o || depth > 4) return [];
    const nc = b.readInt16BE(o); let p = o + 10;
    if (nc < 0) { const out = [];
      for (;;) { const fl = b.readUInt16BE(p), gi = b.readUInt16BE(p + 2); p += 4; let dx, dy;
        if (fl & 1) { dx = b.readInt16BE(p); dy = b.readInt16BE(p + 2); p += 4; } else { dx = b.readInt8(p); dy = b.readInt8(p + 1); p += 2; }
        let a = 1, bb = 0, c = 0, d = 1; const f2 = () => { const v = b.readInt16BE(p) / 16384; p += 2; return v; };
        if (fl & 8) a = d = f2(); else if (fl & 0x40) { a = f2(); d = f2(); } else if (fl & 0x80) { a = f2(); bb = f2(); c = f2(); d = f2(); }
        for (const ct of contours(gi, depth + 1)) out.push(ct.map((q) => ({ x: a * q.x + c * q.y + dx, y: bb * q.x + d * q.y + dy, on: q.on })));
        if (!(fl & 0x20)) break; }
      return out; }
    const ends = []; for (let i = 0; i < nc; i++) { ends.push(b.readUInt16BE(p)); p += 2; }
    p += 2 + b.readUInt16BE(p); const n = ends[nc - 1] + 1, flags = [];
    while (flags.length < n) { const f = b[p++]; flags.push(f); if (f & 8) for (let r = b[p++]; r > 0; r--) flags.push(f); }
    const xs = [], ys = []; let v = 0;
    for (const f of flags) { if (f & 2) { const d = b[p++]; v += f & 16 ? d : -d; } else if (!(f & 16)) { v += b.readInt16BE(p); p += 2; } xs.push(v); }
    v = 0; for (const f of flags) { if (f & 4) { const d = b[p++]; v += f & 32 ? d : -d; } else if (!(f & 32)) { v += b.readInt16BE(p); p += 2; } ys.push(v); }
    const out = []; let s = 0; for (const e of ends) { const ct = []; for (let i = s; i <= e; i++) ct.push({ x: xs[i], y: ys[i], on: !!(flags[i] & 1) }); out.push(ct); s = e + 1; }
    return out;
  }
  return (cp) => {
    const g = cmap.get(cp); if (g == null) return null; const k = 256 / upm, r = (v) => +(v * k).toFixed(1), X = (q) => r(q.x), Y = (q) => r(asc - q.y); let d = '';
    for (const ct of contours(g)) { if (ct.length < 2) continue; const mid = (a, c) => ({ x: (a.x + c.x) / 2, y: (a.y + c.y) / 2, on: true });
      let pts = ct; const first = pts.findIndex((q) => q.on);
      if (first > 0) pts = [...pts.slice(first), ...pts.slice(0, first)]; else if (first < 0) pts = [mid(pts[0], pts[pts.length - 1]), ...pts];
      d += `M${X(pts[0])} ${Y(pts[0])}`;
      for (let i = 1; i <= pts.length; i++) { const q = pts[i % pts.length];
        if (q.on) { if (i < pts.length) d += `L${X(q)} ${Y(q)}`; }
        else { const nx = pts[(i + 1) % pts.length], end = nx.on ? nx : mid(q, nx); d += `Q${X(q)} ${Y(q)} ${X(end)} ${Y(end)}`; if (nx.on) i++; } }
      d += 'Z'; }
    return d;
  };
}
const reg = font(`${PKG}/fonts/Phosphor.ttf`), fill = font(`${PKG}/fonts/Phosphor-Fill.ttf`), bold = font(`${PKG}/fonts/Phosphor-Bold.ttf`);
const camel = (n) => n.replace(/-(\w)/g, (_, c) => c.toUpperCase());
export function iconPath(name, kind = 'r') {
  const cp = codes[camel(name)]; if (!cp) throw new Error(`no Phosphor icon "${name}"`);
  const d = (kind === 'f' ? fill : kind === 'b' ? bold : reg)(cp); if (!d) throw new Error(`no glyph for "${name}"`); return d;
}
export const iconNames = Object.keys(codes);
