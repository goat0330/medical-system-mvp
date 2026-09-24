const ADMISSION_AT = '2026-09-18T09:20:00+08:00';
const DISCHARGE_AT = '2026-09-23T10:30:00+08:00';

const CASES = [
  {
    key: 'p-01', bed: '01床', name: '王某某', sex: '男', age: 62, episodeId: 'EP-DEMO-002',
    department: '呼吸内科', status: '待结算', tone: 'blue', task: '核对出院资料',
    diagnosis: { code: 'J18.900', name: '肺炎，病原体未特指' }, procedure: null,
    complaint: '咳嗽、咳痰伴发热4天', history: '患者4天前出现咳嗽、咳黄痰及发热，活动后气促，无胸痛。胸部影像提示右下肺感染性改变，入院后完善检验并给予抗感染及对症治疗，体温逐步恢复。',
    progress: '体温较前下降，咳嗽和咳痰减少，静息状态呼吸平稳，继续按疗程抗感染并观察氧合。',
    imaging: { name: '胸部CT', findings: '右下肺见斑片状密度增高影，边界欠清。', impression: '右下肺感染性病变，结合临床。' },
    labs: [{ code: 'WBC', name: '白细胞计数', value: 11.2, unit: '10^9/L', ref: '3.5-9.5', flag: 'H' }, { code: 'CRP', name: 'C反应蛋白', value: 46, unit: 'mg/L', ref: '0-10', flag: 'H' }],
    orders: ['抗感染治疗', '雾化吸入', '体温及血氧监测'],
    fees: [['bed', '床位费', 5, 260], ['examination', '胸部影像检查', 1, 480], ['laboratory', '血液及炎症指标检验', 1, 360], ['treatment', '雾化及治疗费', 3, 120], ['westernMedicine', '药品费用', 1, 980]],
  },
  {
    key: 'p-03', bed: '03床', name: '李某某', sex: '女', age: 47, episodeId: 'EP-DEMO-003',
    department: '泌尿外科', status: '待结算', tone: 'amber', task: '核对操作与费用',
    diagnosis: { code: 'N20.100', name: '输尿管结石' }, procedure: { code: '98.5103', name: '输尿管体外冲击波碎石术', anesthesiaType: '镇痛及镇静', day: '2026-09-20' },
    complaint: '左侧腰腹部绞痛伴恶心1天', history: '患者突发左侧腰腹部阵发性绞痛，向腹股沟放射，伴恶心，无寒战高热。影像检查提示左侧输尿管结石并轻度积水，入院后完善评估，行输尿管体外冲击波碎石术。',
    progress: '术后生命体征平稳，腰腹痛明显缓解，尿色淡黄，继续观察排尿及有无发热。',
    imaging: { name: '泌尿系CT', findings: '左侧输尿管中段见高密度结石影，近端集合系统轻度扩张。', impression: '左侧输尿管结石伴轻度积水。' },
    labs: [{ code: 'RBC-U', name: '尿红细胞', value: 38, unit: '/HP', ref: '0-3', flag: 'H' }, { code: 'CREA', name: '肌酐', value: 78, unit: 'μmol/L', ref: '41-81', flag: 'N' }],
    orders: ['结石治疗及镇痛医嘱', '输尿管体外冲击波碎石术', '术后生命体征监测'],
    fees: [['bed', '床位费', 5, 260], ['examination', '泌尿系CT检查', 1, 520], ['laboratory', '尿液及肾功能检验', 1, 310], ['surgery', '输尿管镜手术费', 1, 4200], ['material', '一次性手术材料', 1, 1160], ['westernMedicine', '围手术期药品费用', 1, 760]],
  },
  {
    key: 'p-08', bed: '08床', name: '陈某某', sex: '男', age: 55, episodeId: 'EP-DEMO-004',
    department: '普通外科', status: '待结算', tone: 'gray', task: '核对出院记录',
    diagnosis: { code: 'K40.301', name: '单侧或未特指的腹股沟疝，伴有梗阻，不伴有坏疽' }, procedure: { code: '53.0001', name: '单侧腹股沟疝修补术', anesthesiaType: '椎管内麻醉', day: '2026-09-20' },
    complaint: '右腹股沟可复性包块2年，疼痛加重1天', history: '患者右腹股沟包块约2年，站立及咳嗽时明显，平卧可回纳。近1天局部胀痛，查体见腹股沟区包块，入院后评估并行腹股沟疝修补术。',
    progress: '术后切口敷料干燥，疼痛可耐受，未见恶心呕吐及排尿困难，继续观察切口和腹部情况。',
    imaging: { name: '腹股沟区超声', findings: '右侧腹股沟区见疝囊，腹压增加时突出。', impression: '右侧腹股沟疝。' },
    labs: [{ code: 'WBC', name: '白细胞计数', value: 6.8, unit: '10^9/L', ref: '3.5-9.5', flag: 'N' }, { code: 'HGB', name: '血红蛋白', value: 143, unit: 'g/L', ref: '130-175', flag: 'N' }],
    orders: ['术前评估及常规准备', '腹股沟疝修补术', '术后切口护理'],
    fees: [['bed', '床位费', 5, 260], ['examination', '腹股沟区超声', 1, 220], ['laboratory', '术前检验', 1, 430], ['surgery', '疝修补手术费', 1, 3600], ['material', '手术材料费', 1, 920], ['westernMedicine', '围手术期药品费用', 1, 680]],
  },
  {
    key: 'p-16', bed: '16床', name: '赵某某', sex: '女', age: 71, episodeId: 'EP-DEMO-005',
    department: '眼科', status: '待结算', tone: 'green', task: '核对出院资料',
    diagnosis: { code: 'H25.900', name: '未特指的老年性白内障' }, procedure: null,
    complaint: '右眼视物模糊逐渐加重1年', history: '患者右眼视力逐渐下降，影响阅读及日常活动，无眼红眼痛。眼科检查提示晶状体混浊，入院完善眼部及全身评估，进行药物观察和出院随访指导。',
    progress: '无眼痛、眼红等新发症状，视力情况稳定，按计划复诊并评估后续治疗。',
    imaging: { name: '眼部检查', findings: '右眼晶状体皮质及核部混浊，眼底窥视受限。', impression: '右眼老年性白内障。' },
    labs: [{ code: 'GLU', name: '空腹血糖', value: 5.6, unit: 'mmol/L', ref: '3.9-6.1', flag: 'N' }, { code: 'HGB', name: '血红蛋白', value: 131, unit: 'g/L', ref: '115-150', flag: 'N' }],
    orders: ['眼科专科检查', '用药观察', '门诊复诊随访'],
    fees: [['bed', '床位费', 5, 260], ['examination', '眼部专科检查', 1, 420], ['laboratory', '入院常规检验', 1, 290], ['treatment', '治疗及护理费', 3, 160], ['westernMedicine', '眼科用药费用', 1, 540]],
  },
  {
    key: 'p-18', bed: '18床', name: '周某某', sex: '男', age: 36, episodeId: 'EP-DEMO-006',
    department: '普通外科', status: '待结算', tone: 'gray', task: '复核首页手术编码',
    diagnosis: { code: 'K80.101', name: '胆囊结石伴其他胆囊炎' }, procedure: { code: '51.2300', name: '腹腔镜下胆囊切除术', anesthesiaType: '全身麻醉', day: '2026-09-20' },
    complaint: '右上腹反复疼痛伴恶心2天', history: '患者右上腹间歇性疼痛，进食油腻食物后加重，伴恶心，无寒战高热及黄疸。超声提示胆囊结石并胆囊炎性改变，入院后完成术前评估并行腹腔镜下胆囊切除术。',
    progress: '术后一般情况平稳，腹部切口干燥，疼痛较前减轻，饮食和活动逐步恢复。',
    imaging: { name: '腹部超声', findings: '胆囊内见多发强回声伴声影，胆囊壁轻度增厚。', impression: '胆囊结石并胆囊炎性改变。' },
    labs: [{ code: 'WBC', name: '白细胞计数', value: 9.8, unit: '10^9/L', ref: '3.5-9.5', flag: 'H' }, { code: 'ALT', name: '丙氨酸氨基转移酶', value: 32, unit: 'U/L', ref: '9-50', flag: 'N' }],
    orders: ['术前评估及常规准备', '腹腔镜下胆囊切除术', '术后饮食及活动指导'],
    pathology: '胆囊慢性炎性改变，伴胆囊结石。',
    fees: [['bed', '床位费', 5, 260], ['examination', '腹部影像检查', 1, 460], ['laboratory', '术前及肝功能检验', 1, 520], ['surgery', '腹腔镜手术费', 1, 5200], ['material', '手术材料费', 1, 1420], ['westernMedicine', '围手术期药品费用', 1, 890]],
  },
];

