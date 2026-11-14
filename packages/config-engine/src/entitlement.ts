import type { EntitlementDoc, Limits, ModuleDates } from '@tangent/contracts';
import { activeFeatures, activeModules, closeModules, featureByKey, moduleByKey, CORE_MODULES } from './modules.js';

/** What the console may change in one push. Fields left out keep their current value. */
export interface EntitlementChange {
  plan?: string;
  modules?: string[];
  features?: Record<string, boolean>;
  dates?: Record<string, ModuleDates>;
  trialUntil?: string | null;
  limits?: Limits;
  locks?: string[];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Applies a console change to a school's entitlement. Returns the new document, what it takes away (modules or features the
 * school has today and would lose: those need a second person) and what it adds, or the problems that stop it.
 */
export function changeEntitlement(cur: EntitlementDoc, change: EntitlementChange, planLimits?: Limits): { next: EntitlementDoc; removed: string[]; added: string[]; problems: string[] } {
  const problems: string[] = [];
  for (const k of change.modules ?? []) {
    const m = moduleByKey(k);
    if (!m) problems.push(`There is no module “${k}”.`);
    else if (m.state === 'planned' && !cur.modules.includes(k)) problems.push(`${m.name} is not built yet, so it cannot be switched on.`);
  }
  for (const [k, on] of Object.entries(change.features ?? {})) {
    const f = featureByKey(k);
    if (!f) problems.push(`There is no feature “${k}”.`);
    else if (on && f.state === 'planned') problems.push(`${f.name} is not built yet, so it cannot be switched on.`);
  }
  for (const [k, d] of Object.entries(change.dates ?? {})) {
    if (!moduleByKey(k)) problems.push(`There is no module “${k}”.`);
    if ((d.from && !DAY.test(d.from)) || (d.until && !DAY.test(d.until))) problems.push('Write dates as YYYY-MM-DD.');
    else if (d.from && d.until && d.from > d.until) problems.push(`${moduleByKey(k)?.name ?? k} ends before it starts.`);
  }
  if (change.trialUntil && !DAY.test(change.trialUntil)) problems.push('Write the trial end as YYYY-MM-DD.');
  const lim = change.limits;
  if (lim && [lim.students, lim.storageGb, lim.smsPerMonth, lim.staff ?? 0].some((n) => !Number.isInteger(n) || n < 0)) problems.push('Limits are whole numbers, zero or more.');

  const modules = change.modules ? closeModules(change.modules) : cur.modules;
  // A feature switched back to its default is dropped, so the document only lists real differences.
  const features = Object.fromEntries(Object.entries({ ...cur.features, ...change.features }).filter(([, on]) => on === false));
  const dates = Object.fromEntries(Object.entries({ ...cur.dates, ...change.dates }).filter(([, d]) => d.from || d.until));
  const trialUntil = change.trialUntil === undefined ? cur.trialUntil : change.trialUntil || undefined;
  const next: EntitlementDoc = {
    ...cur, plan: change.plan ?? cur.plan, modules, features, dates, limits: lim ?? (change.plan && change.plan !== cur.plan && planLimits ? planLimits : cur.limits),
    locks: change.locks ?? cur.locks, version: cur.version + 1,
  };
  if (trialUntil) next.trialUntil = trialUntil; else delete next.trialUntil;

  const before = activeModules(cur);
  const after = activeModules(next);
  const fBefore = activeFeatures(cur, before);
  const fAfter = activeFeatures(next, after);
  const removed = [...before.filter((k) => !after.includes(k)), ...fBefore.filter((k) => !fAfter.includes(k) && after.includes(featureByKey(k)!.module))];
  const added = [...after.filter((k) => !before.includes(k)), ...fAfter.filter((k) => !fBefore.includes(k) && before.includes(featureByKey(k)!.module))];
  if (removed.some((k) => CORE_MODULES.includes(k))) problems.push('The core module cannot be taken away.');
  return { next, removed, added, problems };
}

/** A catalogue key as people read it: “Library”, or “Fees: Families pay in the app”. */
export function catalogueName(key: string): string {
  const f = featureByKey(key);
  return f ? `${moduleByKey(f.module)?.name ?? f.module}: ${f.name}` : moduleByKey(key)?.name ?? key;
}
