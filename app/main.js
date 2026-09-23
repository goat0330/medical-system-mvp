import { createEpisodeFixture } from './data/episode.js';
import { createGoldenEpisode, loadGoldenPatientBundle } from './data/golden-patient.js';
import { DOCUMENT_TEMPLATES, groupedTemplates, getDocumentTemplate } from './data/templates.js';
import { loadDocumentSnapshot, mountMedicalRecordEditor, runDocumentQc, saveDocumentSnapshot } from './domain/medical-record-editor.js';
import { buildSettlementList, getSettlementValue, recalculateSettlementTotals, SETTLEMENT_SOURCE_FIELDS, setSettlementValue, validateSettlementList } from './domain/settlement.js';
import { renderSettlementPaper } from './domain/settlement-template.js';
import { qualitySummary } from './domain/quality-control.js';
import { initDesignScale } from './design/rem.js';
import { icon } from './design/icons.js';
import { escapeHtml, first, asArray, statusBadge, appButton, pageHeader, metricCard, baseCard, navIcon } from './ui/primitives.js';
import { groupingPath, ruleTrace, riskIssueCard, evidencePanel } from './ui/domain-components.js';
import { AI_PROVIDER_PRESETS, listAiModels } from './services/ai/model-config.js';
import { runQualityControl } from './services/ai/quality-control.js';
import { openAiModelConfigDialog } from './ui/ai-model-config-dialog.js';

initDesignScale();

const NAV_ITEMS = [
  { id: 'overview', icon: 'overview', label: 'Episode 总览' },
  { id: 'documents', icon: 'document', label: '病历编辑质控' },
  { id: 'frontpage', icon: 'frontpage', label: '病案首页' },
  { id: 'settlement', icon: 'settlement', label: '医保结算清单' },
  { id: 'grouping', icon: 'grouping', label: 'DRG / DIP 3.0' },
  { id: 'audit', icon: 'audit', label: '智能医保审核' },
];

const baseEpisode = createEpisodeFixture();
const goldenBundle = location.origin ? await loadGoldenPatientBundle() : null;
const initialAiModels = await listAiModels().catch(() => []);
const query = new URLSearchParams(location.search);
const initialTemplateId = query.get('view') === 'frontpage' ? 'frontpage' : getDocumentTemplate(query.get('template') || 'admission').id;
const patientSpecs = [
  { key: 'p-12', bed: '12床', name: '虚构患者甲', sex: '男', age: 43, episodeId: 'EP-GOLDEN-001', department: '普通外科', status: 'Golden 样本', tone: 'blue', task: '全流程联调', golden: true },
  { key: 'p-01', bed: '01床', name: '王某某', sex: '男', age: 62, episodeId: 'EP-DEMO-002', department: '普通外科', status: '新入院', tone: 'blue', task: '待完成文书 4' },
  { key: 'p-03', bed: '03床', name: '李某某', sex: '女', age: 47, episodeId: 'EP-DEMO-003', department: '普通外科', status: '有待办', tone: 'amber', task: '质控问题 1' },
  { key: 'p-08', bed: '08床', name: '陈某某', sex: '男', age: 55, episodeId: 'EP-DEMO-004', department: '普通外科', status: '住院中', tone: 'gray', task: '待完成文书 1' },
  { key: 'p-16', bed: '16床', name: '赵某某', sex: '女', age: 71, episodeId: 'EP-DEMO-005', department: '普通外科', status: '今日出院', tone: 'green', task: '待确认出院记录' },
  { key: 'p-18', bed: '18床', name: '周某某', sex: '男', age: 36, episodeId: 'EP-DEMO-006', department: '普通外科', status: '住院中', tone: 'gray', task: '暂无待办' },
];
const cloneEpisode = (source) => typeof structuredClone === 'function' ? structuredClone(source) : JSON.parse(JSON.stringify(source));
const patientWorklist = patientSpecs.map((spec) => {
  const value = spec.golden ? createGoldenEpisode() : cloneEpisode(baseEpisode);
  const serial = spec.episodeId.slice(-3);
  if (spec.golden) {
    value.patient = { ...value.patient, patientId: `P-GOLDEN-${serial}` };
    value.medicalRecordNumber = `BA-GOLDEN-${serial}`;
    value.claimSerialNumber = `JSQD-GOLDEN-${serial}`;
    value.insurance = { ...value.insurance, number: `HB-WH-GOLDEN-${serial}` };
    value.goldenData = goldenBundle;
  } else {
    value.patient = { ...value.patient, patientId: `P-DEMO-${serial}`, name: spec.name, sex: spec.sex, age: spec.age };
    value.medicalRecordNumber = `BA-DEMO-${serial}`;
    value.claimSerialNumber = `JSQD-DEMO-${serial}`;
    value.fees = { ...value.fees, businessSerialNumber: `FY-DEMO-${serial}`, invoiceNumber: `INV-DEMO-${serial}` };
  }
  value.inpatientNumber = spec.episodeId;
  value.inpatientNo = spec.episodeId;
  value.inpatientId = spec.episodeId;
  value.episodeId = spec.episodeId;
  value.admission = { ...value.admission, department: spec.department, bed: spec.bed.replace('床', '') };
  if (spec.golden) value.fees = { ...value.fees, businessSerialNumber: `FY-GOLDEN-${serial}`, invoiceNumber: `INV-GOLDEN-${serial}` };
  return { ...spec, episode: value };
});
let episode = patientWorklist[0].episode;
const state = {
  view: query.get('view') || 'overview',
  templateId: initialTemplateId,
  openDocumentTabs: [initialTemplateId],
  documentQcState: {},
  selectedPatientKey: patientWorklist[0].key,
  patientSelectorOpen: false,
  rightTab: 'qc',
  editorSession: null,
  editorMountToken: 0,
  editorStatus: 'idle',
  savedDocuments: {},
  confirmedDocs: new Set(),
  qcIgnored: new Set(),
  qcShowAll: false,
  passiveQcIssues: [],
  aiQcFindings: [],
  aiQcHasRun: false,
  aiQcBusy: false,
  aiQcError: '',
  aiModels: initialAiModels,
  activeAiModelId: initialAiModels.find((model) => model.isDefault)?.id || initialAiModels[0]?.id || '',
  aiModelPickerOpen: false,
  aiQcScopes: { currentDocument: true, relatedDocuments: true, frontpageFields: false },
  selectedQcIssueId: '',
  patientHistoryWidth: 42,
  settlement: null,
  settlementIssues: [],
  settlementOverrides: null,
  settlementTab: 'settlement-overview',
  snapshot: null,
  response: null,
  reconciliation: null,
  selectedRiskId: null,
  reviewLog: new Map(),
  toast: null,
};
let documentTabTransition = false;

const patient = () => episode.patient || {};
const procedureList = () => asArray(episode.procedures);
const diagnosisList = () => [episode.diagnoses?.principal, ...asArray(episode.diagnoses?.secondary)].filter(Boolean);
const chargeList = () => asArray(first(episode.fees?.items, episode.charges, episode.costs?.items));
const totalAmount = () => chargeList().reduce((sum, item) => sum + Number(item.amount || 0), 0);
const episodeTitle = () => first(patient().name, '合成病例 A-001');
const episodeId = () => first(episode.inpatientNumber, episode.inpatientNo, episode.episodeId, 'EP-DEMO-001');
const currentTemplate = () => getDocumentTemplate(state.templateId);
const currentEditorTemplate = () => state.view === 'settlement' ? settlementEditorTemplate() : currentTemplate();
const currentPatientEntry = () => patientWorklist.find((item) => item.key === state.selectedPatientKey) || patientWorklist[0];
const docConfirmKey = (id) => `${state.selectedPatientKey}:${id}`;
const isDocConfirmed = (id) => state.confirmedDocs.has(docConfirmKey(id)) || loadDocumentSnapshot(getDocumentTemplate(id), episode)?.status === 'confirmed';

function settlementOverrideStorageKey() { return `medical-system:settlement-overrides:${episode.episodeId}`; }

function loadSettlementOverrides() {
  try { return JSON.parse(localStorage.getItem(settlementOverrideStorageKey()) || '{}'); } catch { return {}; }
}

function saveSettlementOverrides() {
  localStorage.setItem(settlementOverrideStorageKey(), JSON.stringify(state.settlementOverrides || {}));
}

