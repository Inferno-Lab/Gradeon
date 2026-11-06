import { crc32, inflateRawSync } from 'node:zlib';

/** A problem with what was sent, in words for the person who sent it (the APIs answer it as a 400, not a crash). */
export class ImportError extends Error { override name = 'ImportError'; }

/**
 * Reads CSV as Excel and other systems write it: quoted fields, doubled quotes, separators and line breaks inside quotes, a BOM,
 * and the semicolon some Excel settings use instead of a comma (whichever the header line has more of).
 */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^\uFEFF/, '');
  const end = s.search(/\r?\n/);
  const first = end < 0 ? s : s.slice(0, end);
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()));
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()));
  return rows;
}

/** Writes CSV that Excel opens correctly (BOM for UTF-8, quotes where needed, CRLF). */
export function toCsv(rows: string[][]): string {
  const q = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return `﻿${rows.map((r) => r.map(q).join(',')).join('\r\n')}\r\n`;
}

/** A ZIP of text files, stored without compression: every unzip tool opens it, and it needs nothing beyond node:zlib's crc32. */
export function zip(files: { name: string; content: string }[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const data = Buffer.from(f.content, 'utf8');
    const sum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10); local.writeUInt32LE(sum, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(20, 6); head.writeUInt16LE(0x0800, 8); head.writeUInt16LE(0, 10);
    head.writeUInt32LE(0, 12); head.writeUInt32LE(sum, 16); head.writeUInt32LE(data.length, 20); head.writeUInt32LE(data.length, 24);
    head.writeUInt16LE(name.length, 28); head.writeUInt32LE(offset, 42);
    parts.push(local, name, data);
    central.push(head, name);
    offset += local.length + name.length + data.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

/** The files inside a ZIP (an .xlsx is one), by name. Stored and deflated entries, which is all Excel and Sheets write. */
function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new ImportError('This file is not a spreadsheet Gradeon can read. Save it as .xlsx or .csv.');
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = buf.readUInt16LE(eocd + 10); i > 0; i--) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), n = buf.readUInt16LE(p + 28), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + n);
    const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const data = buf.subarray(start, start + size);
    out.set(name, method === 8 ? inflateRawSync(data) : data);
    p += 46 + n + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return out;
}

const unxml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&');
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/**
 * The first sheet of an .xlsx as rows of text, the way the sheet shows it: dates as 2012-04-18 and times as 08:00
 * (Excel stores both as numbers and only the cell's format says which), shared and inline strings, empty cells kept in place.
 */
export function readXlsx(buf: Buffer): string[][] {
  const files = unzip(buf);
  const text = (n: string) => files.get(n)?.toString('utf8') ?? '';
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unxml([...m[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  // Which formats are dates or times: Excel's built-in ids, and the school's own formats by their codes.
  const styles = text('xl/styles.xml');
  const custom = new Map([...styles.matchAll(/<numFmt\s[^>]*>/g)].map((m) => [Number(attr(m[0], 'numFmtId')), unxml(attr(m[0], 'formatCode') ?? '')]));
  const kindOf = (id: number) => {
    const code = (custom.get(id) ?? '').replace(/"[^"]*"|\[[^\]]*\]/g, '').toLowerCase();
    if ((id >= 14 && id <= 17) || id === 22 || /[dy]/.test(code)) return 'date';
    if ((id >= 18 && id <= 21) || (id >= 45 && id <= 47) || /h/.test(code)) return 'time';
    return '';
  };
  const xfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? '';
  const cellKind = [...xfs.matchAll(/<xf\s[^>]*>/g)].map((m) => kindOf(Number(attr(m[0], 'numFmtId') ?? 0)));
  // The first sheet in the workbook's order, through its relationship id.
  const rid = attr(/<sheet\s[^>]*>/.exec(text('xl/workbook.xml'))?.[0] ?? '', 'r:id');
  const rel = [...text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\s[^>]*>/g)].map((m) => m[0]).find((r) => attr(r, 'Id') === rid);
  const target = (attr(rel ?? '', 'Target') ?? 'worksheets/sheet1.xml').replace(/^\/?(xl\/)?/, '');
  const sheet = text(`xl/${target}`);
  const rows: string[][] = [];
  for (const r of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g)) {
    const row: string[] = [];
    for (const c of (r[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(c[0], 'r') ?? '';
      const col = ref ? [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1 : row.length;
      const t = attr(c[0], 't');
      const v = unxml(/<v>([\s\S]*?)<\/v>/.exec(c[2] ?? '')?.[1] ?? '');
      let value = t === 's' ? shared[Number(v)] ?? '' : t === 'inlineStr' ? unxml([...(c[2] ?? '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')) : t === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : v;
      const k = !t || t === 'n' ? cellKind[Number(attr(c[0], 's') ?? 0)] : '';
      if (k && value && !Number.isNaN(Number(value))) {
        const at = new Date(Date.UTC(1899, 11, 30) + Math.round(Number(value) * 86_400_000));
        value = k === 'date' ? at.toISOString().slice(0, 10) : at.toISOString().slice(11, 16);
      }
      while (row.length < col) row.push('');
      row[col] = value.trim();
    }
    if (row.some((x) => x !== '')) rows.push(row);
  }
  return rows;
}

/** What a school sent: CSV text, or a file as a data URL (an .xlsx, or a CSV the browser could not read as text). */
export function readTable(content: string): string[][] {
  const m = /^data:[^,]*;base64,/.exec(content);
  if (!m) return parseCsv(content);
  const buf = Buffer.from(content.slice(m[0].length), 'base64');
  if (buf.subarray(0, 2).toString('latin1') !== 'PK') return parseCsv(buf.toString('utf8'));
  try { return readXlsx(buf); } catch { throw new ImportError('This file is not a spreadsheet Gradeon can read. Save it as .xlsx or .csv.'); }
}
