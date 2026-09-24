import assert from 'node:assert/strict';
import { createEpisodeFixture } from '../app/data/episode.js';
import { PAYMENT_POLICY_PROFILES, routePaymentPolicy } from '../app/p1/payment-policy-router.js';
import { aggregateCurrentCaseCost, calculatePayment } from '../app/p1/payment-calculator.js';
import { workspaceFromEpisode, episodeFromWorkspace, remapWorkspaceFromEpisode } from '../app/p1/current-case-adapter.js';
import { runPreGrouping } from '../app/p1/workflow-orchestrator.js';
import { buildClinicalFactContext } from '../app/clinical-facts/index.js';

const clone=(value)=>structuredClone(value);
const profile=(groupParameters)=>({id:'TEST-CHS-DRG-3.0',displayName:'仅测试支付参数',region:'隔离测试地区',paymentMethod:'DRG',grouperSystem:'CHS-DRG',grouperVersion:'DRG-3.0',grouperReady:true,verified:true,rate:10000,groupParameters});
const makeRun=(episode,workspace)=>runPreGrouping({episode:episodeFromWorkspace(episode,workspace),workspace});

const episode=createEpisodeFixture();
episode.patient.age=47;
episode.patient.birthDate='1978-02-18';
const workspace=workspaceFromEpisode(episode,{policyProfileId:'WH-DRG-3.0'});
const run=makeRun(episode,workspace);
assert.equal(run.groupingResult.group.code,'HC45');
assert.equal(run.groupingResult.grouperSystem,'CHS-DRG');
assert.equal(run.paymentResult.amount,null,'national DRG 3.0 grouping must not manufacture a local payment standard');
assert.equal(run.paymentResult.status,'PENDING_LOCAL_PARAMETERS');

const beijing=PAYMENT_POLICY_PROFILES.find((item)=>item.id==='BJ-DRG-2.0-2025');
assert.equal(beijing.region,'北京市');
assert.equal(beijing.grouperSystem,'BEIJING-DRG');
assert.equal(beijing.grouperVersion,'BEIJING-DRG-2.0-2025');
assert.equal(beijing.effectiveDate,'2025-01-01');
assert.equal(beijing.rate,20425);
assert.equal(beijing.rateVerified,true);
assert.equal(beijing.grouperReady,false,'do not pair Beijing payment rates with the national DRG 3.0 grouper');
assert.deepEqual(Object.keys(beijing.groupParameters),[],'no unverified/partial group weights are exposed as executable payment data');
const beijingWorkspace=workspaceFromEpisode(episode,{policyProfileId:beijing.id});
const beijingRun=makeRun(episode,beijingWorkspace);
assert.equal(beijingRun.groupingResult.status,'GROUPER_NOT_AVAILABLE');
assert.equal(beijingRun.groupingResult.group,null);
assert.equal(beijingRun.paymentResult.amount,null);
assert.equal(beijingRun.formalStatus,undefined);

const mismatchedRoute={...beijing,grouperReady:true,groupParameters:{HC45:{weight:9,referencePayment:999999}}};
const mismatch=calculatePayment({route:mismatchedRoute,groupingResult:run.groupingResult,episode});
assert.equal(mismatch.status,'PAYMENT_PROFILE_VERSION_MISMATCH','payment is rejected when CHS-DRG 3.0 is paired with a Beijing-specific profile');
assert.equal(mismatch.amount,null);
const emptyParameters=calculatePayment({route:{...beijing,grouperSystem:'CHS-DRG',grouperVersion:'DRG-3.0',grouperReady:true,verified:true,rate:10000,groupParameters:{HC45:{weight:null,referencePayment:null}}},groupingResult:run.groupingResult,episode});
assert.equal(emptyParameters.status,'PENDING_LOCAL_PARAMETERS','blank/null values cannot be interpreted as a zero-yuan verified payment');

