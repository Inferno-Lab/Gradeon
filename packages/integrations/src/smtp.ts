import { randomBytes } from 'node:crypto';
import { connect as netConnect, type Socket } from 'node:net';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { ProviderError } from './types.js';

export interface SmtpConfig { host: string; port: number; security: 'tls' | 'starttls'; user: string; password: string }

/** Reads whole SMTP replies ("250-…" lines until "250 …") from a socket. */
function reader(sock: Socket | TLSSocket) {
  let buf = '';
  const waiting: ((reply: { code: number; text: string }) => void)[] = [];
  const ready: { code: number; text: string }[] = [];
  const onData = (d: Buffer) => {
    buf += d.toString('utf8');
    for (;;) {
      const lines = buf.split('\r\n');
      const end = lines.findIndex((l) => /^\d{3} /.test(l));
      if (end < 0) return;
      const reply = { code: Number(lines[end]!.slice(0, 3)), text: lines.slice(0, end + 1).map((l) => l.slice(4)).join(' ') };
      buf = lines.slice(end + 1).join('\r\n');
      const w = waiting.shift();
      if (w) w(reply); else ready.push(reply);
    }
  };
  sock.on('data', onData);
  return {
    next: () => new Promise<{ code: number; text: string }>((ok, no) => {
      const r = ready.shift();
      if (r) return ok(r);
      const t = setTimeout(() => no(new ProviderError('The mail server stopped answering.')), 15_000);
      waiting.push((reply) => { clearTimeout(t); ok(reply); });
    }),
    off: () => sock.off('data', onData),
  };
}

/** Sends one message. Plain text plus an HTML version when given; the From is set by the connection. */
export async function smtpSend(cfg: SmtpConfig, from: string, to: string, subject: string, text: string, html?: string): Promise<string> {
  const open = () => new Promise<Socket | TLSSocket>((ok, no) => {
    const s = cfg.security === 'tls' ? tlsConnect({ host: cfg.host, port: cfg.port, servername: cfg.host }, () => ok(s)) : netConnect({ host: cfg.host, port: cfg.port }, () => ok(s));
    s.once('error', (e) => no(new ProviderError(`Could not reach the mail server: ${e.message}`)));
    s.setTimeout(20_000, () => s.destroy(new Error('timed out')));
  });
  let sock = await open();
  let r = reader(sock);
  const say = async (line: string | null, want: number) => {
    if (line !== null) sock.write(`${line}\r\n`);
    const reply = await r.next();
    if (reply.code !== want) throw new ProviderError(`The mail server said ${reply.code}: ${reply.text}`, reply.code >= 500);
    return reply;
  };
  try {
    await say(null, 220);
    await say('EHLO gradeon.app', 250);
    if (cfg.security === 'starttls') {
      await say('STARTTLS', 220);
      r.off();
      sock = await new Promise<TLSSocket>((ok, no) => { const t = tlsConnect({ socket: sock, servername: cfg.host }, () => ok(t)); t.once('error', no); });
      r = reader(sock);
      await say('EHLO gradeon.app', 250);
    }
    await say(`AUTH PLAIN ${Buffer.from(`\0${cfg.user}\0${cfg.password}`).toString('base64')}`, 235);
    const address = (s: string) => /<([^>]+)>/.exec(s)?.[1] ?? s.trim();
    await say(`MAIL FROM:<${address(from)}>`, 250);
    await say(`RCPT TO:<${address(to)}>`, 250);
    await say('DATA', 354);
    const id = `${randomBytes(12).toString('hex')}@gradeon.app`;
    const boundary = `b${randomBytes(8).toString('hex')}`;
    const word = (s: string) => (/^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`);
    const b64 = (s: string) => Buffer.from(s).toString('base64').replace(/.{76}/g, '$&\r\n');
    const head = [`From: ${from}`, `To: ${to}`, `Subject: ${word(subject)}`, `Message-ID: <${id}>`, `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0'];
    const body = html
      ? [`Content-Type: multipart/alternative; boundary="${boundary}"`, '', `--${boundary}`, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', b64(text),
        `--${boundary}`, 'Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: base64', '', b64(html), `--${boundary}--`]
      : ['Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', b64(text)];
    await say(`${[...head, ...body].join('\r\n')}\r\n.`, 250);
    sock.write('QUIT\r\n');
    return id;
  } finally {
    sock.end();
  }
}
