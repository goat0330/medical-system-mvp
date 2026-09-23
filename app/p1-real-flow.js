import { buildSettlementList, validateSettlementList } from './domain/settlement.js';
import { runRealBusinessPipeline } from './p1/real-business-pipeline.js';
import { evidencePanel, groupingPath, riskIssueCard, ruleTrace } from './ui/domain-components.js';
import { appButton, asArray, baseCard, escapeHtml, metricCard, statusBadge } from './ui/primitives.js';

const STORAGE_KEY = 'medical-mvp-p1-real-flow-v1';
let internalWrite = false;

function currentContext() {
  return window.medicalSystemMvp.getEpisodeContext();
}

function stateStorageKey() {
  const context = currentContext();
  return `${STORAGE_KEY}:${context.patientKey || context.episode.episodeId}`;
}

function readState() {
  try { return JSON.parse(localStorage.getItem(stateStorageKey()) || '{}'); } catch { return {}; }
}

function writeState(next) {
  localStorage.setItem(stateStorageKey(), JSON.stringify(next));
}

function esc(value) {
  return escapeHtml(value);
}

function currentPipeline() {
  const context = currentContext();
  const state = readState();
  const settlement = context.settlement || buildSettlementList(context.episode);
  const settlementIssues = context.settlementIssues || validateSettlementList(settlement);
  return runRealBusinessPipeline({
    episode: context.episode,
    settlement,
    settlementIssues,
    overrideMethod: state.overrideMethod || null,
    confirmedMappings: state.confirmedMappings || [],
  });
}

function toneFor(status) {
  const value = String(status || '').toUpperCase();
  if (/BLOCK|FAIL|INVALID/.test(value)) return 'red';
  if (/PENDING|REVIEW|NOT_|PARTIAL|EXCLUDED/.test(value)) return 'amber';
  if (/PASS|MATCHED|GROUPED|CONFIRMED|DONE|BUILT|UNCHANGED/.test(value)) return 'green';
  return 'gray';
}

function statusLabel(status) {
  const labels = {
    BLOCKED: '阻断',
    BLOCKED_BY_DATA_QUALITY: '清单质控阻断',
    FAIL: '未通过',
    PASS: '通过',
    MATCHED: '已命中',
    NOT_MATCHED: '未命中，继续',
    NOT_GROUPED: '未分组',
    NOT_GROUPED_MDC: '未匹配 MDC',
    NOT_GROUPED_ADRG: '未匹配 ADRG',
    NOT_GROUPED_DRG: '未匹配 DRG',
    NOT_GROUPED_CORE: '未匹配国家核心病种',
    REQUIRES_CONFIRMATION: '待人工确认',
    CONFIRMED: '已确认',
    GROUPED: '已分组',
    GROUPED_PENDING_CODING_CONFIRMATION: '候选分组，待编码确认',
    PENDING_REVIEW: '待人工复核',
    PENDING_LOCAL_PARAMETERS: '待本地支付参数',
    REVIEW: '待核验',
    NOT_RUN: '未执行',
    NOT_COVERED: '未覆盖',
    PARTIAL: '部分覆盖',
    READY: '已准备',
    INVALID_INPUT: '输入无效',
    EXCLUDED_PRINCIPAL_DIAGNOSIS: '命中排除规则',
    EXCLUDED_PROCEDURE: '操作按排除规则处理',
    DONE: '已完成',
    BUILT: '已生成',
    UNCHANGED: '未调整',
  };
  return labels[status] || status || '待处理';
}

function stageCards(rows) {
  return `<div class="overview-flow p1-stage-list">${rows.map((item) => `<div class="overview-flow__step p1-stage"><strong>${esc(item.name)}</strong><span>输入：${esc(item.input)}</span><span>输出：${esc(item.output)}</span>${item.status ? statusBadge(statusLabel(item.status), toneFor(item.status)) : ''}</div>`).join('')}</div>`;
}

