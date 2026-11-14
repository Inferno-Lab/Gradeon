import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { pg } from '@tangent/db';
import type { TenantCtx } from '../tenancy/tenant.js';

/** One live event for the app: what changed, for whom. The app refetches what it needs, so events stay small. */
export interface LiveEvent {
  type: 'chat.message' | 'chat.typing' | 'chat.read' | 'notification' | 'bus.position' | 'bus.trip' | 'config';
  data: Record<string, unknown>;
}

type Sub = { userId: string; send: (e: LiveEvent) => void };
const CHANNEL = 'tangent_live';

/**
 * Live updates (chat, typing, read receipts, notifications, the bus) through Postgres LISTEN/NOTIFY on each school's own
 * database, so any number of servers can serve the stream: whichever server takes a write notifies, every server listening
 * passes it to its connected phones. One listening connection per school per server, opened by the first phone and closed
 * a minute after the last one leaves.
 */
@Injectable()
export class StreamService implements OnModuleDestroy {
  private readonly log = new Logger('Stream');
  private readonly schools = new Map<string, { client: pg.Client | null; ready: Promise<void>; subs: Set<Sub>; idle?: NodeJS.Timeout }>();

  /** Tells these people (user ids; empty means everyone signed in at the school) that something changed. */
  async emit(t: TenantCtx, users: string[], e: LiveEvent): Promise<void> {
    const payload = JSON.stringify({ users, ...e });
    // NOTIFY payloads are limited to 8000 bytes: an event that big is cut to its type, and the app refetches.
    await t.pool.query('select pg_notify($1, $2)', [CHANNEL, payload.length < 7900 ? payload : JSON.stringify({ users, type: e.type, data: {} })]).catch(() => undefined);
  }

  subscribe(t: TenantCtx, userId: string, send: (e: LiveEvent) => void): () => void {
    let s = this.schools.get(t.info.slug);
    if (!s) {
      const client = new pg.Client({ connectionString: t.info.dbUrl });
      s = { client, subs: new Set(), ready: Promise.resolve() };
      const entry = s;
      entry.ready = client.connect().then(() => client.query(`listen ${CHANNEL}`)).then(() => undefined);
      client.on('notification', (n) => {
        if (n.channel !== CHANNEL || !n.payload) return;
        let msg: LiveEvent & { users: string[] };
        try { msg = JSON.parse(n.payload); } catch { return; }
        for (const sub of entry.subs) if (!msg.users.length || msg.users.includes(sub.userId)) sub.send({ type: msg.type, data: msg.data });
      });
      client.on('error', (err) => { this.log.warn(`${t.info.slug}: the live connection dropped (${err.message})`); this.close(t.info.slug); });
      entry.ready.catch((err: Error) => { this.log.warn(`${t.info.slug}: could not listen (${err.message})`); this.close(t.info.slug); });
      this.schools.set(t.info.slug, entry);
    }
    if (s.idle) { clearTimeout(s.idle); s.idle = undefined; }
    const sub: Sub = { userId, send };
    s.subs.add(sub);
    return () => {
      const cur = this.schools.get(t.info.slug);
      if (!cur) return;
      cur.subs.delete(sub);
      if (!cur.subs.size) cur.idle = setTimeout(() => this.close(t.info.slug), 60_000);
    };
  }

  private close(slug: string): void {
    const s = this.schools.get(slug);
    if (!s) return;
    this.schools.delete(slug);
    if (s.idle) clearTimeout(s.idle);
    void s.client?.end().catch(() => undefined);
  }

  onModuleDestroy(): void {
    for (const slug of [...this.schools.keys()]) this.close(slug);
  }
}
