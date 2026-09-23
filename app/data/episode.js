export function createEpisodeFixture() {
  return {
    episodeId: "IP-DEMO-2026-001",
    synthetic: true,
    institution: {
      name: "XX省第XX人民医院",
      code: "HOSP-DEMO-001",
      level: "三级",
    },
    patient: {
      patientId: "P-DEMO-001",
      name: "李**",
      sex: "男",
      birthDate: "1955-02-18",
      age: 70,
      nationality: "中国",
      ethnicity: "汉族",
      idType: "居民身份证",
      idNumber: "DEMO-ID-001",
      occupation: "工人",
      maritalStatus: "已婚",
      currentAddress: "XX省XX市XX县XX乡",
      birthPlace: "XX省XX市XX县",
      contactName: "虚构联系人乙",
      contactRelationship: "家属",
      contactPhone: "138****0001",
    },
    insurance: {
      number: "HB-WH-DEMO-001",
      type: "职工基本医疗保险",
      region: "湖北省武汉市",
      specialPersonnelType: "",
    },
    medicalRecordNumber: "BA20250717001",
    inpatientNumber: "S2VT794334788",
    claimSerialNumber: "JSQD-DEMO-001",
    admission: {
      at: "2025-07-17T13:23:00+08:00",
      source: "门诊",
      department: "肝胆胰腺病房",
      ward: "肝胆胰腺病房",
      bed: "001",
      treatmentCategory: "西医",
      medicalType: "住院",
      chiefComplaint: "右上腹痛伴皮肤黄染3天",
      history: "入院前1天患者因右上腹疼痛伴皮肤黄染于当地医院就诊，行上腹部CT检查示：胆总管扩张，内见强回声光团伴声影，考虑“胆总管结石”可能性大，未治疗。患者自发病以来伴有恶心、厌油、尿色深黄。今为进一步明确诊断及治疗，门诊拟以“胆总管结石”收入院。发病以来，患者精神欠佳，睡眠可，食欲减退，大小便无明显异常，大便颜色偏浅，体重无明显变化。否认发病前有不洁饮食史，否认与肝炎患者密切接触史。",
    },
    discharge: {
      at: "2025-07-24T10:00:00+08:00",
      department: "肝胆胰腺病房",
      method: "医嘱离院",
      readmissionWithin31Days: "无",
      attendingPhysician: { name: "李医生", code: "DOC-DEMO-001" },
      responsibleNurse: { name: "王护士", code: "NUR-DEMO-001" },
    },
    diagnoses: {
      outpatientWestern: [{ name: "胆总管结石伴胆管炎", code: "K80.3" }],
      principal: { name: "胆总管结石伴胆管炎", code: "K80.3", conditionAtAdmission: "有" },
      secondary: [
        { name: "高血压病", code: "I10.x00", conditionAtAdmission: "有" },
        { name: "2型糖尿病", code: "E11.900", conditionAtAdmission: "有" },
      ],
    },
    procedures: [
      {
        id: "OP-DEMO-001",
        role: "primary",
        name: "腹腔镜下胆囊切除术",
        code: "51.2300",
        anesthesiaType: "全身麻醉",
        operator: { name: "李医生", code: "DOC-DEMO-001" },
        anesthesiologist: { name: "赵医生", code: "AN-DEMO-001" },
        startAt: "2025-07-19T09:00:00+08:00",
        endAt: "2025-07-19T10:15:00+08:00",
      },
    ],
    clinicalProcess: {
      ventilatorDuration: { days: 0, hours: 0, minutes: 0 },
      comaBeforeAdmission: { days: 0, hours: 0, minutes: 0 },
      comaAfterAdmission: { days: 0, hours: 0, minutes: 0 },
      icuStays: [],
      transfusions: [],
      nursingDays: { special: 0, primary: 2, secondary: 5, tertiary: 0 },
    },
    fees: {
      businessSerialNumber: "FY-DEMO-001",
      invoiceCode: "INV-DEMO-CODE",
      invoiceNumber: "INV-DEMO-001",
      settlementStart: "2025-07-17",
      settlementEnd: "2025-07-24",
      items: [
        { category: "bed", name: "床位费", amount: 420, classA: 420, classB: 0, selfPay: 0, other: 0 },
        { category: "consultation", name: "诊察费", amount: 180, classA: 180, classB: 0, selfPay: 0, other: 0 },
        { category: "examination", name: "检查费", amount: 1580, classA: 1180, classB: 400, selfPay: 0, other: 0 },
        { category: "laboratory", name: "化验费", amount: 920, classA: 720, classB: 200, selfPay: 0, other: 0 },
        { category: "treatment", name: "治疗费", amount: 1060, classA: 860, classB: 200, selfPay: 0, other: 0 },
        { category: "surgery", name: "手术费", amount: 6800, classA: 5800, classB: 1000, selfPay: 0, other: 0 },
        { category: "nursing", name: "护理费", amount: 760, classA: 760, classB: 0, selfPay: 0, other: 0 },
        { category: "material", name: "卫生材料费", amount: 4200, classA: 1800, classB: 1600, selfPay: 800, other: 0 },
        { category: "westernMedicine", name: "西药费", amount: 3380, classA: 1880, classB: 1200, selfPay: 300, other: 0 },
        { category: "tcm", name: "中药饮片费", amount: 0, classA: 0, classB: 0, selfPay: 0, other: 0 },
        { category: "patentMedicine", name: "中成药费", amount: 0, classA: 0, classB: 0, selfPay: 0, other: 0 },
        { category: "general", name: "一般诊疗费", amount: 0, classA: 0, classB: 0, selfPay: 0, other: 0 },
        { category: "registration", name: "挂号费", amount: 0, classA: 0, classB: 0, selfPay: 0, other: 0 },
        { category: "other", name: "其他费", amount: 560, classA: 260, classB: 0, selfPay: 300, other: 0 },
      ],
    },
    payment: {
      method: "DRG",
      fund: 13840,
      individualBurden: 6020,
      individualSelfPay: 1400,
      supplemental: 0,
      employeeLargeAmount: 0,
      residentCriticalIllness: 0,
      civilServant: 0,
      medicalAssistance: 0,
      enterpriseSupplemental: 0,
      commercial: 0,
      other: 0,
      individualAccount: 3200,
      individualCash: 2820,
    },
    demoQc: {
      admissionReminders: [
        { id: "QC-HBA1C-001", severity: "critical", icon: "⚡", title: "完善糖化血红蛋白检查", message: "建议完善糖化血红蛋白及胰岛素水平检查", action: "ignore" },
        { id: "QC-DME-002", severity: "warning", icon: "!", title: "DME预测评分", message: "低危2分", action: "assess" },
        { id: "QC-PAIN-003", severity: "warning", icon: "!", title: "中重度疼痛镇痛治疗", message: "疼痛评分>=4分患者，建议采取镇痛措施", action: "ignore" },
        { id: "QC-HISTORY-004", severity: "critical", icon: "⚡", title: "现病史完整性", message: "现病史中缺少与当前诊断相关的关键阴性症状，请补充后再次质控", action: "locate", hiddenByDefault: true },
      ],
      inlineIssues: [
        { id: "QC-INLINE-HISTORY-001", severity: "critical", order: 1, field: "现病史", message: "现病史中缺少“阴性症状”，需要补充" },
      ],
    },
    evidence: [
      { evidenceId: "EV-ADMISSION-001", sourceType: "EMR", sourceId: "DOC-ADMISSION-001", label: "入院记录" },
      { evidenceId: "EV-OP-001", sourceType: "EMR", sourceId: "DOC-OP-001", label: "手术记录" },
      { evidenceId: "EV-HIS-001", sourceType: "HIS", sourceId: "FEE-001", label: "费用明细" },
    ],
  };
}

export function lengthOfStay(episode) {
  const startDate = String(episode.admission.at || "").slice(0, 10);
  const endDate = String(episode.discharge.at || "").slice(0, 10);
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
  return Math.max(1, Math.round((end - start) / 86400000));
}
