import { useMemo, useState, type CSSProperties } from 'react';
import { APP_SHARED, APP_TOKENS, WEB_TOKENS, contrast, resolveApp, resolveWeb, type AppMode, type ThemeColors, type WebMode } from '@gradeon/contracts';
import { ColourField, Segmented } from '@gradeon/web-ui';

type Part = 'admin' | 'app';
const WEB_MODES: [WebMode, string][] = [['light', 'Light'], ['dark', 'Dark']];
const APP_MODES: [AppMode, string][] = [['light', 'Chalk'], ['dark', 'Blackboard'], ['amoled', 'AMOLED']];
const groups = <T extends { group: string }>(list: T[]) => [...new Set(list.map((t) => t.group))].map((g) => [g, list.filter((t) => t.group === g)] as const);
const label = (key: string) => WEB_TOKENS.find((t) => t.key === key)?.label ?? [...APP_TOKENS, ...APP_SHARED].find((t) => t.key === key)?.label ?? key;

// Text and fills people must be able to read: [text, ground, what it is].
const WEB_PAIRS: [string, string, string][] = [['ink', 'card', 'Text on cards'], ['ink2', 'card', 'Secondary text on cards'], ['ink3', 'card', 'Captions on cards'], ['ink3', 'sunk', 'Captions in wells'],
  ['priT', 'pri', 'Text on the main button'], ['onV', 'v', 'Text on the accent'], ['vD', 'card', 'Accent text'], ['vD', 'vS', 'Accent text on its fill'], ['gD', 'gS', 'Good text on its fill'],
  ['aD', 'aS', 'Warning text on its fill'], ['cD', 'cS', 'Danger text on its fill'], ['cD', 'card', 'Danger text on cards']];
const APP_PAIRS: [string, string, string][] = [['ink', 'paper', 'Text on cards'], ['ink2', 'paper', 'Secondary text'], ['ink3', 'paper', 'Captions on cards'], ['ink3', 'chalk', 'Captions on the page'],
  ['mariInk', 'mari', 'Text on the main action'], ['mariText', 'paper', 'Main colour as text'], ['badText', 'paper', 'Bad as text'], ['lateText', 'paper', 'Late as text']];

