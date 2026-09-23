import { buildClinicalFactContext } from '../clinical-facts/index.js';

function normalizeSex(value) {const s=String(value||'');if(s==='男'||s==='1')return 1;if(s==='女'||s==='2')return 2;return null;}
function fact(context,concept){return context?.facts?.find((x)=>x.concept===concept&&x.status==='CONFIRMED')||null;}
function refs(x){return x?{factId:x.factId,evidenceRefs:x.evidenceIds,selectedEvidenceId:x.selectedEvidenceId}:null;}

export function buildGroupingSnapshot({ episode, settlement }) {
  const context=episode?.clinicalFactContext||settlement?.clinicalFactContext||buildClinicalFactContext({episode,documentSnapshots:episode?.documentSnapshots||[]});
  const projection=context.projections?.grouping||{};
  const principal = projection.principalDiagnosis || null;
  const secondary = settlement?.inpatient?.secondaryDiagnoses || episode?.diagnoses?.secondary || [];
  const primaryProcedure = projection.principalProcedure || null;
  const otherProcedures = settlement?.procedures?.others || episode?.procedures?.slice?.(1) || [];
  const sexFact=fact(context,'patient.sex'),ageFact=fact(context,'patient.age'),birthFact=fact(context,'patient.birthDate');
  const inputSources=episode?.groupingInputSources||{};
  const sourceStatus=(path,value,sourceFact)=>inputSources[path]||{sourceType:sourceFact?.sourceClass||'UNMAPPED',status:value!==null&&value!==undefined&&value!==''?'CONFIRMED':'MISSING'};
  return {
    snapshotType:'GROUPING_INPUT',episodeId:episode?.episodeId,
    patient:{sex:normalizeSex(sexFact?.value),age:ageFact?.value==null?null:Number(ageFact.value),birthDate:birthFact?.value??null,ageInDays:episode?.patient?.ageInDays??episode?.clinicalProcess?.newbornAgeDays??null,newbornWeight:episode?.patient?.newbornWeight??episode?.clinicalProcess?.newbornWeight??null,factRefs:{sex:refs(sexFact),age:refs(ageFact),birthDate:refs(birthFact)}},
    principalDiagnosis: principal ? { code: principal.code||'', name: principal.name||'', factRefs:principal.factRefs, sourceStatus:{code:sourceStatus('diagnosis.principal.code',principal.code,principal.factRefs?.code),name:sourceStatus('diagnosis.principal.name',principal.name,principal.factRefs?.name)} } : null,
    secondaryDiagnoses: secondary.map((x)=>({code:x.code,name:x.name})),
    principalProcedure: primaryProcedure ? { code: primaryProcedure.code||'', name: primaryProcedure.name||'', factRefs:primaryProcedure.factRefs, sourceStatus:{code:sourceStatus('procedure.primary.code',primaryProcedure.code,primaryProcedure.factRefs?.code),name:sourceStatus('procedure.primary.name',primaryProcedure.name,primaryProcedure.factRefs?.name)} } : null,
    otherProcedures:otherProcedures.map((x)=>({code:x.code,name:x.name})),
    discharge:{method:episode?.discharge?.method||null,at:episode?.discharge?.at||null},
    clinicalFactors:{lengthOfStay:settlement?.inpatient?.lengthOfStay??null,ventilatorDuration:episode?.clinicalProcess?.ventilatorDuration||null,icuStays:episode?.clinicalProcess?.icuStays||[]},
    source:{settlementClaimSerialNumber:settlement?.claimSerialNumber||null,medicalRecordNumber:settlement?.medicalRecordNumber||null,factRevision:context.revision},
    quality:{conflicts:context.conflicts.filter((x)=>x.impactScope.includes('GROUPING')),blockingConflicts:context.conflicts.filter((x)=>x.blocking&&x.impactScope.includes('GROUPING'))},
    provenance:{patient:{sex:sourceStatus('patient.sex',projection.patient?.sex,sexFact),age:sourceStatus('patient.age',projection.patient?.age,ageFact)},principalDiagnosis:principal?.factRefs||null,principalProcedure:primaryProcedure?.factRefs||null},
  };
}
