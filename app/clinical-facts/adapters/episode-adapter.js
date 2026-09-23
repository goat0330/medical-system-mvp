import { createEvidenceItem } from '../models/evidence.js';
import { normalizeMappedValue } from '../mapping/mapping-registry.js';

function ev(episode, suffix, concept, value, factPath, title) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return createEvidenceItem({
    evidenceId: `EV-EP-${episode.episodeId}-${suffix}`,
    episodeId: episode.episodeId,
    patientId: episode.patient?.patientId || null,
    sourceType: 'EPISODE',
    sourceClass: 'EPISODE',
    sourceId: factPath,
    sourceVersion: episode.datasetVersion || episode.revision || 'episode-current',
    concept,
    value: normalizeMappedValue(concept, value),
    excerpt: `${title}：${typeof value === 'object' ? JSON.stringify(value) : value}`,
    factPath,
    structuredValue: value,
  });
}

export function evidenceFromEpisode(episode) {
  const p = episode?.patient || {};
  const a = episode?.admission || {};
  const d = episode?.discharge || {};
  const dx = episode?.diagnoses?.principal || {};
  const op = episode?.procedures?.[0] || {};
  return [
    ev(episode,'PATIENT-NAME','patient.name',p.name,'patient.name','姓名'),
    ev(episode,'SEX','patient.sex',p.sex,'patient.sex','性别'),
    ev(episode,'BIRTH','patient.birthDate',p.birthDate,'patient.birthDate','出生日期'),
    ev(episode,'AGE','patient.age',p.age,'patient.age','年龄'),
    ev(episode,'NATIONALITY','patient.nationality',p.nationality,'patient.nationality','国籍'),
    ev(episode,'ETHNICITY','patient.ethnicity',p.ethnicity,'patient.ethnicity','民族'),
    ev(episode,'OCCUPATION','patient.occupation',p.occupation,'patient.occupation','职业'),
    ev(episode,'ADDRESS','patient.currentAddress',p.currentAddress,'patient.currentAddress','现住址'),
    ev(episode,'MRN','episode.medicalRecordNumber',episode.medicalRecordNumber,'medicalRecordNumber','病案号'),
    ev(episode,'IPN','episode.inpatientNumber',episode.inpatientNumber,'inpatientNumber','住院号'),
    ev(episode,'ADM-AT','admission.at',a.at,'admission.at','入院时间'),
    ev(episode,'DIS-AT','discharge.at',d.at,'discharge.at','出院时间'),
    ev(episode,'ADM-DEPT','admission.department',a.department,'admission.department','入院科室'),
    ev(episode,'DIS-DEPT','discharge.department',d.department,'discharge.department','出院科室'),
    ev(episode,'ADM-SOURCE','admission.source',a.source,'admission.source','入院途径'),
    ev(episode,'MED-TYPE','admission.medicalType',a.medicalType,'admission.medicalType','医疗类型'),
    ev(episode,'TREAT-TYPE','admission.treatmentCategory',a.treatmentCategory,'admission.treatmentCategory','治疗类别'),
    ev(episode,'DIS-METHOD','discharge.method',d.method,'discharge.method','离院方式'),
    ev(episode,'DX-NAME','diagnosis.principal.name',dx.name,'diagnoses.principal.name','主要诊断'),
    ev(episode,'DX-CODE','diagnosis.principal.code',dx.code,'diagnoses.principal.code','主要诊断代码'),
    ev(episode,'OP-NAME','procedure.primary.name',op.name,'procedures[0].name','主要手术/操作'),
    ev(episode,'OP-CODE','procedure.primary.code',op.code,'procedures[0].code','主要手术/操作代码'),
    ev(episode,'ANESTHESIA','procedure.primary.anesthesiaType',op.anesthesiaType,'procedures[0].anesthesiaType','麻醉方式'),
    ev(episode,'OPERATOR','procedure.primary.operator.name',op.operator?.name,'procedures[0].operator.name','术者'),
    ev(episode,'ANESTHESIOLOGIST','procedure.primary.anesthesiologist.name',op.anesthesiologist?.name,'procedures[0].anesthesiologist.name','麻醉医师'),
  ].filter(Boolean);
}
