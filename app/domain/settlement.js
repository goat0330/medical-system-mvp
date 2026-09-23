import { lengthOfStay } from "../data/episode.js";
import { buildClinicalFactContext } from "../clinical-facts/index.js";

const money = (value) => Number(value || 0);
const sum = (items, key) => items.reduce((total, item) => total + money(item[key]), 0);
const clone = (value) => typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));

// Local template bindings. This remains an adapter registry, not the full insurer 193-item API dictionary.
export const SETTLEMENT_SOURCE_FIELDS = Object.freeze({
  "institution.name": { name: "定点医疗机构名称", code: "DE08.10.013.00.012", aliases: ["医疗机构名称", "医院名称"] },
  "patient.name": { name: "姓名", code: "DE02.01.039.00", aliases: ["姓名", "患者姓名"] },
  "patient.sex": { name: "性别", code: "DE02.01.040.00", aliases: ["性别"] },
  "patient.birthDate": { name: "出生日期", code: "DE02.01.005.01", aliases: ["出生日期"] },
  "patient.age": { name: "年龄", code: "DE02.01.026.00", aliases: ["年龄"] },
  "patient.nationality": { name: "国籍", code: "DE02.01.018.00", aliases: ["国籍"] },
  "patient.ethnicity": { name: "民族", code: "DE02.01.025.00", aliases: ["民族"] },
  "patient.occupation": { name: "职业", code: "DE02.01.052.00", aliases: ["职业类别代码", "职业"] },
  "patient.currentAddress": { name: "现住址", code: "DE02.01.009.00", aliases: ["现住址", "现住地址"] },
  medicalRecordNumber: { name: "病案号", code: "DE01.00.004.00" },
  inpatientNumber: { name: "住院号", code: "DE01.00.014.00" },
  "inpatient.admissionDepartment": { name: "入院科别", code: "DE08.10.026.00.001", aliases: ["入院科别", "科室名称"] },
  "inpatient.dischargeDepartment": { name: "出院科别", code: "DE08.10.026.00.002", aliases: ["出院科别"] },
  "inpatient.admissionAt": { name: "入院时间", code: "DE06.00.092.00", aliases: ["入院时间", "入院日期时间"] },
  "inpatient.dischargeAt": { name: "出院时间", code: "DE06.00.017.00", aliases: ["出院时间", "出院日期时间"] },
  "inpatient.lengthOfStay": { name: "实际住院天数", code: "DE06.00.310.00", aliases: ["实际住院天数", "住院天数"] },
  "inpatient.principalDiagnosis.name": { name: "主要诊断", code: "DE05.10.172.00", aliases: ["主要诊断", "出院主要诊断", "主要诊断名称", "初步诊断-西医诊断名称", "入院诊断", "术后诊断"] },
  "inpatient.principalDiagnosis.code": { name: "主要诊断代码", code: "DE05.01.024.00", aliases: ["主要诊断代码", "主要诊断疾病编码", "疾病编码"] },
  "procedures.primary.name": { name: "主要手术及操作名称", code: "DE06.00.094.00.005", aliases: ["主要手术及操作名称", "手术名称", "拟行手术"] },
  "procedures.primary.code": { name: "主要手术及操作代码", code: "DE06.00.093.00", aliases: ["主要手术及操作代码", "手术及操作代码"] },
  "procedures.primary.anesthesiaType": { name: "麻醉方式", code: "DE06.00.073.00", aliases: ["麻醉方式代码", "麻醉方式"] },
  "procedures.primary.operator.name": { name: "术者医师姓名", code: "DE02.01.039.00.161", aliases: ["手术者姓名", "术者姓名"] },
  "procedures.primary.anesthesiologist.name": { name: "麻醉医师姓名", code: "DE02.01.039.00.155", aliases: ["麻醉医师姓名"] },
  "inpatient.admissionSource": { name: "入院途径", code: "SETTLEMENT.inpatient.admissionSource", aliases: ["入院途径"] },
  "inpatient.medicalType": { name: "住院医疗类型", code: "SETTLEMENT.inpatient.medicalType", aliases: ["住院医疗类型"] },
  "inpatient.treatmentCategory": { name: "治疗类别", code: "SETTLEMENT.inpatient.treatmentCategory", aliases: ["治疗类别"] },
  "discharge.method": { name: "离院方式", code: "SETTLEMENT.discharge.method", aliases: ["离院方式", "出院方式"] },
});

