// node chk.mjs name... : which icon names exist
import { iconPath } from './icons.mjs';
for (const n of process.argv.slice(2)) { try { iconPath(n, 'r'); console.log('ok', n); } catch { console.log('NO', n); } }
