import { createEpisodeFixture } from './data/episode.js';
import { DOCUMENT_TEMPLATES, groupedTemplates, getDocumentTemplate } from './data/templates.js';
import { mountMedicalRecordEditor, runDocumentQc, saveDocumentSnapshot } from './domain/medical-record-editor.js';
import { buildSettlementList, validateSettlementList } from './domain/settlement.js';
import { renderSettlementPaper } from './domain/settlement-template.js';
import { qualitySummary } from './domain/quality-control.js';
import { initDesignScale } from './design/rem.js';
import { icon } from './design/icons.js';
import { escapeHtml, first, asArray, statusBadge, appButton, pageHeader, metricCard, baseCard, navIcon } from './ui/primitives.js';
import { groupingPath, ruleTrace, riskIssueCard, evidencePanel } from './ui/domain-components.js';

initDesignScale();

const NAV_ITEMS = [
  { id: 'overview', icon: 'overview', label: 'Episode 总览' },
  { id: 'documents', icon: 'document', label: '病历编辑质控' },
  { id: 'frontpage', icon: 'frontpage', label: '病案首页' },
  { id: 'settlement', icon: 'settlement', label: '医保结算清单' },
  { id: 'grouping', icon: 'grouping', label: 'DRG / DIP 3.0' },
  { id: 'audit', icon: 'audit', label: '智能医保审核' },
];

const episode = createEpisodeFixture();
const query = new URLSearchParams(location.search);
const state = {
  view: query.get('view') || 'overview',
  templateId: query.get('template') || 'admission',
  rightTab: 'qc',
  editorSession: null,
  editorMountToken: 0,
  editorStatus: 'idle',
  savedDocuments: {},
  confirmedDocs: new Set(),
  qcIgnored: new Set(),
  qcShowAll: false,
  settlement: null,
  settlementIssues: [],
  snapshot: null,
  response: null,
  reconciliation: null,
  selectedRiskId: null,
  reviewLog: new Map(),
  toast: null,
};

const patient = () => episode.patient || {};
const procedureList = () => asArray(episode.procedures);
const diagnosisList = () => [episode.diagnoses?.principal, ...asArray(episode.diagnoses?.secondary)].filter(Boolean);
const chargeList = () => asArray(first(episode.fees?.items, episode.charges, episode.costs?.items));
const totalAmount = () => chargeList().reduce((sum, item) => sum + Number(item.amount || 0), 0);
const episodeTitle = () => first(patient().name, '合成病例 A-001');
const episodeId = () => first(episode.inpatientNumber, episode.episodeId, 'EP-DEMO-001');
const currentTemplate = () => getDocumentTemplate(state.templateId);

function ensureSettlement() {
  if (!state.settlement) state.settlement = buildSettlementList(episode);
  state.settlementIssues = asArray(validateSettlementList(state.settlement));
  return state.settlement;
}

function collectDocumentIssues() {
  const issues = [];
  for (const template of DOCUMENT_TEMPLATES) {
    if (template.id === 'frontpage') continue;
    const qc = runDocumentQc({ template, episode });
    qc.issues.forEach((issue) => issues.push({ ...issue, id: `${template.id}:${issue.code}`, source: template.name }));
  }
  return issues;
}

function buildRisks() {
  ensureSettlement();
  return [
    ...collectDocumentIssues().filter((x) => x.severity === 'error'),
    ...state.settlementIssues.map((x, index) => ({ ...x, id: `settlement:${x.code}:${index}`, source: '医保结算清单' })),
  ];
}

