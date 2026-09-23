import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const dirs = ['app','product'];
const files=[];
function walk(dir){ for(const name of readdirSync(dir)){ const p=join(dir,name); if(statSync(p).isDirectory()) walk(p); else if(/\.(js|css|html|json)$/.test(name)) files.push(p); } }
for(const d of dirs) walk(join(root,d));
files.push(join(root,'index.html'));
const all=files.map((path)=>readFileSync(path,'utf8')).join('\n');
for(const path of files.filter((file)=>file.endsWith('.html'))){
  const html=readFileSync(path,'utf8');
  assert.doesNotMatch(html,/<(?:script|link|img|iframe)\b[^>]*(?:src|href)\s*=\s*["']\s*https?:\/\//i,`${path} must load UI assets locally`);
}
assert.doesNotMatch(all,/\bimport\s+[^;\n]*\bfrom\s*["']https?:\/\//i,'ES modules must be local');
assert.doesNotMatch(all,/\bimport\s*\(\s*["']https?:\/\//i,'dynamic modules must be local');
assert.doesNotMatch(all,/\bfetch\s*\(\s*["']https?:\/\//i,'frontend API calls must use the local server');
assert.doesNotMatch(all,/editor\.huimei\.com|raw\.githubusercontent\.com/i);
console.log('PASS no remote UI/editor runtime dependency');
