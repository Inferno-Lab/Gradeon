import { describe, expect, it } from 'vitest';
import { activeFeatures, activeModules, changeEntitlement, closeModules, dependents, resolveConfig, validateSettingsChanges, DEFAULT_PLANS, MODULES } from './index.js';

const entitlement = (modules: string[], locks: string[] = [], overrides = {}) => ({
  plan: 'standard', modules, limits: { students: 100, storageGb: 1, smsPerMonth: 10 }, locks, overrides, version: 1,
});

describe('modules', () => {
  it('always keeps core modules and adds requirements', () => {
    expect(closeModules(['fees'])).toEqual(['school', 'people', 'fees']);
    expect(closeModules(['nonsense'])).toEqual(['school', 'people']);
  });
  it('reports what a switch-off would break', () => {
    expect(dependents('people', ['people', 'fees', 'notices'])).toEqual(['fees']);
  });
  it('every plan resolves to itself (no unknown modules)', () => {
    for (const p of DEFAULT_PLANS) expect(closeModules(p.modules)).toEqual(expect.arrayContaining(p.modules));
  });
  it('a module counts only within its dates', () => {
    const ent = { modules: ['fees', 'library'], dates: { library: { until: '2026-11-30' }, fees: { from: '2026-12-01' } } };
    expect(activeModules(ent, '2026-11-05')).toEqual(['school', 'people', 'library']);
    expect(activeModules(ent, '2026-12-01')).toEqual(['school', 'people', 'fees']);
  });
  it('built features are on unless taken away, planned ones never', () => {
    expect(activeFeatures({}, ['fees'])).toEqual(['fees.onlinePayment', 'fees.reminders', 'fees.lateFines', 'fees.gstReceipts', 'fees.refunds']);
    expect(activeFeatures({ features: { 'fees.onlinePayment': false, 'fees.concessions': true } }, ['fees'])).toEqual(['fees.reminders', 'fees.lateFines', 'fees.gstReceipts', 'fees.refunds']);
  });
  it('every catalogue key is unique and every feature is named after its module', () => {
    const keys = [...MODULES.map((m) => m.key), ...MODULES.flatMap((m) => m.features.map((f) => f.key))];
    expect(new Set(keys).size).toBe(keys.length);
    for (const m of MODULES) for (const f of m.features) expect(f.key.startsWith(m.key + '.')).toBe(true);
  });
});

describe('resolveConfig', () => {
  const settings = { version: 2, values: { 'school.name': 'Greenfield', 'school.shortName': 'GIS', 'brand.color': '#123456' }, locked: [], updatedAt: null };
  it('limits modules to the plan and filters the menu by permission', () => {
    const cfg = resolveConfig({ settings, entitlement: entitlement(['fees', 'notices']), audience: { permissions: ['students.read'] } });
    expect(cfg.modules).toEqual(['school', 'people', 'fees', 'notices']);
    expect(cfg.menu.flatMap((g) => g.pages.map((p) => p.label))).toEqual(['Dashboard', 'Students']);
  });
  it('builds the whole menu in group order, tabs with their own addresses, Moving in only before go-live', () => {
    const all = resolveConfig({ settings, entitlement: entitlement(['fees', 'library']), live: false });
    expect(all.menu.map((g) => g.group)).toEqual(['Home', 'People', 'Money', 'Campus', 'School']);
    expect(all.menu.find((g) => g.group === 'Money')!.pages[0]!.tabs.map((t) => t.href)).toEqual(['/fees/overview', '/fees/invoices', '/fees/receipts', '/fees/online', '/fees/structure']);
    expect(all.menu.flatMap((g) => g.pages.map((p) => p.id))).toContain('move');
    expect(resolveConfig({ settings, entitlement: entitlement(['fees']) }).menu.flatMap((g) => g.pages.map((p) => p.id))).not.toContain('move');
  });
  it('lays out each app role from what the school has', () => {
    const values = { ...settings.values, 'app.roles': ['parent', 'driver', 'nobody'], 'app.layout': { parent: { dock: ['home', 'fees', 'library'], home: [], quick: ['payFees'] }, student: { dock: ['home'], home: [], quick: [] }, teacher: { dock: [], home: [], quick: [] }, driver: { dock: ['trips'], home: [], quick: [] } } };
    const cfg = resolveConfig({ settings: { ...settings, values }, entitlement: entitlement(['fees']) });
    expect(cfg.app.roles).toEqual(['parent', 'driver']);
    expect(cfg.app.layout.parent).toEqual({ dock: ['home', 'fees'], home: [], quick: ['payFees'] });
    expect(cfg.app.layout.driver.dock).toEqual([]);
  });
  it('words: plurals from the console, or the usual English ending', () => {
    expect(resolveConfig({ settings: { ...settings, values: { ...settings.values, 'vocab.student': 'Child', 'vocab.students': 'Children' } }, entitlement: entitlement([]) }).vocabulary)
      .toEqual({ student: 'Child', students: 'Children', class: 'Class', classes: 'Classes' });
  });
  it('platform locks beat school values', () => {
    const cfg = resolveConfig({ settings, entitlement: entitlement(['fees'], ['brand.color'], { 'brand.color': '#ABCDEF' }) });
    expect(cfg.school.color).toBe('#ABCDEF');
  });
});

describe('validateSettingsChanges', () => {
  it('rejects unknown, locked and invalid values without applying any', () => {
    const r = validateSettingsChanges({ 'brand.color': 'red', 'school.name': 'Ok name', nope: 1, 'fees.lateFeePct': 5 }, ['fees.lateFeePct']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.map((p) => p.key).sort()).toEqual(['brand.color', 'fees.lateFeePct', 'nope']);
  });
});

describe('changeEntitlement', () => {
  const cur = { plan: 'standard', modules: ['people', 'fees', 'chat'], limits: { students: 100, storageGb: 1, smsPerMonth: 10 }, locks: [], overrides: {}, version: 3 };
  it('lists what a push takes away and adds, and keeps only real differences', () => {
    const r = changeEntitlement(cur, { modules: ['fees', 'library'], features: { 'fees.onlinePayment': false, 'fees.reminders': true } });
    expect(r.problems).toEqual([]);
    expect(r.removed).toEqual(['chat', 'fees.onlinePayment']);
    expect(r.added).toEqual(['library']);
    expect(r.next).toMatchObject({ modules: ['school', 'people', 'fees', 'library'], features: { 'fees.onlinePayment': false }, version: 4 });
  });
  it('refuses what is not built, bad dates and the core module', () => {
    expect(changeEntitlement(cur, { modules: ['hostel'] }).problems[0]).toMatch(/not built yet/);
    expect(changeEntitlement(cur, { features: { 'fees.concessions': true } }).problems[0]).toMatch(/not built yet/);
    expect(changeEntitlement(cur, { dates: { fees: { from: '2026-12-01', until: '2026-11-01' } } }).problems[0]).toMatch(/ends before it starts/);
    expect(changeEntitlement(cur, { dates: { fees: { until: '2020-01-01' } } }).removed).toEqual(['fees']);
  });
});
