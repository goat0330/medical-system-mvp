import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const allowedColorFile = join(root, 'app/design/tokens.css');
const violations = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(css|js)$/.test(name)) {
      const s = readFileSync(p,'utf8');
      if (p !== allowedColorFile && /#[0-9a-fA-F]{6}\b/.test(s) && !p.endsWith('icons.js')) violations.push(`${p.replace(root,'')}: hard-coded hex color`);
      if (/\b[▦▤▥◇💡✅❌]\b/u.test(s)) violations.push(`${p.replace(root,'')}: unicode/emoji icon`);
    }
  }
}
walk(join(root,'app'));
if (violations.length) { console.error(violations.join('\n')); process.exit(1); }
console.log('PASS design check');
