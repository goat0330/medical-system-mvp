import assert from "node:assert/strict";
import {
  SETTLEMENT_FIELD_GROUPS,
  buildSettlementList,
  validateSettlementList,
  createClaimSnapshot,
  submitSettlementMock,
  reconcileSettlement,
} from "../app/domain/settlement.js";

const clone = (value) => structuredClone(value);

const episode = {
  id: "episode-001",
  patient: {
    id: "patient-001",
    name: "合成病例甲",
    gender: "女",
    birthDate: "1988-02-03",
    idType: "居民身份证",
    idNumber: "420000198802030028",
    ethnicity: "汉族",
  },
  insurance: {
    number: "INS-001",
    type: "职工医保",
    region: "湖北武汉",
  },
  medicalRecordNumber: "MR-001",
  inpatientNumber: "IP-001",
  claimSerialNumber: "CL-001",
  admission: {
    at: "2026-09-01T08:30:00+08:00",
    source: "门诊",
    department: "普外科",
    treatmentCategory: "西医",
  },
  discharge: {
    at: "2026-09-04T10:00:00+08:00",
    department: "普外科",
    method: "医嘱离院",
    attendingPhysician: { name: "合成医生", code: "DOC-001" },
    responsibleNurse: { name: "合成护士", code: "NUR-001" },
  },
  diagnoses: [
    { id: "dx-001", role: "principal", code: "K35.80", name: "急性阑尾炎", conditionAtAdmission: "一般" },
    { id: "dx-002", role: "secondary", code: "E66.90", name: "肥胖症" },
  ],
  procedures: [
    {
      id: "op-001",
      role: "primary",
      code: "OP-APP-001",
      name: "腹腔镜阑尾切除术",
      operator: { name: "合成医生", code: "DOC-001" },
      anesthesiologist: { name: "合成麻醉师", code: "AN-001" },
      anesthesiaType: "全身麻醉",
      startAt: "2026-09-02T09:00:00+08:00",
      endAt: "2026-09-02T10:20:00+08:00",
    },
  ],
  clinicalProcess: {
    ventilatorDuration: { days: 0, hours: 0, minutes: 0 },
    icuStays: [],
    transfusions: [],
    primaryNursingDays: 2,
    secondaryNursingDays: 1,
    documents: ["admission_record", "operation_record", "discharge_record"],
  },
  fees: {
    businessSerialNumber: "BIZ-001",
    invoiceCode: "INV-CODE-001",
    invoiceNumber: "INV-001",
    totalAmount: 4000,
    items: [
      { id: "fee-001", name: "床位费", category: "bed_fee", amount: 300, classA: 300 },
      { id: "fee-002", name: "检查费", category: "examination_fee", amount: 500, classB: 500 },
      { id: "fee-003", name: "手术费", category: "surgery_fee", amount: 2400, classA: 1800, selfPay: 600 },
      { id: "fee-004", name: "西药费", category: "western_medicine_fee", amount: 800, classA: 400, classB: 200, selfPay: 200 },
    ],
  },
  paymentSplit: {
    medicalInsuranceFund: 2600,
    individualAccount: 800,
    individualCash: 600,
    totalPaymentAmount: 4000,
    paymentMethod: "DRG",
  },
  institution: {
    name: "合成医院",
    code: "HOSP-001",
    settlementLevel: "三级",
  },
};

const api = {
  SETTLEMENT_FIELD_GROUPS,
  buildSettlementList,
  validateSettlementList,
  createClaimSnapshot,
  submitSettlementMock,
  reconcileSettlement,
};
for (const [name, value] of Object.entries(api)) {
  assert.ok(value, `${name} should be exported`);
}
assert.equal(SETTLEMENT_FIELD_GROUPS.length, 7);

const list = buildSettlementList(episode);
assert.equal(list.object_type, "settlement_list");
assert.equal(list.field_mapping.official_interface_field_status, "pending_verification");
assert.equal(list.field_mapping.groups[0].fields[0].official_field_code, null);
assert.deepEqual(Object.keys(list.payment_institution.payment_split).sort(), [
  "civil_servant_medical_subsidy",
  "commercial_insurance",
  "employee_large_amount_subsidy",
  "enterprise_supplemental",
  "individual_account",
  "individual_cash",
  "individual_self_pay",
  "medical_assistance",
  "medical_insurance_fund",
  "other_payment",
  "resident_critical_illness_insurance",
  "supplemental_medical_insurance",
].sort());

const normalIssues = validateSettlementList(list);
assert.equal(Array.isArray(normalIssues), true);
assert.equal(normalIssues.valid, true);
assert.deepEqual([...normalIssues], []);
assert.equal(list.fees.totals.amount_total, 4000);
assert.equal(list.payment_institution.payment_totals.total_payment_amount, 4000);

const amountBroken = clone(list);
amountBroken.fees.totals.amount_total = 4001;
const amountIssues = validateSettlementList(amountBroken);
assert.ok(amountIssues.some((item) => item.code === "FEE_TOTAL_MISMATCH"));
assert.ok(amountIssues.some((item) => item.code === "PAYMENT_TOTAL_MISMATCH"));

const diagnosisBroken = clone(list);
diagnosisBroken.diagnoses.principal = null;
const diagnosisIssues = validateSettlementList(diagnosisBroken);
assert.ok(diagnosisIssues.some((item) => item.code === "REQUIRED_FIELD_MISSING" && item.field === "diagnoses.principal"));

const snapshot = createClaimSnapshot(list, {
  snapshotId: "snapshot-001",
  idempotencyKey: "idem-001",
  now: "2026-09-04T11:00:00+08:00",
});
assert.equal(snapshot.idempotencyKey, "idem-001");
assert.equal(snapshot.rule_context.rule_scope, "national");
assert.equal(snapshot.rule_context.national_rule_version, "3.0");
assert.equal(snapshot.mock_only, true);

const firstResponse = submitSettlementMock(snapshot);
assert.equal(firstResponse.status, "accepted");
assert.equal(firstResponse.production_interface_connected, false);
const duplicateResponse = submitSettlementMock(snapshot);
assert.equal(duplicateResponse.batch_id, firstResponse.batch_id);
assert.equal(duplicateResponse.duplicate, true);
assert.equal(duplicateResponse.effect.actual_money_movement, false);
assert.equal(duplicateResponse.effect.duplicate_deduction_prevented, true);

const conflictingSnapshot = clone(snapshot);
conflictingSnapshot.request_snapshot.fees.totals.amount_total = 3999;
conflictingSnapshot.requestSnapshot = clone(conflictingSnapshot.request_snapshot);
const conflictResponse = submitSettlementMock(conflictingSnapshot);
assert.equal(conflictResponse.status, "idempotency_conflict");
assert.ok(conflictResponse.issues.some((item) => item.code === "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD"));

const reconciliation = reconcileSettlement(snapshot, firstResponse);
assert.equal(reconciliation.status, "matched");
assert.equal(reconciliation.balanced, true);
assert.equal(reconciliation.difference_amount, 0);

console.log("settlement tests passed");
