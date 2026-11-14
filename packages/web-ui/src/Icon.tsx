import type { CSSProperties } from 'react';
import { GLYPH, IC, ICON_SIZE, UI } from './icons';

export type PageIcon = keyof typeof IC;
export type IconName = PageIcon | keyof typeof UI | keyof typeof GLYPH;

/**
 * Every icon in the admin and the console (Tangent Hue, design/hue/icon-map.mjs): one meaning, one icon. A page icon is
 * filled when its page is the one open (`on`); everyday icons turn bold at 16 px and under; small symbols are always bold.
 */
export function Icon({ name, size = ICON_SIZE.m, on, className, style }: { name: IconName; size?: number; on?: boolean; className?: string; style?: CSSProperties }) {
  const d = name in GLYPH ? GLYPH[name as keyof typeof GLYPH] : name in UI ? UI[name as keyof typeof UI][size <= ICON_SIZE.s ? 'b' : 'r'] : IC[name as PageIcon][on ? 'f' : 'r'];
  return (
    <svg className={`ic ${className ?? ''}`} viewBox="0 0 256 256" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false" style={style}>
      <path d={d} />
    </svg>
  );
}
