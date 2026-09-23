const ADMISSION_REMINDERS = Object.freeze([
  {
    id: "QC-HBA1C-001",
    severity: "critical",
    icon: "⚡",
    title: "完善糖化血红蛋白检查",
    message: "建议完善糖化血红蛋白及胰岛素水平检查",
    action: "ignore",
  },
  {
    id: "QC-DME-002",
    severity: "warning",
    icon: "!",
    title: "DME预测评分",
    message: "低危2分",
    action: "assess",
  },
  {
    id: "QC-PAIN-003",
    severity: "warning",
    icon: "!",
    title: "中重度疼痛镇痛治疗",
    message: "疼痛评分>=4分患者，建议采取镇痛措施",
    action: "ignore",
  },
  {
    id: "QC-HISTORY-004",
    severity: "critical",
    icon: "⚡",
    title: "现病史完整性",
    message: "现病史中缺少与当前诊断相关的关键阴性症状，请补充后再次质控",
    action: "locate",
    hiddenByDefault: true,
  },
]);

export function getDocumentReminderProfile(templateId, episode) {
  if (templateId !== "admission") return [];
  const configured = episode?.demoQc?.admissionReminders;
  if (Array.isArray(configured) && configured.length) return configured;
  return ADMISSION_REMINDERS.map((item) => ({ ...item }));
}

export function getInlineQualityIssues(templateId, episode) {
  if (templateId !== "admission") return [];
  const configured = episode?.demoQc?.inlineIssues;
  if (Array.isArray(configured) && configured.length) return configured;
  return [
    {
      id: "QC-INLINE-HISTORY-001",
      severity: "critical",
      order: 1,
      field: "现病史",
      message: "现病史中缺少“阴性症状”，需要补充",
    },
  ];
}

export function qualitySummary(templateId, episode) {
  const reminders = getDocumentReminderProfile(templateId, episode);
  const inlineIssues = getInlineQualityIssues(templateId, episode);
  return {
    reminderCount: reminders.length,
    reminders,
    inlineIssues,
  };
}
