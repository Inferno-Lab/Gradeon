import type { ReactNode } from 'react';
import './illustrations.css';

export type Scene =
  | 'register' | 'noticeboard' | 'receipt' | 'notebooks' | 'search-paper' | 'checklist'
  | 'plug' | 'padlock' | 'torn-page' | 'envelope' | 'map-pin' | 'calendar';

/**
 * Spot illustrations drawn from real school objects. Flat shapes, one fine outline, brand colours that follow the theme.
 * No faces, characters or animals. Strokes draw in once; under Reduce Motion they are simply there.
 */
const D = (n: number) => ({ style: { ['--n' as string]: n } });

const SCENES: Record<Scene, ReactNode> = {
  register: (
    <>
      <ellipse className="il-shadow" cx="120" cy="176" rx="82" ry="9" />
      <path className="il-fill-card" d="M120 52c-18-12-44-14-72-8v108c28-6 54-4 72 8z" />
      <path className="il-fill-card" d="M120 52c18-12 44-14 72-8v108c-28-6-54-4-72 8z" />
      <path className="il-line il-draw" pathLength={1} {...D(0)} d="M120 52c-18-12-44-14-72-8v108c28-6 54-4 72 8 18-12 44-14 72-8V44c-28-6-54-4-72 8zM120 52v108" />
      <path className="il-faint il-draw" pathLength={1} {...D(1)} d="M62 68h44M62 84h44M62 100h44M62 116h44M134 68h44M134 84h44M134 100h44M134 116h44" />
      <rect className="il-fill-v" x="146" y="40" width="9" height="62" rx="4.5" transform="rotate(32 150 70)" />
      <path className="il-line il-draw" pathLength={1} {...D(2)} d="M165 96l-4 14 12-6z" transform="translate(6 -8)" />
    </>
  ),
  noticeboard: (
    <>
      <ellipse className="il-shadow" cx="120" cy="178" rx="80" ry="8" />
      <rect className="il-fill-sunk" x="42" y="38" width="156" height="116" rx="12" />
      <rect className="il-line il-draw" pathLength={1} {...D(0)} x="42" y="38" width="156" height="116" rx="12" />
      <path className="il-line il-draw" pathLength={1} {...D(1)} d="M70 154v22M170 154v22" />
      <rect className="il-fill-card" x="88" y="62" width="64" height="76" rx="7" transform="rotate(-3 120 100)" />
      <path className="il-line il-draw" pathLength={1} {...D(2)} d="M88 62h64v76H88z" transform="rotate(-3 120 100)" />
      <path className="il-faint il-draw" pathLength={1} {...D(3)} d="M99 86h42M99 98h42M99 110h26" transform="rotate(-3 120 100)" />
      <circle className="il-fill-c" cx="119" cy="66" r="6" />
      <path className="il-faint" d="M56 52h18M56 64h10M166 128h22M178 140h10" />
    </>
  ),
  receipt: (
    <>
      <ellipse className="il-shadow" cx="120" cy="178" rx="80" ry="8" />
      <rect className="il-fill-ink" x="58" y="40" width="124" height="52" rx="12" />
      <rect className="il-fill-a" x="72" y="52" width="50" height="10" rx="5" />
      <circle className="il-fill-g" cx="154" cy="57" r="5" />
      <rect className="il-slot" x="82" y="82" width="76" height="6" rx="3" />
      <path className="il-fill-card" d="M88 86h64v70l-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6z" />
      <path className="il-line il-draw" pathLength={1} {...D(1)} d="M88 86h64v70l-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6z" />
      <path className="il-faint il-draw" pathLength={1} {...D(2)} d="M100 102h40M100 114h40M100 126h22" />
      <path className="il-line il-draw" pathLength={1} {...D(3)} d="M130 128l5 5 10-11" />
    </>
  ),
  notebooks: (
    <>
      <ellipse className="il-shadow" cx="120" cy="178" rx="84" ry="9" />
      <rect className="il-fill-v" x="52" y="132" width="136" height="30" rx="7" />
      <rect className="il-fill-a" x="62" y="98" width="116" height="30" rx="7" />
      <rect className="il-fill-c" x="72" y="64" width="96" height="30" rx="7" />
      <path className="il-line il-draw" pathLength={1} {...D(0)} d="M52 139a7 7 0 0 1 7-7h122a7 7 0 0 1 7 7v16a7 7 0 0 1-7 7H59a7 7 0 0 1-7-7z" />
      <path className="il-line il-draw" pathLength={1} {...D(1)} d="M62 105a7 7 0 0 1 7-7h102a7 7 0 0 1 7 7v16a7 7 0 0 1-7 7H69a7 7 0 0 1-7-7z" />
      <path className="il-line il-draw" pathLength={1} {...D(2)} d="M72 71a7 7 0 0 1 7-7h82a7 7 0 0 1 7 7v16a7 7 0 0 1-7 7H79a7 7 0 0 1-7-7z" />
      <path className="il-faint-w" d="M72 147h20M82 113h20M92 79h20" />
      <rect className="il-fill-card" x="168" y="46" width="14" height="76" rx="3" transform="rotate(14 175 84)" />
      <path className="il-faint il-draw" pathLength={1} {...D(3)} d="M172 56l-2-1M170 66l-4-1M168 76l-2-1M166 86l-4-1" transform="rotate(14 175 84) translate(4 0)" />
    </>
  ),
  'search-paper': (
    <>
      <ellipse className="il-shadow" cx="112" cy="178" rx="74" ry="8" />
      <path className="il-fill-card" d="M52 36h82l26 26v100H52z" />
      <path className="il-line il-draw" pathLength={1} {...D(0)} d="M52 36h82l26 26v100H52zM134 36v26h26" />
      <path className="il-faint il-draw" pathLength={1} {...D(1)} d="M68 82h56M68 98h40M68 114h30M68 130h24" />
      <circle className="il-fill-glass" cx="148" cy="124" r="30" />
      <circle className="il-line il-draw" pathLength={1} {...D(2)} cx="148" cy="124" r="30" />
      <path className="il-line-v il-draw" pathLength={1} {...D(3)} d="M170 146l24 24" />
      <path className="il-faint" d="M138 118c3-6 10-8 16-5" />
    </>
  ),
  checklist: (
    <>
      <ellipse className="il-shadow" cx="120" cy="178" rx="76" ry="8" />
      <rect className="il-fill-card" x="62" y="34" width="116" height="136" rx="14" />
      <rect className="il-line il-draw" pathLength={1} {...D(0)} x="62" y="34" width="116" height="136" rx="14" />
      <rect className="il-fill-ink" x="96" y="24" width="48" height="20" rx="8" />
      <path className="il-line il-draw" pathLength={1} {...D(1)} d="M80 76l6 6 11-12M80 104l6 6 11-12M80 132l6 6 11-12" />
      <path className="il-faint il-draw" pathLength={1} {...D(2)} d="M110 76h46M110 104h46M110 132h30" />
      <circle className="il-fill-g" cx="168" cy="150" r="22" />
      <path className="il-line-w il-draw" pathLength={1} {...D(3)} d="M158 150l7 7 13-14" />
    </>
  ),
  plug: (
    <>
      <ellipse className="il-shadow" cx="120" cy="178" rx="84" ry="8" />
      <rect className="il-fill-card" x="152" y="78" width="54" height="64" rx="12" />
      <rect className="il-line il-draw" pathLength={1} {...D(0)} x="152" y="78" width="54" height="64" rx="12" />
      <path className="il-line il-draw" pathLength={1} {...D(1)} d="M166 100v8M192 100v8M175 126h6" />
      <rect className="il-fill-ink" x="62" y="92" width="52" height="36" rx="10" />
      <path className="il-line il-draw" pathLength={1} {...D(2)} d="M114 102h14M114 118h14" />
      <path className="il-line il-draw" pathLength={1} {...D(3)} d="M62 110H34c-12 0-12 28 0 28h20" />
      <path className="il-spark" d="M136 96l-8 14h10l-6 14" />
    </>
  ),
  padlock: (
    <>
      <ellipse className="il-shadow" cx="120" cy="178" rx="80" ry="8" />
      <path className="il-fill-sunk" d="M44 62a8 8 0 0 1 8-8h42l12 14h82a8 8 0 0 1 8 8v82a8 8 0 0 1-8 8H52a8 8 0 0 1-8-8z" />
      <path className="il-line il-draw" pathLength={1} {...D(0)} d="M44 62a8 8 0 0 1 8-8h42l12 14h82a8 8 0 0 1 8 8v82a8 8 0 0 1-8 8H52a8 8 0 0 1-8-8z" />
      <path className="il-line il-draw" pathLength={1} {...D(1)} d="M104 112v-8a16 16 0 0 1 32 0v8" />
      <rect className="il-fill-v" x="92" y="110" width="56" height="42" rx="10" />
      <rect className="il-line il-draw" pathLength={1} {...D(2)} x="92" y="110" width="56" height="42" rx="10" />
      <circle className="il-fill-card" cx="120" cy="128" r="5" />
      <path className="il-line-w" d="M120 133v8" />
    </>
  ),
  'torn-page': (
    <>
      <ellipse className="il-shadow" cx="120" cy="178" rx="84" ry="8" />
      <path className="il-fill-card" d="M44 40h64l-6 22 10 14-8 18 10 16-6 20H44z" />
      <path className="il-fill-card" d="M126 40h70v124h-72l8-22-10-14 8-16-10-14z" transform="rotate(4 160 100) translate(6 4)" />
      <path className="il-line il-draw" pathLength={1} {...D(0)} d="M108 40H44v124h64l-6-20 10-16-10-18 8-14-10-14z" />
      <path className="il-line il-draw" pathLength={1} {...D(1)} d="M126 40h70v124h-72l8-22-10-14 8-16-10-14z" transform="rotate(4 160 100) translate(6 4)" />
      <path className="il-faint il-draw" pathLength={1} {...D(2)} d="M58 70h34M58 86h28M58 102h20" />
      <path className="il-faint il-draw" pathLength={1} {...D(3)} d="M150 78h30M150 94h38" transform="rotate(4 160 100) translate(6 4)" />
      <circle className="il-fill-a" cx="176" cy="132" r="9" />
    </>
  ),
  envelope: (
    <>
      <ellipse className="il-shadow" cx="120" cy="178" rx="80" ry="8" />
      <rect className="il-fill-card" x="40" y="64" width="160" height="104" rx="12" />
      <path className="il-fill-sunk" d="M40 76a12 12 0 0 1 12-12h136a12 12 0 0 1 12 12l-80 54z" />
      <path className="il-line il-draw" pathLength={1} {...D(0)} d="M52 64h136a12 12 0 0 1 12 12v80a12 12 0 0 1-12 12H52a12 12 0 0 1-12-12V76a12 12 0 0 1 12-12zM42 74l78 58 78-58" />
      <circle className="il-fill-c" cx="120" cy="132" r="19" />
      <path className="il-line-w il-draw" pathLength={1} {...D(1)} d="M111 132l6 6 12-13" />
      <path className="il-spark il-draw" pathLength={1} {...D(2)} d="M186 38v14M179 45h14M60 40v10M55 45h10" />
    </>
  ),
  'map-pin': (
    <>
      <ellipse className="il-shadow" cx="120" cy="178" rx="84" ry="8" />
      <path className="il-fill-sunk" d="M30 70l56-18 68 22 56-18v92l-56 18-68-22-56 18z" />
      <path className="il-line il-draw" pathLength={1} {...D(0)} d="M30 70l56-18 68 22 56-18v92l-56 18-68-22-56 18zM86 52v92M154 74v92" />
      <path className="il-faint il-draw" pathLength={1} {...D(1)} d="M44 120l30-10M100 98l40 14M168 118l20-6" />
      <path className="il-fill-v" d="M120 38a26 26 0 0 0-26 26c0 22 26 48 26 48s26-26 26-48a26 26 0 0 0-26-26z" />
      <path className="il-line il-draw" pathLength={1} {...D(2)} d="M120 38a26 26 0 0 0-26 26c0 22 26 48 26 48s26-26 26-48a26 26 0 0 0-26-26z" />
      <circle className="il-fill-card" cx="120" cy="64" r="9" />
    </>
  ),
  calendar: (
    <>
      <ellipse className="il-shadow" cx="120" cy="178" rx="82" ry="8" />
      <rect className="il-fill-card" x="44" y="46" width="114" height="112" rx="14" />
      <path className="il-fill-v" d="M44 60a14 14 0 0 1 14-14h86a14 14 0 0 1 14 14v18H44z" />
      <rect className="il-line il-draw" pathLength={1} {...D(0)} x="44" y="46" width="114" height="112" rx="14" />
      <path className="il-line il-draw" pathLength={1} {...D(1)} d="M70 36v20M132 36v20" />
      <path className="il-faint il-draw" pathLength={1} {...D(2)} d="M62 98h16M92 98h16M122 98h16M62 118h16M92 118h16M62 138h16" />
      <rect className="il-fill-a" x="120" y="108" width="22" height="20" rx="6" />
      <rect className="il-fill-card" x="138" y="104" width="62" height="48" rx="10" />
      <rect className="il-line il-draw" pathLength={1} {...D(3)} x="138" y="104" width="62" height="48" rx="10" />
      <path className="il-faint il-draw" pathLength={1} {...D(3)} d="M148 120h42M148 132h26" />
    </>
  ),
};

export function Illustration({ scene, size, label }: { scene: Scene; size?: number | string; label?: string }) {
  return (
    <svg className="il" viewBox="0 0 240 200" width={size} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} preserveAspectRatio="xMidYMid meet">
      {SCENES[scene]}
    </svg>
  );
}
