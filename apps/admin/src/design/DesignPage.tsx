import { DEFAULT_BRAND, SPECTRUM_COLOURS } from '@tangent/contracts';
import { useState } from 'react';
import { Checkbox, ColourField, DateField, Dialog, EmptyCard, ErrorLine, Field, FilePick, MenuButton, NumberField, PageScope, Presence, Segmented, ColourPicker, SelectField, TimeField, ToastSlot, tintFor, useToast, useShake, EmptyState, IC, Icon, UI, type PageIcon } from '@tangent/web-ui';
import { useShellChrome } from '../app/Layout';

// Surfaces and text are the fixed Nest neutrals; the school's seed (Tangent Hue) gives the accents, and status has its own colours.
const SWATCHES: [string, string][] = [['Ink (main action, dark cards)', '--deep'], ['Bright (on dark cards)', '--bright'], ['Brand (accent)', '--brand'], ['Brand soft', '--brand-soft'], ['Canvas', '--bd'], ['Ground', '--bg'], ['Card', '--s1'], ['Well', '--s2'], ['Text', '--ink'], ['Secondary text', '--ink2'], ['Captions', '--ink3'], ['Good', '--ok'], ['Watch', '--warn'], ['Act', '--bad'], ['Note', '--info']];
const CHIPS = ['', 'v', 'c', 'a', 'g'] as const;

