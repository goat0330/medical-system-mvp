import { strict as assert } from 'node:assert';
import { buildClinicalFactContext } from '../app/clinical-facts/index.js';
import { createFactDecision } from '../app/clinical-facts/models/decision.js';
import { buildGroupingFactProjection } from '../app/clinical-facts/projection/grouping-projection.js';
import { qualityIssuesFromFactConflicts } from '../app/clinical-facts/quality/cross-source-quality.js';

const episode={
  episodeId:'EP-FACT-001',patient:{patientId:'P1',name:'测试患者',sex:'男',birthDate:'1955-02-18',age:43,nationality:'中国',ethnicity:'汉族'},
  medicalRecordNumber:'BA1',inpatientNumber:'IP1',admission:{at:'2025-07-17T09:00:00+08:00',department:'外科',source:'门诊',medicalType:'住院',treatmentCategory:'西医'},
  discharge:{at:'2025-07-24T10:00:00+08:00',department:'外科',method:'医嘱离院'},
  diagnoses:{principal:{code:'K80.3',name:'胆总管结石伴胆管炎'},secondary:[],outpatientWestern:[]},
  procedures:[{code:'51.2300',name:'腹腔镜下胆囊切除术',anesthesiaType:'全身麻醉'}],
  fees:{items:[],businessSerialNumber:'F1'},clinicalProcess:{},payment:{},insurance:{},institution:{},evidence:[]
};
const docs=[{templateId:'frontpage',templateName:'住院病案首页',savedAt:'2025-07-24T11:00:00+08:00',status:'confirmed',snapshot:{text:'病案首页',data:[
  {keyCode:'DE02.01.026.00',keyName:'年龄',keyValue:'43岁'},
  {keyCode:'DE05.01.024.00',keyName:'主要诊断代码',keyValue:'K80.302'},
  {keyCode:'DE05.10.172.00',keyName:'主要诊断',keyValue:'胆总管结石伴胆管炎'},
  {keyCode:'DE06.00.093.00',keyName:'主要手术及操作代码',keyValue:'51.2300'},
]}}];

let context=buildClinicalFactContext({episode,documentSnapshots:docs,decisions:[]});
assert.ok(context.evidence.some(x=>x.sourceDocumentType==='frontpage'&&x.fieldCode==='DE05.01.024.00'));
assert.ok(context.conflicts.some(x=>x.concept==='patient.age'&&x.blocking),'age/birth-date conflict must block');
assert.ok(context.conflicts.some(x=>x.concept==='diagnosis.principal.code'&&x.blocking),'principal diagnosis code conflict must block');
assert.ok(qualityIssuesFromFactConflicts(context).every(x=>x.evidenceRefs.length>0));

const decisions=[
  createFactDecision({decisionId:'D-AGE',episodeId:episode.episodeId,concept:'patient.age',selectedValue:70}),
  createFactDecision({decisionId:'D-DX',episodeId:episode.episodeId,concept:'diagnosis.principal.code',selectedValue:'K80.302'}),
];
context=buildClinicalFactContext({episode,documentSnapshots:docs,decisions});
assert.ok(!context.conflicts.some(x=>x.concept==='patient.age'));
assert.ok(!context.conflicts.some(x=>x.concept==='diagnosis.principal.code'));
assert.equal(context.facts.find(x=>x.concept==='patient.age').value,70);
assert.equal(context.facts.find(x=>x.concept==='diagnosis.principal.code').value,'K80.302');
const grouping=buildGroupingFactProjection(context);
assert.equal(grouping.patient.age,70);
assert.equal(grouping.principalDiagnosis.code,'K80.302');
assert.ok(grouping.principalDiagnosis.factRefs.code.factId);
assert.ok(grouping.principalDiagnosis.factRefs.code.evidenceRefs.length>=1);
console.log('PASS clinical fact/evidence/conflict/projection');