const SELECT_OPTIONS = Object.freeze({
  "patient.idType": ["居民身份证", "居民户口簿", "护照", "军官证", "港澳居民来往内地通行证", "台湾居民来往大陆通行证", "外国人永久居留身份证", "其他"],
  "patient.sex": ["男", "女", "未知"],
  "inpatient.medicalType": ["住院", "日间手术"],
  "inpatient.admissionSource": ["急诊", "门诊", "其他医疗机构转入", "其他"],
  "inpatient.treatmentCategory": ["西医", "中医", "中西医"],
  "discharge.method": ["医嘱离院", "医嘱转院", "医嘱转社区卫生服务机构/乡镇卫生院", "非医嘱离院", "死亡", "其他"],
  "discharge.readmissionWithin31Days": ["无", "有"],
});

export function settlementFieldCode(path) { return SETTLEMENT_SOURCE_FIELDS[path]?.code || `SETTLEMENT.${path}`; }
export function settlementFieldOptions(path) { return SELECT_OPTIONS[path] || []; }
export function getSettlementValue(target, path) { return String(path || "").split(".").reduce((value, key) => value?.[key], target); }
export function setSettlementValue(target, path, value) {
  const parts = String(path || "").split("."); let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) { const key = parts[index]; const next = parts[index + 1]; if (!cursor[key]) cursor[key] = /^\d+$/.test(next) ? [] : {}; cursor = cursor[key]; }
  if (parts.length) cursor[parts.at(-1)] = value; return target;
}
function feeRow(episode, category, label) { const items = (episode.fees.items || []).filter((item) => item.category === category); return { label, amount: sum(items,"amount"), classA: sum(items,"classA"), classB: sum(items,"classB"), selfPay: sum(items,"selfPay"), other: sum(items,"other"), source: items.length ? "HIS费用明细" : "未映射" }; }
export function recalculateSettlementTotals(list) { list.fees.totals = { amount: sum(list.fees.rows,"amount"), classA: sum(list.fees.rows,"classA"), classB: sum(list.fees.rows,"classB"), selfPay: sum(list.fees.rows,"selfPay"), other: sum(list.fees.rows,"other") }; return list.fees.totals; }

export function buildSettlementList(sourceEpisode, { sourceDocuments = [], overrides = {} } = {}) {
  const episode = clone(sourceEpisode); const procedures = episode.procedures || [];
  const feeRows = [["bed","床位费"],["consultation","诊察费"],["examination","检查费"],["laboratory","化验费"],["treatment","治疗费"],["surgery","手术费"],["nursing","护理费"],["material","卫生材料费"],["westernMedicine","西药费"],["tcm","中药饮片费"],["patentMedicine","中成药费"],["general","一般诊疗费"],["registration","挂号费"],["other","其他费"]].map(([category,label])=>feeRow(episode,category,label));
  const list = {
    objectType:"medical_security_fund_settlement_list", templateVersion:"国家医保局193项样式/P0版式复刻", sourceReference:"references/医保结算清单（193项）.pdf",
    episodeId:episode.episodeId, claimSerialNumber:episode.claimSerialNumber, institution:episode.institution, insurance:episode.insurance, medicalRecordNumber:episode.medicalRecordNumber, inpatientNumber:episode.inpatientNumber, reportDate:new Date().toISOString().slice(0,10), patient:clone(episode.patient),
    outpatientSpecialDisease:{department:"",visitDate:"",diseaseName:"",diseaseCode:"",procedureName:"",procedureCode:""},
    inpatient:{medicalType:episode.admission.medicalType,admissionSource:episode.admission.source,treatmentCategory:episode.admission.treatmentCategory,admissionAt:episode.admission.at,admissionDepartment:episode.admission.department,transferDepartment:"",dischargeAt:episode.discharge.at,dischargeDepartment:episode.discharge.department,lengthOfStay:lengthOfStay(episode),outpatientWestern:episode.diagnoses.outpatientWestern,dischargeWestern:[episode.diagnoses.principal,...episode.diagnoses.secondary],principalDiagnosis:clone(episode.diagnoses.principal),secondaryDiagnoses:clone(episode.diagnoses.secondary),diagnosisCodeCount:1+episode.diagnoses.secondary.length},
    procedures:{primary:procedures[0]?clone(procedures[0]):null,others:clone(procedures.slice(1)),codeCount:procedures.length}, clinicalProcess:clone(episode.clinicalProcess), discharge:clone(episode.discharge),
    fees:{businessSerialNumber:episode.fees.businessSerialNumber,invoiceCode:episode.fees.invoiceCode,invoiceNumber:episode.fees.invoiceNumber,settlementStart:episode.fees.settlementStart,settlementEnd:episode.fees.settlementEnd,rows:feeRows,totals:{}}, payment:clone(episode.payment),
    fieldSources:{}, fieldFactRefs:{}, fieldEvidenceRefs:{}, factConflicts:[], clinicalFactContext:null,
  };
  recalculateSettlementTotals(list);

  // Single source of truth: resolve patient facts first, then project confirmed facts into settlement fields.
  const context = sourceEpisode.clinicalFactContext || buildClinicalFactContext({ episode: sourceEpisode, documentSnapshots: sourceDocuments.length ? sourceDocuments : (sourceEpisode.documentSnapshots || []) });
  list.clinicalFactContext = context;
  list.factRevision = context.revision;
  list.factConflicts = context.conflicts.filter((x) => x.impactScope.includes('SETTLEMENT'));
  for (const path of Object.keys(SETTLEMENT_SOURCE_FIELDS)) list.fieldSources[path] = "Episode 基线";
  const projection = context.projections?.settlement?.fields || {};
  for (const [path, projected] of Object.entries(projection)) {
    setSettlementValue(list, path, projected.value);
    list.fieldSources[path] = "患者事实层";
    list.fieldFactRefs[path] = projected.factId;
    list.fieldEvidenceRefs[path] = projected.evidenceRefs || [];
  }
  for (const [path, value] of Object.entries(overrides)) { setSettlementValue(list, path, value); list.fieldSources[path] = "手动修改"; list.fieldFactRefs[path] = null; list.fieldEvidenceRefs[path] = []; }
  recalculateSettlementTotals(list); return list;
}

