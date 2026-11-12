import type { SettingKey } from './config.js';

/** How the console edits a setting. The console builds its Configuration forms from this list, so a new setting needs no new screen. */
export type SettingKind =
  | 'text' | 'textarea' | 'number' | 'bool' | 'enum' | 'color' | 'time' | 'date' | 'language'
  | 'multi' | 'appRoles' | 'appLayout' | 'notifyRules' | 'templates' | 'classes' | 'logo'
  | 'houses' | 'categories' | 'strings' | 'gradingScale';

export interface SettingMeta {
  /** One of the school-wide groups, or the key of the module that owns the setting (config-engine's MODULES lists it there too). */
  group: SchoolWideGroup | (string & {});
  label: string;
  help?: string;
  kind: SettingKind;
  options?: [value: string, label: string][];
  min?: number;
  max?: number;
  /** A change needs a second person's approval in the console. */
  risky?: true;
  /** Saved, but nothing acts on it yet: the console hides it unless asked (AGENTS.md: a new setting is marked until it is used). */
  notUsedYet?: true;
}

/** Settings that belong to the whole school rather than one module (docs/product-map.md §5). */
export const SETTING_GROUPS = ['School identity', 'Look', 'The app', 'Sign-in and security', 'Privacy', 'Messaging'] as const;
export type SchoolWideGroup = (typeof SETTING_GROUPS)[number];

/** The languages the apps and messages come in: the one list every page offers. */
export const LANGUAGES: [string, string][] = [['en', 'English'], ['hi', 'हिन्दी (Hindi)'], ['mr', 'मराठी (Marathi)']];

