import * as Hm from "./domain/hmeditor.js";
import * as Templates from "./data/templates.js";
import { createEpisodeFixture } from "./data/episode.js";
import * as Settlement from "./domain/settlement.js";

const NAV_ITEMS = [
  { id: "overview", icon: "▦", label: "Episode 总览" },
  { id: "documents", icon: "▤", label: "病历书写" },
  { id: "frontpage", icon: "▥", label: "病案首页" },
  { id: "settlement", icon: "￥", label: "医保结算清单" },
  { id: "grouping", icon: "◇", label: "DRG / DIP 3.0" },
  { id: "audit", icon: "✓", label: "智能审核" }
];

const TEMPLATE_GROUPS = [
  { label: "病案首页", matcher: function (t) { return /病案首页/.test(templateName(t)); } },
  { label: "入院与病程", matcher: function (t) { return /入院|病程|查房/.test(templateName(t)); } },
  { label: "手术", matcher: function (t) { return /手术|术前/.test(templateName(t)); } },
  { label: "出院", matcher: function (t) { return /出院/.test(templateName(t)); } }
];

const excludedNames = ["会诊", "接班", "阶段小结", "一般护理记录单", "死亡记录", "死亡病例讨论"];
const episode = createEpisodeFixture();
const hmAdapter = Hm.createHmEditorAdapter();
const state = {
  view: "overview",
  templateId: null,
  draft: null,
  settlement: null,
  settlementIssues: [],
  snapshot: null,
  response: null,
  reconciliation: null,
  toast: null
};

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === "object") return Object.values(value);
  return [];
}

function first() {
  for (var i = 0; i < arguments.length; i += 1) {
    if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== "") return arguments[i];
  }
  return "";
}

