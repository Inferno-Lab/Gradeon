import { createHash } from 'node:crypto';

export interface ErrorEvent {
  source: 'api' | 'console-api' | 'admin' | 'console' | 'app';
  schoolSlug?: string | null;
  message: string;
  stack?: string | null;
  url?: string | null;
  release?: string | null;
}

/** Set by each API at start-up to where errors are kept. The exception filter calls it for every unexpected failure. */
export const errorSink: { report?: (e: ErrorEvent) => void } = {};

/** Keeps one row per problem: the same source, message and first stack frame count up instead of piling up. */
export async function recordError(pool: { query: (q: string, p: unknown[]) => Promise<unknown> }, e: ErrorEvent): Promise<void> {
  const frame = (e.stack ?? '').split('\n').find((l) => /^\s*at\s/.test(l))?.trim() ?? '';
  const message = e.message.slice(0, 500);
  const fingerprint = createHash('sha1').update(`${e.source}|${message.replace(/\d+/g, '#')}|${frame}`).digest('hex').slice(0, 24);
  await pool.query(
    `insert into error_reports (fingerprint, source, school_slug, message, stack, url, release) values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (fingerprint) do update set count = error_reports.count + 1, last_at = now(), school_slug = coalesce(excluded.school_slug, error_reports.school_slug),
       stack = coalesce(excluded.stack, error_reports.stack), url = coalesce(excluded.url, error_reports.url), release = coalesce(excluded.release, error_reports.release)`,
    [fingerprint, e.source, e.schoolSlug ?? null, message, e.stack?.slice(0, 4000) ?? null, e.url?.slice(0, 300) ?? null, e.release?.slice(0, 40) ?? null],
  );
}
