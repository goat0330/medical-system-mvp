import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const factsUi=readFileSync(new URL('../app/clinical-facts-overlay.js',import.meta.url),'utf8');
const qualityUi=readFileSync(new URL('../app/full-chain-qc-overlay.js',import.meta.url),'utf8');
const groupingPresentation=readFileSync(new URL('../app/p1/grouping-presentation.js',import.meta.url),'utf8');
const groupingFactsRender=factsUi.slice(factsUi.indexOf('function renderGroupingFacts'),factsUi.indexOf('function conflictHtml'));

assert.match(factsUi,/function renderGroupingFacts\(context\)/);
assert.match(factsUi,/context\.evidence\.filter\(\(item\)=>evidenceIds\.has\(item\.evidenceId\)\)/);
assert.match(factsUi,/item\.impactScope\?\.includes\('GROUPING'\)/);
assert.match(groupingFactsRender,/查看字段证据（\$\{evidence\.length\}）/);
assert.match(groupingFactsRender,/<details class="fact-platform-card op-data-details"/);
assert.doesNotMatch(groupingFactsRender,/<details[^>]*\sopen(?:\s|>)/);
assert.doesNotMatch(groupingFactsRender.match(/<summary>(.*?)<\/summary>/s)?.[1]||'',/ClinicalFact|context\.evidence|fact-revision/);
assert.match(qualityUi,/filterGroupingQualityIssues\(run\.issues\)/);
assert.match(groupingPresentation,/issue\.qcDomain === 'GROUPING' \|\| issue\.impactScope\?\.includes\('GROUPING'\)/);
assert.match(qualityUi,/查看全流程质控（6 个环节/);
assert.doesNotMatch(qualityUi,/run\.summary\.blocking\?'open'/);

console.log('PASS grouping facts and quality UI scope contract');
