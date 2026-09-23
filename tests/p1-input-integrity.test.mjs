import assert from 'node:assert/strict';
import { getDrg3DiagnosisSupport, validateGroupingInputIntegrity } from '../app/p1/drg-input-validator.js';
import { buildWorkspaceSourceFingerprint, reconcileStoredWorkspace, workspaceStorageKey } from '../app/p1/workspace-integrity.js';
import { normalizeSyntheticPatientEpisode, ageAt } from '../app/p1/patient-integrity.js';

assert.equal(getDrg3DiagnosisSupport('K80.302').supported, true, 'known DRG 3.0 diagnosis must be supported');
assert.equal(getDrg3DiagnosisSupport('K80.3').status, 'MAPPED_CANDIDATE', 'existing local crosswalk remains a candidate, not a silent rewrite');
assert.equal(getDrg3DiagnosisSupport('A15.400').supported, false, 'screenshot code A15.400 must not be treated as DRG-supported when absent from exact official sets');

const screenshotInput = validateGroupingInputIntegrity({
  paymentMethod:'DRG',
  snapshot:{
    patient:{age:62,sex:1},
    principalDiagnosis:{code:'A15.400',name:'胸腔内淋巴结结核'},
    secondaryDiagnoses:[{code:'A15.400',name:'胸腔内淋巴结结核'},{code:'E11.900',name:'2型糖尿病'}],
    principalProcedure:{code:'51.2300',name:'腹腔镜下胆囊切除术'}, otherProcedures:[],
  },
});
assert.equal(screenshotInput.ok,false);
assert.ok(screenshotInput.errors.some((x)=>x.code==='DRG_PRINCIPAL_DIAGNOSIS_UNSUPPORTED'));
assert.ok(screenshotInput.errors.some((x)=>x.code==='PRINCIPAL_DIAGNOSIS_DUPLICATED'));

const valid = validateGroupingInputIntegrity({paymentMethod:'DRG',snapshot:{principalDiagnosis:{code:'K80.302'},secondaryDiagnoses:[{code:'E11.900'}],principalProcedure:{code:'51.2300'},otherProcedures:[]}});
assert.equal(valid.ok,true);

const memory=new Map(); const storage={getItem:(k)=>memory.has(k)?memory.get(k):null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:(k)=>memory.delete(k)};
const episode={episodeId:'EP-DEMO-002',synthetic:true,patient:{sex:'男',age:62,birthDate:'1955-02-18'},diagnoses:{principal:{code:'K80.3',name:'胆总管结石伴胆管炎'},secondary:[]},procedures:[{code:'51.2300',name:'腹腔镜下胆囊切除术'}],admission:{at:'2025-07-17T13:23:00+08:00'},discharge:{at:'2025-07-24T10:00:00+08:00'}};
const fp=buildWorkspaceSourceFingerprint({episode,documentSnapshots:[]});
storage.setItem(workspaceStorageKey(episode.episodeId),JSON.stringify({episodeId:episode.episodeId,principalDiagnosis:{code:'A15.400'}}));
const migrated=reconcileStoredWorkspace({episodeId:episode.episodeId,sourceFingerprint:fp,storage});
assert.equal(migrated.reset,true); assert.equal(migrated.reason,'MIGRATED_LEGACY_WORKSPACE'); assert.equal(storage.getItem(workspaceStorageKey(episode.episodeId)),null);

const normalized=normalizeSyntheticPatientEpisode(episode); assert.equal(normalized.changed,true); assert.ok(Math.abs(ageAt(episode.admission.at,episode.patient.birthDate)-62)<=1);
console.log('PASS P1 screenshot/input integrity regression');
