import { z } from 'zod';

/** One column of an import: the template header, what people see, and an example for the template's second row. */
export interface ImportColumn {
  key: string;
  label: string;
  required?: boolean;
  example: string;
  /** Other names this column goes by in exports from other systems and in people's own sheets (matched loosely). */
  aliases?: string[];
}

/** One kind of data a school brings in. Order matters: structure first, then people, then everything that refers to them. */
export interface ImportKind {
  key: string;
  label: string;
  blurb: string;
  /** The module or feature the data belongs to; a school without it does not see this importer (core = every school). */
  module: string;
  columns: ImportColumn[];
  /** The columns that say "this is the same row as before": a second import updates instead of adding again. */
  matchOn: string[];
}

const c = (key: string, label: string, example: string, extra: Partial<ImportColumn> = {}): ImportColumn => ({ key, label, example, ...extra });
const req = (key: string, label: string, example: string, aliases: string[] = []): ImportColumn => ({ key, label, example, required: true, aliases });

export const IMPORT_KINDS: ImportKind[] = [
  { key: 'years', label: 'Academic years', blurb: 'The year the school is in, and earlier ones for history.', module: 'core', matchOn: ['label'],
    columns: [req('label', 'Year', '2026-27', ['academic year', 'session']), req('starts_on', 'Starts on', '2026-04-01', ['start date', 'from']), req('ends_on', 'Ends on', '2027-03-31', ['end date', 'to']), c('current', 'Current year', 'yes', { aliases: ['is current', 'active'] })] },
  { key: 'terms', label: 'Terms', blurb: 'Terms or semesters inside a year.', module: 'core', matchOn: ['year', 'name'],
    columns: [req('year', 'Year', '2026-27', ['academic year', 'session']), req('name', 'Term', 'Term 1', ['term name', 'semester']), req('starts_on', 'Starts on', '2026-04-01', ['start date', 'from']), req('ends_on', 'Ends on', '2026-09-30', ['end date', 'to'])] },
  { key: 'holidays', label: 'Holidays', blurb: 'Days the school is closed.', module: 'core', matchOn: ['name', 'starts_on'],
    columns: [req('name', 'Holiday', 'Diwali break', ['holiday', 'occasion', 'title']), req('starts_on', 'From', '2026-11-08', ['date', 'start date', 'from date']), c('ends_on', 'To', '2026-11-12', { aliases: ['end date', 'to date'] })] },
  { key: 'subjects', label: 'Subjects', blurb: 'Subjects taught, with periods a week.', module: 'core', matchOn: ['name'],
    columns: [req('name', 'Subject', 'Mathematics', ['subject name', 'subject']), c('per_week', 'Periods a week', '6', { aliases: ['periods', 'periods per week'] })] },
  { key: 'periods', label: 'Periods and bells', blurb: 'The bell timetable: lessons and breaks.', module: 'core', matchOn: ['number'],
    columns: [req('number', 'Number', '1', ['period', 'period no']), req('label', 'Name', 'Period 1', ['period name']), req('starts_at', 'Starts at', '08:00', ['start', 'from']), req('ends_at', 'Ends at', '08:40', ['end', 'to']), c('kind', 'Kind', 'period', { aliases: ['type'] })] },
  { key: 'staff', label: 'Staff', blurb: 'Teachers and office staff. Invitations go out at go-live, not now.', module: 'core', matchOn: ['email'],
    columns: [req('name', 'Name', 'Kavita Iyer', ['employee name', 'staff name', 'full name']), req('email', 'Email', 'kavita@school.in', ['email id', 'e-mail', 'official email']), c('phone', 'Phone', '9822011002', { aliases: ['mobile', 'mobile no', 'contact'] }), c('designation', 'Designation', 'Teacher', { aliases: ['post', 'role title'] }), c('department', 'Department', 'Science'), c('joined_on', 'Joined on', '2019-06-10', { aliases: ['date of joining', 'doj', 'joining date'] }), c('role', 'Role', 'Teacher', { aliases: ['access role'] }), c('subjects', 'Subjects taught', 'Mathematics; Science', { aliases: ['subjects', 'teaches'] })] },
  { key: 'classes', label: 'Classes and sections', blurb: 'Every class and section, with its class teacher.', module: 'core', matchOn: ['class'],
    columns: [req('class', 'Class', '8 A', ['class name', 'class-section', 'batch', 'standard division']), c('grade', 'Grade', '8', { aliases: ['standard', 'std'] }), c('section', 'Section', 'A', { aliases: ['division', 'div'] }), c('class_teacher', 'Class teacher email', 'kavita@school.in', { aliases: ['class teacher', 'teacher email'] })] },
  { key: 'students', label: 'Students and families', blurb: 'Students with their guardians; brothers and sisters are joined by the guardian’s phone.', module: 'core', matchOn: ['admission_no'],
    columns: [c('admission_no', 'Admission number', '2019/0412', { aliases: ['admission no', 'admn no', 'adm no', 'sr no', 'scholar no', 'gr no'] }), req('name', 'Student name', 'Aarav Sharma', ['student name', 'full name', 'name of student']), req('class', 'Class', '8 A', ['class name', 'class-section', 'batch', 'standard division']), c('roll_no', 'Roll number', '12', { aliases: ['roll', 'roll no'] }), req('dob', 'Date of birth', '2012-04-18', ['date of birth', 'birth date', 'd.o.b']),
      c('blood_group', 'Blood group', 'B+'), c('house', 'House', 'Emerald'), c('address', 'Address', '42 Baner Road, Pune'), c('admitted_on', 'Admitted on', '2019-06-10', { aliases: ['admission date', 'date of admission', 'doa'] }), c('status', 'Status', 'active'),
      req('guardian_name', 'Guardian name', 'Priya Sharma', ['father name', "father's name", 'parent name', 'mother name', 'guardian']), req('guardian_phone', 'Guardian phone', '9822011002', ['father mobile', 'parent mobile', 'mobile', 'phone', 'contact no', 'sms mobile']), c('guardian_email', 'Guardian email', 'priya@example.com', { aliases: ['parent email', 'father email', 'email'] }), c('relation', 'Relation', 'Mother'),
      c('guardian2_name', 'Second guardian', 'Rohan Sharma', { aliases: ['mother name', "mother's name"] }), c('guardian2_phone', 'Second guardian phone', '9822011003', { aliases: ['mother mobile'] }), c('guardian2_relation', 'Second relation', 'Father')] },
  { key: 'admissions', label: 'Admissions in progress', blurb: 'Open enquiries and applications, so the pipeline does not restart.', module: 'people.admissions', matchOn: ['child_name', 'phone'],
    columns: [req('child_name', 'Child', 'Ira Rao', ['student name', 'child name', 'applicant']), req('grade_sought', 'Grade', '3', ['class', 'grade applied', 'class sought']), req('guardian_name', 'Guardian', 'Meera Rao', ['parent name', 'father name']), c('phone', 'Phone', '9822011010', { aliases: ['mobile', 'contact'] }), c('email', 'Email', 'meera@example.com'), c('source', 'Source', 'website'), c('stage', 'Stage', 'applied', { aliases: ['status'] }), c('test_on', 'Test on', '2026-12-02'), c('note', 'Note', 'Sibling in 6 B')] },
  { key: 'fee_structures', label: 'Fee structures', blurb: 'What each grade pays, per fee head and due date.', module: 'fees', matchOn: ['grade', 'title'],
    columns: [c('grade', 'Grade (blank for all)', '8'), req('head', 'Fee head', 'tuition', ['fee head', 'fee type', 'category']), req('title', 'Fee', 'Term 2 tuition', ['fee name', 'particular', 'description']), req('amount', 'Amount', '18500', ['fee amount', 'amount (rs)']), req('due_on', 'Due on', '2026-11-10', ['due date', 'last date'])] },
  { key: 'fee_dues', label: 'Opening dues', blurb: 'What each student owes on day one, reconciled to the rupee against the old system.', module: 'fees', matchOn: ['admission_no', 'title'],
    columns: [req('admission_no', 'Admission number', '2019/0412', ['admission no', 'admn no', 'adm no']), req('head', 'Fee head', 'tuition', ['fee head', 'fee type', 'category']), req('title', 'Fee', 'Term 2 tuition', ['fee name', 'particular', 'description']), req('amount', 'Amount', '18500', ['fee amount', 'due amount', 'balance']), req('due_on', 'Due on', '2026-11-10', ['due date', 'last date']), c('waived', 'Waived', '0', { aliases: ['concession', 'discount'] })] },
  { key: 'payments', label: 'Payment history', blurb: 'Past payments with the school’s own receipt numbers.', module: 'fees', matchOn: ['receipt_no'],
    columns: [req('receipt_no', 'Receipt number', 'RCPT-2026-0412', ['receipt no', 'receipt', 'voucher no']), req('admission_no', 'Admission number', '2019/0412', ['admission no', 'admn no', 'adm no']), req('fee_title', 'Fee', 'Term 1 tuition', ['fee name', 'particular', 'fee']), req('amount', 'Amount', '18500', ['paid amount', 'amount paid']), req('paid_on', 'Paid on', '2026-06-10', ['payment date', 'date', 'receipt date']), c('method', 'Method', 'upi', { aliases: ['mode', 'payment mode'] }), c('reference', 'Reference', 'UTR 4412', { aliases: ['transaction id', 'cheque no'] })] },
  { key: 'attendance', label: 'Past attendance', blurb: 'Daily attendance from before the move, for year reports.', module: 'attendance', matchOn: ['date', 'admission_no'],
    columns: [req('date', 'Date', '2026-10-14', ['attendance date', 'day']), req('admission_no', 'Admission number', '2019/0412', ['admission no', 'admn no', 'adm no']), req('status', 'Status', 'present', ['attendance', 'mark'])] },
  { key: 'marks', label: 'Past marks', blurb: 'Exams and marks, so history and ranks carry over.', module: 'exams', matchOn: ['exam', 'class', 'subject', 'admission_no'],
    columns: [req('exam', 'Exam', 'Unit test 1', ['exam name', 'assessment']), req('class', 'Class', '8 A', ['class name', 'batch']), req('subject', 'Subject', 'Mathematics', ['subject name']), req('admission_no', 'Admission number', '2019/0412', ['admission no', 'admn no', 'adm no']), req('score', 'Score', '72', ['marks', 'marks obtained']), c('max_marks', 'Out of', '100', { aliases: ['maximum marks', 'max marks', 'total marks'] }), c('starts_on', 'Exam from', '2026-07-20'), c('ends_on', 'Exam to', '2026-07-24')] },
  { key: 'timetable', label: 'Timetable', blurb: 'Who teaches what, when: from the old system or the printed sheet.', module: 'timetable', matchOn: ['class', 'day', 'period'],
    columns: [req('class', 'Class', '8 A', ['class name', 'batch']), req('day', 'Day', 'Monday', ['weekday']), req('period', 'Period', '1', ['period no']), req('subject', 'Subject', 'Mathematics', ['subject name']), req('teacher', 'Teacher email', 'kavita@school.in', ['teacher', 'teacher email']), c('room', 'Room', 'B-204')] },
  { key: 'library_loans', label: 'Library loans', blurb: 'Books students have out now.', module: 'library', matchOn: ['admission_no', 'title', 'due_on'],
    columns: [req('admission_no', 'Admission number', '2019/0412', ['admission no', 'admn no', 'adm no']), req('title', 'Book', 'Wings of Fire', ['book title', 'book name']), req('due_on', 'Due on', '2026-11-20', ['due date', 'return by']), c('returned_on', 'Returned on', '')] },
  { key: 'transport', label: 'Bus routes', blurb: 'Which route each student takes.', module: 'transport', matchOn: ['admission_no'],
    columns: [req('admission_no', 'Admission number', '2019/0412', ['admission no', 'admn no', 'adm no']), req('route', 'Route', 'Route 4 · Baner', ['route name', 'bus route', 'route no'])] },
];

