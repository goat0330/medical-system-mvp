import { formatMoney, settlementFieldCode, settlementFieldOptions, SETTLEMENT_SOURCE_FIELDS } from "./settlement.js";

const e = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const dt = (value) => value ? String(value).replace("T", " ").replace(/\+.*$/, "").slice(0, 16) : "";
const fieldName = (path) => {
  if (SETTLEMENT_SOURCE_FIELDS[path]) return SETTLEMENT_SOURCE_FIELDS[path].name;
  const indexed = path.match(/^inpatient\.secondaryDiagnoses\.(\d+)\.(name|code|conditionAtAdmission)$/);
  if (indexed) return `其他诊断${Number(indexed[1]) + 1}${{ name: "名称", code: "代码", conditionAtAdmission: "入院病情" }[indexed[2]]}`;
  const fee = path.match(/^fees\.rows\.(\d+)\.(amount|classA|classB|selfPay|other)$/);
  if (fee) return `${{ amount: "金额", classA: "甲类金额", classB: "乙类金额", selfPay: "自费金额", other: "其他金额" }[fee[2]]}`;
  const operation = path.match(/^procedures\.(?:primary|others\.\d+)\.(name|code|anesthesiaType)$/);
  if (operation) return { name: "手术及操作名称", code: "手术及操作代码", anesthesiaType: "麻醉方式" }[operation[1]];
  const names = {
    claimSerialNumber: "清单流水号", "institution.name": "定点医疗机构名称", "institution.code": "定点医疗机构代码", "institution.level": "医保结算等级",
    "insurance.number": "医保编号", "insurance.region": "参保地", "insurance.type": "医保类型", medicalRecordNumber: "病案号",
    "patient.idType": "患者证件类别", "patient.idNumber": "患者证件号码", "patient.contactName": "联系人姓名", "patient.contactRelationship": "联系人关系", "patient.contactPhone": "联系人电话",
    "patient.currentAddress": "现住址", "patient.sex": "性别", "patient.birthDate": "出生日期", "patient.age": "年龄", "patient.nationality": "国籍", "patient.ethnicity": "民族", "patient.occupation": "职业",
    "inpatient.medicalType": "住院医疗类型", "inpatient.admissionSource": "入院途径", "inpatient.treatmentCategory": "治疗类别", "inpatient.transferDepartment": "转科科别", "inpatient.outpatientWestern": "门急诊诊断", "inpatient.outpatientWesternCodes": "门急诊诊断代码",
    "inpatient.dischargeDepartment": "出院科别", "inpatient.diagnosisCodeCount": "诊断代码计数", "procedures.codeCount": "手术及操作代码计数",
    "discharge.readmissionPurpose": "31天内再住院目的", "discharge.method": "离院方式", "discharge.attendingPhysician.name": "主诊医师姓名", "discharge.attendingPhysician.code": "主诊医师代码", "discharge.responsibleNurse.name": "责任护士姓名", "discharge.responsibleNurse.code": "责任护士代码",
    "fees.businessSerialNumber": "业务流水号", "fees.invoiceCode": "票据代码", "fees.invoiceNumber": "票据号码", "fees.settlementStart": "结算开始日期", "fees.settlementEnd": "结算结束日期",
    "payment.fund": "医保统筹基金支付", "payment.individualSelfPay": "个人自付", "payment.individualSelfExpense": "个人自费", "payment.supplemental": "补充医疗保险支付", "payment.employeeLargeAmount": "职工大额补助", "payment.residentCriticalIllness": "居民大病保险", "payment.civilServant": "公务员医疗补助", "payment.medicalAssistance": "医疗救助支付", "payment.enterpriseSupplemental": "企业补充", "payment.commercial": "商业保险", "payment.other": "其他支付明细", "payment.individualAccount": "个人账户支付", "payment.individualCash": "个人现金支付",
  };
  return names[path] || path.split(".").at(-1) || "结算清单字段";
};
const value = (v, path = "", label = "") => {
  const name = label || fieldName(path);
  const id = `settlement-${path.replaceAll(".", "-")}`;
  const options = settlementFieldOptions(path);
  const optionAttrs = options.length
    ? ` data-hm-items="${e(options.join("#"))}" _texttype="下拉" _click="true" _jointsymbol="," _selecttype="单选"`
    : "";
  const display = v && typeof v === "object" ? v.value ?? v.label ?? v.code ?? "" : v;
  return `<span class="new-textbox sheet-value" contenteditable="false" data-hm-id="${e(id)}" data-hm-name="${e(name)}" data-hm-code="${e(settlementFieldCode(path))}" data-hm-node="newtextbox" data-settlement-path="${e(path)}"${optionAttrs}><span class="new-textbox-content" contenteditable="true"${optionAttrs}>${e(display)}</span></span>`;
};
function diagnosisRows(list) {
  const rows = [list.inpatient.principalDiagnosis || {}, ...list.inpatient.secondaryDiagnoses];
  const padded = [...rows];
  while (padded.length < 6) padded.push({ name: "", code: "", conditionAtAdmission: "" });
  return padded.map((dx, i) => `<tr>
    <td>${i === 0 ? "主要诊断" : `其他诊断${i}`}</td>
    <td>${value(dx.name, i === 0 ? "inpatient.principalDiagnosis.name" : `inpatient.secondaryDiagnoses.${i - 1}.name`, i === 0 ? "主要诊断" : "其他诊断名称")}</td>
    <td>${value(dx.code, i === 0 ? "inpatient.principalDiagnosis.code" : `inpatient.secondaryDiagnoses.${i - 1}.code`, i === 0 ? "主要诊断代码" : "其他诊断代码")}</td>
    <td>${value(dx.conditionAtAdmission, i === 0 ? "inpatient.principalDiagnosis.conditionAtAdmission" : `inpatient.secondaryDiagnoses.${i - 1}.conditionAtAdmission`, i === 0 ? "主要诊断入院病情" : "其他诊断入院病情")}</td>
    <td></td><td></td><td></td>
  </tr>`).join("");
}

