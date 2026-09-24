import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGoldenEpisode } from '../app/data/golden-patient.js';
import { createPatientWorklist } from '../app/data/patient-episodes.js';
import { buildClinicalFactContext } from '../app/clinical-facts/index.js';
import { normalizeCanonicalValue } from '../app/clinical-facts/mapping/mapping-registry.js';
import { preparePatientCase, readPatientDocumentSnapshots, workspaceFromEpisode, episodeFromWorkspace } from '../app/p1/current-case-adapter.js';
import { buildSettlementList } from '../app/domain/settlement.js';
import { renderSettlementPaper } from '../app/domain/settlement-template.js';
import { buildWorkspaceSourceFingerprint, reconcileStoredWorkspace, workspaceStorageKey } from '../app/p1/workspace-integrity.js';
import { runFormalGrouping, runPreGrouping } from '../app/p1/workflow-orchestrator.js';
import { groupDip3 } from '../app/p1/dip3-grouper.js';
import { runFullChainQualityControl } from '../app/clinical-facts/quality/full-chain-quality.js';
import { isGoldenEpisode, normalizeSyntheticPatientEpisode } from '../app/p1/patient-integrity.js';
import { filterGroupingQualityIssues, groupingImpactLabel, groupingQualityDomainLabel, groupingStageLabel, groupingStatusLabel } from '../app/p1/grouping-presentation.js';

const clone=(value)=>structuredClone(value);
const store=()=>{
  const values=new Map();
  return {values,getItem:(key)=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:(key)=>values.delete(key)};
};
const goldenBundle={clinical:{vitals:[],labs:[{panelId:'G-LAB',items:[{code:'WBC',name:'白细胞',value:9.1,unit:'10^9/L'}]}],imaging:[{reportId:'G-RIS',name:'腹部超声',findings:'胆囊结石'}],orders:[],pathology:[]},billing:{feeItems:[]},documents:[]};
const worklist=createPatientWorklist({goldenEpisode:createGoldenEpisode(),goldenBundle});
const golden=worklist.find((item)=>item.episodeId==='EP-GOLDEN-001').episode;
const demo=worklist.find((item)=>item.episodeId==='EP-DEMO-003').episode;

assert.notEqual(golden.patient.patientId,demo.patient.patientId);
assert.equal(isGoldenEpisode(golden),true);
assert.equal(isGoldenEpisode(demo),false,'a generic datasetVersion must not label an ordinary synthetic Episode as Golden');
assert.equal(demo.episodeId,'EP-DEMO-003');
assert.ok(demo.diagnoses.principal?.code,'ordinary synthetic patients must have their own principal diagnosis');
assert.ok(demo.syntheticData,'ordinary synthetic patients must use a source bundle separate from Golden data');
assert.equal(demo.goldenData,undefined);
const syntheticWithInconsistentDemographics=clone(demo);
syntheticWithInconsistentDemographics.patient.birthDate='1955-02-18';
syntheticWithInconsistentDemographics.admission.at='2026-09-18T09:20:00+08:00';
assert.equal(normalizeSyntheticPatientEpisode(syntheticWithInconsistentDemographics).changed,true,'generic datasetVersion must not suppress ordinary synthetic-patient normalization');
const emptySettlementHtml=renderSettlementPaper(buildSettlementList(demo));
assert.doesNotMatch(emptySettlementHtml.replace(/<[^>]*>/g,''),/\b0\.00\b/,'unrecorded patient payments and fees must remain blank, not appear as zero-valued claims');

const goldenCase=preparePatientCase(golden,store());
const demoCase=preparePatientCase(demo,store());
const goldenFacts=goldenCase.episode.clinicalFactContext;
const demoFacts=demoCase.episode.clinicalFactContext;
assert.equal(goldenCase.episode.diagnoses.principal.code,'K80.000x002');
assert.equal(goldenCase.episode.procedures[0].code,'51.2300');
assert.ok(goldenFacts.evidence.some((item)=>item.sourceType==='LIS'&&item.episodeId==='EP-GOLDEN-001'));
assert.ok(goldenFacts.evidence.some((item)=>item.sourceType==='RIS/PACS'&&item.episodeId==='EP-GOLDEN-001'));
assert.ok(demoFacts.evidence.some((item)=>item.sourceType==='LIS'&&item.episodeId==='EP-DEMO-003'));
assert.ok(demoFacts.evidence.some((item)=>item.sourceType==='RIS/PACS'&&item.episodeId==='EP-DEMO-003'));
assert.ok(demoFacts.evidence.every((item)=>item.episodeId==='EP-DEMO-003'));
assert.ok(demoFacts.facts.every((item)=>item.episodeId==='EP-DEMO-003'));
assert.ok(!demoFacts.evidence.some((item)=>item.evidenceId.includes('EP-GOLDEN-001')||item.value==='K80.000x002'||item.value==='51.2300'));
assert.ok(!demoFacts.facts.some((item)=>item.value==='K80.000x002'||item.value==='51.2300'));

