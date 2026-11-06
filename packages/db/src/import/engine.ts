import type pg from 'pg';
import { IMPORT_KINDS, importKind, type ImportBatchRow, type ImportInput, type ImportKind, type ImportPreview, type ImportRowCheck } from '@gradeon/contracts';
import { parseCsv, toCsv, zip } from './files.js';
import { KINDS, type Impl, type Row, type Write } from './kinds.js';

type Q = pg.Pool | pg.PoolClient;
type Rec = Record<string, unknown>;
/** What one table write changed: the keys of rows it added and the rows it changed, as they were before. */
interface Change { table: string; pk: string[]; created: Rec[]; updated: Rec[] }

export const UNDO_DAYS = 30;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Other systems' exports, recognised by columns only they have. Their aliases are a working guess from those products'
 * usual export columns; replace them with real exports from the first schools that move (production plan, Phase 3).
 */
const SOURCES: { key: string; marks: string[]; aliases: Record<string, string> }[] = [
  { key: 'fedena', marks: ['batchname', 'firstname', 'admissionno'], aliases: { admissionno: 'admission_no', firstname: 'name', middlename: 'name', lastname: 'name', batchname: 'class', dateofbirth: 'dob', bloodgroup: 'blood_group', admissiondate: 'admitted_on', fathername: 'guardian_name', fathermobilephone: 'guardian_phone', fatheremail: 'guardian_email', mothername: 'guardian2_name', mothermobilephone: 'guardian2_phone', rollnumber: 'roll_no', employeenumber: 'external_id', employeename: 'name', employeedepartment: 'department', employeeposition: 'designation', mobilephone: 'phone' } },
  { key: 'entab', marks: ['admno', 'classsec', 'studentname'], aliases: { admno: 'admission_no', studentname: 'name', classsec: 'class', dob: 'dob', fname: 'guardian_name', fmobile: 'guardian_phone', femail: 'guardian_email', mname: 'guardian2_name', mmobile: 'guardian2_phone', rollno: 'roll_no', house: 'house', doa: 'admitted_on' } },
];

/** A file's table: its header row and data rows. Typed rows from the quick-entry grid come keyed by column already. */
function readInput(kind: ImportKind, input: Pick<ImportInput, 'csv' | 'rows'>): { headers: string[]; data: string[][] } {
  if (input.rows) {
    const headers = kind.columns.map((c) => c.key);
    return { headers, data: input.rows.map((r) => headers.map((h) => (r[h] ?? '').trim())).filter((r) => r.some(Boolean)) };
  }
  const [headers = [], ...data] = parseCsv(input.csv ?? '');
  return { headers, data };
}

function detectSource(kind: ImportKind, headers: string[]): string {
  const hs = new Set(headers.map(norm));
  if (kind.columns.filter((c) => c.required).every((c) => hs.has(norm(c.key)))) return 'gradeon';
  return SOURCES.find((s) => s.marks.filter((m) => hs.has(m)).length >= 2)?.key ?? 'sheet';
}

/** File column -> import column. Several file columns may feed one (first, middle and last name are joined). */
function autoMap(kind: ImportKind, headers: string[], source: string): Record<string, string> {
  const preset = SOURCES.find((s) => s.key === source)?.aliases ?? {};
  const out: Record<string, string> = {};
  for (const h of headers) {
    const n = norm(h);
    const hit = kind.columns.find((c) => norm(c.key) === n || norm(c.label) === n || (c.aliases ?? []).some((a) => norm(a) === n))?.key
      ?? (kind.columns.some((c) => c.key === preset[n]) ? preset[n] : undefined)
      ?? (n === 'firstname' || n === 'middlename' || n === 'lastname' ? kind.columns.find((c) => c.key === 'name')?.key : undefined);
    out[h] = hit ?? '';
  }
  return out;
}

const signature = (kind: string, headers: string[]) => `${kind}:${headers.map(norm).sort().join('|')}`;

interface Checked { preview: ImportPreview; valid: Row[]; impl: Impl<unknown>; lookups: unknown }