function settlementSourceDocuments() {
  return DOCUMENT_TEMPLATES.flatMap((template) => {
    const saved = loadDocumentSnapshot(template, episode);
    return saved?.snapshot?.data ? [{ id: template.id, name: template.name, data: saved.snapshot.data }] : [];
  });
}

function ensureSettlement(rebuild = false) {
  if (!state.settlement || rebuild) {
    state.settlementOverrides = loadSettlementOverrides();
    state.settlement = buildSettlementList(episode, {
      sourceDocuments: settlementSourceDocuments(),
      overrides: state.settlementOverrides,
    });
  }
  state.settlementIssues = asArray(validateSettlementList(state.settlement));
  return state.settlement;
}

function settlementEditorTemplate() {
  const list = ensureSettlement();
  const html = renderSettlementPaper(list);
  const decode = (value) => value.replaceAll('&quot;', '"').replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&amp;', '&');
  const initialData = [...html.matchAll(/<span\b[^>]*class="new-textbox sheet-value"[^>]*>[\s\S]*?<\/span>/g)].flatMap(([markup]) => {
    const field = (name) => markup.match(new RegExp(`data-${name}="([^"]*)"`))?.[1] || '';
    const value = markup.match(/<span class="new-textbox-content"[^>]*>([\s\S]*?)<\/span>/)?.[1] || '';
    const keyCode = field('hm-code');
    const keyValue = decode(value);
    if (!keyCode || !keyValue.trim()) return [];
    const items = decode(field('hm-items')).split('#').filter(Boolean);
    const selected = items.find((item) => item.replace(/\([^()]*\)$/, '').trim() === keyValue.trim());
    const optionCode = selected?.match(/\(([^()]*)\)$/)?.[1] || '';
    return [{ keyCode, keyName: decode(field('hm-name')), keyValue: selected ? { code: optionCode, value: selected.replace(/\([^()]*\)$/, '').trim() } : keyValue }];
  });
  return {
    id: 'settlement',
    name: '医保结算清单',
    docCode: 'settlement_list',
    html,
    initialData,
    editorConfig: { contentsCss: [`${location.origin}/app/design/tokens.css`, `${location.origin}/app/design/settlement-paper.css`] },
  };
}

window.medicalSystemMvp = {
  getEpisodeContext() {
    return {
      episode,
      settlement: ensureSettlement(),
      settlementIssues: [...state.settlementIssues],
      patientKey: state.selectedPatientKey,
    };
  },
  getPatientOptions() {
    return patientWorklist.map(({ key, bed, episodeId: id, department, sex, age, name }) => ({
      key, bed, episodeId: id, department, sex, age, name,
    }));
  },
  getSelectedPatientKey() { return state.selectedPatientKey; },
  selectPatientByKey(key) { selectPatient(key); },
};

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

function renderPatientSelector() {
  const current = currentPatientEntry();
  return `<div class="patient-selector-block">
    <div class="patient-selector-label">当前患者</div>
    <button class="patient-selector-card ${state.patientSelectorOpen ? 'is-open' : ''}" data-action="toggle-patient-selector" aria-expanded="${state.patientSelectorOpen ? 'true' : 'false'}">
      <div class="patient-selector-card__top"><strong><span>${escapeHtml(current.bed)}</span>${escapeHtml(episodeTitle())}</strong><span class="patient-selector-chevron">${icon('chevronDown')}</span></div>
      <div class="patient-selector-card__meta">${escapeHtml(episodeId())} · ${escapeHtml(current.department)} · ${escapeHtml(current.sex)} · ${escapeHtml(current.age)}岁</div>
      <div class="patient-selector-card__status">${statusBadge('住院 Episode', 'blue', true)}</div>
    </button>
    ${state.patientSelectorOpen ? `<div class="patient-selector-menu">
      <div class="patient-selector-menu__head"><strong>我的住院患者</strong><span>${patientWorklist.length} 人</span></div>
      <div class="patient-selector-menu__list">${patientWorklist.map((item) => `<button class="patient-option ${item.key === state.selectedPatientKey ? 'is-selected' : ''}" data-patient-key="${escapeHtml(item.key)}">
        <div class="patient-option__top"><strong><span>${escapeHtml(item.bed)}</span>${escapeHtml(item.name)}</strong>${statusBadge(item.status, item.tone, true)}</div>
        <div class="patient-option__meta">${escapeHtml(item.episodeId)} · ${escapeHtml(item.department)} · ${escapeHtml(item.sex)} · ${escapeHtml(item.age)}岁</div>
        <div class="patient-option__task">${escapeHtml(item.task)}</div>
      </button>`).join('')}</div>
    </div>` : ''}
  </div>`;
}

function renderRecordNavigation(activeId, frontPageOnly = false, includeSettlement = false) {
  const groups = groupedTemplates();
  const templates = DOCUMENT_TEMPLATES.filter((item) => item.id !== 'frontpage');
  return `<aside class="record-navigation">${renderPatientSelector()}<header class="record-navigation__title"><div><strong>住院病历</strong><span>${frontPageOnly ? 1 : templates.length} 份文书</span></div></header><div class="record-nav-scroll">${groups.map((group) => {
    const items = frontPageOnly ? group.items.filter((x) => x.id === 'frontpage') : group.items;
    if (!items.length) return '';
    return `<div class="record-group-label">${escapeHtml(group.group)}</div>${items.map((item) => `<button class="record-nav-item ${activeId === item.id ? 'is-active' : ''}" data-template-id="${item.id}"><strong>${escapeHtml(item.name)}</strong><span>${isDocConfirmed(item.id) ? '已确认' : '可编辑'}</span></button>`).join('')}`;
  }).join('')}${includeSettlement ? `<div class="record-group-label">医保结算</div><button class="record-nav-item ${activeId === 'settlement' ? 'is-active' : ''}" data-view="settlement"><strong>医保结算清单</strong><span>${activeId === 'settlement' ? '编辑中' : '跨文书映射'}</span></button>` : ''}</div></aside>`;
}

function qcModel() {
  const summary = qualitySummary(currentTemplate().id, episode);
  const active = summary.reminders.filter((item) => !state.qcIgnored.has(item.id));
  const visible = state.qcShowAll ? active : active.filter((item) => !item.hiddenByDefault).slice(0, 3);
  return { ...summary, active, visible };
}

function qcIssues() {
  const model = qcModel();
  const passive = state.passiveQcIssues
    .filter((item) => !state.qcIgnored.has(item.id))
    .map((item) => ({ ...item, kind: 'passive', source: '自动质控' }));
  const reminders = model.active
    .filter((item) => item.id !== 'QC-HISTORY-004')
    .map((item) => ({ ...item, kind: 'reminder', source: '规则提醒' }));
  const inline = model.inlineIssues
    .filter((item) => !state.qcIgnored.has(item.id))
    .map((item) => ({ ...item, kind: 'passive', title: item.title || '现病史完整性', source: '自动质控' }));
  return [...passive, ...inline, ...reminders, ...state.aiQcFindings.filter((item) => !state.qcIgnored.has(item.id))];
}

function qcSeverity(issue) {
  if (issue.severity === 'critical' || issue.severity === 'error') return { label: '严重', tone: 'red', className: 'critical' };
  if (issue.severity === 'warning') return { label: '提醒', tone: 'amber', className: 'warning' };
  return { label: '提示', tone: 'blue', className: 'info' };
}

function qcIssueAnchor(issue) {
  return Boolean(issue.anchors?.some((anchor) => anchor.fieldId || anchor.fieldCode || anchor.fieldName || anchor.name)
    || issue.fieldId || issue.fieldCode || issue.fieldName || issue.field);
}

function mountQcUi() {
  const host = document.querySelector('#medical-record-editor-host');
  if (!host) return;
  if (!host.querySelector('#record-qc-anchor-layer')) host.insertAdjacentHTML('beforeend', '<div id="record-qc-anchor-layer" class="record-qc-anchor-layer"></div>');
  bindQcEvents();
}

