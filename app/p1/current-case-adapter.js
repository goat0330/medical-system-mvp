import { DOCUMENT_TEMPLATES } from '../data/templates.js';
import { buildClinicalFactContext } from '../clinical-facts/index.js';

const clone = (x) => typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x));
const norm = (x) => String(x ?? '').replace(/[\s：:（）()\[\]【】_\-]/g, '').toLowerCase();
function valueByAliases(facts, aliases){const wanted=aliases.map(norm);let row=facts.find((x)=>wanted.includes(norm(x.keyName)));if(!row)row=facts.find((x)=>wanted.some((a)=>norm(x.keyName).includes(a)));const v=row?.keyValue;return typeof v==='object'?String(v?.value??v?.code??'').trim():String(v??'').trim();}

export function readSavedDocumentSnapshots(episodeId, storage = globalThis.localStorage, patientId = null){
  if(!storage || !episodeId) return [];
  const out=[];
  for(const t of DOCUMENT_TEMPLATES){
    const key=`medical-system:document:${episodeId}:${t.id}`;
    try{const raw=storage.getItem(key);if(!raw)continue;const record=JSON.parse(raw);if(record?.snapshot&&(!record.episodeId||record.episodeId===episodeId)&&(!record.patientId||!patientId||record.patientId===patientId))out.push({templateId:t.id,templateName:t.name,episodeId,patientId:record.patientId||patientId||null,status:record.status,savedAt:record.savedAt,version:record.version||record.savedAt,snapshot:record.snapshot});}catch{}
  }
  return out.sort((a,b)=>String(a.savedAt||'').localeCompare(String(b.savedAt||'')));
}

export function readPatientDocumentSnapshots(episode, storage = globalThis.localStorage){
  if(!episode?.episodeId)return [];
  const saved=readSavedDocumentSnapshots(episode.episodeId,storage,episode.patient?.patientId).map((doc)=>({...doc,fixtureSource:false}));
  const savedIds=new Set(saved.map((doc)=>doc.templateId));
  const fixtureKind=episode.syntheticData?'synthetic':'golden';
  const sourceDocuments=episode.syntheticData?.documents||episode.goldenData?.documents||[];
  const fixtures=sourceDocuments.filter((doc)=>!savedIds.has(doc.templateId)).map((doc)=>({
    templateId:doc.templateId,templateName:doc.name,episodeId:episode.episodeId,patientId:episode.patient?.patientId||null,
    status:doc.status,version:episode.datasetVersion||`${fixtureKind}-fixture`,fixtureSource:true,fixtureKind,
    snapshot:{text:doc.text||'',data:clone(doc.data||doc.snapshot?.data||[])},
  }));
  return [...fixtures,...saved];
}

export function preparePatientCase(episode, storage = globalThis.localStorage){
  if(!episode?.episodeId)return null;
  const docs=readPatientDocumentSnapshots(episode,storage);
  const facts=extractClinicalFactsFromDocuments(docs);
  return {episode:applyDocumentFacts(episode,facts),docs,facts};
}

export function extractClinicalFactsFromDocuments(records=[]){
  const fields=records.flatMap((r)=>Array.isArray(r.snapshot?.data)?r.snapshot.data:[]);
  const mainName=valueByAliases(fields,['主要诊断','出院主要诊断','主要诊断名称']);
  const mainCode=valueByAliases(fields,['主要诊断疾病编码','主要诊断代码','疾病编码']);
  const procName=valueByAliases(fields,['主要手术及操作名称','手术名称']);
  const procCode=valueByAliases(fields,['主要手术及操作代码','手术及操作代码']);
  const sex=valueByAliases(fields,['性别']);
  const ageRaw=valueByAliases(fields,['年龄']);const ageMatch=String(ageRaw).match(/\d+/);
  const admissionAt=valueByAliases(fields,['入院日期时间','入院时间']);
  const dischargeAt=valueByAliases(fields,['出院日期时间','出院时间']);
  return {
    mainDiagnosis:mainName||mainCode?{name:mainName,code:mainCode}:null,
    mainProcedure:procName||procCode?{name:procName,code:procCode}:null,
    sex:sex||null,age:ageMatch?Number(ageMatch[0]):null,admissionAt:admissionAt||null,dischargeAt:dischargeAt||null,
    sourceDocuments:records.map((x)=>({templateId:x.templateId,templateName:x.templateName,savedAt:x.savedAt,status:x.status,version:x.version||x.savedAt})),
    sourceRecords:records,
  };
}