/** Every colour of one product, in every theme, with a live preview. `value` holds only what differs from the defaults. */
export function ThemeEditor({ value, onChange, disabled, scope, brand }: { value: ThemeColors; onChange: (v: ThemeColors) => void; disabled?: boolean; scope: 'school' | 'console'; brand?: string }) {
  const [part, setPart] = useState<Part>('admin');
  const isApp = scope === 'school' && part === 'app';
  const prefix = isApp ? 'app.' : 'web.';
  const changed = Object.keys(value).filter((k) => k.startsWith(prefix)).length;
  const set = (key: string, hex: string, dflt: string) => {
    const next = { ...value };
    if (hex.toUpperCase() === dflt.toUpperCase()) delete next[key]; else next[key] = hex;
    onChange(next);
  };
  const reset = (keys: string[]) => { const next = { ...value }; keys.forEach((k) => delete next[k]); onChange(next); };
  const web = useMemo(() => Object.fromEntries(WEB_MODES.map(([m]) => [m, resolveWeb(value, m)])) as Record<WebMode, Record<string, string>>, [value]);
  const app = useMemo(() => Object.fromEntries(APP_MODES.map(([m]) => [m, resolveApp(value, m)])) as Record<AppMode, Record<string, string>>, [value]);
  const weak = isApp
    ? APP_MODES.flatMap(([m, n]) => APP_PAIRS.map(([x, y, what]) => ({ what: `${what}, ${n}`, r: contrast(app[m][x]!.slice(0, 7), app[m][y]!.slice(0, 7)) })))
    : WEB_MODES.flatMap(([m, n]) => WEB_PAIRS.map(([x, y, what]) => ({ what: `${what}, ${n.toLowerCase()}`, r: contrast(web[m][x]!, web[m][y]!) })));
  const low = weak.filter((p) => p.r < 4.5);

  const cell = (key: string, shown: string, dflt: string, follows?: string) => (
    <div className="thm-cell">
      <ColourField compact alpha label={label(key.split('.').pop()!)} value={shown} onChange={(hex) => set(key, hex, dflt)} disabled={disabled} />
      {value[key] ? <button type="button" className="lnk" disabled={disabled} onClick={() => reset([key])}>Default</button> : follows && <small>Follows {follows}</small>}
    </div>
  );

  return (
    <div className="thm">
      <div className="thm-top">
        {scope === 'school' && <Segmented label="Which colours" value={part} onChange={setPart} options={[{ value: 'admin', label: 'Admin' }, { value: 'app', label: 'App' }]} />}
        <span className="help">{changed ? `${changed} ${changed === 1 ? 'colour' : 'colours'} changed from the design` : 'All colours are the design’s defaults'}</span>
        <span className="thm-sp" />
        {scope === 'school' && !isApp && brand && <button type="button" className="btn sm" disabled={disabled} onClick={() => onChange({ ...value, 'web.light.v': brand.toUpperCase() })}>Accent from the brand colour</button>}
        {scope === 'school' && isApp && brand && <button type="button" className="btn sm" disabled={disabled} onClick={() => onChange({ ...value, 'app.mari': brand.toUpperCase() })}>Main action from the brand colour</button>}
        <button type="button" className="btn sm" disabled={disabled || !changed} onClick={() => reset(Object.keys(value).filter((k) => k.startsWith(prefix)))}>Reset all</button>
      </div>

      {low.length > 0 && (
        <div className="thm-warn" role="status">
          <b>Hard to read</b> (below 4.5:1): {low.map((p) => `${p.what} ${p.r.toFixed(1)}:1`).join(' · ')}
        </div>
      )}

      {isApp ? <AppPreview app={app} /> : <WebPreview web={web} />}

      {isApp ? (
        <>
          {groups(APP_TOKENS).map(([g, list]) => (
            <div key={g} className="thm-g">
              <h3>{g}</h3>
              <div className="thm-row thm-head"><span />{APP_MODES.map(([, n]) => <span key={n}>{n}</span>)}</div>
              {list.map((t) => (
                <div key={t.key} className="thm-row">
                  <span><b>{t.label}</b>{t.help && <small>{t.help}</small>}</span>
                  {APP_MODES.map(([m]) => cell(`app.${m}.${t.key}`, app[m][t.key]!, m === 'amoled' ? t.amoled ?? t.dark : t[m], t.from && value[`app.${t.from}`] && !value[`app.${m}.${t.key}`] ? label(t.from) : m === 'amoled' && !value[`app.amoled.${t.key}`] && value[`app.dark.${t.key}`] ? 'Blackboard' : undefined))}
                </div>
              ))}
            </div>
          ))}
          {groups(APP_SHARED).map(([g, list]) => (
            <div key={g} className="thm-g">
              <h3>{g} <small>· the same in every theme</small></h3>
              {list.map((t) => (
                <div key={t.key} className="thm-row thm-one">
                  <span><b>{t.label}</b>{t.help && <small>{t.help}</small>}</span>
                  {cell(`app.${t.key}`, app.light[t.key]!, t.value, t.from && value[`app.${t.from}`] && !value[`app.${t.key}`] ? label(t.from) : undefined)}
                </div>
              ))}
            </div>
          ))}
        </>
      ) : groups(WEB_TOKENS).map(([g, list]) => (
        <div key={g} className="thm-g">
          <h3>{g}</h3>
          <div className="thm-row thm-two thm-head"><span />{WEB_MODES.map(([, n]) => <span key={n}>{n}</span>)}</div>
          {list.map((t) => (
            <div key={t.key} className="thm-row thm-two">
              <span><b>{t.label}</b>{t.help && <small>{t.help}</small>}</span>
              {WEB_MODES.map(([m]) => cell(`web.${m}.${t.key}`, web[m][t.key]!, t[m], t.from && value[`web.${m}.${t.from}`] && !value[`web.${m}.${t.key}`] ? label(t.from) : undefined))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const vars = (palette: Record<string, string>) => Object.fromEntries(Object.entries(palette).map(([k, v]) => [`--${k}`, v])) as CSSProperties;

/** The admin's building blocks in the chosen colours, light and dark side by side. */
function WebPreview({ web }: { web: Record<WebMode, Record<string, string>> }) {
  return (
    <div className="thm-pv">
      {WEB_MODES.map(([m, n]) => (
        <div key={m} className={`nest ${m === 'dark' ? 'dark' : ''} thm-web`} style={vars(web[m])} aria-label={`Preview, ${n.toLowerCase()}`}>
          <div className="thm-frame">
            <div className="thm-side"><span className="on">Dashboard</span><span>Students</span><span>Fees</span></div>
            <div className="thm-main">
              <b className="thm-h">Dashboard</b>
              <div className="card thm-card">
                <small>Collected in November</small>
                <b className="num">₹11,08,900</b>
                <div className="thm-bars" aria-hidden="true"><i style={{ height: '60%' }} /><i style={{ height: '80%' }} /><i className="hi" style={{ height: '95%' }} /></div>
                <div className="tgrow"><span className="chip g">Paid</span><span className="chip a">Due</span><span className="chip c">Overdue</span><span className="chip v">New</span></div>
              </div>
              <div className="tgrow"><button type="button" className="btn pri sm" tabIndex={-1}>Send reminder</button><button type="button" className="btn sm" tabIndex={-1}>Later</button><a className="thm-a">A link</a></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** A phone screen in the chosen colours, for each of the app's three themes. */
function AppPreview({ app }: { app: Record<AppMode, Record<string, string>> }) {
  return (
    <div className="thm-pv">
      {APP_MODES.map(([m, n]) => {
        const c = app[m];
        return (
          <div key={m} className="thm-phone" style={vars(c)} aria-label={`Preview, ${n}`}>
            <small className="thm-o">Sunday · 8 November</small>
            <b className="thm-h">Good evening</b>
            <div className="thm-pcard">
              <span className="thm-cover" style={{ background: c['subject.maths'] }}>MA</span>
              <span className="thm-t"><b>Linear equations</b><small>Maths · due tomorrow</small></span>
              <span className="thm-stamp">1 day</span>
            </div>
            <div className="thm-pcard">
              <span className="thm-t"><b>₹4,500</b><small className="thm-bad">3 days late</small></span>
              <span className="thm-pay">Pay</span>
            </div>
            <div className="thm-dock"><span className="on">Home</span><span>Fees</span><span>Chat</span></div>
            <small className="thm-name">{n}</small>
          </div>
        );
      })}
    </div>
  );
}
