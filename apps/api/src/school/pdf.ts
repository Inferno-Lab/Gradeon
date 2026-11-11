import 'regenerator-runtime/runtime.js';
import { readFileSync } from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

/**
 * A4 PDFs of lines for receipts and report cards: the school's logo, its name, then the facts, over as many pages as they take.
 * Text is set in Noto Sans with Noto Sans Devanagari for Hindi and Marathi (shaped by fontkit: conjuncts, reph and matras come
 * out right), so ₹ and every family's name print as written. The fonts are vendored in assets/fonts (SIL Open Font License).
 */
export interface PdfLine { text: string; right?: string; size?: number; bold?: boolean; gap?: number; rule?: boolean }

const FONTS = new URL('../../assets/fonts/', import.meta.url);
const files = {
  latin: readFileSync(new URL('NotoSans_400Regular.ttf', FONTS)), latinBold: readFileSync(new URL('NotoSans_700Bold.ttf', FONTS)),
  deva: readFileSync(new URL('NotoSansDevanagari_400Regular.ttf', FONTS)), devaBold: readFileSync(new URL('NotoSansDevanagari_700Bold.ttf', FONTS)),
};

const DEVANAGARI = /[ऀ-ॿ꣠-ꣿ᳐-᳿]/;
/** Runs of text in one script (spaces and digits stay with the run they are in), so each run gets the font that has its letters. */
function runs(text: string): { text: string; deva: boolean }[] {
  const out: { text: string; deva: boolean }[] = [];
  for (const ch of text) {
    const deva = DEVANAGARI.test(ch);
    const last = out[out.length - 1];
    if (last && (last.deva === deva || /[\s\d.,:()/-]/.test(ch))) last.text += ch;
    else out.push({ text: ch, deva });
  }
  return out;
}

const MARGIN = 50;
const WIDTH = 595;
const HEIGHT = 842;

export async function pdf(lines: PdfLine[], opts: { logo?: Buffer | null } = {}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const f = {
    latin: await doc.embedFont(files.latin, { subset: true }), latinBold: await doc.embedFont(files.latinBold, { subset: true }),
    deva: await doc.embedFont(files.deva, { subset: true }), devaBold: await doc.embedFont(files.devaBold, { subset: true }),
  };
  const font = (deva: boolean, bold?: boolean): PDFFont => (deva ? (bold ? f.devaBold : f.deva) : bold ? f.latinBold : f.latin);
  const width = (text: string, size: number, bold?: boolean) => runs(text).reduce((w, r) => w + font(r.deva, bold).widthOfTextAtSize(r.text, size), 0);
  const draw = (page: PDFPage, text: string, x: number, y: number, size: number, bold?: boolean) => {
    for (const r of runs(text)) {
      page.drawText(r.text, { x, y, size, font: font(r.deva, bold), color: rgb(0.11, 0.11, 0.13) });
      x += font(r.deva, bold).widthOfTextAtSize(r.text, size);
    }
  };
  // Words that do not fit beside the right-hand value wrap onto the next line.
  const wrap = (text: string, size: number, room: number, bold?: boolean): string[] => {
    const out: string[] = [];
    let cur = '';
    for (const word of text.split(' ')) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && width(next, size, bold) > room) { out.push(cur); cur = word; } else cur = next;
    }
    return [...out, cur];
  };

  let page = doc.addPage([WIDTH, HEIGHT]);
  let y = HEIGHT - MARGIN;
  if (opts.logo) {
    const img = await (opts.logo[0] === 0x89 ? doc.embedPng(opts.logo) : doc.embedJpg(opts.logo)).catch(() => null);
    if (img) {
      const s = 56 / Math.max(img.width, img.height);
      page.drawImage(img, { x: WIDTH - MARGIN - img.width * s, y: y - img.height * s + 8, width: img.width * s, height: img.height * s });
    }
  }
  for (const l of lines) {
    const size = l.size ?? 11;
    const room = WIDTH - 2 * MARGIN - (l.right ? width(l.right, size, l.bold) + 16 : 0);
    const parts = l.rule ? [''] : wrap(l.text, size, room, l.bold);
    const need = (l.gap ?? Math.round(size * 1.5)) + (parts.length - 1) * size * 1.35;
    if (y - need < MARGIN) { page = doc.addPage([WIDTH, HEIGHT]); y = HEIGHT - MARGIN; }
    y -= l.gap ?? Math.round(size * 1.5);
    if (l.rule) { page.drawLine({ start: { x: MARGIN, y: y + size }, end: { x: WIDTH - MARGIN, y: y + size }, thickness: 0.6, color: rgb(0.7, 0.7, 0.74) }); continue; }
    parts.forEach((p, i) => draw(page, p, MARGIN, y - i * size * 1.35, size, l.bold));
    if (l.right) draw(page, l.right, WIDTH - MARGIN - width(l.right, size, l.bold), y, size, l.bold);
    y -= (parts.length - 1) * size * 1.35;
  }
  const pages = doc.getPages();
  if (pages.length > 1) pages.forEach((p, i) => p.drawText(`${i + 1} / ${pages.length}`, { x: WIDTH / 2 - 10, y: 24, size: 8, font: f.latin, color: rgb(0.5, 0.5, 0.55) }));
  return Buffer.from(await doc.save());
}
