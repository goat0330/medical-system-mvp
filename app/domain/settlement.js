import { lengthOfStay } from "../data/episode.js";

const money = (v) => Number(v || 0);
const sum = (items, key) => items.reduce((s, x) => s + money(x[key]), 0);

function feeRow(episode, category, label) {
  const item = episode.fees.items.find((x) => x.category === category) || {};
  return {
    label,
    amount: money(item.amount),
    classA: money(item.classA),
    classB: money(item.classB),
    selfPay: money(item.selfPay),
    other: money(item.other),
    source: item.name ? "HIS费用明细" : "未映射",
  };
}

export function buildSettlementList(episode) {
  const procedures = episode.procedures || [];
  const feeRows = [
    feeRow(episode, "bed", "床位费"),
    feeRow(episode, "consultation", "诊察费"),
    feeRow(episode, "examination", "检查费"),
    feeRow(episode, "laboratory", "化验费"),
    feeRow(episode, "treatment", "治疗费"),
    feeRow(episode, "surgery", "手术费"),
    feeRow(episode, "nursing", "护理费"),
    feeRow(episode, "material", "卫生材料费"),
    feeRow(episode, "westernMedicine", "西药费"),
    feeRow(episode, "tcm", "中药饮片费"),
    feeRow(episode, "patentMedicine", "中成药费"),
    feeRow(episode, "general", "一般诊疗费"),
    feeRow(episode, "registration", "挂号费"),
    feeRow(episode, "other", "其他费"),
  ];
  const totals = {
    amount: sum(feeRows, "amount"),
    classA: sum(feeRows, "classA"),
    classB: sum(feeRows, "classB"),
    selfPay: sum(feeRows, "selfPay"),
    other: sum(feeRows, "other"),
  };
  return {
    objectType: "medical_security_fund_settlement_list",
    templateVersion: "国家医保局193项样式/P0版式复刻",
    sourceReference: "references/医保结算清单（193项）.pdf",
    episodeId: episode.episodeId,
    claimSerialNumber: episode.claimSerialNumber,
    institution: episode.institution,
    insurance: episode.insurance,
    medicalRecordNumber: episode.medicalRecordNumber,
    inpatientNumber: episode.inpatientNumber,
    reportDate: "2026-09-15",
    patient: episode.patient,
    outpatientSpecialDisease: {
      department: "",
      visitDate: "",
      diseaseName: "",
      diseaseCode: "",
      procedureName: "",
      procedureCode: "",
    },
    inpatient: {
      medicalType: episode.admission.medicalType,
      admissionSource: episode.admission.source,
      treatmentCategory: episode.admission.treatmentCategory,
      admissionAt: episode.admission.at,
      admissionDepartment: episode.admission.department,
      transferDepartment: "",
      dischargeAt: episode.discharge.at,
      dischargeDepartment: episode.discharge.department,
      lengthOfStay: lengthOfStay(episode),
      outpatientWestern: episode.diagnoses.outpatientWestern,
      outpatientTcm: [],
      dischargeWestern: [episode.diagnoses.principal, ...episode.diagnoses.secondary],
      dischargeTcm: [],
      principalDiagnosis: episode.diagnoses.principal,
      secondaryDiagnoses: episode.diagnoses.secondary,
      diagnosisCodeCount: 1 + episode.diagnoses.secondary.length,
    },
    procedures: {
      primary: procedures[0] || null,
      others: procedures.slice(1),
      codeCount: procedures.length,
    },
    clinicalProcess: episode.clinicalProcess,
    discharge: episode.discharge,
    fees: {
      businessSerialNumber: episode.fees.businessSerialNumber,
      invoiceCode: episode.fees.invoiceCode,
      invoiceNumber: episode.fees.invoiceNumber,
      settlementStart: episode.fees.settlementStart,
      settlementEnd: episode.fees.settlementEnd,
      rows: feeRows,
      totals,
    },
    payment: episode.payment,
    fieldSources: {
      patient: "HIS/病案首页",
      diagnosis: "病案首页/编码",
      procedures: "病案首页/手术记录",
      clinicalProcess: "EMR/HIS",
      fees: "HIS费用明细",
      payment: "医保结算模块（P0演示数据）",
    },
  };
}

export function validateSettlementList(list) {
  const issues = [];
  const req = (value, field, label) => {
    if (value === undefined || value === null || String(value).trim() === "") {
      issues.push({ severity: "error", code: "REQUIRED_FIELD_MISSING", field, message: `${label}不能为空。` });
    }
  };
  req(list.claimSerialNumber, "claimSerialNumber", "清单流水号");
  req(list.institution?.name, "institution.name", "定点医疗机构名称");
  req(list.institution?.code, "institution.code", "定点医疗机构代码");
  req(list.insurance?.number, "insurance.number", "医保编号");
  req(list.medicalRecordNumber, "medicalRecordNumber", "病案号");
  req(list.patient?.name, "patient.name", "姓名");
  req(list.patient?.sex, "patient.sex", "性别");
  req(list.patient?.idType, "patient.idType", "患者证件类别");
  req(list.patient?.idNumber, "patient.idNumber", "患者证件号码");
  req(list.inpatient?.admissionAt, "inpatient.admissionAt", "入院时间");
  req(list.inpatient?.dischargeAt, "inpatient.dischargeAt", "出院时间");
  req(list.inpatient?.principalDiagnosis?.name, "inpatient.principalDiagnosis.name", "主要诊断");
  req(list.inpatient?.principalDiagnosis?.code, "inpatient.principalDiagnosis.code", "主要诊断代码");
  req(list.discharge?.method, "discharge.method", "离院方式");

  const start = new Date(list.inpatient.admissionAt);
  const end = new Date(list.inpatient.dischargeAt);
  if (Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && end <= start) {
    issues.push({ severity: "error", code: "TIME_ORDER_INVALID", field: "inpatient.dischargeAt", message: "出院时间必须晚于入院时间。" });
  }
  const itemTotal = list.fees.rows.reduce((s, row) => s + money(row.amount), 0);
  if (Math.abs(itemTotal - money(list.fees.totals.amount)) > 0.01) {
    issues.push({ severity: "error", code: "FEE_TOTAL_MISMATCH", field: "fees.totals.amount", message: "费用项目合计与金额合计不一致。" });
  }
  const paymentTotal = money(list.payment.fund) + money(list.payment.individualBurden);
  if (Math.abs(paymentTotal - itemTotal) > 0.01) {
    issues.push({ severity: "warning", code: "PAYMENT_TOTAL_CHECK", field: "payment", message: "基金支付 + 个人负担与住院费用金额合计不一致，请核对结算结果。" });
  }
  issues.valid = !issues.some((x) => x.severity === "error");
  return issues;
}

export function formatMoney(value) {
  return money(value).toFixed(2);
}