export function applyPatientContext(baseEpisode, context={}){
  const e=clone(baseEpisode);
  if(context.episodeId){
    const serial=String(context.episodeId).split('-').pop()||'001';
    const changingEpisode=Boolean(e.episodeId && e.episodeId!==context.episodeId);
    e.episodeId=context.episodeId;e.inpatientNumber=context.episodeId;e.inpatientNo=context.episodeId;
    if(changingEpisode||!e.medicalRecordNumber)e.medicalRecordNumber=`BA-${context.episodeId}`;
    if(changingEpisode||!e.claimSerialNumber)e.claimSerialNumber=`JSQD-${context.episodeId}`;
    e.fees={...e.fees};
    if(changingEpisode||!e.fees.businessSerialNumber)e.fees.businessSerialNumber=`FY-${context.episodeId}`;
    if(changingEpisode||!e.fees.invoiceNumber)e.fees.invoiceNumber=`INV-${context.episodeId}`;
    e.patient={...e.patient};if(changingEpisode||!e.patient.patientId)e.patient.patientId=`P-${serial}`;
  }
  if(context.name)e.patient.name=context.name;if(context.sex)e.patient.sex=context.sex;if(context.age!==null&&context.age!==undefined&&Number.isFinite(Number(context.age)))e.patient.age=Number(context.age);
  if(context.department){e.admission.department=context.department;e.admission.ward=context.department;e.discharge.department=context.department;}if(context.bed)e.admission.bed=String(context.bed).replace('床','');
  return e;
}

function confirmedValue(context, concept){return context?.facts?.find((x)=>x.concept===concept&&x.status==='CONFIRMED')?.value;}

function inputSourceFor(episode,concept){
  const fact=episode?.clinicalFactContext?.facts?.find((item)=>item.concept===concept)||null;
  if(!fact)return {sourceType:'UNMAPPED',status:'MISSING',factId:null,evidenceRefs:[]};
  const evidence=episode.clinicalFactContext.evidence.find((item)=>item.evidenceId===fact.selectedEvidenceId)||null;
  return {sourceType:evidence?.sourceType||fact.sourceClass||'UNMAPPED',sourceName:evidence?.fieldName||evidence?.metadata?.templateName||evidence?.sourceId||'',status:fact.status,factId:fact.factId,evidenceRefs:fact.evidenceIds||[]};
}

export function applyDocumentFacts(episode, facts={}){
  const e=clone(episode);const records=facts.sourceRecords||[];const context=buildClinicalFactContext({episode:e,documentSnapshots:records});
  const dxCode=confirmedValue(context,'diagnosis.principal.code'),dxName=confirmedValue(context,'diagnosis.principal.name');
  if(dxCode||dxName)e.diagnoses.principal={...e.diagnoses.principal,...(dxCode?{code:dxCode}:{}),...(dxName?{name:dxName}:{})};
  const opCode=confirmedValue(context,'procedure.primary.code'),opName=confirmedValue(context,'procedure.primary.name');
  if(opCode||opName){if(!e.procedures?.length)e.procedures=[{}];e.procedures[0]={...e.procedures[0],...(opCode?{code:opCode}:{}),...(opName?{name:opName}:{}),role:'primary'};}
  const sex=confirmedValue(context,'patient.sex'),age=confirmedValue(context,'patient.age');if(sex)e.patient.sex=sex;if(age!==undefined&&age!==null&&Number.isFinite(Number(age)))e.patient.age=Number(age);
  const admissionAt=confirmedValue(context,'admission.at'),dischargeAt=confirmedValue(context,'discharge.at');if(admissionAt&&!Number.isNaN(new Date(admissionAt).getTime()))e.admission.at=admissionAt;if(dischargeAt&&!Number.isNaN(new Date(dischargeAt).getTime()))e.discharge.at=dischargeAt;
  e.documentEvidence=(facts.sourceDocuments||[]).map((x)=>x);e.documentSnapshots=records;e.clinicalFactContext=context;
  return e;
}

export function defaultClaimDetailsFromEpisode(episode){const admissionDate=String(episode?.admission?.at||'').slice(0,10);return(episode?.fees?.items||[]).map((x,i)=>({id:`CLAIM-${i+1}`,category:x.category||'other',itemCode:x.itemCode||'',itemName:x.name||`费用项目${i+1}`,billingTime:x.billingTime||`${admissionDate}T12:00:00+08:00`,quantity:Number(x.quantity??x.qty??1),unitPrice:Number(x.unitPrice??x.amount??0),amount:Number(x.amount??0),classA:Number(x.classA??0),classB:Number(x.classB??0),selfPay:Number(x.selfPay??0),other:Number(x.other??0),aggregateSource:!(x.itemCode||x.serviceCode)}));}