function traceView(rows) {
  return ruleTrace((rows || []).map((item) => ({
    title: item.stage,
    message: [
      `输入：${item.input || '—'}`,
      `输出：${item.output || '—'}`,
      item.rule ? `规则：${item.rule}` : '',
      item.source ? `来源：${item.source}` : '',
    ].filter(Boolean).join('；'),
    status: statusLabel(item.status),
    tone: toneFor(item.status),
  })));
}

function inputTable(p) {
  const context = currentContext();
  const episode = context.episode;
  const snapshot = p.groupingSnapshot;
  const issues = asArray(context.settlementIssues);
  const validationTone = issues.some((item) => item.severity === 'error') ? 'red' : issues.length ? 'amber' : 'green';
  const rows = [
    ['统筹区 / 支付方式', `${p.route.region} / ${p.route.paymentMethod}`, p.route.decisionSource || '支付方式路由', statusBadge(p.route.paymentMethod, 'blue', true)],
    ['患者属性', `${episode.patient?.sex || '未知'} · ${episode.patient?.age ?? '未知'}岁`, '当前住院 Episode', statusBadge('已读取', 'green', true)],
    ['主要诊断', `${snapshot.principalDiagnosis?.code || '未编码'} ${snapshot.principalDiagnosis?.name || ''}`, '病案首页 → 清单', statusBadge(snapshot.principalDiagnosis?.code ? '已准备' : '缺失', snapshot.principalDiagnosis?.code ? 'green' : 'red', true)],
    ['其他诊断', snapshot.secondaryDiagnoses.map((item) => item.code).join('、') || '无', '病案首页 → 清单', statusBadge('已读取', 'green', true)],
    ['主要手术 / 操作', `${snapshot.principalProcedure?.code || '无'} ${snapshot.principalProcedure?.name || ''}`, '病案首页 / 手术记录', statusBadge('已读取', 'green', true)],
    ['结算清单质控', `${issues.length} 条问题`, '当前患者结算清单', statusBadge(issues.length ? '需核验' : '通过', validationTone, true)],
  ];
  return `<table class="clinical-data-table p1-input-table"><thead><tr><th>分组输入</th><th>当前值</th><th>来源</th><th>状态</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${esc(row[0])}</td><td>${esc(row[1])}</td><td>${esc(row[2])}</td><td>${row[3]}</td></tr>`).join('')}</tbody></table>`;
}

function pathView(p) {
  const result = p.groupingResult;
  const label = result.group ? `${result.group.code || ''} ${result.group.name || ''}`.trim() : statusLabel(result.status);
  if (p.route.paymentMethod === 'DRG') {
    return groupingPath({
      mdc: result.mdc ? `${result.mdc.code} ${result.mdc.name}` : null,
      adrg: result.adrg ? `${result.adrg.code} ${result.adrg.name}` : null,
      drg: result.group ? `${result.group.code} ${result.group.name}` : null,
    });
  }
  if (p.route.paymentMethod === 'DIP') {
    return groupingPath({
      mdc: '国家 DIP 3.0',
      adrg: '诊断 + 手术组合规则',
      drg: result.group ? `${result.group.code} ${result.group.name}` : null,
      labels: ['支付体系', '核心病种识别', '病种分组'],
    });
  }
  return groupingPath({ mdc: p.route.paymentMethod, adrg: null, drg: label });
}

function groupingHtml(p) {
  const state = readState();
  const result = p.groupingResult;
  const mappingTrace = result.trace?.find((item) => item.status === 'REQUIRES_CONFIRMATION');
  const mappingKey = mappingTrace?.mappingKey;
  const groupName = result.group?.name || statusLabel(result.status);
  const resultCard = `<div class="p1-result metric-card"><div class="p1-result__code">${esc(result.group?.code || '—')}</div><div class="p1-result__copy"><strong>${esc(groupName)}</strong><span>${esc(result.version || p.route.grouperVersion || '规则版本未声明')} · 官方 Excel 规则源</span>${statusBadge(statusLabel(result.status), toneFor(result.status))}</div></div>`;
  const mappingAction = result.mappingConfirmationRequired && mappingKey
    ? `<div class="notice p1-notice">主要诊断 ${esc(p.groupingSnapshot.principalDiagnosis?.code)} 存在候选标准码映射，确认前结果仅供试算。${appButton('编码员确认映射并重跑', { variant: 'primary', size: 'small', attrs: `data-p1-confirm-mapping="${esc(mappingKey)}"` })}</div>`
    : '';
  const paymentText = p.paymentResult.note || p.paymentResult.reason || p.paymentResult.status;
  const sourceRows = [
    ['规则源文件', result.sourceFile || '—'],
    ['SHA256', result.sourceSha256 || '—'],
    ['规则覆盖', result.productionRuleCoverage || '—'],
    ['规则规模', JSON.stringify(result.counts || {})],
  ];
  const routeActions = [
    appButton('DRG 路径', { variant: p.route.paymentMethod === 'DRG' ? 'primary' : '', size: 'small', attrs: 'data-p1-method="DRG"' }),
    appButton('DIP 统筹区演示', { variant: p.route.paymentMethod === 'DIP' ? 'primary' : '', size: 'small', attrs: 'data-p1-method="DIP"' }),
    appButton('按病例配置', { size: 'small', attrs: 'data-p1-method="AUTO"' }),
  ].join('');

  return `<div class="p1-flow">
    <div class="p1-flow__hero">
      ${baseCard('支付方式路由', `<div class="p1-route-line"><span>统筹区</span>${statusBadge(p.route.region || '未配置', 'blue')}<span>支付方式</span>${statusBadge(p.route.paymentMethod, 'blue')}<span>分组版本</span>${statusBadge(p.route.grouperVersion || '未配置', 'gray')}</div><p>${esc(p.route.reason)}</p><div class="p1-switch">${routeActions}</div><p class="cell-muted">切换至 DIP 仅用于验证 DIP 规则路径，不代表武汉实际采用 DIP 支付。</p>`, { desc: '先按统筹区和 Episode 配置确定支付体系，再进入对应分组器。' })}
      ${baseCard('路由依据与支付边界', `<p>路由来源：${esc(p.route.decisionSource || '未声明')}</p><div class="notice p1-notice">国家 3.0 分组规则与地方支付参数分离。当前未配置经核验的武汉权重、费率或 DIP 点值，因此不生成支付金额。</div><div class="p1-payment"><span>支付测算</span>${statusBadge(statusLabel(p.paymentResult.status), toneFor(p.paymentResult.status))}<p>${esc(paymentText)}</p></div>`, { desc: p.route.label })}
    </div>
    ${stageCards(p.flow)}
    <div class="p1-grid-2">
      ${baseCard('分组输入快照', inputTable(p), { desc: '输入来自当前患者 Episode、病案首页和医保结算清单。' })}
      ${baseCard(`${p.route.paymentMethod} 3.0 分组结果`, `${pathView(p)}${resultCard}${mappingAction}`, { desc: '候选结果与人工编码确认状态分开呈现。' })}
    </div>
    ${baseCard(`${p.route.paymentMethod} 3.0 规则执行 trace`, traceView(result.trace), { desc: '逐步显示输入、规则、输出和官方 Excel 来源行；未覆盖时明确返回未分组。' })}
    ${baseCard('官方规则源 / 可追溯性', `<table class="clinical-data-table p1-input-table"><tbody>${sourceRows.map((row) => `<tr><th>${esc(row[0])}</th><td class="p1-break-word">${esc(row[1])}</td></tr>`).join('')}</tbody></table><div class="notice p1-notice">分组结果由官方 Excel 规则包计算；武汉权重 / 费率、DIP 点值及特例支付配置仍需单独接入经核验的本地参数。</div>`, { desc: '规则原始工作簿随项目保存，可重复编译并核对来源。' })}
  </div>`;
}

function auditStageTable(stages) {
  return `<table class="clinical-data-table p1-input-table"><thead><tr><th>阶段</th><th>审核环节</th><th>输入 / 输出</th><th>状态</th></tr></thead><tbody>${stages.map((item) => `<tr><td>${esc(item.id)}</td><td>${esc(item.name)}</td><td>${esc(item.input)}<br>${esc(item.output)}${item.note ? `<br>${esc(item.note)}` : ''}</td><td>${statusBadge(statusLabel(item.status), toneFor(item.status), true)}</td></tr>`).join('')}</tbody></table>`;
}

function toUiRisk(risk) {
  return {
    id: risk.riskId,
    code: risk.ruleCode,
    title: risk.title,
    message: risk.reason || risk.title,
    severity: risk.severity,
    evidenceRefs: (risk.evidenceBundle?.evidence || []).map((item) => ({
      excerpt: `${item.sourceType} · ${item.title}：${item.excerpt}`,
      sourceId: item.sourceId,
      factPath: item.factPath,
    })),
  };
}

function auditHtml(p) {
  const state = readState();
  const context = currentContext();
  const risks = p.auditRun.risks || [];
  const selectedId = risks.some((item) => item.riskId === state.selectedRiskId) ? state.selectedRiskId : risks[0]?.riskId;
  const selectedRisk = risks.find((item) => item.riskId === selectedId);
  const selectedUiRisk = selectedRisk ? toUiRisk(selectedRisk) : null;
  const evidenceCount = risks.reduce((sum, item) => sum + (item.evidenceBundle?.evidence?.length || 0), 0);
  const feeItems = context.episode.fees?.items || [];
  const payment = p.paymentResult.status;
  const reviewLog = state.reviewLog || [];
  const riskList = risks.length ? risks.map((risk) => {
    const confirmButton = risk.action?.type === 'CONFIRM_MAPPING'
      ? appButton('确认标准编码映射并重跑', { variant: 'primary', size: 'small', attrs: `data-p1-confirm-mapping="${esc(risk.action.mappingKey)}"` })
      : '';
    return `<div class="p1-risk-item">${riskIssueCard(toUiRisk(risk), risk.riskId === selectedId)}${confirmButton}</div>`;
  }).join('') : '<div class="base-card"><p>当前已执行规则下没有待审核风险，可进入后续流程。</p></div>';
  const logs = reviewLog.map((item) => `${esc(item.time)} · ${esc(item.action)} · ${esc(item.riskId || item.mappingKey || '')}`).join('<br>') || '暂无人工动作记录。';

  return `<div class="p1-flow">
    <div class="p1-flow__hero">
      ${baseCard('审核流程与结论', `${stageCards(p.flow.slice(4))}<div class="p1-audit-summary">${metricCard('审核结论', statusLabel(p.auditRun.finalStatus), '确定性规则与当前可得数据')}${metricCard('风险线索', risks.length, '编码 / 分组 / 结算清单')}${metricCard('证据引用', evidenceCount, '来自当前患者 Episode')}${metricCard('人工动作', reviewLog.length, '本患者独立保存')}</div>`, { desc: '先做数据质量与规则检查，再调取病例证据，最后进入人工复核。' })}
      ${baseCard('本次审核输入', `<table class="clinical-data-table p1-input-table"><tbody><tr><th>支付方式</th><td>${esc(p.route.paymentMethod)}</td></tr><tr><th>分组结果</th><td>${esc(p.groupingResult.group?.code || statusLabel(p.groupingResult.status))}</td></tr><tr><th>结算清单</th><td>${esc(context.settlement?.claimSerialNumber || '未生成')}</td></tr><tr><th>费用粒度</th><td>${feeItems.some((item) => item.itemCode || item.billingTime) ? `逐条 ClaimDetail（${feeItems.length} 项）` : '费用分类汇总（当前限制）'}</td></tr><tr><th>支付测算</th><td>${esc(statusLabel(payment))}</td></tr></tbody></table>`, { desc: '所有字段引用当前选中患者，不使用独立的演示病例副本。' })}
    </div>
    ${baseCard('审核阶段：输入、输出与状态', auditStageTable(p.auditRun.stages), { desc: 'L0 至 L5 分别对应数据接收、编码、费用规则、分组复核、证据调取和人工处置。' })}
    <div class="p1-grid-2">
      ${baseCard('RiskIssue 风险线索', `<div class="p1-risk-list">${riskList}</div>`, { desc: '风险只表示待核验线索，不直接定性为违规。' })}
      ${evidencePanel(selectedUiRisk)}
    </div>
    ${baseCard('人工复核 / 重跑记录', `<p>人工复核动作按当前住院 Episode 隔离保存。修改诊断或清单后，重新进入页面会使用当前 Episode 再执行分组和审核。</p><div class="p1-history">${logs}</div><div class="p1-reset">${appButton('重置当前患者 P1 演示状态', { attrs: 'data-p1-reset' })}</div>`, { desc: '人工确认不会改写官方规则包或冒充医保端结算回执。' })}
  </div>`;
}

function bindRiskActions() {
  document.querySelectorAll('.p1-flow [data-action="select-risk"], .p1-flow [data-action="review-risk"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const state = readState();
      const riskId = button.dataset.riskId;
      state.selectedRiskId = riskId;
      if (button.dataset.action === 'review-risk') {
        state.reviewLog = [...(state.reviewLog || []), { time: new Date().toLocaleString('zh-CN'), action: 'HUMAN_REVIEW_RECORDED', riskId }];
      }
      writeState(state);
      rerenderCurrent();
    }, true);
  });
}

function bind() {
  document.querySelectorAll('[data-p1-method]').forEach((button) => button.addEventListener('click', () => {
    const state = readState();
    const method = button.dataset.p1Method;
    state.overrideMethod = method === 'AUTO' ? null : method;
    writeState(state);
    rerenderCurrent();
  }));
  document.querySelectorAll('[data-p1-confirm-mapping]').forEach((button) => button.addEventListener('click', () => {
    const state = readState();
    const mappingKey = button.dataset.p1ConfirmMapping;
    state.confirmedMappings = [...new Set([...(state.confirmedMappings || []), mappingKey])];
    state.reviewLog = [...(state.reviewLog || []), { time: new Date().toLocaleString('zh-CN'), action: 'CONFIRM_MAPPING', mappingKey }];
    writeState(state);
    rerenderCurrent();
  }));
  document.querySelectorAll('[data-p1-reset]').forEach((button) => button.addEventListener('click', () => {
    localStorage.removeItem(stateStorageKey());
    rerenderCurrent();
  }));
  bindRiskActions();
}

function apply() {
  if (internalWrite) return;
  const header = [...document.querySelectorAll('h1, h2')].find((item) => /DRG\s*\/\s*DIP 3\.0|智能医保审核/.test(item.textContent || ''));
  if (!header) return;
  const content = document.querySelector('.page-content');
  if (!content || content.dataset.p1Applied === '1') return;
  const pipeline = currentPipeline();
  internalWrite = true;
  content.dataset.p1Applied = '1';
  content.innerHTML = /智能医保审核/.test(header.textContent || '') ? auditHtml(pipeline) : groupingHtml(pipeline);
  bind();
  internalWrite = false;
}

function rerenderCurrent() {
  const content = document.querySelector('.page-content');
  if (content) content.dataset.p1Applied = '0';
  apply();
}

const observer = new MutationObserver(() => queueMicrotask(apply));
observer.observe(document.querySelector('#app'), { childList: true, subtree: true });
window.addEventListener('load', apply);
setTimeout(apply, 0);