function shell(content) {
  const risks = buildRisks();
  return `<div class="app-layout">
    <aside class="app-sidebar">
      <div class="app-brand"><div class="app-brand__logo">${icon('logo')}</div><div class="app-brand__content"><strong>住院医疗智能系统</strong><span>Clinical-to-Claim</span></div></div>
      <nav class="business-nav">${NAV_ITEMS.map((item) => `<button class="business-nav__link ${state.view === item.id ? 'is-active' : ''}" data-view="${item.id}">${navIcon(item.icon)}<span>${escapeHtml(item.label)}</span></button>`).join('')}</nav>
      <div class="app-sidebar__spacer"></div>
      <div class="sidebar-patient"><strong>${escapeHtml(episodeTitle())}</strong><p>${escapeHtml(episodeId())}<br>${escapeHtml(first(episode.admission?.department, '普通外科'))} · ${escapeHtml(first(patient().sex, ''))} · ${escapeHtml(first(patient().age, ''))}岁</p><div style="margin-top:1rem">${statusBadge('住院 Episode', 'blue', true)}</div></div>
      <div class="sidebar-footer">本地运行<div class="sidebar-footer__row"><span class="sidebar-footer__dot"></span>病历编辑质控：本地组件</div><div class="sidebar-footer__row"><span class="sidebar-footer__dot"></span>病历模板：本地文件</div><div class="sidebar-footer__row"><span class="sidebar-footer__dot warning"></span>DRG / DIP 3.0：P1 接入</div></div>
    </aside>
    <main class="app-main">${content}</main>
    ${state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : ''}
  </div>`;
}

function renderOverview() {
  ensureSettlement();
  const actions = appButton('进入病历编辑', { action: 'go-documents', variant: 'primary', iconName: 'document' });
  return shell(`<div class="page-shell">${pageHeader('住院 Episode 总览', '围绕同一住院病例串联病历、病案首页、医保结算与后续 DRG/DIP 审核。', actions)}<div class="page-content page-content--soft">
    <div class="summary-strip">${metricCard('临床文书', DOCUMENT_TEMPLATES.length, '本地模板与结构化数据元')}${metricCard('诊断 / 手术', `${diagnosisList().length} / ${procedureList().length}`, '统一挂在住院 Episode')}${metricCard('住院费用', `¥${totalAmount().toFixed(2)}`, `${chargeList().length} 条费用明细`)}${metricCard('当前风险', buildRisks().length, '确定性质控线索')}</div>
    ${baseCard('业务闭环', `<div class="overview-flow">${[
      ['病历编辑质控','入院 / 病程 / 查房 / 手术 / 出院'],['终末质控','完整性 / 一致性 / 人工确认'],['病案首页','诊断与手术编码确认'],['医保结算清单','三页模板与费用勾稽'],['DRG / DIP 3.0','国家规则 Adapter'],['智能审核','风险 → 证据 → 人工复核'],
    ].map(([a,b])=>`<div class="overview-flow__step"><strong>${a}</strong><span>${b}</span></div>`).join('')}</div>`, { desc: '界面全部继承 Gold Master；病历编辑组件已经完全本地化，不依赖任何外部站点运行。' })}
    <div class="page-grid-2" style="margin-top:2rem">${baseCard('本地病历编辑质控', `<div class="kv-list"><div class="kv-row"><label>运行方式</label><span>纯前端本地组件</span></div><div class="kv-row"><label>模板位置</label><span class="mono">product/medical-record-templates</span></div><div class="kv-row"><label>数据元</label><span>data-med-code / data-med-name</span></div></div>`, { badge: statusBadge('100% 本地', 'green') })}${baseCard('语音能力', `<div class="voice-placeholder"><div class="voice-placeholder__icon">${icon('mic')}</div><h3>语音入口保留</h3><p>本期不实现 ASR；研发接入 transcript / structuredDraft / evidenceSegments 后仍进入同一病历工作台。</p>${appButton('待研发接入', { disabled: true, iconName: 'mic' })}</div>`, { badge: statusBadge('接口占位', 'gray') })}</div>
  </div></div>`);
}

function renderRecordNavigation(activeId, frontPageOnly = false) {
  const groups = groupedTemplates();
  return `<aside class="record-navigation"><header><strong>病历文书</strong><span>${frontPageOnly ? '首页' : '住院'}</span></header><div class="record-nav-scroll">${groups.map((group) => {
    const items = frontPageOnly ? group.items.filter((x) => x.id === 'frontpage') : group.items;
    if (!items.length) return '';
    return `<div class="record-group-label">${escapeHtml(group.group)}</div>${items.map((item) => `<button class="record-nav-item ${activeId === item.id ? 'is-active' : ''}" data-template-id="${item.id}"><strong>${escapeHtml(item.name)}</strong><span>${state.confirmedDocs.has(item.id) ? '已确认' : '可编辑'}</span></button>`).join('')}`;
  }).join('')}</div></aside>`;
}

