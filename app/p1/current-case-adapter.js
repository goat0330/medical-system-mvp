import { DOCUMENT_TEMPLATES } from '../data/templates.js';

const clone = (x) => typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x));
const norm = (x) => String(x ?? '').replace(/[\s：:（）()\[\]【】_\-]/g, '').toLowerCase();

function valueByAliases(facts, aliases){
  const wanted=aliases.map(norm);
  let row=facts.find((x)=>wanted.includes(norm(x.keyName)));
  if(!row) row=facts.find((x)=>wanted.some((a)=>norm(x.keyName).includes(a)));
  return row?.keyValue?.trim?.() || '';
}

export function readSavedDocumentSnapshots(episodeId, storage = globalThis.localStorage){
  if(!storage || !episodeId) return [];
  const out=[];
  for(const t of DOCUMENT_TEMPLATES){
    const key=`medical-system:document:${episodeId}:${t.id}`;
    try{
      const raw=storage.getItem(key); if(!raw) continue;
      const record=JSON.parse(raw);
      if(record?.snapshot) out.push({templateId:t.id,templateName:t.name,status:record.status,savedAt:record.savedAt,snapshot:record.snapshot});
    }catch{}
  }
  return out.sort((a,b)=>String(a.savedAt||'').localeCompare(String(b.savedAt||'')));
}

export function extractClinicalFactsFromDocuments(records=[]){
  const facts=records.flatMap((r)=>Array.isArray(r.snapshot?.data)?r.snapshot.data:[]);
  const mainName=valueByAliases(facts,['主要诊断','出院主要诊断','主要诊断名称']);
  const mainCode=valueByAliases(facts,['主要诊断疾病编码','主要诊断代码','疾病编码']);
  const procName=valueByAliases(facts,['主要手术及操作名称','手术名称']);
  const procCode=valueByAliases(facts,['主要手术及操作代码','手术及操作代码']);
  const sex=valueByAliases(facts,['性别']);
  const ageRaw=valueByAliases(facts,['年龄']);
  const ageMatch=String(ageRaw).match(/\d+/);
  const admissionAt=valueByAliases(facts,['入院日期时间','入院时间']);
  const dischargeAt=valueByAliases(facts,['出院日期时间','出院时间']);
  return {
    mainDiagnosis: mainName||mainCode ? {name:mainName,code:mainCode}:null,
    mainProcedure: procName||procCode ? {name:procName,code:procCode}:null,
    sex: sex||null,
    age: ageMatch?Number(ageMatch[0]):null,
    admissionAt: admissionAt||null,
    dischargeAt: dischargeAt||null,
    sourceDocuments: records.map((x)=>({templateId:x.templateId,templateName:x.templateName,savedAt:x.savedAt,status:x.status})),
  };
}

export function applyPatientContext(baseEpisode, context={}){
  const e=clone(baseEpisode);
  if(context.episodeId){
    const serial=String(context.episodeId).split('-').pop()||'001';
    e.episodeId=context.episodeId; e.inpatientNumber=context.episodeId; e.inpatientNo=context.episodeId;
    e.medicalRecordNumber=`BA-${context.episodeId}`; e.claimSerialNumber=`JSQD-${context.episodeId}`;
    e.fees={...e.fees,businessSerialNumber:`FY-${context.episodeId}`,invoiceNumber:`INV-${context.episodeId}`};
    e.patient={...e.patient,patientId:`P-${serial}`};
  }
  if(context.name) e.patient.name=context.name;
  if(context.sex) e.patient.sex=context.sex;
  if(context.age!==null&&context.age!==undefined&&Number.isFinite(Number(context.age))) e.patient.age=Number(context.age);
  if(context.department){e.admission.department=context.department;e.admission.ward=context.department;e.discharge.department=context.department;}
  if(context.bed) e.admission.bed=String(context.bed).replace('床','');
  return e;
}

export function applyDocumentFacts(episode, facts={}){
  const e=clone(episode);
  if(facts.mainDiagnosis?.code || facts.mainDiagnosis?.name){
    e.diagnoses.principal={...e.diagnoses.principal,...facts.mainDiagnosis};
  }
  if(facts.mainProcedure?.code || facts.mainProcedure?.name){
    if(!e.procedures?.length) e.procedures=[{}];
    e.procedures[0]={...e.procedures[0],...facts.mainProcedure,role:'primary'};
  }
  if(facts.sex) e.patient.sex=facts.sex;
  if(facts.age!==null&&facts.age!==undefined&&Number.isFinite(Number(facts.age))) e.patient.age=Number(facts.age);
  if(facts.admissionAt && !Number.isNaN(new Date(facts.admissionAt).getTime())) e.admission.at=facts.admissionAt.replace(' ','T')+(facts.admissionAt.includes('+')?'':'+08:00');
  if(facts.dischargeAt && !Number.isNaN(new Date(facts.dischargeAt).getTime())) e.discharge.at=facts.dischargeAt.replace(' ','T')+(facts.dischargeAt.includes('+')?'':'+08:00');
  e.documentEvidence=(facts.sourceDocuments||[]).map((x)=>x);
  return e;
}

