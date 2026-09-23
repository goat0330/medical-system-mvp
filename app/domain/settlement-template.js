import { formatMoney } from "./settlement.js";

const e = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const dt = (value) => value ? String(value).replace("T", " ").replace(/\+.*$/, "").slice(0, 16) : "";
const value = (v, path = "") => `<span class="sheet-value" contenteditable="true" data-settlement-path="${e(path)}">${e(v || "")}</span>`;
const tick = (on, label) => `<span class="sheet-choice">${on ? "☑" : "☐"} ${e(label)}</span>`;
const sourceTag = (source) => source ? `<span class="source-tag">${e(source)}</span>` : "";

function diagnosisRows(list) {
  const rows = [list.inpatient.principalDiagnosis, ...list.inpatient.secondaryDiagnoses].filter(Boolean);
  const padded = [...rows];
  while (padded.length < 6) padded.push({ name: "", code: "", conditionAtAdmission: "" });
  return padded.map((dx, i) => `<tr>
    <td>${i === 0 ? "主要诊断" : `其他诊断${i}`}</td>
    <td>${value(dx.name, `diagnosis.${i}.name`)}</td>
    <td>${value(dx.code, `diagnosis.${i}.code`)}</td>
    <td>${value(dx.conditionAtAdmission, `diagnosis.${i}.condition`)}</td>
    <td></td><td></td><td></td>
  </tr>`).join("");
}

function procedureRows(list) {
  const rows = [list.procedures.primary, ...list.procedures.others].filter(Boolean);
  const padded = [...rows];
  while (padded.length < 4) padded.push({});
  return padded.map((op, i) => `<tr>
    <td>${i === 0 ? "主要手术及操作" : `其他手术及操作 ${i}`}</td>
    <td>${value(op.name, `procedure.${i}.name`)}</td>
    <td>${value(op.code, `procedure.${i}.code`)}</td>
    <td>${value(op.anesthesiaType, `procedure.${i}.anesthesia`)}</td>
    <td>${value(op.operator?.name, `procedure.${i}.operator`)}</td>
    <td>${value(op.operator?.code, `procedure.${i}.operatorCode`)}</td>
    <td>${value(op.anesthesiologist?.name, `procedure.${i}.anesthesiologist`)}</td>
    <td>${value(op.anesthesiologist?.code, `procedure.${i}.anesthesiologistCode`)}</td>
  </tr><tr class="procedure-time-row"><td colspan="8">手术及操作起止时间 ${value(op.startAt ? `${dt(op.startAt)} — ${dt(op.endAt)}` : "", `procedure.${i}.period`)}</td></tr>`).join("");
}