async function check(db: Q, input: ImportInput): Promise<Checked> {
  const kind = importKind(input.kind);
  const impl = KINDS[input.kind] as Impl<unknown> | undefined;
  if (!kind || !impl) throw new Error(`There is no import for “${input.kind}”.`);
  const { headers, data } = readInput(kind, input);
  const source = input.rows ? 'typed' : detectSource(kind, headers);
  const remembered = input.mapping ? null : (await db.query<{ mapping: Record<string, string> }>('select mapping from import_mappings where signature = $1', [signature(kind.key, headers)])).rows[0]?.mapping;
  const mapping = input.mapping ?? remembered ?? autoMap(kind, headers, source);
  const mapped = new Set(Object.values(mapping).filter(Boolean));
  const missing = kind.columns.filter((c) => c.required && !mapped.has(c.key)).map((c) => c.label);
  const rows: Row[] = data.map((cells) => {
    const r: Row = {};
    for (const col of kind.columns) r[col.key] = '';
    headers.forEach((h, i) => { const k = mapping[h]; if (k && cells[i]) r[k] = r[k] ? `${r[k]} ${cells[i]}` : cells[i]!; });
    return r;
  });
  const lookups = await impl.load(db, rows);
  const seen = new Map<string, number>();
  const checks: ImportRowCheck[] = rows.map((r, i) => {
    const line = input.rows ? i + 1 : i + 2;
    if (missing.length) return { line, values: r, action: 'skip', errors: [`Nothing is matched to ${missing.join(', ')}.`] };
    const errors = kind.columns.filter((c) => c.required && !r[c.key]).map((c) => `${c.label} is empty.`);
    const res = errors.length ? { key: '', errors: [], exists: false } : impl.check(r, lookups);
    errors.push(...res.errors);
    if (!errors.length && res.key) {
      const before = seen.get(res.key);
      if (before) errors.push(`Same ${kind.matchOn.map((k) => kind.columns.find((c) => c.key === k)?.label.toLowerCase()).join(' and ')} as line ${before}.`);
      else seen.set(res.key, line);
    }
    return { line, values: r, action: errors.length ? 'skip' : res.exists ? 'update' : 'create', errors };
  });
  const valid = rows.filter((_, i) => checks[i]!.action !== 'skip');
  const counts = { create: checks.filter((c) => c.action === 'create').length, update: checks.filter((c) => c.action === 'update').length, skip: checks.filter((c) => c.action === 'skip').length, total: checks.length };
  return { preview: { kind: kind.key, source, headers, mapping, missing, rows: checks, counts, totals: impl.totals(valid, lookups) }, valid, impl, lookups };
}

/** Reads, matches and checks a file without changing anything: what would be added, changed and left out, and the totals. */
export async function previewImport(db: Q, input: ImportInput): Promise<ImportPreview> {
  return (await check(db, input)).preview;
}

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
const CHUNK = 5000;
async function chunks<T>(list: T[], fn: (part: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < list.length; i += CHUNK) await fn(list.slice(i, i + CHUNK));
}

/** Adds the rows that are new and changes `cols` of the ones that exist, in a few statements, remembering what it did. */
async function apply(client: pg.PoolClient, w: Write): Promise<Change> {
  const change: Change = { table: w.table, pk: w.pk, created: [], updated: [] };
  if (!w.rows.length) return change;
  const t = ident(w.table);
  const pkList = w.pk.map(ident).join(', ');
  const keyOf = (r: Rec) => JSON.stringify(w.pk.map((k) => String(r[k])));
  const existing = new Map<string, Rec>();
  await chunks(w.rows, async (part) => {
    const { rows } = await client.query<{ j: Rec }>(
      `select row_to_json(t) j from ${t} t where (${pkList}) in (select ${pkList} from json_populate_recordset(null::${t}, $1))`,
      [JSON.stringify(part.map((r) => Object.fromEntries(w.pk.map((k) => [k, r[k]]))))]);
    for (const r of rows) existing.set(keyOf(r.j), r.j);
  });
  const fresh: Rec[] = [];
  const changed: Rec[] = [];
  for (const r of w.rows) {
    const before = existing.get(keyOf(r));
    if (!before) fresh.push(r);
    else if (w.cols.some((c) => String(before[c] ?? '') !== String(r[c] ?? ''))) { changed.push(r); change.updated.push(before); }
  }
  if (fresh.length) {
    const cols = Object.keys(fresh[0]!).map(ident).join(', ');
    await chunks(fresh, (part) => client.query(`insert into ${t} (${cols}) select ${cols} from json_populate_recordset(null::${t}, $1)`, [JSON.stringify(part)]));
    change.created = fresh.map((r) => Object.fromEntries(w.pk.map((k) => [k, r[k]])));
  }
  if (changed.length) {
    const set = w.cols.map((c) => `${ident(c)} = x.${ident(c)}`).join(', ');
    const on = w.pk.map((k) => `t.${ident(k)} = x.${ident(k)}`).join(' and ');
    await chunks(changed, (part) => client.query(`update ${t} t set ${set} from json_populate_recordset(null::${t}, $1) x where ${on}`, [JSON.stringify(part)]));
  }
  return change;
}

const LOCK = "select pg_advisory_xact_lock(hashtext('imports'))";

