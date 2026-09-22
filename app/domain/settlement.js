import {
  SETTLEMENT_FIELD_GROUPS,
  SETTLEMENT_MAPPING_METADATA,
} from "../data/settlement-fields.js";

const INSURANCE_PAYMENT_KEYS = [
  "medical_insurance_fund",
  "employee_large_amount_subsidy",
  "supplemental_medical_insurance",
  "resident_critical_illness_insurance",
  "civil_servant_medical_subsidy",
  "medical_assistance",
  "enterprise_supplemental",
  "commercial_insurance",
  "other_payment",
];

const INDIVIDUAL_PAYMENT_KEYS = [
  "individual_self_pay",
  "individual_account",
  "individual_cash",
];

const ALL_PAYMENT_KEYS = [...INSURANCE_PAYMENT_KEYS, ...INDIVIDUAL_PAYMENT_KEYS];

const FEE_CATEGORY_ALIASES = [
  ["bed_fee", /床位|bed/iu],
  ["consultation_fee", /诊察|consult|doctor/iu],
  ["examination_fee", /检查|exam|inspection/iu],
  ["laboratory_fee", /化验|检验|lab|test/iu],
  ["treatment_fee", /治疗|treatment/iu],
  ["surgery_fee", /手术|操作|surgery/iu],
  ["nursing_fee", /护理|nursing/iu],
  ["medical_material_fee", /卫生材料|耗材|material/iu],
  ["western_medicine_fee", /西药|western.?medicine/iu],
  ["chinese_medicine_fee", /中药饮片|herbal/iu],
  ["patent_medicine_fee", /中成药|patent.?medicine/iu],
  ["general_service_fee", /一般诊疗|general.?service/iu],
  ["registration_fee", /挂号|registration/iu],
  ["disease_based_fee", /按病种|病种收费|disease.?based/iu],
];

const EMPTY_PAYMENT_SPLIT = Object.fromEntries(ALL_PAYMENT_KEYS.map((key) => [key, 0]));

const hasValue = (value) => value !== undefined && value !== null && value !== "";

const textOrNull = (value) => {
  if (!hasValue(value)) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
};

const firstDefined = (...values) => values.find(hasValue);

const asObject = (value) => (
  value && typeof value === "object" && !Array.isArray(value) ? value : {}
);

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
};

const readPath = (root, path) => {
  if (!root || !hasValue(path)) return undefined;
  return String(path).split(".").reduce((current, segment) => (
    current === undefined || current === null ? undefined : current[segment]
  ), root);
};

const pickFrom = (roots, paths) => {
  for (const root of roots) {
    if (!root || typeof root !== "object") continue;
    for (const path of paths) {
      const value = readPath(root, path);
      if (hasValue(value)) return value;
    }
  }
  return undefined;
};

const objectFrom = (...values) => values.map(asObject).find((value) => Object.keys(value).length) || {};

const parseMoneyCents = (value) => {
  if (!hasValue(value)) return null;
  if (typeof value === "object" && value !== null) {
    return parseMoneyCents(firstDefined(value.amount, value.value, value.total));
  }
  const numeric = typeof value === "number"
    ? value
    : Number(String(value).replace(/[¥￥,\s]/g, ""));
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : null;
};

const money = (cents) => (cents === null || cents === undefined ? null : Number((cents / 100).toFixed(2)));

const sumCents = (values) => values.reduce((sum, value) => {
  const cents = parseMoneyCents(value);
  return sum + (cents === null ? 0 : cents);
}, 0);

const readMoney = (roots, paths, fallback = 0) => {
  const cents = parseMoneyCents(pickFrom(roots, paths));
  return money(cents === null ? fallback : cents);
};

const normalizeDate = (value) => {
  if (!hasValue(value)) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  return String(value);
};

const parseDate = (value) => {
  if (!hasValue(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const daysBetween = (start, end) => {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate || !endDate) return null;
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));
};

const clone = (value) => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      if (value[key] !== undefined) result[key] = stableValue(value[key]);
      return result;
    }, {});
  }
  return value;
};

const stableStringify = (value) => JSON.stringify(stableValue(value));

