import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HttpError } from '@gradeon/api-client';
import { APP_CATALOG, APP_ROLES, APP_ROLE_LABELS, MODULES, hasKey, type AppRole } from '@gradeon/config-engine';
import { CATEGORY_TONES, CATEGORY_TONE_LABELS, DEFAULT_BRAND, MESSAGE_EVENTS, SETTING_GROUPS, SETTINGS_META, SchoolSettingsSchema, type AppLayout, type Category, type SchoolConfig, type SettingKey, type SettingMeta, type ThemeColors } from '@gradeon/contracts';
import { Checkbox, ColourField, DateField, Dialog, EmptyCard, ErrorLine, Field, FilePick, NumberField, Select, SelectField, TimeField, useShake } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { ThemeEditor } from '../../app/ThemeEditor';
import { ago } from '../../app/format';

type Say = (text: string, tone?: 'ok' | 'bad') => void;
const KEYS = Object.keys(SETTINGS_META) as SettingKey[];
const shape = SchoolSettingsSchema.shape as Record<string, { safeParse: (v: unknown) => { data?: unknown } }>;
const dflt = (k: string): unknown => shape[k]?.safeParse(undefined).data;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const ta = { width: '100%', minHeight: 90, resize: 'vertical', border: 0, outline: 0, background: 'none', font: '500 14px/1.5 var(--fb)', color: 'var(--ink)', padding: '10px 0' } as const;

/** Everything Gradeon sets for one school, built from SETTINGS_META: a new setting appears here without a new screen. */
export function ConfigTab({ schoolId, say }: { schoolId: string; say: Say }) {
  const app = useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['config', schoolId], queryFn: () => app.api.config.get(schoolId) });
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [note, setNote] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const [group, setGroup] = useState<string>(SETTING_GROUPS[0]);
  const shake = useShake();
  const can = app.can('schools.configure');
  const cfg = q.data;
  const value = (k: string): unknown => (k in edits ? edits[k] : cfg && k in cfg.values ? cfg.values[k] : dflt(k));
  const changed = cfg ? Object.keys(edits).filter((k) => !same(edits[k], k in cfg.values ? cfg.values[k] : dflt(k))) : [];
  const refresh = () => void qc.invalidateQueries({ queryKey: ['config', schoolId] });
  const save = useMutation({
    mutationFn: () => app.api.config.patch(schoolId, { expectedVersion: cfg!.version, changes: Object.fromEntries(changed.map((k) => [k, edits[k]])), note: note.trim() }),
    onSuccess: (r) => {
      setEdits({}); setNote(''); setErr({}); refresh();
      say('pending' in r ? 'A risky setting is in there, so the change waits for a second person under Approvals.' : 'Saved. The school’s admin and app follow within a minute.');
    },
    onError: (e) => {
      setErr(e instanceof HttpError && Object.keys(e.fields).length ? e.fields : { _: (e as Error).message });
      if (e instanceof HttpError && e.code === 'conflict') refresh();
      shake.hit();
    },
  });

  if (q.isLoading) return <div className="skc" style={{ height: 420, borderRadius: 24 }} />;
  if (q.isError || !cfg) return <EmptyCard error title="Configuration" chip={{ text: 'Couldn’t load', tone: 'c' }} scene="plug" heading="The school’s configuration didn’t load" body={(q.error as Error)?.message ?? ''} actions={<button className="btn pri" onClick={() => void q.refetch()}>Try again</button>} />;

  const keys = KEYS.filter((k) => SETTINGS_META[k].group === group);
  const sections = [
    ...SETTING_GROUPS.map((g) => ({ value: g as string, label: g as string })),
    ...MODULES.filter((m) => m.settings.length && cfg.entitled.includes(m.key)).map((m) => ({ value: m.key, label: m.key === 'school' ? 'Academic year' : m.name })),
  ];
  const groupLabel = sections.find((x) => x.value === group)?.label ?? group;
  return (
    <section className="grid">
      <div className="card s12 rise">
        <div className="ch"><h2>Configuration</h2><span className="chip">Version {cfg.version}</span></div>
        <div className="help">Only Gradeon changes a school’s setup. The school sees it, read-only, under School profile, and can ask for changes (Requests).</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 12 }}>
          <div className="fld" style={{ minWidth: 220 }}>
            <label htmlFor="cfg-group">Section</label>
            <Select id="cfg-group" value={group} onChange={setGroup} options={sections.map((x) => ({ value: x.value, label: `${x.label} · ${KEYS.filter((k) => SETTINGS_META[k].group === x.value).length}` }))} />
          </div>
          <span style={{ flex: 1 }} />
          {changed.length > 0 && <span className="help">{changed.length} {changed.length === 1 ? 'change' : 'changes'} not saved</span>}
        </div>
      </div>

      <div className={`card s12 rise ${shake.cls}`}>
        <div className="ch"><h2>{groupLabel}</h2></div>
        {keys.map((k) => (
          <SettingRow key={k} schoolId={schoolId} say={say} meta={SETTINGS_META[k]} value={value(k)} error={err[k]} disabled={!can} cfg={cfg}
            onChange={(v) => { setEdits((x) => ({ ...x, [k]: v })); setErr({}); }} />
        ))}
        {can && (
          <div style={{ marginTop: 16 }}>
            {err._ && <ErrorLine>{err._}</ErrorLine>}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}><Field label="Why (kept in the history)" value={note} onChange={setNote} maxLength={200} placeholder="For example: the principal asked for Fees in the tabs" /></div>
              <button className="btn" disabled={!changed.length || save.isPending} onClick={() => { setEdits({}); setErr({}); }}>Discard</button>
              <button className="btn pri" disabled={!changed.length || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : changed.length ? `Save ${changed.length} ${changed.length === 1 ? 'change' : 'changes'}` : 'Save'}</button>
            </div>
          </div>
        )}
      </div>

      <History cfg={cfg} schoolId={schoolId} can={can} say={say} />
      <Templates schoolId={schoolId} can={can} say={say} />
      <Preview cfg={cfg} schoolId={schoolId} />
    </section>
  );
}