export function validateSettlementList(list) {
  const issues=[]; const required=(value,field,label)=>{if(value===undefined||value===null||String(value).trim()==="")issues.push({severity:"error",code:"REQUIRED_FIELD_MISSING",field,message:`${label}不能为空。`});};
  required(list.claimSerialNumber,"claimSerialNumber","清单流水号"); required(list.institution?.name,"institution.name","定点医疗机构名称"); required(list.institution?.code,"institution.code","定点医疗机构代码"); required(list.insurance?.number,"insurance.number","医保编号"); required(list.medicalRecordNumber,"medicalRecordNumber","病案号"); required(list.patient?.name,"patient.name","姓名"); required(list.patient?.sex,"patient.sex","性别"); required(list.patient?.idType,"patient.idType","患者证件类别"); required(list.patient?.idNumber,"patient.idNumber","患者证件号码"); required(list.inpatient?.admissionAt,"inpatient.admissionAt","入院时间"); required(list.inpatient?.dischargeAt,"inpatient.dischargeAt","出院时间"); required(list.inpatient?.principalDiagnosis?.name,"inpatient.principalDiagnosis.name","主要诊断"); required(list.inpatient?.principalDiagnosis?.code,"inpatient.principalDiagnosis.code","主要诊断代码"); required(list.discharge?.method,"discharge.method","离院方式");
  for(const conflict of list.factConflicts||[]){
    issues.push({severity:conflict.blocking?'error':'warning',code:'FACT_CONFLICT_UNRESOLVED',field:conflict.concept,message:conflict.reason,conflictId:conflict.conflictId,evidenceRefs:conflict.candidates?.map((x)=>x.evidenceId).filter(Boolean)||[],impactScope:conflict.impactScope||[]});
  }
  const start=new Date(list.inpatient.admissionAt),end=new Date(list.inpatient.dischargeAt);if(Number.isFinite(start.getTime())&&Number.isFinite(end.getTime())&&end<=start)issues.push({severity:"error",code:"TIME_ORDER_INVALID",field:"inpatient.dischargeAt",message:"出院时间必须晚于入院时间。"});
  const itemTotal=sum(list.fees.rows,"amount");if(Math.abs(itemTotal-money(list.fees.totals.amount))>0.01)issues.push({severity:"error",code:"FEE_TOTAL_MISMATCH",field:"fees.totals.amount",message:"费用项目合计与金额合计不一致。"});
  const paymentTotal=money(list.payment.fund)+money(list.payment.individualBurden);if(paymentTotal>0&&Math.abs(paymentTotal-itemTotal)>0.01)issues.push({severity:"warning",code:"PAYMENT_TOTAL_CHECK",field:"payment",message:"基金支付 + 个人负担与住院费用金额合计不一致，请核对结算结果。"});
  issues.valid=!issues.some((issue)=>issue.severity==="error");return issues;
}
export function formatMoney(value){return money(value).toFixed(2);}
