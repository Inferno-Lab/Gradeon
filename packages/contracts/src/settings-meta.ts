import type { SettingKey } from './config.js';

/** How the console edits a setting. The console builds its Configuration forms from this list, so a new setting needs no new screen. */
export type SettingKind =
  | 'text' | 'textarea' | 'number' | 'bool' | 'enum' | 'color' | 'time' | 'date' | 'language'
  | 'modules' | 'appDock' | 'appHome' | 'appQuick' | 'notifyRules' | 'templates' | 'class' | 'classes';

export interface SettingMeta {
  group: (typeof SETTING_GROUPS)[number];
  label: string;
  help?: string;
  kind: SettingKind;
  options?: [value: string, label: string][];
  min?: number;
  max?: number;
  /** A change needs a second person's approval in the console. */
  risky?: true;
  /** Saved and shown, but nothing acts on it yet: the console says so instead of pretending. */
  notUsedYet?: string;
}

export const SETTING_GROUPS = ['Identity and branding', 'Modules', 'The app', 'Rules', 'Messages', 'Security', 'Privacy', 'People', 'Fees', 'Academic year', 'Dashboard', 'Deployment'] as const;

export const SETTINGS_META: Record<SettingKey, SettingMeta> = {
  'school.name': { group: 'Identity and branding', label: 'School name', kind: 'text', help: 'On the sign-in pages, the app, receipts and report cards.' },
  'school.shortName': { group: 'Identity and branding', label: 'Short name', kind: 'text', help: 'Where space is tight: the app’s header, messages.' },
  'school.tagline': { group: 'Identity and branding', label: 'Tagline', kind: 'text' },
  'school.place': { group: 'Identity and branding', label: 'Town or city', kind: 'text' },
  'school.phone': { group: 'Identity and branding', label: 'Office phone', kind: 'text' },
  'school.email': { group: 'Identity and branding', label: 'Office email', kind: 'text' },
  'school.address': { group: 'Identity and branding', label: 'Address', kind: 'textarea' },
  'school.language': { group: 'Identity and branding', label: 'Default language', kind: 'language', options: [['en', 'English'], ['hi', 'हिन्दी (Hindi)'], ['mr', 'मराठी (Marathi)']] },
  'brand.color': { group: 'Identity and branding', label: 'Brand colour', kind: 'color', help: 'Checked against white for readability.', notUsedYet: 'The admin and the app keep the Gradeon colours for now.' },
  'brand.logoText': { group: 'Identity and branding', label: 'Logo letters', kind: 'text', help: 'One or two letters, until a logo image is uploaded.' },
  'modules.enabled': { group: 'Modules', label: 'Switched on', kind: 'modules', help: 'Within what the plan includes (Entitlements). A module needs the ones it builds on.' },
  'app.dock': { group: 'The app', label: 'Tabs along the bottom', kind: 'appDock', max: 4, help: 'For families, in this order; Profile is always last. Teachers keep their own tabs.' },
  'app.home': { group: 'The app', label: 'Home screen cards', kind: 'appHome', max: 12, help: 'The app shows Today’s timetable, Fees due and Attendance this month when they are listed; their order on Home is fixed, and the other cards are not in the app yet.' },
  'app.quick': { group: 'The app', label: 'Quick buttons', kind: 'appQuick', max: 6, notUsedYet: 'The app has no quick buttons yet.' },
  'approvals.feeWaiver': { group: 'Rules', label: 'Who approves fee waivers', kind: 'enum', options: [['principal', 'The principal only'], ['office', 'The principal or the office'], ['anyone', 'Anyone allowed to approve']] },
  'approvals.notice': { group: 'Rules', label: 'Notices need approval before they go out', kind: 'enum', options: [['required', 'Yes, unless written by someone allowed to publish'], ['off', 'No']] },
  'attendance.notifyParents': { group: 'Rules', label: 'Tell families when a child is absent or late', kind: 'bool' },
  'attendance.lockAfterDays': { group: 'Rules', label: 'Attendance can be changed for this many days', kind: 'number', min: 0, max: 30 },
  'notify.rules': { group: 'Messages', label: 'Which message goes where', kind: 'notifyRules' },
  'notify.quietFrom': { group: 'Messages', label: 'Quiet hours start', kind: 'time', help: 'Only urgent messages (absence) go out in quiet hours.' },
  'notify.quietTo': { group: 'Messages', label: 'Quiet hours end', kind: 'time' },
  'templates.messages': { group: 'Messages', label: 'Wording of each message', kind: 'templates' },
  'security.twoFactor': { group: 'Security', label: 'Staff confirm sign-in with a code', kind: 'bool', risky: true, help: 'Turning this off weakens every staff account.' },
  'security.passwordMinLength': { group: 'Security', label: 'Shortest password allowed', kind: 'number', min: 8, max: 64 },
  'security.webSessionDays': { group: 'Security', label: 'Admin sign-in lasts (days)', kind: 'number', min: 1, max: 30 },
  'security.appSessionDays': { group: 'Security', label: 'App sign-in lasts (days)', kind: 'number', min: 1, max: 90 },
  'privacy.notice': { group: 'Privacy', label: 'Privacy notice', kind: 'textarea', notUsedYet: 'Not shown to families yet.' },
  'privacy.officerName': { group: 'Privacy', label: 'Grievance officer', kind: 'text', notUsedYet: 'Not shown to families yet.' },
  'privacy.officerEmail': { group: 'Privacy', label: 'Grievance officer’s email', kind: 'text', notUsedYet: 'Not shown to families yet.' },
  'privacy.officerPhone': { group: 'Privacy', label: 'Grievance officer’s phone', kind: 'text', notUsedYet: 'Not shown to families yet.' },
  'privacy.retentionMonths': { group: 'Privacy', label: 'Keep records of students who left for (months)', kind: 'number', min: 12, max: 120, risky: true, notUsedYet: 'Nothing deletes old records yet.' },
  'privacy.photoConsent': { group: 'Privacy', label: 'Ask for photo consent', kind: 'bool', notUsedYet: 'The gallery is not live yet.' },
  'privacy.consentRequired': { group: 'Privacy', label: 'Families must consent before using the app', kind: 'bool', notUsedYet: 'The app does not ask yet.' },
  'classes.schoolEdits': { group: 'Academic year', label: 'The school may edit its classes, subjects and periods', kind: 'bool', help: 'Off: only Gradeon changes them (Migration, or the school asks).' },
  'calendar.schoolEdits': { group: 'Academic year', label: 'The school may edit its terms and holidays', kind: 'bool', help: 'Off: only Gradeon changes them.' },
  'feeStructures.schoolEdits': { group: 'Fees', label: 'The school may edit its fee structures', kind: 'bool', help: 'Off: only Gradeon changes what each grade pays.' },
  'timetable.schoolEdits': { group: 'Academic year', label: 'The school may edit its own timetable', kind: 'bool', help: 'Off: the timetable is locked and only Gradeon changes it. Covering an absent teacher for a day is always allowed.' },
  'staff.schoolAssignsRoles': { group: 'People', label: 'The school may put its staff into roles', kind: 'bool', help: 'Roles themselves are always made here. Off: only Gradeon assigns roles to people.' },
  'vocab.student': { group: 'People', label: 'What the school calls a student', kind: 'text', notUsedYet: 'The screens do not use it yet.' },
  'vocab.class': { group: 'People', label: 'What the school calls a class', kind: 'text', notUsedYet: 'The screens do not use it yet.' },
  'fees.receiptPrefix': { group: 'Fees', label: 'Receipt number prefix', kind: 'text', help: '{year} becomes the year, for example RCPT-{year}-.' },
  'fees.receiptStart': { group: 'Fees', label: 'First receipt number', kind: 'number', min: 1, max: 99_999_999, help: 'For a school arriving from another system: carry on from its last receipt.' },
  'fees.lateFeePct': { group: 'Fees', label: 'Late fee (%)', kind: 'number', min: 0, max: 25, notUsedYet: 'No late fee is charged yet.' },
  'fees.remindDaysBefore': { group: 'Fees', label: 'Remind families this many days before a due date', kind: 'number', min: 0, max: 30, notUsedYet: 'Reminders are sent by staff from the overdue list; nothing sends them on a schedule yet.' },
  'term.name': { group: 'Academic year', label: 'Current term', kind: 'text', help: 'Shown in the admin menu.' },
  'term.examsStart': { group: 'Academic year', label: 'Exams start on', kind: 'date', help: 'The admin counts down to it.' },
  'fees.dailyTarget': { group: 'Dashboard', label: 'Daily fee collection target (₹)', kind: 'number', min: 0, max: 100_000_000 },
  'attendance.goalPct': { group: 'Dashboard', label: 'Attendance goal (%)', kind: 'number', min: 50, max: 100 },
  'homework.goalPct': { group: 'Dashboard', label: 'Homework on time goal (%)', kind: 'number', min: 50, max: 100 },
  'dashboard.rollClasses': { group: 'Dashboard', label: 'Classes on the roll-call card', kind: 'classes', max: 8 },
  'students.pinnedClass': { group: 'Dashboard', label: 'Class the Students page opens on', kind: 'class' },
  'demo.mode': { group: 'Deployment', label: 'Demo school', kind: 'bool', risky: true, help: 'Shows demo sign-in cards and hands out the demo code. Never on a real school.' },
};
