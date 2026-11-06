import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureDatabase, startDevPostgres, type DevPostgres } from '../dev.js';
import { migrate } from '../migrate.js';
import { seedSchool } from '../seed/greenfield.js';
import { commitImport, exportAll, listBatches, previewImport, undoBatch } from './engine.js';
import { parseCsv } from './files.js';
import { classKey, isoDay } from './kinds.js';
import { sampleSchool } from './sample.js';

let server: DevPostgres;
let pool: pg.Pool;
const school = sampleSchool(300);
const n = async (sql: string) => Number((await pool.query<{ n: string }>(sql)).rows[0]!.n);

beforeAll(async () => {
  server = await startDevPostgres({ dataDir: path.join(mkdtempSync(path.join(tmpdir(), 'gradeon-import-')), 'data'), fresh: true });
  pool = new pg.Pool({ connectionString: await ensureDatabase(server.url, 'school_import'), max: 4 });
  await migrate(pool, 'school');
  // An empty school: settings, roles and the first admin, nothing else, the way a school starts before it moves in.
  await seedSchool(pool, {
    school: { name: 'Riverside School', shortName: 'Riverside', tagline: '', phone: '', email: '', address: '', color: '#2F5BD3', logoText: 'R', language: 'en' },
    admin: { name: 'Office Admin', email: 'office@riverside.test', phone: '+91 90000 00001', passwordHash: 'x' }, modules: ['people'], demoMode: false, data: 'empty',
  });
}, 180_000);
afterAll(async () => { await pool?.end(); await server?.stop(); });