/** A living style guide (Tangent Hue's parts in the Nest look) built from the real components, so it can never drift from what the pages use. Open it at /design. */
export function DesignPage() {
  const chrome = useShellChrome();
  const [on, setOn] = useState(true);
  const [seg, setSeg] = useState(0);
  const [dlg, setDlg] = useState(false);
  const { toast, say } = useToast();
  const [name, setName] = useState('');
  const [day, setDay] = useState('2026-11-12');
  const [time, setTime] = useState('08:30');
  const [count, setCount] = useState('40');
  const [colour, setColour] = useState(DEFAULT_BRAND);
  const [tick, setTick] = useState(true);
  const [menu, setMenu] = useState(false);
  const [file, setFile] = useState('');
  const shake = useShake();
  return (
    <PageScope page="design" overlays={<><ToastSlot toast={toast} /><Presence>{dlg && <Dialog title="Erase this draft?" tag={{ text: 'Cannot be undone', tone: 'c' }} onClose={() => setDlg(false)} width={440}><p>The draft and everything typed into it are removed.</p><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}><button className="btn" onClick={() => setDlg(false)}>Keep it</button><button className="btn dngf" onClick={() => setDlg(false)}>Erase</button></div></Dialog>}</Presence></>}>
      <main className="mn">
        <header className="hd rise"><div><h1>Design system</h1><p>The pieces every admin and console page is made of: Tangent Hue’s parts in the Nest look, with this school’s colour in the accents.</p></div><span className="grow"></span><button className="btn" onClick={chrome.openSearch}>Search</button></header>

        <Section title="Colour">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
            {SWATCHES.map(([n, v]) => (
              <div key={v}><div style={{ height: 64, borderRadius: 16, background: `var(${v})`, boxShadow: 'inset 0 0 0 1px var(--line)' }} /><b style={{ font: '700 13px var(--fb)', display: 'block', marginTop: 6 }}>{n}</b><small style={{ color: 'var(--ink3)', font: '600 12px var(--fb)' }}>{v}</small></div>
            ))}
          </div>
        </Section>

        <Section title="Spectrum">
          <p className="help" style={{ marginTop: 0 }}>Twelve fixed hues that name things (subjects, houses, payment methods), the same in every school.</p>
          <div className="tgrow">{SPECTRUM_COLOURS.map((c) => <span key={c} className={`chip sp-${c}`} style={{ background: 'var(--cs)', color: 'var(--ci)' }}>{c}</span>)}</div>
        </Section>

        <Section title="Type">
          <div className="fd" style={{ font: '700 40px/44px var(--fd)', letterSpacing: '-.035em' }}>Bricolage Grotesque, for headings and numbers</div>
          <p style={{ font: '400 15px/22px var(--fb)', color: 'var(--ink2)', maxWidth: 640 }}>Manrope carries every label, row and paragraph. Hindi and Marathi use Noto Sans Devanagari at the same sizes.</p>
          <div className="num" style={{ font: '700 30px var(--fd)' }}>1,498 · 18,400 · 94.2%</div>
        </Section>

        <Section title="Icons">
          <p className="help" style={{ marginTop: 0 }}>One family, Phosphor: one meaning, one icon. Regular by default, filled when selected, bold at 16 px and under.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
            {(Object.keys(IC) as PageIcon[]).map((k) => <div key={k} className="tgrow" style={{ gap: 8 }}><Icon name={k} /><Icon name={k} on /><small className="help">{k}</small></div>)}
          </div>
          <div className="tgrow" style={{ marginTop: 12 }}>{(Object.keys(UI) as (keyof typeof UI)[]).map((k) => <span key={k} data-tip={k}><Icon name={k} /></span>)}</div>
        </Section>

        <Section title="Buttons and chips">
          <div className="tgrow">
            <button className="btn pri">Primary</button><button className="btn">Plain</button><button className="btn ghost">Ghost</button><button className="btn dng">Danger</button><button className="btn" disabled>Disabled</button>
            <button className="btn pri sm">Small</button><button className="btn"><span className="spin" aria-hidden="true"></span>Working</button>
          </div>
          <div className="tgrow" style={{ marginTop: 16 }}>{CHIPS.map((c) => <span key={c} className={`chip ${c}`}>{c || 'plain'}</span>)}</div>
        </Section>

        <Section title="Inputs, errors and switches">
          <div className="two" style={{ maxWidth: 720 }}>
            <div className={shake.cls}><Field label="School name" value={name} onChange={setName} placeholder="Northfield School" error={name === 'x' ? 'Enter the school’s full name' : undefined} hint="Press the button to see the error vibrate" icon="admissions" /></div>
            <SelectField label="Board" value="National curriculum" onChange={() => undefined} options={['National curriculum', 'International', 'State'].map((v) => ({ value: v, label: v }))} />
          </div>
          <div className="tgrow" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => { setName('x'); shake.hit(); }}>Make it vibrate</button>
            <button className={`sw ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label="Example switch" onClick={() => setOn(!on)}></button>
            <Segmented label="View" value={String(seg)} onChange={(v) => setSeg(Number(v))} options={['Week', 'Day', 'List'].map((t, i) => ({ value: String(i), label: t }))} />
          </div>
          <div style={{ marginTop: 12 }}><ErrorLine>This is what an error line looks like.</ErrorLine></div>
        </Section>

        <Section title="Fields">
          <p className="help" style={{ marginTop: 0 }}>No browser widgets: every field has the same frame, error line and vibrate. Dates and times can be typed or picked; everything works from the keyboard.</p>
          <div className="two" style={{ maxWidth: 720 }}>
            <DateField label="Due on" value={day} onChange={setDay} hint="Type 12 Nov, or pick from the calendar" />
            <TimeField label="Starts at" value={time} onChange={setTime} hint="Type 8:47, or pick a quarter hour" />
            <NumberField label="Marks out of" value={count} onChange={setCount} min={1} max={100} />
            <DateField label="Ends on" value="" onChange={() => undefined} error="Pick a day after it starts." />
          </div>
          <div className="tgrow" style={{ marginTop: 12, alignItems: 'center' }}>
            <Checkbox checked={tick} onChange={setTick} label="Send a copy to parents" />
            <ColourField label="Brand colour" value={colour} onChange={setColour} />
            <FilePick onPick={(f) => setFile(f.name)}>{file || 'Choose a file'}</FilePick>
            <MenuButton label="New" icon='plus' primary open={menu} onOpenChange={setMenu} menuLabel="Add something new">
              <button role="menuitem" onClick={() => setMenu(false)}>Add student<small>N S</small></button>
              <button role="menuitem" onClick={() => setMenu(false)}>Post a notice<small>N N</small></button>
            </MenuButton>
          </div>
          <div style={{ marginTop: 12 }}><ColourPicker label="Any colour" value={colour} onChange={setColour} /></div>
        </Section>

        <Section title="Tiles and bars">
          <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {(['t-v', 't-a', 't-g', 't-i', 't-l', 't-p'] as const).map((t) => <div key={t} className={`tile ${t}`} style={{ minHeight: 120 }}><b className="fd" style={{ fontSize: 22 }}>{t}</b><div style={{ font: '600 13px var(--fb)', opacity: .7 }}>A tile</div></div>)}
          </div>
          <div style={{ display: 'grid', gap: 10, marginTop: 16, maxWidth: 520 }}>
            {[78, 52, 31].map((w) => <div key={w} style={{ height: 22, borderRadius: 10, background: 'var(--s2)', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${w}%`, borderRadius: 10, background: 'var(--brand)' }} /></div>)}
          </div>
          <div className="tgrow" style={{ marginTop: 16 }}>{['Maya Torres', 'Leo Martin', 'Ada Novak', 'Sam Okafor'].map((n) => { const t = tintFor(n); return <span key={n} className="av" style={{ background: t.bg, color: t.fg, width: 44, height: 44, display: "grid", placeItems: "center" }}>{n.split(' ').map((w) => w[0]).join('')}</span>; })}</div>
        </Section>

        <Section title="Overlays">
          <p className="help" style={{ marginTop: 0 }}>Popups grow from their button in 200 ms; dialogs, panels and toasts take 300 ms. Everything leaves a little faster than it came, and stops when the device asks for less motion.</p>
          <div className="tgrow"><button className="btn" onClick={() => setDlg(true)}>Open a dialog</button><button className="btn" onClick={() => say('Saved. The app updates within a minute.')}>Show a toast</button><button className="btn" onClick={() => say('Couldn’t save. Check the connection and try again.', 'bad')}>Show an error</button></div>
        </Section>

        <Section title="Empty pages">
          <EmptyState scene="students" onAction={() => say('This is where the import opens.')} onLink={() => say('This is where Add one student opens.')} />
        </Section>

        <Section title="Errors, closed doors and no match">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            <EmptyCard title="Students" chip={{ text: '0 students', tone: 'v' }} icon="people" heading="No students yet" body="Add the first student, or import the whole school from a sheet." actions={<button className="btn pri">Import from Excel</button>} />
            <EmptyCard error title="Fees" chip={{ text: 'Couldn’t load', tone: 'c' }} icon="warning" heading="That didn’t load" body="The server did not answer. Your data is safe." actions={<button className="btn pri">Try again</button>} />
          </div>
        </Section>
      </main>
    </PageScope>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card rise" style={{ marginBottom: 16 }}><div className="ch"><h2>{title}</h2></div><div style={{ marginTop: 12 }}>{children}</div></section>;
}