const shortHash = (value) => {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const normalizePerson = (value) => {
  if (!hasValue(value)) return null;
  if (typeof value !== "object") return { name: textOrNull(value), code: null };
  return {
    name: textOrNull(firstDefined(value.name, value.personName, value.displayName)),
    code: textOrNull(firstDefined(value.code, value.personCode, value.id)),
  };
};

const normalizeDuration = (value) => {
  if (!hasValue(value)) return null;
  if (typeof value !== "object") return value;
  return {
    days: firstDefined(value.days, value.day, null),
    hours: firstDefined(value.hours, value.hour, null),
    minutes: firstDefined(value.minutes, value.minute, null),
  };
};

const evidenceRefs = (value, fallback) => {
  const refs = asArray(value).map(textOrNull).filter(Boolean);
  return refs.length ? refs : [fallback];
};

const normalizeDiagnosis = (raw, index, fallbackRef) => {
  const item = asObject(raw);
  const primitiveName = typeof raw === "string" ? raw : null;
  const role = textOrNull(firstDefined(
    item.role,
    item.type,
    item.diagnosisType,
    item.diagnosis_type,
    item.isPrimary || item.primary ? "principal" : null,
  ));
  return {
    diagnosis_id: textOrNull(firstDefined(item.id, item.diagnosisId, item.diagnosis_id)),
    code: textOrNull(firstDefined(item.code, item.icdCode, item.icd10Code, item.diseaseCode, item.disease_code)),
    name: textOrNull(firstDefined(item.name, item.diagnosisName, item.diagnosis_name, item.description, primitiveName)),
    role,
    condition_at_admission: textOrNull(firstDefined(
      item.conditionAtAdmission,
      item.condition_at_admission,
      item.admissionCondition,
    )),
    evidence_refs: evidenceRefs(
      firstDefined(item.evidenceRefs, item.evidence_refs, item.sourceRefs, item.source_refs),
      `${fallbackRef}:diagnosis:${index + 1}`,
    ),
  };
};

const normalizeProcedure = (raw, index, fallbackRef) => {
  const item = asObject(raw);
  const period = objectFrom(item.period, item.timeRange, item.time_range);
  return {
    procedure_id: textOrNull(firstDefined(item.id, item.procedureId, item.procedure_id, item.operationId)),
    code: textOrNull(firstDefined(item.code, item.procedureCode, item.procedure_code, item.operationCode)),
    name: textOrNull(firstDefined(item.name, item.procedureName, item.procedure_name, item.operationName)),
    role: textOrNull(firstDefined(
      item.role,
      item.type,
      item.procedureType,
      item.isPrimary || item.primary ? "primary" : null,
    )),
    operator: normalizePerson(firstDefined(item.operator, item.surgeon, item.operatorName, item.operator_name)),
    anesthesiologist: normalizePerson(firstDefined(
      item.anesthesiologist,
      item.anesthetist,
      item.anesthesiologistName,
      item.anesthesiologist_name,
    )),
    anesthesia_type: textOrNull(firstDefined(item.anesthesiaType, item.anesthesia_type, item.anesthesia)),
    start_at: normalizeDate(firstDefined(item.startAt, item.start_at, item.startedAt, period.startAt, period.start_at)),
    end_at: normalizeDate(firstDefined(item.endAt, item.end_at, item.finishedAt, period.endAt, period.end_at)),
    anesthesia_start_at: normalizeDate(firstDefined(item.anesthesiaStartAt, item.anesthesia_start_at, period.anesthesiaStartAt)),
    anesthesia_end_at: normalizeDate(firstDefined(item.anesthesiaEndAt, item.anesthesia_end_at, period.anesthesiaEndAt)),
    evidence_refs: evidenceRefs(
      firstDefined(item.evidenceRefs, item.evidence_refs, item.sourceRefs, item.source_refs),
      `${fallbackRef}:procedure:${index + 1}`,
    ),
  };
};

const normalizeDiagnosisField = (value, fallbackRef) => {
  if (!hasValue(value)) return null;
  if (Array.isArray(value)) return value.map((item, index) => normalizeDiagnosis(item, index, fallbackRef));
  return normalizeDiagnosis(value, 0, fallbackRef);
};

const normalizeFeeCategory = (value, name) => {
  const source = String(firstDefined(value, name, "other_fee"));
  const canonical = source.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (canonical.endsWith("_fee")) return canonical;
  const match = FEE_CATEGORY_ALIASES.find(([, expression]) => expression.test(source));
  return match ? match[0] : "other_fee";
};

const normalizeFeeItem = (raw, index, fallbackRef) => {
  const item = asObject(raw);
  const name = textOrNull(firstDefined(item.name, item.itemName, item.item_name, item.chargeName, item.charge_name));
  const quantity = firstDefined(item.quantity, item.qty, null);
  const unitPriceCents = parseMoneyCents(firstDefined(item.unitPrice, item.unit_price, item.price));
  const directAmountCents = parseMoneyCents(firstDefined(item.amount, item.total, item.subtotal, item.totalAmount, item.total_amount));
  const calculatedAmountCents = directAmountCents === null && unitPriceCents !== null && hasValue(quantity)
    ? Math.round(unitPriceCents * Number(quantity))
    : directAmountCents;
  const coverage = objectFrom(item.coverage, item.breakdown, item.amounts);
  const coverageValues = {
    class_a_amount: parseMoneyCents(firstDefined(coverage.classA, coverage.class_a, coverage.class_a_amount, item.classA, item.class_a)),
    class_b_amount: parseMoneyCents(firstDefined(coverage.classB, coverage.class_b, coverage.class_b_amount, item.classB, item.class_b)),
    self_pay_amount: parseMoneyCents(firstDefined(coverage.selfPay, coverage.self_pay, coverage.self_pay_amount, item.selfPay, item.self_pay)),
    other_amount: parseMoneyCents(firstDefined(coverage.other, coverage.other_amount, item.other)),
  };
  return {
    fee_item_id: textOrNull(firstDefined(item.id, item.feeItemId, item.fee_item_id, item.chargeId)),
    name,
    category: normalizeFeeCategory(firstDefined(item.category, item.feeCategory, item.fee_category), name),
    quantity,
    unit_price: money(unitPriceCents),
    amount: money(calculatedAmountCents),
    breakdown: Object.fromEntries(Object.entries(coverageValues).map(([key, value]) => [key, money(value)])),
    evidence_refs: evidenceRefs(
      firstDefined(item.evidenceRefs, item.evidence_refs, item.sourceRefs, item.source_refs),
      `${fallbackRef}:fee:${index + 1}`,
    ),
  };
};

const periodForDisplay = (item) => {
  if (!item) return null;
  const start = item.start_at || item.admission_at || null;
  const end = item.end_at || item.discharge_at || null;
  return start || end ? { start_at: start, end_at: end } : null;
};

const collectSourceObjects = (...values) => values.filter((value) => value && typeof value === "object");

const readAmountFromRoots = (roots, paths) => readMoney(roots, paths, 0);

const makeDisplayValue = (value) => {
  if (value === undefined || value === null || value === "") return "未填写";
  if (Array.isArray(value)) return value.length ? value.map(makeDisplayValue).join("；") : "无";
  if (typeof value === "object") {
    if (hasValue(value.name) || hasValue(value.code)) {
      return [value.name, value.code].filter(hasValue).join(" / ") || "未填写";
    }
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
};

const valueAtPath = (root, path) => readPath(root, path);

const createDisplayGroups = (list) => SETTLEMENT_FIELD_GROUPS.map((group) => ({
  id: group.id,
  title: group.label,
  page: group.page,
  mapping_status: group.mapping_status,
  official_interface_field_status: group.official_interface_field_status,
  fields: group.fields.map((field) => ({
    field: field.id,
    field_id: field.id,
    label: field.label,
    value: makeDisplayValue(valueAtPath(list, field.path)),
    source: `第${group.page}页版式语义映射 · 官方接口字段待核验`,
    evidence_refs: [`pdf:page:${group.page}`, `field:${field.id}`],
  })),
}));

const issue = (severity, code, field, message, evidence = []) => ({
  severity,
  code,
  field,
  message,
  evidenceRefs: Array.from(new Set(evidence.filter(Boolean))),
});

const refsFor = (list, ...extra) => [
  ...asArray(list?.provenance?.evidence_refs),
  list?.settlement_list_id ? `settlement_list:${list.settlement_list_id}` : "settlement_list:unknown",
  ...extra,
].filter(Boolean);

const finalizeIssues = (issues) => {
  const valid = !issues.some((item) => item.severity === "error");
  Object.defineProperty(issues, "valid", { value: valid, enumerable: false });
  Object.defineProperty(issues, "issues", { value: issues, enumerable: false });
  Object.defineProperty(issues, "summary", {
    value: {
      valid,
      error_count: issues.filter((item) => item.severity === "error").length,
      warning_count: issues.filter((item) => item.severity === "warning").length,
    },
    enumerable: false,
  });
  return issues;
};

const canonicalDiagnosisKey = (item) => {
  if (!item) return null;
  return textOrNull(firstDefined(item.diagnosis_id, item.code, item.name));
};

const canonicalProcedureKey = (item) => {
  if (!item) return null;
  return textOrNull(firstDefined(item.procedure_id, item.code, item.name));
};

const compareSet = (left, right) => {
  const a = new Set(left.map(canonicalDiagnosisKey).filter(Boolean));
  const b = new Set(right.map(canonicalDiagnosisKey).filter(Boolean));
  return a.size === b.size && [...a].every((value) => b.has(value));
};

const compareProcedureSet = (left, right) => {
  const a = new Set(left.map(canonicalProcedureKey).filter(Boolean));
  const b = new Set(right.map(canonicalProcedureKey).filter(Boolean));
  return a.size === b.size && [...a].every((value) => b.has(value));
};

const outputIdentifierEntries = (identity) => [
  ["patient_id_number", identity.patient_id_number],
  ["insurance_number", identity.insurance_number],
  ["medical_record_number", identity.medical_record_number],
  ["inpatient_number", identity.inpatient_number],
  ["claim_serial_number", identity.claim_serial_number],
];

export function buildSettlementList(episode = {}) {
  const source = asObject(episode);
  const patient = objectFrom(source.patient, source.patientInfo, source.patient_info, source.demographics);
  const identity = objectFrom(source.identity, source.identifiers);
  const admission = objectFrom(source.admission, source.hospitalization, source.visit);
  const dischargeSource = objectFrom(source.discharge, source.hospitalization, source.visit);
  const insurance = objectFrom(source.insurance, source.coverage, source.insuranceInfo, source.insurance_info);
  const institution = objectFrom(source.institution, source.hospital, source.provider);
  const episodeId = textOrNull(firstDefined(
    source.id,
    source.episodeId,
    source.episode_id,
    source.visitId,
    source.visit_id,
  ));
  const fallbackRef = `episode:${episodeId || "unknown"}`;

  const admissionAt = normalizeDate(firstDefined(
    admission.at,
    admission.admittedAt,
    admission.admissionAt,
    admission.admission_at,
    admission.dateTime,
    admission.datetime,
    source.admissionAt,
    source.admission_at,
    source.admitDatetime,
    source.admitDate,
  ));
  const dischargeAt = normalizeDate(firstDefined(
    dischargeSource.at,
    dischargeSource.dischargedAt,
    dischargeSource.dischargeAt,
    dischargeSource.discharge_at,
    dischargeSource.dateTime,
    dischargeSource.datetime,
    source.dischargeAt,
    source.discharge_at,
    source.dischargeDatetime,
    source.dischargeDate,
  ));

  const identityVisit = {
    patient_internal_id: textOrNull(firstDefined(patient.id, patient.patientId, patient.patient_id, source.patientId, source.patient_id)),
    patient_name: textOrNull(firstDefined(patient.name, patient.patientName, patient.patient_name, source.patientName, source.patient_name)),
    gender: textOrNull(firstDefined(patient.gender, patient.sex, source.gender, source.sex)),
    birth_date: normalizeDate(firstDefined(patient.birthDate, patient.birth_date, source.birthDate, source.birth_date)),
    age: firstDefined(patient.age, source.age, null),
    nationality: textOrNull(firstDefined(patient.nationality, source.nationality)),
    ethnicity: textOrNull(firstDefined(patient.ethnicity, patient.nation, source.ethnicity, source.nation)),
    patient_id_type: textOrNull(firstDefined(
      patient.idType,
      patient.id_type,
      patient.certificateType,
      patient.certificate_type,
      identity.patientIdType,
      identity.patient_id_type,
      source.patientIdType,
      source.patient_id_type,
    )),
    patient_id_number: textOrNull(firstDefined(
      patient.idNumber,
      patient.id_number,
      patient.certificateNumber,
      patient.certificate_number,
      identity.patientIdNumber,
      identity.patient_id_number,
      source.patientIdNumber,
      source.patient_id_number,
    )),
    occupation: textOrNull(firstDefined(patient.occupation, source.occupation)),
    current_address: textOrNull(firstDefined(patient.currentAddress, patient.current_address, source.currentAddress, source.current_address)),
    employer_name: textOrNull(firstDefined(patient.employerName, patient.employer_name, source.employerName, source.employer_name)),
    employer_address: textOrNull(firstDefined(patient.employerAddress, patient.employer_address, source.employerAddress, source.employer_address)),
    employer_phone: textOrNull(firstDefined(patient.employerPhone, patient.employer_phone, source.employerPhone, source.employer_phone)),
    postal_code: textOrNull(firstDefined(patient.postalCode, patient.postal_code, source.postalCode, source.postal_code)),
    contact_name: textOrNull(firstDefined(patient.contactName, patient.contact_name, source.contactName, source.contact_name)),
    contact_relationship: textOrNull(firstDefined(patient.contactRelationship, patient.contact_relationship, source.contactRelationship, source.contact_relationship)),
    contact_address: textOrNull(firstDefined(patient.contactAddress, patient.contact_address, source.contactAddress, source.contact_address)),
    contact_phone: textOrNull(firstDefined(patient.contactPhone, patient.contact_phone, source.contactPhone, source.contact_phone)),
    insurance_number: textOrNull(firstDefined(
      insurance.number,
      insurance.insuranceNumber,
      insurance.insurance_number,
      identity.insuranceNumber,
      identity.insurance_number,
      source.insuranceNumber,
      source.insurance_number,
      source.medicalInsuranceNumber,
    )),
    insurance_type: textOrNull(firstDefined(insurance.type, insurance.insuranceType, insurance.insurance_type, source.insuranceType, source.insurance_type)),
    special_person_type: textOrNull(firstDefined(insurance.specialPersonType, insurance.special_person_type, source.specialPersonType, source.special_person_type)),
    insurance_region: textOrNull(firstDefined(insurance.region, insurance.insuranceRegion, insurance.insurance_region, source.insuranceRegion, source.insurance_region)),
    newborn_admission_type: textOrNull(firstDefined(source.newbornAdmissionType, source.newborn_admission_type)),
    newborn_birth_weight_g: firstDefined(source.newbornBirthWeightG, source.newborn_birth_weight_g, null),
    newborn_admission_weight_g: firstDefined(source.newbornAdmissionWeightG, source.newborn_admission_weight_g, null),
    claim_serial_number: textOrNull(firstDefined(source.claimSerialNumber, source.claim_serial_number, source.listSerialNumber, source.list_serial_number)),
    medical_record_number: textOrNull(firstDefined(source.medicalRecordNumber, source.medical_record_number, source.medicalRecordNo, source.medical_record_no)),
    inpatient_number: textOrNull(firstDefined(source.inpatientNumber, source.inpatient_number, source.inpatientNo, source.inpatient_no)),
    medical_treatment_type: textOrNull(firstDefined(admission.medicalTreatmentType, admission.medical_treatment_type, source.medicalTreatmentType, source.medical_treatment_type, "住院")),
    admission_source: textOrNull(firstDefined(admission.source, admission.admissionSource, admission.admission_source, source.admissionSource, source.admission_source)),
    treatment_category: textOrNull(firstDefined(admission.treatmentCategory, admission.treatment_category, source.treatmentCategory, source.treatment_category)),
    admission_at: admissionAt,
    admission_department: textOrNull(firstDefined(admission.department, admission.admissionDepartment, admission.admission_department, source.department, source.admissionDepartment, source.admission_department)),
    transfer_departments: asArray(firstDefined(admission.transferDepartments, admission.transfer_departments, source.transferDepartments, source.transfer_departments)).map(textOrNull).filter(Boolean),
    discharge_at: dischargeAt,
    discharge_department: textOrNull(firstDefined(dischargeSource.department, dischargeSource.dischargeDepartment, dischargeSource.discharge_department, source.dischargeDepartment, source.discharge_department)),
    length_of_stay_days: firstDefined(
      admission.lengthOfStayDays,
      admission.length_of_stay_days,
      dischargeSource.lengthOfStayDays,
      dischargeSource.length_of_stay_days,
      source.lengthOfStayDays,
      source.length_of_stay_days,
      daysBetween(admissionAt, dischargeAt),
      null,
    ),
    outpatient_special_disease: {
      department: textOrNull(firstDefined(source.outpatientSpecialDisease?.department, source.outpatient_special_disease?.department)),
      visit_at: normalizeDate(firstDefined(source.outpatientSpecialDisease?.visitAt, source.outpatient_special_disease?.visit_at)),
      disease_name: textOrNull(firstDefined(source.outpatientSpecialDisease?.diseaseName, source.outpatient_special_disease?.disease_name)),
      disease_code: textOrNull(firstDefined(source.outpatientSpecialDisease?.diseaseCode, source.outpatient_special_disease?.disease_code)),
      procedure_name: textOrNull(firstDefined(source.outpatientSpecialDisease?.procedureName, source.outpatient_special_disease?.procedure_name)),
      procedure_code: textOrNull(firstDefined(source.outpatientSpecialDisease?.procedureCode, source.outpatient_special_disease?.procedure_code)),
    },
  };

  const diagnosisSourceRaw = firstDefined(
    source.diagnoses,
    source.diagnosisList,
    source.diagnosis_list,
    source.codingSet?.diagnoses,
    source.coding_set?.diagnoses,
    source.medicalRecord?.diagnoses,
    source.medical_record?.diagnoses,
    [],
  );
  const diagnosisSource = diagnosisSourceRaw && !Array.isArray(diagnosisSourceRaw)
    && (diagnosisSourceRaw.primary || diagnosisSourceRaw.secondary)
    ? [diagnosisSourceRaw.primary, ...asArray(diagnosisSourceRaw.secondary)].filter(Boolean)
    : diagnosisSourceRaw;
  const diagnoses = asArray(diagnosisSource).map((item, index) => normalizeDiagnosis(item, index, fallbackRef));
  const principalIndex = diagnoses.findIndex((item) => /^(principal|primary|main|主要诊断|主诊断)$/iu.test(item.role || ""));
  const selectedPrincipalIndex = principalIndex >= 0 ? principalIndex : (diagnoses.length ? 0 : -1);
  const principalDiagnosis = selectedPrincipalIndex >= 0 ? diagnoses[selectedPrincipalIndex] : null;
  const secondaryDiagnoses = diagnoses.filter((_, index) => index !== selectedPrincipalIndex);

  const diagnosesGroup = {
    outpatient_western: normalizeDiagnosisField(firstDefined(
      source.outpatientWesternDiagnosis,
      source.outpatient_western_diagnosis,
      source.outpatientDiagnosis,
      source.outpatient_diagnosis,
    ), `${fallbackRef}:outpatient_western`),
    outpatient_tcm: normalizeDiagnosisField(firstDefined(source.outpatientTcmDiagnosis, source.outpatient_tcm_diagnosis), `${fallbackRef}:outpatient_tcm`),
    discharge_western: normalizeDiagnosisField(firstDefined(
      dischargeSource.westernDiagnosis,
      dischargeSource.western_diagnosis,
      source.dischargeWesternDiagnosis,
      source.discharge_western_diagnosis,
    ), `${fallbackRef}:discharge_western`),
    discharge_tcm: normalizeDiagnosisField(firstDefined(
      dischargeSource.tcmDiagnosis,
      dischargeSource.tcm_diagnosis,
      source.dischargeTcmDiagnosis,
      source.discharge_tcm_diagnosis,
    ), `${fallbackRef}:discharge_tcm`),
    principal: principalDiagnosis,
    secondary: secondaryDiagnoses,
    diagnosis_code_count: diagnoses.filter((item) => hasValue(item.code)).length,
  };

  const procedureSource = firstDefined(
    source.procedures,
    source.operations,
    source.procedureList,
    source.procedure_list,
    source.codingSet?.procedures,
    source.coding_set?.procedures,
    [],
  );
  const procedures = asArray(procedureSource).map((item, index) => normalizeProcedure(item, index, fallbackRef));
  const primaryProcedureIndex = procedures.findIndex((item) => /^(primary|principal|main|主要|主要手术)$/iu.test(item.role || ""));
  const selectedPrimaryProcedureIndex = primaryProcedureIndex >= 0 ? primaryProcedureIndex : (procedures.length ? 0 : -1);
  const primaryProcedure = selectedPrimaryProcedureIndex >= 0 ? procedures[selectedPrimaryProcedureIndex] : null;
  const otherProcedures = procedures.filter((_, index) => index !== selectedPrimaryProcedureIndex);
  const surgeriesGroup = {
    primary: primaryProcedure,
    others: otherProcedures,
    procedure_code_count: procedures.filter((item) => hasValue(item.code)).length,
  };

  const clinical = objectFrom(source.clinicalProcess, source.clinical_process, source.clinical, source.hospitalization);
  const clinicalGroup = {
    ventilator_duration: normalizeDuration(firstDefined(clinical.ventilatorDuration, clinical.ventilator_duration, source.ventilatorDuration, source.ventilator_duration)),
    coma_before_admission: normalizeDuration(firstDefined(clinical.comaBeforeAdmission, clinical.coma_before_admission)),
    coma_after_admission: normalizeDuration(firstDefined(clinical.comaAfterAdmission, clinical.coma_after_admission)),
    icu_stays: asArray(firstDefined(clinical.icuStays, clinical.icu_stays, clinical.icu, source.icuStays, source.icu_stays)).map((item) => clone(item)),
    transfusions: asArray(firstDefined(clinical.transfusions, clinical.bloodTransfusions, clinical.blood_transfusions, source.transfusions)).map((item) => clone(item)),
    nursing_days: {
      special: firstDefined(clinical.specialNursingDays, clinical.special_nursing_days, null),
      primary: firstDefined(clinical.primaryNursingDays, clinical.primary_nursing_days, null),
      secondary: firstDefined(clinical.secondaryNursingDays, clinical.secondary_nursing_days, null),
      tertiary: firstDefined(clinical.tertiaryNursingDays, clinical.tertiary_nursing_days, null),
    },
    documents: asArray(firstDefined(clinical.documents, clinical.clinicalDocuments, clinical.clinical_documents, source.clinicalDocuments, source.clinical_documents)).map((item) => clone(item)),
  };

  const dischargeGroup = {
    discharge_method: textOrNull(firstDefined(
      dischargeSource.method,
      dischargeSource.disposition,
      dischargeSource.dischargeMethod,
      dischargeSource.discharge_method,
      source.dischargeMethod,
      source.discharge_method,
    )),
    readmission_within_31_days: firstDefined(
      dischargeSource.readmissionWithin31Days,
      dischargeSource.readmission_within_31_days,
      source.readmissionWithin31Days,
      source.readmission_within_31_days,
      null,
    ),
    readmission_plan_purpose: textOrNull(firstDefined(
      dischargeSource.readmissionPlanPurpose,
      dischargeSource.readmission_plan_purpose,
      source.readmissionPlanPurpose,
      source.readmission_plan_purpose,
    )),
    attending_physician: normalizePerson(firstDefined(
      dischargeSource.attendingPhysician,
      dischargeSource.attending_physician,
      source.attendingPhysician,
      source.attending_physician,
    )),
    responsible_nurse: normalizePerson(firstDefined(
      dischargeSource.responsibleNurse,
      dischargeSource.responsible_nurse,
      source.responsibleNurse,
      source.responsible_nurse,
    )),
  };

  const feeSource = objectFrom(source.fees, source.costs, source.billing, source.chargeSummary, source.charge_summary);
  const feeItemsSource = firstDefined(
    Array.isArray(source.charges) ? source.charges : null,
    Array.isArray(source.fees) ? source.fees : null,
    Array.isArray(source.costs?.items) ? source.costs.items : null,
    feeSource.items,
    feeSource.feeItems,
    feeSource.fee_items,
    source.chargeItems,
    source.charge_items,
    [],
  );
  const feeItems = asArray(feeItemsSource).map((item, index) => normalizeFeeItem(item, index, fallbackRef));
  const computedFeeTotalCents = sumCents(feeItems.map((item) => item.amount));
  const reportedFeeTotalCents = parseMoneyCents(firstDefined(
    feeSource.totalAmount,
    feeSource.total_amount,
    feeSource.amountTotal,
    feeSource.amount_total,
    source.totalAmount,
    source.total_amount,
    source.costs?.total,
  ));
  const categoryTotals = {};
  for (const item of feeItems) {
    categoryTotals[item.category] = money(sumCents([categoryTotals[item.category], item.amount]));
  }
  const coverageTotals = Object.fromEntries(Object.keys(feeItems[0]?.breakdown || {
    class_a_amount: null,
    class_b_amount: null,
    self_pay_amount: null,
    other_amount: null,
  }).map((key) => [key, money(sumCents(feeItems.map((item) => item.breakdown[key]))) ]));
  const feesGroup = {
    business_serial_number: textOrNull(firstDefined(feeSource.businessSerialNumber, feeSource.business_serial_number, source.businessSerialNumber, source.business_serial_number)),
    invoice_code: textOrNull(firstDefined(feeSource.invoiceCode, feeSource.invoice_code, source.invoiceCode, source.invoice_code)),
    invoice_number: textOrNull(firstDefined(feeSource.invoiceNumber, feeSource.invoice_number, source.invoiceNumber, source.invoice_number)),
    settlement_period: {
      start: normalizeDate(firstDefined(feeSource.periodStart, feeSource.period_start, feeSource.settlementStart, feeSource.settlement_start)),
      end: normalizeDate(firstDefined(feeSource.periodEnd, feeSource.period_end, feeSource.settlementEnd, feeSource.settlement_end)),
    },
    items: feeItems,
    by_category: categoryTotals,
    disease_based_fee: clone(firstDefined(feeSource.diseaseBasedFee, feeSource.disease_based_fee, null)),
    totals: {
      amount_total: money(reportedFeeTotalCents === null ? computedFeeTotalCents : reportedFeeTotalCents),
      computed_item_amount_total: money(computedFeeTotalCents),
      class_a_amount: coverageTotals.class_a_amount,
      class_b_amount: coverageTotals.class_b_amount,
      self_pay_amount: coverageTotals.self_pay_amount,
      other_amount: coverageTotals.other_amount,
    },
  };

  const paymentSource = firstDefined(
    source.paymentSplit,
    source.payment_split,
    source.payments,
    source.settlement?.paymentSplit,
    source.settlement?.payment_split,
    source.settlement,
    null,
  );
  const paymentRoots = collectSourceObjects(
    paymentSource,
    asObject(paymentSource).paymentSplit,
    asObject(paymentSource).payment_split,
    source.paymentSplit,
    source.payment_split,
  );
  const paymentSplit = { ...EMPTY_PAYMENT_SPLIT };
  const paymentAliases = {
    medical_insurance_fund: ["medicalInsuranceFund", "medical_insurance_fund", "fundPayment", "fund_payment", "insuranceFund", "统筹基金支付"],
    employee_large_amount_subsidy: ["employeeLargeAmountSubsidy", "employee_large_amount_subsidy", "职工大额补助"],
    supplemental_medical_insurance: ["supplementalMedicalInsurance", "supplemental_medical_insurance", "supplementalMedicalInsurancePayment", "补充医疗保险支付"],
    resident_critical_illness_insurance: ["residentCriticalIllnessInsurance", "resident_critical_illness_insurance", "residentCriticalIllnessPayment", "居民大病保险"],
    civil_servant_medical_subsidy: ["civilServantMedicalSubsidy", "civil_servant_medical_subsidy", "公务员医疗补助"],
    medical_assistance: ["medicalAssistance", "medical_assistance", "medicalAssistancePayment", "医疗救助支付"],
    enterprise_supplemental: ["enterpriseSupplemental", "enterprise_supplemental", "企业补充"],
    commercial_insurance: ["commercialInsurance", "commercial_insurance", "commercialInsurancePayment", "商业保险"],
    other_payment: ["otherPayment", "other_payment", "其他支付"],
    individual_self_pay: ["individualSelfPay", "individual_self_pay", "personalSelfPay", "personal_self_pay", "selfPay", "self_pay", "个人自付"],
    individual_account: ["individualAccount", "individual_account", "individualAccountPayment", "个人账户支付"],
    individual_cash: ["individualCash", "individual_cash", "individualCashPayment", "personalCash", "personal_cash", "个人现金支付"],
  };
  for (const key of ALL_PAYMENT_KEYS) paymentSplit[key] = readAmountFromRoots(paymentRoots, paymentAliases[key]);
  const genericBurden = pickFrom(paymentRoots, ["individualBurden", "individual_burden", "personalBurden", "personal_burden", "个人负担"]);
  const hasExplicitIndividualParts = INDIVIDUAL_PAYMENT_KEYS.some((key) => paymentAliases[key].some((path) => hasValue(pickFrom(paymentRoots, [path]))));
  if (!hasExplicitIndividualParts && hasValue(genericBurden)) paymentSplit.individual_self_pay = readMoney(paymentRoots, ["individualBurden", "individual_burden", "personalBurden", "personal_burden", "个人负担"], 0);
  const computedInsurancePaymentCents = sumCents(INSURANCE_PAYMENT_KEYS.map((key) => paymentSplit[key]));
  const computedIndividualBurdenCents = sumCents(INDIVIDUAL_PAYMENT_KEYS.map((key) => paymentSplit[key]));
  const computedPaymentTotalCents = computedInsurancePaymentCents + computedIndividualBurdenCents;
  const reportedInsurancePaymentCents = parseMoneyCents(pickFrom(paymentRoots, ["insurancePayment", "insurance_payment", "medicalInsurancePayment", "medical_insurance_payment", "医保支付"]));
  const reportedIndividualBurdenCents = parseMoneyCents(genericBurden);
  const reportedPaymentTotalCents = parseMoneyCents(pickFrom(paymentRoots, ["totalPaymentAmount", "total_payment_amount", "totalPayment", "total_payment", "totalAmount", "total_amount", "paymentTotal", "payment_total"]));
  const paymentGroup = {
    payment_split: paymentSplit,
    payment_totals: {
      insurance_payment_amount: money(reportedInsurancePaymentCents === null ? computedInsurancePaymentCents : reportedInsurancePaymentCents),
      computed_insurance_payment_amount: money(computedInsurancePaymentCents),
      individual_burden_amount: money(reportedIndividualBurdenCents === null ? computedIndividualBurdenCents : reportedIndividualBurdenCents),
      computed_individual_burden_amount: money(computedIndividualBurdenCents),
      total_payment_amount: money(reportedPaymentTotalCents === null ? computedPaymentTotalCents : reportedPaymentTotalCents),
      computed_split_total_amount: money(computedPaymentTotalCents),
    },
    payment_split_provided: paymentRoots.length > 0,
    payment_method: textOrNull(firstDefined(paymentSource?.paymentMethod, paymentSource?.payment_method, source.paymentMethod, source.payment_method)),
    institution: {
      name: textOrNull(firstDefined(institution.name, institution.institutionName, institution.institution_name, source.institutionName, source.institution_name)),
      code: textOrNull(firstDefined(institution.code, institution.institutionCode, institution.institution_code, source.institutionCode, source.institution_code)),
      settlement_level: textOrNull(firstDefined(institution.settlementLevel, institution.settlement_level, source.settlementLevel, source.settlement_level)),
    },
    reporting_department: textOrNull(firstDefined(source.reportingDepartment, source.reporting_department, institution.reportingDepartment, institution.reporting_department)),
    reported_by: normalizePerson(firstDefined(source.reportedBy, source.reported_by, institution.reportedBy, institution.reported_by)),
    insurance_agency: {
      name: textOrNull(firstDefined(source.insuranceAgency, source.insurance_agency, source.insuranceAgencyName, source.insurance_agency_name)),
      code: textOrNull(firstDefined(source.insuranceAgencyCode, source.insurance_agency_code)),
    },
  };

  const sourceEvidence = evidenceRefs(firstDefined(source.evidenceRefs, source.evidence_refs, source.sourceRefs, source.source_refs), fallbackRef);
  const sourceIdentifiers = {
    episode_id: episodeId,
    patient_id_number: identityVisit.patient_id_number,
    insurance_number: identityVisit.insurance_number,
    medical_record_number: identityVisit.medical_record_number,
    inpatient_number: identityVisit.inpatient_number,
    claim_serial_number: identityVisit.claim_serial_number,
  };
  const listIdSeed = {
    episode_id: episodeId,
    patient_id_number: identityVisit.patient_id_number,
    admission_at: identityVisit.admission_at,
    principal_diagnosis: principalDiagnosis,
    procedures,
    fee_items: feeItems,
  };
  const settlementListId = `settlement-list-${episodeId || shortHash(stableStringify(listIdSeed))}`;
  const list = {
    object_type: "settlement_list",
    schema_version: "settlement-mvp-1",
    settlement_list_id: settlementListId,
    episode_id: episodeId,
    field_mapping: {
      ...clone(SETTLEMENT_MAPPING_METADATA),
      groups: clone(SETTLEMENT_FIELD_GROUPS),
    },
    identity_visit: identityVisit,
    diagnoses: diagnosesGroup,
    surgeries: surgeriesGroup,
    clinical_process: clinicalGroup,
    discharge: dischargeGroup,
    fees: feesGroup,
    payment_institution: paymentGroup,
    provenance: {
      source_episode_id: episodeId,
      source_identifiers: sourceIdentifiers,
      source_diagnoses: clone(diagnoses),
      source_procedures: clone(procedures),
      evidence_refs: sourceEvidence,
      mapping_version: "settlement-mvp-1",
      deterministic_amounts: true,
      ai_used_for_amounts: false,
    },
    // Compatibility summaries for the existing demo shell; these are not
    // official interface field IDs.
    total_amount: feesGroup.totals.amount_total,
    totalAmount: feesGroup.totals.amount_total,
  };
  list.groups = createDisplayGroups(list);
  return list;
}

export function validateSettlementList(list) {
  const issues = [];
  if (!list || typeof list !== "object") {
    return finalizeIssues([issue("error", "REQUIRED_SETTLEMENT_LIST", "settlement_list", "结算清单对象不能为空", [])]);
  }
  const identity = asObject(list.identity_visit);
  const diagnoses = asObject(list.diagnoses);
  const surgeries = asObject(list.surgeries);
  const discharge = asObject(list.discharge);
  const fees = asObject(list.fees);
  const payment = asObject(list.payment_institution);
  const paymentSplit = asObject(payment.payment_split);
  const provenance = asObject(list.provenance);
  const baseRefs = refsFor(list, provenance.source_episode_id ? `episode:${provenance.source_episode_id}` : null);
  const requireValue = (value, field, message) => {
    if (!hasValue(value) || (Array.isArray(value) && value.length === 0)) {
      issues.push(issue("error", "REQUIRED_FIELD_MISSING", field, message, baseRefs));
    }
  };

  requireValue(list.settlement_list_id, "settlement_list_id", "缺少清单标识");
  requireValue(list.episode_id, "episode_id", "缺少住院 Episode 标识");
  requireValue(identity.patient_name, "identity_visit.patient_name", "缺少患者姓名");
  requireValue(identity.patient_id_type, "identity_visit.patient_id_type", "缺少患者证件类别");
  requireValue(identity.patient_id_number, "identity_visit.patient_id_number", "缺少患者证件号码");
  requireValue(identity.insurance_number, "identity_visit.insurance_number", "缺少医保编号");
  requireValue(identity.admission_at, "identity_visit.admission_at", "缺少入院时间");
  requireValue(identity.discharge_at, "identity_visit.discharge_at", "缺少出院时间");
  requireValue(diagnoses.principal, "diagnoses.principal", "缺少主要诊断");
  requireValue(diagnoses.principal?.code, "diagnoses.principal.code", "主要诊断缺少疾病代码");
  requireValue(diagnoses.principal?.name, "diagnoses.principal.name", "主要诊断缺少名称");
  requireValue(discharge?.discharge_method, "discharge.discharge_method", "缺少离院方式");
  requireValue(fees.items, "fees.items", "缺少费用明细");
  requireValue(fees.totals?.amount_total, "fees.totals.amount_total", "缺少费用合计");
  requireValue(payment.payment_totals?.total_payment_amount, "payment_institution.payment_totals.total_payment_amount", "缺少支付合计");
  if (payment.payment_split_provided !== true) {
    issues.push(issue("error", "PAYMENT_SPLIT_MISSING", "payment_institution.payment_split", "缺少支付拆分来源，不能提交医保结算清单", baseRefs));
  }

  const admissionDate = parseDate(identity.admission_at);
  const dischargeDate = parseDate(identity.discharge_at);
  if (hasValue(identity.admission_at) && !admissionDate) {
    issues.push(issue("error", "INVALID_TIMESTAMP", "identity_visit.admission_at", "入院时间不是可解析的时间", baseRefs));
  }
  if (hasValue(identity.discharge_at) && !dischargeDate) {
    issues.push(issue("error", "INVALID_TIMESTAMP", "identity_visit.discharge_at", "出院时间不是可解析的时间", baseRefs));
  }
  if (admissionDate && dischargeDate && dischargeDate < admissionDate) {
    issues.push(issue("error", "TIME_ORDER_INVALID", "identity_visit.discharge_at", "出院时间早于入院时间", baseRefs));
  }
  if (hasValue(identity.length_of_stay_days) && Number(identity.length_of_stay_days) < 0) {
    issues.push(issue("error", "TIME_ORDER_INVALID", "identity_visit.length_of_stay_days", "实际住院天数不能为负数", baseRefs));
  }
  const periodStart = parseDate(fees.settlement_period?.start);
  const periodEnd = parseDate(fees.settlement_period?.end);
  if (hasValue(fees.settlement_period?.start) && !periodStart) {
    issues.push(issue("error", "INVALID_TIMESTAMP", "fees.settlement_period.start", "结算期间起始时间不可解析", baseRefs));
  }
  if (hasValue(fees.settlement_period?.end) && !periodEnd) {
    issues.push(issue("error", "INVALID_TIMESTAMP", "fees.settlement_period.end", "结算期间结束时间不可解析", baseRefs));
  }
  if (periodStart && periodEnd && periodEnd < periodStart) {
    issues.push(issue("error", "TIME_ORDER_INVALID", "fees.settlement_period.end", "结算期间结束时间早于起始时间", baseRefs));
  }

  const actualDiagnoses = [diagnoses.principal, ...asArray(diagnoses.secondary)].filter(Boolean);
  const sourceDiagnoses = asArray(provenance.source_diagnoses);
  if (sourceDiagnoses.length && !compareSet(actualDiagnoses, sourceDiagnoses)) {
    issues.push(issue("error", "DIAGNOSIS_NOT_MATCH_SOURCE", "diagnoses", "清单诊断与病例来源诊断不一致", refsFor(list, ...sourceDiagnoses.flatMap((item) => asArray(item.evidence_refs)))));
  }
  const duplicateDiagnosisCodes = actualDiagnoses.filter((item, index, all) => item?.code && all.findIndex((other) => other?.code === item.code) !== index);
  if (duplicateDiagnosisCodes.length) {
    issues.push(issue("error", "DUPLICATE_DIAGNOSIS", "diagnoses", "诊断代码重复，不能直接提交", baseRefs));
  }

  const actualProcedures = [surgeries.primary, ...asArray(surgeries.others)].filter(Boolean);
  const sourceProcedures = asArray(provenance.source_procedures);
  if (sourceProcedures.length && !compareProcedureSet(actualProcedures, sourceProcedures)) {
    issues.push(issue("error", "PROCEDURE_NOT_MATCH_SOURCE", "surgeries", "清单手术/操作与病例来源不一致", refsFor(list, ...sourceProcedures.flatMap((item) => asArray(item.evidence_refs)))));
  }
  for (const [index, procedure] of actualProcedures.entries()) {
    const start = parseDate(procedure.start_at);
    const end = parseDate(procedure.end_at);
    const fieldPrefix = index === 0 ? "surgeries.primary" : `surgeries.others.${index - 1}`;
    if (hasValue(procedure.start_at) && !start) issues.push(issue("error", "INVALID_TIMESTAMP", `${fieldPrefix}.start_at`, "手术开始时间不可解析", refsFor(list, ...asArray(procedure.evidence_refs))));
    if (hasValue(procedure.end_at) && !end) issues.push(issue("error", "INVALID_TIMESTAMP", `${fieldPrefix}.end_at`, "手术结束时间不可解析", refsFor(list, ...asArray(procedure.evidence_refs))));
    if (start && end && end < start) issues.push(issue("error", "TIME_ORDER_INVALID", `${fieldPrefix}.end_at`, "手术结束时间早于开始时间", refsFor(list, ...asArray(procedure.evidence_refs))));
    if (start && admissionDate && start < admissionDate) issues.push(issue("error", "TIME_OUTSIDE_EPISODE", `${fieldPrefix}.start_at`, "手术开始时间早于入院时间", refsFor(list, ...asArray(procedure.evidence_refs))));
    if (end && dischargeDate && end > dischargeDate) issues.push(issue("error", "TIME_OUTSIDE_EPISODE", `${fieldPrefix}.end_at`, "手术结束时间晚于出院时间", refsFor(list, ...asArray(procedure.evidence_refs))));
  }

  const identifierEntries = outputIdentifierEntries(identity).filter(([, value]) => hasValue(value));
  for (let index = 0; index < identifierEntries.length; index += 1) {
    for (let next = index + 1; next < identifierEntries.length; next += 1) {
      const [leftKey, leftValue] = identifierEntries[index];
      const [rightKey, rightValue] = identifierEntries[next];
      if (leftValue === rightValue) {
        issues.push(issue("error", "IDENTIFIER_MIXED", `identity_visit.${rightKey}`, `${leftKey} 与 ${rightKey} 使用了同一标识值`, baseRefs));
      }
    }
  }
  const sourceIdentifiers = asObject(provenance.source_identifiers);
  for (const [key, value] of Object.entries(sourceIdentifiers)) {
    if (hasValue(value) && hasValue(identity[key]) && String(value) !== String(identity[key])) {
      issues.push(issue("error", "IDENTIFIER_NOT_MATCH_SOURCE", `identity_visit.${key}`, `字段 ${key} 与病例来源标识不一致`, baseRefs));
    }
  }

  const feeItems = asArray(fees.items);
  let feeItemsTotalCents = 0;
  let feeItemsHaveInvalidAmount = false;
  for (const [index, item] of feeItems.entries()) {
    const amountCents = parseMoneyCents(item?.amount);
    const itemRefs = refsFor(list, ...asArray(item?.evidence_refs));
    if (amountCents === null) {
      feeItemsHaveInvalidAmount = true;
      issues.push(issue("error", "FEE_ITEM_AMOUNT_MISSING", `fees.items.${index}.amount`, "费用明细缺少可计算金额", itemRefs));
    } else if (amountCents < 0) {
      feeItemsHaveInvalidAmount = true;
      issues.push(issue("error", "NEGATIVE_AMOUNT", `fees.items.${index}.amount`, "费用金额不能为负数", itemRefs));
    } else {
      feeItemsTotalCents += amountCents;
    }
    const breakdown = asObject(item?.breakdown);
    const hasBreakdown = Object.values(breakdown).some(hasValue);
    if (hasBreakdown && amountCents !== null) {
      const breakdownCents = sumCents(Object.values(breakdown));
      if (breakdownCents !== amountCents) {
        issues.push(issue("error", "FEE_ITEM_BREAKDOWN_MISMATCH", `fees.items.${index}.breakdown`, "费用明细的甲类、乙类、自费和其他拆分不等于项目金额", itemRefs));
      }
    }
  }
  const feeTotalCents = parseMoneyCents(fees.totals?.amount_total);
  if (feeTotalCents !== null && !feeItemsHaveInvalidAmount && feeTotalCents !== feeItemsTotalCents) {
    issues.push(issue("error", "FEE_TOTAL_MISMATCH", "fees.totals.amount_total", "费用合计与费用明细确定性合计不一致", refsFor(list, ...feeItems.flatMap((item) => asArray(item.evidence_refs)))));
  }
  const computedFeeTotalCents = parseMoneyCents(fees.totals?.computed_item_amount_total);
  if (computedFeeTotalCents !== null && !feeItemsHaveInvalidAmount && computedFeeTotalCents !== feeItemsTotalCents) {
    issues.push(issue("error", "FEE_COMPUTED_TOTAL_STALE", "fees.totals.computed_item_amount_total", "费用明细计算快照已过期", baseRefs));
  }

  const paymentKeysPresent = ALL_PAYMENT_KEYS.some((key) => hasValue(paymentSplit[key]));
  if (payment.payment_split_provided === true && !paymentKeysPresent) {
    issues.push(issue("error", "PAYMENT_SPLIT_MISSING", "payment_institution.payment_split", "支付来源存在但没有任何可计算的支付项", baseRefs));
  }
  let computedInsuranceCents = 0;
  let computedIndividualCents = 0;
  for (const key of ALL_PAYMENT_KEYS) {
    const amountCents = parseMoneyCents(paymentSplit[key]);
    if (amountCents === null) continue;
    if (amountCents < 0) issues.push(issue("error", "NEGATIVE_AMOUNT", `payment_institution.payment_split.${key}`, "支付金额不能为负数", baseRefs));
    if (INSURANCE_PAYMENT_KEYS.includes(key)) computedInsuranceCents += amountCents;
    if (INDIVIDUAL_PAYMENT_KEYS.includes(key)) computedIndividualCents += amountCents;
  }
  const computedPaymentCents = computedInsuranceCents + computedIndividualCents;
  const declaredInsuranceCents = parseMoneyCents(payment.payment_totals?.insurance_payment_amount);
  const declaredIndividualCents = parseMoneyCents(payment.payment_totals?.individual_burden_amount);
  const declaredPaymentCents = parseMoneyCents(payment.payment_totals?.total_payment_amount);
  if (declaredInsuranceCents !== null && declaredInsuranceCents !== computedInsuranceCents) {
    issues.push(issue("error", "PAYMENT_SPLIT_MISMATCH", "payment_institution.payment_totals.insurance_payment_amount", "医保支付合计与支付拆分不一致", baseRefs));
  }
  if (declaredIndividualCents !== null && declaredIndividualCents !== computedIndividualCents) {
    issues.push(issue("error", "PAYMENT_SPLIT_MISMATCH", "payment_institution.payment_totals.individual_burden_amount", "个人负担与个人支付拆分不一致", baseRefs));
  }
  if (declaredPaymentCents !== null && declaredPaymentCents !== computedPaymentCents) {
    issues.push(issue("error", "PAYMENT_SPLIT_MISMATCH", "payment_institution.payment_totals.total_payment_amount", "支付合计与支付拆分不一致", baseRefs));
  }
  if (feeTotalCents !== null && declaredPaymentCents !== null && feeTotalCents !== declaredPaymentCents) {
    issues.push(issue("error", "PAYMENT_TOTAL_MISMATCH", "payment_institution.payment_totals.total_payment_amount", "费用合计与支付合计不一致", baseRefs));
  }

  return finalizeIssues(issues);
}

export function createClaimSnapshot(list, options = {}) {
  const validationIssues = validateSettlementList(list);
  const source = asObject(list);
  const idempotencyKey = textOrNull(firstDefined(options.idempotencyKey, options.idempotency_key))
    || `settlement:${source.settlement_list_id || shortHash(stableStringify(source))}`;
  const snapshotId = textOrNull(firstDefined(options.snapshotId, options.snapshot_id))
    || `claim-snapshot-${shortHash(`${idempotencyKey}|${source.settlement_list_id || "unknown"}`)}`;
  const requestSnapshot = clone(source);
  const requestDigest = shortHash(stableStringify(requestSnapshot));
  const createdAt = normalizeDate(firstDefined(options.now, options.createdAt, options.created_at)) || new Date().toISOString();
  const ruleContext = {
    rule_scope: "national",
    national_rule_version: textOrNull(firstDefined(options.nationalRuleVersion, options.national_rule_version, options.ruleVersion, "3.0")),
    national_drg_version: "CHS-DRG-3.0",
    national_dip_version: "CHS-DIP-3.0",
    region: textOrNull(firstDefined(options.region, "CN-NATIONAL")),
    payment_mode: textOrNull(firstDefined(options.paymentMode, options.payment_mode, "DRG")),
    local_payment_profile: textOrNull(firstDefined(options.localPaymentProfile, options.local_payment_profile, null)),
    local_profile_status: "not_connected",
  };
  return {
    object_type: "claim_snapshot",
    snapshot_id: snapshotId,
    snapshotId,
    idempotency_key: idempotencyKey,
    idempotencyKey,
    created_at: createdAt,
    settlement_list_id: textOrNull(source.settlement_list_id),
    episode_id: textOrNull(source.episode_id),
    request_snapshot: requestSnapshot,
    requestSnapshot: clone(requestSnapshot),
    request_digest: requestDigest,
    requestDigest,
    validation_issues: clone(validationIssues),
    validation_valid: validationIssues.valid,
    rule_context: ruleContext,
    interface_context: {
      transaction_code: "3600",
      transaction_name: "医疗保障基金结算清单信息上传",
      case_cardinality: "one_patient_per_submission",
      setlinfo_cardinality: "single_row",
      detail_cardinality: "multi_row",
      transport_status: "mock",
    },
    mock_only: true,
    production_interface_connected: false,
    boundary_note: "此快照只供本地 mock 回放，不代表已接入真实医保生产平台。",
  };
}

const mockClaimStore = new Map();

const getSnapshotRequest = (snapshot) => asObject(firstDefined(snapshot?.request_snapshot, snapshot?.requestSnapshot));

const expectedAmounts = (request) => {
  const feeTotal = parseMoneyCents(request?.fees?.totals?.amount_total) || 0;
  const paymentTotals = asObject(request?.payment_institution?.payment_totals);
  const insurance = parseMoneyCents(paymentTotals.insurance_payment_amount) || 0;
  const individual = parseMoneyCents(paymentTotals.individual_burden_amount) || 0;
  const total = parseMoneyCents(paymentTotals.total_payment_amount) || 0;
  return {
    fee_total_amount: money(feeTotal),
    insurance_payment_amount: money(insurance),
    individual_burden_amount: money(individual),
    total_payment_amount: money(total),
  };
};

const snapshotValidationIssues = (snapshot, request) => {
  const supplied = Array.isArray(snapshot?.validation_issues) ? snapshot.validation_issues : null;
  return supplied || validateSettlementList(request);
};

export function submitSettlementMock(snapshot) {
  const source = asObject(snapshot);
  const idempotencyKey = textOrNull(firstDefined(source.idempotency_key, source.idempotencyKey));
  const requestSnapshot = getSnapshotRequest(source);
  const requestDigest = shortHash(stableStringify(requestSnapshot));
  const existing = idempotencyKey ? mockClaimStore.get(idempotencyKey) : null;
  if (existing && existing.request_digest === requestDigest) {
    const replay = clone(existing.result);
    replay.duplicate = true;
    replay.first_submission = false;
    replay.replayed_from_batch = existing.result.batch_id;
    replay.effect = {
      ...replay.effect,
      duplicate_deduction_prevented: true,
      actual_money_movement: false,
    };
    return replay;
  }
  if (existing && existing.request_digest !== requestDigest) {
    return {
      object_type: "claim_batch",
      batch_id: existing.result.batch_id,
      batchNo: existing.result.batch_id,
      idempotency_key: idempotencyKey,
      idempotencyKey,
      status: "idempotency_conflict",
      duplicate: true,
      first_submission: false,
      response_snapshot: clone(existing.result.response_snapshot),
      responseSnapshot: clone(existing.result.response_snapshot),
      request_digest: requestDigest,
      issues: [issue("error", "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD", "idempotency_key", "同一幂等键对应了不同的申报快照，未创建新批次且未产生重复扣款", [
        `batch:${existing.result.batch_id}`,
        `idempotency:${idempotencyKey}`,
      ])],
      effect: {
        simulated: true,
        actual_money_movement: false,
        duplicate_deduction_prevented: true,
      },
      production_interface_connected: false,
      boundary_note: "这是本地 mock 幂等冲突，不是国家医保生产接口反馈。",
    };
  }

  const validationIssues = snapshotValidationIssues(source, requestSnapshot);
  const accepted = !validationIssues.some((item) => item.severity === "error");
  const batchId = `mock-batch-${shortHash(`${idempotencyKey || "missing"}|${requestDigest}`)}`;
  const responseId = `mock-response-${shortHash(`${batchId}|${source.created_at || ""}`)}`;
  const amounts = expectedAmounts(requestSnapshot);
  const responseSnapshot = {
    object_type: "insurance_response_snapshot",
    response_id: responseId,
    batch_id: batchId,
    idempotency_key: idempotencyKey,
    received_at: normalizeDate(firstDefined(source.created_at, source.createdAt)) || new Date().toISOString(),
    claim_status: accepted ? "accepted" : "rejected",
    response_code: accepted ? "MOCK_ACCEPTED" : "MOCK_REJECTED_QC",
    adjudicated_amount: accepted ? amounts.fee_total_amount : 0,
    approved_insurance_payment_amount: accepted ? amounts.insurance_payment_amount : 0,
    patient_responsibility_amount: accepted ? amounts.individual_burden_amount : 0,
    total_payment_amount: accepted ? amounts.total_payment_amount : 0,
    difference_amount: 0,
    request_digest: requestDigest,
    validation_issues: clone(validationIssues),
    mock_only: true,
    production_interface_connected: false,
  };
  const result = {
    object_type: "claim_batch",
    batch_id: batchId,
    batchNo: batchId,
    snapshot_id: textOrNull(firstDefined(source.snapshot_id, source.snapshotId)),
    idempotency_key: idempotencyKey,
    idempotencyKey,
    status: accepted ? "accepted" : "rejected",
    response_code: responseSnapshot.response_code,
    responseCode: responseSnapshot.response_code,
    duplicate: false,
    first_submission: true,
    request_snapshot: clone(requestSnapshot),
    request_digest: requestDigest,
    response_snapshot: responseSnapshot,
    interface_context: clone(firstDefined(source.interface_context, {
      transaction_code: "3600",
      transaction_name: "医疗保障基金结算清单信息上传",
      case_cardinality: "one_patient_per_submission",
      setlinfo_cardinality: "single_row",
      detail_cardinality: "multi_row",
      transport_status: "mock",
    })),
    responseSnapshot: clone(responseSnapshot),
    effect: {
      simulated: true,
      simulated_payment_amount: accepted ? amounts.total_payment_amount : 0,
      actual_money_movement: false,
      ledger_entry_id: accepted ? `mock-ledger-${shortHash(batchId)}` : null,
      duplicate_deduction_prevented: false,
    },
    issues: clone(validationIssues),
    production_interface_connected: false,
    boundary_note: "本批次由本地确定性 mock 生成，不代表已接入真实医保生产平台，也不执行真实扣款。",
  };
  if (idempotencyKey) mockClaimStore.set(idempotencyKey, { request_digest: requestDigest, result: clone(result) });
  return result;
}

const getResponseSnapshot = (response) => asObject(firstDefined(response?.response_snapshot, response?.responseSnapshot));

export function reconcileSettlement(snapshot, response) {
  const sourceSnapshot = asObject(snapshot);
  const request = getSnapshotRequest(sourceSnapshot);
  const responseSource = asObject(response);
  const responseSnapshot = getResponseSnapshot(responseSource);
  const expected = expectedAmounts(request);
  const actual = {
    adjudicated_amount: Number(firstDefined(responseSnapshot.adjudicated_amount, responseSnapshot.adjudicatedAmount, responseSource.adjudicated_amount, responseSource.adjudicatedAmount, 0)),
    insurance_payment_amount: Number(firstDefined(responseSnapshot.approved_insurance_payment_amount, responseSnapshot.approvedInsurancePaymentAmount, responseSource.approved_insurance_payment_amount, responseSource.approvedInsurancePaymentAmount, 0)),
    individual_burden_amount: Number(firstDefined(responseSnapshot.patient_responsibility_amount, responseSnapshot.patientResponsibilityAmount, responseSource.patient_responsibility_amount, responseSource.patientResponsibilityAmount, 0)),
    total_payment_amount: Number(firstDefined(responseSnapshot.total_payment_amount, responseSnapshot.totalPaymentAmount, responseSource.total_payment_amount, responseSource.totalPaymentAmount, 0)),
  };
  const differences = {
    adjudicated_amount: Number((actual.adjudicated_amount - Number(expected.fee_total_amount || 0)).toFixed(2)),
    insurance_payment_amount: Number((actual.insurance_payment_amount - Number(expected.insurance_payment_amount || 0)).toFixed(2)),
    individual_burden_amount: Number((actual.individual_burden_amount - Number(expected.individual_burden_amount || 0)).toFixed(2)),
    total_payment_amount: Number((actual.total_payment_amount - Number(expected.total_payment_amount || 0)).toFixed(2)),
  };
  const differenceAmount = differences.adjudicated_amount;
  const reconciliationIssues = [];
  const snapshotKey = textOrNull(firstDefined(sourceSnapshot.idempotency_key, sourceSnapshot.idempotencyKey));
  const responseKey = textOrNull(firstDefined(responseSnapshot.idempotency_key, responseSnapshot.idempotencyKey));
  if (snapshotKey && responseKey && snapshotKey !== responseKey) {
    reconciliationIssues.push(issue("error", "RESPONSE_IDEMPOTENCY_MISMATCH", "response_snapshot.idempotency_key", "反馈幂等键与申报快照不一致", [`idempotency:${snapshotKey}`]));
  }
  if (sourceSnapshot.request_digest && responseSnapshot.request_digest && sourceSnapshot.request_digest !== responseSnapshot.request_digest) {
    reconciliationIssues.push(issue("error", "RESPONSE_REQUEST_SNAPSHOT_MISMATCH", "response_snapshot.request_digest", "反馈引用的请求快照与申报快照不一致", [`snapshot:${sourceSnapshot.snapshot_id || "unknown"}`]));
  }
  const hasDifference = Object.values(differences).some((value) => value !== 0);
  const responseStatus = textOrNull(firstDefined(responseSnapshot.claim_status, responseSource.status));
  const status = reconciliationIssues.length
    ? "inconsistent"
    : responseStatus === "rejected"
      ? "rejected"
      : hasDifference
        ? "mismatched"
        : "matched";
  return {
    object_type: "reconciliation_result",
    reconciliation_id: `reconciliation-${shortHash(`${sourceSnapshot.snapshot_id || "unknown"}|${responseSnapshot.response_id || "unknown"}`)}`,
    snapshot_id: textOrNull(firstDefined(sourceSnapshot.snapshot_id, sourceSnapshot.snapshotId)),
    batch_id: textOrNull(firstDefined(responseSnapshot.batch_id, responseSource.batch_id, responseSource.batchNo)),
    status,
    balanced: status === "matched",
    expected_amounts: expected,
    response_amounts: actual,
    differences,
    difference_amount: differenceAmount,
    differenceAmount,
    difference_amount_abs: Math.abs(differenceAmount),
    issues: reconciliationIssues,
    request_snapshot: clone(request),
    response_snapshot: clone(responseSnapshot),
    mock_only: true,
    production_interface_connected: false,
    boundary_note: "对账只比较本地申报快照与 mock 反馈，不代表真实医保清算结果。",
  };
}

export { SETTLEMENT_FIELD_GROUPS, SETTLEMENT_MAPPING_METADATA };