function qcIssueRow(issue) {
  const id = escapeHtml(issue.id || issue.code);
  const title = escapeHtml(issue.title || issue.fieldName || '病历质控提醒');
  const anchor = qcIssueAnchor(issue);
  const severity = qcSeverity(issue);
  return `<article class="history-item qc-issue-row qc-issue-row--${severity.className} ${state.selectedQcIssueId === (issue.id || issue.code) ? 'is-selected' : ''}">
    <div class="qc-issue-row__copy"><div class="qc-issue-row__heading">${anchor ? `<button class="qc-issue-open" data-qc-select="${id}"><strong>${title}</strong><span>${escapeHtml(issue.source || '质控提醒')}</span></button>` : `<div class="qc-issue-open"><strong>${title}</strong><span>${escapeHtml(issue.source || '质控提醒')}</span></div>`}${statusBadge(severity.label, severity.tone, true)}</div><p>${escapeHtml(issue.message || '')}</p>${issue.evidence ? `<small>证据：${escapeHtml(issue.evidence)}</small>` : ''}${issue.suggestion ? `<div class="qc-issue-suggestion"><b>建议</b><span>${escapeHtml(issue.suggestion)}</span></div>` : ''}</div>
    <div class="qc-issue-row__actions">${issue.action === 'assess' ? `<button data-qc-action="assess">去评估</button>` : ''}${anchor ? `<button data-qc-action="locate-issue" data-qc-id="${id}">定位</button>` : ''}<button data-qc-action="ignore-issue" data-qc-id="${id}">忽略</button></div>
  </article>`;
}

function currentAiModel() {
  return state.aiModels.find((model) => model.id === state.activeAiModelId)
    || state.aiModels.find((model) => model.isDefault)
    || null;
}

function aiModelStatus(model) {
  if (!model) return { label: '未配置', tone: 'gray' };
  if (!model.enabled) return { label: '已停用', tone: 'gray' };
  if (model.connected) return { label: '已连接', tone: 'green' };
  if (!model.apiKeyConfigured && model.protocol !== 'ollama') return { label: '待配置', tone: 'amber' };
  return { label: '待测试', tone: 'amber' };
}

function aiQcContent() {
  const findings = state.aiQcFindings;
  const model = currentAiModel();
  const provider = AI_PROVIDER_PRESETS.find((item) => item.provider === model?.provider) || AI_PROVIDER_PRESETS[0];
  const modelState = aiModelStatus(model);
  const currentScopes = state.aiQcScopes;
  const scopeCount = Object.values(currentScopes).filter(Boolean).length;
  const modelPicker = state.aiModelPickerOpen ? `<div class="ai-model-picker" role="listbox" aria-label="切换 AI 模型">${state.aiModels.length ? state.aiModels.map((item) => `<button type="button" role="option" aria-selected="${item.id === model?.id}" data-ai-model-activate="${escapeHtml(item.id)}" class="ai-model-picker__item ${item.id === model?.id ? 'is-selected' : ''}"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.modelId)}</small></span>${statusBadge(aiModelStatus(item).label, aiModelStatus(item).tone, true)}</button>`).join('') : `<p class="ai-model-picker__empty">暂无已配置模型，请先添加并保存。</p>`}</div>` : '';
  const currentDocLabel = currentTemplate().name;
  const resultContent = findings.length
    ? findings.map(qcIssueRow).join('')
    : state.aiQcBusy
      ? '<div class="right-panel-placeholder">AI 质控中，请稍候…</div>'
      : state.aiQcHasRun
        ? '<div class="success-box">本次运行未发现可报告的质控问题。</div>'
        : '<div class="right-panel-placeholder">运行后在这里查看逐条质控问题和修改建议，建议需由医生审核采纳。</div>';
  return `<div class="ai-qc-panel">
    <section class="base-card base-card--flat ai-model-card"><div class="ai-model-card__top"><h3>当前 AI 模型</h3><div class="ai-model-switch-wrap"><button type="button" class="app-button ai-model-switch" data-ai-model-switch aria-expanded="${state.aiModelPickerOpen}">切换模型 ${icon('chevronDown')}</button>${modelPicker}</div></div>
      <div class="ai-model-card__identity"><span class="ai-provider-mark ai-provider-mark--large">${icon('ai')}</span><span class="ai-model-card__copy"><strong>${escapeHtml(model?.name || provider.name)}</strong><small>${escapeHtml(model?.modelId || provider.modelId)}</small></span>${statusBadge(modelState.label, modelState.tone, true)}</div>
      <button type="button" class="app-button ai-model-settings" data-ai-model-settings>${icon('settings')}<span>模型设置</span></button>
    </section>
    <section class="base-card base-card--flat ai-qc-scopes"><h3>质控范围</h3><p>选择需要 AI 交叉检查的本次住院内容：</p>
      <label><input type="checkbox" data-ai-scope="currentDocument" ${currentScopes.currentDocument ? 'checked' : ''}><span>当前文书（${escapeHtml(currentDocLabel)}）</span></label>
      <label><input type="checkbox" data-ai-scope="relatedDocuments" ${currentScopes.relatedDocuments ? 'checked' : ''}><span>关联住院文书（本次住院的其他已保存文书）</span></label>
      <label><input type="checkbox" data-ai-scope="frontpageFields" ${currentScopes.frontpageFields ? 'checked' : ''}><span>病案首页（结构化字段）</span></label>
    </section>
    <button type="button" class="app-button app-button--primary ai-qc-run-button ${state.aiQcBusy ? 'is-loading' : ''}" data-ai-qc-run ${state.aiQcBusy || scopeCount === 0 ? 'disabled' : ''}>${state.aiQcBusy ? icon('spinner') : icon('play')}<span>${state.aiQcBusy ? 'AI 质控中…' : '运行 AI 质控'}</span></button>
    <p class="ai-qc-privacy-note">所选文书内容会发送至当前配置的模型服务。请仅使用虚构或已获授权的数据；AI 结果需由医生审核，不会自动修改病历。</p>
    ${state.aiQcError ? `<div class="ai-qc-error" role="alert">${escapeHtml(state.aiQcError)}</div>` : ''}
    <div class="history-section-body qc-issue-list ai-qc-results">${resultContent}</div>
  </div>`;
}

function settlementRightPanel() {
  const list = ensureSettlement();
  const issues = state.settlementIssues;
  const mappings = Object.entries(SETTLEMENT_SOURCE_FIELDS);
  const tab = state.settlementTab;
  const overview = `<div class="settlement-sidebar-summary">
    ${metricCard('清单流水号', list.claimSerialNumber, '单次住院结算快照')}
    ${metricCard('住院总费用', `¥${Number(list.fees.totals.amount || 0).toFixed(2)}`, '按当前费用明细合计')}
    ${metricCard('清单质控', issues.length ? `${issues.length} 项` : '通过', '必填 / 时序 / 金额勾稽')}
    ${metricCard('业务状态', '草稿', '仅本地演示，不提交医保平台')}
    ${issues.length ? `<div class="notice">当前有 ${issues.length} 条清单问题，请逐项核对后保存。</div>` : '<div class="success-box">当前清单结构质控通过。</div>'}
  </div>`;
  const mapping = `<div class="history-section"><div class="history-section-header"><strong>跨文书字段映射</strong><span>${mappings.length} 项</span></div><div class="history-section-body">${mappings.map(([path, binding]) => {
    const source = list.fieldSources[path] || 'Episode 演示基线';
    const value = getSettlementValue(list, path);
    return `<button class="settlement-map-row" data-settlement-field="${escapeHtml(path)}"><span><strong>${escapeHtml(binding.name)}</strong><small>${escapeHtml(source)} · ${escapeHtml(binding.code)}</small></span><span>${escapeHtml(value ?? '未填写')}</span></button>`;
  }).join('')}</div><p class="settlement-mapping-note">重新映射会读取当前住院患者已保存的病案首页、入院、病程、手术及出院文书；文书未保存内容不会参与。手动修改优先保留，未匹配字段沿用 Episode / HIS 值。</p></div>`;
  const quality = `<div class="history-section"><div class="history-section-header"><strong>清单质控</strong>${statusBadge(issues.length ? '待核对' : '通过', issues.length ? 'amber' : 'green', true)}</div><div class="history-section-body qc-issue-list">${issues.map((item) => `<article class="history-item qc-issue-row"><div class="qc-issue-row__copy"><strong>${escapeHtml(item.message)}</strong><p>${escapeHtml(item.code)}</p></div><div class="qc-issue-row__actions"><button data-settlement-field="${escapeHtml(item.field || '')}">定位</button></div></article>`).join('') || '<div class="success-box">必填项、时间顺序和费用勾稽均通过。</div>'}</div></div>`;
  const content = tab === 'settlement-overview' ? overview : tab === 'settlement-map' ? mapping : quality;
  return `<aside class="patient-history"><button class="workbench-resize-handle" data-workbench-resize role="separator" aria-orientation="vertical" aria-label="调整清单辅助栏宽度" aria-valuemin="36" aria-valuemax="48" aria-valuenow="${state.patientHistoryWidth}" tabindex="0"></button><div class="history-title"><h2>清单智能辅助</h2><p>清单概览、来源映射与字段质控。</p></div><div class="tabs history-tabs"><button class="tab-button ${tab === 'settlement-overview' ? 'is-active' : ''}" data-right-tab="settlement-overview">清单概览</button><button class="tab-button ${tab === 'settlement-map' ? 'is-active' : ''}" data-right-tab="settlement-map">字段映射</button><button class="tab-button ${tab === 'settlement-qc' ? 'is-active' : ''}" data-right-tab="settlement-qc">清单质控</button></div><div class="history-scroll">${content}</div></aside>`;
}

