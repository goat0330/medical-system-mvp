import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const dirs = ['app','product'];
let all='';
function walk(dir){ for(const name of readdirSync(dir)){ const p=join(dir,name); if(statSync(p).isDirectory()) walk(p); else if(/\.(js|css|html|json)$/.test(name)) all += '\n'+readFileSync(p,'utf8'); } }
for(const d of dirs) walk(join(root,d));
all += '\n'+readFileSync(join(root,'index.html'),'utf8');
assert.doesNotMatch(all,/https?:\/\//i,'runtime files must not contain remote URL dependencies');
assert.doesNotMatch(all,/editor\.huimei\.com|raw\.githubusercontent\.com/i);
console.log('PASS no remote runtime dependency');
