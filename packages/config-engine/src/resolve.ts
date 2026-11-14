import {
  SchoolSettingsSchema,
  plural,
  type AppLayout,
  type EffectiveConfig,
  type EntitlementDoc,
  type SettingsDoc,
} from '@tangent/contracts';
import { APP_CATALOG, APP_ROLES, activeFeatures, activeModules, adminMenu, hasKey, type AppRole } from './modules.js';

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
  /** Whether the school has gone live (Moving in leaves the menu then). */
  live?: boolean;
}

/** Layers 1 to 5 in order. A higher layer changes a value only where the lower layer allows it (locks). */
export function resolveConfig({ settings, entitlement, audience, flags, live = true }: ResolveInput): EffectiveConfig {
  const locked = new Set([...entitlement.locks, ...settings.locked]);
  const merged: Record<string, unknown> = { ...platformDefaults() };
  for (const [k, v] of Object.entries(settings.values)) if (!entitlement.locks.includes(k)) merged[k] = v;
  for (const [k, v] of Object.entries(entitlement.overrides)) merged[k] = v;
  for (const k of locked) if (k in entitlement.overrides) merged[k] = entitlement.overrides[k];

  const entitled = activeModules(entitlement);
  // A console kill switch (`kill.<module>`) takes a module away from every app until it is lifted.
  const enabled = entitled.filter((k) => flags?.[`kill.${k}`] !== true);
  const features = activeFeatures(entitlement, enabled);
  const has = { modules: enabled, features };
  const str = (k: string, fallback = '') => (typeof merged[k] === 'string' ? (merged[k] as string) : fallback);
  const words = vocabulary(merged);

  const menu: EffectiveConfig['menu'] = adminMenu(has, audience ? audience.permissions : null, live).map((g) => ({
    group: g.group,
    pages: g.pages.map((p) => ({
      id: p.id, module: p.module, icon: p.icon, keys: p.keys, href: p.path,
      label: p.id === 'stu' ? words.students : p.label,
      tabs: (p.tabs ?? []).map((t) => ({ key: t.key, label: t.key === 'classes' ? words.classes : t.label, href: `${p.path === '/' ? '' : p.path}/${t.key}` })),
    })),
  }));

  const roles = (Array.isArray(merged['app.roles']) ? (merged['app.roles'] as AppRole[]) : []).filter((r) => APP_ROLES.includes(r));
  const saved = (merged['app.layout'] ?? {}) as Partial<Record<AppRole, AppLayout>>;
  const layout = Object.fromEntries(APP_ROLES.map((role) => {
    const pick = (slot: 'dock' | 'home' | 'quick') => {
      const allowed = new Set(APP_CATALOG[slot].filter((c) => c.roles.includes(role) && enabled.includes(c.module) && hasKey(has, c.feature)).map((c) => c.key));
      return (saved[role]?.[slot] ?? []).filter((k) => allowed.has(k));
    };
    return [role, { dock: pick('dock'), home: pick('home'), quick: pick('quick') }];
  })) as Record<AppRole, AppLayout>;

  return {
    version: settings.version * 1000 + entitlement.version,
    school: {
      name: str('school.name'),
      shortName: str('school.shortName'),
      color: str('brand.color', '#6A4CF5'),
      logoText: str('brand.logoText') || str('school.shortName').slice(0, 1).toUpperCase(),
      language: str('school.language', 'en'),
      tagline: str('school.tagline'),
      place: str('school.place'),
      address: str('school.address'),
      phone: str('school.phone'),
      email: str('school.email'),
    },
    modules: enabled,
    features,
    menu,
    settings: merged,
    vocabulary: words,
    limits: entitlement.limits,
    app: { roles, layout },
    privacy: { notice: str('privacy.notice'), officerName: str('privacy.officerName'), officerEmail: str('privacy.officerEmail'), officerPhone: str('privacy.officerPhone') },
    flags: flags ?? {},
  };
}

/** What the school calls a student and a class, one and many. */
export function vocabulary(values: Record<string, unknown>): { student: string; students: string; class: string; classes: string } {
  const word = (k: string, fallback: string) => (typeof values[k] === 'string' && (values[k] as string).trim() ? (values[k] as string).trim() : fallback);
  const student = word('vocab.student', 'Student');
  const cls = word('vocab.class', 'Class');
  return { student, students: word('vocab.students', plural(student)), class: cls, classes: word('vocab.classes', plural(cls)) };
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
      problems.push({ key, message: 'Tangent has fixed this setting for your school.' });
      continue;
    }
    const res = field.safeParse(raw);
    if (!res.success) problems.push({ key, message: res.error?.issues[0]?.message ?? 'That value is not allowed.' });
    else values[key] = res.data;
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

