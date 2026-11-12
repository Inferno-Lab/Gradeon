// Writes assets/mock/config.json: what `/v1/config` answers for the sample school, resolved by the same config engine and the
// same setting defaults the server uses, so the app on sample content behaves exactly like a real school with every module.
// Run after changing modules, settings or their defaults:
//   pnpm --filter @gradeon/contracts --filter @gradeon/config-engine build && node tools/gen-app-config.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { MODULES, resolveConfig } from '../packages/config-engine/dist/index.js';

const info = JSON.parse(readFileSync(new URL('../assets/mock/school_info.json', import.meta.url), 'utf8'));
const settings = {
  version: 1,
  locked: [],
  updatedAt: null,
  values: {
    'school.name': info.name, 'school.shortName': 'Greenfield', 'school.tagline': info.tagline, 'school.place': 'Pune', 'school.address': info.address,
    'school.phone': info.phone, 'school.email': info.email, 'brand.color': '#6A4CF5', 'brand.logoText': 'G',
    // The sample school shows every role, so each can be tried from the demo card.
    'app.roles': ['parent', 'student', 'teacher', 'driver'],
    'people.houses': [
      { key: 'emerald', name: 'Emerald', color: '#2E9E6A' }, { key: 'sapphire', name: 'Sapphire', color: '#3D6FE0' },
      { key: 'ruby', name: 'Ruby', color: '#D64545' }, { key: 'amber', name: 'Amber', color: '#E0A030' },
    ],
    'privacy.officerName': 'Dr. Anil Kulkarni', 'privacy.officerEmail': info.email,
    // The sample school teaches every day, so every weekday has content (AGENTS.md rule 12).
    'calendar.weeklyOff': [],
  },
};
const entitlement = { plan: 'premium', modules: MODULES.filter((m) => m.state !== 'planned').map((m) => m.key), limits: { students: 5000, storageGb: 100, smsPerMonth: 20000 }, locks: [], overrides: {}, version: 1 };
const cfg = resolveConfig({ settings, entitlement });
// The app reads what it needs; the admin menu is not one of them.
const { menu: _menu, ...forApp } = cfg;
writeFileSync(new URL('../assets/mock/config.json', import.meta.url), `${JSON.stringify(forApp, null, 2)}\n`);
console.log('wrote assets/mock/config.json');
