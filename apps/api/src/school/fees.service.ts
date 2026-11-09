import { Injectable } from '@nestjs/common';
import { newId } from '@gradeon/db';
import { addDays, dayName, dayMonth, istToday, latestSchoolDay, schoolDaysEnding, type FeeSummary, type InvoiceRow, type PaymentCreate } from '@gradeon/contracts';
import { ApiError, notFound } from '@gradeon/nest-kit';
import type { TenantCtx } from '../tenancy/tenant.js';
import { AuditService, Messenger, SettingsService } from './support.js';

const HEADS = [
  ['tuition', 'Tuition'], ['transport', 'Transport'], ['activities', 'Activities'], ['lab', 'Lab'],
] as const;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

@Injectable()
export class FeesService {
  constructor(
    private readonly audit: AuditService,
    private readonly messenger: Messenger,
    private readonly settings: SettingsService,
  ) {}

  /** Money for the month of the latest school day: what fell due, what came in, and what is late. */
  async summary(t: TenantCtx, count = 6): Promise<FeeSummary> {
    const OFF_DAYS = await this.settings.offDays(t);
    const today = istToday();
    const last = latestSchoolDay(today, OFF_DAYS);
    const monthStart = `${last.slice(0, 7)}-01`;
    const nextMonth = addDays(monthStart, 32).slice(0, 7) + '-01';
    const prevStart = addDays(monthStart, -1).slice(0, 7) + '-01';
    const [byHead, totals, daily, prev, target] = await Promise.all([
      t.pool.query<{ head: string; due: string; collected: string }>(
        `select i.head, coalesce(sum(i.amount - i.waived_amount),0) due,
           coalesce(sum((select coalesce(sum(p.amount),0) from payments p where p.invoice_id = i.id)),0) collected
         from fee_invoices i where i.due_on >= $1 and i.due_on < $2 group by i.head`, [monthStart, nextMonth]),
      t.pool.query<{ collected: string; overdue: string; fam: string; pending: string }>(
        `with paid as (select invoice_id, sum(amount) p from payments group by invoice_id)
         select (select coalesce(sum(amount),0) from payments where paid_on >= $1 and paid_on < $2) collected,
           coalesce(sum(greatest(i.amount - i.waived_amount - coalesce(paid.p,0),0)) filter (where i.due_on < $3::date),0) overdue,
           count(distinct i.student_id) filter (where i.due_on < $3::date and i.amount - i.waived_amount - coalesce(paid.p,0) > 0) fam,
           coalesce(sum(greatest(i.amount - i.waived_amount - coalesce(paid.p,0),0)) filter (where i.due_on >= $1 and i.due_on < $2),0) pending
         from fee_invoices i left join paid on paid.invoice_id = i.id`, [monthStart, nextMonth, today]),
      t.pool.query<{ d: string; amount: string }>(
        `select to_char(paid_on,'YYYY-MM-DD') d, sum(amount) amount from payments where paid_on = any($1::date[]) group by 1`, [schoolDaysEnding(last, count, OFF_DAYS)]),
      t.pool.query<{ collected: string }>('select coalesce(sum(amount),0) collected from payments where paid_on >= $1 and paid_on < $2', [prevStart, monthStart]),
      this.settings.value<number>(t, 'fees.dailyTarget', 150000),
    ]);
    const days = schoolDaysEnding(last, count, OFF_DAYS);
    const amounts = new Map(daily.rows.map((r) => [r.d, Number(r.amount)]));
    const heads = HEADS.map(([key, label]) => {
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
      monthLabel: MONTHS[Number(last.slice(5, 7)) - 1]!, due, collected, pending: Number(tt.pending), overdue: Number(tt.overdue), overdueFamilies: Number(tt.fam),
      pct: due ? Math.round((collected / due) * 100) : 0, collectedDelta: prevCollected ? Math.round(((collected - prevCollected) / prevCollected) * 1000) / 10 : 0,
      byHead: heads,
      daily: days.map((d) => ({ date: d, label: dayName(d, true), full: `${dayName(d)} ${dayMonth(d)}${d === last ? ' · today' : ''}`, amount: amounts.get(d) ?? 0, isToday: d === last })),
      dailyTarget: target,
    };
  }

  async invoices(t: TenantCtx, studentId: string): Promise<InvoiceRow[]> {
    const { rows } = await t.pool.query<{ id: string; student_id: string; title: string; amount: number; waived: number; paid: string; due_on: string }>(
      `select i.id, i.student_id, i.title, i.amount, i.waived_amount waived, coalesce((select sum(amount) from payments where invoice_id = i.id),0) paid, to_char(i.due_on,'YYYY-MM-DD') due_on
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

  async pay(t: TenantCtx, user: { id: string; name: string }, body: PaymentCreate): Promise<{ receiptNo: string; amount: number; outstanding: number }> {
    const { rows } = await t.pool.query<{ id: string; amount: number; waived: number; paid: string; title: string }>(
      `select i.id, i.amount, i.waived_amount waived, coalesce((select sum(amount) from payments where invoice_id = i.id),0) paid, i.title
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
    const client = await t.pool.connect();
    let receiptNo: string;
    try {
      await client.query('begin');
      await client.query("select pg_advisory_xact_lock(hashtext('receipts'))");
      // After the highest number in the series, not start + count: receipts imported from the old system keep their own numbers.
      const last = (await client.query<{ n: string | null }>(
        "select max(substring(receipt_no from char_length($1) + 1)::bigint) n from payments where starts_with(receipt_no, $1) and substring(receipt_no from char_length($1) + 1) ~ '^[0-9]+$'", [prefix])).rows[0]!.n;
      receiptNo = `${prefix}${String(Math.max(start, last === null ? start : Number(last) + 1)).padStart(5, '0')}`;
      await client.query('insert into payments (id, invoice_id, amount, method, reference, receipt_no, paid_on, recorded_by) values ($1,$2,$3,$4,$5,$6,$7,$8)',
        [newId('pay'), inv.id, body.amount, body.method, body.reference ?? null, receiptNo, istToday(), user.id]);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'payment.recorded', entity: 'invoice', entityId: inv.id, detail: { amount: body.amount, receipt: receiptNo } });
    const g = await t.pool.query<{ phone: string | null }>('select g.phone from student_guardians sg join guardians g on g.id = sg.guardian_id where sg.student_id = $1 and sg.is_primary', [body.studentId]);
    if (g.rows[0]?.phone) await this.messenger.notify(t, 'fees.receipt', [{ to: g.rows[0].phone, vars: { receipt: receiptNo, amount: `₹${body.amount.toLocaleString('en-IN')}`, title: inv.title } }]);
    return { receiptNo, amount: body.amount, outstanding: outstanding - body.amount };
  }

  async remind(t: TenantCtx, user: { id: string; name: string }, ids: string[]): Promise<{ sent: number }> {
    const { rows } = await t.pool.query<{ phone: string | null; name: string }>(
      `select g.phone, s.name from students s join student_guardians sg on sg.student_id = s.id and sg.is_primary join guardians g on g.id = sg.guardian_id where s.id = any($1)`, [ids]);
    const list = rows.filter((r) => r.phone).map((r) => ({ to: r.phone!, vars: { student: r.name } }));
    await this.messenger.notify(t, 'fees.reminder', list);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'fee.reminded', entity: 'student', detail: { count: list.length } });
    return { sent: list.length };
  }

}