const costEpisode=clone(episode);
costEpisode.fees.items=[
  {category:'westernMedicine',name:'头孢注射剂',itemCode:'MED-1',quantity:3,unitPrice:10,amount:30,billingTime:'2025-07-17T09:00:00+08:00'},
  {category:'westernMedicine',name:'西药费',amount:999,aggregateSource:true},
  {category:'examination',name:'超声检查',itemCode:'EX-1',quantity:1,unitPrice:50,amount:50,billingTime:'2025-07-17T11:00:00+08:00'},
  {category:'laboratory',name:'血常规',itemCode:'LAB-1',quantity:1,unitPrice:20,amount:20,billingTime:'2025-07-18T08:00:00+08:00'},
  {category:'material',name:'一次性材料',itemCode:'MAT-1',quantity:1,unitPrice:10,amount:10},
];
const cost=aggregateCurrentCaseCost(costEpisode);
assert.equal(cost.total,110,'itemized rows replace rather than double-count the category aggregate');
assert.equal(cost.categories.medicine,30);
assert.equal(cost.categories.examination,50);
assert.equal(cost.categories.laboratory,20);
assert.equal(cost.categories.material,10);
assert.equal(cost.medicineShare,30/110);
assert.deepEqual(cost.dailyTrend,[{date:'2025-07-17',amount:80},{date:'2025-07-18',amount:20}]);
assert.deepEqual(cost.topMedicines.map((item)=>item.name),['头孢注射剂']);
assert.equal(cost.topMedicines[0].quantity,3);
assert.equal(cost.topMedicines[0].unitPrice,10);

const testProfile=profile({HC45:{weight:1.2},HC43:{weight:1.8}});
const under=calculatePayment({route:testProfile,groupingResult:run.groupingResult,episode:costEpisode});
assert.equal(under.status,'WITHIN_REFERENCE_PAYMENT');
assert.equal(under.referencePayment,12000);
assert.equal(under.currentCaseCost,110);
assert.equal(under.costBreakdown.medicineAmount,30);

const highCostEpisode=clone(costEpisode);
highCostEpisode.fees.items=[{category:'examination',name:'当前患者检查费',amount:13000}];
const over=calculatePayment({route:testProfile,groupingResult:run.groupingResult,episode:highCostEpisode});
assert.equal(over.status,'OVER_REFERENCE_PAYMENT');
assert.equal(over.variance,1000);

const withCc=clone(workspace);
withCc.secondaryDiagnoses=[{code:'I50.900',name:'心力衰竭'}];
const ccRun=makeRun(episode,withCc);
assert.equal(ccRun.groupingResult.group.code,'HC43');
const afterCc=calculatePayment({route:testProfile,groupingResult:ccRun.groupingResult,episode:costEpisode});
assert.equal(afterCc.referencePayment,18000,'the changed DRG group must select its own weight and payment');
assert.notEqual(afterCc.referencePayment,under.referencePayment);

const otherPatient=clone(costEpisode);
otherPatient.episodeId='IP-OTHER-PATIENT';
otherPatient.patient.patientId='P-OTHER-PATIENT';
otherPatient.fees.items=[{category:'medicine',name:'另一患者药品',amount:777}];
assert.equal(aggregateCurrentCaseCost(costEpisode).total,110);
assert.equal(aggregateCurrentCaseCost(otherPatient).total,777,'case costs are read only from the supplied patient Episode');
assert.equal(calculatePayment({route:testProfile,groupingResult:run.groupingResult,episode:otherPatient}).currentCaseCost,777);

