import assert from 'node:assert/strict';
import { createEpisodeFixture } from '../app/data/episode.js';
import { buildClinicalFactContext } from '../app/clinical-facts/index.js';
import { buildSettlementList } from '../app/domain/settlement.js';
import { runFullChainQualityControl, QUALITY_DOMAINS } from '../app/clinical-facts/quality/full-chain-quality.js';

const episode=createEpisodeFixture();
const facts=buildClinicalFactContext({episode,documentSnapshots:[]});
const settlement=buildSettlementList(episode);
const groupingRun={groupingResult:{status:'INVALID_INPUT',errors:[{code:'DRG_PRINCIPAL_DIAGNOSIS_UNSUPPORTED',message:'测试：主要诊断不受当前DRG规则支持'}]},inputIntegrity:{errors:[{code:'DRG_PRINCIPAL_DIAGNOSIS_UNSUPPORTED',message:'测试：主要诊断不受当前DRG规则支持'}]}};
const auditRun={risks:[{riskId:'TEST-RISK',type:'CLAIM_DETAIL_DUPLICATE',severity:'medium',title:'测试重复收费',reason:'测试风险',evidenceBundle:{evidence:[{evidenceId:'EV-TEST'}]}}]};
const run=runFullChainQualityControl({episode,documentSnapshots:[],factContext:facts,settlement,groupingRun,auditRun});
assert.equal(run.domains.length,QUALITY_DOMAINS.length);
assert.equal(run.domains.length,6);
assert.ok(run.domains.some((x)=>x.id==='GROUPING'&&x.status==='BLOCKED'));
assert.ok(run.issues.some((x)=>x.qcDomain==='GROUPING'&&x.type==='GROUPING_INPUT_INVALID'));
assert.ok(run.issues.some((x)=>x.qcDomain==='INSURANCE_AUDIT'&&x.type==='CLAIM_DETAIL_DUPLICATE'));
const notRun=runFullChainQualityControl({episode,documentSnapshots:[],factContext:facts,settlement});
assert.equal(notRun.domains.find((x)=>x.id==='DOCUMENT').status,'NOT_RUN');
assert.equal(notRun.domains.find((x)=>x.id==='CROSS_DOCUMENT').status,'NOT_RUN');
assert.equal(notRun.finalStatus,'PARTIAL');

const sharedConflict={conflictId:'CONFLICT-DEDUP-1',concept:'patient.birthDate',severity:'high',blocking:true,status:'UNRESOLVED',reason:'出生日期待核对',impactScope:['SETTLEMENT','GROUPING'],candidates:[]};
const duplicateIssueRun=runFullChainQualityControl({episode,documentSnapshots:[],factContext:{...facts,conflicts:[sharedConflict]},settlement:{...settlement,factConflicts:[sharedConflict]}});
assert.equal(duplicateIssueRun.issues.filter((x)=>x.conflictRefs.includes(sharedConflict.conflictId)).length,1,'one fact conflict must remain one issue across quality domains');
assert.equal(duplicateIssueRun.summary.total,1,'duplicate downstream validation must not inflate the total issue count');
assert.equal(duplicateIssueRun.domains.find((x)=>x.id==='SETTLEMENT').status,'BLOCKED','downstream domain status must still reflect the root issue impact');
console.log('PASS six-domain full-chain quality control');
