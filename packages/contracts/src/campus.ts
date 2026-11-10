import { z } from 'zod';

// Phase 4: files, online payments and refunds, library, transport, gallery and year-end, as the admin and the app see them.

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-04-01');

// ── Files ─────────────────────────────────────────────────────────────────────

export const FILE_KINDS = ['homework_submission', 'homework_attachment', 'notice_attachment', 'chat', 'student_photo', 'student_document', 'logo', 'gallery', 'receipt', 'report_card'] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const FileStart = z.object({
  kind: z.enum(FILE_KINDS),
  ownerId: z.string().min(1).max(120),
  name: z.string().trim().min(1).max(200),
  mime: z.string().min(3).max(100),
  bytes: z.number().int().min(1),
});
export type FileStart = z.infer<typeof FileStart>;

export interface FileRow { id: string; kind: FileKind; ownerId: string | null; name: string; mime: string; bytes: number; status: 'uploading' | 'pending' | 'clean' | 'infected'; width: number | null; height: number | null; createdAt: string }
export interface FileUpload { fileId: string; upload: { url: string; method: 'PUT'; headers: Record<string, string> } }

// ── Refunds and reconciliation ────────────────────────────────────────────────

export const RefundRequest = z.object({ paymentId: z.string().min(1), amount: z.number().int().positive('Enter an amount'), reason: z.string().trim().min(3, 'Say why, in a few words.').max(200) });
export type RefundRequest = z.infer<typeof RefundRequest>;
export interface RefundRow { id: string; paymentId: string; receiptNo: string; student: string; amount: number; reason: string; status: 'requested' | 'sent' | 'done' | 'failed' | 'rejected'; requestedBy: string | null; approvedBy: string | null; error: string | null; createdAt: string }
export interface ReconRow { id: string; day: string; providerPaymentId: string; providerAmount: number | null; receiptAmount: number | null; problem: string; resolved: boolean }
export interface OnlinePaymentRow { id: string; receiptNo: string; student: string; title: string; amount: number; refunded: number; paidOn: string; method: string; providerPaymentId: string }

// ── Library ───────────────────────────────────────────────────────────────────

export const BookInput = z.object({
  title: z.string().trim().min(1, 'The title is needed.').max(200),
  author: z.string().trim().max(120).default(''),
  isbn: z.string().trim().max(20).default(''),
  category: z.string().trim().max(40).default('General'),
  shelf: z.string().trim().max(20).default(''),
  copies: z.number().int().min(0).max(500).default(1),
});
export type BookInput = z.infer<typeof BookInput>;
export interface BookRow extends BookInput { id: string; out: number; waiting: number }
export const IssueInput = z.object({ bookId: z.string().min(1), studentId: z.string().min(1, 'Choose a student.'), dueOn: day.optional() });
export type IssueInput = z.infer<typeof IssueInput>;
export interface LoanRow { id: string; bookId: string | null; title: string; studentId: string; student: string; className: string; issuedOn: string | null; dueOn: string; returnedOn: string | null; fine: number; overdueDays: number }
export interface ReservationRow { id: string; bookId: string; title: string; studentId: string; student: string; status: 'waiting' | 'ready' | 'done' | 'cancelled'; createdAt: string }
export interface LibraryView { books: BookRow[]; loans: LoanRow[]; reservations: ReservationRow[]; rules: { loanDays: number; finePerDay: number; maxRenewals: number } }

// ── Transport ─────────────────────────────────────────────────────────────────