function qcModel() {
  const summary = qualitySummary(currentTemplate().id, episode);
  const active = summary.reminders.filter((item) => !state.qcIgnored.has(item.id));
  const visible = state.qcShowAll ? active : active.filter((item) => !item.hiddenByDefault).slice(0, 3);
  return { ...summary, active, visible };
}

function qcOverlayHtml() {
  if (currentTemplate().id !== 'admission') return '';
  const model = qcModel();
  return `<div class="record-qc-floating"><div class="record-qc-topline"><span>${model.active.length}条提醒</span><button data-qc-action="ignore-all">☒忽略全部</button><button data-qc-action="toggle-all">${state.qcShowAll ? '收起' : '查看全部'}⇥</button></div><div class="record-qc-reminders">${model.visible.map((item) => `<div class="record-qc-reminder ${item.severity}" data-qc-id="${escapeHtml(item.id)}"><span class="record-qc-icon">${item.severity === 'critical' ? '⚡' : '!'}</span><div class="record-qc-copy"><b>${escapeHtml(item.title)}：</b><span>${escapeHtml(item.message)}</span></div><div class="record-qc-actions">${item.action === 'assess' ? `<button class="assess" data-qc-action="assess" data-qc-id="${escapeHtml(item.id)}">去评估</button>` : ''}<button data-qc-action="ignore" data-qc-id="${escapeHtml(item.id)}">忽略</button></div></div>`).join('') || `<div class="record-qc-clear">当前提醒已全部忽略 <button data-qc-action="restore">恢复提醒</button></div>`}</div></div>`;
}

function mountQcUi() {
  const host = document.querySelector('#medical-record-editor-host');
  if (!host) return;
  host.querySelector('.record-qc-floating')?.remove();
  host.querySelectorAll('[data-quality-inline]').forEach((x) => x.remove());
  const paper = host.querySelector('.record-editor-paper');
  if (!paper) return;
  if (currentTemplate().id !== 'admission') return;
  paper.insertAdjacentHTML('afterbegin', qcOverlayHtml());
  const issues = qualitySummary('admission', episode).inlineIssues;
  for (const issue of issues) {
    if (state.qcIgnored.has(issue.id)) continue;
    const field = paper.querySelector(`[data-med-name="${CSS.escape(issue.field)}"]`);
    const anchor = field?.closest('p') || field?.parentElement;
    if (!anchor) continue;
    anchor.insertAdjacentHTML('afterend', `<div class="record-inline-qc" data-quality-inline="${escapeHtml(issue.id)}"><span>${issue.order}.</span> ${escapeHtml(issue.message)} <button data-qc-action="ignore-inline" data-qc-id="${escapeHtml(issue.id)}">忽略</button></div>`);
  }
  bindQcEvents();
}

function rightPanel() {
  const template = currentTemplate();
  const docQc = runDocumentQc({ template, episode });
  return `<aside class="patient-history"><div class="history-title"><h2>智能辅助</h2><p>质控、AI与语音统一在当前文书上下文内工作。</p></div><div class="tabs history-tabs"><button class="tab-button ${state.rightTab === 'qc' ? 'is-active' : ''}" data-right-tab="qc">病历质控</button><button class="tab-button ${state.rightTab === 'ai' ? 'is-active' : ''}" data-right-tab="ai">AI辅助</button><button class="tab-button ${state.rightTab === 'voice' ? 'is-active' : ''}" data-right-tab="voice">语音记录</button></div><div class="history-scroll">${state.rightTab === 'qc' ? `<div class="history-section"><button class="history-section-header"><strong>当前文书</strong>${statusBadge(docQc.issues.length ? '待处理' : '通过', docQc.issues.length ? 'amber' : 'green', true)}</button><div class="history-section-body">${docQc.issues.map((x)=>`<div class="history-item"><strong>${escapeHtml(x.message)}</strong><p>${escapeHtml(x.code)}</p></div>`).join('') || '<div class="success-box">基础完整性与时序质控通过。</div>'}</div></div><div class="history-section"><button class="history-section-header"><strong>内涵提醒</strong><span>${qcModel().active.length} 条</span></button><div class="history-section-body">${qcModel().active.map((x)=>`<div class="history-item"><strong>${escapeHtml(x.title)}</strong><p>${escapeHtml(x.message)}</p></div>`).join('') || '<div class="success-box">暂无提醒。</div>'}</div></div>` : state.rightTab === 'ai' ? `<div class="right-panel-placeholder">AI 草稿、跨文书整理、字段候选与修改建议后续接入。当前不伪造模型输出。</div>` : `<div class="voice-placeholder"><div class="voice-placeholder__icon">${icon('mic')}</div><h3>语音记录</h3><p>语音研发完成后，从这里接入实时转写与结构化草稿。</p>${appButton('开始记录', { disabled: true, iconName: 'mic' })}</div>`}</div></aside>`;
}

