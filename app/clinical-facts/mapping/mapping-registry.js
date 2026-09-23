const n = (v) => String(v ?? '').replace(/[\s：:（）()【】\[\]_-]/g, '').toLowerCase();

const entry = (concept, config = {}) => Object.freeze({
  concept,
  kind: 'scalar',
  critical: false,
  conflictPolicy: 'exact',
  impactScope: [],
  sourcePriority: ['FACT_DECISION', 'FRONTPAGE', 'DISCHARGE', 'SURGERY', 'PROGRESS', 'ADMISSION', 'EPISODE'],
  ...config,
});

export const CLINICAL_MAPPING_REGISTRY = Object.freeze([
  entry('patient.name', { settlementPath: 'patient.name', codes: ['DE02.01.039.00'], aliases: ['姓名', '患者姓名'] }),
  entry('patient.sex', { settlementPath: 'patient.sex', codes: ['DE02.01.040.00'], aliases: ['性别'], critical: true, impactScope: ['FRONTPAGE','SETTLEMENT','GROUPING','AUDIT'] }),
  entry('patient.birthDate', { settlementPath: 'patient.birthDate', codes: ['DE02.01.005.01'], aliases: ['出生日期'], critical: true, impactScope: ['FRONTPAGE','SETTLEMENT','GROUPING','AUDIT'] }),
  entry('patient.age', { settlementPath: 'patient.age', codes: ['DE02.01.026.00'], aliases: ['年龄'], critical: true, conflictPolicy: 'numeric', impactScope: ['FRONTPAGE','SETTLEMENT','GROUPING','AUDIT'] }),
  entry('patient.nationality', { settlementPath: 'patient.nationality', codes: [], aliases: ['国籍'] }),
  entry('patient.ethnicity', { settlementPath: 'patient.ethnicity', codes: [], aliases: ['民族'] }),
  entry('patient.occupation', { settlementPath: 'patient.occupation', codes: [], aliases: ['职业', '职业类别代码'] }),
  entry('patient.currentAddress', { settlementPath: 'patient.currentAddress', codes: ['DE02.01.009.00'], aliases: ['现住址', '现住地址'] }),
  entry('episode.medicalRecordNumber', { settlementPath: 'medicalRecordNumber', codes: ['DE01.00.004.00'], aliases: ['病案号'] }),
  entry('episode.inpatientNumber', { settlementPath: 'inpatientNumber', codes: ['DE01.00.014.00'], aliases: ['住院号'] }),
  entry('admission.at', { settlementPath: 'inpatient.admissionAt', codes: ['DE06.00.092.00'], aliases: ['入院时间', '入院日期时间'], critical: true, conflictPolicy: 'datetime', impactScope: ['SETTLEMENT','GROUPING','AUDIT'] }),
  entry('discharge.at', { settlementPath: 'inpatient.dischargeAt', codes: ['DE06.00.017.00'], aliases: ['出院时间', '出院日期时间'], critical: true, conflictPolicy: 'datetime', impactScope: ['SETTLEMENT','GROUPING','AUDIT'] }),
  entry('admission.department', { settlementPath: 'inpatient.admissionDepartment', codes: ['DE08.10.026.00.001'], aliases: ['入院科别', '科室名称'] }),
  entry('discharge.department', { settlementPath: 'inpatient.dischargeDepartment', codes: ['DE08.10.026.00.002'], aliases: ['出院科别'] }),
  entry('admission.source', { settlementPath: 'inpatient.admissionSource', codes: ['SETTLEMENT.inpatient.admissionSource'], aliases: ['入院途径'] }),
  entry('admission.medicalType', { settlementPath: 'inpatient.medicalType', codes: ['SETTLEMENT.inpatient.medicalType'], aliases: ['住院医疗类型'] }),
  entry('admission.treatmentCategory', { settlementPath: 'inpatient.treatmentCategory', codes: ['SETTLEMENT.inpatient.treatmentCategory'], aliases: ['治疗类别'] }),
  entry('discharge.method', { settlementPath: 'discharge.method', codes: ['SETTLEMENT.discharge.method'], aliases: ['离院方式', '出院方式'] }),
  entry('diagnosis.principal.name', {
    settlementPath: 'inpatient.principalDiagnosis.name', codes: ['DE05.10.172.00'],
    aliases: ['主要诊断', '出院主要诊断', '主要诊断名称'], critical: true,
    sourcePriority: ['FACT_DECISION','FRONTPAGE','DISCHARGE','EPISODE'],
    impactScope: ['FRONTPAGE','SETTLEMENT','GROUPING','AUDIT']
  }),
  entry('diagnosis.principal.code', {
    settlementPath: 'inpatient.principalDiagnosis.code', codes: ['DE05.01.024.00'],
    aliases: ['主要诊断代码', '主要诊断疾病编码', '疾病编码'], critical: true,
    sourcePriority: ['FACT_DECISION','FRONTPAGE','DISCHARGE','EPISODE'],
    impactScope: ['FRONTPAGE','SETTLEMENT','GROUPING','AUDIT']
  }),
  entry('procedure.primary.name', {
    settlementPath: 'procedures.primary.name', codes: ['DE06.00.094.00.005'], aliases: ['主要手术及操作名称', '手术名称'],
    critical: true, sourcePriority: ['FACT_DECISION','FRONTPAGE','SURGERY','DISCHARGE','EPISODE'], impactScope: ['FRONTPAGE','SETTLEMENT','GROUPING','AUDIT']
  }),
  entry('procedure.primary.code', {
    settlementPath: 'procedures.primary.code', codes: ['DE06.00.093.00'], aliases: ['主要手术及操作代码', '手术及操作代码'],
    critical: true, sourcePriority: ['FACT_DECISION','FRONTPAGE','SURGERY','DISCHARGE','EPISODE'], impactScope: ['FRONTPAGE','SETTLEMENT','GROUPING','AUDIT']
  }),
  entry('procedure.primary.anesthesiaType', { settlementPath: 'procedures.primary.anesthesiaType', codes: ['DE06.00.073.00'], aliases: ['麻醉方式', '麻醉方式代码'] }),
  entry('procedure.primary.operator.name', { settlementPath: 'procedures.primary.operator.name', codes: ['DE02.01.039.00.161'], aliases: ['手术者姓名', '术者姓名'] }),
  entry('procedure.primary.anesthesiologist.name', { settlementPath: 'procedures.primary.anesthesiologist.name', codes: ['DE02.01.039.00.155'], aliases: ['麻醉医师姓名'] }),
]);

