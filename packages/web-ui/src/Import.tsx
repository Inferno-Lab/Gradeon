import type { Scene } from './illustrations/Illustration';
import { Illustration } from './illustrations/Illustration';

/** The canvas boards imported a mascot component. The mascot is gone; these stand in with the object illustrations. */
const FROM_MASCOT: Record<string, Scene> = { empty: 'register', notice: 'noticeboard', coin: 'receipt', book: 'notebooks', lost: 'search-paper', party: 'checklist', wave: 'calendar' };

export function Import({ name, scene }: { name: string; scene?: string }) {
  if (name === 'Nesti') return <Illustration scene={FROM_MASCOT[scene ?? ''] ?? 'register'} />;
  throw new Error(`Unknown import ${name}`);
}
