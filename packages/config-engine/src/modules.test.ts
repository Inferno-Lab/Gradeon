import { IMPORT_KINDS, MESSAGE_EVENTS, PERMISSIONS, PERMISSION_CATALOG, PERMISSION_NEEDS, SETTING_GROUPS, SETTINGS_META, SchoolSettingsSchema, DEFAULT_APP_LAYOUT, APP_ROLE_KEYS } from '@gradeon/contracts';
import { describe, expect, it } from 'vitest';
import { ADMIN_PAGES, APP_CATALOG, APP_ROLES, MODULES, featureByKey, moduleByKey } from './index.js';

// The completeness check of docs/product-map.md §7: every piece of the product belongs to exactly one module, and a
// module's record names everything it is. A new module that leaves something out, or a list kept elsewhere that drifts, fails here.

const owners = (pick: (m: (typeof MODULES)[number]) => readonly string[]) => {
  const seen = new Map<string, string[]>();
  for (const m of MODULES) for (const k of pick(m)) seen.set(k, [...(seen.get(k) ?? []), m.key]);
  return seen;
};
const once = (pick: (m: (typeof MODULES)[number]) => readonly string[], all: readonly string[], what: string) => {
  const seen = owners(pick);
  const problems = [
    ...all.filter((k) => !seen.has(k)).map((k) => `${what} ${k} belongs to no module`),
    ...[...seen].filter(([, ms]) => ms.length > 1).map(([k, ms]) => `${what} ${k} is claimed by ${ms.join(' and ')}`),
    ...[...seen.keys()].filter((k) => !all.includes(k)).map((k) => `${what} ${k} is named by a module but does not exist`),
  ];
  expect(problems).toEqual([]);
  return seen;
};
/** A module or one of its features. */
const within = (key: string, module: string) => key === module || featureByKey(key)?.module === module;

describe('every piece of the product belongs to one module', () => {
  it('permissions, and each is gated by its own module', () => {
    const seen = once((m) => m.permissions, PERMISSIONS, 'Permission');
    for (const [p, [m]] of seen) {
      const need = PERMISSION_NEEDS[p as keyof typeof PERMISSION_NEEDS];
      if (moduleByKey(m!)?.core) expect(need === undefined || within(need, m!), `${p} needs ${need}`).toBe(true);
      else expect(need && within(need, m!), `${p} must need ${m} or one of its features`).toBe(true);
    }
    expect(PERMISSION_CATALOG.map((p) => p.key).sort()).toEqual([...PERMISSIONS].sort());
  });
  it('settings: each is school-wide or under the module that lists it', () => {
    const moduleOwned = Object.entries(SETTINGS_META).filter(([, m]) => !(SETTING_GROUPS as readonly string[]).includes(m.group)).map(([k]) => k);
    const seen = once((m) => m.settings, moduleOwned, 'Setting');
    for (const [k, [m]] of seen) expect(SETTINGS_META[k as keyof typeof SETTINGS_META].group, k).toBe(m);
    expect(Object.keys(SETTINGS_META).sort()).toEqual(Object.keys(SchoolSettingsSchema.shape).sort());
  });
  it('messages, and each is sent only while its module is on', () => {
    const seen = once((m) => m.messages, MESSAGE_EVENTS.map((e) => e.key), 'Message');
    for (const e of MESSAGE_EVENTS) expect(within(e.needs, seen.get(e.key)![0]!), `${e.key} needs ${e.needs}`).toBe(true);
  });
  it('import kinds, gated by their module', () => {
    const seen = once((m) => m.imports, IMPORT_KINDS.map((k) => k.key), 'Import kind');
    for (const k of IMPORT_KINDS) {
      const m = seen.get(k.key)![0]!;
      if (moduleByKey(m)?.core) expect(k.module === 'core' || within(k.module, m), k.key).toBe(true);
      else expect(within(k.module, m), `${k.key} is gated by ${k.module}, not ${m}`).toBe(true);
    }
  });
  it('approval kinds', () => {
    once((m) => m.approvals, ['leave', 'fee_waiver', 'admission', 'notice', 'attendance', 'photo', 'receipt_cancel'], 'Approval kind');
  });
});

describe('every module is whole', () => {
  it('a built module has a page or says why not, and its pieces name real features', () => {
    for (const m of MODULES.filter((x) => x.state !== 'planned')) {
      expect(m.pages.length + m.app.length, `${m.key} has neither an admin page nor an app piece`).toBeGreaterThan(0);
      for (const f of [...m.pages.map((p) => p.feature), ...m.pages.flatMap((p) => p.tabs ?? []).map((t) => t.feature), ...m.app.map((a) => a.feature), ...m.dashboard.map((d) => d.feature)]) {
        // A piece is gated by a feature of its own module, or (a report or a tab that reads another module's data) by that whole module.
        if (f) expect(featureByKey(f)?.module === m.key || !!moduleByKey(f), `${m.key} names ${f}`).toBe(true);
      }
    }
  });
  it('a planned module has nothing built', () => {
    for (const m of MODULES.filter((x) => x.state === 'planned')) {
      expect([m.pages, m.app, m.settings, m.permissions, m.messages, m.imports, m.approvals, m.dashboard].every((l) => !l.length), m.key).toBe(true);
    }
  });
  it('pages: unique ids, paths and shortcut letters', () => {
    for (const k of ['id', 'path', 'keys'] as const) {
      const v = ADMIN_PAGES.map((p) => p[k]);
      expect(v.filter((x, i) => v.indexOf(x) !== i), k).toEqual([]);
    }
  });
  it('app pieces: unique per slot, every role can be laid out, and the default layouts use only what exists', () => {
    expect([...APP_ROLES]).toEqual([...APP_ROLE_KEYS]);
    for (const slot of ['dock', 'home', 'quick'] as const) {
      const keys = APP_CATALOG[slot].map((p) => p.key);
      expect(keys.filter((x, i) => keys.indexOf(x) !== i), slot).toEqual([]);
      for (const role of APP_ROLES) {
        for (const k of DEFAULT_APP_LAYOUT[role][slot]) expect(APP_CATALOG[slot].find((p) => p.key === k)?.roles, `${role} ${slot} ${k}`).toContain(role);
      }
    }
  });
});