function documentMappingPanel() {
  const list = ensureSettlement();
  const mappings = Object.entries(SETTLEMENT_SOURCE_FIELDS);
  return `<div class="history-section"><div class="history-section-header"><strong>跨文书字段映射</strong><span>${mappings.length} 项</span></div><div class="history-section-body">${mappings.map(([path, binding]) => {
    const source = list.fieldSources[path] || 'Episode 演示基线';
    return `<div class="settlement-map-row"><span><strong>${escapeHtml(binding.name)}</strong><small>${escapeHtml(source)} · ${escapeHtml(binding.code)}</small></span><span>${escapeHtml(getSettlementValue(list, path) ?? '未填写')}</span></div>`;
  }).join('')}</div><p class="settlement-mapping-note">展示病历数据元与当前住院 Episode / 已保存文书的对应值；结算清单重映射时会读取已保存快照，未保存内容不会参与。</p></div>`;
}

function rightPanel() {
  if (state.view === 'settlement') return settlementRightPanel();
  const issues = qcIssues();
  const reminders = issues.filter((item) => item.kind === 'reminder');
  const passive = issues.filter((item) => item.kind === 'passive');
  const inlineAndAi = issues.filter((item) => item.kind !== 'reminder' && item.kind !== 'passive');
  const passiveTone = passive.some((item) => ['critical', 'error'].includes(item.severity)) ? 'red' : passive.length ? 'amber' : 'green';
  return `<aside class="patient-history"><button class="workbench-resize-handle" data-workbench-resize role="separator" aria-orientation="vertical" aria-label="调整智能辅助栏宽度" aria-valuemin="36" aria-valuemax="48" aria-valuenow="${state.patientHistoryWidth}" tabindex="0"></button>
    <div class="history-title"><h2>智能辅助</h2><p>规则自动检查、字段映射与当前病历建议。</p></div>
    <div class="tabs history-tabs"><button class="tab-button ${state.rightTab === 'qc' ? 'is-active' : ''}" data-right-tab="qc">病历质控</button><button class="tab-button ${state.rightTab === 'mapping' ? 'is-active' : ''}" data-right-tab="mapping">字段映射</button><button class="tab-button ${state.rightTab === 'ai' ? 'is-active' : ''}" data-right-tab="ai">AI辅助</button><button class="tab-button ${state.rightTab === 'voice' ? 'is-active' : ''}" data-right-tab="voice">语音记录</button></div>
    <div class="history-scroll">${state.rightTab === 'qc'
      ? `<div class="history-section"><div class="history-section-header"><strong>当前文书自动质控</strong>${statusBadge(passive.length ? '待处理' : '通过', passiveTone, true)}</div><div class="history-section-body qc-issue-list">${passive.map(qcIssueRow).join('') || '<div class="success-box">必填项、文书时序等规则检查通过。</div>'}</div></div>
        <div class="history-section"><div class="history-section-header"><strong>其他提醒</strong><span>${reminders.length} 条</span></div><div class="history-section-body qc-issue-list">${reminders.map(qcIssueRow).join('') || '<div class="success-box">暂无提醒。</div>'}</div></div>
        <div class="history-section"><div class="history-section-header"><strong>AI质控建议</strong><span>${inlineAndAi.length} 条</span></div><div class="history-section-body qc-issue-list">${inlineAndAi.map(qcIssueRow).join('') || '<div class="success-box">暂无 AI 建议。</div>'}</div></div><button type="button" class="app-button app-button--primary ai-qc-run-inline" data-qc-action="run-ai-qc" ${state.aiQcBusy ? 'disabled' : ''}>${state.aiQcBusy ? '正在分析…' : '运行质控'}</button>${state.aiQcError ? `<div class="ai-qc-error" role="alert">${escapeHtml(state.aiQcError)}</div>` : ''}`
      : state.rightTab === 'mapping' ? documentMappingPanel() : state.rightTab === 'ai' ? aiQcContent() : `<div class="voice-placeholder"><div class="voice-placeholder__icon">${icon('mic')}</div><h3>语音记录</h3><p>语音研发完成后，从这里接入实时转写与结构化草稿。</p>${appButton('开始记录', { disabled: true, iconName: 'mic' })}</div>`}</div></aside>`;
}

function renderDocuments(frontPageOnly = false) {
  if (frontPageOnly) state.templateId = 'frontpage';
  if (!state.openDocumentTabs.includes(state.templateId)) state.openDocumentTabs.push(state.templateId);
  const template = currentTemplate();
  const tabs = state.openDocumentTabs.map((id) => DOCUMENT_TEMPLATES.find((item) => item.id === id)).filter(Boolean);
  const tabMarkup = tabs.map((item) => `<div class="record-editor-tab ${state.templateId === item.id ? 'is-active' : ''}" role="presentation"><button type="button" class="record-editor-tab__select" role="tab" aria-selected="${state.templateId === item.id}" data-document-tab="${escapeHtml(item.id)}">${escapeHtml(item.name)}</button><button type="button" class="record-editor-tab__close" data-close-document-tab="${escapeHtml(item.id)}" aria-label="关闭${escapeHtml(item.name)}标签" title="关闭标签">${icon('close')}</button></div>`).join('');
  const actions = `${statusBadge('本地结构化编辑器', 'green')}${appButton('重新加载', { action: 'reload-editor', iconName: 'refresh' })}${appButton('保存草稿', { action: 'save-document' })}${appButton('医生确认', { action: 'confirm-document', variant: 'primary' })}`;
  return shell(`<div class="workbench-detail" style="--app-workbench-right:${state.patientHistoryWidth}rem">${pageHeader(frontPageOnly ? '住院病案首页' : '病历编辑质控', frontPageOnly ? '使用本地部署的结构化病历模板与编辑器。' : '结构化病历模板、编辑与质控在同一住院 Episode 内闭环。', actions)}${renderRecordNavigation(template.id, frontPageOnly, true)}<main class="workbench-content"><section class="record-editor-stage"><div class="record-editor-tabs"><div class="record-editor-tab-list" role="tablist" aria-label="已打开的住院文书">${tabMarkup}</div><div class="record-editor-stage-meta">${statusBadge(isDocConfirmed(template.id) ? '已确认' : '编辑中', isDocConfirmed(template.id) ? 'green' : 'blue', true)}</div></div><div id="medical-record-editor-host" class="medical-record-editor-host"><div class="record-editor-loading">准备加载本地结构化病历编辑器…</div></div></section></main>${rightPanel()}</div>`);
}

function renderSettlement() {
  const list = ensureSettlement();
  const actions = `${appButton('重新映射', { action: 'rebuild-settlement', iconName: 'refresh' })}${appButton('重新质控', { action: 'validate-settlement' })}${appButton('保存草稿', { action: 'save-document' })}${appButton('打印 / 导出 PDF', { action: 'print-settlement', variant: 'primary' })}`;
  return shell(`<div class="workbench-detail" style="--app-workbench-right:${state.patientHistoryWidth}rem">${pageHeader('医疗保障基金结算清单', '跨文书映射后可在本地结构化编辑器内逐字段修订；清单质控与来源说明在右侧。', actions)}${renderRecordNavigation('settlement', false, true)}<main class="workbench-content"><section class="record-editor-stage"><div class="record-editor-tabs"><span class="record-editor-tab is-active">医保结算清单 <small>×</small></span><div class="record-editor-stage-meta">${statusBadge('编辑中', 'blue', true)}</div></div><div id="medical-record-editor-host" class="medical-record-editor-host"><div class="record-editor-loading">准备加载本地结算清单编辑器…</div></div></section></main>${rightPanel()}</div>`);
}

