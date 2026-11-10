/**
 * A one-page A4 PDF of text lines, for receipts and report cards: about forty lines instead of a PDF library. Helvetica only,
 * so text is kept to Latin-1 (₹ becomes "Rs."). ponytail: one page, no images; reach for a library when a layout needs more.
 */
export interface PdfLine { text: string; right?: string; size?: number; bold?: boolean; gap?: number; rule?: boolean }

const latin = (s: string) => s.replace(/₹\s?/g, 'Rs. ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\xFF]/g, '?');
const str = (s: string) => `(${latin(s).replace(/[\\()]/g, (c) => `\\${c}`)})`;

export function pdf(lines: PdfLine[]): Buffer {
  const ops: string[] = [];
  let y = 790;
  for (const l of lines) {
    const size = l.size ?? 11;
    y -= l.gap ?? Math.round(size * 1.5);
    if (y < 40) break;
    if (l.rule) { ops.push(`0.6 w 50 ${y + size} m 545 ${y + size} l S`); continue; }
    const font = l.bold ? '/F2' : '/F1';
    ops.push(`BT ${font} ${size} Tf 50 ${y} Td ${str(l.text)} Tj ET`);
    // Helvetica's average width is about half the size: close enough to right-align short amounts.
    if (l.right) ops.push(`BT ${font} ${size} Tf ${Math.round(545 - latin(l.right).length * size * 0.52)} ${y} Td ${str(l.right)} Tj ET`);
  }
  const content = ops.join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