function text(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function escapeHtml(value) {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getTemplates() {
  var source = Templates.HMEDITOR_TEMPLATES || Templates.templates || [];
  return Array.isArray(source) ? source : Object.values(source);
}

function enabledTemplates() {
  return getTemplates().filter(function (item) {
    var name = templateName(item);
    return item.enabled !== false && !excludedNames.some(function (excluded) { return name.indexOf(excluded) >= 0; });
  });
}

function templateId(template) {
  return first(template.id, template.templateId, template.keyCode, template.key, template.code);
}

function templateName(template) {
  return first(template.templateName, template.name, template.title, template.label, template.id);
}

function templateById(id) {
  return enabledTemplates().find(function (item) { return templateId(item) === id; }) || enabledTemplates()[0];
}

function patientInfo() {
  return episode.patient || episode.patientInfo || episode.demographics || {};
}

function diagnosisList() {
  var raw = first(episode.diagnosisList, episode.medicalRecord && episode.medicalRecord.diagnoses, episode.diagnoses);
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    return [raw.primary].filter(Boolean).concat(asArray(raw.secondary));
  }
  return [];
}

function procedureList() {
  return asArray(first(episode.procedures, episode.operations, episode.procedureList));
}

function chargeList() {
  return asArray(first(episode.charges, episode.fees, episode.chargeItems, episode.costs && episode.costs.items));
}

function episodeValue() {
  var paths = Array.prototype.slice.call(arguments);
  for (var i = 0; i < paths.length; i += 1) {
    var current = episode;
    var segments = String(paths[i]).split(".");
    for (var j = 0; j < segments.length && current != null; j += 1) current = current[segments[j]];
    if (current !== undefined && current !== null && current !== "") return current;
  }
  return "";
}

function episodeTitle() {
  return first(patientInfo().name, patientInfo().displayName, patientInfo().maskedName, "合成病例 A-001");
}

function diagnosisText(item) {
  return first(item.name, item.diagnosisName, item.description, item.code, "未命名诊断");
}

function totalAmount() {
  return chargeList().reduce(function (sum, item) {
    var amount = Number(first(item.amount, item.total, item.subtotal, 0));
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

function dateTime() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function renderEpisodeSummary() {
  var patient = patientInfo();
  var admitted = first(episode.admitDate, episode.admitDatetime, episode.admission && episode.admission.admittedAt, episode.admission && episode.admission.date, "2026-09-08");
  var department = first(episode.department, episode.admission && episode.admission.department, "普外科");
  var status = state.reconciliation && state.reconciliation.balanced ? "已对账" : "待医保反馈";
  document.querySelector("#episode-summary").innerHTML =
    '<div class="patient-name">' + escapeHtml(episodeTitle()) + '</div>' +
    '<div class="patient-meta">住院号 ' + escapeHtml(first(episode.inpatientNo, episode.inpatientId, episode.episodeId, "ZY-20260908-001")) + '<br>' +
    escapeHtml(department) + " · " + escapeHtml(first(patient.sex, "")) + " · " + escapeHtml(first(patient.age, "")) + "岁 · 入院 " + escapeHtml(admitted) + "</div>" +
    '<div class="status-row"><span>当前阶段</span><span class="status ' + (status === "已对账" ? "green" : "amber") + '">' + status + "</span></div>";
}

function renderNav() {
  document.querySelector("#nav").innerHTML = NAV_ITEMS.map(function (item) {
    return '<button class="nav-item ' + (state.view === item.id ? "active" : "") + '" data-view="' + item.id + '">' +
      '<span class="nav-icon">' + item.icon + "</span>" + item.label + "</button>";
  }).join("");
}

function renderPageHeading(title, desc, actions) {
  return '<div class="page-heading"><div><h1 class="page-title">' + escapeHtml(title) +
    '</h1><p class="page-desc">' + escapeHtml(desc) + '</p></div><div class="toolbar">' + (actions || "") + "</div></div>";
}

function renderOverview() {
  var diagnoses = diagnosisList();
  var procedures = procedureList();
  var charges = chargeList();
  var issueCount = state.settlementIssues.length;
  return renderPageHeading("住院 Episode 总览", "从入院、病历生成到医保结算与分组审核的可回放闭环。",
    '<button class="btn primary" data-action="generate-all">生成本次住院文书</button>') +
    '<div class="grid-3">' +
      '<div class="metric"><div class="metric-label">临床文书</div><div class="metric-value">' + enabledTemplates().length + '</div><div class="metric-note">惠每模板适配，医生确认后生效</div></div>' +
      '<div class="metric"><div class="metric-label">诊断 / 手术</div><div class="metric-value">' + diagnoses.length + " / " + procedures.length + '</div><div class="metric-note">ICD 编码待质控确认</div></div>' +
      '<div class="metric"><div class="metric-label">住院费用</div><div class="metric-value">¥' + totalAmount().toFixed(2) + '</div><div class="metric-note">' + charges.length + ' 条收费明细</div></div>' +
    "</div>" +
    '<div class="grid-2" style="margin-top:16px">' +
      '<div class="card"><div class="section-heading"><h2>业务状态</h2><span class="tag blue">单患者 Episode</span></div>' +
        '<div class="timeline">' +
          timelineRow("入院登记", first(episode.admitDate, episode.admitDatetime, "2026-09-08"), "已完成") +
          timelineRow("病历书写与质控", "入院 / 首次病程 / 日常病程 / 手术 / 出院", "进行中") +
          timelineRow("病案首页与结算清单", "HmEditor 首页 + 193 项参考字段（当前子集）", state.settlement ? "已生成" : "待生成") +
          timelineRow("DRG / DIP 3.0", "国家方案输入检查", "正式规则包待导入") +
        "</div>" +
      "</div>" +
      '<div class="card"><div class="section-heading"><h2>本轮验收口径</h2><span class="tag green">Lean MVP</span></div>' +
        '<div class="kv"><label>病案首页</label><span>HmEditor 模板适配</span></div>' +
        '<div class="kv"><label>结算清单</label><span>PDF 193 项参考 / 当前子集</span></div>' +
        '<div class="kv"><label>支付方式</label><span>国家 DRG / DIP 3.0</span></div>' +
        '<div class="kv"><label>真实接口</label><span class="muted">当前为可回放 mock</span></div>' +
        '<div class="kv"><label>质控问题</label><span class="' + (issueCount ? "tag amber" : "tag green") + '">' + issueCount + " 条待处理</span></div>" +
      "</div>" +
    "</div>" +
    '<div class="card"><div class="section-heading"><h2>关键闭环</h2><span class="muted small">点击左侧模块进入操作</span></div>' +
      '<div class="grid-3">' +
        actionCard("病历书写", "按惠每模板生成草稿并查看证据", "documents") +
        actionCard("医保结算", "生成清单、质控、模拟提交和对账", "settlement") +
        actionCard("智能审核", "把缺失证据、编码和金额问题串成证据链", "audit") +
      "</div>" +
    "</div>";
}

function timelineRow(title, time, status) {
  return '<div class="timeline-row"><div class="timeline-mark"><span class="timeline-dot"></span></div><div class="timeline-content"><div class="timeline-title">' +
    title + '<span class="tag ' + (status === "已完成" || status === "已生成" ? "green" : "amber") + '" style="float:right">' + status +
    '</span></div><div class="timeline-time">' + escapeHtml(time) + "</div></div></div>";
}

function actionCard(title, desc, view) {
  return '<button class="card" data-view="' + view + '" style="text-align:left;border:1px solid var(--line)"><div class="section-heading"><h2>' +
    title + '</h2><span class="tag blue">进入</span></div><div class="muted small">' + desc + "</div></button>";
}

function renderDocuments() {
  var templates = enabledTemplates();
  if (!state.templateId || !templates.some(function (item) { return templateId(item) === state.templateId; })) {
    state.templateId = templateId(templates[0]);
  }
  var active = templateById(state.templateId);
  if (!state.draft || state.draft.templateId !== state.templateId) {
    state.draft = Hm.generateDocumentDraft(state.templateId, episode);
  }
  var groups = TEMPLATE_GROUPS.map(function (group) {
    var items = templates.filter(group.matcher);
    if (!items.length) return "";
    return '<div class="template-group">' + group.label + "</div>" + items.map(function (item) {
      var id = templateId(item);
      return '<button class="template-item ' + (id === state.templateId ? "active" : "") + '" data-template="' + escapeHtml(id) + '">' +
        escapeHtml(templateName(item)) + "</button>";
    }).join("");
  }).join("");
  return renderPageHeading("病历书写", "惠每模板范围已收敛；AI 生成的是可追溯草稿，医生确认后才进入正式病历。",
    '<button class="btn" data-action="open-hm">打开 HmEditor 适配层</button><button class="btn primary" data-action="generate-all">重新生成草稿</button>') +
    '<div class="template-layout"><div class="template-list">' + groups +
      '<div class="notice" style="margin:14px 4px 4px">已排除：会诊、接班、阶段小结、一般护理记录单、死亡记录、死亡病例讨论。</div>' +
    '</div><div>' + renderDocumentPaper(active, state.draft) + "</div></div>";
}

function renderDocumentPaper(template, draft) {
  var name = templateName(template);
  var sections = asArray(first(draft && draft.sections, draft && draft.contentSections));
  var content = first(draft && draft.content, draft && draft.text, draft && draft.body, "");
  var fields = draft && (draft.fields || draft.data || draft.values);
  var sectionHtml = sections.map(function (section) {
    var title = first(section.title, section.name, "记录");
    var body = first(section.text, section.content, section.value, section.body, "");
    return '<div class="paper-section"><h3>' + escapeHtml(title) + '</h3><p class="paper-text">' + escapeHtml(body) + "</p></div>";
  }).join("");
  if (!sectionHtml && fields && typeof fields === "object") {
    sectionHtml = Object.entries(fields).map(function (entry) {
      return '<div class="paper-section"><h3>' + escapeHtml(entry[0]) + '</h3><p class="paper-text">' + escapeHtml(entry[1]) + "</p></div>";
    }).join("");
  }
  if (!sectionHtml && content) sectionHtml = '<div class="paper-section"><p class="paper-text">' + escapeHtml(content) + "</p></div>";
  if (!sectionHtml) sectionHtml = '<div class="empty">当前模板没有可展示的草稿正文，请先补齐必需事实。</div>';
  var qcResult = draft && draft.qc && Array.isArray(draft.qc.issues)
    ? draft.qc
    : (Hm.runDocumentQc ? Hm.runDocumentQc({ template: template, episode: episode, draft: draft, documentData: draft && draft.data }) : null);
  var issues = asArray(qcResult && qcResult.issues);
  return '<div class="document-paper">' +
    '<div class="paper-title">' + escapeHtml(name) + '</div>' +
    '<div class="paper-meta"><span>病例：' + escapeHtml(episodeTitle()) + '</span><span>来源：' + escapeHtml(first(template.source, "HmEditor")) + '</span><span>状态：<span class="tag amber">草稿待确认</span></span></div>' +
    sectionHtml +
    '<div class="paper-footer"><span>证据引用 ' + asArray(draft && (draft.evidenceRefs || draft.evidence)).length + " 条</span><span>需要医生签名确认：是</span></div>" +
    (issues.length ? '<div class="notice" style="margin-top:16px">文书质控提示：' + issues.map(function (issue) { return escapeHtml(first(issue.message, issue.title, issue.code)); }).join("；") + "</div>" : '<div class="success-box" style="margin-top:16px">当前文书草稿的结构化质控未发现阻断项。</div>') +
    "</div>";
}

function renderFrontpage() {
  var home = enabledTemplates().find(function (item) { return /病案首页/.test(templateName(item)); }) || enabledTemplates()[0];
  var draft = Hm.generateDocumentDraft(templateId(home), episode);
  var data = draft && (draft.fields || draft.data || draft.values || {});
  return renderPageHeading("住院病案首页", "病案首页直接走惠每模板适配；本页不把 PDF 旧版版式冒充电子病历编辑器。",
    '<button class="btn primary" data-action="open-hm">用 HmEditor 打开</button>') +
    '<div class="card"><div class="section-heading"><h2>模板来源与映射状态</h2><span class="tag green">HmEditor 模板</span></div>' +
      '<div class="grid-3"><div class="metric"><div class="metric-label">模板</div><div class="metric-value" style="font-size:15px">住院病案首页</div><div class="metric-note">稳定 keyCode：' + escapeHtml(first(home.keyCode, home.id, "hm-inpatient-front-page")) + "</div></div>" +
      '<div class="metric"><div class="metric-label">病历事实</div><div class="metric-value">' + Object.keys(data || {}).length + '</div><div class="metric-note">来自 Episode 与已确认文书</div></div>' +
      '<div class="metric"><div class="metric-label">适配模式</div><div class="metric-value" style="font-size:15px">' + escapeHtml(first(draft && draft.editor && draft.editor.mode, "compat-mock")) + '</div><div class="metric-note">接入真实 SDK 后替换适配实现</div></div></div>' +
    "</div>" +
    '<div class="notice">病案首页字段直接按惠每模板注册；当前运行环境使用 compat-mock 适配层，未把惠每商业/SDK 文件冒充已内置。</div>' +
    '<div class="card"><div class="section-heading"><h2>首页结构化内容</h2><span class="muted small">HmEditor adapter.getDocData()</span></div>' +
      renderObjectFields(data, "暂无首页结构化字段") +
    "</div>";
}

function renderObjectFields(data, emptyText) {
  if (!data || typeof data !== "object" || !Object.keys(data).length) return '<div class="empty">' + emptyText + "</div>";
  return '<div class="field-grid">' + Object.entries(data).map(function (entry) {
    return '<div class="field-row"><label>' + escapeHtml(entry[0]) + '</label><span>' + escapeHtml(entry[1]) + "</span></div>";
  }).join("") + "</div>";
}

function getSettlementGroups(list) {
  var raw = first(list && list.groups, list && list.sections, list && list.fieldGroups, {});
  if (Array.isArray(raw)) return raw.map(function (group) { return { title: first(group.title, group.name, "字段组"), fields: group.fields || group.items || [] }; });
  return Object.entries(raw || {}).map(function (entry) {
    var fields = entry[1];
    if (!Array.isArray(fields)) fields = Object.entries(fields || {}).map(function (field) { return { field: field[0], label: field[0], value: field[1] }; });
    return { title: entry[0], fields: fields };
  });
}

function renderSettlement() {
  if (!state.settlement) {
    state.settlement = Settlement.buildSettlementList(episode);
    state.settlementIssues = asArray(Settlement.validateSettlementList(state.settlement));
  }
  var list = state.settlement;
  var groups = getSettlementGroups(list);
  var mappedFieldCount = groups.reduce(function (sum, group) { return sum + (group.fields || []).length; }, 0);
  var declaredFieldCount = first(list.field_mapping && list.field_mapping.declared_item_count, 193);
  var total = first(list.totalAmount, list.amounts && list.amounts.total, totalAmount());
  var issueCount = state.settlementIssues.length;
  var submitStatus = state.reconciliation ? (state.reconciliation.balanced ? "已对账" : "有差异") : "未提交";
  return renderPageHeading("医保结算清单", "按 PDF 193 项样式的语义分组展示；字段映射可追溯，当前提交为本地 mock。",
    '<button class="btn" data-action="rebuild-settlement">重新生成</button><button class="btn primary" data-action="submit-settlement">模拟提交结算</button>') +
    '<div class="grid-3">' +
      '<div class="metric"><div class="metric-label">清单状态</div><div class="metric-value" style="font-size:15px">' + submitStatus + '</div><div class="metric-note">I-ONE：snapshot → batch → response → reconciliation</div></div>' +
      '<div class="metric"><div class="metric-label">住院总费用</div><div class="metric-value">¥' + Number(total || 0).toFixed(2) + '</div><div class="metric-note">由费用明细确定性合计</div></div>' +
      '<div class="metric"><div class="metric-label">清单质控</div><div class="metric-value" style="font-size:15px">' + (issueCount ? issueCount + " 条问题" : "通过") + '</div><div class="metric-note">缺失字段与金额勾稽</div></div>' +
    "</div>" +
    (issueCount ? '<div class="card"><div class="section-heading"><h2>清单质控问题</h2><span class="tag amber">需处理</span></div><div class="qc-list">' + state.settlementIssues.map(renderIssue).join("") + "</div></div>" : '<div class="success-box" style="margin:16px 0">结算清单必填项、时间顺序和金额勾稽通过，可以生成申报快照。</div>') +
    '<div class="card"><div class="section-heading"><h2>结算清单字段映射（' + mappedFieldCount + " / " + declaredFieldCount + '）</h2><span class="muted small">当前为可运行语义子集，官方字段号待核验</span></div>' +
      groups.map(renderSettlementGroup).join("") +
    "</div>" +
    renderSettlementFooter();
}

function renderSettlementGroup(group) {
  var fields = group.fields || [];
  return '<div class="field-group"><div class="field-group-title"><span>' + escapeHtml(group.title) + '</span><span class="muted small">' + fields.length + " 项</span></div>" +
    '<div class="field-grid">' + fields.map(function (field) {
      var label = first(field.label, field.name, field.field, field.key, "");
      var value = first(field.value, field.displayValue, field.text, "");
      var source = first(field.source, field.evidenceRef, "");
      return '<div class="field-row"><label>' + escapeHtml(label) + '</label><span>' + escapeHtml(value) + (source ? '<em class="muted small" style="display:block">' + escapeHtml(source) + "</em>" : "") + "</span></div>";
    }).join("") + "</div></div>";
}

function renderSettlementFooter() {
  if (!state.snapshot) return "";
  var response = state.response || {};
  var reconciliation = state.reconciliation || {};
  return '<div class="card"><div class="section-heading"><h2>可回放结算记录</h2><span class="tag ' + (reconciliation.balanced ? "green" : "amber") + '">' + (reconciliation.balanced ? "对账平衡" : "等待反馈") + "</span></div>" +
    '<div class="kv"><label>申报快照</label><span class="mono">' + escapeHtml(first(state.snapshot.snapshotId, state.snapshot.id, "SNAPSHOT")) + "</span></div>" +
    '<div class="kv"><label>批次 / 幂等键</label><span class="mono">' + escapeHtml(first(response.batchNo, state.snapshot.idempotencyKey, "未生成")) + "</span></div>" +
    '<div class="kv"><label>医保反馈</label><span>' + escapeHtml(first(response.responseCode, response.status, "未返回")) + "</span></div>" +
    '<div class="kv"><label>差异金额</label><span>¥' + Number(first(reconciliation.differenceAmount, reconciliation.difference, 0)).toFixed(2) + "</span></div>" +
    "</div>";
}

function renderGrouping() {
  var hasIssue = state.settlementIssues.length > 0;
  var dx = diagnosisList();
  var procedures = procedureList();
  var principal = dx.find(function (item) { return item.isPrimary || item.type === "principal" || item.primary; }) || dx[0];
  var ruleReady = false;
  return renderPageHeading("DRG / DIP 3.0", "先锁定国家版本；本 MVP 展示输入完整性和接口边界，不把旧版规则结果冒充 3.0 正式分组。",
    '<button class="btn" data-action="refresh-grouping">检查分组输入</button>') +
    '<div class="notice">国家医保局已发布 3.0 方案。当前项目只绑定国家 3.0 元数据；正式可执行规则包尚未放入本地，因此下面的“待导入”是诚实状态，不使用 OpenDRG 旧版结果冒充国家 3.0。</div>' +
    '<div class="grid-2" style="margin-top:16px">' +
      groupingCard("国家 DRG 3.0", "CHS-DRG-3.0", ruleReady ? "可执行" : "待导入规则包", "主诊断 " + dx.length + " 项 · 手术 " + procedures.length + " 项") +
      groupingCard("国家 DIP 3.0", "CHS-DIP-3.0", ruleReady ? "可执行" : "待导入规则包", "病例事实与费用可供预分组接口使用") +
    "</div>" +
    '<div class="card"><div class="section-heading"><h2>当前分组输入</h2><span class="tag ' + (hasIssue ? "amber" : "green") + '">' + (hasIssue ? "先修正质控" : "输入完整性通过") + "</span></div>" +
      '<div class="grid-2"><div>' +
        '<div class="kv"><label>主诊断</label><span>' + escapeHtml(principal ? diagnosisText(principal) : "待确认") + "</span></div>" +
        '<div class="kv"><label>其他诊断</label><span>' + Math.max(0, dx.length - 1) + " 项</span></div>" +
        '<div class="kv"><label>手术操作</label><span>' + procedures.length + " 项</span></div>" +
      '</div><div>' +
        '<div class="kv"><label>清单质控</label><span>' + (hasIssue ? "阻断" : "通过") + "</span></div>" +
        '<div class="kv"><label>规则版本</label><span>国家 3.0</span></div>' +
        '<div class="kv"><label>正式支付结果</label><span>需接入统筹区参数后计算</span></div>' +
      "</div></div>" +
    "</div>" +
    '<div class="card"><div class="section-heading"><h2>执行边界</h2><span class="muted small">确定性服务优先</span></div>' +
      '<div class="grid-3">' +
        '<div class="metric"><div class="metric-label">可由 MVP 执行</div><div class="metric-value" style="font-size:15px">输入校验</div><div class="metric-note">诊断、手术、费用、清单一致性</div></div>' +
        '<div class="metric"><div class="metric-label">待接入</div><div class="metric-value" style="font-size:15px">国家规则包</div><div class="metric-note">分组路径、权重和分值</div></div>' +
        '<div class="metric"><div class="metric-label">不由 AI 决定</div><div class="metric-value" style="font-size:15px">支付金额</div><div class="metric-note">AI 只解释证据与缺失项</div></div>' +
      "</div>" +
    "</div>";
}

function groupingCard(title, version, status, note) {
  return '<div class="card"><div class="section-heading"><h2>' + title + '</h2><span class="tag amber">' + status + "</span></div>" +
    '<div class="metric"><div class="metric-label">规则版本</div><div class="metric-value" style="font-size:18px">' + version + '</div><div class="metric-note">' + note + "</div></div></div>";
}

function renderAudit() {
  var docIssues = collectDocumentIssues();
  var risks = buildRisks(docIssues);
  return renderPageHeading("智能审核", "把文书质控、编码/清单校验、费用勾稽和人工复核组织成证据链。",
    '<button class="btn primary" data-action="run-audit">重新运行审核</button>') +
    '<div class="grid-3">' +
      '<div class="metric"><div class="metric-label">审核状态</div><div class="metric-value" style="font-size:15px">' + (risks.length ? "待人工复核" : "通过") + '</div><div class="metric-note">规则结果可解释、可回放</div></div>' +
      '<div class="metric"><div class="metric-label">风险线索</div><div class="metric-value">' + risks.length + '</div><div class="metric-note">不是“AI 判定骗保”</div></div>' +
      '<div class="metric"><div class="metric-label">证据引用</div><div class="metric-value">' + risks.reduce(function (sum, risk) { return sum + risk.evidence.length; }, 0) + '</div><div class="metric-note">病例 / 文书 / 费用 / 编码</div></div>' +
    "</div>" +
    '<div class="card"><div class="section-heading"><h2>风险线索中心</h2><span class="muted small">线索 → 证据 → 人工处置</span></div>' +
      (risks.length ? '<div class="risk-list">' + risks.map(renderRisk).join("") + "</div>" : '<div class="success-box">当前没有阻断性风险线索。仍需医生、编码员和医保办完成最终确认。</div>') +
    "</div>" +
    '<div class="card"><div class="section-heading"><h2>人工审核台</h2><span class="tag amber">当前 mock</span></div>' +
      '<div class="kv"><label>当前版本</label><span class="mono">' + (state.reconciliation ? "V2 / 已对账" : "V1 / 待确认") + "</span></div>" +
      '<div class="kv"><label>审核意见</label><span>' + (risks.length ? "请逐条核对证据并回写处理结果" : "可进入人工确认") + "</span></div>" +
      '<div class="toolbar" style="margin-top:14px"><button class="btn" data-action="generate-all">重新生成文书草稿</button><button class="btn success" data-action="close-audit">确认本轮审核</button></div>' +
    "</div>";
}

function collectDocumentIssues() {
  var issues = [];
  enabledTemplates().forEach(function (template) {
    var draft = Hm.generateDocumentDraft(templateId(template), episode);
    if (draft && draft.qc && Array.isArray(draft.qc.issues)) {
      issues = issues.concat(draft.qc.issues);
    } else if (Hm.runDocumentQc) {
      var result = Hm.runDocumentQc({ template: template, episode: episode, draft: draft, documentData: draft && draft.data });
      issues = issues.concat(asArray(result && result.issues));
    }
  });
  return issues;
}

function buildRisks(docIssues) {
  var risks = docIssues.map(function (issue, index) {
    return {
      level: first(issue.severity, "warning").toLowerCase() === "error" ? "高" : "中",
      title: first(issue.title, issue.code, "文书完整性提示"),
      body: first(issue.message, "需要补充结构化事实后重新生成文书。"),
      amount: "",
      evidence: asArray(first(issue.evidenceRefs, issue.evidence, ["文书质控规则"]))
    };
  });
  var charges = chargeList();
  var procedures = procedureList();
  var mismatch = charges.find(function (charge) {
    var name = String(first(charge.name, charge.chargeName, charge.itemName, ""));
    return /网篮|取石|耗材/.test(name) && Number(first(charge.quantity, 0)) > 1 && procedures.length;
  });
  if (mismatch) risks.push({
    level: "高",
    title: "收费明细与手术/耗材事实需核对",
    body: "费用明细中的耗材数量高于病历事实可直接支持的数量，先回到手术记录和执行记录核对。",
    amount: "¥" + Number(first(mismatch.amount, 0)).toFixed(2),
    evidence: ["手术记录", "费用明细", "结算清单 charge_summary"]
  });
  return risks;
}

function renderIssue(issue) {
  var severity = String(first(issue.severity, "warning")).toLowerCase();
  return '<div class="qc-item ' + (severity === "error" ? "error" : "warn") + '"><div class="qc-title">' +
    escapeHtml(first(issue.code, issue.title, "QC")) + '</div><div class="qc-message">' +
    escapeHtml(first(issue.message, issue.detail, "需要人工处理")) +
    (issue.field ? '<div class="muted small">字段：' + escapeHtml(issue.field) + "</div>" : "") + "</div></div>";
}

function renderRisk(risk) {
  return '<div class="risk-item ' + (risk.level === "高" ? "error" : "warn") + '"><div class="risk-head"><div class="risk-title"><span class="tag ' + (risk.level === "高" ? "red" : "amber") + '">' + risk.level + "级</span>" + escapeHtml(risk.title) +
    '</div><div class="risk-amount">' + escapeHtml(risk.amount || "") + '</div></div><div class="risk-body">' + escapeHtml(risk.body) +
    '</div><div class="evidence">证据：' + risk.evidence.map(escapeHtml).join(" · ") + "</div></div>";
}

function renderRightRail() {
  var issues = state.settlementIssues.length;
  var docIssues = state.view === "audit" ? collectDocumentIssues() : [];
  document.querySelector("#right-rail").innerHTML =
    '<div class="card"><div class="section-heading"><h2>AI 辅助</h2><span class="tag blue">解释型</span></div>' +
      '<div class="muted small" style="line-height:1.7">AI 只做病历草稿、事实抽取、缺失提示和证据解释；编码、分组、支付与最终审核由确定性规则或人工确认。</div>' +
      '<div class="success-box" style="margin-top:12px">语音入口已预留，本轮不进入业务逻辑。</div>' +
    "</div>" +
    '<div class="card"><div class="section-heading"><h2>本页质控</h2><span class="tag ' + (issues || docIssues.length ? "amber" : "green") + '">' + (issues + docIssues.length) + " 条</span></div>" +
      '<div class="progress"><i style="width:' + (issues + docIssues.length ? "58%" : "100%") + '"></i></div>' +
      '<div class="kv" style="margin-top:10px"><label>清单校验</label><span>' + (issues ? issues + " 条" : "通过") + "</span></div>" +
      '<div class="kv"><label>文书校验</label><span>' + (docIssues.length ? docIssues.length + " 条" : "待运行") + "</span></div>" +
    "</div>" +
    '<div class="card"><div class="section-heading"><h2>当前版本</h2><span class="tag amber">V1</span></div>' +
      '<div class="kv"><label>国家 DRG</label><span>3.0</span></div><div class="kv"><label>国家 DIP</label><span>3.0</span></div>' +
      '<div class="kv"><label>本地规则</label><span>未启用</span></div><div class="kv"><label>结算接口</label><span>mock / 可回放</span></div>' +
    "</div>";
}

function renderMain() {
  var main = document.querySelector("#main");
  if (state.view === "overview") main.innerHTML = renderOverview();
  if (state.view === "documents") main.innerHTML = renderDocuments();
  if (state.view === "frontpage") main.innerHTML = renderFrontpage();
  if (state.view === "settlement") main.innerHTML = renderSettlement();
  if (state.view === "grouping") main.innerHTML = renderGrouping();
  if (state.view === "audit") main.innerHTML = renderAudit();
}

function showToast(message) {
  state.toast = message;
  var node = document.createElement("div");
  node.className = "success-box";
  node.style.cssText = "position:fixed;right:28px;bottom:24px;z-index:10;box-shadow:var(--shadow)";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(function () { node.remove(); }, 2500);
}

function generateAll() {
  state.draft = null;
  state.settlement = Settlement.buildSettlementList(episode);
  state.settlementIssues = asArray(Settlement.validateSettlementList(state.settlement));
  showToast("已按当前 Episode 生成文书草稿与医保结算清单。");
  render();
}

function submitSettlement() {
  if (!state.settlement) {
    state.settlement = Settlement.buildSettlementList(episode);
    state.settlementIssues = asArray(Settlement.validateSettlementList(state.settlement));
  }
  if (state.settlementIssues.some(function (issue) { return String(issue.severity).toLowerCase() === "error"; })) {
    showToast("清单存在阻断性问题，先处理质控再提交。");
    state.view = "settlement";
    render();
    return;
  }
  state.snapshot = Settlement.createClaimSnapshot(state.settlement, { idempotencyKey: "MVP-CASE-A001-V1" });
  state.response = Settlement.submitSettlementMock(state.snapshot);
  state.reconciliation = Settlement.reconcileSettlement(state.snapshot, state.response);
  showToast("已完成本地模拟提交并回写反馈，可重复回放。");
  render();
}

function render() {
  renderEpisodeSummary();
  renderNav();
  renderMain();
  renderRightRail();
  document.querySelector("#clock").textContent = dateTime();
}

document.addEventListener("click", function (event) {
  var viewNode = event.target.closest("[data-view]");
  if (viewNode) {
    state.view = viewNode.dataset.view;
    render();
    return;
  }
  var templateNode = event.target.closest("[data-template]");
  if (templateNode) {
    state.templateId = templateNode.dataset.template;
    state.draft = null;
    state.view = "documents";
    render();
    return;
  }
  var actionNode = event.target.closest("[data-action]");
  if (!actionNode) return;
  var action = actionNode.dataset.action;
  if (action === "generate-all") generateAll();
  if (action === "rebuild-settlement") {
    state.settlement = Settlement.buildSettlementList(episode);
    state.settlementIssues = asArray(Settlement.validateSettlementList(state.settlement));
    showToast("已重新生成结算清单。");
    render();
  }
  if (action === "submit-settlement") submitSettlement();
  if (action === "run-audit") { state.view = "audit"; showToast("已重新运行确定性审核与文书质控。"); render(); }
  if (action === "close-audit") { showToast("已记录人工确认动作；正式系统需写入审核日志。"); }
  if (action === "refresh-grouping") { showToast("国家 3.0 输入检查已完成，正式规则包仍待导入。"); render(); }
  if (action === "open-hm") { showToast("已通过 HmEditor 兼容适配层打开病案首页/文书草稿。"); state.view = "frontpage"; render(); }
});

render();
