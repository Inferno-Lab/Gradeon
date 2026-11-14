import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { addDays, istToday, type OnlinePaymentRow, type ReconRow, type RefundRow } from '@tangent/contracts';
import { newId, type Job } from '@tangent/db';
import type { PaymentEvent } from '@tangent/integrations';
import { ApiError, forbidden, notFound } from '@tangent/nest-kit';
import { ENV, type Env } from '../env.js';
import { TenantService, type AuthedUser, type TenantCtx } from '../tenancy/tenant.js';
import { FeesService } from './fees.service.js';
import { HubService } from './hub.service.js';
import { AuditService, Messenger, SettingsService } from './support.js';

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const METHODS: Record<string, 'upi' | 'card' | 'netbanking'> = { upi: 'upi', card: 'card', netbanking: 'netbanking', nb: 'netbanking', wallet: 'upi' };





/**
 * Online fee payments through the Hub's `payments` route: the family pays on the provider's page (no SDK in the app), the provider's
 * signed webhook marks the order paid, and the receipt is written once however often the webhook repeats. Refunds above the
 * school's limit need a second person; a daily job reconciles the provider's settlements with the receipts.
 */
@Injectable()
export class PaymentsService implements OnModuleInit {
  constructor(
    private readonly hubs: HubService,
    private readonly fees: FeesService,
    private readonly audit: AuditService,
    private readonly messenger: Messenger,
    private readonly settings: SettingsService,
    private readonly tenants: TenantService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.hubs.handle('payments.reconcile', (job) => this.reconcileJob(job));
    const daily = (fn: (t: TenantCtx, day: string) => Promise<string>) => async (job: Job) => {
      const s = await this.hubs.schoolPool(job.schoolId ?? '');
      if (!s) return 'School not found.';
      return fn(await this.tenants.resolve(s.slug), String(job.payload.day ?? istToday()));
    };
    this.hubs.handle('fees.reminders', daily((t, day) => this.fees.dailyReminders(t, day)));
    this.hubs.handle('fees.lateFines', daily((t, day) => this.fees.lateFines(t, day)));
  }

  /** Payments families made online, for the admin's refunds. */
  async online(t: TenantCtx): Promise<OnlinePaymentRow[]> {
    const { rows } = await t.pool.query(
      `select p.id, p.receipt_no, s.name student, i.title, p.amount, p.refunded, p.paid_on::text, p.method, p.provider_payment_id from payments p
       join fee_invoices i on i.id = p.invoice_id join students s on s.id = i.student_id where p.provider_payment_id is not null order by p.created_at desc limit 200`);
    return rows.map((p) => ({ id: p.id, receiptNo: p.receipt_no, student: p.student, title: p.title, amount: p.amount, refunded: p.refunded, paidOn: p.paid_on, method: p.method, providerPaymentId: p.provider_payment_id }));
  }

  private base(): string { return this.env.API_BASE_URL.replace(/\/$/, ''); }

