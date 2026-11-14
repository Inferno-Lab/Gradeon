import { All, Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import { appIdFor } from '@tangent/contracts';
import { sandboxLink } from '@tangent/integrations';
import { ApiError, forbidden } from '@tangent/nest-kit';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Public } from '../auth/guards.js';
import { ENV, type Env } from '../env.js';
import { NoTenant, TenantService } from '../tenancy/tenant.js';
import { HubService } from './hub.service.js';
import { PaymentsService } from './payments.service.js';

type Raw = FastifyRequest & { rawBody?: Buffer };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A plain page for a browser outside the app (the test checkout, the page after paying). Server-rendered: no admin styles here. */
function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{margin:0;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:Canvas;color:CanvasText;display:grid;place-items:center;min-height:100vh}
main{max-width:420px;width:100%;padding:24px;box-sizing:border-box}h1{font-size:22px;margin:0 0 8px}p{margin:0 0 16px;opacity:.8}.amt{font-size:32px;font-weight:600;margin:8px 0 16px}
.note{font-size:13px;padding:10px 12px;border-radius:10px;border:1px solid color-mix(in srgb,CanvasText 18%,transparent);margin-bottom:16px}
form{display:flex;gap:8px}button,a.btn{flex:1;font:inherit;font-weight:600;padding:12px;border-radius:12px;border:1px solid color-mix(in srgb,CanvasText 25%,transparent);background:Canvas;color:CanvasText;cursor:pointer;text-align:center;text-decoration:none}
button.go{background:CanvasText;color:Canvas}</style></head><body><main>${body}</main></body></html>`;
}

/**
 * Everything a third party or a family's browser calls without signing in: provider webhooks (each address carries a secret token
 * and the provider's own signature is checked), the test track's checkout and file links (signed, short-lived), and the page a
 * family lands on after paying.
 */
@Controller('hooks')
@Public()
@NoTenant()
export class HooksController {
  constructor(
    private readonly hubs: HubService,
    private readonly payments: PaymentsService,
    private readonly tenants: TenantService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ── The school's app, from the QR code on a welcome letter ─────────────────

  /**
   * Sends a phone to the school's app in its own store (Google Play by the package name, the App Store by the link the last iPhone
   * build reported); a computer, or a phone whose store has no listing yet, gets a page with what there is.
   */
  @Get('app/:slug')
  async app(@Param('slug') slug: string, @Req() req: FastifyRequest, @Res() res: FastifyReply) {
    const info = await this.tenants.registry.school(slug);
    if (!info) return res.status(404).type('text/html').send(page('Not found', '<h1>We could not find that school</h1><p>Check the letter and try again.</p>'));
    const builds = (await this.tenants.registry.pool.query<{ platform: string; url: string | null; store: string | null }>(
      "select distinct on (b.platform) b.platform, b.url, b.store from builds b where b.school_id = $1 and b.status = 'done' order by b.platform, b.created_at desc", [info.id])).rows;
    const played = builds.find((b) => b.platform === 'android');
    const android = played ? `https://play.google.com/store/apps/details?id=${played.store || appIdFor(slug)}` : null;
    const ios = builds.find((b) => b.platform === 'ios' && b.url?.startsWith('https://'))?.url ?? null;
    const ua = String(req.headers['user-agent'] ?? '');
    const go = /android/i.test(ua) ? android : /iphone|ipad|ipod/i.test(ua) ? ios : null;
    if (go) return res.redirect(go, 302);
    const links = [android && `<a class="btn" href="${esc(android)}">Google Play</a>`, ios && `<a class="btn" href="${esc(ios)}">App Store</a>`].filter(Boolean).join('');
    return res.type('text/html').send(page(info.name, `<h1>${esc(info.name)}</h1>${links
      ? `<p>Get the school's app on your phone.</p><form>${links}</form>`
      : '<p>The school’s app is not in the stores yet. The school will tell you when it is.</p>'}`));
  }

  // ── The test track's checkout ──────────────────────────────────────────────

  @Get('sandbox-pay/:token')
  sandboxPay(@Param('token') token: string, @Res() reply: FastifyReply): void {
    const d = sandboxLink<{ amount: number; desc: string }>(this.env.SECRETS_KEY, token);
    if (!d) { void reply.code(410).type('text/html').send(page('Link expired', '<h1>This payment link has expired</h1><p>Go back to the app and try again.</p>')); return; }
    void reply.type('text/html').send(page('Test payment', `<h1>Test payment</h1><p>${esc(d.desc)}</p><div class="amt">₹${(d.amount / 100).toLocaleString('en-IN')}</div>
<div class="note">This is Tangent's test checkout. No money moves: choose what the bank would say.</div>
<form method="post"><button name="outcome" value="failed">Payment fails</button><button class="go" name="outcome" value="paid">Pay</button></form>`));
  }

  @Post('sandbox-pay/:token') @HttpCode(303)
  async sandboxPaid(@Param('token') token: string, @Body() body: { outcome?: string }, @Res() reply: FastifyReply): Promise<void> {
    const d = sandboxLink<{ linkId: string; ref: string; amount: number; back: string }>(this.env.SECRETS_KEY, token);
    if (!d) { void reply.code(410).type('text/html').send(page('Link expired', '<h1>This payment link has expired</h1>')); return; }
    await this.payments.apply({ kind: body?.outcome === 'paid' ? 'paid' : 'failed', reference: d.ref, providerPaymentId: `sbp_${d.linkId}`, amountPaise: d.amount, method: 'upi' });
    void reply.redirect(d.back, 303);
  }

  /** Where the provider sends the family after paying. The app is polling the order; this page says what happened. */
  @Get('paid/:school/:order')
  async paid(@Param('school') slug: string, @Param('order') orderId: string, @Res() reply: FastifyReply): Promise<void> {
    const status = await this.tenants.resolve(slug).then((t) => t.pool.query<{ status: string }>('select status from payment_orders where id = $1', [orderId])).then((r) => r.rows[0]?.status).catch(() => undefined);
    const [title, text] = status === 'paid' ? ['Payment received', 'Thank you. The receipt is in the app.']
      : status === 'failed' ? ['Payment did not go through', 'No money was taken. Go back to the app to try again.']
      : ['Checking your payment', 'This takes a few seconds. The app shows the receipt as soon as the bank confirms.'];
    void reply.type('text/html').send(page(title, `<h1>${title}</h1><p>${text}</p><form><a class="btn" href="tangent://open/fees">Back to the app</a></form>`));
  }

  // ── The test track's file storage ──────────────────────────────────────────

  @Get('sandbox-storage/:token')
  async sandboxGet(@Param('token') token: string, @Res() reply: FastifyReply): Promise<void> {
    const d = sandboxLink<{ p: string; key: string; name: string | null }>(this.env.SECRETS_KEY, token);
    if (!d || d.p !== 'get') { void reply.code(403).send('This link has expired.'); return; }
    const { rows } = await this.hubs.hub.o.pool.query('select mime, data from sandbox_files where key = $1', [d.key]);
    if (!rows[0]) { void reply.code(404).send('Not found'); return; }
    if (d.name) void reply.header('content-disposition', `attachment; filename="${d.name.replace(/["\\\r\n]/g, '')}"`);
    void reply.header('cache-control', 'private, max-age=300').type(rows[0].mime).send(rows[0].data);
  }

  @Put('sandbox-storage/:token') @HttpCode(200)
  async sandboxPut(@Param('token') token: string, @Req() req: Raw): Promise<{ ok: true }> {
    const d = sandboxLink<{ p: string; key: string; mime: string; max: number }>(this.env.SECRETS_KEY, token);
    const body = req.rawBody ?? (Buffer.isBuffer(req.body) ? req.body : null);
    if (!d || d.p !== 'put') throw forbidden('This upload link has expired. Start the upload again.');
    if (!body || body.length > d.max) throw new ApiError('validation', 'The file is larger than allowed.');
    await this.hubs.hub.o.pool.query('insert into sandbox_files (key, mime, data) values ($1,$2,$3) on conflict (key) do update set mime = excluded.mime, data = excluded.data, at = now()', [d.key, d.mime, body]);
    return { ok: true };
  }

  // ── Provider webhooks ──────────────────────────────────────────────────────

  @All(':connection/:token')
  async inbound(@Param('connection') conn: string, @Param('token') token: string, @Query() query: Record<string, string>, @Req() req: Raw, @Res() reply: FastifyReply): Promise<void> {
    const raw = req.rawBody ?? (Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : req.body ? JSON.stringify(req.body) : ''));
    const res = await this.hubs.hub.inbound(conn, token, { headers: req.headers, raw, query });
    const notes: string[] = [];
    for (const ev of res.payments ?? []) notes.push(await this.payments.apply(ev, res.connection?.schoolId ?? null).catch((e: Error) => `Could not apply: ${e.message}`));
    if (notes.length) await this.hubs.hub.o.pool.query("update integration_hook_events set summary = left(summary || ' · ' || $2, 300) where id = (select id from integration_hook_events where connection_id = $1 order by at desc limit 1)", [conn, notes.join(' · ')]);
    if (res.reply) { void reply.code(res.reply.status).type('text/plain').send(res.reply.body); return; }
    void reply.code(res.ok ? 200 : 400).send({ ok: res.ok });
  }
}