const clone = (value) => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const field = (keyName, keyValue, keyCode = '') => ({ keyCode, keyName, keyValue });
const localTime = (value) => value.replace('T', ' ').slice(0, 16);

function makeFeeItems(spec) {
  return spec.fees.map(([category, name, quantity, unitPrice], index) => ({
    id: `HIS-${spec.episodeId}-${index + 1}`, itemCode: `SYN-${category.toUpperCase()}-${index + 1}`,
    category, name, billingTime: `${index < 2 ? '2026-09-18' : '2026-09-20'}T10:${String(index * 5).padStart(2, '0')}:00+08:00`,
    quantity, unitPrice, amount: quantity * unitPrice, synthetic: true,
  }));
}

function document(spec, episode, templateId, templateName, text, fields) {
  const identity = [
    field('医疗机构名称', episode.institution.name, 'DE08.10.013.00.012'),
    field('姓名', episode.patient.name, 'DE02.01.039.00'),
    field('性别', episode.patient.sex, 'DE02.01.040.00'),
    field('出生日期', episode.patient.birthDate, 'DE02.01.005.01'),
    field('年龄', `${episode.patient.age}岁`, 'DE02.01.026.00'),
    field('病案号', episode.medicalRecordNumber, 'DE01.00.004.00'),
    field('住院号', episode.inpatientNumber, 'DE01.00.014.00'),
  ];
  return { templateId, name: templateName, status: 'confirmed', text, data: [...identity, ...fields] };
}

