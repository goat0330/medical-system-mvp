const STAGES = Object.freeze({
  CODE_NORMALIZATION: '编码标准化',
  PRE_GROUP_VALIDATION: '分组前校验',
  INPUT_INTEGRITY_VALIDATION: '分组输入校验',
  PATIENT_FACT_RECONCILIATION: '患者事实核对',
  FORMAL_SUBMISSION_VALIDATION: '正式提交校验',
  CC_MCC_PRECOMPUTE: '并发症 / 合并症判断',
  PRE_MDC: '先期分组（Pre-MDC）',
  MDC: 'MDC',
  ADRG: 'ADRG',
  DRG: 'DRG',
  DIP_PRE_VALIDATION: '分组前校验',
  DIP_EXCLUSION_DIAGNOSIS: '主要诊断排除校验',
  DIP_EXCLUSION_PROCEDURE: '主要操作排除校验',
  DIP_PRE_GROUP: 'DIP 先期分组',
  DIP_BASE_COMBINATION: 'DIP 病种组合',
  DIP_MERGE_RULE: 'DIP 并项规则匹配',
  DIP_AUX_BURN: '烧伤辅助细分',
  DIP_AUX_TUMOR: '肿瘤辅助细分',
  DIP_AUX_TB: '结核辅助细分',
  DIP_AUXILIARY: '诊断辅助细分',
  DIP_CORE_GROUP: 'DIP 核心病种匹配',
});

const STATES = Object.freeze({
  PASS: '通过', DONE: '已完成', BUILT: '已生成', MATCHED: '已匹配', NOT_MATCHED: '未命中，继续匹配',
  MATCHED_AS_CONSERVATIVE: '按保守治疗匹配', NOT_GROUPED: '未匹配', NOT_GROUPED_MDC: '未进入主诊断大类',
  NOT_GROUPED_ADRG: '未进入诊断相关组', NOT_GROUPED_DRG: '未得到最终 DRG', NOT_GROUPED_CORE: '未命中核心病种',
  INVALID_INPUT: '输入异常', FAIL: '未通过', BLOCKED: '已阻断', BLOCKED_BY_FACT_CONFLICT: '患者事实冲突，已阻断',
  BLOCKED_BY_INPUT_INTEGRITY: '分组输入不完整，已阻断', BLOCKED_BY_DATA_QUALITY: '清单质控未通过，已阻断',
  REQUIRES_CONFIRMATION: '待编码确认', CONFIRMED: '已确认', UNCHANGED: '保持原编码',
  GROUPED: '分组完成', GROUPED_PENDING_CODING_CONFIRMATION: '预分组完成，待编码确认',
  PENDING_CODING_CONFIRMATION: '待编码确认', FORMAL_GROUPED: '正式分组完成', NOT_GROUPED: '未完成分组',
  PENDING_LOCAL_PARAMETERS: '待本地支付参数', CALCULATED_WITH_LOCAL_TEST_PARAMETERS: '本地测试参数测算',
  REFERENCE_ONLY: '参考参数测算', CALCULATED_WITH_VERIFIED_PARAMETERS: '已用核验参数测算',
  WITHIN_REFERENCE_PAYMENT: '低于病组参考支付标准', OVER_REFERENCE_PAYMENT: '高于病组参考支付标准',
  PAYMENT_PROFILE_VERSION_MISMATCH: '支付与分组版本不匹配', GROUPER_NOT_AVAILABLE: '分组规则未接入',
  GROUPER_PROFILE_VERSION_MISMATCH: '分组执行器版本不匹配',
  NOT_CALCULATED: '未测算', NOT_RUN: '未执行', READY: '就绪', REVIEW: '待复核', STALE: '已过期',
  CONFLICTED: '存在冲突', CANDIDATE: '待确认', MISSING: '未采集', MANUAL_OVERRIDE: '人工修改',
  RETURN_TO_HOSPITAL: '已退回医院', RULE_NOT_APPLICABLE: '规则不适用', ESCALATE: '已转稽核',
  OTHER_PAYMENT: '其他支付方式', EXCLUDED_PRINCIPAL_DIAGNOSIS: '主要诊断不纳入此分组',
  PENDING_REVIEW: '待人工审核', PARTIAL: '部分完成',
});

const QUALITY_DOMAINS = Object.freeze({
  DOCUMENT: '单文书质控', CROSS_DOCUMENT: '跨文书/跨源一致性', FRONT_PAGE: '病案首页/编码质控',
  FRONTPAGE: '病案首页', SETTLEMENT: '医保结算清单质控', GROUPING: 'DRG/DIP 分组质控',
  AUDIT: '医保审核/费用合规', INSURANCE_AUDIT: '医保审核/费用合规',
});
const IMPACT_SCOPES = Object.freeze({ DOCUMENT: '单文书', FRONTPAGE: '病案首页', SETTLEMENT: '医保结算清单', GROUPING: 'DRG/DIP 分组', AUDIT: '医保审核', SURGERY: '手术记录' });

export function groupingStageLabel(stage) { return STAGES[stage] || stage || '分组步骤'; }
export function groupingStatusLabel(status) { return STATES[status] || status || '—'; }
export function groupingQualityDomainLabel(domain) { return QUALITY_DOMAINS[domain] || domain || '当前环节'; }
export function groupingImpactLabel(scope) { return IMPACT_SCOPES[scope] || scope || '当前环节'; }

export function groupingStatusTone(status) {
  if (/FAIL|BLOCK|INVALID|ERROR|NOT_GROUPED|EXCLUDED/.test(String(status || ''))) return 'red';
  if (/PENDING|REQUIRES_CONFIRMATION|REVIEW|STALE|NOT_RUN|CONFLICTED|CANDIDATE|OVER_REFERENCE|MISMATCH|NOT_AVAILABLE|REFERENCE_ONLY/.test(String(status || ''))) return 'amber';
  if (/WITHIN_REFERENCE|CALCULATED_WITH_VERIFIED/.test(String(status||''))) return 'green';
  if (/PASS|DONE|BUILT|MATCHED|GROUPED|CONFIRMED|READY|UNCHANGED/.test(String(status || ''))) return 'green';
  return 'blue';
}

export function groupingTraceSummary(row) {
  if (row.stage === 'CODE_NORMALIZATION' && row.status === 'REQUIRES_CONFIRMATION') return `${row.input || '当前编码'} 建议映射为 ${row.output || '标准编码'}，需编码员确认。`;
  if (row.stage === 'PRE_GROUP_VALIDATION' || row.stage === 'DIP_PRE_VALIDATION') return row.status === 'PASS' ? '患者属性和分组必需字段已通过校验。' : row.output || '输入未通过校验。';
  if (row.stage === 'CC_MCC_PRECOMPUTE') return row.output || '已按官方 CC/MCC 与排除规则完成判断。';
  if (row.stage === 'PRE_MDC') return row.status === 'MATCHED' ? row.output : '未命中特殊预分组，继续按 MDC 规则判断。';
  return row.output || row.reason || row.description || groupingStatusLabel(row.status);
}

export function groupingTraceDetail(row) {
  return [row.input && `输入：${row.input}`, row.rule && `规则：${row.rule}`, row.output && `输出：${row.output}`, row.source && `来源：${row.source}`].filter(Boolean).join('；');
}

export function filterGroupingQualityIssues(issues = []) {
  return issues.filter((issue) => issue.qcDomain === 'GROUPING' || issue.impactScope?.includes('GROUPING'));
}
