import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
const main = readFileSync(new URL('../app/main.js', import.meta.url),'utf8');
assert.match(main,/mountMedicalRecordEditor/);
assert.match(main,/renderSettlementPaper/);
assert.match(main,/groupingPath/);
assert.match(main,/riskIssueCard/);
assert.doesNotMatch(main,/compat-mock|mock 分组|网篮\|取石\|耗材/);
console.log('PASS integration boundaries');
