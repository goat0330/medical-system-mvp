import { DOCUMENT_TEMPLATES } from '../../data/templates.js';
import { runDocumentQc } from '../../domain/medical-record-editor.js';
import { validateSettlementList } from '../../domain/settlement.js';
import { createQualityIssue } from '../models/quality-issue.js';
import { qualityIssuesFromFactConflicts } from './cross-source-quality.js';

export const QUALITY_DOMAINS = Object.freeze([
  { id: 'DOCUMENT', label: '① 单文书质控' },
  { id: 'CROSS_DOCUMENT', label: '② 跨文书/跨源一致性' },
  { id: 'FRONT_PAGE', label: '③ 病案首页/编码质控' },
  { id: 'SETTLEMENT', label: '④ 医保结算清单质控' },
  { id: 'GROUPING', label: '⑤ DRG/DIP 分组质控' },
  { id: 'INSURANCE_AUDIT', label: '⑥ 医保审核/费用合规' },
]);

const valueOf = (value) => value && typeof value === 'object' ? String(value.value ?? value.code ?? value.text ?? '') : String(value ?? '');
const norm = (value) => valueOf(value).replace(/[\s：:（）()【】\[\]_-]/g,'').toLowerCase();
const severity = (value) => String(value || '').toLowerCase() === 'error' || String(value || '').toLowerCase() === 'high' ? 'high' : String(value || '').toLowerCase() === 'warning' || String(value || '').toLowerCase() === 'medium' ? 'medium' : 'low';
function qIssue(base) { return createQualityIssue({ status:'PENDING_REVIEW', ...base }); }
function savedRecord(records, id) { return (records || []).find((x) => (x.templateId || x.id) === id) || null; }
function templateById(id) { return DOCUMENT_TEMPLATES.find((x) => x.id === id) || null; }
function fieldsFor(record) { return (record?.snapshot?.data || record?.data || []).map((x) => ({ fieldId:x.fieldId || x.keyCode || '', code:x.keyCode || x.code || '', name:x.keyName || x.name || '', text:valueOf(x.keyValue ?? x.text) })); }
function fieldEvidence(context, sourceClass, concept) { return (context?.evidence || []).filter((x) => x.sourceClass === sourceClass && x.concept === concept); }
function confirmedFact(context, concept) { return (context?.facts || []).find((x) => x.concept === concept && x.status === 'CONFIRMED') || null; }

function documentIssues({ episode, documentSnapshots }) {
  const issues = [];
  for (const record of documentSnapshots || []) {
    const id = record.templateId || record.id; if (id === 'frontpage') continue;
    const template = templateById(id); if (!template) continue;
    const qc = runDocumentQc({ template, episode, fields: fieldsFor(record) });
    qc.issues.forEach((item, index) => issues.push(qIssue({
      issueId:`QI-DOC-${episode.episodeId}-${id}-${item.code}-${index+1}`, episodeId:episode.episodeId, qcDomain:'DOCUMENT',
      type:item.code, severity:severity(item.severity), title:`${template.name}：${item.message}`, message:item.message,
      evidenceRefs:[], impactScope:['DOCUMENT'], blocking:item.severity === 'error', source:template.name, field:item.field || item.fieldName || '',
    })));
  }
  return issues;
}