function SettingRow({ schoolId, say, meta, value, error, disabled, cfg, onChange }: { schoolId: string; say: Say; meta: SettingMeta; value: unknown; error?: string; disabled: boolean; cfg: SchoolConfig; onChange: (v: unknown) => void }) {
  const label = <>{meta.label}{meta.risky && <span className="chip a" style={{ marginLeft: 8 }}>Needs a second person</span>}</>;
  const help = meta.help;
  const str = typeof value === 'string' ? value : '';
  const list = Array.isArray(value) ? (value as string[]) : [];
  const toggle = (key: string, max?: number) => onChange(list.includes(key) ? list.filter((x) => x !== key) : max && list.length >= max ? list : [...list, key]);
  const box = (body: React.ReactNode) => (
    <div className="fld" style={{ marginTop: 12 }}>
      <label>{label}</label>
      {body}
      {error ? <ErrorLine>{error}</ErrorLine> : help ? <div className="help">{help}</div> : null}
    </div>
  );
  const pick = (options: { key: string; label: string }[], max?: number) => box(
    <div className="tgrow">{options.map((o) => {
      const at = list.indexOf(o.key);
      return <button key={o.key} type="button" className={`chip ${at >= 0 ? 'v' : ''}`} aria-pressed={at >= 0} disabled={disabled} onClick={() => toggle(o.key, max)} style={{ cursor: disabled ? 'default' : 'pointer' }}>{at >= 0 && meta.kind !== 'classes' && meta.kind !== 'multi' && meta.kind !== 'appRoles' ? `${at + 1}. ` : ''}{o.label}</button>;
    })}{max && <span className="help">{list.length} of {max}</span>}</div>,
  );
  switch (meta.kind) {
    case 'bool':
      return box(<div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><button type="button" className={`sw ${value === true ? 'on' : ''}`} role="switch" aria-checked={value === true} aria-label={meta.label} disabled={disabled} onClick={() => onChange(value !== true)} /><span className="help" style={{ margin: 0 }}>{value === true ? 'On' : 'Off'}</span></div>);
    case 'enum': case 'language':
      return box(<Select value={str} onChange={onChange} disabled={disabled} aria-label={meta.label} options={(meta.options ?? []).map(([v, l]) => ({ value: v, label: l }))} />);
    case 'number':
      return <div style={{ marginTop: 12 }}><NumberField label={meta.label} min={meta.min} max={meta.max} value={value == null ? '' : String(value)} onChange={(v) => onChange(v === '' ? null : Number(v))} disabled={disabled} error={error} hint={help || undefined} /></div>;
    case 'theme':
      return box(<ThemeEditor scope="school" value={(value ?? {}) as ThemeColors} onChange={onChange} disabled={disabled} brand={typeof cfg.values['brand.color'] === 'string' ? cfg.values['brand.color'] : undefined} />);
    case 'color':
      return box(<ColourField label={meta.label} value={str || DEFAULT_BRAND} onChange={onChange} disabled={disabled} />);
    case 'time': case 'date':
      return <div style={{ marginTop: 12 }}>{meta.kind === 'date' ? <DateField label={meta.label} value={str} onChange={(v) => onChange(v || null)} disabled={disabled} error={error} hint={help || undefined} /> : <TimeField label={meta.label} value={str} onChange={(v) => onChange(v || null)} disabled={disabled} error={error} hint={help || undefined} />}</div>;
    case 'textarea':
      return box(<div className={`inp ${error ? 'err' : ''}`} style={{ height: 'auto' }}><textarea value={str} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label={meta.label} style={ta} /></div>);
    case 'logo':
      return box(<LogoPick schoolId={schoolId} has={!!str} disabled={disabled} say={say} />);
    case 'multi':
      // `fees.gstHeads` names the school's own fee heads; every other list names its options.
      return pick(meta.options ? meta.options.map(([key, l]) => ({ key, label: l })) : cfg.feeHeads.map((h) => ({ key: h.key, label: h.name })));
    case 'appRoles': return pick(APP_ROLES.map((r) => ({ key: r, label: APP_ROLE_LABELS[r] })));
    case 'appLayout':
      return box(<AppLayoutEditor value={(value ?? {}) as Record<AppRole, AppLayout>} has={{ modules: cfg.entitled, features: cfg.features }} disabled={disabled} onChange={onChange} />);
    case 'classes': return pick(cfg.classes.map((c) => ({ key: c.id, label: c.name })), meta.max);
    case 'strings':
      return box(<ListEditor items={list} max={meta.max ?? 12} disabled={disabled} placeholder="Add one" onChange={onChange} />);
    case 'houses':
      return box(<HousesEditor value={(Array.isArray(value) ? value : []) as { key: string; name: string; color: string }[]} max={meta.max ?? 12} disabled={disabled} onChange={onChange} />);
    case 'categories':
      return box(<CategoriesEditor value={(Array.isArray(value) ? value : []) as Category[]} max={meta.max ?? 16} disabled={disabled} onChange={onChange} />);
    case 'gradingScale':
      return box(<GradingEditor value={(Array.isArray(value) ? value : []) as { grade: string; minPct: number }[]} max={meta.max ?? 12} disabled={disabled} onChange={onChange} />);
    case 'notifyRules': {
      const rules = (value ?? {}) as Record<string, { push: boolean; sms: boolean; email: boolean }>;
      const set = (ev: string, ch: 'push' | 'sms' | 'email', on: boolean) => {
        const base = rules[ev] ?? MESSAGE_EVENTS.find((e) => e.key === ev)!.defaults;
        onChange({ ...rules, [ev]: { ...base, [ch]: on } });
      };
      return box(<div>{MESSAGE_EVENTS.map((e) => {
        const r = rules[e.key] ?? e.defaults;
        return (
          <div key={e.key} className="kv" style={{ flexWrap: 'wrap', gap: 8 }}>{e.label}{e.urgent ? ' · sent in quiet hours' : ''}
            <b style={{ display: 'flex', gap: 12 }}>{(['push', 'sms', 'email'] as const).map((ch) => (
              <Checkbox key={ch} checked={r[ch]} disabled={disabled} onChange={(c) => set(e.key, ch, c)} label={ch === 'push' ? 'App' : ch === 'sms' ? 'SMS' : 'Email'} />
            ))}</b>
          </div>
        );
      })}</div>);
    }
    case 'templates': {
      const words = (value ?? {}) as Record<string, string>;
      return box(<div>{MESSAGE_EVENTS.map((e) => (
        <div key={e.key} style={{ marginTop: 10 }}>
          <div className="help" style={{ margin: '0 0 4px' }}><b>{e.label}</b> · placeholders: {e.vars.map((v) => `{${v}}`).join(' ')}</div>
          <div className="inp" style={{ height: 'auto' }}><textarea value={words[e.key] ?? ''} placeholder={e.text} maxLength={320} disabled={disabled} aria-label={`Wording: ${e.label}`} style={{ ...ta, minHeight: 56 }}
            onChange={(x) => { const next = { ...words, [e.key]: x.target.value }; if (!x.target.value.trim()) delete next[e.key]; onChange(next); }} /></div>
        </div>
      ))}</div>);
    }
    default:
      return <div style={{ marginTop: 12 }}><Field label={meta.label} value={str} onChange={onChange} disabled={disabled} error={error} hint={help || undefined} /></div>;
  }
}

