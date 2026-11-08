import { useState } from 'react';
import { Dialog, EmptyCard, ErrorLine, Field, Illustration, IC, SelectField, PageScope, Toast, tintFor, useShake, type Scene } from '@gradeon/web-ui';
import { useShellChrome } from '../app/Layout';

const SCENES: Scene[] = ['register', 'noticeboard', 'receipt', 'notebooks', 'search-paper', 'checklist', 'plug', 'padlock', 'torn-page', 'envelope', 'map-pin', 'calendar'];
const SWATCHES: [string, string][] = [['Accent (blue)', '--v'], ['Warning (amber)', '--a'], ['Good (green)', '--g'], ['Bad (red)', '--r'], ['Ink', '--ink'], ['Ink 3', '--ink3'], ['Field border', '--field'], ['Present', '--present']];
const CHIPS = ['', 'v', 'c', 'a', 'g', 'b', 'r'] as const;

/** A living style guide built from the real components, so it can never drift from what the pages use. Open it at /design. */
export function DesignPage() {
  const chrome = useShellChrome();
  const [on, setOn] = useState(true);
  const [seg, setSeg] = useState(0);
  const [dlg, setDlg] = useState(false);
  const [toast, setToast] = useState(false);
  const [name, setName] = useState('');
  const shake = useShake();
  return (
    <PageScope page="design" overlays={<>{toast && <Toast text="Saved. The app updates within a minute." />}{dlg && <Dialog title="Erase this draft?" tag={{ text: 'Cannot be undone', tone: 'r' }} onClose={() => setDlg(false)} width={440}><p>The draft and everything typed into it are removed.</p><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}><button className="btn" onClick={() => setDlg(false)}>Keep it</button><button className="btn dngf" onClick={() => setDlg(false)}>Erase</button></div></Dialog>}</>}>
      <main className="mn">
        <header className="hd rise"><div><h1>Design system</h1><p>The pieces every admin and console page is made of.</p></div><span className="grow"></span><button className="btn" onClick={chrome.openSearch}>Search</button></header>

        <Section title="Colour">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
            {SWATCHES.map(([n, v]) => (
              <div key={v}><div style={{ height: 64, borderRadius: 18, background: `var(${v})`, boxShadow: 'inset 0 0 0 1px var(--line)' }} /><b style={{ font: '700 13px var(--fb)', display: 'block', marginTop: 6 }}>{n}</b><small style={{ color: 'var(--ink3)', font: '600 12px var(--fb)' }}>{v}</small></div>
            ))}
          </div>
        </Section>

        <Section title="Type">
          <div className="fd" style={{ fontSize: 44, letterSpacing: '-.04em', lineHeight: 1 }}>Bricolage Grotesque, for headings and numbers</div>
          <p style={{ font: '500 16px/1.6 var(--fb)', color: 'var(--ink2)', maxWidth: 640 }}>Manrope carries every label, row and paragraph. It stays clear at small sizes and keeps numbers aligned, which matters for fees and attendance.</p>
          <div className="num" style={{ font: '700 34px var(--fd)' }}>1,498 · ₹18.4L · 94.2%</div>
        </Section>

        <Section title="Buttons and chips">
          <div className="tgrow">
            <button className="btn pri">Primary</button><button className="btn v">Accent</button><button className="btn">Plain</button><button className="btn ghost">Ghost</button><button className="btn dng">Danger</button><button className="btn" disabled>Disabled</button>
            <button className="btn pri sm">Small</button><button className="btn"><span className="spin" aria-hidden="true"></span>Working</button>
          </div>
          <div className="tgrow" style={{ marginTop: 16 }}>{CHIPS.map((c) => <span key={c} className={`chip ${c}`}>{c || 'plain'}</span>)}</div>
        </Section>

        <Section title="Inputs, errors and switches">
          <div className="two" style={{ maxWidth: 720 }}>
            <div className={shake.cls}><Field label="School name" value={name} onChange={setName} placeholder="Banyan Ridge School" error={name === 'x' ? 'Enter the school’s full name' : undefined} hint="Press the button to see the error vibrate" icon={IC.adm} /></div>
            <SelectField label="Board" value="CBSE" onChange={() => undefined} options={['CBSE', 'ICSE', 'State'].map((v) => ({ value: v, label: v }))} />
          </div>
          <div className="tgrow" style={{ marginTop: 14 }}>
            <button className="btn" onClick={() => { setName('x'); shake.hit(); }}>Make it vibrate</button>
            <button className={`sw ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label="Example switch" onClick={() => setOn(!on)}></button>
            <div className="seg"><span className="kn" style={{ width: 84, transform: `translateX(${seg * 84 + 4}px)` }}></span>{['Week', 'Day', 'List'].map((t, i) => <button key={t} className={i === seg ? 'on' : ''} style={{ width: 84, padding: 0, justifyContent: 'center' }} onClick={() => setSeg(i)}>{t}</button>)}</div>
          </div>
          <div style={{ marginTop: 14 }}><ErrorLine>This is what an error line looks like.</ErrorLine></div>
        </Section>

        <Section title="Tiles and bars">
          <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {(['t-v', 't-a', 't-g', 't-i', 't-l', 't-p'] as const).map((t) => <div key={t} className={`tile ${t}`} style={{ minHeight: 120 }}><b className="fd" style={{ fontSize: 22 }}>{t}</b><div style={{ font: '600 13px var(--fb)', opacity: .7 }}>A tile</div></div>)}
          </div>
          <div style={{ display: 'grid', gap: 10, marginTop: 18, maxWidth: 520 }}>
            {[78, 52, 31].map((w) => <div key={w} style={{ height: 22, borderRadius: 11, background: 'var(--sunk)', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${w}%`, borderRadius: 11, background: 'var(--v)' }} /></div>)}
          </div>
          <div className="tgrow" style={{ marginTop: 18 }}>{['Riya Mehta', 'Kabir Singh', 'Meera Nair', 'Kavita Iyer'].map((n) => { const t = tintFor(n); return <span key={n} className="av" style={{ background: t.bg, color: t.fg, width: 44, height: 44, display: "grid", placeItems: "center" }}>{n.split(' ').map((w) => w[0]).join('')}</span>; })}</div>
        </Section>

        <Section title="Overlays">
          <div className="tgrow"><button className="btn" onClick={() => setDlg(true)}>Open a dialog</button><button className="btn" onClick={() => { setToast(true); setTimeout(() => setToast(false), 3200); }}>Show a toast</button></div>
        </Section>

        <Section title="Illustrations">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
            {SCENES.map((s) => <div key={s} className="card" style={{ textAlign: 'center' }}><div style={{ width: 120, margin: '0 auto' }}><Illustration scene={s} /></div><small style={{ color: 'var(--ink3)', font: '700 12px var(--fb)' }}>{s}</small></div>)}
          </div>
        </Section>

        <Section title="Empty and error states">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
            <EmptyCard title="Students" chip={{ text: '0 students', tone: 'v' }} scene="register" heading="No students yet" body="Add the first student, or import the whole school from a sheet." actions={<button className="btn pri">Import from Excel</button>} />
            <EmptyCard error title="Fees" chip={{ text: 'Couldn’t load', tone: 'r' }} scene="plug" heading="That didn’t load" body="The server did not answer. Your data is safe." actions={<button className="btn pri">Try again</button>} />
          </div>
        </Section>
      </main>
    </PageScope>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card rise" style={{ marginBottom: 18 }}><div className="ch"><h2>{title}</h2></div><div style={{ marginTop: 14 }}>{children}</div></section>;
}