export const StopInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, 'Name the stop.').max(80),
  pickup: z.string().regex(/^$|^\d{2}:\d{2}$/, 'Use a time like 07:20').default(''),
  dropTime: z.string().regex(/^$|^\d{2}:\d{2}$/, 'Use a time like 14:10').default(''),
  lat: z.number().min(-90).max(90).nullable().default(null),
  lng: z.number().min(-180).max(180).nullable().default(null),
});
export type StopInput = z.infer<typeof StopInput>;
export const BusRouteInput = z.object({
  name: z.string().trim().min(1, 'Name the route.').max(60),
  vehicle: z.string().trim().max(30).default(''),
  driverName: z.string().trim().max(80).default(''),
  driverPhone: z.string().trim().max(20).default(''),
  fee: z.number().int().min(0).max(1_000_000).default(0),
  stops: z.array(StopInput).max(60).default([]),
});
export type BusRouteInput = z.infer<typeof BusRouteInput>;
export const RiderInput = z.object({ studentId: z.string().min(1), routeId: z.string().nullable(), stopId: z.string().nullable().default(null) });
export type RiderInput = z.infer<typeof RiderInput>;
export const BusPosition = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
export type BusPosition = z.infer<typeof BusPosition>;
export interface StopRow { id: string; name: string; position: number; pickup: string; dropTime: string; lat: number | null; lng: number | null; riders: number }
export interface BusRouteRow { id: string; name: string; vehicle: string; driverName: string; driverPhone: string; fee: number; stops: StopRow[]; riders: number; bus: { lat: number; lng: number; at: string } | null }
export interface RiderRow { studentId: string; student: string; className: string; routeId: string | null; stopId: string | null }
export interface TransportView { routes: BusRouteRow[]; riders: RiderRow[] }

// ── Gallery ───────────────────────────────────────────────────────────────────

export const AlbumInput = z.object({ title: z.string().trim().min(2, 'Give the album a title.').max(80), classId: z.string().nullable().default(null), eventId: z.string().nullable().default(null) });
export type AlbumInput = z.infer<typeof AlbumInput>;
export interface AlbumRow { id: string; title: string; classId: string | null; className: string | null; eventId: string | null; published: boolean; photos: number; coverFileId: string | null; createdAt: string }
export interface PhotoRow extends FileRow { students: { id: string; name: string; consent: boolean | null }[] }
export const PhotoTags = z.object({ studentIds: z.array(z.string()).max(60) });

// ── Year-end ──────────────────────────────────────────────────────────────────

export interface YearRow { id: string; label: string; startsOn: string; endsOn: string; status: 'draft' | 'current' | 'archived'; classes: number; students: number }
export const NewYearInput = z.object({ label: z.string().trim().min(4).max(20), startsOn: day, endsOn: day });
export type NewYearInput = z.infer<typeof NewYearInput>;
/** One class's move: where its students go, and who stays back or leaves. */
export const PromotionInput = z.object({
  toYear: z.string().min(1),
  moves: z.array(z.object({ fromClassId: z.string(), toClassId: z.string().nullable() })).min(1),
  detained: z.array(z.string()).default([]),
  leaving: z.array(z.string()).default([]),
});
export type PromotionInput = z.infer<typeof PromotionInput>;
export interface PromotionPreview { classes: { fromClassId: string; fromName: string; toClassId: string | null; toName: string | null; students: number }[]; dues: number; duesStudents: number }
export interface PromotionRunRow { id: string; fromYear: string; toYear: string; students: number; createdAt: string; undoneAt: string | null }
export const LeaverInput = z.object({ studentId: z.string().min(1), leftOn: day, reason: z.string().trim().min(2).max(200) });
export type LeaverInput = z.infer<typeof LeaverInput>;
export interface LeaverRow { id: string; name: string; admissionNo: string; leftOn: string; reason: string; eraseAfter: string; due: boolean }
export interface YearView { years: YearRow[]; runs: PromotionRunRow[]; leavers: LeaverRow[]; retentionMonths: number }

// ── Background jobs (the console's Health page) ───────────────────────────────

export interface JobRow { id: string; schoolId: string | null; schoolName: string | null; kind: string; status: 'queued' | 'running' | 'done' | 'failed'; attempts: number; runAt: string; lastError: string | null; result: string | null; finishedAt: string | null }
