import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { createEpisodeFixture } from '../app/data/episode.js';
import { buildSettlementList, recalculateSettlementTotals, SETTLEMENT_SOURCE_FIELDS, settlementFieldOptions, validateSettlementList } from '../app/domain/settlement.js';
import { renderSettlementPaper } from '../app/domain/settlement-template.js';
const episode = createEpisodeFixture();
const list = buildSettlementList(episode);
const issues = validateSettlementList(list);
assert.ok(Array.isArray(issues));
const html = renderSettlementPaper(list);
assert.equal((html.match(/class="settlement-sheet"/g) || []).length, 1, 'settlement stays one continuous editor document');
assert.doesNotMatch(html, /data-page=|第\s*[123]\s*页|共\s*3\s*页|续页/);
assert.match(html, /医疗保障基金结算清单/);
assert.match(html, /<h2>三、住院诊疗信息<\/h2>/);
assert.match(html, /<h2>四、医疗收费信息<\/h2>/);
assert.doesNotMatch(html, /<h2>[五六]、/);
assert.match(html, /data-hm-node="newtextbox"/);
assert.match(html, /data-hm-code="DE02\.01\.039\.00"/);
assert.match(html, /data-settlement-path="inpatient\.principalDiagnosis\.name"/);
assert.match(html, /data-hm-name="患者证件类别"[^>]*data-hm-items="居民身份证#居民户口簿#护照/);
assert.match(html, /_texttype="下拉" _click="true" _jointsymbol="," _selecttype="单选"/);
assert.match(html, /<span class="new-textbox-content" contenteditable="true" data-hm-items="居民身份证#居民户口簿#护照[^\"]*" _texttype="下拉" _click="true" _jointsymbol="," _selecttype="单选">/);
assert.deepEqual(settlementFieldOptions('patient.idType').slice(0, 3), ['居民身份证', '居民户口簿', '护照']);
assert.doesNotMatch(html, /data-settlement-path="diagnosis\./);
const paperCss = await readFile(new URL('../app/design/settlement-paper.css', import.meta.url), 'utf8');
assert.match(paperCss, /\.sheet-table th,\s*\.sheet-table td[\s\S]*?background:\s*transparent\s*!important/);
assert.doesNotMatch(paperCss, /\.sheet-table th\s*\{[^}]*background:\s*var\(--app-bg-table-head\)/);
assert.match(paperCss, /\.payment-table\s*\{[^}]*table-layout:\s*auto/);
assert.match(paperCss, /\.payment-table \.payment-left-group\s*\{\s*width:\s*24\.5%/);
assert.match(paperCss, /\.payment-table \.payment-personal-value\s*\{\s*width:\s*14\.1%/);
const paymentTable = html.match(/<table class="sheet-table payment-table">[\s\S]*?<\/table>/)?.[0] || '';
assert.equal((paymentTable.match(/<tr\b/g) || []).length, 8, 'payment items follow the eight source rows');
assert.match(paymentTable, /colspan="2" class="payment-major-label">医保统筹基金支付/);
assert.match(paymentTable, /rowspan="3" class="payment-major-label payment-left-group">补充医疗保险支付/);
assert.match(paymentTable, /rowspan="5" class="payment-parent-label">个人负担/);
assert.match(paymentTable, /rowspan="3" class="payment-personal-label">个人自付/);
assert.match(paymentTable, /rowspan="2" class="payment-personal-label">个人自费/);
assert.match(paymentTable, /rowspan="3" class="payment-parent-label">个人支付/);
assert.match(paymentTable, /个人账户<br>支付/);
assert.match(paymentTable, /个人现金<br>支付/);
assert.doesNotMatch(paymentTable, /data-settlement-path="payment\.individualBurden"/);
assert.match(paymentTable, /data-settlement-path="payment\.individualSelfExpense"/);
assert.match(paymentTable, /data-settlement-path="payment\.enterpriseSupplemental"/);

const mapped = buildSettlementList(episode, {
  sourceDocuments: [
    { id: 'admission', name: '入院记录', savedAt: '2026-09-20T09:00:00Z', data: [
      { keyCode: 'DE05.01.025.00', keyName: '初步诊断-西医诊断名称', keyValue: '入院初诊' },
      { keyCode: 'DE02.01.009.00', keyName: '现住址', keyValue: '入院记录地址' },
    ] },
    { id: 'first-progress', name: '首次病程记录', savedAt: '2026-09-21T09:00:00Z', data: [
      { keyCode: 'DE05.10.172.00', keyName: '主要诊断', keyValue: '病程记录诊断' },
    ] },
    { id: 'discharge', name: '出院记录', savedAt: '2026-09-22T09:00:00Z', data: [
      { keyCode: 'DE05.10.172.00', keyName: '主要诊断', keyValue: '出院记录诊断' },
    ] },
    { id: 'frontpage', name: '住院病案首页', savedAt: '2026-09-22T08:00:00Z', data: [
      { keyCode: SETTLEMENT_SOURCE_FIELDS['patient.name'].code, keyName: '姓名', keyValue: '病案首页姓名' },
      { keyCode: SETTLEMENT_SOURCE_FIELDS['inpatient.principalDiagnosis.name'].code, keyName: '主要诊断', keyValue: '病案首页诊断' },
      { keyCode: SETTLEMENT_SOURCE_FIELDS['inpatient.principalDiagnosis.code'].code, keyName: '主要诊断代码', keyValue: 'K80.3' },
    ] },
  ],
  overrides: { 'patient.name': '手工修订姓名', 'fees.rows.0.amount': '500' },
});
assert.equal(mapped.patient.name, '手工修订姓名');
assert.equal(mapped.inpatient.principalDiagnosis.name, episode.diagnoses.principal.name, 'an unresolved diagnosis conflict must not silently overwrite the Episode value');
assert.equal(mapped.inpatient.principalDiagnosis.code, 'K80.3');
assert.ok(mapped.factConflicts.some((conflict) => conflict.concept === 'diagnosis.principal.name'), 'conflicting diagnosis sources remain visible for explicit review');
assert.equal(mapped.patient.currentAddress, episode.patient.currentAddress, 'an unresolved address conflict must not silently overwrite the Episode value');
assert.ok(mapped.factConflicts.some((conflict) => conflict.concept === 'patient.currentAddress'));
assert.equal(mapped.fieldSources['patient.name'], '手动修改');
assert.equal(mapped.fieldSources['inpatient.principalDiagnosis.name'], 'Episode 基线');
assert.equal(mapped.fieldSources['patient.currentAddress'], 'Episode 基线');
assert.equal(mapped.fees.totals.amount, 19940);
assert.equal(episode.patient.name, '李**', 'mapping must not mutate the source Episode');
const withMultipleExamItems = structuredClone(episode);
withMultipleExamItems.fees.items.push({ category: 'examination', name: '第二项检查', amount: 25, classA: 25, classB: 0, selfPay: 0, other: 0 });
assert.equal(buildSettlementList(withMultipleExamItems).fees.rows.find((row) => row.label === '检查费').amount, 1605, 'all ClaimDetail rows in a category must contribute to the settlement total');
mapped.fees.rows[0].amount = '700';
recalculateSettlementTotals(mapped);
assert.equal(mapped.fees.totals.amount, 20140);
console.log('PASS settlement template');
