import {
  SchoolSettingsSchema,
  plural,
  type EffectiveConfig,
  type EntitlementDoc,
  type Permission,
  type SettingsDoc,
} from '@gradeon/contracts';
import { APP_CATALOG, activeFeatures, activeModules, closeModules, moduleByKey } from './modules.js';

/** Layer 1: platform defaults, taken from the schema so there is one source. */
export function platformDefaults(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(SchoolSettingsSchema.shape)) {
    const parsed = (field as { safeParse: (v: unknown) => { success: boolean; data?: unknown } }).safeParse(undefined);
    if (parsed.success) out[key] = parsed.data;
  }
  return out;
}

export interface ResolveInput {
  /** Layer 4, as saved by the school. */
  settings: SettingsDoc;
  /** Layers 2 and 3. */
  entitlement: EntitlementDoc;
  /** Layer 5: who is asking. Leave out for the unfiltered document. */
  audience?: { permissions: readonly string[] };
  /** Console flags for this school: a school's own value already wins over a fleet-wide one. */
  flags?: Record<string, boolean>;
}

/** Layers 1 to 5 in order. A higher layer changes a value only where the lower layer allows it (locks). */
export function resolveConfig({ settings, entitlement, audience, flags }: ResolveInput): EffectiveConfig {
  const locked = new Set([...entitlement.locks, ...settings.locked]);
  const merged: Record<string, unknown> = { ...platformDefaults() };
  for (const [k, v] of Object.entries(settings.values)) if (!entitlement.locks.includes(k)) merged[k] = v;
  for (const [k, v] of Object.entries(entitlement.overrides)) merged[k] = v;
  for (const k of locked) if (k in entitlement.overrides) merged[k] = entitlement.overrides[k];

  const entitled = activeModules(entitlement);
  const chosen = Array.isArray(merged['modules.enabled']) && (merged['modules.enabled'] as string[]).length
    ? (merged['modules.enabled'] as string[])
    : entitled;
  // A console kill switch (`kill.<module>`) takes a module away from every app until it is lifted.
  const enabled = closeModules(chosen).filter((k) => entitled.includes(k) && flags?.[`kill.${k}`] !== true);

  const perms = audience ? new Set(audience.permissions as string[]) : null;
  const nav: EffectiveConfig['nav'] = [];
  for (const key of enabled) {
    for (const n of moduleByKey(key)?.nav ?? []) {
      if (perms && !n.anyOf.some((p: Permission) => perms.has(p))) continue;
      const student = typeof merged['vocab.student'] === 'string' && (merged['vocab.student'] as string).trim() ? (merged['vocab.student'] as string).trim() : 'Student';
      nav.push({ module: key, label: n.label === 'Students' ? plural(student) : n.label, icon: n.icon, href: n.href });
    }
  }

  const pick = (key: 'dock' | 'home' | 'quick', setting: string): string[] => {
    const allowed = new Set<string>(APP_CATALOG[key].filter((c) => enabled.includes(c.module)).map((c) => c.key));
    const chosen = Array.isArray(merged[setting]) ? (merged[setting] as string[]) : [];
    return chosen.filter((k) => allowed.has(k));
  };
  const str = (k: string, fallback = '') => (typeof merged[k] === 'string' ? (merged[k] as string) : fallback);
  return {
    version: settings.version * 1000 + entitlement.version,
    school: {
      name: str('school.name'),
      shortName: str('school.shortName'),
      color: str('brand.color', '#6A4CF5'),
      logoText: str('brand.logoText') || str('school.shortName').slice(0, 1).toUpperCase(),
      language: str('school.language', 'en'),
      tagline: str('school.tagline'),
    },
    modules: enabled,
    features: activeFeatures(entitlement, enabled),
    nav,
    settings: merged,
    vocabulary: { student: str('vocab.student', 'Student'), class: str('vocab.class', 'Class') },
    limits: entitlement.limits,
    app: { dock: pick('dock', 'app.dock'), home: pick('home', 'app.home'), quick: pick('quick', 'app.quick') },
    flags: flags ?? {},
  };
}

export interface SettingsProblem {
  key: string;
  message: string;
}

/** Checks a patch against the schema and the locks. Returns the clean values or the problems, never a half-applied change. */
export function validateSettingsChanges(
  changes: Record<string, unknown>,
  locked: readonly string[],
): { ok: true; values: Record<string, unknown> } | { ok: false; problems: SettingsProblem[] } {
  const problems: SettingsProblem[] = [];
  const values: Record<string, unknown> = {};
  const shape = SchoolSettingsSchema.shape as Record<string, { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: { issues: { message: string }[] } } }>;
  for (const [key, raw] of Object.entries(changes)) {
    const field = shape[key];
    if (!field) {
      problems.push({ key, message: 'That setting does not exist.' });
      continue;
    }
    if (locked.includes(key)) {
      problems.push({ key, message: 'Gradeon has fixed this setting for your school.' });
      continue;
    }
    const res = field.safeParse(raw);
    if (!res.success) problems.push({ key, message: res.error?.issues[0]?.message ?? 'That value is not allowed.' });
    else values[key] = key === 'modules.enabled' ? closeModules(res.data as string[]) : res.data;
  }
  return problems.length ? { ok: false, problems } : { ok: true, values };
}

export function diffSettings(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { key: string; from: unknown; to: unknown }[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: { key: string; from: unknown; to: unknown }[] = [];
  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) out.push({ key, from: before[key], to: after[key] });
  }
  return out;
}

/** Contrast ratio of two #RRGGBB colours (WCAG). Used by branding checks in the wizard and settings. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
