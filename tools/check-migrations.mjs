// Fails when a migration that already exists on the base branch was edited or deleted: applied migrations are never changed,
// a new file is added instead (databases refuse a changed checksum). Usage: node tools/check-migrations.mjs [base=origin/main]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Changed only by the product's rename to Tangent: listed with the checksum it ran with, which the migrator accepts.
const renamed = JSON.parse(readFileSync('packages/db/migrations/renamed.json', 'utf8'));
const tag = (file) => file.replace(/^packages\/db\/migrations\//, '').replace(/\.sql$/, '');

const base = process.argv[2] ?? 'origin/main';
const changed = execFileSync('git', ['diff', '--name-status', '--diff-filter=MDR', `${base}...HEAD`, '--', 'packages/db/migrations'], { encoding: 'utf8' })
  .split('\n').filter((l) => l.trim() && /\.sql$/.test(l))
  .filter((l) => { const [status, file] = l.split('\t'); return !(status === 'M' && renamed[tag(file)]); });
if (changed.length) {
  console.error(`These migrations already exist on ${base} and must not change; add a new migration instead:\n${changed.join('\n')}`);
  process.exit(1);
}
console.log(`Migration check passed against ${base}.`);