function renderGrouping() {
  ensureSettlement();
  const inputRows = `<table class="clinical-data-table"><thead><tr><th>输入维度</th><th>当前值</th><th>状态</th></tr></thead><tbody><tr><td>主要诊断</td><td>${escapeHtml(first(episode.diagnoses?.principal?.name, '未填写'))} / ${escapeHtml(first(episode.diagnoses?.principal?.code, '未编码'))}</td><td>${statusBadge(episode.diagnoses?.principal?.code ? '已准备' : '缺失', episode.diagnoses?.principal?.code ? 'green' : 'red', true)}</td></tr><tr><td>其他诊断</td><td>${escapeHtml(asArray(episode.diagnoses?.secondary).map((d)=>d.code).join('、') || '无')}</td><td>${statusBadge('已准备','green',true)}</td></tr><tr><td>手术 / 操作</td><td>${escapeHtml(procedureList().map((p)=>p.code).join('、') || '无')}</td><td>${statusBadge('已准备','green',true)}</td></tr><tr><td>结算清单质控</td><td>${state.settlementIssues.length} 条问题</td><td>${statusBadge(state.settlementIssues.some((x)=>x.severity==='error') ? '阻断':'通过', state.settlementIssues.some((x)=>x.severity==='error') ? 'red':'green', true)}</td></tr></tbody></table>`;
  return shell(`<div class="page-shell">${pageHeader('DRG / DIP 3.0', '已接入国家 DRG / DIP 3.0 规则工作簿；武汉本地支付参数仍待核验。', appButton('检查分组输入', { action: 'refresh-grouping', iconName: 'refresh' }))}<div class="page-content page-content--soft"><div class="grouping-layout"><div>${baseCard('国家 DRG 3.0', `${groupingPath({})}<div style="margin-top:2rem">${inputRows}</div>`, { desc: 'P0 不输出任何伪造分组结果。', badge: statusBadge('规则执行器待接入','amber') })}${baseCard('执行路径', ruleTrace([]), { desc: 'P1 展示 MDC → ADRG → DRG、CC/MCC/CCE 与逐步规则命中。' })}</div><div>${baseCard('国家 DIP 3.0', `<div class="kv-list"><div class="kv-row"><label>主要诊断</label><span>${escapeHtml(first(episode.diagnoses?.principal?.code,'待确认'))}</span></div><div class="kv-row"><label>主要操作</label><span>${escapeHtml(first(procedureList()[0]?.code,'待确认'))}</span></div><div class="kv-row"><label>病种结果</label><span>规则解析器待接入</span></div></div>`, { badge: statusBadge('Adapter 占位','gray') })}${baseCard('版本边界', `<div class="notice">国家 3.0 Grouper 与武汉本地支付参数严格拆开；在正式参数核验前不显示生产结算金额。</div>`, { badge: statusBadge('不伪造结果','blue') })}</div></div></div></div>`);
}

function renderAudit() {
  const risks = buildRisks();
  if (!state.selectedRiskId && risks.length) state.selectedRiskId = risks[0].id || risks[0].code;
  const selected = risks.find((r)=> (r.id || r.code) === state.selectedRiskId) || null;
  return shell(`<div class="page-shell">${pageHeader('智能医保审核', '基于当前 Episode 的确定性审核、证据线索与人工复核；国家“两库”完整知识点未接入。', appButton('重新运行审核', { action: 'run-audit', variant: 'primary', iconName: 'refresh' }))}<div class="page-content page-content--soft"><div class="audit-summary">${metricCard('风险线索', risks.length, '文书 / 清单')}${metricCard('证据引用', risks.reduce((s,r)=>s+asArray(first(r.evidenceRefs,r.evidence,[])).length,0), '来源可追溯')}${metricCard('人工动作', state.reviewLog.size, '通过 / 退回 / 待核实')}</div><div class="audit-layout"><div class="risk-list">${risks.length ? risks.map((risk)=>riskIssueCard(risk,(risk.id||risk.code)===state.selectedRiskId)).join('') : '<div class="base-card"><div class="success-box">当前没有阻断性风险线索。</div></div>'}</div>${evidencePanel(selected)}</div></div></div>`);
}

function render() {
  state.editorMountToken += 1;
  state.editorSession?.destroy?.();
  state.editorSession = null;
  const views = { overview: renderOverview, documents: () => renderDocuments(false), frontpage: () => renderDocuments(true), settlement: renderSettlement, grouping: renderGrouping, audit: renderAudit };
  document.querySelector('#app').innerHTML = (views[state.view] || renderOverview)();
  bindEvents();
  if (state.view === 'documents' || state.view === 'frontpage' || state.view === 'settlement') void mountCurrentEditor();
}