  /** A checkout for what is still owed on one invoice. */
  async order(t: TenantCtx, user: AuthedUser, invoiceId: string, studentId: string): Promise<{ orderId: string; url: string; amount: number }> {
    const inv = (await t.pool.query<{ title: string; owed: number; student: string; phone: string | null; email: string | null }>(
      `select i.title, (i.amount - i.waived_amount - coalesce((select sum(amount - refunded) from payments where invoice_id = i.id), 0))::int owed, s.name student, g.phone, g.email
       from fee_invoices i join students s on s.id = i.student_id left join student_guardians sg on sg.student_id = s.id and sg.is_primary left join guardians g on g.id = sg.guardian_id
       where i.id = $1 and i.student_id = $2`, [invoiceId, studentId])).rows[0];
    if (!inv) throw notFound('That fee');
    if (inv.owed <= 0) throw new ApiError('conflict', 'That fee is already paid.');
    const r = await this.hubs.hub.resolve('payments', t.info.id, t.info.slug).catch((e: Error) => { throw new ApiError('school_unavailable', e.message); });
    if (!r.adapter.payments) throw new ApiError('school_unavailable', 'Online payment is not set up for this school yet.');
    const orderId = newId('ord');
    const link = await r.adapter.payments.createLink(r.ctx, {
      amountPaise: inv.owed * 100, reference: `${t.info.slug}:${orderId}`, description: `${inv.title} · ${inv.student}`,
      customer: { name: inv.student, phone: inv.phone ?? undefined, email: inv.email ?? undefined }, callbackUrl: `${this.base()}/hooks/paid/${t.info.slug}/${orderId}`,
      expiresAt: new Date(Date.now() + 24 * 3600_000),
    }).catch((e: Error) => { throw new ApiError('school_unavailable', `The payment page could not be opened: ${e.message}`); });
    await t.pool.query('insert into payment_orders (id, invoice_id, student_id, amount, provider, provider_order_id, checkout_url, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [orderId, invoiceId, studentId, inv.owed, r.conn?.provider ?? 'sandbox', link.linkId, link.url, user.id]);
    return { orderId, url: link.url, amount: inv.owed };
  }

  /** What the app polls while the family pays: the order and, once paid, its receipt as the app shows receipts. */
  async orderStatus(t: TenantCtx, orderId: string, studentIds: string[] | null) {
    const o = (await t.pool.query<{ id: string; invoice_id: string; student_id: string; status: string; payment_id: string | null }>('select * from payment_orders where id = $1', [orderId])).rows[0];
    if (!o || (studentIds && !studentIds.includes(o.student_id))) throw notFound('That payment');
    const p = o.payment_id ? (await t.pool.query<{ id: string; title: string; amount: number; paid_on: string; method: string; reference: string }>(
      'select p.id, i.title, p.amount, p.paid_on::text, p.method, coalesce(p.reference, p.receipt_no) reference from payments p join fee_invoices i on i.id = p.invoice_id where p.id = $1', [o.payment_id])).rows[0] : undefined;
    return { id: o.id, status: o.status, receipt: p ? { id: p.id, installmentId: o.invoice_id, title: p.title, amount: p.amount, paidOn: p.paid_on, method: p.method, reference: p.reference } : null };
  }

  /** A provider's payment event (from the webhook or the sandbox checkout). Applied once per provider payment ID. */
  async apply(ev: PaymentEvent, schoolId: string | null = null): Promise<string> {
    if (ev.kind === 'refunded') return this.refunded(ev, schoolId);
    const [slug, orderId] = ev.reference.split(':');
    if (!slug || !orderId) return `Not one of our orders: ${ev.reference}`;
    const t = await this.tenants.resolve(slug);
    if (ev.kind === 'failed') {
      await t.pool.query("update payment_orders set status = 'failed' where id = $1 and status = 'created'", [orderId]);
      return `Payment failed for ${orderId}`;
    }
    const claimed = (await t.pool.query<{ invoice_id: string; student_id: string; amount: number }>(
      "update payment_orders set status = 'paid', provider_payment_id = $2, method = $3, paid_at = now() where id = $1 and status in ('created','failed') returning invoice_id, student_id, amount",
      [orderId, ev.providerPaymentId, ev.method ?? null])).rows[0];
    if (!claimed) return `Already applied: ${ev.providerPaymentId}`;
    const paid = Math.round(ev.amountPaise / 100);
    try {
      const done = await this.fees.pay(t, { id: 'online', name: 'Online payment' }, {
        studentId: claimed.student_id, invoiceId: claimed.invoice_id, amount: paid, method: METHODS[ev.method ?? ''] ?? 'upi', reference: ev.providerPaymentId.slice(0, 60),
      }, { providerPaymentId: ev.providerPaymentId });
      await t.pool.query('update payment_orders set payment_id = $2 where id = $1', [orderId, done.paymentId]);
      return `Paid ${rupees(paid)}: receipt ${done.receiptNo}`;
    } catch (e) {
      // Money arrived but no receipt could be written (the invoice was settled at the desk meanwhile): listed for the office to refund.
      await t.pool.query('insert into reconciliation (id, day, provider_payment_id, provider_amount, receipt_amount, problem) values ($1,$2,$3,$4,null,$5) on conflict do nothing',
        [newId('rec'), istToday(), ev.providerPaymentId, paid, `Paid online but not receipted: ${(e as Error).message}`]);
      return `Paid but not receipted: ${(e as Error).message}`;
    }
  }

  /** The provider confirms a refund: marked done in the connection's school, or (a Tangent-wide connection) whichever school sent it. */
  private async refunded(ev: PaymentEvent, schoolId: string | null): Promise<string> {
    if (!ev.refundId) return 'A refund without its ID';
    // ponytail: a shared connection looks through every live school; keep refund IDs in the registry if that list grows past a few hundred.
    const ids = schoolId ? [schoolId] : await this.hubs.liveSchools();
    for (const id of ids) {
      const s = await this.hubs.schoolPool(id).catch(() => null);
      const r = await s?.pool.query("update refunds set status = 'done', done_at = now() where provider_refund_id = $1 and status = 'sent'", [ev.refundId]);
      if (r?.rowCount) return `Refund ${ev.refundId} confirmed at ${s!.slug}`;
    }
    return `Refund ${ev.refundId} not found (already confirmed, or not ours)`;
  }

  // ── Refunds (admin) ─────────────────────────────────────────────────────────

  async refunds(t: TenantCtx): Promise<RefundRow[]> {
    const { rows } = await t.pool.query(
      `select r.*, p.receipt_no, s.name student, ru.name requested_name, au.name approved_name from refunds r join payments p on p.id = r.payment_id join fee_invoices i on i.id = p.invoice_id
       join students s on s.id = i.student_id left join users ru on ru.id = r.requested_by left join users au on au.id = r.approved_by order by r.created_at desc limit 100`);
    return rows.map((r) => ({ id: r.id, paymentId: r.payment_id, receiptNo: r.receipt_no, student: r.student, amount: r.amount, reason: r.reason, status: r.status,
      requestedBy: r.requested_name, approvedBy: r.approved_name, error: r.error, createdAt: r.created_at.toISOString(), decisionNote: r.decision_note ?? '' }));
  }

  /** Asks for a refund on an online payment. Above the school's limit it waits for a second person with the same permission. */
  async requestRefund(t: TenantCtx, user: AuthedUser, paymentId: string, amount: number, reason: string): Promise<RefundRow> {
    const p = (await t.pool.query<{ amount: number; refunded: number; provider_payment_id: string | null }>('select amount, refunded, provider_payment_id from payments where id = $1', [paymentId])).rows[0];
    if (!p) throw notFound('That payment');
    if (!p.provider_payment_id) throw new ApiError('validation', 'Only payments made online can be refunded here. Cash and cheques are returned at the desk.');
    const pending = Number((await t.pool.query<{ n: string }>("select coalesce(sum(amount), 0) n from refunds where payment_id = $1 and status in ('requested','sent')", [paymentId])).rows[0]!.n);
    if (amount > p.amount - p.refunded - pending) throw new ApiError('validation', `At most ${rupees(p.amount - p.refunded - pending)} can be refunded on this payment.`, { fields: { amount: 'That is more than can be refunded.' } });
    const id = newId('rfd');
    await t.pool.query('insert into refunds (id, payment_id, amount, reason, requested_by) values ($1,$2,$3,$4,$5)', [id, paymentId, amount, reason, user.id]);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'refund.requested', entity: 'payment', entityId: paymentId, detail: { amount } });
    const limit = await this.settings.value<number>(t, 'fees.refundApprovalAbove', 5000);
    if (amount <= limit) await this.send(t, user, id);
    return (await this.refunds(t)).find((r) => r.id === id)!;
  }

  async decideRefund(t: TenantCtx, user: AuthedUser, id: string, yes: boolean, note = ''): Promise<RefundRow> {
    const r = (await t.pool.query<{ status: string; requested_by: string | null }>('select status, requested_by from refunds where id = $1', [id])).rows[0];
    if (!r) throw notFound('That refund');
    if (r.status !== 'requested') throw new ApiError('conflict', 'This refund is not waiting for approval.');
    if (r.requested_by === user.id) throw forbidden('A second person has to approve this refund.');
    if (!yes) {
      await t.pool.query("update refunds set status = 'rejected', approved_by = $2, done_at = now(), decision_note = $3 where id = $1", [id, user.id, note]);
      await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'refund.rejected', entity: 'refund', entityId: id });
    } else {
      await this.send(t, user, id);
    }
    return (await this.refunds(t)).find((x) => x.id === id)!;
  }

  /** Sends an approved refund to the provider and takes it off the receipt. */
  private async send(t: TenantCtx, user: AuthedUser, id: string): Promise<void> {
    const r = (await t.pool.query<{ amount: number; reason: string; payment_id: string; provider_payment_id: string; receipt_no: string; student_id: string }>(
      'select r.amount, r.reason, r.payment_id, p.provider_payment_id, p.receipt_no, i.student_id from refunds r join payments p on p.id = r.payment_id join fee_invoices i on i.id = p.invoice_id where r.id = $1', [id])).rows[0]!;
    try {
      const route = await this.hubs.hub.resolve('payments', t.info.id, t.info.slug);
      const out = await route.adapter.payments!.refund(route.ctx, r.provider_payment_id, r.amount * 100, r.reason);
      await t.pool.query("update refunds set status = 'sent', provider_refund_id = $2, approved_by = $3 where id = $1", [id, out.refundId, user.id]);
      await t.pool.query('update payments set refunded = refunded + $2 where id = $1', [r.payment_id, r.amount]);
      await t.pool.query("update payment_orders set status = case when (select amount - refunded from payments where id = $1) <= 0 then 'refunded' else 'partial_refund' end where payment_id = $1", [r.payment_id]);
      await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'refund.sent', entity: 'payment', entityId: r.payment_id, detail: { amount: r.amount, refundId: out.refundId } });
      const g = (await t.pool.query<{ phone: string | null; email: string | null }>('select g.phone, g.email from student_guardians sg join guardians g on g.id = sg.guardian_id where sg.student_id = $1 and sg.is_primary', [r.student_id])).rows[0];
      if (g?.phone) await this.messenger.notify(t, 'fees.refunded', [{ to: g.phone, email: g.email, vars: { receipt: r.receipt_no, amount: rupees(r.amount) } }]);
    } catch (e) {
      await t.pool.query("update refunds set status = 'failed', error = $2, approved_by = $3 where id = $1", [id, (e as Error).message.slice(0, 300), user.id]);
    }
  }

  // ── Reconciliation ──────────────────────────────────────────────────────────

  async reconciliation(t: TenantCtx): Promise<ReconRow[]> {
    const { rows } = await t.pool.query('select id, day::text as day, provider_payment_id, provider_amount, receipt_amount, problem, resolved_at, note from reconciliation order by 2 desc, created_at desc limit 200');
    return rows.map((r) => ({ id: r.id, day: r.day, providerPaymentId: r.provider_payment_id, providerAmount: r.provider_amount,
      receiptAmount: r.receipt_amount, problem: r.problem, resolved: !!r.resolved_at, note: r.note ?? '' }));
  }

  async resolveRecon(t: TenantCtx, user: AuthedUser, id: string, note: string): Promise<void> {
    const { rowCount } = await t.pool.query('update reconciliation set resolved_at = now(), note = $2 where id = $1 and resolved_at is null', [id, note]);
    if (!rowCount) throw notFound('That finding');
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'reconciliation.resolved', entity: 'reconciliation', entityId: id });
  }

  /** Daily: yesterday's provider payments against yesterday's online receipts; each difference is listed once. */
  private async reconcileJob(job: Job): Promise<string> {
    const s = await this.hubs.schoolPool(job.schoolId ?? '');
    if (!s) return 'School not found.';
    const day = addDays(String(job.payload.day ?? istToday()), -1);
    const route = await this.hubs.hub.resolve('payments', s.id, s.slug).catch(() => null);
    if (!route?.adapter.payments?.settlements || route.sandbox) return 'No provider to reconcile with.';
    const from = new Date(`${day}T00:00:00+05:30`);
    const theirs = await route.adapter.payments.settlements(route.ctx, from, new Date(from.getTime() + 24 * 3600_000));
    const ours = (await s.pool.query<{ provider_payment_id: string; amount: number }>('select provider_payment_id, amount from payments where paid_on = $1 and provider_payment_id is not null', [day])).rows;
    const mine = new Map(ours.map((o) => [o.provider_payment_id, o.amount]));
    const problems: [string, number | null, number | null, string][] = [];
    for (const p of theirs) {
      const r = mine.get(p.providerPaymentId);
      if (r === undefined) problems.push([p.providerPaymentId, Math.round(p.amountPaise / 100), null, 'The provider took this payment but there is no receipt.']);
      else if (r * 100 !== p.amountPaise) problems.push([p.providerPaymentId, Math.round(p.amountPaise / 100), r, 'The amounts differ.']);
      mine.delete(p.providerPaymentId);
    }
    for (const [id, amount] of mine) problems.push([id, null, amount, 'There is a receipt but the provider has no such payment.']);
    for (const [id, theirAmt, ourAmt, problem] of problems) {
      await s.pool.query('insert into reconciliation (id, day, provider_payment_id, provider_amount, receipt_amount, problem) values ($1,$2,$3,$4,$5,$6) on conflict do nothing',
        [newId('rec'), day, id, theirAmt, ourAmt, problem]);
    }
    return `${theirs.length} provider payments, ${problems.length} differences on ${day}.`;
  }
}