function procedureRows(list) {
  const rows = [list.procedures.primary || {}, ...list.procedures.others.map((operation) => operation || {})];
  const padded = [...rows];
  while (padded.length < 4) padded.push({});
  return padded.map((op, i) => `<tr>
    <td>${i === 0 ? "主要手术及操作" : `其他手术及操作 ${i}`}</td>
    <td>${value(op.name, i === 0 ? "procedures.primary.name" : `procedures.others.${i - 1}.name`, i === 0 ? "主要手术及操作名称" : "其他手术及操作名称")}</td>
    <td>${value(op.code, i === 0 ? "procedures.primary.code" : `procedures.others.${i - 1}.code`, i === 0 ? "主要手术及操作代码" : "其他手术及操作代码")}</td>
    <td>${value(op.anesthesiaType, i === 0 ? "procedures.primary.anesthesiaType" : `procedures.others.${i - 1}.anesthesiaType`)}</td>
    <td>${value(op.operator?.name, i === 0 ? "procedures.primary.operator.name" : `procedures.others.${i - 1}.operator.name`)}</td>
    <td>${value(op.operator?.code, i === 0 ? "procedures.primary.operator.code" : `procedures.others.${i - 1}.operator.code`)}</td>
    <td>${value(op.anesthesiologist?.name, i === 0 ? "procedures.primary.anesthesiologist.name" : `procedures.others.${i - 1}.anesthesiologist.name`)}</td>
    <td>${value(op.anesthesiologist?.code, i === 0 ? "procedures.primary.anesthesiologist.code" : `procedures.others.${i - 1}.anesthesiologist.code`)}</td>
  </tr><tr class="procedure-time-row"><td colspan="8">手术及操作起止时间 ${value(op.startAt ? `${dt(op.startAt)} — ${dt(op.endAt)}` : "", i === 0 ? "procedures.primary.period" : `procedures.others.${i - 1}.period`)}</td></tr>`).join("");
}