function renderDocuments(frontPageOnly = false) {
  if (frontPageOnly) state.templateId = 'frontpage';
  const template = currentTemplate();
  const actions = `${statusBadge('本地编辑组件', 'green')}${appButton('重新加载', { action: 'reload-editor', iconName: 'refresh' })}${appButton('保存草稿', { action: 'save-document' })}${appButton('医生确认', { action: 'confirm-document', variant: 'primary' })}`;
  return shell(`<div class="workbench-detail">${pageHeader(frontPageOnly ? '住院病案首页' : '病历编辑质控', frontPageOnly ? '病案首页继续使用同一套本地病历编辑组件与数据元。' : '本地化病历模板、编辑、质控提醒与正文定位；运行时不访问任何外部编辑器站点。', actions)}${renderRecordNavigation(template.id, frontPageOnly)}<main class="workbench-content"><section class="record-editor-stage"><div class="record-editor-tabs"><span class="record-editor-tab is-active">${escapeHtml(template.name)} <small>×</small></span><div class="record-editor-stage-meta">${statusBadge(state.confirmedDocs.has(template.id) ? '已确认' : '编辑中', state.confirmedDocs.has(template.id) ? 'green' : 'blue', true)}</div></div><div id="medical-record-editor-host" class="medical-record-editor-host"><div class="record-editor-loading">准备加载本地病历编辑组件…</div></div></section></main>${rightPanel()}</div>`);
}

function renderSettlement() {
  const list = ensureSettlement();
  const issueCount = state.settlementIssues.length;
  const actions = `${appButton('重新生成', { action: 'rebuild-settlement', iconName: 'refresh' })}${appButton('重新质控', { action: 'validate-settlement' })}${appButton('打印 / 导出 PDF', { action: 'print-settlement', variant: 'primary' })}`;
  return shell(`<div class="page-shell">${pageHeader('医疗保障基金结算清单', '沿用系统统一布局，同时保留真实三页纸张式结算清单。', actions)}<div class="page-content page-content--soft"><div class="summary-strip">${metricCard('清单流水号', list.claimSerialNumber, '单次住院结算快照')}${metricCard('住院总费用', `¥${Number(list.totalAmount || totalAmount()).toFixed(2)}`, 'HIS 费用确定性合计')}${metricCard('清单质控', issueCount ? `${issueCount} 项` : '通过', '必填 / 时序 / 金额勾稽')}${metricCard('业务状态', '草稿', 'P0 不提交医保生产平台')}</div>${issueCount ? `<div class="notice" style="margin-bottom:2rem">当前有 ${issueCount} 条结算清单问题；正式进入 P1 分组前需要先通过确定性质控。</div>` : '<div class="success-box" style="margin-bottom:2rem">当前结算清单结构质控通过。</div>'}<div class="settlement-document-shell">${renderSettlementPaper(list)}</div></div></div>`);
}