describe('reading what people type', () => {
  it('reads Indian dates and class names the ways schools write them', () => {
    expect(['2012-04-18', '18/04/2012', '18-04-2012', '18.04.2012', '18 Apr 2012'].map(isoDay)).toEqual(Array(5).fill('2012-04-18'));
    expect(isoDay('31/02/2012')).toBeNull();
    expect(['8 A', '8A', 'VIII-A', 'Class 8 - A', 'Std. 8 A'].map(classKey)).toEqual(Array(5).fill('8a'));
  });
  it('reads quoted CSV with commas, line breaks and a semicolon separator', () => {
    expect(parseCsv('﻿name,address\r\n"Rao, Ira","1 Main Rd\nPune"\r\n')).toEqual([['name', 'address'], ['Rao, Ira', '1 Main Rd\nPune']]);
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('moving a school in', () => {
  it('imports every kind in order, and the school adds up to the rupee', async () => {
    for (const f of school.files) {
      const preview = await previewImport(pool, { kind: f.kind, csv: f.csv, fileName: f.name });
      expect(preview.missing, f.name).toEqual([]);
      expect(preview.rows.filter((r) => r.errors.length).map((r) => `${f.name}:${r.line} ${r.errors.join(' ')}`)).toEqual([]);
      const batch = await commitImport(pool, { kind: f.kind, csv: f.csv, fileName: f.name }, 'Migration team');
      expect(batch.created, f.name).toBe(preview.counts.create);
    }
    const e = school.expect;
    expect(await n('select count(*) n from students')).toBe(e.students);
    expect(await n('select count(*) n from classes')).toBe(e.classes);
    expect(await n("select count(*) n from users where kind = 'staff'")).toBe(e.staff + 1);
    expect(await n('select count(*) n from guardians')).toBe(e.families);
    expect(await n("select count(*) n from users where kind = 'guardian'")).toBe(e.families);
    expect(await n('select sum(amount) n from fee_invoices')).toBe(e.due);
    expect(await n('select sum(amount) n from payments')).toBe(e.paid);
    expect(await n('select count(*) n from attendance_marks')).toBe(e.attendanceMarks);
    // Every family can sign in: a guardian login with the phone, and the students joined to it.
    expect(await n('select count(*) n from guardians where user_id is null')).toBe(0);
    expect(await n('select count(*) n from students s where not exists (select 1 from student_guardians sg where sg.student_id = s.id)')).toBe(0);
    // Staff are not invited at import time.
    expect(await n("select count(*) n from users where kind = 'staff' and invited_at is not null")).toBe(0);
  }, 240_000);

  it('a second import of the same file updates instead of adding again', async () => {
    const f = school.files.find((x) => x.kind === 'students')!;
    const again = await commitImport(pool, { kind: 'students', csv: f.csv, fileName: f.name }, 'Migration team');
    expect(again.created).toBe(0);
    expect(again.updated).toBe(school.expect.students);
    expect(await n('select count(*) n from students')).toBe(school.expect.students);
  }, 60_000);

  it('reads another system’s export: its columns, its dates, first and last names apart', async () => {
    const p = await previewImport(pool, { kind: 'students', csv: school.fedenaStudents, fileName: 'fedena.csv' });
    expect(p.source).toBe('fedena');
    expect(p.mapping['First name']).toBe('name');
    expect(p.mapping['Last name']).toBe('name');
    expect(p.missing).toEqual([]);
    expect(p.rows.filter((r) => r.errors.length)).toEqual([]);
    expect(p.counts.update).toBe(school.expect.students);
    expect(p.rows[0]!.values.name.split(' ').length).toBeGreaterThanOrEqual(2);
  }, 60_000);

  it('rows typed into the quick-entry grid go through the same checks', async () => {
    const p = await previewImport(pool, { kind: 'admissions', rows: [{ child_name: 'Tara Joshi', grade_sought: 'LKG', guardian_name: 'Vir Joshi', phone: '9811100099' }, { child_name: 'No Grade', grade_sought: 'abc', guardian_name: 'A' }], fileName: '' });
    expect(p.source).toBe('typed');
    expect(p.counts).toMatchObject({ create: 1, skip: 1 });
    expect(p.rows[1]!.errors[0]).toMatch(/Grade is a number/);
    const bad = await previewImport(pool, { kind: 'students', csv: 'admission_no,name,class,dob,guardian_name,guardian_phone\n9/1,Ana,13 Z,2012-01-01,Ma,9800000000\n', fileName: '' });
    expect(bad.rows[0]!.errors).toEqual(['Class “13 Z” is not set up: import classes first.']);
  }, 60_000);

  it('undoes only the newest import, putting back what it changed', async () => {
    const before = await n("select count(*) n from transport_assignments");
    const batches = await listBatches(pool);
    expect(batches.filter((b) => b.canUndo)).toHaveLength(1);
    await expect(undoBatch(pool, batches[batches.length - 1]!.id)).rejects.toThrow(/Only the newest/);
    const f = school.files.find((x) => x.kind === 'transport')!;
    const moved = f.csv.replace(/Route 1 · Baner/g, 'Route 9 · Aundh');
    const b = await commitImport(pool, { kind: 'transport', csv: moved, fileName: 'routes.csv' }, 'Migration team');
    expect(await n("select count(*) n from transport_assignments where route = 'Route 9 · Aundh'")).toBeGreaterThan(0);
    await undoBatch(pool, b.id);
    expect(await n("select count(*) n from transport_assignments where route = 'Route 9 · Aundh'")).toBe(0);
    expect(await n('select count(*) n from transport_assignments')).toBe(before);
  }, 60_000);

  it('exports everything in the same templates, and the export imports back cleanly', async () => {
    const zip = await exportAll(pool);
    expect(zip.subarray(0, 2).toString()).toBe('PK');
    expect(zip.toString('latin1')).toContain('08-students.csv');
    const start = zip.indexOf('08-students.csv') + '08-students.csv'.length;
    const csv = zip.subarray(start, zip.indexOf('PK', start)).toString('utf8');
    const p = await previewImport(pool, { kind: 'students', csv, fileName: 'export.csv' });
    expect(p.rows.filter((r) => r.errors.length)).toEqual([]);
    expect(p.counts).toMatchObject({ create: 0, update: school.expect.students });
  }, 60_000);
});