export function renderSettlementPaper(list) {
  const p = list.patient;
  const ip = list.inpatient;
  const fee = list.fees;
  const pay = list.payment;
  const hasFeeSource = fee.rows.some((row) => row.source === "HIS费用明细");
  const moneyValue = (amount, path, hasSource = true) => value(hasSource && amount != null ? formatMoney(amount) : "", path);
  return `<body contenteditable="true" style="margin:0;padding:18px;background:var(--app-editor-canvas);font-family:var(--app-font-family);font-size:12px;line-height:1.5"><div class="settlement-paper-stack">
    <section class="settlement-sheet">
      <div class="sheet-attachment">附件 1：</div>
      <h1>XX 省（自治区、直辖市）XX 市医疗保障基金结算清单（样式）</h1>
      <div class="sheet-head-grid">
        <div>清单流水号 ${value(list.claimSerialNumber, "claimSerialNumber")}</div>
        <div>定点医疗机构名称 ${value(list.institution.name, "institution.name")}</div>
        <div>定点医疗机构代码 ${value(list.institution.code, "institution.code")}</div>
        <div>医保结算等级 ${value(list.institution.level, "institution.level")}</div>
        <div>医保编号 ${value(list.insurance.number, "insurance.number")}</div>
        <div>病案号 ${value(list.medicalRecordNumber, "medicalRecordNumber")}</div>
        <div>申报时间 ${value(list.reportDate, "reportDate")}</div>
      </div>
      <h2>一、基本信息</h2>
      <table class="sheet-table basic-table"><tbody>
        <tr><th>姓名</th><td>${value(p.name,"patient.name")}</td><th>性别</th><td>${value(p.sex,"patient.sex")}</td><th>出生日期</th><td>${value(p.birthDate,"patient.birthDate")}</td><th>年龄</th><td>${value(p.age,"patient.age")} 岁</td></tr>
        <tr><th>国籍</th><td>${value(p.nationality,"patient.nationality")}</td><th>民族</th><td>${value(p.ethnicity,"patient.ethnicity")}</td><th>患者证件类别</th><td>${value(p.idType,"patient.idType")}</td><th>患者证件号码</th><td>${value(p.idNumber,"patient.idNumber")}</td></tr>
        <tr><th>职业</th><td>${value(p.occupation,"patient.occupation")}</td><th>现住址</th><td colspan="3">${value(p.currentAddress,"patient.currentAddress")}</td><th>参保地</th><td>${value(list.insurance.region,"insurance.region")}</td></tr>
        <tr><th>联系人姓名</th><td>${value(p.contactName,"patient.contactName")}</td><th>关系</th><td>${value(p.contactRelationship,"patient.contactRelationship")}</td><th>电话</th><td>${value(p.contactPhone,"patient.contactPhone")}</td><th>医保类型</th><td>${value(list.insurance.type,"insurance.type")}</td></tr>
        <tr><th>特殊人员类型</th><td>${value(list.insurance.specialPersonnelType,"insurance.specialPersonnelType")}</td><th>新生儿入院类型</th><td></td><th>新生儿出生体重</th><td> 克</td><th>新生儿入院体重</th><td> 克</td></tr>
      </tbody></table>
      <h2>二、门诊慢特病诊疗信息</h2>
      <table class="sheet-table"><tbody>
        <tr><th>诊断科别</th><td>${value(list.outpatientSpecialDisease.department,"outpatientSpecialDisease.department")}</td><th>就诊日期</th><td>${value(list.outpatientSpecialDisease.visitDate,"outpatientSpecialDisease.visitDate")}</td></tr>
        <tr><th>病种名称</th><td>${value(list.outpatientSpecialDisease.diseaseName,"outpatientSpecialDisease.diseaseName")}</td><th>病种代码</th><td>${value(list.outpatientSpecialDisease.diseaseCode,"outpatientSpecialDisease.diseaseCode")}</td></tr>
        <tr><th>手术及操作名称</th><td>${value(list.outpatientSpecialDisease.procedureName,"outpatientSpecialDisease.procedureName")}</td><th>手术及操作代码</th><td>${value(list.outpatientSpecialDisease.procedureCode,"outpatientSpecialDisease.procedureCode")}</td></tr>
      </tbody></table>
      <h2>三、住院诊疗信息</h2>
      <div class="sheet-line">住院医疗类型 ${value(ip.medicalType,"inpatient.medicalType")}</div>
      <div class="sheet-line">入院途径 ${value(ip.admissionSource,"inpatient.admissionSource")}</div>
      <div class="sheet-line">治疗类别 ${value(ip.treatmentCategory,"inpatient.treatmentCategory")}</div>
      <table class="sheet-table"><tbody>
        <tr><th>入院时间</th><td>${value(dt(ip.admissionAt),"inpatient.admissionAt")}</td><th>入院科别</th><td>${value(ip.admissionDepartment,"inpatient.admissionDepartment")}</td><th>转科科别</th><td>${value(ip.transferDepartment,"inpatient.transferDepartment")}</td></tr>
        <tr><th>出院时间</th><td>${value(dt(ip.dischargeAt),"inpatient.dischargeAt")}</td><th>出院科别</th><td>${value(ip.dischargeDepartment,"inpatient.dischargeDepartment")}</td><th>实际住院</th><td>${value(ip.lengthOfStay,"inpatient.lengthOfStay")} 天</td></tr>
        <tr><th>门（急）诊诊断（西医）</th><td colspan="3">${value(ip.outpatientWestern.map(x=>x.name).join("；"),"inpatient.outpatientWestern")}</td><th>疾病代码</th><td>${value(ip.outpatientWestern.map(x=>x.code).join("；"),"inpatient.outpatientWesternCodes")}</td></tr>
      </tbody></table>
      <table class="sheet-table diagnosis-table"><thead><tr><th>出院西医诊断</th><th>诊断名称</th><th>疾病代码</th><th>入院病情</th><th>出院中医诊断</th><th>疾病代码</th><th>入院病情</th></tr></thead><tbody>${diagnosisRows(list)}</tbody></table>
      <div class="sheet-line">诊断代码计数 ${value(ip.diagnosisCodeCount,"inpatient.diagnosisCodeCount")}</div>
      <table class="sheet-table procedure-table"><thead><tr><th>类型</th><th>名称</th><th>代码</th><th>麻醉方式</th><th>术者医师姓名</th><th>术者代码</th><th>麻醉医师姓名</th><th>麻醉医师代码</th></tr></thead><tbody>${procedureRows(list)}</tbody></table>
      <div class="sheet-line">手术及操作代码计数 ${value(list.procedures.codeCount,"procedures.codeCount")}</div>
      <div class="sheet-line">呼吸机使用时间 ${value(list.clinicalProcess.ventilatorDuration.days,"clinicalProcess.ventilatorDuration.days")} 天 ${value(list.clinicalProcess.ventilatorDuration.hours,"clinicalProcess.ventilatorDuration.hours")} 小时 ${value(list.clinicalProcess.ventilatorDuration.minutes,"clinicalProcess.ventilatorDuration.minutes")} 分钟</div>
      <div class="sheet-line">颅脑损伤患者昏迷时间：入院前 ${value(list.clinicalProcess.comaBeforeAdmission.days,"clinicalProcess.comaBeforeAdmission.days")} 天 ${value(list.clinicalProcess.comaBeforeAdmission.hours,"clinicalProcess.comaBeforeAdmission.hours")} 小时 ${value(list.clinicalProcess.comaBeforeAdmission.minutes,"clinicalProcess.comaBeforeAdmission.minutes")} 分钟；入院后 ${value(list.clinicalProcess.comaAfterAdmission.days,"clinicalProcess.comaAfterAdmission.days")} 天 ${value(list.clinicalProcess.comaAfterAdmission.hours,"clinicalProcess.comaAfterAdmission.hours")} 小时 ${value(list.clinicalProcess.comaAfterAdmission.minutes,"clinicalProcess.comaAfterAdmission.minutes")} 分钟</div>
      <table class="sheet-table"><thead><tr><th>重症监护病房类型</th><th>进重症监护室时间</th><th>出重症监护室时间</th><th>合计</th></tr></thead><tbody><tr><td colspan="4" class="blank-row">${list.clinicalProcess.icuStays.length ? "已有 ICU 记录" : "无"}</td></tr></tbody></table>
      <table class="sheet-table"><thead><tr><th>输血品种</th><th>输血量</th><th>输血计量单位</th></tr></thead><tbody><tr><td colspan="3" class="blank-row">${list.clinicalProcess.transfusions.length ? "已有输血记录" : "无"}</td></tr></tbody></table>
      <div class="sheet-line">特级护理天数 ${value(list.clinicalProcess.nursingDays.special,"clinicalProcess.nursingDays.special")}　一级护理天数 ${value(list.clinicalProcess.nursingDays.primary,"clinicalProcess.nursingDays.primary")}　二级护理天数 ${value(list.clinicalProcess.nursingDays.secondary,"clinicalProcess.nursingDays.secondary")}　三级护理天数 ${value(list.clinicalProcess.nursingDays.tertiary,"clinicalProcess.nursingDays.tertiary")}</div>
      <div class="sheet-line sheet-choice-line">离院方式 ${value(list.discharge.method,"discharge.method")}</div>
      <div class="sheet-line">是否有出院 31 天内再住院计划 ${value(list.discharge.readmissionWithin31Days,"discharge.readmissionWithin31Days")}　目的 ${value(list.discharge.readmissionPurpose,"discharge.readmissionPurpose")}</div>
      <table class="sheet-table"><tbody>
        <tr><th>主诊医师姓名</th><td>${value(list.discharge.attendingPhysician?.name,"discharge.attendingPhysician.name")}</td><th>主诊医师代码</th><td>${value(list.discharge.attendingPhysician?.code,"discharge.attendingPhysician.code")}</td></tr>
        <tr><th>责任护士姓名</th><td>${value(list.discharge.responsibleNurse?.name,"discharge.responsibleNurse.name")}</td><th>责任护士代码</th><td>${value(list.discharge.responsibleNurse?.code,"discharge.responsibleNurse.code")}</td></tr>
      </tbody></table>
      <h2>四、医疗收费信息</h2>
      <div class="sheet-head-grid fee-meta">
        <div>业务流水号 ${value(fee.businessSerialNumber,"fees.businessSerialNumber")}</div>
        <div>票据代码 ${value(fee.invoiceCode,"fees.invoiceCode")}</div>
        <div>票据号码 ${value(fee.invoiceNumber,"fees.invoiceNumber")}</div>
        <div>结算开始日期 ${value(fee.settlementStart,"fees.settlementStart")}　结算结束日期 ${value(fee.settlementEnd,"fees.settlementEnd")}</div>
      </div>
      <table class="sheet-table fee-table"><thead><tr><th>项目名称</th><th>金额</th><th>甲类</th><th>乙类</th><th>自费</th><th>其他</th></tr></thead><tbody>
        ${fee.rows.map((r,i)=>`<tr><td>${e(r.label)}</td><td>${moneyValue(r.amount,`fees.rows.${i}.amount`,r.source==="HIS费用明细")}</td><td>${moneyValue(r.classA,`fees.rows.${i}.classA`,r.source==="HIS费用明细")}</td><td>${moneyValue(r.classB,`fees.rows.${i}.classB`,r.source==="HIS费用明细")}</td><td>${moneyValue(r.selfPay,`fees.rows.${i}.selfPay`,r.source==="HIS费用明细")}</td><td>${moneyValue(r.other,`fees.rows.${i}.other`,r.source==="HIS费用明细")}</td></tr>`).join("")}
        <tr class="total-row"><td>金额合计</td><td class="settlement-total--amount" data-settlement-total="amount">${hasFeeSource?formatMoney(fee.totals.amount):""}</td><td class="settlement-total--classA" data-settlement-total="classA">${hasFeeSource?formatMoney(fee.totals.classA):""}</td><td class="settlement-total--classB" data-settlement-total="classB">${hasFeeSource?formatMoney(fee.totals.classB):""}</td><td class="settlement-total--selfPay" data-settlement-total="selfPay">${hasFeeSource?formatMoney(fee.totals.selfPay):""}</td><td class="settlement-total--other" data-settlement-total="other">${hasFeeSource?formatMoney(fee.totals.other):""}</td></tr>
      </tbody></table>
      <table class="sheet-table payment-table"><tbody>
        <tr class="payment-first-row"><th colspan="2" class="payment-major-label">医保统筹基金支付</th><td class="payment-left-amount">${moneyValue(pay.fund,"payment.fund")}</td><th rowspan="5" class="payment-parent-label">个人负担</th><th rowspan="3" class="payment-personal-label">个人自付</th><td rowspan="3" class="payment-personal-value">${moneyValue(pay.individualSelfPay,"payment.individualSelfPay")}</td></tr>
        <tr><th rowspan="3" class="payment-major-label payment-left-group">补充医疗保险支付</th><th class="payment-left-subcategory">职工大额补助</th><td class="payment-left-amount">${moneyValue(pay.employeeLargeAmount,"payment.employeeLargeAmount")}</td></tr>
        <tr><th class="payment-left-subcategory">居民大病保险</th><td class="payment-left-amount">${moneyValue(pay.residentCriticalIllness,"payment.residentCriticalIllness")}</td></tr>
        <tr><th class="payment-left-subcategory">公务员医疗补助</th><td class="payment-left-amount">${moneyValue(pay.civilServant,"payment.civilServant")}</td><th rowspan="2" class="payment-personal-label">个人自费</th><td rowspan="2" class="payment-personal-value">${moneyValue(pay.individualSelfExpense,"payment.individualSelfExpense")}</td></tr>
        <tr class="payment-group-end"><th colspan="2" class="payment-major-label">医疗救助支付</th><td class="payment-left-amount">${moneyValue(pay.medicalAssistance,"payment.medicalAssistance")}</td></tr>
        <tr class="payment-group-start"><th rowspan="3" class="payment-major-label payment-left-group">其他支付</th><th class="payment-left-subcategory">企业补充</th><td class="payment-left-amount">${moneyValue(pay.enterpriseSupplemental,"payment.enterpriseSupplemental")}</td><th rowspan="3" class="payment-parent-label">个人支付</th><th rowspan="2" class="payment-personal-label">个人账户<br>支付</th><td rowspan="2" class="payment-personal-value">${moneyValue(pay.individualAccount,"payment.individualAccount")}</td></tr>
        <tr><th class="payment-left-subcategory">商业保险</th><td class="payment-left-amount">${moneyValue(pay.commercial,"payment.commercial")}</td></tr>
        <tr><th class="payment-left-subcategory">……</th><td class="payment-left-amount">${moneyValue(pay.other,"payment.other")}</td><th class="payment-personal-label">个人现金<br>支付</th><td class="payment-personal-value">${moneyValue(pay.individualCash,"payment.individualCash")}</td></tr>
      </tbody></table>
      <div class="sheet-line sheet-choice-line">医保支付方式 ${value(pay.method,"payment.method")}</div>
      <table class="sheet-table"><tbody><tr><th>定点医疗机构填报部门</th><td>医保办</td><th>医保经办机构</th><td></td><th>代码</th><td></td></tr><tr><th>定点医疗机构填报人</th><td>演示用户</td><th>医保机构经办人</th><td></td><th>代码</th><td></td></tr></tbody></table>
      <div class="sheet-source-note">来源：病案首页、入院 / 病程 / 手术 / 出院文书、HIS 费用与医保结算演示数据</div>
    </section>
  </div></body>`;
}