function renderGrouping() {
  ensureSettlement();
  const inputRows = `<table class="clinical-data-table"><thead><tr><th>输入维度</th><th>当前值</th><th>状态</th></tr></thead><tbody><tr><td>主要诊断</td><td>${escapeHtml(first(episode.diagnoses?.principal?.name, '未填写'))} / ${escapeHtml(first(episode.diagnoses?.principal?.code, '未编码'))}</td><td>${statusBadge(episode.diagnoses?.principal?.code ? '已准备' : '缺失', episode.diagnoses?.principal?.code ? 'green' : 'red', true)}</td></tr><tr><td>其他诊断</td><td>${escapeHtml(asArray(episode.diagnoses?.secondary).map((d)=>d.code).join('、') || '无')}</td><td>${statusBadge('已准备','green',true)}</td></tr><tr><td>手术 / 操作</td><td>${escapeHtml(procedureList().map((p)=>p.code).join('、') || '无')}</td><td>${statusBadge('已准备','green',true)}</td></tr><tr><td>结算清单质控</td><td>${state.settlementIssues.length} 条问题</td><td>${statusBadge(state.settlementIssues.some((x)=>x.severity==='error') ? '阻断':'通过', state.settlementIssues.some((x)=>x.severity==='error') ? 'red':'green', true)}</td></tr></tbody></table>`;
  return shell(`<div class="page-shell">${pageHeader('DRG / DIP 3.0', '页面已按统一设计系统收口；P1 接入真实国家 3.0 Grouper Adapter。', appButton('检查分组输入', { action: 'refresh-grouping', iconName: 'refresh' }))}<div class="page-content page-content--soft"><div class="grouping-layout"><div>${baseCard('国家 DRG 3.0', `${groupingPath({})}<div style="margin-top:2rem">${inputRows}</div>`, { desc: 'P0 不输出任何伪造分组结果。', badge: statusBadge('规则执行器待接入','amber') })}${baseCard('执行路径', ruleTrace([]), { desc: 'P1 展示 MDC → ADRG → DRG、CC/MCC/CCE 与逐步规则命中。' })}</div><div>${baseCard('国家 DIP 3.0', `<div class="kv-list"><div class="kv-row"><label>主要诊断</label><span>${escapeHtml(first(episode.diagnoses?.principal?.code,'待确认'))}</span></div><div class="kv-row"><label>主要操作</label><span>${escapeHtml(first(procedureList()[0]?.code,'待确认'))}</span></div><div class="kv-row"><label>病种结果</label><span>规则解析器待接入</span></div></div>`, { badge: statusBadge('Adapter 占位','gray') })}${baseCard('版本边界', `<div class="notice">国家 3.0 Grouper 与武汉本地支付参数严格拆开；在正式参数核验前不显示生产结算金额。</div>`, { badge: statusBadge('不伪造结果','blue') })}</div></div></div></div>`);
}

function renderAudit() {
  const risks = buildRisks();
  if (!state.selectedRiskId && risks.length) state.selectedRiskId = risks[0].id || risks[0].code;
  const selected = risks.find((r)=> (r.id || r.code) === state.selectedRiskId) || null;
  return shell(`<div class="page-shell">${pageHeader('智能医保审核', '风险线索 → 证据 → 人工复核；P0 只保留真实可追溯的确定性问题。', appButton('重新运行审核', { action: 'run-audit', variant: 'primary', iconName: 'refresh' }))}<div class="page-content page-content--soft"><div class="audit-summary">${metricCard('风险线索', risks.length, '文书 / 清单')}${metricCard('证据引用', risks.reduce((s,r)=>s+asArray(first(r.evidenceRefs,r.evidence,[])).length,0), '来源可追溯')}${metricCard('人工动作', state.reviewLog.size, '通过 / 退回 / 待核实')}</div><div class="audit-layout"><div class="risk-list">${risks.length ? risks.map((risk)=>riskIssueCard(risk,(risk.id||risk.code)===state.selectedRiskId)).join('') : '<div class="base-card"><div class="success-box">当前没有阻断性风险线索。</div></div>'}</div>${evidencePanel(selected)}</div></div></div>`);
}

function render() {
  const views = { overview: renderOverview, documents: () => renderDocuments(false), frontpage: () => renderDocuments(true), settlement: renderSettlement, grouping: renderGrouping, audit: renderAudit };
  document.querySelector('#app').innerHTML = (views[state.view] || renderOverview)();
  bindEvents();
  if (state.view === 'documents' || state.view === 'frontpage') void mountCurrentEditor();
}

