const clinicalDocument = (id, templateId, recordedAt, facts) => ({
  id,
  templateId,
  status: 'confirmed',
  recordedAt,
  signoff: {
    status: 'confirmed',
    by: '虚构医生A',
    at: recordedAt,
  },
  facts,
});

const evidence = (evidenceId, sourceId, factPaths, excerpt) => ({
  evidenceId,
  source: {
    type: 'ClinicalDocument',
    id: sourceId,
  },
  factPaths,
  excerpt,
});

export function createEpisodeFixture() {
  return {
    synthetic: true,
    episodeId: 'EP-DEMO-001',
    patient: {
    patientId: 'P-DEMO-001',
      name: '虚构患者甲',
      displayName: '虚构患者甲',
      sex: '男',
      age: 43,
      birthDate: '1983-06-12',
      idType: '合成证件',
      idNumber: 'DEMO-ID-001',
    },
    admission: {
      at: '2026-09-01T09:30:00+08:00',
      admittedAt: '2026-09-01T09:30:00+08:00',
      department: '普通外科',
      ward: '演示病区',
      reason: '右下腹疼痛伴发热约两日',
      history: '既往无本次住院相关手术史；本次症状由虚构病例生成。',
      admissionRoute: '门诊转入住院',
      source: '门诊',
      treatmentCategory: '西医',
    },
    clinical: {
      examination: {
        temperatureC: 38.1,
        pulsePerMin: 96,
        bloodPressureMmhg: '128/78',
        abdomen: '右下腹压痛，反跳痛记录为阳性。',
      },
      investigations: [
        {
          id: 'LAB-DEMO-001',
          type: '检验',
          name: '血常规',
          conclusion: '白细胞计数轻度升高。',
          reportedAt: '2026-09-01T11:20:00+08:00',
        },
        {
          id: 'IMG-DEMO-001',
          type: '影像',
          name: '腹部超声',
          conclusion: '提示阑尾区炎性改变，需结合临床。',
          reportedAt: '2026-09-01T13:10:00+08:00',
        },
      ],
      initialAssessment: '急性阑尾炎可能，拟完善检查后评估手术。',
      progress: [
        {
          at: '2026-09-02T08:30:00+08:00',
          summary: '腹痛较入院时减轻，体温趋于正常。',
        },
        {
          at: '2026-09-03T08:30:00+08:00',
          summary: '术后恢复平稳，可进流质饮食并下床活动。',
        },
      ],
    },
    diagnoses: {
      initial: '急性阑尾炎待排',
      primary: {
        code: 'K35.80',
        name: '急性阑尾炎',
        role: 'principal',
        confirmed: true,
      },
      secondary: [
        {
          code: 'D64.9',
          name: '贫血（轻度，演示事实）',
          role: 'secondary',
          confirmed: true,
        },
      ],
      evidence: [
        '右下腹体征支持急性阑尾炎判断。',
        '腹部超声提示阑尾区炎性改变。',
      ],
    },
    icd: {
      version: 'ICD-10-CM-DEMO',
      primary: {
        code: 'K35.80',
        name: '急性阑尾炎',
      },
      secondary: [
        {
          code: 'D64.9',
          name: '贫血（轻度，演示事实）',
        },
      ],
    },
    care: {
      plan: '完善术前评估；根据检查结果决定手术；观察体温、腹部体征和术后恢复。',
      followUp: '术后七日门诊复查；出现发热、腹痛加重或切口异常时及时就医。',
    },
    treatment: {
      orders: [
        {
          id: 'ORDER-DEMO-001',
          name: '术前禁食及补液',
          status: 'executed',
        },
        {
          id: 'ORDER-DEMO-002',
          name: '术后切口观察与活动指导',
          status: 'executed',
        },
      ],
    },
    procedures: [
      {
        code: '47.01',
        name: '腹腔镜阑尾切除术',
        role: 'primary',
        performedAt: '2026-09-02T15:00:00+08:00',
        startAt: '2026-09-02T15:00:00+08:00',
        endAt: '2026-09-02T16:10:00+08:00',
        status: 'confirmed',
      },
    ],
    discharge: {
      at: '2026-09-05T10:00:00+08:00',
      dischargedAt: '2026-09-05T10:00:00+08:00',
      disposition: '好转出院',
      method: '医嘱离院',
      department: '普通外科',
      attendingPhysician: { name: '虚构医生A', code: 'DOC-DEMO-001' },
      responsibleNurse: { name: '虚构护士A', code: 'NUR-DEMO-001' },
      primaryDiagnosisCode: 'K35.80',
      primaryDiagnosisName: '急性阑尾炎',
      procedureCodes: ['47.01'],
      condition: '切口干燥，生命体征平稳，可自行活动。',
    },
    costs: {
      currency: 'CNY',
      total: 12680.5,
      businessSerialNumber: 'BIZ-DEMO-001',
      invoiceCode: 'INV-DEMO-CODE',
      invoiceNumber: 'INV-DEMO-001',
      items: [
        { id: 'FEE-DEMO-001', category: '检验', name: '血常规及相关检验', amount: 380.5 },
        { id: 'FEE-DEMO-002', category: '影像', name: '腹部超声', amount: 620 },
        { id: 'FEE-DEMO-003', category: '手术及麻醉', name: '腹腔镜阑尾切除术及麻醉', amount: 8600 },
        { id: 'FEE-DEMO-004', category: '住院综合服务', name: '住院综合服务', amount: 3080 },
      ],
      confirmed: false,
    },
    insurance: {
      number: 'DEMO-INS-001',
      type: '居民医保（合成）',
      region: '国家口径演示',
    },
    medicalRecordNumber: 'MR-DEMO-001',
    inpatientNumber: 'IP-DEMO-001',
    claimSerialNumber: 'CL-DEMO-001',
    paymentSplit: {
      medicalInsuranceFund: 10000,
      individualAccount: 1500,
      individualCash: 1180.5,
      totalPaymentAmount: 12680.5,
      paymentMethod: '按病种付费演示',
    },
    institution: {
      name: '合成演示医院',
      code: 'HOSP-DEMO-001',
      settlementLevel: '演示机构',
    },
    settlement: {
      status: 'draft',
      principalDiagnosisCode: 'K35.80',
      procedureCodes: ['47.01'],
      totalAmount: 12680.5,
      source: 'synthetic-fixture',
    },
    documents: {
      admissionRecord: clinicalDocument(
        'DOC-DEMO-ADMISSION',
        'hm-admission-record',
        '2026-09-01T16:00:00+08:00',
        {
          chiefComplaint: '右下腹疼痛伴发热约两日',
          history: '既往无本次住院相关手术史。',
        },
      ),
      firstCourseRecord: clinicalDocument(
        'DOC-DEMO-FIRST-COURSE',
        'hm-first-course-record',
        '2026-09-01T17:00:00+08:00',
        {
          assessment: '结合症状、体征和检查，考虑急性阑尾炎。',
          plan: '完善术前评估，必要时行腹腔镜阑尾切除术。',
        },
      ),
      dailyCourseRecords: [
        clinicalDocument(
          'DOC-DEMO-DAILY-01',
          'hm-daily-course-record',
          '2026-09-02T08:30:00+08:00',
          { summary: '术前病情稳定，完成手术准备。' },
        ),
        clinicalDocument(
          'DOC-DEMO-DAILY-02',
          'hm-daily-course-record',
          '2026-09-03T08:30:00+08:00',
          { summary: '术后恢复平稳，继续观察切口和饮食耐受。' },
        ),
      ],
      attendingFirstRoundRecord: clinicalDocument(
        'DOC-DEMO-ATTENDING-FIRST',
        'hm-attending-first-round-record',
        '2026-09-02T09:00:00+08:00',
        { assessment: '同意当前诊断及手术计划，关注术后恢复。' },
      ),
      attendingRoundRecords: [
        clinicalDocument(
          'DOC-DEMO-ATTENDING-ROUND-01',
          'hm-attending-round-record',
          '2026-09-03T09:00:00+08:00',
          { assessment: '术后一般情况可，继续当前治疗。' },
        ),
      ],
      preoperativeSummary: clinicalDocument(
        'DOC-DEMO-PREOP',
        'hm-preoperative-summary',
        '2026-09-02T12:00:00+08:00',
        { indication: '症状、体征及检查支持急性阑尾炎，拟行腹腔镜阑尾切除术。' },
      ),
      operationRecord: clinicalDocument(
        'DOC-DEMO-OPERATION',
        'hm-operation-record',
        '2026-09-02T18:00:00+08:00',
        { procedure: '腹腔镜阑尾切除术顺利完成，术中未记录额外操作。' },
      ),
      dischargeRecord: clinicalDocument(
        'DOC-DEMO-DISCHARGE',
        'hm-discharge-record',
        '2026-09-05T09:30:00+08:00',
        { summary: '术后恢复平稳，达到好转出院条件。' },
      ),
    },
    evidence: [
      evidence(
        'EV-DEMO-ADMISSION',
        'DOC-DEMO-ADMISSION',
        [
          'patient',
          'admission',
          'clinical.examination',
          'clinical.investigations',
          'diagnoses.initial',
          'care.plan',
          'documents.admissionRecord',
        ],
        '入院记录中的虚构主诉、现病史、体征和检查摘要。',
      ),
      evidence(
        'EV-DEMO-FIRST-COURSE',
        'DOC-DEMO-FIRST-COURSE',
        ['documents.firstCourseRecord', 'diagnoses.primary', 'diagnoses.evidence', 'care.plan'],
        '首次病程记录中的虚构诊断依据和计划。',
      ),
      evidence(
        'EV-DEMO-DAILY-01',
        'DOC-DEMO-DAILY-01',
        ['documents.dailyCourseRecords', 'clinical.progress', 'treatment.orders'],
        '第一条日常病程记录中的虚构病情变化和医嘱执行。',
      ),
      evidence(
        'EV-DEMO-DAILY-02',
        'DOC-DEMO-DAILY-02',
        ['documents.dailyCourseRecords', 'clinical.progress', 'treatment.orders'],
        '第二条日常病程记录中的虚构术后恢复。',
      ),
      evidence(
        'EV-DEMO-ATTENDING-FIRST',
        'DOC-DEMO-ATTENDING-FIRST',
        ['documents.attendingFirstRoundRecord', 'diagnoses.primary', 'care.plan'],
        '主治医生首次查房记录中的虚构判断。',
      ),
      evidence(
        'EV-DEMO-ATTENDING-ROUND',
        'DOC-DEMO-ATTENDING-ROUND-01',
        ['documents.attendingRoundRecords', 'clinical.progress', 'care.plan'],
        '主治医生查房记录中的虚构恢复评估。',
      ),
      evidence(
        'EV-DEMO-PREOP',
        'DOC-DEMO-PREOP',
        ['documents.preoperativeSummary', 'diagnoses.primary', 'procedures'],
        '术前小结中的虚构手术指征。',
      ),
      evidence(
        'EV-DEMO-OPERATION',
        'DOC-DEMO-OPERATION',
        ['documents.operationRecord', 'diagnoses.primary', 'procedures'],
        '手术记录中的虚构手术事实。',
      ),
      evidence(
        'EV-DEMO-DISCHARGE',
        'DOC-DEMO-DISCHARGE',
        ['documents.dischargeRecord', 'diagnoses.primary', 'procedures', 'discharge', 'care.followUp'],
        '出院记录中的虚构出院情况和随访医嘱。',
      ),
      evidence(
        'EV-DEMO-COST',
        'SETTLEMENT-DEMO-001',
        ['costs', 'costs.total', 'settlement'],
        '虚构费用明细与结算清单草稿。',
      ),
    ],
  };
}