export function workspaceFromEpisode(episode,{policyProfileId='WH-DRG-3.0',claimDetails=null}={}){
  const procedures=episode?.procedures||[];
  const context=episode?.clinicalFactContext||buildClinicalFactContext({episode,documentSnapshots:episode?.documentSnapshots||[]});
  const inputSources={
    'patient.sex':inputSourceFor({...episode,clinicalFactContext:context},'patient.sex'),
    'patient.age':inputSourceFor({...episode,clinicalFactContext:context},'patient.age'),
    'diagnosis.principal.code':inputSourceFor({...episode,clinicalFactContext:context},'diagnosis.principal.code'),
    'diagnosis.principal.name':inputSourceFor({...episode,clinicalFactContext:context},'diagnosis.principal.name'),
    'procedure.primary.code':inputSourceFor({...episode,clinicalFactContext:context},'procedure.primary.code'),
    'procedure.primary.name':inputSourceFor({...episode,clinicalFactContext:context},'procedure.primary.name'),
  };
  return {
    episodeId:episode.episodeId,policyProfileId,
    patient:{sex:context.projections?.grouping?.patient?.sex||'',age:context.projections?.grouping?.patient?.age==null?'':Number(context.projections.grouping.patient.age),birthDate:context.projections?.grouping?.patient?.birthDate||'',newbornWeight:episode.patient?.newbornWeight??null,ageInDays:episode.patient?.ageInDays??null},
    principalDiagnosis:{...(context.projections?.grouping?.principalDiagnosis||{})},
    secondaryDiagnoses:(episode.diagnoses?.secondary||[]).map((x)=>({...x})),
    principalProcedure:{...(context.projections?.grouping?.principalProcedure||{})},
    otherProcedures:procedures.slice(1).map((x)=>({...x})),groupingInputSources:inputSources,
    clinicalFactors:{lengthOfStay:null,icuHours:Number(episode.clinicalProcess?.icuHours||0),ventilatorHours:Number(episode.clinicalProcess?.ventilatorHours||0)},
    claimDetails:claimDetails||defaultClaimDetailsFromEpisode(episode),localPaymentParameters:{weight:'',rate:'',score:'',pointValue:'',adjustment:1},
    confirmedMappings:[],preGroupingRun:null,formalGroupingRun:null,auditRun:null,reviewLog:[],revision:1,updatedAt:new Date().toISOString(),
  };
}

export function episodeFromWorkspace(baseEpisode, workspace){
  const e=clone(baseEpisode);const conflicted=(path)=>workspace.groupingInputSources?.[path]?.status==='CONFLICTED';
  e.patient={...e.patient,sex:conflicted('patient.sex')?baseEpisode.patient?.sex:workspace.patient?.sex||'',age:conflicted('patient.age')?baseEpisode.patient?.age:workspace.patient?.age===''?null:Number(workspace.patient?.age??NaN),newbornWeight:workspace.patient?.newbornWeight??null,ageInDays:workspace.patient?.ageInDays??null};
  const originalDiagnosis=baseEpisode.diagnoses?.principal||{};const principal={...(workspace.principalDiagnosis||{})};
  if(conflicted('diagnosis.principal.code'))principal.code=originalDiagnosis.code||'';
  if(conflicted('diagnosis.principal.name'))principal.name=originalDiagnosis.name||'';
  e.diagnoses={...e.diagnoses,principal:principal.code||principal.name?principal:null,secondary:(workspace.secondaryDiagnoses||[]).map((x)=>({...x}))};
  const baseProc=e.procedures?.[0]||{},principalProcedure={...(workspace.principalProcedure||{})};
  if(conflicted('procedure.primary.code'))principalProcedure.code=baseProc.code||'';
  if(conflicted('procedure.primary.name'))principalProcedure.name=baseProc.name||'';
  const p0=principalProcedure.code||principalProcedure.name?{...baseProc,...principalProcedure,role:'primary'}:null;const others=(workspace.otherProcedures||[]).filter((x)=>x.code||x.name).map((x,i)=>({id:x.id||`OP-${i+2}`,...x,role:'other'}));e.procedures=[...(p0?[p0]:[]),...others];
  e.clinicalProcess={...e.clinicalProcess,icuHours:Number(workspace.clinicalFactors?.icuHours||0),ventilatorHours:Number(workspace.clinicalFactors?.ventilatorHours||0)};e.fees={...e.fees,items:(workspace.claimDetails||[]).map((x)=>({category:x.category||'other',name:x.itemName,itemCode:x.itemCode,billingTime:x.billingTime,quantity:Number(x.quantity||0),unitPrice:Number(x.unitPrice||0),amount:Number(x.amount||0),classA:Number(x.classA||0),classB:Number(x.classB||0),selfPay:Number(x.selfPay||0),other:Number(x.other||0),aggregateSource:Boolean(x.aggregateSource)}))};
  const records=e.documentSnapshots||baseEpisode.documentSnapshots||[];e.documentSnapshots=records;e.groupingInputSources=workspace.groupingInputSources||{};e.clinicalFactContext=buildClinicalFactContext({episode:e,documentSnapshots:records});return e;
}
