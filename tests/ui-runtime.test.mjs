import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../app/main.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/styles.css', import.meta.url), 'utf8');
const editorCss = readFileSync(new URL('../app/design/record-editor.css', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

for (const phrase of ['病历编辑质控','医保结算清单','DRG / DIP 3.0','智能医保审核']) assert.match(main, new RegExp(phrase));
for (const component of ['workbench-detail','record-navigation','patient-history','medical-record-editor-host','record-qc-floating']) assert.ok(main.includes(component) || editorCss.includes(component), `missing ${component}`);
assert.match(css, /design\/record-editor\.css/);
assert.match(index, /住院医疗智能系统/);
assert.doesNotMatch(main, /editor\.huimei\.com|raw\.githubusercontent\.com/i);
assert.doesNotMatch(main, /HmEditor|惠每/);
console.log('PASS UI runtime/static contract');
