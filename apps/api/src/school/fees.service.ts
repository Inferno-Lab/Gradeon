import { Injectable } from '@nestjs/common';
import { newId } from '@gradeon/db';
import { addDays, dayName, dayMonth, inr, istToday, latestSchoolDay, schoolDaysEnding, type FeeHead, type FeeHeadsPut, type FeeSummary, type InvoiceDetail, type InvoiceRow, type PaymentCreate, type ReceiptCancel, type WaiverRequest } from '@gradeon/contracts';
import { ApiError, notFound } from '@gradeon/nest-kit';
import type { TenantCtx } from '../tenancy/tenant.js';
import { AuditService, Messenger, SettingsService } from './support.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

@Injectable()
export class FeesService {
  constructor(
    private readonly audit: AuditService,
    private readonly messenger: Messenger,
    private readonly settings: SettingsService,
  ) {}

  /** Money for the month of the latest school day: what fell due, what came in, and what is late. */
  /**
   * Money for a period: this month (the default), the current term or the current academic year, from the school's calendar.
   * The comparison is with the period just before it of the same length.
   */
  async summary(t: TenantCtx, count = 6, period: 'month' | 'term' | 'year' = 'month'): Promise<FeeSummary> {
    const OFF_DAYS = await this.settings.offDays(t);
    const today = istToday();
    const last = latestSchoolDay(today, OFF_DAYS);
    let monthStart = `${last.slice(0, 7)}-01`;
    let nextMonth = addDays(monthStart, 32).slice(0, 7) + '-01';
    let label = MONTHS[Number(last.slice(5, 7)) - 1]!;
    if (period !== 'month') {
      const r = (await t.pool.query<{ name: string; s: string; e: string }>(period === 'term'
        ? 'select name, starts_on::text s, ends_on::text e from terms where starts_on <= $1 and ends_on >= $1 order by starts_on desc limit 1'
        : 'select label name, starts_on::text s, ends_on::text e from academic_years where starts_on <= $1 and ends_on >= $1 order by starts_on desc limit 1', [today])).rows[0];
      if (r) { monthStart = r.s; nextMonth = addDays(r.e, 1); label = r.name; }
    }
    const span = Math.max(1, Math.round((Date.parse(nextMonth) - Date.parse(monthStart)) / 86_400_000));
    const prevStart = period === 'month' ? addDays(monthStart, -1).slice(0, 7) + '-01' : addDays(monthStart, -span);
    const [byHead, totals, daily, prev, target, headList] = await Promise.all([
      t.pool.query<{ head: string; due: string; collected: string }>(
        `select i.head, coalesce(sum(i.amount - i.waived_amount),0) due,
           coalesce(sum((select coalesce(sum(p.amount - p.refunded),0) from payments p where p.invoice_id = i.id)),0) collected
         from fee_invoices i where i.due_on >= $1 and i.due_on < $2 group by i.head`, [monthStart, nextMonth]),
      t.pool.query<{ collected: string; overdue: string; fam: string; pending: string }>(
        `with paid as (select invoice_id, sum(amount - refunded) p from payments group by invoice_id)
         select (select coalesce(sum(amount),0) from payments where paid_on >= $1 and paid_on < $2) collected,
           coalesce(sum(greatest(i.amount - i.waived_amount - coalesce(paid.p,0),0)) filter (where i.due_on < $3::date),0) overdue,
           count(distinct i.student_id) filter (where i.due_on < $3::date and i.amount - i.waived_amount - coalesce(paid.p,0) > 0) fam,
           coalesce(sum(greatest(i.amount - i.waived_amount - coalesce(paid.p,0),0)) filter (where i.due_on >= $1 and i.due_on < $2),0) pending
         from fee_invoices i left join paid on paid.invoice_id = i.id`, [monthStart, nextMonth, today]),
      t.pool.query<{ d: string; amount: string }>(
        `select to_char(paid_on,'YYYY-MM-DD') d, sum(amount) amount from payments where paid_on = any($1::date[]) group by 1`, [schoolDaysEnding(last, count, OFF_DAYS)]),
      t.pool.query<{ collected: string }>('select coalesce(sum(amount),0) collected from payments where paid_on >= $1 and paid_on < $2', [prevStart, monthStart]),
      this.settings.value<number>(t, 'fees.dailyTarget', 150000),
      this.heads(t),
    ]);
    const days = schoolDaysEnding(last, count, OFF_DAYS);
    const amounts = new Map(daily.rows.map((r) => [r.d, Number(r.amount)]));
    // Every head the school keeps, plus any an old invoice still names, so no money goes missing from the totals.
    const known = [...headList.map((h) => [h.key, h.name] as const), ...byHead.rows.filter((r) => !headList.some((h) => h.key === r.head)).map((r) => [r.head, r.head] as const)];
    const heads = known.map(([key, label]) => {
      const r = byHead.rows.find((x) => x.head === key);
      const due = Number(r?.due ?? 0);
      const collected = Math.min(due, Number(r?.collected ?? 0));
      return { head: key, label, due, collected, pct: due ? Math.round((collected / due) * 100) : 0 };
    });
    const due = heads.reduce((a, h) => a + h.due, 0);
    const tt = totals.rows[0]!;
    const collected = Number(tt.collected);
    const prevCollected = Number(prev.rows[0]!.collected);
    return {
      monthLabel: label, due, collected, pending: Number(tt.pending), overdue: Number(tt.overdue), overdueFamilies: Number(tt.fam),
      pct: due ? Math.round((collected / due) * 100) : 0, collectedDelta: prevCollected ? Math.round(((collected - prevCollected) / prevCollected) * 1000) / 10 : 0,
      byHead: heads,
      daily: days.map((d) => ({ date: d, label: dayName(d, true), full: `${dayName(d)} ${dayMonth(d)}${d === last ? ' · today' : ''}`, amount: amounts.get(d) ?? 0, isToday: d === last })),
      dailyTarget: target,
    };
  }