function buildSyntheticDocuments(spec, episode) {
  const dx = spec.diagnosis, op = spec.procedure;
  const admission = localTime(episode.admission.at), discharge = localTime(episode.discharge.at);
  const dxFields = [field('主要诊断', dx.name, 'DE05.10.172.00'), field('主要诊断代码', dx.code, 'DE05.01.024.00')];
  const opFields = op ? [field('主要手术及操作名称', op.name, 'DE06.00.094.00.005'), field('主要手术及操作代码', op.code, 'DE06.00.093.00')] : [];
  const admissionFields = [
    field('入院科别', episode.admission.department, 'DE08.10.026.00.001'),
    field('入院时间', admission, 'DE06.00.092.00'),
    field('主诉', episode.admission.chiefComplaint), field('现病史', episode.admission.history),
  ];
  const docs = [
    document(spec, episode, 'frontpage', '住院病案首页', `${spec.name}，${episode.patient.age}岁，因“${episode.admission.chiefComplaint}”住院。出院诊断：${dx.name}（${dx.code}）。${op ? `主要手术：${op.name}（${op.code}）。` : '本次住院未实施手术。'}`, [
      field('入院科别', episode.admission.department, 'DE08.10.026.00.001'), field('出院科别', episode.discharge.department, 'DE08.10.026.00.002'),
      field('入院日期时间', admission, 'DE06.00.092.00'), field('出院日期时间', discharge, 'DE06.00.017.00'),
      ...dxFields, ...opFields, field('离院方式', episode.discharge.method),
    ]),
    document(spec, episode, 'admission', '入院记录', `主诉：${episode.admission.chiefComplaint}\n现病史：${episode.admission.history}`, admissionFields),
    document(spec, episode, 'first-progress', '首次病程记录', `入院后结合症状、体征、检验和影像资料，初步诊断为${dx.name}（${dx.code}）。诊疗计划：完善评估并按病情给予治疗。`, [field('入院时间', admission, 'DE06.00.092.00'), field('初步诊断', `${dx.name}（${dx.code}）`)]),
    document(spec, episode, 'daily-progress', '日常病程记录', episode.progress, [field('记录时间', '2026-09-21 09:00'), field('病程记录', episode.progress)]),
    document(spec, episode, 'attending-first-round', '主治医师首次查房记录', `主治医师查房：结合${episode.admission.chiefComplaint}、专科查体及现有检验影像资料，诊断考虑${dx.name}（${dx.code}）。同意当前检查和治疗计划，继续观察病情变化。`, [field('记录时间', '2026-09-19 09:00'), field('查房记录', `诊断考虑${dx.name}（${dx.code}），同意当前治疗计划。`)]),
    document(spec, episode, 'attending-round', '主治医师查房记录', `主治医师查房：${episode.progress}继续按既定方案治疗，完善出院前评估。`, [field('记录时间', '2026-09-22 09:00'), field('查房记录', episode.progress)]),
    document(spec, episode, 'discharge', '出院记录', `入院诊断：${dx.name}（${dx.code}）。住院期间完成必要检查及治疗，病情稳定后出院。出院医嘱：按专科要求用药、观察症状并门诊复诊。`, [
      field('出院时间', discharge, 'DE06.00.017.00'), ...dxFields, ...opFields,
      field('出院科别', episode.discharge.department, 'DE08.10.026.00.002'), field('离院方式', episode.discharge.method),
    ]),
  ];
  if (op) {
    const operator = episode.procedures[0].operator.name;
    docs.push(document(spec, episode, 'preop', '术前小结', `术前诊断：${dx.name}（${dx.code}）。手术指征与影像、检验结果相符，已完成术前评估及知情沟通。拟行${op.name}，${op.anesthesiaType}。`, [
      ...dxFields, ...opFields, field('麻醉方式', op.anesthesiaType, 'DE06.00.073.00'), field('手术者姓名', operator, 'DE02.01.039.00.161'),
    ]));
    docs.push(document(spec, episode, 'surgery', '手术记录', `手术日期：${op.day}。实施${op.name}，手术过程平稳，术毕返回病房继续观察。`, [
      ...opFields, field('手术名称', op.name), field('手术者姓名', operator, 'DE02.01.039.00.161'), field('麻醉医师姓名', episode.procedures[0].anesthesiologist.name, 'DE02.01.039.00.155'),
      field('麻醉方式', op.anesthesiaType, 'DE06.00.073.00'),
    ]));
  }
  return docs;
}

