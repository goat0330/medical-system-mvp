import { getHmEditorTemplate } from '../data/templates.js';

const cloneValue = (value) => {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
};

const isMissing = (value) => {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

const getFact = (episode, factPath) => factPath.split('.').reduce(
  (value, segment) => (value === undefined || value === null ? undefined : value[segment]),
  episode,
);

const formatValue = (value) => {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return JSON.stringify(value, null, 2);
};

const escapeHtml = (value) => formatValue(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const factPathMatches = (sourcePath, requestedPath) => (
  sourcePath === requestedPath
  || sourcePath.startsWith(`${requestedPath}.`)
  || requestedPath.startsWith(`${sourcePath}.`)
);

const collectEvidenceRefs = (episode, factPath) => (episode?.evidence ?? [])
  .filter((item) => item.factPaths?.some((sourcePath) => factPathMatches(sourcePath, factPath)))
  .map((item) => ({
    evidenceId: item.evidenceId,
    sourceType: item.source?.type,
    sourceId: item.source?.id,
    factPath,
    excerpt: item.excerpt,
  }));

const uniqueEvidenceRefs = (refs) => [...new Map(
  refs.map((ref) => [`${ref.evidenceId}:${ref.factPath}`, ref]),
).values()];

const renderDraftText = (template, fields) => [
  `${template.templateName}（草稿）`,
  ...fields.map((item) => `${item.label}：${item.missing ? `【缺失事实：${item.label}】` : formatValue(item.value)}`),
].join('\n');

export const DOCUMENT_QC_RULES = Object.freeze([
  Object.freeze({
    id: 'required-facts',
    name: '必填事实完整性',
    description: '模板声明的必填事实缺失时不得直接形成正式文书。',
  }),
  Object.freeze({
    id: 'cross-document-consistency',
    name: '跨文书一致性',
    description: '主要诊断和手术/操作应与出院记录及病案首页事实一致。',
  }),
  Object.freeze({
    id: 'human-signoff',
    name: '医生签名或确认',
    description: 'AI 草稿必须经医生签名或明确确认后才可作为正式文书。',
  }),
]);

const issue = (ruleId, code, severity, field, message, blocking = true) => ({
  ruleId,
  code,
  severity,
  field,
  message,
  blocking,
  status: 'open',
});

export function runDocumentQc({ template, templateId, episode = {}, draft, documentData } = {}) {
  const selectedTemplate = template ?? getHmEditorTemplate(templateId);
  if (!selectedTemplate) {
    return {
      ok: false,
      issues: [issue('template', 'UNKNOWN_TEMPLATE', 'error', 'templateId', '无法找到文书模板。')],
      checkedRules: DOCUMENT_QC_RULES.map((rule) => rule.id),
    };
  }

  const issues = [];
  for (const factPath of selectedTemplate.requiredFacts) {
    if (isMissing(getFact(episode, factPath))) {
      issues.push(issue(
        'required-facts',
        'MISSING_REQUIRED_FACT',
        'error',
        factPath,
        `缺少必填事实：${factPath}。AI 不会代填。`,
      ));
    }
  }

  const primaryDiagnosisCode = getFact(episode, 'diagnoses.primary.code');
  const dischargeDiagnosisCode = getFact(episode, 'discharge.primaryDiagnosisCode');
  if (primaryDiagnosisCode && dischargeDiagnosisCode && primaryDiagnosisCode !== dischargeDiagnosisCode) {
    issues.push(issue(
      'cross-document-consistency',
      'PRIMARY_DIAGNOSIS_MISMATCH',
      'error',
      'discharge.primaryDiagnosisCode',
      `主要诊断编码与出院记录不一致：${primaryDiagnosisCode} / ${dischargeDiagnosisCode}。`,
    ));
  }

  const procedureCodes = new Set((getFact(episode, 'procedures') ?? []).map((item) => item.code));
  for (const code of getFact(episode, 'discharge.procedureCodes') ?? []) {
    if (!procedureCodes.has(code)) {
      issues.push(issue(
        'cross-document-consistency',
        'PROCEDURE_MISMATCH',
        'error',
        'discharge.procedureCodes',
        `出院记录中的手术/操作编码缺少住院手术事实：${code}。`,
      ));
    }
  }

  const hasHumanSignoff = draft?.status === 'confirmed'
    && (draft.humanSignoff?.status === 'confirmed' || draft.confirmedBy);
  const documentSignoff = documentData?.signoff?.status === 'confirmed'
    || documentData?.humanSignoff?.status === 'confirmed';
  if (!hasHumanSignoff && !documentSignoff) {
    issues.push(issue(
      'human-signoff',
      'HUMAN_SIGNOFF_REQUIRED',
      'warning',
      'humanSignoff',
      '草稿尚未完成医生签名或明确确认，不能作为正式文书。',
    ));
  }

  return {
    ok: issues.length === 0,
    issues,
    checkedRules: DOCUMENT_QC_RULES.map((rule) => rule.id),
  };
}

const renderCompatHtml = (template, mode, data) => {
  const fields = Object.entries(data ?? {})
    .map(([key, value]) => `<div data-field="${escapeHtml(key)}"><strong>${escapeHtml(key)}</strong><span>${escapeHtml(value)}</span></div>`)
    .join('');
  return `<article data-hm-editor-adapter="HmEditor" data-hm-editor-mode="${mode}" data-template-id="${escapeHtml(template?.id ?? '')}">${fields}</article>`;
};

const callSdk = (sdk, method, args) => {
  if (!sdk || typeof sdk[method] !== 'function') return undefined;
  return sdk[method](...args);
};

export function createHmEditorAdapter({ sdk = null } = {}) {
  const mode = sdk ? 'sdk-adapter' : 'compat-mock';
  const state = {
    template: null,
    datasource: null,
    docData: {},
    docText: '',
    docHtml: '',
    draft: null,
  };

  const adapter = {
    adapterName: 'HmEditor',
    mode,
    isMock: !sdk,

    setTemplateDatasource(templateRef, datasource) {
      const template = typeof templateRef === 'object'
        ? templateRef
        : getHmEditorTemplate(templateRef);
      if (!template) throw new Error(`Unknown HmEditor template: ${templateRef}`);
      if (template.source !== 'HmEditor') throw new Error('HmEditor adapter requires source: HmEditor.');
      state.template = template;
      state.datasource = cloneValue(datasource);
      const sdkResult = callSdk(sdk, 'setTemplateDatasource', [template.keyCode, datasource]);
      return sdkResult ?? {
        templateId: template.id,
        keyCode: template.keyCode,
        source: template.source,
        mode,
      };
    },

    setDocData(data) {
      state.docData = cloneValue(data ?? {});
      state.docText = Object.entries(state.docData)
        .map(([key, value]) => `${key}：${formatValue(value)}`)
        .join('\n');
      state.docHtml = renderCompatHtml(state.template, mode, state.docData);
      const sdkResult = callSdk(sdk, 'setDocData', [data]);
      return sdkResult ?? cloneValue(state.docData);
    },

    getDocData() {
      return callSdk(sdk, 'getDocData', []) ?? cloneValue(state.docData);
    },

    getDocText() {
      return callSdk(sdk, 'getDocText', []) ?? state.docText;
    },

    getDocHtml() {
      return callSdk(sdk, 'getDocHtml', []) ?? state.docHtml;
    },

    qc(input = {}) {
      const sdkResult = callSdk(sdk, 'qc', [input]);
      if (sdkResult !== undefined) return sdkResult;
      if (input?.templateId && input?.status) {
        const draftIssues = (input.missingFacts ?? []).map((missingFact) => issue(
          'required-facts',
          'MISSING_REQUIRED_FACT',
          'error',
          missingFact.factPath,
          missingFact.message,
        ));
        if (input.status !== 'confirmed' || input.requiresHumanSignoff) {
          draftIssues.push(issue(
            'human-signoff',
            'HUMAN_SIGNOFF_REQUIRED',
            'warning',
            'humanSignoff',
            '草稿尚未完成医生签名或明确确认，不能作为正式文书。',
          ));
        }
        return draftIssues;
      }
      const context = input && input.episode ? input : {};
      return runDocumentQc({
        template: state.template,
        episode: context.episode ?? state.datasource ?? {},
        draft: context.draft ?? state.draft,
        documentData: context.documentData ?? (context.episode ? state.docData : input),
      });
    },

    setDraft(draft) {
      state.draft = cloneValue(draft);
      this.setDocData(draft?.data ?? {});
      return cloneValue(draft);
    },
  };

  return adapter;
}

export function generateDocumentDraft(templateId, episode, { adapter = null } = {}) {
  const template = getHmEditorTemplate(templateId);
  if (!template) throw new Error(`Unknown HmEditor template: ${templateId}`);
  if (!template.enabled) throw new Error(`HmEditor template is disabled: ${template.templateName}`);
  if (!episode || typeof episode !== 'object') throw new TypeError('episode must be an object.');

  const missingFacts = new Map();
  const markMissing = (factPath, label = factPath) => {
    if (isMissing(getFact(episode, factPath)) && !missingFacts.has(factPath)) {
      missingFacts.set(factPath, {
        factPath,
        label,
        message: `缺少事实：${label}（${factPath}）。AI 不会编造。`,
      });
    }
  };

  for (const factPath of template.requiredFacts) markMissing(factPath);
  const fields = template.outputFields.map((outputField) => {
    const value = getFact(episode, outputField.factPath);
    const missing = isMissing(value);
    if (missing) markMissing(outputField.factPath, outputField.label);
    return {
      key: outputField.key,
      label: outputField.label,
      factPath: outputField.factPath,
      value: missing ? null : cloneValue(value),
      missing,
      evidenceRefs: missing ? [] : collectEvidenceRefs(episode, outputField.factPath),
    };
  });

  const data = Object.fromEntries(fields.map((item) => [item.key, item.value]));
  const evidenceRefs = uniqueEvidenceRefs([
    ...fields.flatMap((item) => item.evidenceRefs),
    ...template.requiredFacts.flatMap((factPath) => (
      isMissing(getFact(episode, factPath)) ? [] : collectEvidenceRefs(episode, factPath)
    )),
  ]);
  const draft = {
    templateId: template.id,
    keyCode: template.keyCode,
    templateName: template.templateName,
    category: template.category,
    source: template.source,
    status: 'draft',
    requiresHumanSignoff: true,
    humanSignoff: {
      required: true,
      status: 'pending',
    },
    aiScope: ['document-draft', 'fact-extraction', 'missing-fact-reminder'],
    data,
    fields,
    missingFacts: [...missingFacts.values()],
    evidenceRefs,
    text: renderDraftText(template, fields),
  };

  const editorAdapter = template.category === 'front-page'
    ? (adapter ?? createHmEditorAdapter())
    : null;
  if (editorAdapter) {
    editorAdapter.setTemplateDatasource(template, episode);
    editorAdapter.setDocData(data);
    if (typeof editorAdapter.setDraft === 'function') editorAdapter.setDraft(draft);
    draft.text = editorAdapter.getDocText();
    draft.html = editorAdapter.getDocHtml();
    draft.editor = {
      adapter: editorAdapter.adapterName ?? 'HmEditor',
      source: template.source,
      mode: editorAdapter.mode ?? 'compat-mock',
      isMock: Boolean(editorAdapter.isMock),
      templateId: template.id,
      keyCode: template.keyCode,
    };
    draft.qc = editorAdapter.qc({ episode, draft, documentData: data });
  } else {
    draft.qc = runDocumentQc({ template, episode, draft, documentData: data });
  }

  return draft;
}
