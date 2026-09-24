import { escapeHtml, statusBadge, appButton, first, asArray } from './primitives.js';
import { icon } from '../design/icons.js';

export function groupingPath({ mdc = null, adrg = null, drg = null, labels = ['MDC', 'ADRG', 'DRG'] } = {}) {
  const node = (label, value) => `<div class="grouping-path__node ${value ? '' : 'is-pending'}"><strong>${escapeHtml(value || '待匹配')}</strong><span>${escapeHtml(label)}</span></div>`;
  const arrow = `<div class="grouping-path__arrow">${icon('arrowRight')}</div>`;
  return `<div class="grouping-path">${node(labels[0], mdc)}${arrow}${node(labels[1], adrg)}${arrow}${node(labels[2], drg)}</div>`;
}

export function ruleTrace(rows = []) {
  if (!rows.length) return '<div class="empty-state">正式 3.0 规则包接入后，此处展示逐步命中路径。</div>';
  return `<div class="rule-trace">${rows.map((row, index) => `<div class="rule-trace__row"><div class="rule-trace__index">${index + 1}</div><div><strong>${escapeHtml(first(row.title, row.name, row.code, `步骤 ${index + 1}`))}</strong><p>${escapeHtml(first(row.message, row.reason, row.description, ''))}</p>${row.details?.length?`<details class="rule-trace__details"><summary>查看规则依据</summary><dl>${row.details.map((item)=>`<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd></div>`).join('')}</dl></details>`:''}</div>${statusBadge(first(row.status, '已命中'), row.tone || 'blue', true)}</div>`).join('')}</div>`;
}

export function riskIssueCard(risk, selected = false, actionsHtml = '') {
  const severity = first(risk.severity, 'warning');
  const tone = severity === 'error' || severity === 'high' ? 'red' : severity === 'warning' || severity === 'medium' ? 'amber' : 'blue';
  const title = first(risk.title, risk.message, risk.code, '风险线索');
  const desc = first(risk.message, risk.description, risk.reason, '待人工核验');
  const actions = actionsHtml || `${appButton('查看证据', { action: 'select-risk', size: 'small', iconName: 'evidence', attrs: `data-risk-id="${escapeHtml(risk.id || risk.code || title)}"` })}${appButton('人工复核', { action: 'review-risk', size: 'small', variant: 'primary', attrs: `data-risk-id="${escapeHtml(risk.id || risk.code || title)}"` })}`;
  return `<article class="risk-issue-card ${selected ? 'is-selected' : ''}" data-risk-card="${escapeHtml(risk.id || risk.code || title)}"><div class="risk-issue-card__head"><div><h3>${escapeHtml(title)}</h3><div class="risk-issue-card__meta">${escapeHtml(first(risk.code, risk.ruleId, risk.source, 'RULE'))}</div></div>${statusBadge(severity === 'error' || severity === 'high' ? '高风险' : severity === 'warning' || severity === 'medium' ? '待核验' : '提示', tone)}</div><div class="risk-issue-card__body">${escapeHtml(desc)}</div><div class="risk-issue-card__actions">${actions}</div></article>`;
}

export function evidencePanel(risk) {
  if (!risk) return `<aside class="evidence-panel"><h2>临床证据</h2><p class="evidence-panel__sub">选择左侧风险线索后查看来源。</p><div class="right-panel-placeholder">证据只引用病例、文书、费用和编码来源，不由 AI 虚构。</div></aside>`;
  const refs = asArray(first(risk.evidenceRefs, risk.evidence, []));
  return `<aside class="evidence-panel"><h2>临床证据</h2><p class="evidence-panel__sub">${escapeHtml(first(risk.code, risk.ruleId, '风险线索'))} · 来源可追溯</p>${refs.length ? refs.map((ref, index) => `<div class="evidence-ref"><strong>证据 ${index + 1}</strong><p>${escapeHtml(typeof ref === 'string' ? ref : first(ref.excerpt, ref.sourceId, ref.factPath, JSON.stringify(ref)))}</p></div>`).join('') : `<div class="evidence-ref"><strong>规则输出</strong><p>${escapeHtml(first(risk.message, risk.description, '暂无额外证据引用'))}</p></div>`}</aside>`;
}