const oldWorkspace=workspaceFromEpisode(episode,{policyProfileId:'WH-DRG-3.0'});
oldWorkspace.patient.ageInDays=4;
oldWorkspace.patient.newbornWeight=3200;
oldWorkspace.groupingInputSources['patient.ageInDays']={sourceType:'MANUAL',status:'MANUAL_OVERRIDE',sourceName:'人工修改',evidenceRefs:[]};
oldWorkspace.groupingInputSources['patient.newbornWeight']={sourceType:'MANUAL',status:'MANUAL_OVERRIDE',sourceName:'人工修改',evidenceRefs:[]};
oldWorkspace.preGroupingRun=makeRun(episode,oldWorkspace);
oldWorkspace.patient.age=51;
oldWorkspace.groupingInputSources['patient.age']={sourceType:'MANUAL',status:'MANUAL_OVERRIDE',sourceName:'人工修改',evidenceRefs:[]};
oldWorkspace.confirmedMappings=['K80.3->K80.302'];
oldWorkspace.reviewLog=[{action:'PASS',note:'保留审核记录'}];
oldWorkspace.claimDetails=[{id:'HIS-1',category:'medicine',itemName:'患者本次HIS药品',amount:3380,aggregateSource:true}];
oldWorkspace.groupingInputSources['diagnosis.secondary']={sourceType:'MANUAL',status:'MANUAL_OVERRIDE',sourceName:'人工修改',evidenceRefs:[]};
oldWorkspace.secondaryDiagnoses=[{code:'E11.900',name:'2型糖尿病'}];
const updatedEpisode=clone(episode);
updatedEpisode.patient.age=48;
updatedEpisode.patient.sex='男';
updatedEpisode.patient.ageInDays=2;
updatedEpisode.patient.newbornWeight=3100;
updatedEpisode.diagnoses.principal={...updatedEpisode.diagnoses.principal,code:'K80.302'};
updatedEpisode.diagnoses.secondary=[{code:'I10.x00',name:'高血压病'}];
delete updatedEpisode.clinicalFactContext;
const savedStorage=globalThis.localStorage;
const decisionValues=new Map([[`medical-system:fact-decisions:${updatedEpisode.episodeId}`,JSON.stringify([{decisionId:'DEC-REMAP-1',episodeId:updatedEpisode.episodeId,concept:'patient.sex',selectedEvidenceId:null,selectedValue:'女',decidedAt:'2026-09-24T00:00:00Z'}])]]);
globalThis.localStorage={getItem:(key)=>decisionValues.get(key)??null,setItem:(key,value)=>decisionValues.set(key,String(value)),removeItem:(key)=>decisionValues.delete(key)};
updatedEpisode.clinicalFactContext=buildClinicalFactContext({episode:updatedEpisode,documentSnapshots:[]});
assert.ok(updatedEpisode.clinicalFactContext.evidence.some((item)=>item.value==='K80.302'),'the refreshed patient Evidence index contains the changed current diagnosis');
assert.equal(updatedEpisode.clinicalFactContext.projections.grouping.principalDiagnosis.code,'K80.302','the refreshed Grouping Projection consumes the current patient diagnosis');
const remapped=remapWorkspaceFromEpisode(updatedEpisode,oldWorkspace,{sourceChanged:true});
assert.equal(remapped.workspace.principalDiagnosis.code,'K80.302','unmodified mapped diagnosis refreshes from the current Episode');
assert.equal(remapped.workspace.patient.sex,'女','a patient FactDecision remains active during remapping');
assert.equal(updatedEpisode.clinicalFactContext.decisions[0].decisionId,'DEC-REMAP-1');
assert.equal(remapped.workspace.patient.age,51,'manual demographic override survives remapping');
assert.equal(remapped.workspace.patient.ageInDays,4,'manual neonatal age survives remapping');
assert.equal(remapped.workspace.patient.newbornWeight,3200,'manual neonatal weight survives remapping');
assert.deepEqual(remapped.workspace.secondaryDiagnoses,[{code:'E11.900',name:'2型糖尿病'}],'manual collection override survives remapping');
assert.deepEqual(remapped.workspace.confirmedMappings,oldWorkspace.confirmedMappings,'coding confirmations survive remapping');
assert.deepEqual(remapped.workspace.reviewLog,oldWorkspace.reviewLog,'manual review history survives remapping');
assert.deepEqual(remapped.workspace.claimDetails,oldWorkspace.claimDetails,'remapping does not silently change the HIS/claim fee input');
assert.equal(remapped.workspace.preGroupingRun.runId,oldWorkspace.preGroupingRun.runId,'old run is retained for stale-state display');
assert.equal(remapped.workspace.revision,oldWorkspace.revision+1,'changed mapped grouping input invalidates the old run');
assert.equal(remapped.changed,true);
assert.match(remapped.workspace.remapNotice,/请重新分组/);
assert.equal(remapped.workspace.episodeId,updatedEpisode.episodeId);

const unrelated=remapWorkspaceFromEpisode({...updatedEpisode,episodeId:'IP-UNRELATED' },oldWorkspace,{sourceChanged:true});
assert.equal(unrelated.workspace.episodeId,'IP-UNRELATED');
assert.notDeepEqual(unrelated.workspace.claimDetails,oldWorkspace.claimDetails,'a different Episode cannot inherit another patient claim details');
assert.notDeepEqual(unrelated.workspace.reviewLog,oldWorkspace.reviewLog,'a different Episode cannot inherit another patient review history');
if(savedStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=savedStorage;

console.log('PASS payment profile isolation, HIS cost monitoring, DRG/payment linkage, patient isolation, and remap preservation/staleness');