export const MAPPING_BY_CONCEPT = Object.freeze(Object.fromEntries(CLINICAL_MAPPING_REGISTRY.map((x) => [x.concept, x])));
export const MAPPING_BY_SETTLEMENT_PATH = Object.freeze(Object.fromEntries(CLINICAL_MAPPING_REGISTRY.filter((x) => x.settlementPath).map((x) => [x.settlementPath, x])));

export function sourceClassForDocument(templateId = '') {
  const id = String(templateId || '').toLowerCase();
  if (id === 'frontpage') return 'FRONTPAGE';
  if (id === 'discharge') return 'DISCHARGE';
  if (id === 'surgery' || id === 'preop') return 'SURGERY';
  if (id.includes('progress') || id.includes('round')) return 'PROGRESS';
  if (id === 'admission') return 'ADMISSION';
  return 'DOCUMENT';
}

export function registryEntryForField({ keyCode = '', keyName = '', templateId = '' } = {}) {
  const code = String(keyCode || '');
  const name = n(keyName);
  const sourceClass = sourceClassForDocument(templateId);
  const matches = CLINICAL_MAPPING_REGISTRY.filter((mapping) => {
    if (mapping.codes?.includes(code)) return true;
    return (mapping.aliases || []).some((alias) => n(alias) === name);
  });
  if (!matches.length) return null;
  const sourceAllowed = (mapping) => {
    if (!mapping.sourcePriority) return true;
    if (!['diagnosis.principal.name','diagnosis.principal.code','procedure.primary.name','procedure.primary.code'].includes(mapping.concept)) return true;
    return mapping.sourcePriority.includes(sourceClass) || sourceClass === 'DOCUMENT';
  };
  return matches.find(sourceAllowed) || matches[0];
}

export function registryEntryForConcept(concept) {
  return MAPPING_BY_CONCEPT[concept] || null;
}

export function settlementPathForConcept(concept) {
  return MAPPING_BY_CONCEPT[concept]?.settlementPath || null;
}

export function normalizeMappedValue(concept, value) {
  if (value && typeof value === 'object') value = value.value ?? value.code ?? value.text ?? '';
  const raw = String(value ?? '').trim();
  if (concept === 'patient.age') {
    const m = raw.match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
  }
  if (concept === 'patient.sex') {
    if (['1', '男'].includes(raw)) return '男';
    if (['2', '女'].includes(raw)) return '女';
    return raw;
  }
  if (concept.endsWith('.at')) {
    const d = new Date(raw.replace(' ', 'T'));
    return Number.isFinite(d.getTime()) ? d.toISOString() : raw;
  }
  return raw;
}
