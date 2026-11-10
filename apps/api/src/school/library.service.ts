import { Injectable } from '@nestjs/common';
import { addDays, istToday, type BookInput, type BookRow, type IssueInput, type LibraryView, type LoanRow, type ReservationRow } from '@gradeon/contracts';
import { newId } from '@gradeon/db';
import { ApiError, notFound } from '@gradeon/nest-kit';
import type { TenantCtx } from '../tenancy/tenant.js';
import { AuditService, Messenger, SettingsService } from './support.js';

type User = { id: string; name: string };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** The library: a catalogue with copies, issue and return with due dates and fines, and a queue of reservations per book. */
@Injectable()
export class LibraryService {
  constructor(
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly messenger: Messenger,
  ) {}

  async rules(t: TenantCtx) {
    return {
      loanDays: await this.settings.value<number>(t, 'library.loanDays', 14),
      finePerDay: await this.settings.value<number>(t, 'library.finePerDay', 1),
      maxRenewals: await this.settings.value<number>(t, 'library.maxRenewals', 1),
    };
  }

  async view(t: TenantCtx): Promise<LibraryView> {
    const [books, loans, res, rules] = await Promise.all([this.books(t), this.loans(t), this.reservations(t), this.rules(t)]);
    return { books, loans, reservations: res, rules };
  }

  async books(t: TenantCtx, q = ''): Promise<BookRow[]> {
    const { rows } = await t.pool.query(
      `select b.*, (select count(*) from library_loans l where l.book_id = b.id and l.returned_on is null)::int out,
         (select count(*) from library_reservations r where r.book_id = b.id and r.status in ('waiting','ready'))::int waiting
       from library_books b where $1 = '' or b.title ilike '%' || $1 || '%' or b.author ilike '%' || $1 || '%' or b.isbn = $1 order by b.title limit 500`, [q.trim()]);
    return rows.map((b) => ({ id: b.id, title: b.title, author: b.author, isbn: b.isbn, category: b.category, shelf: b.shelf, copies: b.copies, out: b.out, waiting: b.waiting }));
  }

  async loans(t: TenantCtx, studentIds?: string[]): Promise<LoanRow[]> {
    const fine = (await this.rules(t)).finePerDay;
    const today = istToday();
    const { rows } = await t.pool.query(
      `select l.*, l.due_on::text due, l.issued_on::text issued, l.returned_on::text returned, s.name student, c.name class_name from library_loans l
       join students s on s.id = l.student_id join classes c on c.id = s.class_id
       where ($1::text[] is null and l.returned_on is null) or l.student_id = any($1) order by l.due_on limit 1000`, [studentIds ?? null]);
    return rows.map((l) => {
      const late = l.returned ? 0 : Math.max(0, daysBetween(l.due, today));
      return { id: l.id, bookId: l.book_id, title: l.title, studentId: l.student_id, student: l.student, className: l.class_name, issuedOn: l.issued, dueOn: l.due, returnedOn: l.returned,
        fine: l.returned ? l.fine : late * fine, overdueDays: late };
    });
  }

  async reservations(t: TenantCtx, studentIds?: string[]): Promise<ReservationRow[]> {
    const { rows } = await t.pool.query(
      `select r.*, b.title, s.name student from library_reservations r join library_books b on b.id = r.book_id join students s on s.id = r.student_id
       where r.status in ('waiting','ready') and ($1::text[] is null or r.student_id = any($1)) order by r.created_at`, [studentIds ?? null]);
    return rows.map((r) => ({ id: r.id, bookId: r.book_id, title: r.title, studentId: r.student_id, student: r.student, status: r.status, createdAt: r.created_at.toISOString() }));
  }

