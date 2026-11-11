import type pg from 'pg';
import { newId } from './ids.js';

/** Per-school background work: reminders, late fines, file checks, reconciliation, erasure. Lives in the registry's job_queue. */
export const JOB_KINDS = ['fees.reminders', 'fees.lateFines', 'files.scan', 'files.thumb', 'files.usage', 'payments.reconcile', 'retention.erase', 'imports.run', 'notices.publish', 'transport.poll'] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export interface Job { id: string; schoolId: string | null; kind: JobKind; payload: Record<string, unknown>; attempts: number }

const MAX_ATTEMPTS = 3;
const LEASE_SECONDS = 300;

/**
 * Queues a job. A payload with a `day` is queued once per school, kind and day (the daily jobs), however many servers ask.
 * Returns the job's ID, or null when that day's job already exists.
 */
export async function enqueue(pool: pg.Pool, kind: JobKind, schoolId: string | null, payload: Record<string, unknown> = {}, runAt = new Date()): Promise<string | null> {
  const id = newId('job');
  const { rowCount } = await pool.query(
    "insert into job_queue (id, school_id, kind, payload, run_at) values ($1,$2,$3,$4,$5) on conflict (kind, coalesce(school_id, ''), (payload->>'day')) where payload ? 'day' do nothing",
    [id, schoolId, kind, JSON.stringify(payload), runAt]);
  return rowCount ? id : null;
}

/**
 * Runs due jobs, a few at a time. Each is claimed with SKIP LOCKED and a lease, so two servers never run one job at once and a
 * job whose server died mid-run is picked up again when the lease ends. A failure is retried after 1, then 10 minutes, then failed.
 */
export async function work(pool: pg.Pool, handler: (job: Job) => Promise<string | void>, limit = 5): Promise<number> {
  const { rows } = await pool.query<{ id: string; school_id: string | null; kind: JobKind; payload: Record<string, unknown>; attempts: number }>(
    `update job_queue set status = 'running', attempts = attempts + 1, locked_until = now() + interval '${LEASE_SECONDS} seconds'
     where id in (select id from job_queue where (status = 'queued' and run_at <= now()) or (status = 'running' and locked_until < now())
                  order by run_at limit $1 for update skip locked)
     returning id, school_id, kind, payload, attempts`, [limit]);
  for (const r of rows) {
    try {
      const result = await handler({ id: r.id, schoolId: r.school_id, kind: r.kind, payload: r.payload, attempts: r.attempts });
      await pool.query("update job_queue set status = 'done', result = $2, last_error = null, locked_until = null, finished_at = now() where id = $1", [r.id, result ?? null]);
    } catch (err) {
      const msg = (err as Error).message.slice(0, 500);
      const last = r.attempts >= MAX_ATTEMPTS;
      await pool.query(
        `update job_queue set status = $2, last_error = $3, locked_until = null, run_at = now() + make_interval(mins => $4), finished_at = case when $2 = 'failed' then now() end where id = $1`,
        [r.id, last ? 'failed' : 'queued', msg, 10 ** (r.attempts - 1)]);
    }
  }
  return rows.length;
}

/** Puts a failed job back in the queue (the console's Retry). */
export async function retryJob(pool: pg.Pool, id: string): Promise<boolean> {
  const { rowCount } = await pool.query("update job_queue set status = 'queued', attempts = 0, last_error = null, run_at = now(), finished_at = null where id = $1 and status = 'failed'", [id]);
  return !!rowCount;
}
