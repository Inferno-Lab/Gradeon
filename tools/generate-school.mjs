#!/usr/bin/env node
// Writes a realistic test school as the files a school would bring: one CSV per import kind in Tangent's templates, in the
// order to import them, plus the same students as another system (Fedena-style) exports them, and what it all adds up to.
// Load them in the console (school page, Migration) one by one, or press "Load a realistic test school" there.
// Usage: node tools/generate-school.mjs [--students 300] [--seed 7] [--out ./test-school]   (build packages/db first)
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sampleSchool } from '../packages/db/dist/index.js';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const students = Number(arg('students', '300'));
if (!Number.isInteger(students) || students < 10 || students > 3000) throw new Error('--students is a whole number from 10 to 3000.');
const out = path.resolve(arg('out', `./test-school-${students}`));
const school = sampleSchool(students, Number(arg('seed', '7')));
mkdirSync(out, { recursive: true });
for (const f of school.files) writeFileSync(path.join(out, f.name), f.csv);
writeFileSync(path.join(out, 'fedena-students.csv'), school.fedenaStudents);
writeFileSync(path.join(out, 'expect.json'), `${JSON.stringify(school.expect, null, 2)}\n`);
console.log(`Wrote ${school.files.length + 1} files for ${students} students to ${out}`);
console.log(`It adds up to: ${school.expect.classes} classes, ${school.expect.staff} staff, ${school.expect.families} families, ₹${school.expect.due.toLocaleString('en-IN')} due, ₹${school.expect.paid.toLocaleString('en-IN')} paid.`);
