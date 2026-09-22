const defineTemplate = (template) => Object.freeze({
  ...template,
  requiredFacts: Object.freeze([...template.requiredFacts]),
  outputFields: Object.freeze(template.outputFields.map((field) => Object.freeze({ ...field }))),
});

const field = (key, label, factPath) => ({ key, label, factPath });

export const HMEDITOR_EXCLUDED_TEMPLATE_NAMES = Object.freeze([
  '会诊记录',
  '接班记录',
  '阶段小结',
  '一般护理记录单',
  '死亡记录',
  '死亡病例讨论记录',
]);

export const HMEDITOR_TEMPLATES = Object.freeze([
  defineTemplate({
    id: 'hm-inpatient-front-page',
    keyCode: 'HM_INPATIENT_FRONT_PAGE',
    templateName: '住院病案首页',
    category: 'front-page',
    source: 'HmEditor',
    enabled: true,
    requiredFacts: [
      'patient',
      'admission',
      'diagnoses.primary',
      'icd.primary',
      'procedures',
      'discharge',
      'costs.total',
    ],
    outputFields: [
      field('patient', '患者基本信息', 'patient'),
      field('admission', '入院信息', 'admission'),
      field('diagnoses', '诊断', 'diagnoses'),
      field('icd', 'ICD 编码', 'icd'),
      field('procedures', '手术/操作', 'procedures'),
      field('discharge', '出院信息', 'discharge'),
      field('costs', '费用与结算', 'costs'),
    ],
  }),
  defineTemplate({
    id: 'hm-admission-record',
    keyCode: 'HM_ADMISSION_RECORD',
    templateName: '入院记录',
    category: 'admission',
    source: 'HmEditor',
    enabled: true,
    requiredFacts: [
      'patient',
      'admission.reason',
      'admission.history',
      'clinical.examination',
      'clinical.investigations',
      'diagnoses.initial',
      'care.plan',
    ],
    outputFields: [
      field('patient', '患者基本信息', 'patient'),
      field('admission', '入院信息', 'admission'),
      field('examination', '体格检查', 'clinical.examination'),
      field('investigations', '辅助检查', 'clinical.investigations'),
      field('initialDiagnosis', '初步诊断', 'diagnoses.initial'),
      field('plan', '诊疗计划', 'care.plan'),
    ],
  }),
  defineTemplate({
    id: 'hm-first-course-record',
    keyCode: 'HM_FIRST_COURSE_RECORD',
    templateName: '首次病程记录',
    category: 'progress',
    source: 'HmEditor',
    enabled: true,
    requiredFacts: [
      'documents.firstCourseRecord',
      'diagnoses.primary',
      'diagnoses.evidence',
      'care.plan',
    ],
    outputFields: [
      field('record', '首次病程事实', 'documents.firstCourseRecord'),
      field('primaryDiagnosis', '主要诊断', 'diagnoses.primary'),
      field('diagnosticBasis', '诊断依据', 'diagnoses.evidence'),
      field('plan', '诊疗计划', 'care.plan'),
    ],
  }),
  defineTemplate({
    id: 'hm-daily-course-record',
    keyCode: 'HM_DAILY_COURSE_RECORD',
    templateName: '日常病程记录',
    category: 'progress',
    source: 'HmEditor',
    enabled: true,
    requiredFacts: [
      'documents.dailyCourseRecords',
      'clinical.progress',
      'treatment.orders',
      'clinical.investigations',
    ],
    outputFields: [
      field('records', '日常病程事实', 'documents.dailyCourseRecords'),
      field('progress', '病情变化', 'clinical.progress'),
      field('orders', '医嘱与执行', 'treatment.orders'),
      field('investigations', '检查结果', 'clinical.investigations'),
    ],
  }),
  defineTemplate({
    id: 'hm-attending-first-round-record',
    keyCode: 'HM_ATTENDING_FIRST_ROUND_RECORD',
    templateName: '主治医生首次查房记录',
    category: 'round',
    source: 'HmEditor',
    enabled: true,
    requiredFacts: [
      'documents.attendingFirstRoundRecord',
      'diagnoses.primary',
      'care.plan',
    ],
    outputFields: [
      field('record', '首次查房事实', 'documents.attendingFirstRoundRecord'),
      field('primaryDiagnosis', '主要诊断', 'diagnoses.primary'),
      field('plan', '查房后计划', 'care.plan'),
    ],
  }),
  defineTemplate({
    id: 'hm-attending-round-record',
    keyCode: 'HM_ATTENDING_ROUND_RECORD',
    templateName: '主治医生查房记录',
    category: 'round',
    source: 'HmEditor',
    enabled: true,
    requiredFacts: [
      'documents.attendingRoundRecords',
      'clinical.progress',
      'care.plan',
    ],
    outputFields: [
      field('records', '查房事实', 'documents.attendingRoundRecords'),
      field('progress', '病情变化', 'clinical.progress'),
      field('plan', '查房后计划', 'care.plan'),
    ],
  }),
  defineTemplate({
    id: 'hm-operation-record',
    keyCode: 'HM_OPERATION_RECORD',
    templateName: '手术记录',
    category: 'operation',
    source: 'HmEditor',
    enabled: true,
    requiredFacts: [
      'documents.operationRecord',
      'diagnoses.primary',
      'procedures',
    ],
    outputFields: [
      field('record', '手术记录事实', 'documents.operationRecord'),
      field('primaryDiagnosis', '主要诊断', 'diagnoses.primary'),
      field('procedures', '手术/操作', 'procedures'),
    ],
  }),
  defineTemplate({
    id: 'hm-preoperative-summary',
    keyCode: 'HM_PREOPERATIVE_SUMMARY',
    templateName: '术前小结',
    category: 'operation',
    source: 'HmEditor',
    enabled: true,
    requiredFacts: [
      'documents.preoperativeSummary',
      'diagnoses.primary',
      'procedures',
    ],
    outputFields: [
      field('summary', '术前小结事实', 'documents.preoperativeSummary'),
      field('primaryDiagnosis', '主要诊断', 'diagnoses.primary'),
      field('plannedProcedures', '拟行手术/操作', 'procedures'),
    ],
  }),
  defineTemplate({
    id: 'hm-discharge-record',
    keyCode: 'HM_DISCHARGE_RECORD',
    templateName: '出院记录',
    category: 'discharge',
    source: 'HmEditor',
    enabled: true,
    requiredFacts: [
      'documents.dischargeRecord',
      'diagnoses.primary',
      'procedures',
      'discharge',
      'care.followUp',
    ],
    outputFields: [
      field('record', '出院记录事实', 'documents.dischargeRecord'),
      field('diagnoses', '出院诊断', 'diagnoses'),
      field('procedures', '住院期间手术/操作', 'procedures'),
      field('discharge', '出院信息', 'discharge'),
      field('followUp', '出院医嘱与随访', 'care.followUp'),
    ],
  }),
  defineTemplate({
    id: 'hm-24h-admission-discharge-record',
    keyCode: 'HM_24H_ADMISSION_DISCHARGE_RECORD',
    templateName: '24小时内入出院记录',
    category: 'discharge',
    source: 'HmEditor',
    enabled: false,
    requiredFacts: ['admission', 'discharge', 'diagnoses.primary'],
    outputFields: [
      field('admission', '入院信息', 'admission'),
      field('discharge', '出院信息', 'discharge'),
      field('primaryDiagnosis', '主要诊断', 'diagnoses.primary'),
    ],
  }),
]);

export function getHmEditorTemplate(templateIdOrKeyCode) {
  return HMEDITOR_TEMPLATES.find(
    (template) => template.id === templateIdOrKeyCode || template.keyCode === templateIdOrKeyCode,
  );
}

export function listEnabledHmEditorTemplates() {
  return HMEDITOR_TEMPLATES.filter((template) => template.enabled);
}
