import { useState, type ReactNode } from 'react';

/**
 * A long list the page already holds shows a page of it at a time: the rows to draw, and the "Show more" button that goes
 * under them (null once everything is shown). Lists the server pages use Previous and Next instead.
 */
export function useMore<T>(items: readonly T[], step = 20): [T[], ReactNode] {
  const [n, setN] = useState(step);
  const left = items.length - n;
  const more = left > 0
    ? <button type="button" className="more" onClick={() => setN(n + step)}>Show {Math.min(step, left)} more<small>{left} not shown</small></button>
    : null;
  return [items.slice(0, n), more];
}
