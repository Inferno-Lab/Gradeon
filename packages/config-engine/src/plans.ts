import type { PlanRow } from '@gradeon/contracts';

/** Platform plans (section 12.3). The console stores a copy in the registry so prices can change without a release. */
export const DEFAULT_PLANS: PlanRow[] = [
  {
    key: 'starter',
    name: 'Starter',
    perStudentYear: 300,
    modules: ['people', 'attendance', 'notices', 'timetable'],
    limits: { students: 500, storageGb: 5, smsPerMonth: 1000 },
  },
  {
    key: 'standard',
    name: 'Standard',
    perStudentYear: 450,
    modules: ['people', 'attendance', 'fees', 'notices', 'timetable', 'homework', 'events', 'exams'],
    limits: { students: 1500, storageGb: 25, smsPerMonth: 5000 },
  },
  {
    key: 'premium',
    name: 'Premium',
    perStudentYear: 650,
    modules: ['people', 'attendance', 'fees', 'notices', 'timetable', 'homework', 'events', 'exams', 'chat', 'transport', 'library', 'gallery'],
    limits: { students: 5000, storageGb: 100, smsPerMonth: 20000 },
  },
];