export function importKind(key: string): ImportKind | undefined {
  return IMPORT_KINDS.find((k) => k.key === key);
}

/** The table of a file once read: its header row and data rows, plus how its columns map onto the kind's columns. */
export const ImportInput = z.object({
  kind: z.string().min(1).max(40),
  /** CSV text (a sheet saved as CSV, or another system's export), or the file as a data URL (an .xlsx straight from Excel or Sheets) ... */
  csv: z.string().max(25_000_000).optional(),
  /** ... or rows typed into the quick-entry grid, keyed by column. */
  rows: z.array(z.record(z.string(), z.string().max(2000))).max(20_000).optional(),
  /** File column name -> import column key (or '' to leave it out). Missing: matched automatically or remembered. */
  mapping: z.record(z.string(), z.string()).optional(),
  fileName: z.string().max(200).default(''),
  /** The school's upload this came from, if any. */
  uploadId: z.string().max(60).optional(),
}).refine((v) => !!v.csv !== !!v.rows, { message: 'Send a file or typed rows, not both.' });
export type ImportInput = z.infer<typeof ImportInput>;

export interface ImportRowCheck {
  line: number;
  values: Record<string, string>;
  action: 'create' | 'update' | 'skip';
  errors: string[];
}

export interface ImportPreview {
  kind: string;
  /** Which system the file looks like it came from (gradeon, fedena, entab, sheet). */
  source: string;
  headers: string[];
  mapping: Record<string, string>;
  /** Required columns nothing maps to: the import cannot go ahead until each has a column. */
  missing: string[];
  rows: ImportRowCheck[];
  counts: { create: number; update: number; skip: number; total: number };
  /** Totals to check against the old system: rows per class, rupees per fee head, and so on. */
  totals: { label: string; value: string }[];
}