const wrongPatientStorage=store();
wrongPatientStorage.setItem('medical-system:document:EP-DEMO-003:frontpage',JSON.stringify({episodeId:'EP-GOLDEN-001',patientId:golden.patient.patientId,snapshot:{data:[{keyName:'主要诊断代码',keyValue:'K80.000x002'}]}}));
const isolatedDocs=readPatientDocumentSnapshots(demo,wrongPatientStorage);
assert.ok(isolatedDocs.length>0,'the selected patient keeps its own seeded documents when another patient document is rejected');
assert.ok(isolatedDocs.every((doc)=>doc.episodeId===demo.episodeId&&doc.patientId===demo.patient.patientId&&doc.fixtureKind==='synthetic'));
assert.ok(!isolatedDocs.some((doc)=>doc.snapshot?.data?.some((field)=>field.keyValue==='K80.000x002')),'another patient document must not enter this patient evidence set');

const demoCases=worklist.filter((item)=>!item.golden);
assert.equal(new Set(demoCases.map((item)=>item.episode.diagnoses.principal.code)).size,demoCases.length,'each selectable synthetic patient must have different case-specific diagnosis data');
for(const item of demoCases){
  const caseData=preparePatientCase(item.episode,store());
  const workspace=workspaceFromEpisode(caseData.episode,{policyProfileId:'WH-DRG-3.0'});
  const pre=runPreGrouping({episode:episodeFromWorkspace(caseData.episode,workspace),workspace});
  const dip=groupDip3(pre.groupingSnapshot);
  assert.ok(caseData.docs.length>=7,`${item.episodeId} has its own admission, progress, attending, discharge, and front-page records`);
  assert.ok(caseData.docs.every((doc)=>doc.fixtureKind==='synthetic'&&doc.episodeId===item.episodeId&&doc.patientId===item.episode.patient.patientId));
  assert.ok(caseData.episode.documentEvidence?.length>=7);
  assert.ok(caseData.episode.fees.items.length>0,`${item.episodeId} has its own HIS fee details`);
  assert.ok(caseData.episode.clinicalFactContext.evidence.some((entry)=>entry.sourceType==='LIS'));
  assert.ok(caseData.episode.clinicalFactContext.evidence.some((entry)=>entry.sourceType==='RIS/PACS'));
  assert.equal(caseData.episode.clinicalFactContext.blockingConflicts.length,0,`${item.episodeId} has internally consistent source facts`);
  assert.equal(caseData.episode.clinicalFactContext.projections.grouping.principalDiagnosis.code,item.episode.diagnoses.principal.code);
  assert.equal(pre.groupingResult.status,'GROUPED',`${item.episodeId} runs through the official DRG 3.0 grouper`);
  assert.ok(pre.groupingResult.group?.code,`${item.episodeId} returns an actual DRG group`);
  assert.equal(dip.status,'GROUPED',`${item.episodeId} runs through the official DIP 3.0 grouper`);
  const formal=runFormalGrouping({episode:episodeFromWorkspace(caseData.episode,workspace),workspace});
  assert.equal(formal.formalStatus,'FORMAL_GROUPED',`${item.episodeId} passes synthetic claim completeness and can be formally grouped locally`);
  const qc=runFullChainQualityControl({episode:caseData.episode,documentSnapshots:caseData.docs,factContext:caseData.episode.clinicalFactContext,settlement:formal.settlement,groupingRun:pre});
  assert.equal(qc.domains.find((domain)=>domain.id==='DOCUMENT').status,'PASS',`${item.episodeId} seeded documents pass document completeness checks`);
  assert.equal(qc.domains.find((domain)=>domain.id==='FRONT_PAGE').status,'PASS',`${item.episodeId} seeded front page maps to confirmed patient facts`);
  assert.equal(qc.domains.find((domain)=>domain.id==='SETTLEMENT').status,'PASS',`${item.episodeId} settlement projection passes required-field and total checks`);
}

