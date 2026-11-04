import { pg } from '@gradeon/db';
import { notFound } from '@gradeon/nest-kit';
import { unseal } from '@gradeon/security';
import type { Db } from './core.js';

/** Opens one school's own database for the length of `fn`. */
export async function withSchoolDb<T>(db: Db, secretsKey: string, schoolId: string, fn: (pool: pg.Pool) => Promise<T>): Promise<T> {
  const s = (await db.pool.query<{ db_url_sealed: string | null }>('select db_url_sealed from schools where id = $1 and deleted_at is null', [schoolId])).rows[0];
  if (!s?.db_url_sealed) throw notFound('That school’s database');
  const pool = new pg.Pool({ connectionString: unseal(s.db_url_sealed, secretsKey), max: 2 });
  try { return await fn(pool); } finally { await pool.end(); }
}
