import { z } from 'zod';

/**
 * Every action a role can be allowed to do. The admin hides UI and the API refuses requests from this one list.
 * Nothing here changes the school's configuration or roles: only Gradeon does that, from the console.
 */
export const PERMISSIONS = [
  'students.read',
  'students.write',
  'attendance.read',
  'attendance.mark',
  'fees.read',
  'fees.collect',
  'fees.waive',
  'notices.read',
  'notices.write',
  'notices.publish',
  'approvals.read',
  'approvals.decide',
  'timetable.read',
  'timetable.edit',
  'timetable.publish',
  'settings.read',
  'privacy.manage',
  'staff.read',
  'staff.write',
  'audit.read',
  'reports.read',
  'homework.read',
  'homework.write',
  'exams.read',
  'exams.write',
  'exams.publish',
  'admissions.read',
  'admissions.write',
  'messages.read',
  'messages.write',
  'events.read',
  'events.write',
] as const;
export const Permission = z.enum(PERMISSIONS);
export type Permission = z.infer<typeof Permission>;

export interface PermissionInfo {
  key: Permission;
  area: string;
  label: string;
  /** Needs a second person to approve when the school turns approvals on. */
  sensitive?: boolean;
}

export const PERMISSION_CATALOG: PermissionInfo[] = [
  { key: 'students.read', area: 'People', label: 'See students and guardians' },
  { key: 'students.write', area: 'People', label: 'Add and edit students' },
  { key: 'staff.read', area: 'People', label: 'See staff' },
  { key: 'staff.write', area: 'People', label: 'Add and edit staff', sensitive: true },
  { key: 'attendance.read', area: 'Attendance', label: 'See attendance' },
  { key: 'attendance.mark', area: 'Attendance', label: 'Mark attendance' },
  { key: 'fees.read', area: 'Fees', label: 'See fees and payments' },
  { key: 'fees.collect', area: 'Fees', label: 'Record payments' },
  { key: 'fees.waive', area: 'Fees', label: 'Waive or reduce fees', sensitive: true },
  { key: 'notices.read', area: 'Notices', label: 'See notices' },
  { key: 'notices.write', area: 'Notices', label: 'Write notices' },
  { key: 'notices.publish', area: 'Notices', label: 'Publish notices to families' },
  { key: 'approvals.read', area: 'Approvals', label: 'See the approvals queue' },
  { key: 'approvals.decide', area: 'Approvals', label: 'Approve or decline requests' },
  { key: 'timetable.read', area: 'Timetable', label: 'See the timetable' },
  { key: 'timetable.edit', area: 'Timetable', label: 'Edit periods and cover' },
  { key: 'timetable.publish', area: 'Timetable', label: 'Publish the timetable' },
  { key: 'settings.read', area: 'Settings', label: 'See how Gradeon has set up the school' },
  { key: 'privacy.manage', area: 'Settings', label: 'Log and answer families’ data requests', sensitive: true },
  { key: 'audit.read', area: 'Settings', label: 'Read the audit log' },
  { key: 'reports.read', area: 'Reports', label: 'See reports' },
  { key: 'homework.read', area: 'Homework', label: 'See homework' },
  { key: 'homework.write', area: 'Homework', label: 'Set homework and record hand-ins' },
  { key: 'exams.read', area: 'Exams', label: 'See exams and results' },
  { key: 'exams.write', area: 'Exams', label: 'Create exams and enter marks' },
  { key: 'exams.publish', area: 'Exams', label: 'Publish results to families', sensitive: true },
  { key: 'admissions.read', area: 'Admissions', label: 'See enquiries and applications' },
  { key: 'admissions.write', area: 'Admissions', label: 'Move applications and enrol students' },
  { key: 'messages.read', area: 'Messages', label: 'See family messages' },
  { key: 'messages.write', area: 'Messages', label: 'Write to families' },
  { key: 'events.read', area: 'Events', label: 'See the calendar' },
  { key: 'events.write', area: 'Events', label: 'Add and change events' },
];

export interface RoleTemplate {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
}

const ALL: Permission[] = [...PERMISSIONS];

export const ROLE_TEMPLATES: RoleTemplate[] = [
  { key: 'principal', name: 'Principal', description: 'Everything in the school.', permissions: ALL },
  {
    key: 'office',
    name: 'Office staff',
    description: 'Admissions, people, notices and the timetable.',
    permissions: [
      'students.read', 'students.write', 'staff.read', 'attendance.read', 'notices.read', 'notices.write',
      'approvals.read', 'timetable.read', 'timetable.edit', 'reports.read', 'admissions.read', 'admissions.write', 'messages.read', 'messages.write',
      'events.read', 'events.write', 'homework.read', 'exams.read',
    ],
  },
  {
    key: 'accountant',
    name: 'Accountant',
    description: 'Fees, payments and reports.',
    permissions: ['students.read', 'fees.read', 'fees.collect', 'reports.read', 'notices.read', 'events.read'],
  },
  {
    key: 'teacher',
    name: 'Teacher',
    description: 'Marks attendance and sees their classes.',
    permissions: [
      'students.read', 'attendance.read', 'attendance.mark', 'notices.read', 'timetable.read', 'homework.read', 'homework.write', 'exams.read', 'exams.write',
      'messages.read', 'messages.write', 'events.read',
    ],
  },
];

export function hasPermission(granted: readonly string[], needed: Permission): boolean {
  return granted.includes(needed);
}