/** Imports the rows that passed the checks as one batch, in one transaction, and records how to undo it. Rows with problems are left out. */
export async function commitImport(pool: pg.Pool, input: ImportInput, byName: string): Promise<ImportBatchRow> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set local statement_timeout = 0');
    await client.query(LOCK);
    const { preview, valid, impl, lookups } = await check(client, input);
    if (preview.missing.length) throw new Error(`Match a column to ${preview.missing.join(', ')} first.`);
    if (!valid.length) throw new Error('Nothing to import: every row has a problem. Fix them in the grid and check again.');
    const changes: Change[] = [];
    for (const w of impl.writes(valid, lookups)) changes.push(await apply(client, w));
    const notes = impl.notes ? await impl.notes(client, valid, lookups) : [];
    const id = `imp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const report = { totals: preview.totals, notes, skipped: preview.rows.filter((r) => r.action === 'skip').slice(0, 500).map((r) => ({ line: r.line, errors: r.errors })) };
    await client.query(
      'insert into import_batches (id, kind, source, file_name, created, updated, skipped, report, changes, by_name) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [id, preview.kind, preview.source, input.fileName, preview.counts.create, preview.counts.update, preview.counts.skip, JSON.stringify(report), JSON.stringify(changes), byName]);
    if (!input.rows) {
      await client.query('insert into import_mappings (signature, mapping) values ($1,$2) on conflict (signature) do update set mapping = excluded.mapping, updated_at = now()',
        [signature(preview.kind, preview.headers), JSON.stringify(preview.mapping)]);
    }
    if (input.uploadId) await client.query("update import_uploads set status = 'imported', batch_id = $2 where id = $1", [input.uploadId, id]);
    await client.query('commit');
    return (await listBatches(pool)).find((b) => b.id === id)!;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function listBatches(db: Q): Promise<ImportBatchRow[]> {
  const { rows } = await db.query<{ id: string; kind: string; source: string; file_name: string; created: number; updated: number; skipped: number; report: { totals: ImportBatchRow['totals']; notes: string[] }; by_name: string; at: Date; undone_at: Date | null }>(
    'select id, kind, source, file_name, created, updated, skipped, report, by_name, at, undone_at from import_batches order by at desc limit 200');
  const newest = rows.find((r) => !r.undone_at);
  const limit = Date.now() - UNDO_DAYS * 86_400_000;
  return rows.map((r) => ({
    id: r.id, kind: r.kind, source: r.source, fileName: r.file_name, created: r.created, updated: r.updated, skipped: r.skipped,
    totals: r.report.totals ?? [], notes: r.report.notes ?? [], byName: r.by_name, at: r.at.toISOString(), undoneAt: r.undone_at?.toISOString() ?? null,
    canUndo: r === newest && r.at.getTime() > limit,
  }));
}

/**
 * Puts the school back as it was before a batch: rows it added are removed and rows it changed get their old values.
 * ponytail: only the newest batch can be undone (an older one may have been built on); a per-row history would lift that.
 */
export async function undoBatch(pool: pg.Pool, id: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set local statement_timeout = 0');
    await client.query(LOCK);
    const batch = (await listBatches(client)).find((b) => b.id === id);
    if (!batch) throw new Error('That import does not exist.');
    if (!batch.canUndo) throw new Error(batch.undoneAt ? 'That import was already undone.' : `Only the newest import from the last ${UNDO_DAYS} days can be undone.`);
    const changes = (await client.query<{ changes: Change[] }>('select changes from import_batches where id = $1', [id])).rows[0]!.changes;
    for (const c of [...changes].reverse()) {
      const t = ident(c.table);
      if (c.updated.length) {
        const cols = Object.keys(c.updated[0]!).filter((k) => !c.pk.includes(k));
        const set = cols.map((k) => `${ident(k)} = x.${ident(k)}`).join(', ');
        const on = c.pk.map((k) => `t.${ident(k)} = x.${ident(k)}`).join(' and ');
        if (set) await chunks(c.updated, (part) => client.query(`update ${t} t set ${set} from json_populate_recordset(null::${t}, $1) x where ${on}`, [JSON.stringify(part)]));
      }
      if (c.created.length) {
        const pkList = c.pk.map(ident).join(', ');
        await chunks(c.created, (part) => client.query(`delete from ${t} where (${pkList}) in (select ${pkList} from json_populate_recordset(null::${t}, $1))`, [JSON.stringify(part)]));
      }
    }
    await client.query('update import_batches set undone_at = now() where id = $1', [id]);
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** The empty template for a kind: the header row and one example row, so a school can fill it in Excel. */
export function templateCsv(key: string): string {
  const kind = importKind(key);
  if (!kind) throw new Error(`There is no import for “${key}”.`);
  return toCsv([kind.columns.map((c) => c.key), kind.columns.map((c) => c.example)]);
}

/** Everything the school has, in the same templates it can be imported from: one CSV per kind in a ZIP. Leaving is easy too. */
export async function exportAll(db: Q, kinds: string[] = IMPORT_KINDS.map((k) => k.key)): Promise<Buffer> {
  const files: { name: string; content: string }[] = [];
  for (const kind of IMPORT_KINDS.filter((k) => kinds.includes(k.key))) {
    const rows = await KINDS[kind.key]!.export(db);
    files.push({ name: `${String(IMPORT_KINDS.indexOf(kind) + 1).padStart(2, '0')}-${kind.key}.csv`, content: toCsv([kind.columns.map((c) => c.key), ...rows.map((r) => kind.columns.map((c) => r[c.key] ?? ''))]) });
  }
  return zip(files);
}