function syntheticDemoEpisode(spec) {
  const serial = spec.episodeId.slice(-3);
  const birthYear = 2026 - spec.age;
  const diagnosis = { ...spec.diagnosis, conditionAtAdmission: '有' };
  const procedure = spec.procedure ? {
    id: `OP-${spec.episodeId}`, role: 'primary', ...spec.procedure,
    startAt: `${spec.procedure.day}T10:00:00+08:00`, endAt: `${spec.procedure.day}T11:00:00+08:00`,
    operator: { name: `合成医师${serial}`, code: `SYN-DOC-${serial}` },
    anesthesiologist: { name: `合成麻醉医师${serial}`, code: `SYN-AN-${serial}` },
  } : null;
  const episode = {
    episodeId: spec.episodeId, synthetic: true, syntheticCaseId: `SYNTH-${spec.episodeId}`,
    datasetVersion: 'synthetic-worklist-v1',
    institution: { name: '合成示例医院', code: 'SYNTH-HOSP-001', level: '三级医院（演示）' },
    patient: {
      patientId: `P-DEMO-${serial}`, name: spec.name, sex: spec.sex, birthDate: `${birthYear}-02-18`, age: spec.age,
      nationality: '中国', ethnicity: '汉族', idType: '其他', idNumber: `SYNTHETIC-${spec.episodeId}`,
      occupation: '合成测试数据', maritalStatus: '已婚', currentAddress: '湖北省武汉市示例区', birthPlace: '湖北省武汉市',
      contactName: '合成联系人', contactRelationship: '家属', contactPhone: 'SYNTHETIC-NOT-A-PHONE',
    },
    insurance: { number: `SYNTH-HB-WH-${serial}`, type: '城乡居民基本医疗保险（合成测试）', region: '湖北省武汉市', specialPersonnelType: '' },
    medicalRecordNumber: `BA-DEMO-${serial}`, inpatientNumber: spec.episodeId, inpatientNo: spec.episodeId,
    inpatientId: spec.episodeId, claimSerialNumber: `JSQD-DEMO-${serial}`,
    admission: {
      at: ADMISSION_AT, source: '门诊', department: spec.department, ward: `${spec.department}病区`, bed: spec.bed.replace('床', ''),
      treatmentCategory: '西医', medicalType: '住院', chiefComplaint: spec.complaint, history: spec.history,
    },
    discharge: {
      at: DISCHARGE_AT, department: spec.department, method: '医嘱离院', readmissionWithin31Days: '无',
      attendingPhysician: { name: `合成医师${serial}`, code: `SYN-DOC-${serial}` },
      responsibleNurse: { name: `合成护士${serial}`, code: `SYN-NUR-${serial}` },
    },
    diagnoses: { outpatientWestern: [diagnosis], principal: diagnosis, secondary: [] },
    procedures: procedure ? [procedure] : [],
    clinicalProcess: {
      ventilatorDuration: { days: 0, hours: 0, minutes: 0 }, comaBeforeAdmission: { days: 0, hours: 0, minutes: 0 },
      comaAfterAdmission: { days: 0, hours: 0, minutes: 0 }, icuStays: [], transfusions: [],
      nursingDays: { special: 0, primary: 5, secondary: 0, tertiary: 0 },
    },
    fees: {
      businessSerialNumber: `FY-DEMO-${serial}`, invoiceCode: '', invoiceNumber: `INV-DEMO-${serial}`,
      settlementStart: '2026-09-18', settlementEnd: '2026-09-23', items: [],
    },
    payment: {
      method: null, fund: null, individualBurden: null, individualSelfPay: null, individualSelfExpense: null,
      supplemental: null, employeeLargeAmount: null, residentCriticalIllness: null, civilServant: null,
      medicalAssistance: null, enterpriseSupplemental: null, commercial: null, other: null,
      individualAccount: null, individualCash: null,
    },
    evidence: [],
  };
  const feeItems = makeFeeItems(spec);
  episode.fees.items = feeItems;
  const eventTime = '2026-09-18T11:00:00+08:00';
  const clinical = {
    vitals: [
      { at: eventTime, temperatureC: 37.6, pulse: 88, systolic: 128, diastolic: 78, spo2: 97 },
      { at: '2026-09-21T09:00:00+08:00', temperatureC: 36.8, pulse: 76, systolic: 122, diastolic: 74, spo2: 98 },
    ],
    labs: [{ panelId: `SYN-LAB-${serial}`, at: eventTime, items: spec.labs }],
    imaging: [{ reportId: `SYN-RIS-${serial}`, at: '2026-09-18T14:30:00+08:00', ...spec.imaging }],
    orders: spec.orders.map((name, index) => ({ orderId: `SYN-ORDER-${serial}-${index + 1}`, type: name.includes('术') ? 'procedure' : 'medication', name, startAt: '2026-09-18T15:00:00+08:00', status: 'completed', synthetic: true })),
    pathology: spec.pathology ? [{ reportId: `SYN-PATH-${serial}`, at: '2026-09-22T15:00:00+08:00', specimen: '手术标本', diagnosis: spec.pathology }] : [],
  };
  episode.syntheticData = {
    kind: 'independent-synthetic-case', version: 'synthetic-worklist-v1',
    documents: buildSyntheticDocuments(spec, episode), clinical, billing: { feeItems },
  };
  return episode;
}

