import { useEffect, useState, type CSSProperties } from 'react';
import type { Digit } from './digits';

const STRIP = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** A number whose digits roll to their value: up from zero when it first appears, and on to each new value. */
export function Roll({ digits }: { digits: Digit[] }) {
  const [shown, setShown] = useState(false);
  useEffect(() => { const f = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(f); }, []);
  return (
    <span className="roll">
      {digits.map((d, i) =>
        d.isD ? (
          <span className="dg" key={i}>
            <span className="strip" style={{ transform: `translateY(-${shown ? d.y : 0}em)` } as CSSProperties}>
              {STRIP.map((n) => (
                <span key={n}>{n}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={i}>{d.c}</span>
        ),
      )}
    </span>
  );
}