async function mountCurrentEditor() {
  const token = ++state.editorMountToken;
  const host = document.querySelector('#medical-record-editor-host');
  if (!host) return;
  try {
    const session = await mountMedicalRecordEditor({ container: host, template: currentTemplate(), episode });
    if (token !== state.editorMountToken) { session.destroy?.(); return; }
    state.editorSession = session;
    if (state.confirmedDocs.has(currentTemplate().id)) session.setReadOnly?.(true);
    mountQcUi();
  } catch (error) {
    host.innerHTML = `<div class="editor-error"><b>本地病历模板加载失败</b><p>${escapeHtml(error.message)}</p></div>`;
  }
}

async function saveCurrentDocument(status = 'draft') {
  if (!state.editorSession) return flash('编辑器尚未准备完成。');
  const snapshot = await state.editorSession.snapshot();
  const record = saveDocumentSnapshot(currentTemplate(), episode, snapshot, status);
  state.savedDocuments[currentTemplate().id] = record;
  if (status === 'confirmed') {
    state.confirmedDocs.add(currentTemplate().id);
    state.editorSession.setReadOnly?.(true);
  }
  flash(status === 'confirmed' ? '已记录医生确认并锁定当前文书。' : '当前文书草稿已保存到本地。');
}

function bindQcEvents() {
  document.querySelectorAll('[data-qc-action]').forEach((el)=>{
    if (el.dataset.qcBound === 'true') return;
    el.dataset.qcBound = 'true';
    el.addEventListener('click',()=>{
      const action=el.dataset.qcAction, id=el.dataset.qcId;
      if (action==='ignore' && id) state.qcIgnored.add(id);
      if (action==='ignore-all') qcModel().active.forEach((item)=>state.qcIgnored.add(item.id));
      if (action==='restore') state.qcIgnored.clear();
      if (action==='toggle-all') state.qcShowAll=!state.qcShowAll;
      if (action==='assess') flash('已进入 DME 评估入口：当前演示评分为低危 2 分。');
      if (action==='ignore-inline' && id) state.qcIgnored.add(id);
      mountQcUi();
    });
  });
}

function bindEvents() {
  document.querySelectorAll('[data-view]').forEach((el)=>el.addEventListener('click',()=>{ state.view = el.dataset.view; render(); }));
  document.querySelectorAll('[data-template-id]').forEach((el)=>el.addEventListener('click',()=>{ state.templateId = el.dataset.templateId; state.view='documents'; render(); }));
  document.querySelectorAll('[data-right-tab]').forEach((el)=>el.addEventListener('click',()=>{ state.rightTab = el.dataset.rightTab; render(); }));
  document.querySelectorAll('[data-risk-id]').forEach((el)=>el.addEventListener('click',()=>{ if (el.dataset.action === 'select-risk') { state.selectedRiskId=el.dataset.riskId; render(); } }));
  bindQcEvents();
  document.querySelectorAll('[data-action]').forEach((el)=>el.addEventListener('click',()=>handleAction(el.dataset.action,el)));
}

function handleAction(action, el) {
  if (action === 'go-documents') { state.view='documents'; render(); return; }
  if (action === 'reload-editor') { void mountCurrentEditor(); return; }
  if (action === 'save-document') { void saveCurrentDocument('draft'); return; }
  if (action === 'confirm-document') { void saveCurrentDocument('confirmed'); return; }
  if (action === 'rebuild-settlement') { state.settlement = buildSettlementList(episode); state.settlementIssues = asArray(validateSettlementList(state.settlement)); flash('结算清单已重新生成'); return; }
  if (action === 'validate-settlement') { ensureSettlement(); flash('结算清单已重新运行确定性质控'); return; }
  if (action === 'print-settlement') { window.print(); return; }
  if (action === 'refresh-grouping' || action === 'run-audit') { flash('已按当前 Episode 重新计算输入状态'); return; }
  if (action === 'select-risk') { state.selectedRiskId = el.dataset.riskId; render(); return; }
  if (action === 'review-risk') { state.reviewLog.set(el.dataset.riskId,{action:'reviewed',at:new Date().toISOString()}); flash('已记录人工复核动作'); return; }
}

function flash(message) {
  state.toast = message;
  render();
  setTimeout(() => { if (state.toast === message) { state.toast = null; render(); } }, 1600);
}

render();