  async saveBook(t: TenantCtx, user: User, b: BookInput, id?: string): Promise<BookRow> {
    if (id) {
      const out = Number((await t.pool.query<{ n: string }>('select count(*) n from library_loans where book_id = $1 and returned_on is null', [id])).rows[0]!.n);
      if (b.copies < out) throw new ApiError('validation', `${out} copies are out on loan, so there must be at least ${out}.`, { fields: { copies: `At least ${out}.` } });
      const r = await t.pool.query('update library_books set title = $2, author = $3, isbn = $4, category = $5, shelf = $6, copies = $7 where id = $1', [id, b.title, b.author, b.isbn, b.category, b.shelf, b.copies]);
      if (!r.rowCount) throw notFound('That book');
    } else {
      id = newId('bok');
      await t.pool.query('insert into library_books (id, title, author, isbn, category, shelf, copies) values ($1,$2,$3,$4,$5,$6,$7)', [id, b.title, b.author, b.isbn, b.category, b.shelf, b.copies]);
    }
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'library.book.saved', entity: 'book', entityId: id, detail: { title: b.title, copies: b.copies } });
    return (await this.books(t)).find((x) => x.id === id)!;
  }

  async deleteBook(t: TenantCtx, user: User, id: string): Promise<void> {
    if ((await t.pool.query('select 1 from library_loans where book_id = $1 and returned_on is null', [id])).rowCount) throw new ApiError('conflict', 'Copies of this book are out. Take them back first.');
    await t.pool.query('update library_loans set book_id = null where book_id = $1', [id]);
    const r = await t.pool.query('delete from library_books where id = $1 returning title', [id]);
    if (!r.rowCount) throw notFound('That book');
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'library.book.deleted', entity: 'book', entityId: id, detail: { title: r.rows[0].title } });
  }

  /** Lends a copy. A reserved book goes first to whoever has been waiting longest. */
  async issue(t: TenantCtx, user: User, b: IssueInput): Promise<LoanRow> {
    const book = (await t.pool.query<{ title: string; copies: number; out: number }>(
      'select title, copies, (select count(*) from library_loans where book_id = b.id and returned_on is null)::int out from library_books b where id = $1', [b.bookId])).rows[0];
    if (!book) throw notFound('That book');
    if (book.out >= book.copies) throw new ApiError('conflict', `All ${book.copies} copies of ${book.title} are out.`);
    const first = (await t.pool.query<{ student_id: string }>("select student_id from library_reservations where book_id = $1 and status in ('waiting','ready') order by created_at limit 1", [b.bookId])).rows[0];
    if (first && first.student_id !== b.studentId && book.copies - book.out <= 1) throw new ApiError('conflict', 'The last copy is reserved for someone else.');
    if ((await t.pool.query('select 1 from students where id = $1', [b.studentId])).rowCount === 0) throw notFound('That student');
    const today = istToday();
    const due = b.dueOn ?? addDays(today, (await this.rules(t)).loanDays);
    const id = newId('lon');
    await t.pool.query('insert into library_loans (id, student_id, title, due_on, book_id, issued_on) values ($1,$2,$3,$4,$5,$6)', [id, b.studentId, book.title, due, b.bookId, today]);
    await t.pool.query("update library_reservations set status = 'done' where book_id = $1 and student_id = $2 and status in ('waiting','ready')", [b.bookId, b.studentId]);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'library.issued', entity: 'book', entityId: b.bookId, detail: { studentId: b.studentId, due } });
    return (await this.loans(t, [b.studentId])).find((l) => l.id === id)!;
  }

  /** Takes a book back, fixes its fine, and tells the next family waiting that it is ready. */
  async giveBack(t: TenantCtx, user: User, loanId: string): Promise<{ fine: number }> {
    const l = (await t.pool.query<{ book_id: string | null; due: string }>("select book_id, due_on::text due from library_loans where id = $1 and returned_on is null", [loanId])).rows[0];
    if (!l) throw notFound('That loan');
    const today = istToday();
    const fine = Math.max(0, daysBetween(l.due, today)) * (await this.rules(t)).finePerDay;
    await t.pool.query('update library_loans set returned_on = $2, fine = $3 where id = $1', [loanId, today, fine]);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'library.returned', entity: 'loan', entityId: loanId, detail: { fine } });
    if (l.book_id) {
      const next = (await t.pool.query<{ id: string; student: string; phone: string | null; title: string }>(
        `select r.id, s.name student, g.phone, b.title from library_reservations r join students s on s.id = r.student_id join library_books b on b.id = r.book_id
         left join student_guardians sg on sg.student_id = s.id and sg.is_primary left join guardians g on g.id = sg.guardian_id
         where r.book_id = $1 and r.status = 'waiting' order by r.created_at limit 1`, [l.book_id])).rows[0];
      if (next) {
        await t.pool.query("update library_reservations set status = 'ready' where id = $1", [next.id]);
        if (next.phone) await this.messenger.notify(t, 'library.ready', [{ to: next.phone, vars: { student: next.student, title: next.title } }]);
      }
    }
    return { fine };
  }

  /** A family reserves a book for their child: a place in the queue for the next copy. */
  async reserve(t: TenantCtx, bookId: string, studentId: string): Promise<ReservationRow> {
    const book = (await t.pool.query('select 1 from library_books where id = $1', [bookId])).rows[0];
    if (!book) throw notFound('That book');
    if ((await t.pool.query('select 1 from library_loans where book_id = $1 and student_id = $2 and returned_on is null', [bookId, studentId])).rowCount) throw new ApiError('conflict', 'Your child already has this book.');
    const id = newId('rsv');
    await t.pool.query('insert into library_reservations (id, book_id, student_id) values ($1,$2,$3) on conflict do nothing', [id, bookId, studentId]);
    return (await this.reservations(t, [studentId])).find((r) => r.bookId === bookId)!;
  }

  async cancelReservation(t: TenantCtx, id: string, studentIds: string[] | null): Promise<void> {
    const r = await t.pool.query("update library_reservations set status = 'cancelled' where id = $1 and status in ('waiting','ready') and ($2::text[] is null or student_id = any($2))", [id, studentIds]);
    if (!r.rowCount) throw notFound('That reservation');
  }

  /** A family renews a loan once more, by the loan period, if nobody is waiting for the book. */
  async renew(t: TenantCtx, loanId: string, studentIds: string[]): Promise<LoanRow> {
    const rules = await this.rules(t);
    const l = (await t.pool.query<{ student_id: string; book_id: string | null; renewals: number; due: string }>(
      'select student_id, book_id, renewals, due_on::text due from library_loans where id = $1 and returned_on is null and student_id = any($2)', [loanId, studentIds])).rows[0];
    if (!l) throw notFound('That book');
    if (l.renewals >= rules.maxRenewals) throw new ApiError('conflict', rules.maxRenewals ? `A book can be renewed ${rules.maxRenewals === 1 ? 'once' : `${rules.maxRenewals} times`}. Please return it to the library.` : 'Books cannot be renewed from the app. Ask at the library desk.');
    if (l.book_id && (await t.pool.query("select 1 from library_reservations where book_id = $1 and status = 'waiting'", [l.book_id])).rowCount) throw new ApiError('conflict', 'Someone is waiting for this book, so it cannot be renewed.');
    const due = addDays(l.due < istToday() ? istToday() : l.due, rules.loanDays);
    await t.pool.query('update library_loans set due_on = $2, renewals = renewals + 1 where id = $1', [loanId, due]);
    return (await this.loans(t, [l.student_id])).find((x) => x.id === loanId)!;
  }
}
