import { useEffect, useLayoutEffect, useRef } from 'react';
import { SCENE_CSS, SCENES } from './scenes';

export type EmptyScene = keyof typeof SCENES;

// Inside the scene's own style scope the kit's text colours are the page's ink (on the web --t1..--t3 are motion timings).
const HOST = ':host{display:block;--t1:var(--ink);--t2:var(--ink2);--t3:var(--ink3);--shadow:var(--sh2)}.hue{background:none;font-family:var(--fb)}.nolink .lk,.noact .acts .btn{display:none!important}';

/**
 * A page with nothing in it yet (Gradeon Hue, design/hue/EMPTY-STATES.md): the approved composition for that page, its words
 * and one main button, with the scene moving in a 10 s loop (still under reduced motion). Show it only when the data is truly
 * empty: loading, errors and a filter with no match keep their own states. Without `onAction` (no permission) the button is
 * left out; `label` renames it where this product's next step differs from the board's.
 */
export function EmptyState({ scene, onAction, onLink, label }: { scene: EmptyScene; onAction?: () => void; onLink?: () => void; label?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const act = useRef({ onAction, onLink });
  act.current = { onAction, onLink };
  useLayoutEffect(() => {
    const el = host.current!;
    const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${SCENE_CSS}${HOST}</style><div class="hue${onLink ? '' : ' nolink'}${onAction ? '' : ' noact'}">${SCENES[scene]}</div>`;
    const btn = root.querySelector('.acts .btn');
    if (label && btn) btn.textContent = label;
  }, [scene, !onLink, !onAction, label]);
  useEffect(() => {
    const root = host.current!.shadowRoot!;
    const click = (e: Event) => {
      const t = (e.target as Element).closest('.btn, .lk');
      if (!t) return;
      e.preventDefault();
      if (t.classList.contains('lk')) act.current.onLink?.(); else act.current.onAction?.();
    };
    root.addEventListener('click', click);
    return () => root.removeEventListener('click', click);
  }, []);
  return <div ref={host} className="es-host" />;
}