export interface ImportBatchRow {
  id: string;
  kind: string;
  source: string;
  fileName: string;
  created: number;
  updated: number;
  skipped: number;
  totals: { label: string; value: string }[];
  notes: string[];
  byName: string;
  at: string;
  undoneAt: string | null;
  /** Only the newest batch that is not undone, within 30 days, can be undone. */
  canUndo: boolean;
}

export const UploadCreate = z.object({
  fileName: z.string().trim().min(1).max(200),
  note: z.string().trim().max(500).default(''),
  content: z.string().min(1).max(25_000_000),
});
export type UploadCreate = z.infer<typeof UploadCreate>;

export interface UploadRow { id: string; fileName: string; note: string; rows: number; uploadedBy: string; at: string; status: 'new' | 'imported' | 'set_aside'; batchId: string | null }

/** What the school edits itself in Classes and calendar: the same kinds and columns as the importers, behind a console lock each. */
export const SETUP_KINDS = [
  { key: 'years', lock: 'calendar.schoolEdits' }, { key: 'terms', lock: 'calendar.schoolEdits' }, { key: 'holidays', lock: 'calendar.schoolEdits' },
  { key: 'classes', lock: 'classes.schoolEdits' }, { key: 'subjects', lock: 'classes.schoolEdits' }, { key: 'periods', lock: 'classes.schoolEdits' },
  { key: 'fee_structures', lock: 'feeStructures.schoolEdits' },
] as const;