/** The logo goes straight to the school's storage and into its settings (it is a file, not a value to type). */
function LogoPick({ schoolId, has, disabled, say }: { schoolId: string; has: boolean; disabled: boolean; say: Say }) {
  const app = useApp();
  const qc = useQueryClient();
  const up = useMutation({
    mutationFn: async (file: File) => {
      if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('Choose a PNG or JPEG image.');
      if (file.size > 2 * 1024 * 1024) throw new Error('The logo must be 2 MB or smaller.');
      const data = await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] ?? ''); r.onerror = () => no(new Error('That file could not be read.')); r.readAsDataURL(file); });
      return app.api.logo(schoolId, { name: file.name, mime: file.type as 'image/png', data });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['config', schoolId] }); say('The logo was saved. The admin and the app show it from their next load.'); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span className={`chip ${has ? 'g' : ''}`}>{has ? 'Logo set' : 'Letters only'}</span>
      <FilePick accept="image/png,image/jpeg" disabled={disabled || up.isPending} onPick={(f) => up.mutate(f)} className="btn sm">{up.isPending ? 'Uploading…' : has ? 'Replace logo' : 'Upload logo'}</FilePick>
    </div>
  );
}

function History({ cfg, schoolId, can, say }: { cfg: SchoolConfig; schoolId: string; can: boolean; say: Say }) {
  const app = useApp();
  const qc = useQueryClient();
  const [sure, setSure] = useState<string | null>(null);
  const back = useMutation({
    mutationFn: (versionId: string) => app.api.config.rollback(schoolId, versionId),
    onSuccess: (r) => { setSure(null); void qc.invalidateQueries({ queryKey: ['config', schoolId] }); say(`Rolled back. The configuration is now version ${r.version}.`); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  return (
    <div className="card s12 rise">
      <div className="ch"><h2>History</h2><span className="chip">{cfg.versions.length} changes</span></div>
      {!cfg.versions.length && <div className="help">Every change made here is listed with who made it and why, and can be rolled back.</div>}
      {cfg.versions.map((v) => (
        <div key={v.id} className="rw" style={{ height: 'auto', padding: '10px 0', display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <span className="chip v">v{v.version}</span>
          <span style={{ flex: 1, minWidth: 200 }}>
            <b style={{ font: '700 13px var(--fb)' }}>{v.changes.map((c) => SETTINGS_META[c.key as SettingKey]?.label ?? c.key).join(', ') || 'No change'}</b>
            <small style={{ display: 'block', color: 'var(--ink3)' }}>{v.by} · {ago(v.at)}{v.note ? ` · ${v.note}` : ''}</small>
          </span>
          {can && v.id !== cfg.versions[0]?.id && (sure === v.id
            ? <span style={{ display: 'flex', gap: 8 }}><button className="btn sm dng" disabled={back.isPending} onClick={() => back.mutate(v.id)}>Roll back to v{v.version}</button><button className="btn sm" onClick={() => setSure(null)}>Keep</button></span>
            : <button className="btn sm" onClick={() => setSure(v.id)}>Roll back…</button>)}
        </div>
      ))}
    </div>
  );
}

function Templates({ schoolId, can, say }: { schoolId: string; can: boolean; say: Say }) {
  const app = useApp();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['config-templates'], queryFn: app.api.config.templates });
  const [name, setName] = useState('');
  const [applying, setApplying] = useState(false);
  const save = useMutation({
    mutationFn: () => app.api.config.saveTemplate(schoolId, name.trim()),
    onSuccess: () => { setName(''); void qc.invalidateQueries({ queryKey: ['config-templates'] }); say('Saved as a template. Its settings and roles can now be applied to other schools.'); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  return (
    <div className="card s12 rise">
      <div className="ch"><h2>Templates</h2><span className="chip">{(list.data ?? []).length}</span></div>
      <div className="help">A template carries settings and roles, never who the school is (name, contacts, logo letters).</div>
      {(list.data ?? []).map((t) => <div key={t.id} className="kv">{t.name}<b>{t.keys} settings · {t.roles} roles · {ago(t.createdAt)}</b></div>)}
      {can && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 12 }}>
          <div style={{ flex: 1, minWidth: 200 }}><Field label="Save this school’s setup as" value={name} onChange={setName} maxLength={60} placeholder="For example: CBSE day school" /></div>
          <button className="btn" disabled={name.trim().length < 2 || save.isPending} onClick={() => save.mutate()}>Save template</button>
          <button className="btn pri" disabled={!(list.data ?? []).length} onClick={() => setApplying(true)}>Apply a template…</button>
        </div>
      )}
      {applying && <ApplyDialog schoolId={schoolId} onClose={() => setApplying(false)} onDone={(n) => { setApplying(false); void qc.invalidateQueries({ queryKey: ['config'] }); say(`Applied to ${n} ${n === 1 ? 'school' : 'schools'}.`); }} />}
    </div>
  );
}

function ApplyDialog({ schoolId, onClose, onDone }: { schoolId: string; onClose: () => void; onDone: (n: number) => void }) {
  const app = useApp();
  const list = useQuery({ queryKey: ['config-templates'], queryFn: app.api.config.templates });
  const schools = useQuery({ queryKey: ['schools'], queryFn: () => app.api.schools() });
  const [tpl, setTpl] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set([schoolId]));
  const [err, setErr] = useState('');
  const go = useMutation({ mutationFn: () => app.api.config.applyTemplate(tpl, [...picked]), onSuccess: (r) => onDone(r.applied), onError: (e) => setErr((e as Error).message) });
  const rows = (schools.data ?? []).filter((s) => s.status !== 'archived' && s.status !== 'onboarding');
  return (
    <Dialog title="Apply a template" onClose={onClose} width={560}>
      <SelectField label="Template" value={tpl} onChange={setTpl} options={[{ value: '', label: 'Choose a template' }, ...(list.data ?? []).map((t) => ({ value: t.id, label: t.name }))]} />
      <div className="lbl" style={{ margin: '12px 0 6px' }}>Schools</div>
      <div style={{ maxHeight: 260, overflow: 'auto' }}>
        {rows.map((s) => (
          <label key={s.id} className="hwc" style={{ display: 'flex', padding: '6px 0' }}>
            <Checkbox checked={picked.has(s.id)} onChange={(c) => { const n = new Set(picked); if (c) n.add(s.id); else n.delete(s.id); setPicked(n); }} />{s.name}
          </label>
        ))}
      </div>
      {err && <ErrorLine>{err}</ErrorLine>}
      <div className="help" style={{ marginTop: 10 }}>Each school gets a new configuration version, which can be rolled back. Modules outside a school’s plan are left off.</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={!tpl || !picked.size || go.isPending} onClick={() => go.mutate()}>Apply to {picked.size} {picked.size === 1 ? 'school' : 'schools'}</button>
      </div>
    </Dialog>
  );
}

/** The admin menu and the app's layout exactly as one role at this school sees them. */
function Preview({ cfg, schoolId }: { cfg: SchoolConfig; schoolId: string }) {
  const app = useApp();
  const [roleId, setRoleId] = useState(cfg.roles[0]?.id ?? '');
  const p = useQuery({ queryKey: ['config-preview', schoolId, roleId, cfg.version], queryFn: () => app.api.config.preview(schoolId, roleId), enabled: !!roleId });
  const label = useMemo(() => Object.fromEntries([...APP_CATALOG.dock, ...APP_CATALOG.home, ...APP_CATALOG.quick].map((c) => [c.key, c.label])), []);
  return (
    <div className="card s12 rise">
      <div className="ch"><h2>Preview</h2></div>
      <div className="help">The admin menu this role gets, and what each role sees in the app (bottom tabs in colour, then Home cards).</div>
      <div style={{ maxWidth: 320 }}><SelectField label="As this role sees it" value={roleId} onChange={setRoleId} options={cfg.roles.map((r) => ({ value: r.id, label: r.name }))} /></div>
      {p.data && (
        <>
          {p.data.menu.map((g) => <div key={g.group} className="kv">{g.group}<b className="tgrow">{g.pages.map((n) => <span key={n.id} className="chip">{n.label}</span>)}</b></div>)}
          {APP_ROLES.map((r) => (
            <div key={r} className="kv">App · {APP_ROLE_LABELS[r]}<b className="tgrow">{p.data!.app.roles.includes(r)
              ? [...p.data!.app.layout[r].dock.map((k) => <span key={`d${k}`} className="chip v">{label[k] ?? k}</span>), ...p.data!.app.layout[r].home.map((k) => <span key={`h${k}`} className="chip">{label[k] ?? k}</span>)]
              : 'Does not use the app'}</b></div>
          ))}
        </>
      )}
    </div>
  );
}

/** For each app role: its bottom tabs, Home cards and quick buttons, in order, from what the school's modules offer that role. */
function AppLayoutEditor({ value, has, disabled, onChange }: { value: Record<AppRole, AppLayout>; has: { modules: readonly string[]; features: readonly string[] }; disabled: boolean; onChange: (v: unknown) => void }) {
  const [role, setRole] = useState<AppRole>('parent');
  const cur = value[role] ?? { dock: [], home: [], quick: [] };
  const slots = [['dock', 'Bottom tabs', 4], ['home', 'Home cards', 12], ['quick', 'Quick buttons', 6]] as const;
  const set = (slot: keyof AppLayout, key: string, max: number) => {
    const list = cur[slot];
    const next = list.includes(key) ? list.filter((x) => x !== key) : list.length >= max ? list : [...list, key];
    onChange({ ...value, [role]: { ...cur, [slot]: next } });
  };
  return (
    <div>
      <div style={{ maxWidth: 260 }}><Select value={role} onChange={(r) => setRole(r as AppRole)} aria-label="Role" options={APP_ROLES.map((r) => ({ value: r, label: APP_ROLE_LABELS[r] }))} /></div>
      {slots.map(([slot, title, max]) => {
        const offered = APP_CATALOG[slot].filter((c) => c.roles.includes(role) && has.modules.includes(c.module) && hasKey(has, c.feature));
        return (
          <div key={slot} style={{ marginTop: 10 }}>
            <div className="help" style={{ margin: '0 0 4px' }}><b>{title}</b> · {cur[slot].length} of {max}{slot === 'dock' ? ' · Profile is always last' : ''}</div>
            <div className="tgrow">{offered.length ? offered.map((o) => {
              const at = cur[slot].indexOf(o.key);
              return <button key={o.key} type="button" className={`chip ${at >= 0 ? 'v' : ''}`} aria-pressed={at >= 0} disabled={disabled} onClick={() => set(slot, o.key, max)}>{at >= 0 ? `${at + 1}. ` : ''}{o.label}</button>;
            }) : <span className="help" style={{ margin: 0 }}>The school’s modules offer nothing here for this role.</span>}</div>
          </div>
        );
      })}
    </div>
  );
}

/** A short list of words (leave reasons): add, rename in place, remove. */
function ListEditor({ items, max, disabled, placeholder, onChange }: { items: string[]; max: number; disabled: boolean; placeholder: string; onChange: (v: unknown) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => { const v = draft.trim(); if (v && !items.includes(v) && items.length < max) { onChange([...items, v]); setDraft(''); } };
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
          <div style={{ flex: 1 }}><Field label={`Item ${i + 1}`} value={it} maxLength={40} disabled={disabled} onChange={(v) => onChange(items.map((x, j) => (j === i ? v : x)))} /></div>
          <button type="button" className="btn sm" disabled={disabled || items.length <= 1} onClick={() => onChange(items.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      {items.length < max && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 8 }}>
          <div style={{ flex: 1 }}><Field label="New" value={draft} maxLength={40} disabled={disabled} placeholder={placeholder} onChange={setDraft} /></div>
          <button type="button" className="btn sm" disabled={disabled || !draft.trim()} onClick={add}>Add</button>
        </div>
      )}
    </div>
  );
}

const keyOf = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'item';

/** The school's houses and their colours. */
function HousesEditor({ value, max, disabled, onChange }: { value: { key: string; name: string; color: string }[]; max: number; disabled: boolean; onChange: (v: unknown) => void }) {
  const put = (i: number, patch: Partial<{ name: string; color: string }>) => onChange(value.map((h, j) => (j === i ? { ...h, ...patch, ...(patch.name !== undefined ? { key: keyOf(patch.name) } : {}) } : h)));
  return (
    <div>
      {!value.length && <div className="help" style={{ margin: 0 }}>No houses: profiles and the roll-call grid show none.</div>}
      {value.map((h, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 6, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}><Field label="House" value={h.name} maxLength={24} disabled={disabled} onChange={(v) => put(i, { name: v })} /></div>
          <ColourField label="Colour" value={h.color} disabled={disabled} onChange={(c) => put(i, { color: c })} />
          <button type="button" className="btn sm" disabled={disabled} onClick={() => onChange(value.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      {value.length < max && <button type="button" className="btn sm" style={{ marginTop: 8 }} disabled={disabled} onClick={() => onChange([...value, { key: `house-${value.length + 1}`, name: `House ${value.length + 1}`, color: DEFAULT_BRAND }])}>Add a house</button>}
    </div>
  );
}

/** Categories of notices or events: a name and the colour pair they are drawn in. */
function CategoriesEditor({ value, max, disabled, onChange }: { value: Category[]; max: number; disabled: boolean; onChange: (v: unknown) => void }) {
  const put = (i: number, patch: Partial<Category>) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div>
      {value.map((c, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 6, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}><Field label="Category" value={c.name} maxLength={24} disabled={disabled} onChange={(v) => put(i, { name: v })} /></div>
          <div style={{ width: 160 }}><SelectField label="Colour" value={c.tone} disabled={disabled} onChange={(t) => put(i, { tone: t as Category['tone'] })} options={CATEGORY_TONES.map((t) => ({ value: t, label: CATEGORY_TONE_LABELS[t] }))} /></div>
          <span className={`chip ${c.tone}`} style={{ marginBottom: 10 }}>{c.name || 'Category'}</span>
          <button type="button" className="btn sm" disabled={disabled || value.length <= 1} onClick={() => onChange(value.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      {value.length < max && <button type="button" className="btn sm" style={{ marginTop: 8 }} disabled={disabled} onClick={() => onChange([...value, { key: `cat-${Date.now().toString(36).slice(-6)}`, name: 'New category', tone: 'v' }])}>Add a category</button>}
      <div className="help">A category’s key stays when it is renamed, so notices and events already written keep it.</div>
    </div>
  );
}

/** Grades from the lowest percentage that earns each, highest first. */
function GradingEditor({ value, max, disabled, onChange }: { value: { grade: string; minPct: number }[]; max: number; disabled: boolean; onChange: (v: unknown) => void }) {
  const sorted = (rows: { grade: string; minPct: number }[]) => [...rows].sort((a, b) => b.minPct - a.minPct);
  const put = (i: number, patch: Partial<{ grade: string; minPct: number }>) => onChange(value.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const lowest = value.length ? Math.min(...value.map((g) => g.minPct)) : 0;
  return (
    <div>
      {value.map((g, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 6 }}>
          <div style={{ width: 120 }}><Field label="Grade" value={g.grade} maxLength={4} disabled={disabled} onChange={(v) => put(i, { grade: v })} /></div>
          <div style={{ width: 160 }}><NumberField label="From (%)" min={0} max={100} value={String(g.minPct)} disabled={disabled} onChange={(v) => put(i, { minPct: v === '' ? 0 : Number(v) })} /></div>
          <button type="button" className="btn sm" disabled={disabled || value.length <= 1} onClick={() => onChange(value.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {value.length < max && <button type="button" className="btn sm" disabled={disabled} onClick={() => onChange([...value, { grade: '?', minPct: 0 }])}>Add a grade</button>}
        <button type="button" className="btn sm" disabled={disabled} onClick={() => onChange(sorted(value))}>Put in order</button>
      </div>
      {lowest > 0 && <div className="help">No grade starts at 0%, so marks below {lowest}% would get no grade. Add one that starts at 0.</div>}
    </div>
  );
}