function frontPageIssues({ episode, documentSnapshots, factContext }) {
  const issues = []; const front = savedRecord(documentSnapshots,'frontpage'); if (!front) return issues;
  const checks = [
    ['diagnosis.principal.code','主要诊断代码','FRONTPAGE_PRINCIPAL_DIAGNOSIS_MISMATCH'],
    ['procedure.primary.code','主要手术/操作代码','FRONTPAGE_PRIMARY_PROCEDURE_MISMATCH'],
    ['patient.age','年龄','FRONTPAGE_AGE_MISMATCH'],
    ['patient.sex','性别','FRONTPAGE_SEX_MISMATCH'],
  ];
  for (const [concept,label,code] of checks) {
    const canonical = confirmedFact(factContext,concept); if (!canonical) continue;
    const frontEvidence = fieldEvidence(factContext,'FRONTPAGE',concept);
    if (!frontEvidence.length) {
      if (concept === 'procedure.primary.code' && episode.procedures?.[0]?.code) issues.push(qIssue({
        issueId:`QI-FP-${episode.episodeId}-${code}-MISSING`, episodeId:episode.episodeId, qcDomain:'FRONT_PAGE', type:'FRONTPAGE_REQUIRED_FACT_MISSING', severity:'high',
        title:`病案首页缺少${label}`, message:`患者事实层已确认 ${label}=${canonical.value}，但病案首页没有对应结构化字段值。`, factRefs:[canonical.factId], evidenceRefs:canonical.evidenceIds,
        impactScope:['FRONTPAGE','SETTLEMENT','GROUPING','AUDIT'], blocking:true,
      }));
      continue;
    }
    const same = frontEvidence.some((x) => norm(x.value) === norm(canonical.value));
    if (!same) issues.push(qIssue({
      issueId:`QI-FP-${episode.episodeId}-${code}`, episodeId:episode.episodeId, qcDomain:'FRONT_PAGE', type:code, severity:'high', title:`病案首页${label}与患者已确认事实不一致`,
      message:`患者事实层采用 ${canonical.value}；病案首页记录 ${frontEvidence.map((x)=>valueOf(x.value)).join(' / ')}。`, factRefs:[canonical.factId], evidenceRefs:[...new Set([...canonical.evidenceIds,...frontEvidence.map((x)=>x.evidenceId)])],
      impactScope:['FRONTPAGE','SETTLEMENT','GROUPING','AUDIT'], blocking:true,
    }));
  }
  return issues;
}

function settlementIssues({ episode, settlement }) {
  return (settlement ? validateSettlementList(settlement) : []).map((item,index) => qIssue({
    issueId:`QI-SET-${episode.episodeId}-${item.code}-${index+1}`, episodeId:episode.episodeId, qcDomain:'SETTLEMENT', type:item.code, severity:severity(item.severity),
    title:item.message, message:item.message, evidenceRefs:item.evidenceRefs || [], conflictRefs:item.conflictId ? [item.conflictId] : [], impactScope:item.impactScope?.length ? item.impactScope : ['SETTLEMENT'],
    blocking:item.severity === 'error', field:item.field || '',
  }));
}

function groupingIssues({ episode, groupingRun }) {
  if (!groupingRun) return [];
  const result = groupingRun.groupingResult || {}; const status = String(result.status || ''); const issues = [];
  if (/BLOCKED_BY_FACT_CONFLICT/i.test(status)) issues.push(qIssue({ issueId:`QI-GROUP-${episode.episodeId}-FACT-BLOCK`,episodeId:episode.episodeId,qcDomain:'GROUPING',type:'GROUPING_BLOCKED_BY_FACT_CONFLICT',severity:'high',title:'分组被患者关键事实冲突阻断',message:'必须先处理患者事实与证据层中的阻断冲突，再生成可信分组输入。',impactScope:['GROUPING','AUDIT'],blocking:true }));
  else if (/INVALID_INPUT/i.test(status)) issues.push(qIssue({ issueId:`QI-GROUP-${episode.episodeId}-INVALID`,episodeId:episode.episodeId,qcDomain:'GROUPING',type:'GROUPING_INPUT_INVALID',severity:'high',title:'DRG/DIP 分组输入无效',message:(result.errors || []).map((x)=>typeof x==='string'?x:x.message).join('；') || '分组输入未通过完整性/规则支持校验。',impactScope:['GROUPING','AUDIT'],blocking:true }));
  else if (/NOT_GROUPED/i.test(status)) issues.push(qIssue({ issueId:`QI-GROUP-${episode.episodeId}-${status}`,episodeId:episode.episodeId,qcDomain:'GROUPING',type:status,severity:'high',title:`分组失败：${status}`,message:'当前输入未得到有效 DRG/DIP 分组；该状态不能按成功结果继续支付测算或医保审核。',impactScope:['GROUPING','AUDIT'],blocking:true }));
  if (result.mappingConfirmationRequired) issues.push(qIssue({ issueId:`QI-GROUP-${episode.episodeId}-CODING-CONFIRM`,episodeId:episode.episodeId,qcDomain:'GROUPING',type:'CODING_CONFIRMATION_REQUIRED',severity:'medium',title:'分组依赖待确认编码映射',message:'当前结果仍依赖编码员确认的标准编码映射，不能视为正式可信结果。',impactScope:['GROUPING','AUDIT'],blocking:true }));
  const validation = groupingRun.inputIntegrity;
  for (const [index,item] of (validation?.errors || []).entries()) issues.push(qIssue({ issueId:`QI-GROUP-${episode.episodeId}-${item.code}-${index+1}`,episodeId:episode.episodeId,qcDomain:'GROUPING',type:item.code,severity:'high',title:item.message,message:item.message,impactScope:['GROUPING','AUDIT'],blocking:true,field:item.field || '' }));
  return issues;
}

