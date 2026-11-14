// Fails when the product's former name comes back in a tracked file, file name or folder name.
// The name is assembled here so this file does not trip its own check. Usage: node tools/check-name.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const old = new RegExp(['edu', 'nest'].join('[ _-]?'), 'i');
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\0').filter(Boolean);
const bad = [];
for (const f of files) {
  if (old.test(f)) bad.push(`${f} (file name)`);
  let text;
  try { text = readFileSync(f); } catch { continue; }
  if (text.includes(0)) continue;
  text.toString('utf8').split('\n').forEach((line, i) => { if (old.test(line)) bad.push(`${f}:${i + 1}`); });
}
if (bad.length) {
  console.error(`The former product name appears ${bad.length} times; the product is Tangent:\n${bad.slice(0, 50).join('\n')}`);
  process.exit(1);
}
console.log(`Name check passed: ${files.length} files.`);