  async invoice(t: TenantCtx, id: string): Promise<InvoiceDetail> {
    const i = (await t.pool.query<{ id: string; student_id: string; title: string; amount: number; waived_amount: number; due_on: string; head: string; name: string; class_name: string; head_name: string | null }>(
      `select i.id, i.student_id, i.title, i.amount, i.waived_amount, i.due_on::text, i.head, s.name, c.name class_name, h.name head_name
       from fee_invoices i join students s on s.id = i.student_id join classes c on c.id = s.class_id left join fee_heads h on h.key = i.head where i.id = $1`, [id])).rows[0];
    if (!i) throw notFound('That invoice');
    const pays = (await t.pool.query<{ id: string; receipt_no: string; amount: number; refunded: number; method: string; paid_on: string; cancelled_at: Date | null; cancel_reason: string }>(
      'select id, receipt_no, amount, refunded, method, paid_on::text, cancelled_at, cancel_reason from payments where invoice_id = $1 order by paid_on, receipt_no', [id])).rows;
    const pending = (await t.pool.query<{ id: string; title: string }>(
      "select id, title from approvals where status = 'pending' and ((kind = 'fee_waiver' and payload->>'invoiceId' = $1) or (kind = 'receipt_cancel' and payload->>'invoiceId' = $1)) limit 1", [id])).rows[0] ?? null;
    const paid = pays.reduce((a, p) => a + p.amount - p.refunded, 0);
    const outstanding = Math.max(0, i.amount - i.waived_amount - paid);
    return {
      id: i.id, studentId: i.student_id, title: i.title, amount: i.amount, paid, dueOn: i.due_on, status: outstanding === 0 ? 'paid' : i.due_on < istToday() ? 'overdue' : paid ? 'partial' : 'due',
      studentName: i.name, className: i.class_name, head: i.head, headName: i.head_name ?? i.head, waived: i.waived_amount, outstanding,
      payments: pays.map((p) => ({ id: p.id, receiptNo: p.receipt_no, amount: p.amount, refunded: p.refunded, method: p.method, paidOn: p.paid_on, cancelled: !!p.cancelled_at, cancelReason: p.cancel_reason })),
      pending,
    };
  }