const conflictEpisode=clone(demo);
conflictEpisode.patient.age=43;
const conflictingDocuments=[{episodeId:demo.episodeId,patientId:demo.patient.patientId,templateId:'frontpage',templateName:'住院病案首页',snapshot:{data:[{keyCode:'DE02.01.026.00',keyName:'年龄',keyValue:'70岁'}]}}];
const conflictContext=buildClinicalFactContext({episode:conflictEpisode,documentSnapshots:conflictingDocuments,decisions:[]});
const ageConflict=conflictContext.conflicts.find((item)=>item.concept==='patient.age');
assert.ok(ageConflict?.blocking);
assert.ok(ageConflict.impactScope.includes('GROUPING'));
const conflictWorkspace=workspaceFromEpisode({...conflictEpisode,clinicalFactContext:conflictContext,documentSnapshots:conflictingDocuments},{policyProfileId:'WH-DRG-3.0'});
const conflictFormal=runFormalGrouping({episode:episodeFromWorkspace({...conflictEpisode,clinicalFactContext:conflictContext,documentSnapshots:conflictingDocuments},conflictWorkspace),workspace:conflictWorkspace});
assert.equal(conflictFormal.formalStatus,'BLOCKED_BY_FACT_CONFLICT');

assert.equal(normalizeCanonicalValue('date','1983-02-18'),'1983-02-18');
assert.equal(normalizeCanonicalValue('date','1983年02月18日'),'1983-02-18');
const equivalentTimes=['2026-09-18T01:20:00.000Z','2026-09-18 09:20:00 +08:00','2026年09月18日09时20分'];
assert.equal(new Set(equivalentTimes.map((value)=>normalizeCanonicalValue('datetime',value))).size,1);
assert.equal(normalizeCanonicalValue('sex','1'),'男');
assert.equal(normalizeCanonicalValue('age','43岁'),43);
assert.equal(normalizeCanonicalValue('code',' K80.000 x002 '),'K80.000x002');
assert.equal(normalizeCanonicalValue('number','１,２３４.５'),1234.5);
assert.equal(normalizeCanonicalValue('string',' 病例摘要 '),'病例摘要');

const staleStore=store();
const sourceEpisode=clone(demo);
const factsA=buildClinicalFactContext({episode:sourceEpisode,documentSnapshots:[],decisions:[]});
const fingerprintA=buildWorkspaceSourceFingerprint({episode:sourceEpisode,documentSnapshots:[],clinicalFactContext:factsA});
reconcileStoredWorkspace({episodeId:sourceEpisode.episodeId,sourceFingerprint:fingerprintA,storage:staleStore});
staleStore.setItem(workspaceStorageKey(sourceEpisode.episodeId),JSON.stringify({episodeId:sourceEpisode.episodeId,principalDiagnosis:{code:'K80.3'}}));
sourceEpisode.goldenData={clinical:{labs:[{panelId:'LOCAL-LAB',items:[{code:'WBC',value:12}]}]}};
const factsB=buildClinicalFactContext({episode:sourceEpisode,documentSnapshots:[],decisions:[]});
const fingerprintB=buildWorkspaceSourceFingerprint({episode:sourceEpisode,documentSnapshots:[],clinicalFactContext:factsB});
assert.notEqual(fingerprintA,fingerprintB,'LIS/RIS and Evidence changes must change the patient workspace source fingerprint');
const stale=reconcileStoredWorkspace({episodeId:sourceEpisode.episodeId,sourceFingerprint:fingerprintB,storage:staleStore});
assert.equal(stale.reset,true);
assert.equal(stale.reason,'PATIENT_SOURCE_CHANGED');
assert.equal(staleStore.getItem(workspaceStorageKey(sourceEpisode.episodeId)),null);
assert.ok(staleStore.getItem(stale.archiveKey),'stale workspace is archived before replacement');
assert.notEqual(workspaceStorageKey('EP-GOLDEN-001'),workspaceStorageKey('EP-DEMO-003'));

