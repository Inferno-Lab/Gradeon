import { Icon } from './Icon';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Pop } from './Menu';

// Colours are #RRGGBB, or #RRGGBBAA when see-through. Inside, the picker works in HSV so the square and the hue slider are exact.
interface Hsva { h: number; s: number; v: number; a: number }

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const hex2 = (x: number) => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0');

function rgbToHex(r: number, g: number, b: number, a = 1): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${a < 0.999 ? hex2(a * 255) : ''}`.toUpperCase();
}

function hexToRgba(hex: string): [number, number, number, number] {
  const h = hex.slice(1);
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
}

function hsvToRgb({ h, s, v }: Hsva): [number, number, number] {
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const [x, y, z] = [r / 255, g / 255, b / 255];
  const max = Math.max(x, y, z), d = max - Math.min(x, y, z);
  const h = d === 0 ? 0 : max === x ? ((y - z) / d) % 6 : max === y ? (z - x) / d + 2 : (x - y) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : d / max, v: max };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255; };
  return [f(0), f(8), f(4)];
}

function toHsl(hex: string): string {
  const [r, g, b] = hexToRgba(hex).map((x) => x / 255) as [number, number, number];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return `hsl(${Math.round((h * 60 + 360) % 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

const num = (t: string, scale: number) => (t.endsWith('%') ? (parseFloat(t) / 100) * scale : parseFloat(t));

/** Reads a colour typed any common way: #2F5BD3, 2f5bd3, #25D, rgb(47 91 211), rgba(47,91,211,.5), hsl(224 64% 51%). */
export function parseColour(text: string): string | null {
  const t = text.trim().toLowerCase();
  const h = t.replace(/^#/, '');
  if (/^[0-9a-f]{3,4}$/.test(h)) return parseColour(`#${[...h].map((c) => c + c).join('')}`);
  if (/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(h)) { const [r, g, b, a] = hexToRgba(`#${h}`); return rgbToHex(r, g, b, a); }
  const m = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(t);
  if (!m) return null;
  const parts = m[2]!.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.some((p) => Number.isNaN(parseFloat(p)))) return null;
  const alpha = parts[3] === undefined ? 1 : clamp(num(parts[3], 1));
  if (m[1]!.startsWith('rgb')) return rgbToHex(num(parts[0]!, 255), num(parts[1]!, 255), num(parts[2]!, 255), alpha);
  const [r, g, b] = hslToRgb(parseFloat(parts[0]!) % 360, clamp(num(parts[1]!, 1)), clamp(num(parts[2]!, 1)));
  return rgbToHex(r, g, b, alpha);
}

function fromHex(hex: string, keepHue = 0): Hsva {
  const [r, g, b, a] = hexToRgba(hex);
  const hsv = rgbToHsv(r, g, b);
  return { ...hsv, h: hsv.s === 0 ? keepHue : hsv.h, a };
}

const toHex = (c: Hsva) => { const [r, g, b] = hsvToRgb(c); return rgbToHex(r, g, b, c.a); };

interface EyeDropperCtor { new (): { open: () => Promise<{ sRGBHex: string }> } }

/** Any colour: drag in the square, slide hue and transparency, type hex, rgb() or hsl(), or pick from the screen. */
export function ColourPicker({ value, onChange, label, alpha = true }: { value: string; onChange: (hex: string) => void; label: string; alpha?: boolean }) {
  const [c, setC] = useState<Hsva>(() => fromHex(value));
  const [text, setText] = useState(value);
  const area = useRef<HTMLDivElement>(null);
  // Follow a value changed from outside, keeping the hue when the colour is grey (grey has no hue of its own).
  useEffect(() => { if (value.toUpperCase() !== toHex(c)) { setC((o) => fromHex(value, o.h)); setText(value); } }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const put = (n: Hsva) => { setC(n); const hex = toHex(n); setText(hex); onChange(hex); };
  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = area.current!.getBoundingClientRect();
    put({ ...c, s: clamp((e.clientX - r.left) / r.width), v: clamp(1 - (e.clientY - r.top) / r.height) });
  };
  const keys = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] } as Record<string, [number, number]>)[e.key];
    if (!d) return;
    e.preventDefault();
    put({ ...c, s: clamp(c.s + d[0]), v: clamp(c.v + d[1]) });
  };
  const commit = () => { const p = parseColour(text); if (p) put(alpha ? fromHex(p, c.h) : { ...fromHex(p, c.h), a: 1 }); else setText(toHex(c)); };
  const Dropper = (globalThis as { EyeDropper?: EyeDropperCtor }).EyeDropper;
  const hue = `hsl(${c.h} 100% 50%)`;
  const solid = toHex({ ...c, a: 1 });
  const [r, g, b] = hsvToRgb(c).map(Math.round);
  return (
    <div className="cpk">
      <div ref={area} className="cpk-sv" style={{ background: hue }} role="slider" tabIndex={0} aria-label={`${label}: saturation and brightness`}
        aria-valuetext={`${Math.round(c.s * 100)}% saturation, ${Math.round(c.v * 100)}% brightness`}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); fromPointer(e); }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e); }} onKeyDown={keys}>
        <i style={{ left: `${c.s * 100}%`, top: `${(1 - c.v) * 100}%`, background: solid }} />
      </div>
      <input className="cpk-hue" type="range" min={0} max={359} value={Math.round(c.h)} aria-label={`${label}: hue`} onChange={(e) => put({ ...c, h: Number(e.target.value) })} />
      {alpha && (
        <input className="cpk-alpha" type="range" min={0} max={100} value={Math.round(c.a * 100)} aria-label={`${label}: opacity`}
          style={{ '--cpk': solid } as React.CSSProperties} onChange={(e) => put({ ...c, a: Number(e.target.value) / 100 })} />
      )}
      <div className="cpk-row">
        <span className="cpk-chip" style={{ '--cpk': toHex(c) } as React.CSSProperties} aria-hidden="true" />
        <div className="inp sm cpk-in">
          <input value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
            aria-label={`${label}: hex, rgb() or hsl()`} spellCheck={false} placeholder="#2F5BD3, rgb(), hsl()" />
        </div>
        {Dropper && (
          <button type="button" className="mini" aria-label="Pick a colour from the screen" data-tip="Pick from the screen"
            onClick={() => void new Dropper().open().then((res) => put(fromHex(parseColour(res.sRGBHex) ?? toHex(c), c.h))).catch(() => undefined)}>
            <Icon name="edit" />
          </button>
        )}
      </div>
      <div className="cpk-out num">
        <span>rgb({r} {g} {b}{c.a < 1 ? ` / ${Math.round(c.a * 100)}%` : ''})</span>
        <span>{toHsl(toHex(c))}</span>
        {c.a < 1 && <span>{Math.round(c.a * 100)}% opaque</span>}
      </div>
    </div>
  );
}

/** A colour as a button that opens the picker. The value is #RRGGBB (or #RRGGBBAA when `alpha`). */
export function ColourField({ label, value, onChange, disabled, alpha = false, compact }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; alpha?: boolean; compact?: boolean }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button ref={btn} type="button" className={compact ? 'cpk-btn' : 'btn'} disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} aria-label={`${label}: ${value}`}>
        <span className="cpk-chip" style={{ '--cpk': value } as React.CSSProperties} />
        <code>{value}</code>
      </button>
      <Pop open={open} anchor={btn} onClose={() => setOpen(false)} label={label} minWidth={280}>
        <ColourPicker label={label} value={value} onChange={onChange} alpha={alpha} />
      </Pop>
    </>
  );
}