async function mountCurrentEditor() {
  state.editorSession?.destroy?.();
  state.editorSession = null;
  const token = ++state.editorMountToken;
  const host = document.querySelector('#medical-record-editor-host');
  if (!host) return;
  try {
    const template = currentEditorTemplate();
    const session = await mountMedicalRecordEditor({
      container: host,
      template,
      episode,
      onChange: state.view === 'settlement' ? handleSettlementEditorChange : handleMedicalEditorChange,
    });
    if (token !== state.editorMountToken) { session.destroy?.(); return; }
    state.editorSession = session;
    if (state.view !== 'settlement' && isDocConfirmed(template.id)) session.setReadOnly?.(true);
    if (state.view === 'settlement') session.updateCalculatedFields?.(state.settlement.fees.totals);
    else {
      refreshPassiveDocumentQc(session.getStructuredFields?.() || []);
      mountQcUi();
      const firstAnchoredIssue = qcIssues().find((issue) => issue.kind === 'passive' && qcIssueAnchor(issue) && !state.qcIgnored.has(issue.id));
      if (firstAnchoredIssue) window.setTimeout(() => {
        if (token === state.editorMountToken && state.editorSession === session) void selectQcIssue(firstAnchoredIssue.id);
      }, 250);
    }
  } catch (error) {
    host.innerHTML = `<div class="editor-error"><b>本地结构化编辑器加载失败</b><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function rememberActiveDocumentQcState() {
  if (state.view !== 'documents' && state.view !== 'frontpage') return;
  state.documentQcState[state.templateId] = {
    passiveQcIssues: [...state.passiveQcIssues],
    aiQcFindings: [...state.aiQcFindings],
    aiQcError: state.aiQcError,
    ignoredIds: [...state.qcIgnored],
    showAll: state.qcShowAll,
  };
}

function restoreDocumentQcState(templateId) {
  const saved = state.documentQcState[templateId];
  state.passiveQcIssues = [...(saved?.passiveQcIssues || [])];
  state.aiQcFindings = [...(saved?.aiQcFindings || [])];
  state.aiQcError = saved?.aiQcError || '';
  state.qcIgnored = new Set(saved?.ignoredIds || []);
  state.qcShowAll = Boolean(saved?.showAll);
  state.selectedQcIssueId = '';
}

async function cacheActiveDocumentDraft() {
  if (!state.editorSession || (state.view !== 'documents' && state.view !== 'frontpage')) return true;
  const editorSession = state.editorSession;
  const template = currentTemplate();
  try {
    const snapshot = await editorSession.snapshot();
    const status = isDocConfirmed(template.id) ? 'confirmed' : 'draft';
    const record = saveDocumentSnapshot(template, episode, snapshot, status);
    state.savedDocuments[docConfirmKey(template.id)] = record;
    return true;
  } catch {
    flash('当前文书暂存失败，已取消切换；请先保存草稿后重试。');
    return false;
  }
}

async function openDocumentTab(templateId) {
  if (!DOCUMENT_TEMPLATES.some((item) => item.id === templateId)) return;
  if (state.view === 'documents' && state.templateId === templateId) return;
  if (documentTabTransition) return;
  documentTabTransition = true;
  try {
    if (!await cacheActiveDocumentDraft()) return;
    rememberActiveDocumentQcState();
    closeQcPopover();
    if (!state.openDocumentTabs.includes(templateId)) state.openDocumentTabs.push(templateId);
    state.templateId = templateId;
    state.view = 'documents';
    state.patientSelectorOpen = false;
    restoreDocumentQcState(templateId);
    render();
  } finally {
    documentTabTransition = false;
  }
}

async function closeDocumentTab(templateId) {
  const index = state.openDocumentTabs.indexOf(templateId);
  if (index < 0 || documentTabTransition) return;
  documentTabTransition = true;
  try {
    if (!await cacheActiveDocumentDraft()) return;
    rememberActiveDocumentQcState();
    const remaining = state.openDocumentTabs.filter((id) => id !== templateId);
    delete state.documentQcState[templateId];
    if (state.templateId === templateId) {
      const nextTemplateId = remaining.length ? remaining[Math.min(index, remaining.length - 1)] : 'admission';
      if (!remaining.length) remaining.push(nextTemplateId);
      closeQcPopover();
      state.templateId = nextTemplateId;
      state.view = 'documents';
      restoreDocumentQcState(nextTemplateId);
    }
    state.openDocumentTabs = remaining;
    render();
  } finally {
    documentTabTransition = false;
  }
}

async function saveCurrentDocument(status = 'draft') {
  if (!state.editorSession) return flash('编辑器尚未准备完成。');
  const snapshot = await state.editorSession.snapshot();
  const template = currentEditorTemplate();
  const record = saveDocumentSnapshot(template, episode, snapshot, status);
  state.savedDocuments[docConfirmKey(template.id)] = record;
  if (status === 'confirmed') {
    state.confirmedDocs.add(docConfirmKey(template.id));
    state.editorSession.setReadOnly?.(true);
  }
  const stageMeta = document.querySelector('.record-editor-stage-meta');
  if (stageMeta) stageMeta.innerHTML = statusBadge(status === 'confirmed' ? '已确认' : '编辑中', status === 'confirmed' ? 'green' : 'blue', true);
  flash(status === 'confirmed' ? '已记录医生确认并锁定当前文书。' : '当前文书草稿已保存到本地。');
}

function handleSettlementEditorChange({ path, value }) {
  if (!path || !state.settlement) return;
  setSettlementValue(state.settlement, path, value);
  state.settlement.fieldSources[path] = '手动修改';
  state.settlementOverrides ||= loadSettlementOverrides();
  state.settlementOverrides[path] = value;
  saveSettlementOverrides();
  const totals = recalculateSettlementTotals(state.settlement);
  state.settlementIssues = asArray(validateSettlementList(state.settlement));
  state.editorSession?.updateCalculatedFields?.(totals);
  refreshRightPanel();
}

function refreshPassiveDocumentQc(fields) {
  if (!fields.length) return;
  const previousIds = new Set(state.passiveQcIssues.map((item) => item.id));
  const result = runDocumentQc({ template: currentTemplate(), episode, fields });
  state.passiveQcIssues = result.issues.map((issue, index) => {
    const id = issue.id || `AUTO-${currentTemplate().id}-${issue.code || 'RULE'}-${issue.fieldCode || issue.fieldName || index}`;
    if (!previousIds.has(id)) state.qcIgnored.delete(id);
    return {
      ...issue,
      id,
      title: issue.title || (issue.fieldName ? `${issue.fieldName}完整性` : '文书规则校验'),
      source: '自动质控',
    };
  });
  if (state.selectedQcIssueId && !qcIssues().some((issue) => issue.id === state.selectedQcIssueId)) closeQcPopover();
  refreshRightPanel();
  mountQcUi();
}

function handleMedicalEditorChange({ fields = [] } = {}) {
  if (!fields.length) return;
  state.aiQcFindings = [];
  state.aiQcHasRun = false;
  state.aiQcError = '';
  refreshPassiveDocumentQc(fields);
}

function bindSettlementFieldEvents(root = document) {
  root.querySelectorAll('[data-settlement-field]').forEach((el) => {
    if (el.dataset.settlementFieldBound === 'true') return;
    el.dataset.settlementFieldBound = 'true';
    el.addEventListener('click', () => state.editorSession?.focusField?.(el.dataset.settlementField));
  });
}

function refreshRightPanel() {
  const current = document.querySelector('.patient-history');
  if (!current) return;
  const holder = document.createElement('div');
  holder.innerHTML = rightPanel();
  const replacement = holder.firstElementChild;
  current.replaceWith(replacement);
  bindRightPanelEvents(replacement);
}

function bindRightPanelEvents(root = document) {
  root.querySelectorAll('[data-right-tab]').forEach((el) => {
    if (el.dataset.rightTabBound === 'true') return;
    el.dataset.rightTabBound = 'true';
    el.addEventListener('click', () => {
      if (state.view === 'settlement') state.settlementTab = el.dataset.rightTab;
      else state.rightTab = el.dataset.rightTab;
      refreshRightPanel();
    });
  });
  bindQcEvents(root);
  bindAiAssistantEvents(root);
  bindSettlementFieldEvents(root);
  bindWorkbenchResize(root);
}

function closeQcPopover() {
  state.editorSession?.clearQualityAnchor?.();
  const layer = document.querySelector('#record-qc-anchor-layer');
  if (layer) layer.innerHTML = '';
  state.selectedQcIssueId = '';
}

function qcPopoverHtml(issue) {
  const isAi = issue.source === 'AI质控建议';
  const source = escapeHtml(issue.source || '病历质控');
  const title = escapeHtml(issue.title || issue.fieldName || '病历质控提醒');
  const severity = qcSeverity(issue);
  return `<section class="record-qc-anchor-popover record-qc-anchor-popover--${severity.className}" role="dialog" aria-label="质控建议" data-qc-popover>
    <header><div><span class="qc-popover-source">${source}</span>${statusBadge(severity.label, severity.tone, true)}<strong>${title}</strong></div><button type="button" data-qc-action="close-qc-popover" aria-label="关闭质控建议">×</button></header>
    <div class="qc-popover-message">${escapeHtml(issue.message || '')}</div>
    ${issue.evidence ? `<p><b>证据</b>${escapeHtml(issue.evidence)}</p>` : ''}
    ${issue.rationale ? `<p><b>判断依据</b>${escapeHtml(issue.rationale)}</p>` : ''}
    ${issue.suggestion ? `<div class="qc-popover-suggestion"><b>${isAi ? 'AI建议（待医生确认）' : '建议'}</b><span>${escapeHtml(issue.suggestion)}</span></div>` : ''}
    <footer><button type="button" data-qc-action="ignore-issue" data-qc-id="${escapeHtml(issue.id)}">忽略</button><button type="button" class="is-primary" data-qc-action="ai-suggest" data-qc-id="${escapeHtml(issue.id)}">${isAi ? '重新分析' : 'AI建议'}</button></footer>
  </section>`;
}

async function selectQcIssue(id) {
  const issue = qcIssues().find((item) => item.id === id);
  const layer = document.querySelector('#record-qc-anchor-layer');
  const host = document.querySelector('#medical-record-editor-host');
  if (!issue || !layer || !host) return;
  state.selectedQcIssueId = issue.id;
  refreshRightPanel();
  layer.innerHTML = qcPopoverHtml(issue);
  bindQcEvents(layer);
  const located = await state.editorSession?.focusQualityIssue?.(issue, ({ left, top, marks = [] }) => {
    layer.querySelectorAll('.record-qc-anchor-mark').forEach((mark) => mark.remove());
    marks.filter((mark) => mark.width > 0 && mark.height > 0).forEach((mark) => {
      const indicator = document.createElement('span');
      indicator.className = `record-qc-anchor-mark record-qc-anchor-mark--${mark.type === 'text' ? 'text' : 'field'} record-qc-anchor-mark--${qcSeverity(issue).className}`;
      indicator.setAttribute('aria-hidden', 'true');
      indicator.style.left = `${mark.left}px`;
      indicator.style.top = `${mark.top}px`;
      indicator.style.width = `${mark.width}px`;
      indicator.style.height = `${mark.height}px`;
      layer.append(indicator);
    });
    const popover = layer.querySelector('[data-qc-popover]');
    if (!popover) return;
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    const maxLeft = Math.max(8, host.clientWidth - popover.offsetWidth - 8);
    popover.style.left = `${Math.max(8, Math.min(left, maxLeft))}px`;
    const below = top + popover.offsetHeight <= host.clientHeight - 8;
    popover.style.top = `${below ? top : Math.max(8, top - popover.offsetHeight - 20)}px`;
  });
  if (!located) {
    layer.innerHTML = '';
    state.editorSession?.clearQualityAnchor?.();
    state.selectedQcIssueId = '';
    refreshRightPanel();
    flash('未能在文书中唯一定位这条提醒；为避免跳错位置，请人工检查字段。');
    return;
  }
  bindQcEvents(layer);
}

function normalizedQcFieldName(value) {
  return String(value || '').replace(/[\s:：()（）]/g, '').toLowerCase();
}

function isDirectIdentityField(name) {
  return /(姓名|患者名|住院号|病案号|就诊号|身份证|联系电话|手机号|电话号码|现住址|家庭住址|出生地|床位号|医院名称|机构名称|医生签名|医师签名|护士签名)/.test(normalizedQcFieldName(name));
}

function aiFieldValue(value) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(aiFieldValue).filter(Boolean).join('；');
  if (typeof value === 'object') return String(value.value ?? value.keyValue ?? value.text ?? value.code ?? '');
  return String(value).trim();
}

function snapshotAiFields(template) {
  const snapshot = loadDocumentSnapshot(template, episode)?.snapshot;
  const fields = asArray(snapshot?.data).map((item) => ({
    fieldId: String(item.keyCode || item.fieldId || ''),
    code: String(item.keyCode || item.code || ''),
    name: String(item.keyName || item.name || item.keyCode || '结构化数据元'),
    text: aiFieldValue(item.keyValue ?? item.text),
    documentId: template.id,
    documentTitle: template.name,
  })).filter((field) => field.fieldId && field.code && field.text && !isDirectIdentityField(field.name));
  if (fields.length || !String(snapshot?.text || '').trim()) return fields;
  return [{ fieldId: `${template.id}:document-text`, code: 'DOCUMENT.TEXT', name: '文书正文', text: String(snapshot.text).trim().slice(0, 12_000), documentId: template.id, documentTitle: template.name }];
}

function collectAiQcFields(scopes, templateId, editorSession) {
  const current = DOCUMENT_TEMPLATES.find((template) => template.id === templateId) || currentTemplate();
  const fields = [];
  const add = (items) => fields.push(...items);
  const liveFields = (template) => asArray(editorSession?.getStructuredFields?.()).map((field) => ({
    fieldId: field.fieldId, code: field.code, name: field.name, text: String(field.text || '').trim(), documentId: template.id, documentTitle: template.name,
  })).filter((field) => field.name && field.code && field.fieldId && field.text && !isDirectIdentityField(field.name));
  if (scopes.currentDocument) add(liveFields(current));
  if (scopes.relatedDocuments) {
    DOCUMENT_TEMPLATES.filter((template) => template.id !== current.id).forEach((template) => add(snapshotAiFields(template)));
  }
  if (scopes.frontpageFields) {
    const frontpage = DOCUMENT_TEMPLATES.find((template) => template.id === 'frontpage');
    if (frontpage) add(frontpage.id === current.id ? liveFields(frontpage) : snapshotAiFields(frontpage));
  }
  const unique = new Map();
  fields.forEach((field) => unique.set(`${field.documentId}:${field.fieldId}`, field));
  return [...unique.values()];
}

async function runAiQc(focusIssueId = '') {
  if (state.aiQcBusy) return;
  if (!state.editorSession?.getStructuredFields) {
    flash('结构化病历编辑器尚未准备完成。');
    return;
  }
  const model = currentAiModel();
  if (!model) {
    state.aiQcError = '当前没有可用模型。请打开“模型设置”添加并保存模型。';
    state.rightTab = 'ai';
    refreshRightPanel();
    return;
  }
  if (!model.enabled) {
    state.aiQcError = '当前模型已停用。请在“模型设置”中启用后再运行。';
    state.rightTab = 'ai';
    refreshRightPanel();
    return;
  }
  if (!model.apiKeyConfigured && model.protocol !== 'ollama') {
    state.aiQcError = '当前模型尚未配置 API Key。请在“模型设置”中完成配置。';
    state.rightTab = 'ai';
    refreshRightPanel();
    return;
  }
  const scopes = { ...state.aiQcScopes };
  if (!Object.values(scopes).some(Boolean)) {
    state.aiQcError = '请至少选择一个质控范围。';
    state.rightTab = 'ai';
    refreshRightPanel();
    return;
  }
  const originalIssue = focusIssueId ? qcIssues().find((item) => item.id === focusIssueId) : null;
  const editorSession = state.editorSession;
  const patientKey = state.selectedPatientKey;
  const templateId = currentTemplate().id;
  const fields = collectAiQcFields(scopes, templateId, editorSession);
  if (!fields.length) {
    state.aiQcError = '所选范围内没有可提交的已保存/当前临床字段内容。';
    state.rightTab = 'ai';
    closeQcPopover();
    refreshRightPanel();
    return;
  }
  if (fields.length > 200) {
    state.aiQcError = `当前选择聚合出 ${fields.length} 个字段，超过单次质控上限 200 个；请缩小质控范围。`;
    state.rightTab = 'ai';
    refreshRightPanel();
    return;
  }
  const fieldsSignature = JSON.stringify(fields);
  const principal = episode.diagnoses?.principal || {};
  const activeModelId = model.id;
  state.aiQcBusy = true;
  state.aiQcHasRun = false;
  state.aiQcError = '';
  state.rightTab = 'ai';
  closeQcPopover();
  refreshRightPanel();
  mountQcUi();
  try {
    const payload = await runQualityControl({
      modelConfigId: activeModelId,
      episodeId: episodeId(),
      documentId: templateId,
      documentTitle: currentTemplate().name,
      principalDiagnosis: { name: first(principal.name, '未填写'), code: first(principal.code, '未编码') },
      scopes,
      fields,
    });
    if (state.selectedPatientKey !== patientKey || currentTemplate().id !== templateId || state.editorSession !== editorSession) return;
    const latestFields = collectAiQcFields(scopes, templateId, editorSession);
    if (JSON.stringify(latestFields) !== fieldsSignature || state.activeAiModelId !== activeModelId || JSON.stringify(state.aiQcScopes) !== JSON.stringify(scopes)) {
      throw new Error('文书或质控范围在分析期间已发生变化，本次结果未显示。请保存或完成修改后重新质控。');
    }
    state.aiQcFindings = asArray(payload.findings).map((finding, index) => ({
      ...finding,
      id: `AI-QC-${Date.now()}-${index}`,
      source: finding.documentId && finding.documentId !== templateId ? `AI质控建议 · ${finding.documentTitle || '关联住院文书'}` : 'AI质控建议',
      anchors: asArray(finding.anchors).filter((anchor) => !anchor.documentId || anchor.documentId === templateId).length
        ? asArray(finding.anchors).filter((anchor) => !anchor.documentId || anchor.documentId === templateId) : (finding.documentId === templateId && (finding.fieldCode || finding.fieldId) ? [{
        fieldName: fields.find((field) => field.code === finding.fieldCode && field.fieldId === finding.fieldId)?.name || '',
        fieldCode: finding.fieldCode,
        fieldId: finding.fieldId,
        anchorType: finding.anchorType,
        quote: finding.quote || '',
      }] : []),
    }));
    state.aiQcHasRun = true;
    state.aiQcError = '';
    state.aiQcBusy = false;
    refreshRightPanel();
    mountQcUi();
    if (focusIssueId) {
      const related = state.aiQcFindings.find((finding) => finding.anchors.some((anchor) => (
        (originalIssue?.fieldId && anchor.fieldId === originalIssue.fieldId)
        || (originalIssue?.fieldCode && anchor.fieldCode === originalIssue.fieldCode)
        || (originalIssue?.fieldName && anchor.fieldName === originalIssue.fieldName)
      )));
      if (related) await selectQcIssue(related.id);
      else state.aiQcError = '分析已完成，但没有生成可精确定位到该字段的建议；可在右侧查看其他结果。';
      refreshRightPanel();
    }
  } catch (error) {
    if (state.selectedPatientKey !== patientKey || currentTemplate().id !== templateId || state.editorSession !== editorSession) return;
    state.aiQcError = error instanceof Error ? error.message : 'AI 质控请求失败，请检查模型配置和本地服务后重试。';
  } finally {
    if (state.selectedPatientKey !== patientKey || currentTemplate().id !== templateId || state.editorSession !== editorSession) return;
    state.aiQcBusy = false;
    refreshRightPanel();
    mountQcUi();
  }
}

function updateWorkbenchWidth(width) {
  state.patientHistoryWidth = Math.max(36, Math.min(48, Math.round(width * 2) / 2));
  const workbench = document.querySelector('.workbench-detail');
  const handle = document.querySelector('[data-workbench-resize]');
  workbench?.style.setProperty('--app-workbench-right', `${state.patientHistoryWidth}rem`);
  if (handle) handle.setAttribute('aria-valuenow', String(state.patientHistoryWidth));
}

function bindWorkbenchResize(root = document) {
  root.querySelectorAll('[data-workbench-resize]').forEach((handle) => {
    if (handle.dataset.resizeBound === 'true') return;
    handle.dataset.resizeBound = 'true';
    let startX = 0;
    let startWidth = 0;
    const remSize = () => Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      startX = event.clientX;
      startWidth = state.patientHistoryWidth;
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    handle.addEventListener('pointermove', (event) => {
      if (!handle.hasPointerCapture?.(event.pointerId)) return;
      updateWorkbenchWidth(startWidth + (startX - event.clientX) / remSize());
    });
    handle.addEventListener('pointerup', (event) => {
      if (handle.hasPointerCapture?.(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    });
    handle.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      updateWorkbenchWidth(state.patientHistoryWidth + (event.key === 'ArrowLeft' ? 1 : -1));
    });
  });
}

function bindQcEvents(root = document) {
  root.querySelectorAll('[data-qc-action]').forEach((el) => {
    if (el.dataset.qcBound === 'true') return;
    el.dataset.qcBound = 'true';
    el.addEventListener('click', () => {
      const { qcAction: action, qcId: id } = el.dataset;
      if (action === 'open-qc-panel') { state.rightTab = 'qc'; refreshRightPanel(); return; }
      if (action === 'close-qc-popover') { closeQcPopover(); return; }
      if (action === 'ignore-all') {
        qcIssues().forEach((item) => state.qcIgnored.add(item.id));
        closeQcPopover();
        refreshRightPanel();
        mountQcUi();
        return;
      }
      if ((action === 'ignore-issue' || action === 'ignore-inline' || action === 'ignore') && id) {
        state.qcIgnored.add(id);
        closeQcPopover();
        refreshRightPanel();
        mountQcUi();
        return;
      }
      if (action === 'locate-issue' && id) { void selectQcIssue(id); return; }
      if (action === 'ai-suggest' && id) { void runAiQc(id); return; }
      if (action === 'run-ai-qc') { void runAiQc(); return; }
      if (action === 'assess') flash('已进入 DME 评估入口：当前演示评分为低危 2 分。');
    });
  });
  root.querySelectorAll('[data-qc-select]').forEach((el) => {
    if (el.dataset.qcSelectBound === 'true') return;
    el.dataset.qcSelectBound = 'true';
    el.addEventListener('click', () => void selectQcIssue(el.dataset.qcSelect));
  });
}

function bindAiAssistantEvents(root = document) {
  root.querySelectorAll('[data-ai-model-switch]').forEach((el) => el.addEventListener('click', () => {
    state.aiModelPickerOpen = !state.aiModelPickerOpen;
    refreshRightPanel();
  }));
  root.querySelectorAll('[data-ai-model-settings]').forEach((el) => el.addEventListener('click', () => {
    openAiModelConfigDialog({
      models: state.aiModels,
      onSaved: (models, savedId) => {
        state.aiModels = models;
        state.activeAiModelId = models.find((item) => item.id === savedId)?.id
          || models.find((item) => item.isDefault)?.id
          || models[0]?.id
          || '';
        state.aiModelPickerOpen = false;
        state.aiQcError = '';
        refreshRightPanel();
        flash('模型配置已保存');
      },
    });
  }));
  root.querySelectorAll('[data-ai-model-activate]').forEach((el) => el.addEventListener('click', () => {
    state.activeAiModelId = el.dataset.aiModelActivate;
    state.aiModelPickerOpen = false;
    state.aiQcError = '';
    refreshRightPanel();
  }));
  root.querySelectorAll('[data-ai-scope]').forEach((el) => el.addEventListener('change', () => {
    state.aiQcScopes[el.dataset.aiScope] = el.checked;
    const runButton = root.querySelector('[data-ai-qc-run]');
    if (runButton) runButton.disabled = state.aiQcBusy || !Object.values(state.aiQcScopes).some(Boolean);
  }));
  root.querySelectorAll('[data-ai-qc-run]').forEach((el) => el.addEventListener('click', () => void runAiQc()));
}

function bindEvents() {
  document.querySelectorAll('[data-patient-key]').forEach((el) => el.addEventListener('click', () => selectPatient(el.dataset.patientKey)));
  document.querySelectorAll('[data-view]').forEach((el)=>el.addEventListener('click',()=>{ state.view = el.dataset.view; render(); }));
  document.querySelectorAll('[data-template-id]').forEach((el)=>el.addEventListener('click',()=>{ void openDocumentTab(el.dataset.templateId); }));
  document.querySelectorAll('[data-document-tab]').forEach((el)=>el.addEventListener('click',()=>{ void openDocumentTab(el.dataset.documentTab); }));
  document.querySelectorAll('[data-close-document-tab]').forEach((el)=>el.addEventListener('click',()=>{ void closeDocumentTab(el.dataset.closeDocumentTab); }));
  bindRightPanelEvents();
  document.querySelectorAll('[data-risk-id]').forEach((el)=>el.addEventListener('click',()=>{ if (el.dataset.action === 'select-risk') { state.selectedRiskId=el.dataset.riskId; render(); } }));
  bindQcEvents();
  document.querySelectorAll('[data-action]').forEach((el)=>el.addEventListener('click',()=>handleAction(el.dataset.action,el)));
}

function handleAction(action, el) {
  if (action === 'toggle-patient-selector') { state.patientSelectorOpen = !state.patientSelectorOpen; render(); return; }
  if (action === 'go-documents') { state.view='documents'; render(); return; }
  if (action === 'reload-editor') { void mountCurrentEditor(); return; }
  if (action === 'save-document') { void saveCurrentDocument('draft'); return; }
  if (action === 'confirm-document') { void saveCurrentDocument('confirmed'); return; }
  if (action === 'rebuild-settlement') {
    state.settlementOverrides ||= loadSettlementOverrides();
    state.settlement = buildSettlementList(episode, { sourceDocuments: settlementSourceDocuments(), overrides: state.settlementOverrides });
    state.settlementIssues = asArray(validateSettlementList(state.settlement));
    render();
    flash('已重新映射来源文书，并保留手动修改');
    return;
  }
  if (action === 'validate-settlement') { ensureSettlement(); refreshRightPanel(); flash('结算清单已重新运行确定性质控'); return; }
  if (action === 'print-settlement') { window.print(); return; }
  if (action === 'refresh-grouping' || action === 'run-audit') { flash('已按当前 Episode 重新计算输入状态'); return; }
  if (action === 'select-risk') { state.selectedRiskId = el.dataset.riskId; render(); return; }
  if (action === 'review-risk') { state.reviewLog.set(el.dataset.riskId,{action:'reviewed',at:new Date().toISOString()}); flash('已记录人工复核动作'); return; }
}

function selectPatient(key) {
  const next = patientWorklist.find((item) => item.key === key);
  if (!next) return;
  if (next.key === state.selectedPatientKey) {
    state.patientSelectorOpen = false;
    render();
    return;
  }
  state.editorMountToken += 1;
  state.editorSession?.destroy?.();
  state.editorSession = null;
  episode = next.episode;
  state.selectedPatientKey = next.key;
  state.templateId = 'admission';
  state.openDocumentTabs = ['admission'];
  state.documentQcState = {};
  state.patientSelectorOpen = false;
  state.qcIgnored.clear();
  state.qcShowAll = false;
  state.passiveQcIssues = [];
  state.aiQcFindings = [];
  state.aiQcHasRun = false;
  state.aiQcBusy = false;
  state.aiQcError = '';
  state.selectedQcIssueId = '';
  state.rightTab = 'qc';
  state.settlement = null;
  state.settlementIssues = [];
  state.settlementOverrides = null;
  state.settlementTab = 'settlement-overview';
  state.snapshot = null;
  state.response = null;
  state.reconciliation = null;
  state.selectedRiskId = null;
  state.reviewLog = new Map();
  state.toast = null;
  render();
}

function flash(message) {
  state.toast = message;
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  setTimeout(() => {
    if (state.toast === message) {
      state.toast = null;
      document.querySelector('.toast')?.remove();
    }
  }, 1600);
}

render();