export const SETTINGS_META: Record<SettingKey, SettingMeta> = {
  'school.name': { group: 'School identity', label: 'School name', kind: 'text', help: 'On the sign-in pages, the app, receipts and report cards.' },
  'school.shortName': { group: 'School identity', label: 'Short name', kind: 'text', help: 'Where space is tight: the app’s header, messages.' },
  'school.tagline': { group: 'School identity', label: 'Tagline', kind: 'text' },
  'school.place': { group: 'School identity', label: 'Town or city', kind: 'text' },
  'school.phone': { group: 'School identity', label: 'Office phone', kind: 'text', help: 'The app’s Help and the transport page call it.' },
  'school.email': { group: 'School identity', label: 'Office email', kind: 'text', help: 'The app’s Help writes to it.' },
  'school.address': { group: 'School identity', label: 'Address', kind: 'textarea', help: 'On receipts, report cards and the app’s Help.' },
  'school.language': { group: 'School identity', label: 'Default language', kind: 'language', options: LANGUAGES },
  'brand.logoText': { group: 'School identity', label: 'Logo letters', kind: 'text', help: 'One or two letters, until a logo image is uploaded.' },
  'brand.logoFileId': { group: 'School identity', label: 'Logo image', kind: 'logo', help: 'A square PNG or JPEG. Shown in the admin menu, on the sign-in pages, receipts and the app.' },
  'brand.color': { group: 'Look', label: 'Brand colour', kind: 'color', help: 'Every colour of the school’s admin, sign-in pages and app is worked out from this colour’s hue (Gradeon Hue), in light, dark and AMOLED. Any colour reads well: the contrast is checked for every hue.' },
  'app.roles': { group: 'The app', label: 'Who uses the app', kind: 'appRoles', help: 'A role that is off cannot sign in to the app and is told to ask the school. Staff always have the admin.' },
  'app.layout': { group: 'The app', label: 'What each role sees', kind: 'appLayout', help: 'For each role: up to four bottom tabs (Profile is always added last), the Home cards and the quick buttons, in order. Only what the school’s modules offer that role can be chosen.' },
  'app.languages': { group: 'The app', label: 'Languages offered', kind: 'multi', options: LANGUAGES, help: 'The app’s language choices. Someone who picked one taken away gets the school’s default.' },
  'security.twoFactor': { group: 'Sign-in and security', label: 'Staff confirm sign-in with a code', kind: 'bool', risky: true, help: 'Turning this off weakens every staff account.' },
  'security.passwordMinLength': { group: 'Sign-in and security', label: 'Shortest password allowed', kind: 'number', min: 8, max: 64 },
  'security.webSessionDays': { group: 'Sign-in and security', label: 'Admin sign-in lasts (days)', kind: 'number', min: 1, max: 30 },
  'security.appSessionDays': { group: 'Sign-in and security', label: 'App sign-in lasts (days)', kind: 'number', min: 1, max: 90 },
  'privacy.notice': { group: 'Privacy', label: 'Privacy notice', kind: 'textarea', help: 'Shown in the app (Settings → Privacy, and when someone is asked to consent) and behind “Privacy” on the school’s sign-in page.' },
  'privacy.officerName': { group: 'Privacy', label: 'Grievance officer', kind: 'text', help: 'Shown with the privacy notice.' },
  'privacy.officerEmail': { group: 'Privacy', label: 'Grievance officer’s email', kind: 'text' },
  'privacy.officerPhone': { group: 'Privacy', label: 'Grievance officer’s phone', kind: 'text' },
  'privacy.retentionMonths': { group: 'Privacy', label: 'Keep records of students who left for (months)', kind: 'number', min: 12, max: 120, risky: true, help: 'After this, a leaver’s records are listed for erasure; erasing needs a second person in the console.' },
  'privacy.photoConsent': { group: 'Privacy', label: 'Ask for photo consent', kind: 'bool', help: 'The consent step in the app also asks whether the school may share photos of the child. Families can change the answer in the app at any time.' },
  'privacy.consentRequired': { group: 'Privacy', label: 'People must consent before using the app', kind: 'bool', help: 'The app shows the privacy notice once after sign-in and records the consent; Moving in counts who has consented.' },
  'notify.rules': { group: 'Messaging', label: 'Which message goes where', kind: 'notifyRules' },
  'notify.quietFrom': { group: 'Messaging', label: 'Quiet hours start', kind: 'time', help: 'Only urgent messages (absence, the bus) go out in quiet hours.' },
  'notify.quietTo': { group: 'Messaging', label: 'Quiet hours end', kind: 'time' },
  'templates.messages': { group: 'Messaging', label: 'Wording of each message', kind: 'templates' },

  // School (the academic year)
  'classes.schoolEdits': { group: 'school', label: 'The school may edit its classes, subjects and periods', kind: 'bool', help: 'Off: only Gradeon changes them (Data, or the school asks).' },
  'calendar.weeklyOff': { group: 'school', label: 'Closed every week on', kind: 'multi', options: [['sun', 'Sunday'], ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday']], help: 'Attendance, the dashboard, fee charts and the app’s calendars skip these days. Holidays are added under Academic year.' },
  'calendar.weekStarts': { group: 'school', label: 'Weeks start on', kind: 'enum', options: [['mon', 'Monday'], ['sun', 'Sunday']], help: 'The first column of every week grid in the admin and the app.' },
  'calendar.schoolEdits': { group: 'school', label: 'The school may edit its terms and holidays', kind: 'bool', help: 'Off: only Gradeon changes them.' },
  'dashboard.rollClasses': { group: 'school', label: 'Classes on the dashboard’s roll-call card', kind: 'classes', max: 8 },

  // People
  'vocab.student': { group: 'people', label: 'What the school calls a student', kind: 'text', help: 'The admin menu, the Students page and the app use it.' },
  'vocab.students': { group: 'people', label: '…and more than one', kind: 'text', help: 'Leave empty for the usual ending (“Pupil” → “Pupils”); fill in when it differs (“Children”).' },
  'vocab.class': { group: 'people', label: 'What the school calls a class', kind: 'text', help: 'The admin and the app use it.' },
  'vocab.classes': { group: 'people', label: '…and more than one', kind: 'text', help: 'Leave empty for the usual ending.' },
  'letters.family': { group: 'people', label: 'Letter to families about the app', kind: 'textarea', help: 'Printed for each family from Students → On the app, with a code that opens the app. Use {school}, {student}, {class}, {guardian}, {phoneEnd} and {link}.' },
  'letters.student': { group: 'people', label: 'Letter to students about the app', kind: 'textarea', help: 'Printed for each student when the school uses the app for students. Use {school}, {student}, {class} and {link}.' },
  'students.required': { group: 'people', label: 'Fields the office must fill for a student', kind: 'multi', options: [['gender', 'Gender'], ['house', 'House'], ['admissionNo', 'Admission number (otherwise Gradeon numbers them)'], ['bloodGroup', 'Blood group'], ['address', 'Address']], help: 'Name, class, date of birth and a guardian are always needed. These become required too when adding or editing a student.' },
  'people.houses': { group: 'people', label: 'Houses', kind: 'houses', max: 12, help: 'The school’s houses and their colours, if it has them: on student profiles, the roll-call grid and the app. Students are put in a house by import or on their profile.' },
  'admissions.sources': { group: 'people', label: 'Where enquiries come from', kind: 'strings', max: 16, help: 'The choices on a new enquiry, and how Admissions counts them.' },
  'admissions.stages': { group: 'people', label: 'Admission stages', kind: 'multi', options: [['applied', 'Applied (form received)'], ['test', 'Entrance test'], ['offer', 'Offer (the family is told)']], help: 'The steps between an enquiry and enrolment on the Admissions board. Enquiry and Enrolled are always there.' },
  'staff.schoolAssignsRoles': { group: 'people', label: 'The school may put its staff into roles', kind: 'bool', help: 'Roles themselves are always made here. Off: only Gradeon assigns roles to people.' },

  // Attendance
  'attendance.notifyParents': { group: 'attendance', label: 'Tell families when a child is absent or late', kind: 'bool' },
  'attendance.lockAfterDays': { group: 'attendance', label: 'Attendance can be corrected for this many days', kind: 'number', min: 0, max: 30, help: 'In the admin and in the teachers’ app; after that, only someone allowed to approve can change it.' },
  'attendance.goalPct': { group: 'attendance', label: 'Attendance goal (%)', kind: 'number', min: 50, max: 100, help: 'The dashboard and reports measure against it.' },
  'attendance.statuses': { group: 'attendance', label: 'Marks the school uses', kind: 'multi', options: [['present', 'Present'], ['absent', 'Absent'], ['late', 'Late'], ['half_day', 'Half day'], ['leave', 'On leave']], help: 'Present and absent are always used; a half day counts as a day attended. Approved leave is marked “On leave” by itself when the school uses it.' },
  'leave.reasons': { group: 'attendance', label: 'Reasons families give for leave', kind: 'strings', max: 12 },

  // Timetable
  'timetable.schoolEdits': { group: 'timetable', label: 'The school may edit its own timetable', kind: 'bool', help: 'Off: the timetable is locked and only Gradeon changes it. Covering an absent teacher for a day is always allowed.' },

  // Homework
  'homework.goalPct': { group: 'homework', label: 'Homework on time goal (%)', kind: 'number', min: 50, max: 100 },
  'homework.showClassProgress': { group: 'homework', label: 'Families see how many classmates have handed in', kind: 'bool' },
  'homework.defaultDueDays': { group: 'homework', label: 'New homework is due after', kind: 'number', min: 1, max: 30, help: 'Days after it is set, as the date a teacher starts from.' },
  'homework.defaultMarks': { group: 'homework', label: 'New marked homework is out of', kind: 'number', min: 1, max: 100, help: 'The marks a teacher starts from; they can change it.' },
  'homework.handedInBy': { group: 'homework', label: 'Who hands homework in from the app', kind: 'enum', options: [['either', 'The student or a parent'], ['student', 'The student only'], ['parent', 'A parent only']], help: 'Students hand in only when students use the app.' },

  // Exams and results
  'exams.defaultMaxMarks': { group: 'exams', label: 'A new paper is out of', kind: 'number', min: 1, max: 200, help: 'The marks a new exam paper starts from; each paper can be changed.' },
  'exams.leadDays': { group: 'exams', label: 'A new exam starts after', kind: 'number', min: 0, max: 120, help: 'Days from today, as the first day a new exam starts from.' },
  'results.showRank': { group: 'exams', label: 'Families see the class rank', kind: 'bool' },
  'grading.scale': { group: 'exams', label: 'Grading scale', kind: 'gradingScale', max: 12, help: 'Each grade from the lowest percentage that earns it, highest first. Results, report cards, homework grades and the app use it.' },
  'grading.passPct': { group: 'exams', label: 'Pass mark (%)', kind: 'number', min: 0, max: 100 },

  // Fees
  'fees.receiptPrefix': { group: 'fees', label: 'Receipt number prefix', kind: 'text', help: '{year} becomes the year, for example RCPT-{year}-.' },
  'fees.receiptStart': { group: 'fees', label: 'First receipt number', kind: 'number', min: 1, max: 99_999_999, help: 'For a school arriving from another system: carry on from its last receipt.' },
  'fees.receiptNote': { group: 'fees', label: 'Printed on receipts', kind: 'textarea', help: 'Under the school’s name and address on every receipt: the trust, its registration or GST number.' },
  'fees.paymentMethods': { group: 'fees', label: 'How the office records payments', kind: 'multi', options: [['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card'], ['netbanking', 'Net banking'], ['cheque', 'Cheque']] },
  'fees.lateFeePct': { group: 'fees', label: 'Late fee (%)', kind: 'number', min: 0, max: 25, help: 'Charged once a month on each overdue invoice while the school has Late fines. 0 charges nothing.' },
  'fees.remindDaysBefore': { group: 'fees', label: 'Remind families this many days before a due date', kind: 'number', min: 0, max: 30, help: 'Sent each morning while the school has Fee reminders, once per invoice per day.' },
  'fees.gstin': { group: 'fees', label: 'GSTIN', kind: 'text', help: 'Printed on receipts with the tax lines while the school has GST receipts.' },
  'fees.gstSac': { group: 'fees', label: 'Service code (SAC)', kind: 'text' },
  'fees.gstRatePct': { group: 'fees', label: 'GST rate (%)', kind: 'number', min: 0, max: 28 },
  'fees.gstHeads': { group: 'fees', label: 'Fee heads that carry GST', kind: 'multi', help: 'From the school’s own fee heads. Fees are GST-inclusive; the receipt shows the tax inside them.' },
  'fees.refundApprovalAbove': { group: 'fees', label: 'Refunds above this need a second person (₹)', kind: 'number', min: 0, max: 10_000_000 },
  'fees.dailyTarget': { group: 'fees', label: 'Daily fee collection target (₹)', kind: 'number', min: 0, max: 100_000_000, help: 'The dashboard measures each day’s collection against it.' },
  'feeStructures.schoolEdits': { group: 'fees', label: 'The school may edit its fee heads and fee structures', kind: 'bool', help: 'Off: only Gradeon changes what each grade pays. Who approves a fee waiver is whoever’s role may waive fees (Roles).' },

  // Notices
  'approvals.notice': { group: 'notices', label: 'Notices need approval before they go out', kind: 'enum', options: [['required', 'Yes, unless written by someone allowed to publish'], ['off', 'No']] },
  'notices.categories': { group: 'notices', label: 'Notice categories', kind: 'categories', max: 16, help: 'The same list for the people who write notices and the people who read them.' },

  // Events
  'events.categories': { group: 'events', label: 'Event categories', kind: 'categories', max: 16 },
  'events.showGoing': { group: 'events', label: 'Families see how many are going', kind: 'bool' },

  // Library
  'library.loanDays': { group: 'library', label: 'Loan (days)', kind: 'number', min: 1, max: 60 },
  'library.finePerDay': { group: 'library', label: 'Fine per late day (₹)', kind: 'number', min: 0, max: 100 },
  'library.maxRenewals': { group: 'library', label: 'Renewals per loan', kind: 'number', min: 0, max: 5, help: 'A book someone is waiting for cannot be renewed.' },
  'library.maxLoans': { group: 'library', label: 'Books a student may have out', kind: 'number', min: 1, max: 20 },
  'library.staffMaxLoans': { group: 'library', label: 'Books a member of staff may have out', kind: 'number', min: 1, max: 50 },

  // Transport
  'transport.nearMinutes': { group: 'transport', label: 'Tell families the bus is near (minutes away)', kind: 'number', min: 2, max: 30 },
  'transport.familyCalls': { group: 'transport', label: 'Families call about the bus', kind: 'enum', options: [['office', 'The office'], ['attendant', 'The bus attendant'], ['none', 'Nobody: messages only']], help: 'Never the driver, who is driving.' },
};
