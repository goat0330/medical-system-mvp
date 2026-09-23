import { existsSync } from 'node:fs';
const files = [
  'app/domain/medical-record-editor.js',
  'app/domain/settlement.js',
  'app/data/episode.js',
  'app/data/templates.js',
  'app/data/settlement-fields.js',
  'server.mjs',
];
const missing = files.filter((x) => !existsSync(new URL(`../${x}`, import.meta.url)));
if (missing.length) {
  console.error('Missing base-repo files:\n' + missing.map((x)=>`- ${x}`).join('\n'));
  process.exit(1);
}
console.log('PASS UI overlay preflight');
