import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Select } from './Select';

/** A counter that flips between two classes, so the same error can vibrate again each time it is hit. */
export function useShake(): { cls: string; hit: () => void } {
  const [n, setN] = useState(0);
  return { cls: n ? `shk${n}` : '', hit: () => setN((x) => (x === 1 ? 2 : 1)) };
}

const WARN = 'M12 3.5l9 15.5H3zM12 10v4M12 16.5h.01';

export function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <div className="emsg" role="alert">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d={WARN}></path></svg>
      {children}
    </div>
  );
}

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type'> {
  /** Text-like only: dates, times, numbers, colours, ticks and files have their own fields (DateField, TimeField…). */
  type?: 'text' | 'email' | 'tel' | 'password' | 'search' | 'url';
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  icon?: string;
}

/** A labelled input. The error turns it red, makes it vibrate, and says what to do. */
export function Field({ label, value, onChange, error, hint, icon, ...rest }: FieldProps) {
  const id = useId();
  return (
    <div className="fld">
      <label htmlFor={id}>{label}</label>
      <div className={`inp ${error ? 'err shake' : ''}`}>
        {icon && <svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d={icon}></path></svg>}
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} aria-describedby={error || hint ? `${id}-m` : undefined} {...rest} />
      </div>
      {error ? <div id={`${id}-m`}><ErrorLine>{error}</ErrorLine></div> : hint ? <div id={`${id}-m`} className="help">{hint}</div> : null}
    </div>
  );
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  error?: string;
  disabled?: boolean;
}

export function SelectField({ label, value, onChange, options, error, disabled }: SelectProps) {
  const id = useId();
  return (
    <div className="fld">
      <label htmlFor={id}>{label}</label>
      <Select id={id} value={value} onChange={onChange} options={options} invalid={!!error} disabled={disabled} className={error ? 'shake' : ''} />
      {error && <ErrorLine>{error}</ErrorLine>}
    </div>
  );
}

/** A multi-line input in the same box as Field: notes, reasons, answers. */
export function AreaField({ label, value, onChange, error, hint, rows = 4, ...rest }: { label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string; rows?: number; maxLength?: number; placeholder?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="fld">
      <label htmlFor={id}>{label}</label>
      <div className={`inp ${error ? 'err shake' : ''}`} style={{ height: 'auto', alignItems: 'stretch' }}>
        <textarea id={id} className="ta" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} style={{ padding: '12px 0', resize: 'vertical', width: '100%', font: '500 15px/1.5 var(--fb)' }} {...rest} />
      </div>
      {error ? <div className="emsg" role="alert">{error}</div> : hint ? <div className="help">{hint}</div> : null}
    </div>
  );
}