/** One kind's rows in the template's columns, plus the row id for removing it. */
export interface SetupSection { kind: string; label: string; locked: boolean; columns: ImportColumn[]; rows: (Record<string, string> & { id: string })[] }

export const SetupSave = z.object({ row: z.record(z.string(), z.string().max(500)) });
export type SetupSave = z.infer<typeof SetupSave>;

/** Go-live for one class: how many families there are, how many were invited to the app and how many have signed in. */
export interface ActivationClass { classId: string; className: string; students: number; families: number; invited: number; signedIn: number }
export interface Activation {
  staff: { total: number; invited: number; signedIn: number };
  families: { total: number; invited: number; signedIn: number };
  classes: ActivationClass[];
}
export const FamilyInvite = z.object({ classId: z.string().max(60).optional() });
export type FamilyInvite = z.infer<typeof FamilyInvite>;
/** One letter home: which child, and the last digits of the phone the family signs in with (letters travel in school bags). */
export interface LetterRow { studentId: string; student: string; admissionNo: string; className: string; guardian: string; phoneEnd: string }

/** The console's Migration workspace for one school: what can be imported, what was, what the school sent, and how ready it is to go live. */
export interface MigrationView {
  kinds: ImportKind[];
  batches: ImportBatchRow[];
  uploads: UploadRow[];
  readiness: { key: string; label: string; done: boolean; detail: string }[];
  students: number;
  studentLimit: number;
}
export const SampleLoad = z.object({ students: z.number().int().min(10).max(3000) });
export type SampleLoad = z.infer<typeof SampleLoad>;