export function createPatientWorklist({ goldenEpisode, goldenBundle } = {}) {
  if (!goldenEpisode) throw new Error('goldenEpisode is required');
  const goldenSpec = { key: 'p-12', bed: '12床', name: '虚构患者甲', sex: '男', age: 43, episodeId: 'EP-GOLDEN-001', department: '普通外科', status: 'Golden 样本', tone: 'blue', task: '全流程联调', golden: true };
  const golden = clone(goldenEpisode);
  const serial = goldenSpec.episodeId.slice(-3);
  golden.patient = { ...golden.patient, patientId: `P-GOLDEN-${serial}` };
  golden.medicalRecordNumber = `BA-GOLDEN-${serial}`;
  golden.claimSerialNumber = `JSQD-GOLDEN-${serial}`;
  golden.insurance = { ...golden.insurance, number: `HB-WH-GOLDEN-${serial}` };
  golden.fees = { ...golden.fees, businessSerialNumber: `FY-GOLDEN-${serial}`, invoiceNumber: `INV-GOLDEN-${serial}` };
  golden.goldenData = goldenBundle;
  golden.episodeId = goldenSpec.episodeId;
  golden.inpatientNumber = goldenSpec.episodeId;
  golden.inpatientNo = goldenSpec.episodeId;
  golden.inpatientId = goldenSpec.episodeId;
  return [
    { ...goldenSpec, episode: golden },
    ...CASES.map((spec) => ({ ...spec, episode: syntheticDemoEpisode(spec) })),
  ];
}
