import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runRealBusinessPipeline } from '../app/p1/real-business-pipeline.js';
import { groupDrg3, getDrg3RulePackMeta, validateDrg3FormulaCoverage } from '../app/p1/drg3-grouper.js';
import { getDip3RulePackMeta } from '../app/p1/dip3-grouper.js';

function fixture(){
  return {
    episodeId:'IP-DEMO-2026-001', patient:{sex:'男',age:70,birthDate:'1955-02-18'},
    insurance:{region:'湖北省武汉市',type:'职工基本医疗保险'}, payment:{method:'DRG'},
    diagnoses:{principal:{code:'K80.3',name:'胆总管结石伴胆管炎'},secondary:[{code:'I10.x00',name:'高血压病'},{code:'E11.900',name:'2型糖尿病'}]},
    procedures:[{id:'OP1',code:'51.2300',name:'腹腔镜下胆囊切除术'}],
    admission:{at:'2025-07-17T13:23:00+08:00',history:'胆总管结石相关现病史'}, discharge:{at:'2025-07-24T10:00:00+08:00',method:'医嘱离院'},
    clinicalProcess:{ventilatorDuration:{days:0,hours:0,minutes:0},icuStays:[]},
    fees:{businessSerialNumber:'FY1',items:[{category:'surgery',name:'手术费',amount:10000},{category:'bed',name:'床位费',amount:2000}]},
    evidence:[{evidenceId:'EV1',sourceType:'EMR',sourceId:'DOC1',label:'入院记录'}]
  };
}
function settlement(episode){return {claimSerialNumber:'JSQD-001',medicalRecordNumber:'BA-001',patient:episode.patient,inpatient:{principalDiagnosis:episode.diagnoses.principal,secondaryDiagnoses:episode.diagnoses.secondary,lengthOfStay:7},procedures:{primary:episode.procedures[0],others:[]}};}
function sha256(path){return createHash('sha256').update(readFileSync(path)).digest('hex');}

const drgMeta=getDrg3RulePackMeta();
const dipMeta=getDip3RulePackMeta();
assert.equal(sha256(new URL('../rulesets/official-source/按病组（DRG）付费3.0版分组方案配置信息.xlsx',import.meta.url)),drgMeta.sha256);
assert.equal(sha256(new URL('../rulesets/official-source/按病种分值（DIP）付费3.0版分组方案.xlsx',import.meta.url)),dipMeta.sha256);
assert.equal(drgMeta.counts.mdc,26);
assert.equal(drgMeta.counts.adrg,537);
assert.equal(drgMeta.counts.drg,870);
assert.ok(dipMeta.counts.merge>1700);
const formulaCoverage=validateDrg3FormulaCoverage();
assert.equal(formulaCoverage.errors.length,0,JSON.stringify(formulaCoverage.errors.slice(0,3)));

const episode=fixture(); const list=settlement(episode); const issues=[];
let p=runRealBusinessPipeline({episode,settlement:list,settlementIssues:issues});
assert.equal(p.route.paymentMethod,'DRG');
assert.equal(p.groupingResult.mdc.code,'MDCH');
assert.equal(p.groupingResult.adrg.code,'HC4');
assert.equal(p.groupingResult.group.code,'HC45');
assert.equal(p.groupingResult.mappingConfirmationRequired,true);
assert.ok(p.auditRun.risks.some(x=>x.type==='CODING_STANDARDIZATION'));
assert.equal(p.paymentResult.status,'PENDING_LOCAL_PARAMETERS');
assert.equal(p.groupingResult.productionRuleCoverage,'OFFICIAL_WORKBOOK_FULL');

p=runRealBusinessPipeline({episode,settlement:list,settlementIssues:issues,confirmedMappings:['K80.3->K80.302']});
assert.equal(p.groupingResult.status,'GROUPED');
assert.ok(!p.auditRun.risks.some(x=>x.type==='CODING_STANDARDIZATION'));

const dip=runRealBusinessPipeline({episode,settlement:list,settlementIssues:issues,overrideMethod:'DIP',confirmedMappings:['K80.3->K80.302']});
assert.equal(dip.route.paymentMethod,'DIP');
assert.equal(dip.groupingResult.method,'DIP');
assert.equal(dip.groupingResult.group.code,'BX-1029');
assert.equal(dip.groupingResult.group.sourceSheet,'二、并项规则下的核心病种');
assert.ok(dip.groupingResult.trace.some(x=>x.stage==='DIP_MERGE_RULE'&&x.status==='MATCHED'));
assert.equal(dip.groupingResult.productionRuleCoverage,'OFFICIAL_WORKBOOK_FULL');

const beijing=runRealBusinessPipeline({episode,settlement:list,settlementIssues:issues,policyProfileId:'BJ-DRG-2.0-2025'});
assert.equal(beijing.groupingResult.status,'GROUPER_NOT_AVAILABLE','legacy pipeline must also refuse to run the national grouper for the Beijing profile');
assert.equal(beijing.groupingResult.group,null);
assert.equal(beijing.paymentResult.amount,null);

// Upstream/open-source known CHS-DRG 3.0 regression path, now executed against the user-provided official workbook.
const sample={episodeId:'UPSTREAM-SAMPLE',patient:{sex:1,age:45},principalDiagnosis:{code:'K80.101',name:'胆囊结石伴慢性胆囊炎'},secondaryDiagnoses:[{code:'I50.900',name:'心力衰竭'}],principalProcedure:{code:'51.2300',name:'腹腔镜下胆囊切除术'},otherProcedures:[],discharge:{method:'1'},clinicalFactors:{lengthOfStay:5},source:{}};
const g=groupDrg3(sample);
assert.equal(g.mdc.code,'MDCH'); assert.equal(g.adrg.code,'HC4'); assert.equal(g.group.code,'HC43'); assert.equal(g.formulaErrors.length,0);

// Validate Pre-MDC path from the official workbook.
const transplant=groupDrg3({patient:{sex:1,age:45},principalDiagnosis:{code:'K80.302',name:'胆总管结石伴胆管炎'},secondaryDiagnoses:[],principalProcedure:{code:'50.5100',name:'辅助肝移植'},otherProcedures:[]});
assert.equal(transplant.mdc.code,'MDCA'); assert.equal(transplant.adrg.code,'AB1'); assert.equal(transplant.group.code,'AB19');

console.log('PASS P1 official DRG/DIP 3.0 real business flow');
console.log('DRG workbook SHA256',drgMeta.sha256,drgMeta.counts);
console.log('DIP workbook SHA256',dipMeta.sha256,dipMeta.counts);
