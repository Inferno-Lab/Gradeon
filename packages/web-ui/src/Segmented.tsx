import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number | string;
  /** The count chip's tone, like `a` for something waiting. */
  countTone?: string;
}

/**
 * Tabs and view switches: a pill track with a white knob that glides under the chosen option. The knob is measured from
 * the real tab (after fonts load and on every resize), so its size is never guessed.
 */
export function Segmented<T extends string>({ value, onChange, options, label, className, style }: { value: T; onChange: (v: T) => void; options: SegmentOption<T>[]; label: string; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 4, w: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const b = ref.current?.querySelector<HTMLElement>('button.on');
      if (!b) return;
      setKnob({ x: b.offsetLeft, w: b.offsetWidth });
      // A row of tabs wider than its space scrolls; keep the chosen one in view.
      const s = ref.current!;
      if (b.offsetLeft < s.scrollLeft || b.offsetLeft + b.offsetWidth > s.scrollLeft + s.clientWidth) s.scrollLeft = b.offsetLeft - 4;
      edges();
    };
    // The cut edge fades, so a row that scrolls says there is more.
    const edges = () => {
      const s = ref.current;
      if (!s) return;
      s.toggleAttribute('data-more-r', s.scrollLeft + s.clientWidth < s.scrollWidth - 1);
      s.toggleAttribute('data-more-l', s.scrollLeft > 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(ref.current!);
    ref.current?.querySelectorAll('button').forEach((b) => ro.observe(b));
    ref.current?.addEventListener('scroll', edges, { passive: true });
    void document.fonts?.ready.then(measure);
    const el = ref.current;
    return () => { ro.disconnect(); el?.removeEventListener('scroll', edges); };
  }, [value, options.length]);
  return (
    <div className={`seg ${className ?? ''}`} style={style} ref={ref} role="tablist" aria-label={label}>
      <span className="kn" style={{ transform: `translateX(${knob.x}px)`, width: knob.w }} aria-hidden="true"></span>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count != null && <span className={`chip ${o.countTone ?? ''}`} style={{ height: 22, padding: '0 8px' }}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