function auditIssues({ episode, auditRun }) {
  if (!auditRun || auditRun.blocked) return [];
  return (auditRun.risks || []).filter((risk)=>risk.type !== 'SETTLEMENT_DATA_QUALITY').map((risk,index)=>qIssue({
    issueId:`QI-AUDIT-${risk.riskId || index+1}`,episodeId:episode.episodeId,qcDomain:'INSURANCE_AUDIT',type:risk.type || risk.ruleCode || 'AUDIT_RISK',severity:severity(risk.severity),
    title:risk.title || risk.reason || '医保审核风险',message:risk.reason || risk.title || '',evidenceRefs:risk.evidenceBundle?.evidence?.map((x)=>x.evidenceId).filter(Boolean) || [],impactScope:['AUDIT'],blocking:risk.severity === 'high',status:risk.status || 'PENDING_REVIEW',
  }));
}

function dedupe(issues) {
  const map = new Map();
  for (const issue of issues) { const key = `${issue.qcDomain}|${issue.type}|${issue.title}`; if (!map.has(key)) map.set(key, issue); }
  return [...map.values()];
}
function domainStatus(domainId, issues, executed) {
  if (!executed) return 'NOT_RUN'; const rows = issues.filter((x)=>x.qcDomain===domainId);
  if (rows.some((x)=>x.blocking || x.severity === 'high')) return 'BLOCKED';
  if (rows.length) return 'REVIEW'; return 'PASS';
}

function hasCrossSourceFacts(context) {
  const sourcesByConcept = new Map();
  for (const item of context?.evidence || []) {
    if (!item.concept || !item.sourceClass) continue;
    if (!sourcesByConcept.has(item.concept)) sourcesByConcept.set(item.concept, new Set());
    sourcesByConcept.get(item.concept).add(item.sourceClass);
  }
  return [...sourcesByConcept.values()].some((sources) => sources.size > 1);
}

export function runFullChainQualityControl({ episode, documentSnapshots = [], factContext, settlement = null, groupingRun = null, auditRun = null } = {}) {
  if (!episode?.episodeId) throw new Error('episode is required');
  const issues = dedupe([
    ...documentIssues({episode,documentSnapshots}),
    ...qualityIssuesFromFactConflicts(factContext || {episodeId:episode.episodeId,conflicts:[],facts:[]}),
    ...frontPageIssues({episode,documentSnapshots,factContext}),
    ...settlementIssues({episode,settlement}),
    ...groupingIssues({episode,groupingRun}),
    ...auditIssues({episode,auditRun}),
  ]);
  const hasFrontPage = Boolean(savedRecord(documentSnapshots,'frontpage'));
  const hasDocument = (documentSnapshots || []).some((record) => {
    const id = record.templateId || record.id;
    return id !== 'frontpage' && Boolean(templateById(id));
  });
  const crossSourceExecuted = hasCrossSourceFacts(factContext);
  const domains = QUALITY_DOMAINS.map((domain) => {
    const executed = domain.id === 'DOCUMENT' ? hasDocument
      : domain.id === 'CROSS_DOCUMENT' ? crossSourceExecuted
      : domain.id === 'FRONT_PAGE' ? hasFrontPage
      : domain.id === 'SETTLEMENT' ? Boolean(settlement)
      : domain.id === 'GROUPING' ? Boolean(groupingRun)
      : Boolean(auditRun && !auditRun.blocked);
    const rows = issues.filter((x)=>x.qcDomain===domain.id);
    return { ...domain, executed, status:domainStatus(domain.id,issues,executed), issueCount:rows.length, blockingCount:rows.filter((x)=>x.blocking).length };
  });
  return {
    qcRunId:`FULL-QC-${episode.episodeId}-${Date.now()}`,episodeId:episode.episodeId,createdAt:new Date().toISOString(),domains,issues,
    summary:{ total:issues.length, blocking:issues.filter((x)=>x.blocking).length, high:issues.filter((x)=>x.severity==='high').length, medium:issues.filter((x)=>x.severity==='medium').length },
    finalStatus:domains.some((x)=>x.status==='BLOCKED')?'BLOCKED':issues.length?'REVIEW':domains.some((x)=>!x.executed)?'PARTIAL':'PASS',
  };
}
