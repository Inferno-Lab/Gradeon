import type pg from 'pg';

/**
 * Runs `fn` if the job is due, on exactly one server: the claim is a single atomic update on the registry, so when two servers
 * check at once only one wins. ponytail: claim-then-run, so a job that crashes waits a full period; add a lease when that matters.
 */
export async function runIfDue(pool: pg.Pool, name: string, everyMs: number, fn: () => Promise<unknown>): Promise<boolean> {
  await pool.query('insert into jobs (name) values ($1) on conflict do nothing', [name]);
  // 90 % of the period, so a check that lands a moment early does not skip a whole round.
  const { rowCount } = await pool.query(
    "update jobs set last_run_at = now() where name = $1 and (last_run_at is null or last_run_at < now() - $2 * interval '1 millisecond')", [name, everyMs * 0.9]);
  if (!rowCount) return false;
  await fn();
  return true;
}

/** Checks now and every few minutes, so a job that fell due while the server was asleep or restarting runs as soon as it is back. */
export function scheduleJob(pool: pg.Pool, name: string, everyMs: number, fn: () => Promise<unknown>, onError: (err: Error) => void): () => void {
  const tick = () => void runIfDue(pool, name, everyMs, fn).catch(onError);
  const timer = setInterval(tick, Math.min(everyMs, 5 * 60_000));
  timer.unref();
  tick();
  return () => clearInterval(timer);
}