export function renderSettlementPaper(list) {
  const p = list.patient;
  const ip = list.inpatient;
  const fee = list.fees;
  const pay = list.payment;
  return `<div class="settlement-paper-stack">
    <section class="settlement-sheet" data-page="1">
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
        <tr><th>姓名</th><td>${value(p.name,"patient.name")}</td><th>性别</th><td>${tick(p.sex === "男", "1.男")} ${tick(p.sex === "女", "2.女")}</td><th>出生日期</th><td>${value(p.birthDate,"patient.birthDate")}</td><th>年龄</th><td>${value(p.age,"patient.age")} 岁</td></tr>
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
      <div class="sheet-line">住院医疗类型 ${tick(ip.medicalType === "住院", "1.住院")} ${tick(ip.medicalType === "日间手术", "2.日间手术")}</div>
      <div class="sheet-line">入院途径 ${tick(ip.admissionSource === "急诊", "1.急诊")} ${tick(ip.admissionSource === "门诊", "2.门诊")} ${tick(ip.admissionSource === "其他医疗机构转入", "3.其他医疗机构转入")} ${tick(!["急诊","门诊","其他医疗机构转入"].includes(ip.admissionSource), "9.其他")}</div>
      <div class="sheet-line">治疗类别 ${tick(ip.treatmentCategory === "西医", "1.西医")} ${tick(ip.treatmentCategory?.includes("中医"), "2.中医")} ${tick(ip.treatmentCategory === "中西医", "3.中西医")}</div>
      <table class="sheet-table"><tbody>
        <tr><th>入院时间</th><td>${value(dt(ip.admissionAt),"inpatient.admissionAt")}</td><th>入院科别</th><td>${value(ip.admissionDepartment,"inpatient.admissionDepartment")}</td><th>转科科别</th><td>${value(ip.transferDepartment,"inpatient.transferDepartment")}</td></tr>
        <tr><th>出院时间</th><td>${value(dt(ip.dischargeAt),"inpatient.dischargeAt")}</td><th>出院科别</th><td>${value(ip.dischargeDepartment,"inpatient.dischargeDepartment")}</td><th>实际住院</th><td>${value(ip.lengthOfStay,"inpatient.lengthOfStay")} 天</td></tr>
        <tr><th>门（急）诊诊断（西医）</th><td colspan="3">${value(ip.outpatientWestern.map(x=>x.name).join("；"),"inpatient.outpatientWestern")}</td><th>疾病代码</th><td>${value(ip.outpatientWestern.map(x=>x.code).join("；"),"inpatient.outpatientWesternCodes")}</td></tr>
      </tbody></table>
      <table class="sheet-table diagnosis-table"><thead><tr><th>出院西医诊断</th><th>诊断名称</th><th>疾病代码</th><th>入院病情</th><th>出院中医诊断</th><th>疾病代码</th><th>入院病情</th></tr></thead><tbody>${diagnosisRows(list)}</tbody></table>
      <div class="sheet-page-no">第 1 页 / 共 3 页 ${sourceTag("患者/诊断来源：病案首页与编码数据")}</div>
    </section>

    <section class="settlement-sheet" data-page="2">
      <h1>医疗保障基金结算清单（续页）</h1>
      <div class="sheet-line">诊断代码计数 ${value(ip.diagnosisCodeCount,"inpatient.diagnosisCodeCount")}</div>
      <table class="sheet-table procedure-table"><thead><tr><th>类型</th><th>名称</th><th>代码</th><th>麻醉方式</th><th>术者医师姓名</th><th>术者代码</th><th>麻醉医师姓名</th><th>麻醉医师代码</th></tr></thead><tbody>${procedureRows(list)}</tbody></table>
      <div class="sheet-line">手术及操作代码计数 ${value(list.procedures.codeCount,"procedures.codeCount")}</div>
      <div class="sheet-line">呼吸机使用时间 ${value(list.clinicalProcess.ventilatorDuration.days,"clinicalProcess.ventilator.days")} 天 ${value(list.clinicalProcess.ventilatorDuration.hours,"clinicalProcess.ventilator.hours")} 小时 ${value(list.clinicalProcess.ventilatorDuration.minutes,"clinicalProcess.ventilator.minutes")} 分钟</div>
      <div class="sheet-line">颅脑损伤患者昏迷时间：入院前 ${value(list.clinicalProcess.comaBeforeAdmission.days,"clinicalProcess.comaBefore.days")} 天 ${value(list.clinicalProcess.comaBeforeAdmission.hours,"clinicalProcess.comaBefore.hours")} 小时 ${value(list.clinicalProcess.comaBeforeAdmission.minutes,"clinicalProcess.comaBefore.minutes")} 分钟；入院后 ${value(list.clinicalProcess.comaAfterAdmission.days,"clinicalProcess.comaAfter.days")} 天 ${value(list.clinicalProcess.comaAfterAdmission.hours,"clinicalProcess.comaAfter.hours")} 小时 ${value(list.clinicalProcess.comaAfterAdmission.minutes,"clinicalProcess.comaAfter.minutes")} 分钟</div>
      <table class="sheet-table"><thead><tr><th>重症监护病房类型</th><th>进重症监护室时间</th><th>出重症监护室时间</th><th>合计</th></tr></thead><tbody><tr><td colspan="4" class="blank-row">${list.clinicalProcess.icuStays.length ? "已有 ICU 记录" : "无"}</td></tr></tbody></table>
      <table class="sheet-table"><thead><tr><th>输血品种</th><th>输血量</th><th>输血计量单位</th></tr></thead><tbody><tr><td colspan="3" class="blank-row">${list.clinicalProcess.transfusions.length ? "已有输血记录" : "无"}</td></tr></tbody></table>
      <div class="sheet-line">特级护理天数 ${value(list.clinicalProcess.nursingDays.special,"nursing.special")}　一级护理天数 ${value(list.clinicalProcess.nursingDays.primary,"nursing.primary")}　二级护理天数 ${value(list.clinicalProcess.nursingDays.secondary,"nursing.secondary")}　三级护理天数 ${value(list.clinicalProcess.nursingDays.tertiary,"nursing.tertiary")}</div>
      <div class="sheet-line sheet-choice-line">离院方式 ${tick(list.discharge.method === "医嘱离院", "1.医嘱离院")} ${tick(list.discharge.method === "医嘱转院", "2.医嘱转院")} ${tick(list.discharge.method?.includes("社区"), "3.转社区/乡镇卫生院")} ${tick(list.discharge.method === "非医嘱离院", "4.非医嘱离院")} ${tick(list.discharge.method === "死亡", "5.死亡")} ${tick(!["医嘱离院","医嘱转院","非医嘱离院","死亡"].includes(list.discharge.method), "9.其他")}</div>
      <div class="sheet-page-no">第 2 页 / 共 3 页 ${sourceTag("手术/临床过程来源：病案首页、EMR、HIS")}</div>
    </section>

    <section class="settlement-sheet" data-page="3">
      <h1>医疗保障基金结算清单（续页）</h1>
      <div class="sheet-line">是否有出院 31 天内再住院计划 ${tick(list.discharge.readmissionWithin31Days === "无", "1.无")} ${tick(list.discharge.readmissionWithin31Days !== "无", "2.有")}　目的 ${value("","discharge.readmissionPurpose")}</div>
      <table class="sheet-table"><tbody>
        <tr><th>主诊医师姓名</th><td>${value(list.discharge.attendingPhysician?.name,"discharge.attendingPhysician.name")}</td><th>主诊医师代码</th><td>${value(list.discharge.attendingPhysician?.code,"discharge.attendingPhysician.code")}</td></tr>
        <tr><th>责任护士姓名</th><td>${value(list.discharge.responsibleNurse?.name,"discharge.responsibleNurse.name")}</td><th>责任护士代码</th><td>${value(list.discharge.responsibleNurse?.code,"discharge.responsibleNurse.code")}</td></tr>
      </tbody></table>
      <h2>四、医疗收费信息</h2>
      <div class="sheet-head-grid fee-meta">
        <div>业务流水号 ${value(fee.businessSerialNumber,"fees.businessSerialNumber")}</div>
        <div>票据代码 ${value(fee.invoiceCode,"fees.invoiceCode")}</div>
        <div>票据号码 ${value(fee.invoiceNumber,"fees.invoiceNumber")}</div>
        <div>结算期间 ${value(`${fee.settlementStart} — ${fee.settlementEnd}`,"fees.period")}</div>
      </div>
      <table class="sheet-table fee-table"><thead><tr><th>项目名称</th><th>金额</th><th>甲类</th><th>乙类</th><th>自费</th><th>其他</th></tr></thead><tbody>
        ${fee.rows.map((r,i)=>`<tr><td>${e(r.label)}</td><td>${value(formatMoney(r.amount),`fees.rows.${i}.amount`)}</td><td>${value(formatMoney(r.classA),`fees.rows.${i}.classA`)}</td><td>${value(formatMoney(r.classB),`fees.rows.${i}.classB`)}</td><td>${value(formatMoney(r.selfPay),`fees.rows.${i}.selfPay`)}</td><td>${value(formatMoney(r.other),`fees.rows.${i}.other`)}</td></tr>`).join("")}
        <tr class="total-row"><td>金额合计</td><td>${formatMoney(fee.totals.amount)}</td><td>${formatMoney(fee.totals.classA)}</td><td>${formatMoney(fee.totals.classB)}</td><td>${formatMoney(fee.totals.selfPay)}</td><td>${formatMoney(fee.totals.other)}</td></tr>
      </tbody></table>
      <table class="sheet-table payment-table"><tbody>
        <tr><th>医保统筹基金支付</th><td>${value(formatMoney(pay.fund),"payment.fund")}</td><th>个人负担</th><td>${value(formatMoney(pay.individualBurden),"payment.individualBurden")}</td><th>个人自付</th><td>${value(formatMoney(pay.individualSelfPay),"payment.individualSelfPay")}</td></tr>
        <tr><th>补充医疗保险支付</th><td>${value(formatMoney(pay.supplemental),"payment.supplemental")}</td><th>职工大额补助</th><td>${value(formatMoney(pay.employeeLargeAmount),"payment.employeeLargeAmount")}</td><th>居民大病保险</th><td>${value(formatMoney(pay.residentCriticalIllness),"payment.residentCriticalIllness")}</td></tr>
        <tr><th>公务员医疗补助</th><td>${value(formatMoney(pay.civilServant),"payment.civilServant")}</td><th>医疗救助支付</th><td>${value(formatMoney(pay.medicalAssistance),"payment.medicalAssistance")}</td><th>其他支付</th><td>${value(formatMoney(pay.other),"payment.other")}</td></tr>
        <tr><th>个人账户</th><td>${value(formatMoney(pay.individualAccount),"payment.individualAccount")}</td><th>商业保险</th><td>${value(formatMoney(pay.commercial),"payment.commercial")}</td><th>个人现金</th><td>${value(formatMoney(pay.individualCash),"payment.individualCash")}</td></tr>
      </tbody></table>
      <div class="sheet-line sheet-choice-line">医保支付方式 ${tick(pay.method === "PROJECT", "1.按项目")} ${tick(pay.method === "SINGLE_DISEASE", "2.单病种")} ${tick(pay.method === "DIP", "3.按病种分值")} ${tick(pay.method === "DRG", "4.疾病诊断相关分组（DRG）")} ${tick(pay.method === "BED_DAY", "5.按床日")} ${tick(pay.method === "CAPITATION", "6.按人头")}</div>
      <table class="sheet-table"><tbody><tr><th>定点医疗机构填报部门</th><td>医保办</td><th>医保经办机构</th><td></td><th>代码</th><td></td></tr><tr><th>定点医疗机构填报人</th><td>演示用户</td><th>医保机构经办人</th><td></td><th>代码</th><td></td></tr></tbody></table>
      <div class="sheet-page-no">第 3 页 / 共 3 页 ${sourceTag("费用来源：HIS；支付来源：医保结算模块演示数据")}</div>
    </section>
  </div>`;
}
