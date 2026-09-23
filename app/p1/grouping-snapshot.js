import { buildClinicalFactContext } from '../clinical-facts/index.js';

function normalizeSex(value) {const s=String(value||'');if(s==='男'||s==='1')return 1;if(s==='女'||s==='2')return 2;return null;}
function fact(context,concept){return context?.facts?.find((x)=>x.concept===concept&&x.status==='CONFIRMED')||null;}
function refs(x){return x?{factId:x.factId,evidenceRefs:x.evidenceIds,selectedEvidenceId:x.selectedEvidenceId}:null;}

export function buildGroupingSnapshot({ episode, settlement }) {
  const context=episode?.clinicalFactContext||settlement?.clinicalFactContext||buildClinicalFactContext({episode,documentSnapshots:episode?.documentSnapshots||[]});
  const principal = settlement?.inpatient?.principalDiagnosis || episode?.diagnoses?.principal || null;
  const secondary = settlement?.inpatient?.secondaryDiagnoses || episode?.diagnoses?.secondary || [];
  const primaryProcedure = settlement?.procedures?.primary || episode?.procedures?.[0] || null;
  const otherProcedures = settlement?.procedures?.others || episode?.procedures?.slice?.(1) || [];
  const sexFact=fact(context,'patient.sex'),ageFact=fact(context,'patient.age'),birthFact=fact(context,'patient.birthDate');
  const dxCode=fact(context,'diagnosis.principal.code'),dxName=fact(context,'diagnosis.principal.name');
  const opCode=fact(context,'procedure.primary.code'),opName=fact(context,'procedure.primary.name');
  return {
    snapshotType:'GROUPING_INPUT',episodeId:episode?.episodeId,
    patient:{sex:normalizeSex(sexFact?.value??episode?.patient?.sex),age:Number(ageFact?.value??episode?.patient?.age??NaN),birthDate:(birthFact?.value??episode?.patient?.birthDate??null),ageInDays:episode?.patient?.ageInDays??episode?.clinicalProcess?.newbornAgeDays??null,newbornWeight:episode?.patient?.newbornWeight??episode?.clinicalProcess?.newbornWeight??null,factRefs:{sex:refs(sexFact),age:refs(ageFact),birthDate:refs(birthFact)}},
    principalDiagnosis: principal ? { code: dxCode?.value??principal.code, name: dxName?.value??principal.name, factRefs:{code:refs(dxCode),name:refs(dxName)} } : null,
    secondaryDiagnoses: secondary.map((x)=>({code:x.code,name:x.name})),
    principalProcedure: primaryProcedure ? { code: opCode?.value??primaryProcedure.code, name: opName?.value??primaryProcedure.name, factRefs:{code:refs(opCode),name:refs(opName)} } : null,
    otherProcedures:otherProcedures.map((x)=>({code:x.code,name:x.name})),
    discharge:{method:episode?.discharge?.method||null,at:episode?.discharge?.at||null},
    clinicalFactors:{lengthOfStay:settlement?.inpatient?.lengthOfStay??null,ventilatorDuration:episode?.clinicalProcess?.ventilatorDuration||null,icuStays:episode?.clinicalProcess?.icuStays||[]},
    source:{settlementClaimSerialNumber:settlement?.claimSerialNumber||null,medicalRecordNumber:settlement?.medicalRecordNumber||null,factRevision:context.revision},
    quality:{conflicts:context.conflicts.filter((x)=>x.impactScope.includes('GROUPING')),blockingConflicts:context.conflicts.filter((x)=>x.blocking&&x.impactScope.includes('GROUPING'))},
  };
}