assert.equal(groupingStageLabel('CODE_NORMALIZATION'),'编码标准化');
assert.equal(groupingStatusLabel('REQUIRES_CONFIRMATION'),'待编码确认');
assert.equal(groupingStatusLabel('GROUPED_PENDING_CODING_CONFIRMATION'),'预分组完成，待编码确认');
assert.equal(groupingStatusLabel('PENDING_REVIEW'),'待人工审核');
assert.equal(groupingStatusLabel('PARTIAL'),'部分完成');
assert.equal(groupingQualityDomainLabel('CROSS_DOCUMENT'),'跨文书/跨源一致性');
assert.equal(groupingImpactLabel('GROUPING'),'DRG/DIP 分组');
const visibleIssues=filterGroupingQualityIssues([
  {qcDomain:'CROSS_DOCUMENT',impactScope:['SURGERY'],type:'SURGEON_CONFLICT'},
  {qcDomain:'CROSS_DOCUMENT',impactScope:['GROUPING'],type:'PRINCIPAL_DIAGNOSIS_CONFLICT'},
]);
assert.deepEqual(visibleIssues.map((item)=>item.type),['PRINCIPAL_DIAGNOSIS_CONFLICT']);
const workbench=readFileSync(new URL('../app/p1-operational-workbench.js',import.meta.url),'utf8');
const resultCard=workbench.slice(workbench.indexOf('function resultCard'),workbench.indexOf('function renderGrouping'));
assert.doesNotMatch(resultCard,/op-rule-steps/,'technical trace is not rendered as a first-screen step list');
assert.match(resultCard,/<details class="op-rule-details">/,'technical rule details remain collapsed by default');
assert.match(resultCard,/groupingTraceDetail\(row\)/,'expanded trace retains input/rule/output/source detail');
assert.match(resultCard,/查看规则依据/,'the collapsed detail has a business-facing label');
assert.match(workbench,/function caseHeader/);
assert.match(workbench,/function renderGrouping/);
assert.match(workbench,/分组输入/);
assert.match(workbench,/分组结果/);
assert.match(workbench,/支付地区：/);
assert.match(workbench,/分组规则：/);
assert.doesNotMatch(workbench,/function legacyResultCard/);
assert.doesNotMatch(workbench,/未选择支付政策（请确认统筹区）/);
const paymentProfiles=readFileSync(new URL('../app/p1/payment-policy-router.js',import.meta.url),'utf8');
assert.match(paymentProfiles,/displayName:'国家 CHS-DRG 3\.0'/,'the grouper label is owned by the Payment Profile, not duplicated in the page renderer');
assert.match(workbench,/当前支付地区尚未接入已核验的匹配版本支付参数/);
assert.doesNotMatch(workbench,/支付金额暂不可计算/,'the payment section explains the missing matched parameters instead of a generic amount error');
assert.doesNotMatch(workbench,/searchDip3DiagnosisCatalog/,'the UI uses the shared diagnosis search service');
assert.match(resultCard,/runType==='PAYER_FORMAL_GROUPING_LOCAL_REPLICA'\?'正式分组结果'/,'technical run identifiers map to a localized business label');
assert.doesNotMatch(resultCard,/sourceSha256|sourceRow/,'rule pack metadata is not part of the visible result card');
const groupingView=workbench.slice(workbench.indexOf('function renderGrouping'),workbench.indexOf('function claimRows'));
assert.doesNotMatch(groupingView,/人工动作\s*0|病例版本|业务状态/,'the grouping view has no repeated business-state card');
const qcOverlay=readFileSync(new URL('../app/full-chain-qc-overlay.js',import.meta.url),'utf8');
assert.match(qcOverlay,/groupingStatusLabel\(status\)/,'grouping QC summary localizes statuses');
assert.match(qcOverlay,/groupingQualityDomainLabel\(issue\.qcDomain\)/,'grouping QC details localize domains');
assert.match(qcOverlay,/分组失败：\$\{groupingStatusLabel\(state\)\}/,'grouping QC titles translate rule-engine statuses');

console.log('PASS patient isolation, confirmed-fact grouping, stale workspace, canonical values, and DRG/DIP presentation');
