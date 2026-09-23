const PATIENT_SPECS = [
  { key: 'p-12', bed: '12床', name: '虚构患者甲', sex: '男', age: 43, episodeId: 'EP-GOLDEN-001', department: '普通外科', status: 'Golden 样本', tone: 'blue', task: '全流程联调', golden: true },
  { key: 'p-01', bed: '01床', name: '王某某', sex: '男', age: 62, episodeId: 'EP-DEMO-002', department: '普通外科', status: '新入院', tone: 'blue', task: '待完成文书 4' },
  { key: 'p-03', bed: '03床', name: '李某某', sex: '女', age: 47, episodeId: 'EP-DEMO-003', department: '普通外科', status: '有待办', tone: 'amber', task: '待完成文书' },
  { key: 'p-08', bed: '08床', name: '陈某某', sex: '男', age: 55, episodeId: 'EP-DEMO-004', department: '普通外科', status: '住院中', tone: 'gray', task: '待完成文书 1' },
  { key: 'p-16', bed: '16床', name: '赵某某', sex: '女', age: 71, episodeId: 'EP-DEMO-005', department: '普通外科', status: '今日出院', tone: 'green', task: '待确认出院记录' },
  { key: 'p-18', bed: '18床', name: '周某某', sex: '男', age: 36, episodeId: 'EP-DEMO-006', department: '普通外科', status: '住院中', tone: 'gray', task: '暂无待办' },
];

function emptyDemoEpisode(spec) {
  const serial = spec.episodeId.slice(-3);
  return {
    episodeId: spec.episodeId,
    synthetic: true,
    syntheticCaseId: `SYNTH-${spec.episodeId}`,
    datasetVersion: 'empty-worklist-v1',
    institution: { name: '', code: '', level: '' },
    patient: {
      patientId: `P-DEMO-${serial}`, name: spec.name, sex: spec.sex, birthDate: null, age: spec.age,
      nationality: '', ethnicity: '', idType: '', idNumber: '', occupation: '', maritalStatus: '',
      currentAddress: '', birthPlace: '', contactName: '', contactRelationship: '', contactPhone: '',
    },
    insurance: { number: '', type: '', region: '', specialPersonnelType: '' },
    medicalRecordNumber: `BA-DEMO-${serial}`,
    inpatientNumber: spec.episodeId,
    inpatientNo: spec.episodeId,
    inpatientId: spec.episodeId,
    claimSerialNumber: `JSQD-DEMO-${serial}`,
    admission: {
      at: null, source: '', department: spec.department, ward: '', bed: spec.bed.replace('床', ''),
      treatmentCategory: '', medicalType: '住院', chiefComplaint: '', history: '',
    },
    discharge: {
      at: null, department: spec.department, method: '', readmissionWithin31Days: '',
      attendingPhysician: { name: '', code: '' }, responsibleNurse: { name: '', code: '' },
    },
    diagnoses: { outpatientWestern: [], principal: null, secondary: [] },
    procedures: [],
    clinicalProcess: {
      ventilatorDuration: { days: null, hours: null, minutes: null },
      comaBeforeAdmission: { days: null, hours: null, minutes: null },
      comaAfterAdmission: { days: null, hours: null, minutes: null },
      icuStays: [], transfusions: [], nursingDays: { special: null, primary: null, secondary: null, tertiary: null },
    },
    fees: {
      businessSerialNumber: `FY-DEMO-${serial}`, invoiceCode: '', invoiceNumber: `INV-DEMO-${serial}`,
      settlementStart: null, settlementEnd: null, items: [],
    },
    payment: {
      method: null, fund: null, individualBurden: null, individualSelfPay: null, individualSelfExpense: null,
      supplemental: null, employeeLargeAmount: null, residentCriticalIllness: null, civilServant: null,
      medicalAssistance: null, enterpriseSupplemental: null, commercial: null, other: null,
      individualAccount: null, individualCash: null,
    },
    evidence: [],
  };
}

const clone = (value) => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));

export function createPatientWorklist({ goldenEpisode, goldenBundle } = {}) {
  if (!goldenEpisode) throw new Error('goldenEpisode is required');
  return PATIENT_SPECS.map((spec) => {
    const episode = spec.golden ? clone(goldenEpisode) : emptyDemoEpisode(spec);
    if (spec.golden) {
      const serial = spec.episodeId.slice(-3);
      episode.patient = { ...episode.patient, patientId: `P-GOLDEN-${serial}` };
      episode.medicalRecordNumber = `BA-GOLDEN-${serial}`;
      episode.claimSerialNumber = `JSQD-GOLDEN-${serial}`;
      episode.insurance = { ...episode.insurance, number: `HB-WH-GOLDEN-${serial}` };
      episode.fees = { ...episode.fees, businessSerialNumber: `FY-GOLDEN-${serial}`, invoiceNumber: `INV-GOLDEN-${serial}` };
      episode.goldenData = goldenBundle;
    }
    episode.episodeId = spec.episodeId;
    episode.inpatientNumber = spec.episodeId;
    episode.inpatientNo = spec.episodeId;
    episode.inpatientId = spec.episodeId;
    return { ...spec, episode };
  });
}