  /** Asks for part (or, to cancel it, all that is left) of an invoice to be waived; someone else with fees.waive decides. */
  async requestWaiver(t: TenantCtx, user: { id: string; name: string }, id: string, b: WaiverRequest): Promise<InvoiceDetail> {
    const inv = await this.invoice(t, id);
    if (inv.pending) throw new ApiError('conflict', 'A request for this invoice is already waiting in Approvals.');
    const amount = b.cancel ? inv.outstanding : b.amount;
    if (amount <= 0) throw new ApiError('conflict', 'Nothing is left to waive on this invoice.');
    if (amount > inv.outstanding) throw new ApiError('validation', `At most ${inr(inv.outstanding)} is left to pay.`, { fields: { amount: `At most ${inr(inv.outstanding)}.` } });
    await t.pool.query("insert into approvals (id, kind, title, subtitle, requester_name, requested_by, subject_ref, payload) values ($1,'fee_waiver',$2,$3,$4,$5,$6,$7)",
      [newId('apr'), b.cancel ? `Cancel ${inv.title} for ${inv.studentName}` : `Waive ₹${inr(amount)} of ${inv.title} for ${inv.studentName}`, b.reason, user.name, user.id, inv.studentId,
        JSON.stringify({ invoiceId: id, amount, cancel: b.cancel, reason: b.reason })]);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: b.cancel ? 'fee.cancel_asked' : 'fee.waiver_asked', entity: 'invoice', entityId: id, detail: { amount } });
    return this.invoice(t, id);
  }

  /** Asks for a desk receipt to be cancelled (recorded by mistake); someone else who may refund decides. */
  async requestReceiptCancel(t: TenantCtx, user: { id: string; name: string }, paymentId: string, b: ReceiptCancel): Promise<InvoiceDetail> {
    const p = (await t.pool.query<{ invoice_id: string; receipt_no: string; amount: number; cancelled_at: Date | null; online: boolean }>(
      "select invoice_id, receipt_no, amount, cancelled_at, (method = 'online') online from payments where id = $1", [paymentId])).rows[0];
    if (!p) throw notFound('That receipt');
    if (p.cancelled_at) throw new ApiError('conflict', 'That receipt is already cancelled.');
    if (p.online) throw new ApiError('conflict', 'An online payment is refunded from Online payments, not cancelled.');
    const inv = await this.invoice(t, p.invoice_id);
    if (inv.pending) throw new ApiError('conflict', 'A request for this invoice is already waiting in Approvals.');
    await t.pool.query("insert into approvals (id, kind, title, subtitle, requester_name, requested_by, subject_ref, payload) values ($1,'receipt_cancel',$2,$3,$4,$5,$6,$7)",
      [newId('apr'), `Cancel receipt ${p.receipt_no} (₹${inr(p.amount)}) for ${inv.studentName}`, b.reason, user.name, user.id, inv.studentId, JSON.stringify({ paymentId, invoiceId: p.invoice_id, reason: b.reason })]);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'receipt.cancel_asked', entity: 'payment', entityId: paymentId });
    return this.invoice(t, p.invoice_id);
  }

  /** The school's fee heads, in its order. */
  async heads(t: TenantCtx): Promise<FeeHead[]> {
    return (await t.pool.query<FeeHead>('select key, name, sort, concession from fee_heads order by sort, name')).rows;
  }

  /**
   * Replaces the list (Gradeon's console, or the school when `feeStructures.schoolEdits` is on). A head that invoices or fee
   * structures use cannot be removed, only renamed, so no money loses its kind.
   */
  async setHeads(t: TenantCtx, body: FeeHeadsPut, by: { id: string; name: string }): Promise<FeeHead[]> {
    if (!(await this.settings.value<boolean>(t, 'feeStructures.schoolEdits', true))) throw new ApiError('forbidden', 'Gradeon keeps this school’s fee heads. Ask Gradeon to change them.');
    const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'fee';
    const next = body.heads.map((h, i) => ({ key: h.key ?? slug(h.name), name: h.name, sort: i + 1, concession: h.concession }));
    if (new Set(next.map((h) => h.key)).size !== next.length) throw new ApiError('validation', 'Two fee heads have the same name.');
    const used = (await t.pool.query<{ head: string }>('select distinct head from fee_invoices union select distinct head from fee_structures')).rows.map((r) => r.head);
    const dropped = used.filter((k) => !next.some((h) => h.key === k));
    const before = await this.heads(t);
    if (dropped.length) {
      const names = dropped.map((k) => before.find((h) => h.key === k)?.name ?? k);
      throw new ApiError('conflict', `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} used by invoices or fee structures, so ${names.length === 1 ? 'it stays' : 'they stay'}. Rename instead.`);
    }
    const client = await t.pool.connect();
    try {
      await client.query('begin');
      await client.query('delete from fee_heads where not (key = any($1::text[]))', [next.map((h) => h.key)]);
      for (const h of next) {
        await client.query('insert into fee_heads (key, name, sort, concession, updated_at) values ($1,$2,$3,$4,now()) on conflict (key) do update set name = excluded.name, sort = excluded.sort, concession = excluded.concession, updated_at = now()', [h.key, h.name, h.sort, h.concession]);
      }
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    await this.audit.record(t, { actorId: by.id, actorName: by.name, action: 'fees.heads', entity: 'fee_heads', detail: { before: before.map((h) => h.name), after: next.map((h) => h.name) } });
    return this.heads(t);
  }

  async invoices(t: TenantCtx, studentId: string): Promise<InvoiceRow[]> {
    const { rows } = await t.pool.query<{ id: string; student_id: string; title: string; amount: number; waived: number; paid: string; due_on: string }>(
      `select i.id, i.student_id, i.title, i.amount, i.waived_amount waived, coalesce((select sum(amount - refunded) from payments where invoice_id = i.id),0) paid, to_char(i.due_on,'YYYY-MM-DD') due_on
       from fee_invoices i where i.student_id = $1 order by i.due_on desc, i.title, i.id`, [studentId]);
    const today = istToday();
    return rows.map((r) => {
      const net = r.amount - r.waived;
      const paid = Number(r.paid);
      return { id: r.id, studentId: r.student_id, title: r.title, amount: net, paid, dueOn: r.due_on, status: paid >= net ? 'paid' : r.due_on < today ? 'overdue' : paid > 0 ? 'partial' : 'due' };
    });
  }

  /** The office records only the ways the school takes money (console: Fees → How the office records payments). */
  async checkMethod(t: TenantCtx, method: string): Promise<void> {
    const allowed = (await this.settings.value<string[]>(t, 'fees.paymentMethods', ['cash', 'upi', 'card', 'netbanking', 'cheque'])) ?? [];
    if (!allowed.includes(method)) throw new ApiError('validation', 'The school does not take payments that way.', { fields: { method: 'Choose another way to pay.' } });
  }

  /** GST inside a payment (fees are GST-inclusive) when the school has GST receipts and the invoice's head is taxable. */
  private async tax(t: TenantCtx, head: string, amount: number): Promise<Record<string, unknown> | null> {
    const cfg = await this.settings.effective(t);
    if (!cfg.features.includes('fees.gstReceipts')) return null;
    const v = (await this.settings.doc(t)).values;
    const heads = (v['fees.gstHeads'] as string[] | undefined) ?? [];
    const rate = Number(v['fees.gstRatePct'] ?? 18);
    if (!heads.includes(head) || !rate || !v['fees.gstin']) return null;
    const taxable = Math.round((amount * 100) / (100 + rate));
    const half = Math.round((amount - taxable) / 2);
    return { gstin: v['fees.gstin'], sac: v['fees.gstSac'] ?? '', ratePct: rate, taxable, cgst: half, sgst: amount - taxable - half };
  }

  async pay(t: TenantCtx, user: { id: string; name: string }, body: PaymentCreate, online?: { providerPaymentId: string }): Promise<{ receiptNo: string; amount: number; outstanding: number; paymentId: string }> {
    const { rows } = await t.pool.query<{ id: string; amount: number; waived: number; paid: string; title: string; head: string }>(
      `select i.id, i.amount, i.waived_amount waived, coalesce((select sum(amount - refunded) from payments where invoice_id = i.id),0) paid, i.title, i.head
       from fee_invoices i where i.id = $1 and i.student_id = $2`, [body.invoiceId, body.studentId]);
    const inv = rows[0];
    if (!inv) throw notFound('That invoice');
    const outstanding = inv.amount - inv.waived - Number(inv.paid);
    if (outstanding <= 0) throw new ApiError('conflict', 'That invoice is already paid.');
    if (body.amount > outstanding) throw new ApiError('validation', `The most that can be paid on this invoice is ₹${outstanding.toLocaleString('en-IN')}.`, { fields: { amount: 'That is more than is due.' } });
    // Receipt numbers follow the school's own series (set from the console), one at a time so two payments never share a number.
    const v = (await this.settings.doc(t)).values;
    const prefix = String(v['fees.receiptPrefix'] ?? 'RCPT-{year}-').replace('{year}', istToday().slice(0, 4));
    const start = Number(v['fees.receiptStart'] ?? 9001);
    const tax = await this.tax(t, inv.head, body.amount);
    const paymentId = newId('pay');
    const client = await t.pool.connect();
    let receiptNo: string;
    try {
      await client.query('begin');
      await client.query("select pg_advisory_xact_lock(hashtext('receipts'))");
      // After the highest number in the series, not start + count: receipts imported from the old system keep their own numbers.
      const last = (await client.query<{ n: string | null }>(
        "select max(substring(receipt_no from char_length($1) + 1)::bigint) n from payments where starts_with(receipt_no, $1) and substring(receipt_no from char_length($1) + 1) ~ '^[0-9]+$'", [prefix])).rows[0]!.n;
      receiptNo = `${prefix}${String(Math.max(start, last === null ? start : Number(last) + 1)).padStart(5, '0')}`;
      await client.query('insert into payments (id, invoice_id, amount, method, reference, receipt_no, paid_on, recorded_by, tax, provider_payment_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [paymentId, inv.id, body.amount, body.method, body.reference ?? null, receiptNo, istToday(), online ? null : user.id, tax ? JSON.stringify(tax) : null, online?.providerPaymentId ?? null]);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    await this.audit.record(t, { actorId: online ? null : user.id, actorName: user.name, action: 'payment.recorded', entity: 'invoice', entityId: inv.id, detail: { amount: body.amount, receipt: receiptNo } });
    const g = await t.pool.query<{ phone: string | null }>('select g.phone from student_guardians sg join guardians g on g.id = sg.guardian_id where sg.student_id = $1 and sg.is_primary', [body.studentId]);
    if (g.rows[0]?.phone) await this.messenger.notify(t, 'fees.receipt', [{ to: g.rows[0].phone, vars: { receipt: receiptNo, amount: `₹${body.amount.toLocaleString('en-IN')}`, title: inv.title } }]);
    return { receiptNo, amount: body.amount, outstanding: outstanding - body.amount, paymentId };
  }

  /** Daily (job fees.reminders): families of invoices falling due in `fees.remindDaysBefore` days, once per invoice per day. */
  async dailyReminders(t: TenantCtx, day: string): Promise<string> {
    const cfg = await this.settings.effective(t);
    if (!cfg.features.includes('fees.reminders')) return 'Fee reminders are off for this school.';
    const days = await this.settings.value<number>(t, 'fees.remindDaysBefore', 3);
    const { rows } = await t.pool.query<{ id: string; phone: string | null; name: string }>(
      `select i.id, g.phone, s.name from fee_invoices i join students s on s.id = i.student_id and s.status = 'active'
       join student_guardians sg on sg.student_id = s.id and sg.is_primary join guardians g on g.id = sg.guardian_id
       where i.due_on = $1::date + $2::int and i.amount - i.waived_amount > coalesce((select sum(amount - refunded) from payments where invoice_id = i.id), 0)
         and not exists (select 1 from fee_reminders r where r.invoice_id = i.id and r.day = $1::date)`, [day, days]);
    for (const r of rows) await t.pool.query('insert into fee_reminders (invoice_id, day) values ($1,$2) on conflict do nothing', [r.id, day]);
    const sent = await this.messenger.notify(t, 'fees.reminder', rows.filter((r) => r.phone).map((r) => ({ to: r.phone!, vars: { student: r.name } })));
    return `${sent} reminders for invoices due in ${days} days.`;
  }

  /** Daily (job fees.lateFines): `fees.lateFeePct` of what is still owed on each overdue invoice, once per invoice per month. */
  async lateFines(t: TenantCtx, day: string): Promise<string> {
    const cfg = await this.settings.effective(t);
    if (!cfg.features.includes('fees.lateFines')) return 'Late fines are off for this school.';
    const pct = await this.settings.value<number>(t, 'fees.lateFeePct', 0);
    if (!pct) return 'The late fee is 0%.';
    const month = day.slice(0, 7);
    const { rows } = await t.pool.query<{ id: string; student_id: string; title: string; owed: number }>(
      `select i.id, i.student_id, i.title, (i.amount - i.waived_amount - coalesce((select sum(amount - refunded) from payments where invoice_id = i.id), 0))::int owed
       from fee_invoices i where i.due_on < $1::date and i.head <> 'fine'
         and not exists (select 1 from fee_fines f where f.invoice_id = i.id and f.month = $2)`, [day, month]);
    let n = 0;
    for (const r of rows.filter((x) => x.owed > 0)) {
      const amount = Math.max(1, Math.round((r.owed * pct) / 100));
      const fineId = newId('inv');
      const client = await t.pool.connect();
      try {
        await client.query('begin');
        await client.query("insert into fee_invoices (id, student_id, head, title, amount, due_on) values ($1,$2,'fine',$3,$4,$5)", [fineId, r.student_id, `Late fee: ${r.title} (${month})`, amount, day]);
        await client.query('insert into fee_fines (id, invoice_id, fine_invoice_id, month, amount) values ($1,$2,$3,$4,$5)', [newId('fin'), r.id, fineId, month, amount]);
        await client.query('commit');
        n++;
      } catch {
        await client.query('rollback').catch(() => undefined);
      } finally {
        client.release();
      }
    }
    if (n) await this.audit.record(t, { action: 'fees.lateFines', entity: 'invoice', detail: { count: n, pct, month } });
    return `${n} late fines at ${pct}%.`;
  }

  async remind(t: TenantCtx, user: { id: string; name: string }, ids: string[] | 'overdue'): Promise<{ sent: number }> {
    // "Every overdue family": all of them, not only the ones a page happens to show.
    if (ids === 'overdue') {
      ids = (await t.pool.query<{ id: string }>(
        `with paid as (select invoice_id, sum(amount - refunded) p from payments group by invoice_id)
         select distinct i.student_id id from fee_invoices i left join paid on paid.invoice_id = i.id join students s on s.id = i.student_id and s.status = 'active'
         where i.due_on < $1 and i.amount - i.waived_amount - coalesce(paid.p, 0) > 0`, [istToday()])).rows.map((r) => r.id);
    }
    const { rows } = await t.pool.query<{ phone: string | null; name: string }>(
      `select g.phone, s.name from students s join student_guardians sg on sg.student_id = s.id and sg.is_primary join guardians g on g.id = sg.guardian_id where s.id = any($1)`, [ids]);
    const list = rows.filter((r) => r.phone).map((r) => ({ to: r.phone!, vars: { student: r.name } }));
    await this.messenger.notify(t, 'fees.reminder', list);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'fee.reminded', entity: 'student', detail: { count: list.length } });
    return { sent: list.length };
  }

}