export function defaultClaimDetailsFromEpisode(episode){
  const admissionDate=String(episode?.admission?.at||'').slice(0,10);
  return (episode?.fees?.items||[]).map((x,i)=>({
    id:`CLAIM-${i+1}`,
    category:x.category||'other',
    itemCode:x.itemCode||'',
    itemName:x.name||`费用项目${i+1}`,
    billingTime:x.billingTime||`${admissionDate}T12:00:00+08:00`,
    quantity:Number(x.quantity??x.qty??1),
    unitPrice:Number(x.unitPrice??x.amount??0),
    amount:Number(x.amount??0),
    classA:Number(x.classA??0), classB:Number(x.classB??0), selfPay:Number(x.selfPay??0), other:Number(x.other??0),
    aggregateSource: !(x.itemCode||x.serviceCode),
  }));
}

export function workspaceFromEpisode(episode,{policyProfileId='WH-DRG-3.0',claimDetails=null}={}){
  const p=episode?.procedures||[];
  return {
    episodeId:episode.episodeId,
    policyProfileId,
    patient:{sex:episode.patient?.sex||'',age:Number(episode.patient?.age||0),birthDate:episode.patient?.birthDate||'',newbornWeight:episode.patient?.newbornWeight??null,ageInDays:episode.patient?.ageInDays??null},
    principalDiagnosis:{...(episode.diagnoses?.principal||{})},
    secondaryDiagnoses:(episode.diagnoses?.secondary||[]).map((x)=>({...x})),
    principalProcedure:p[0]?{...p[0]}:{code:'',name:''},
    otherProcedures:p.slice(1).map((x)=>({...x})),
    clinicalFactors:{
      lengthOfStay:null,
      icuHours:Number(episode.clinicalProcess?.icuHours||0),
      ventilatorHours:Number(episode.clinicalProcess?.ventilatorHours||0),
    },
    claimDetails:claimDetails||defaultClaimDetailsFromEpisode(episode),
    localPaymentParameters:{weight:'',rate:'',score:'',pointValue:'',adjustment:1},
    confirmedMappings:[],
    preGroupingRun:null,
    formalGroupingRun:null,
    auditRun:null,
    reviewLog:[],
    revision:1,
    updatedAt:new Date().toISOString(),
  };
}

export function episodeFromWorkspace(baseEpisode, workspace){
  const e=clone(baseEpisode);
  e.patient={...e.patient,sex:workspace.patient?.sex||e.patient.sex,age:Number(workspace.patient?.age??e.patient.age),newbornWeight:workspace.patient?.newbornWeight??null,ageInDays:workspace.patient?.ageInDays??null};
  e.diagnoses={...e.diagnoses,principal:{...workspace.principalDiagnosis},secondary:(workspace.secondaryDiagnoses||[]).map((x)=>({...x}))};
  const baseProc=e.procedures?.[0]||{};
  const p0=workspace.principalProcedure?.code||workspace.principalProcedure?.name?{...baseProc,...workspace.principalProcedure,role:'primary'}:null;
  const others=(workspace.otherProcedures||[]).filter((x)=>x.code||x.name).map((x,i)=>({id:x.id||`OP-${i+2}`,...x,role:'other'}));
  e.procedures=[...(p0?[p0]:[]),...others];
  e.clinicalProcess={...e.clinicalProcess,icuHours:Number(workspace.clinicalFactors?.icuHours||0),ventilatorHours:Number(workspace.clinicalFactors?.ventilatorHours||0)};
  e.fees={...e.fees,items:(workspace.claimDetails||[]).map((x)=>({
    category:x.category||'other',name:x.itemName,itemCode:x.itemCode,billingTime:x.billingTime,quantity:Number(x.quantity||0),unitPrice:Number(x.unitPrice||0),amount:Number(x.amount||0),classA:Number(x.classA||0),classB:Number(x.classB||0),selfPay:Number(x.selfPay||0),other:Number(x.other||0),aggregateSource:Boolean(x.aggregateSource)
  }))};
  return e;
}
