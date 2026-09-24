import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./", import.meta.url));
const port = Number(process.argv[2] || 8765);
const QC_PATH = "/api/medical-record-qc";
const AI_MODELS_PATH = "/api/ai/models";
const AI_MODEL_TEST_PATH = "/api/ai/models/test";
const MAX_REQUEST_BYTES = 16 * 1024 * 1024;
const MAX_UPSTREAM_RESPONSE_BYTES = 16 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 120_000;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".eot": "application/vnd.ms-fontobject",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

class ApiError extends Error {
  constructor(status, code, message, trace = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.trace = trace;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function sendNotFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("404 Not Found");
}

function assertExactKeys(value, keys) {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new ApiError(400, "INVALID_INPUT", "Request shape is invalid.");
}

function readString(value, maxLength, allowEmpty = false) {
  if (typeof value !== "string" || value.length > maxLength || (!allowEmpty && value.trim() === "")) {
    throw new ApiError(400, "INVALID_INPUT", "Request shape is invalid.");
  }
  return value;
}

function readNullableString(value, maxLength) {
  if (value === null || value === undefined || value === "") return null;
  return readString(value, maxLength);
}

function normalizePrincipalDiagnosis(value) {
  if (typeof value === "string") return readString(value, 4_000, true);
  if (!isPlainObject(value)) throw new ApiError(400, "INVALID_INPUT", "Request shape is invalid.");
  assertExactKeys(value, ["name", "code"]);
  return {
    name: readString(value.name, 500),
    code: readString(value.code, 100),
  };
}

const qcQualityTypes = new Set(["completeness", "consistency", "chronology", "medical_reasonableness", "coding", "insurance_grouping"]);

function validatePatientContext(value = {}) {
  if (!isPlainObject(value)) throw new ApiError(400, "INVALID_INPUT", "Patient evidence context is invalid.");
  assertExactKeys(value, ["evidence", "facts", "conflicts", "deterministicRules"]);
  const evidence = value.evidence || [];
  const facts = value.facts || [];
  const conflicts = value.conflicts || [];
  const deterministicRules = value.deterministicRules || [];
  if (![evidence, facts, conflicts, deterministicRules].every(Array.isArray)) throw new ApiError(400, "INVALID_INPUT", "Patient evidence context is invalid.");
  const normalizedEvidence = evidence.map((item) => {
    if (!isPlainObject(item)) throw new ApiError(400, "INVALID_INPUT", "Patient evidence context is invalid.");
    assertExactKeys(item, ["evidenceId", "sourceType", "documentTitle", "fieldName", "fieldCode", "concept", "value", "eventTime", "excerpt"]);
    return {
      evidenceId: readString(item.evidenceId, 80),
      sourceType: readString(item.sourceType, 80),
      documentTitle: readString(item.documentTitle || "临床证据", 200),
      fieldName: readString(item.fieldName || "临床事实", 200),
      fieldCode: readString(item.fieldCode || "", 120, true),
      concept: readString(item.concept || "", 200, true),
      value: readString(item.value ?? "", Infinity, true),
      eventTime: readString(item.eventTime || "", 80, true),
      excerpt: readString(item.excerpt || "", Infinity, true),
    };
  });
  const evidenceIds = new Set(normalizedEvidence.map((item) => item.evidenceId));
  const references = (items) => {
    if (!Array.isArray(items)) throw new ApiError(400, "INVALID_INPUT", "Patient evidence references are invalid.");
    const ids = items.map((id) => readString(id, 80));
    if (ids.some((id) => !evidenceIds.has(id))) throw new ApiError(400, "INVALID_INPUT", "Patient evidence reference is outside this request.");
    return ids;
  };
  const normalizedFacts = facts.map((item) => {
    if (!isPlainObject(item)) throw new ApiError(400, "INVALID_INPUT", "ClinicalFact context is invalid.");
    assertExactKeys(item, ["concept", "value", "status", "evidenceIds"]);
    return { concept: readString(item.concept, 200), value: readString(item.value ?? "", Infinity, true), status: readString(item.status || "UNKNOWN", 40), evidenceIds: references(item.evidenceIds || []) };
  });
  const normalizedConflicts = conflicts.map((item) => {
    if (!isPlainObject(item)) throw new ApiError(400, "INVALID_INPUT", "Evidence conflict context is invalid.");
    assertExactKeys(item, ["conflictId", "concept", "severity", "blocking", "reason", "evidenceIds"]);
    if (typeof item.blocking !== "boolean") throw new ApiError(400, "INVALID_INPUT", "Evidence conflict context is invalid.");
    return { conflictId: readString(item.conflictId, 80), concept: readString(item.concept, 200), severity: readString(item.severity, 20), blocking: item.blocking, reason: readString(item.reason, Infinity), evidenceIds: references(item.evidenceIds || []) };
  });
  const normalizedRules = deterministicRules.map((item) => {
    if (!isPlainObject(item)) throw new ApiError(400, "INVALID_INPUT", "Deterministic rule context is invalid.");
    assertExactKeys(item, ["code", "severity", "fieldName", "fieldCode", "fieldId", "message"]);
    return {
      code: readString(item.code || "LOCAL_RULE", 120), severity: readString(item.severity, 20),
      fieldName: readString(item.fieldName || "", 200, true), fieldCode: readString(item.fieldCode || "", 120, true),
      fieldId: readString(item.fieldId || "", 200, true), message: readString(item.message, Infinity),
    };
  });
  return { evidence: normalizedEvidence, facts: normalizedFacts, conflicts: normalizedConflicts, deterministicRules: normalizedRules };
}

function validateQcInput(input) {
  if (!isPlainObject(input)) throw new ApiError(400, "INVALID_INPUT", "Request shape is invalid.");
  const allowedKeys = new Set(["modelConfigId", "episodeId", "documentId", "documentTitle", "principalDiagnosis", "scopes", "fields", "patientContext", "qualityTypes"]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) throw new ApiError(400, "INVALID_INPUT", "Request shape is invalid.");
  if (!Array.isArray(input.fields) || input.fields.length === 0) {
    throw new ApiError(400, "INVALID_INPUT", "Request shape is invalid.");
  }
  if (!isPlainObject(input.scopes)) throw new ApiError(400, "INVALID_INPUT", "Request shape is invalid.");
  assertExactKeys(input.scopes, ["currentDocument", "relatedDocuments", "frontpageFields"]);
  const scopes = Object.fromEntries(Object.entries(input.scopes).map(([key, value]) => {
    if (typeof value !== "boolean") throw new ApiError(400, "INVALID_INPUT", "Request shape is invalid.");
    return [key, value];
  }));
  if (!Object.values(scopes).some(Boolean)) throw new ApiError(400, "QC_SCOPE_REQUIRED", "请至少选择一个质控范围。");
  const patientContext = validatePatientContext(input.patientContext || {});
  const qualityTypes = input.qualityTypes || ["completeness", "consistency"];
  if (!Array.isArray(qualityTypes) || !qualityTypes.length || qualityTypes.some((item) => !qcQualityTypes.has(item))) throw new ApiError(400, "INVALID_INPUT", "Quality-control types are invalid.");
  return {
    modelConfigId: readString(input.modelConfigId, 120),
    episodeId: readString(input.episodeId, 200),
    documentId: readString(input.documentId, 120),
    documentTitle: readString(input.documentTitle, 200),
    principalDiagnosis: normalizePrincipalDiagnosis(input.principalDiagnosis),
    scopes,
    qualityTypes: [...new Set(qualityTypes)],
    patientContext,
    fields: input.fields.map((field) => {
      if (!isPlainObject(field)) throw new ApiError(400, "INVALID_INPUT", "Request shape is invalid.");
      const allowedFieldKeys = new Set(["name", "code", "fieldId", "text", "documentId", "documentTitle"]);
      if (Object.keys(field).some((key) => !allowedFieldKeys.has(key))) throw new ApiError(400, "INVALID_INPUT", "Request shape is invalid.");
      return {
        name: readString(field.name, 200),
        code: readString(field.code, 120),
        fieldId: readString(field.fieldId, 200),
        text: readString(field.text, Infinity, true),
        documentId: readString(field.documentId || input.documentId, 120),
        documentTitle: readString(field.documentTitle || input.documentTitle, 200),
      };
    }),
  };
}

const supportedProviders = new Set(["deepseek", "openai", "azure-openai", "qwen", "zhipu", "moonshot", "openai-compatible", "ollama"]);
const supportedProtocols = new Set(["openai-compatible", "azure-openai", "ollama"]);

function validateModelConfig(input) {
  if (!isPlainObject(input)) throw new ApiError(400, "INVALID_INPUT", "模型配置格式不正确。");
  assertExactKeys(input, ["id", "name", "provider", "protocol", "baseUrl", "apiKey", "modelId", "enabled", "isDefault"]);
  const config = {
    id: readString(input.id, 120),
    name: readString(input.name, 120),
    provider: readString(input.provider, 80),
    protocol: readString(input.protocol, 40),
    baseUrl: readString(input.baseUrl, 2_000).trim(),
    apiKey: input.apiKey === undefined ? "" : readString(input.apiKey, 2_048, true).trim(),
    modelId: readString(input.modelId, 200).trim(),
    enabled: input.enabled === true,
    isDefault: input.isDefault === true,
  };
  if (!supportedProviders.has(config.provider) || !supportedProtocols.has(config.protocol)) {
    throw new ApiError(400, "UNSUPPORTED_MODEL", "暂不支持该厂商或接口协议。");
  }
  let url;
  try { url = new URL(config.baseUrl); } catch { throw new ApiError(400, "INVALID_MODEL_URL", "API Base URL 必须是有效的 HTTP 或 HTTPS 地址。"); }
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) {
    throw new ApiError(400, "INVALID_MODEL_URL", "API Base URL 必须是有效的 HTTP 或 HTTPS 地址，且不能包含账号密码。");
  }
  return config;
}

function safeModelConfig(config) {
  return {
    id: config.id,
    name: config.name,
    provider: config.provider,
    protocol: config.protocol,
    baseUrl: config.baseUrl,
    modelId: config.modelId,
    enabled: config.enabled,
    isDefault: config.isDefault,
    connected: Boolean(config.connected),
    apiKeyConfigured: Boolean(config.apiKey) || config.protocol === "ollama",
  };
}

function modelSignature(config) {
  return JSON.stringify([config.provider, config.protocol, config.baseUrl, config.modelId, config.apiKey]);
}

async function readRequestBody(req) {
  const contentLength = Number(req.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request payload is too large.");
  }
  const chunks = [];
  let total = 0;
  try {
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > MAX_REQUEST_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request payload is too large.");
      chunks.push(buffer);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "INVALID_INPUT", "Request body could not be read.");
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonRequest(req) {
  const contentType = String(req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Expected application/json.");
  const raw = await readRequestBody(req);
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

const QC_SYSTEM_PROMPT = [
  "You are a clinical documentation quality-control assistant.",
  "Review only the selected document scopes, principal diagnosis, supplied fields, same-episode evidence, standardized ClinicalFacts, conflicts, and deterministic local rule results.",
  "Do not invent patient identity, bed, record ID, clinical facts, citations, or unsupported diagnoses.",
  "Return only a JSON object with one key, findings.",
  "Each finding must contain qualityType (completeness, consistency, chronology, medical_reasonableness, coding, insurance_grouping, or insufficient_evidence), evidenceStatus (sufficient, limited, or insufficient), severity (critical, warning, or info), title, message, fieldCode, fieldId, anchorType (text or field), quote, anchors, evidenceRefs, evidence, rationale, and suggestion.",
  "Use fieldCode, fieldId, documentId, and documentTitle from the supplied fields, or null for a cross-field finding.",
  "evidenceRefs may contain only evidenceId values from patientContext.evidence; do not invent IDs.",
  "For anchorType text, quote must be an exact non-empty substring of the selected field text.",
  "For anchorType field, quote should be an empty string unless an exact supporting substring is available.",
  "When anchors are present, each item must contain fieldName, fieldCode, fieldId, documentId, documentTitle, anchorType, and quote.",
  "When a finding compares 主诉 and 现病史, include two text anchors when both source fields support the finding; make the first anchor the top-level primary anchor.",
  "For missing information, include one field anchor with an empty quote and do not invent quote text.",
  "If a medical guideline, coding authority, or insurance rule needed for a conclusion is not present in the supplied local context, do not claim it was searched or reached a definitive violation; return qualityType insufficient_evidence and state what evidence/source is missing.",
  "Treat deterministicRules as separate local results, not as permission to override them. Findings based only on a field anchor must be framed as a documentation prompt, not a clinical diagnosis.",
  "Do not propose automatic edits; suggestions are for human review.",
  "When reviewFields is present, review only those text segments for standalone findings and use fields as the complete cross-field context; cross-field findings may anchor other fields, but do not repeat standalone findings for fields outside reviewFields.",
].join(" ");

function buildQcMessages(input) {
  return [
    { role: "system", content: QC_SYSTEM_PROMPT },
    {
      role: "user",
      content: JSON.stringify({
        documentTitle: input.documentTitle,
        principalDiagnosis: input.principalDiagnosis,
        scopes: input.scopes,
        qualityTypes: input.qualityTypes,
        fields: input.contextFields || input.fields,
        ...(input.reviewFields ? { reviewFields: input.reviewFields } : {}),
        patientContext: input.patientContext,
        knowledgeCoverage: {
          sameEpisodeEvidence: "provided_if_available",
          localDocumentRules: "provided_if_available",
          medicalGuidelines: "not_integrated",
          completeCodingAuthority: "not_integrated",
          nhsaInsuranceTwoLibraries: "not_integrated",
          drgDipGroupingRules: "separate_module_not_called_by_document_qc",
        },
      }),
    },
  ];
}

function parseJsonContent(content) {
  if (isPlainObject(content)) return content;
  if (typeof content !== "string") throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "模型返回了无效结果。");
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  try {
    return JSON.parse(fenced ? fenced[1] : trimmed);
  } catch {
    throw new ApiError(502, "MODEL_JSON_INVALID", "模型返回内容不是可解析的 JSON。");
  }
}

const severityAliases = new Map([
  ["critical", "critical"],
  ["error", "critical"],
  ["high", "critical"],
  ["warning", "warning"],
  ["medium", "warning"],
  ["info", "info"],
  ["notice", "info"],
  ["low", "info"],
]);

function validateAnchor(anchor, fields) {
  if (!isPlainObject(anchor)) throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "模型返回了无效结果。");
  const allowedKeys = new Set(["fieldName", "fieldCode", "fieldId", "documentId", "documentTitle", "anchorType", "quote"]);
  if (Object.keys(anchor).some((key) => !allowedKeys.has(key))) throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "模型返回了无效结果。");
  const fieldName = readNullableString(anchor.fieldName, 200);
  const fieldCode = readNullableString(anchor.fieldCode, 120);
  const fieldId = readNullableString(anchor.fieldId, 200);
  const documentId = readNullableString(anchor.documentId, 120);
  const anchorType = anchor.anchorType;
  const quote = anchor.quote === null || anchor.quote === undefined ? "" : readString(anchor.quote, 5_000, true);
  if (anchorType !== "text" && anchorType !== "field") {
    throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "模型返回了无效结果。");
  }
  const target = fields.find((field) => {
    if (fieldName !== null && field.name !== fieldName) return false;
    if (fieldCode !== null && field.code !== fieldCode) return false;
    if (fieldId !== null && field.fieldId !== fieldId) return false;
    if (documentId !== null && field.documentId !== documentId) return false;
    return fieldName !== null || fieldCode !== null || fieldId !== null;
  });
  if (!target || (anchorType === "text" && (!quote || !target.text.includes(quote)))) {
    throw new ApiError(502, "MODEL_EVIDENCE_INVALID", "模型引用的原文片段无法与送检字段核验。");
  }
  if (anchorType === "field" && quote && !target.text.includes(quote)) {
    throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "模型返回了无效结果。");
  }
  return {
    fieldName: target.name,
    fieldCode: target.code,
    fieldId: target.fieldId,
    documentId: target.documentId,
    documentTitle: target.documentTitle,
    anchorType,
    quote,
  };
}

function validateFindings(modelResponse, fields, patientContext = { evidence: [] }) {
  if (!isPlainObject(modelResponse) || !Array.isArray(modelResponse.findings)) {
    throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "模型返回了无效结果。");
  }
  return modelResponse.findings.map((finding) => {
    if (!isPlainObject(finding)) throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "模型返回了无效结果。");
    const severity = severityAliases.get(String(finding.severity || "").trim().toLowerCase());
    const anchorType = finding.anchorType;
    const validQualityTypes = new Set(["completeness", "consistency", "chronology", "medical_reasonableness", "coding", "insurance_grouping", "insufficient_evidence"]);
    const rawQualityType = String(finding.qualityType || "").trim().toLowerCase();
    const qualityType = validQualityTypes.has(rawQualityType) ? rawQualityType
      : /缺少|必填|未填写|遗漏/.test(`${finding.title || ""}${finding.message || ""}`) ? "completeness"
        : /不一致|冲突|矛盾/.test(`${finding.title || ""}${finding.message || ""}`) ? "consistency"
          : /时间|日期|先后|时序/.test(`${finding.title || ""}${finding.message || ""}`) ? "chronology"
            : /编码|ICD/.test(`${finding.title || ""}${finding.message || ""}`) ? "coding" : "medical_reasonableness";
    const fieldCode = readNullableString(finding.fieldCode, 120);
    const fieldId = readNullableString(finding.fieldId, 200);
    const requestedDocumentId = readNullableString(finding.documentId, 120);
    const quote = finding.quote === null || finding.quote === undefined ? "" : readString(finding.quote, 5_000, true);
    if (!severity || anchorType !== "text" && anchorType !== "field") {
      throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "模型返回了无效结果。");
    }
    const target = fields.find((field) => {
      if (fieldCode !== null && fieldId !== null) return field.code === fieldCode && field.fieldId === fieldId;
      if (fieldCode !== null) return field.code === fieldCode;
      if (fieldId !== null) return field.fieldId === fieldId;
      return false;
    });
    const scopedTarget = requestedDocumentId
      ? fields.find((field) => field.documentId === requestedDocumentId
        && (fieldCode === null || field.code === fieldCode)
        && (fieldId === null || field.fieldId === fieldId))
      : target;
    if (anchorType === "text" && (!scopedTarget || !quote || !scopedTarget.text.includes(quote))) {
      throw new ApiError(502, "MODEL_EVIDENCE_INVALID", "模型引用的原文片段无法与送检字段核验。");
    }
    if (anchorType === "field" && quote && scopedTarget && !scopedTarget.text.includes(quote)) {
      throw new ApiError(502, "MODEL_EVIDENCE_INVALID", "模型引用的原文片段无法与送检字段核验。");
    }
    if (anchorType === "field" && quote && !scopedTarget) {
      throw new ApiError(502, "MODEL_EVIDENCE_INVALID", "模型引用的原文片段无法与送检字段核验。");
    }
    const anchors = finding.anchors === undefined
      ? scopedTarget ? [{ fieldName: scopedTarget.name, fieldCode: scopedTarget.code, fieldId: scopedTarget.fieldId, documentId: scopedTarget.documentId, documentTitle: scopedTarget.documentTitle, anchorType, quote }] : []
      : (() => {
        if (!Array.isArray(finding.anchors)) {
          throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "模型返回了无效结果。");
        }
        return finding.anchors.map((anchor) => validateAnchor(anchor, fields));
      })();
    const evidenceIds = new Set(patientContext.evidence.map((item) => item.evidenceId));
    const evidenceRefs = finding.evidenceRefs === undefined ? [] : (() => {
      if (!Array.isArray(finding.evidenceRefs)) throw new ApiError(502, "MODEL_EVIDENCE_INVALID", "模型返回的病例证据引用无效。");
      const refs = finding.evidenceRefs.map((ref) => readString(ref, 80));
      if (refs.some((ref) => !evidenceIds.has(ref))) throw new ApiError(502, "MODEL_EVIDENCE_INVALID", "模型引用了本次证据集之外的材料。");
      return [...new Set(refs)];
    })();
    if (!anchors.length && !evidenceRefs.length) throw new ApiError(502, "MODEL_EVIDENCE_INVALID", "模型结果没有可核验的文书或病例证据锚点。");
    if ((fieldCode !== null || fieldId !== null) && anchors.length > 0 && !anchors.some((anchor) => (
      (fieldCode === null || anchor.fieldCode === fieldCode)
      && (fieldId === null || anchor.fieldId === fieldId)
      && (!requestedDocumentId || anchor.documentId === requestedDocumentId)
      && anchor.anchorType === anchorType
      && (!quote || anchor.quote === quote)
    ))) {
      throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "模型返回了无效结果。");
    }
    return {
      severity,
      title: readString(finding.title, 240),
      message: readString(finding.message, 2_000),
      fieldCode,
      fieldId,
      documentId: scopedTarget?.documentId || anchors[0]?.documentId || null,
      documentTitle: scopedTarget?.documentTitle || anchors[0]?.documentTitle || null,
      anchorType,
      quote,
      anchors,
      qualityType,
      evidenceRefs,
      evidenceStatus: ["sufficient", "limited", "insufficient"].includes(finding.evidenceStatus)
        ? finding.evidenceStatus : evidenceRefs.length ? "sufficient" : anchors.some((anchor) => anchor.anchorType === "text") ? "limited" : "insufficient",
      allowAutoEdit: false,
      evidence: readString(finding.evidence, 2_000),
      rationale: readString(finding.rationale, 2_000),
      suggestion: readString(finding.suggestion, 2_000),
    };
  });
}

function completionEndpoint(config) {
  const url = new URL(config.baseUrl);
  if (config.protocol === "azure-openai") {
    if (/\/chat\/completions\/?$/i.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/YOUR_DEPLOYMENT(?=\/)/i, `/${encodeURIComponent(config.modelId)}`);
    } else {
      url.pathname = `${url.pathname.replace(/\/$/, "")}/openai/deployments/${encodeURIComponent(config.modelId)}/chat/completions`;
      if (!url.searchParams.has("api-version")) url.searchParams.set("api-version", "2024-10-21");
    }
    return url.toString();
  }
  if (!/\/chat\/completions\/?$/i.test(url.pathname)) {
    url.pathname = `${url.pathname.replace(/\/$/, "")}/chat/completions`;
  }
  return url.toString();
}

async function requestModelCompletion(config, messages, fetchImpl, { json = false, maxTokens = 4_096 } = {}) {
  if (typeof fetchImpl !== "function") throw new ApiError(502, "UPSTREAM_UNAVAILABLE", "模型服务不可用。");
  if (!config.apiKey && config.protocol !== "ollama") throw new ApiError(503, "API_KEY_MISSING", "请先在模型设置中配置 API Key。");
  const headers = { "Content-Type": "application/json" };
  if (config.apiKey) {
    if (config.protocol === "azure-openai") headers["api-key"] = config.apiKey;
    else headers.Authorization = `Bearer ${config.apiKey}`;
  }
  const body = {
    messages,
    temperature: 0.1,
    max_tokens: maxTokens,
    ...(config.protocol === "azure-openai" ? {} : { model: config.modelId }),
    ...(json ? { response_format: { type: "json_object" } } : {}),
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let response;
  try {
    response = await fetchImpl(completionEndpoint(config), {
      method: "POST", headers, body: JSON.stringify(body), signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) throw new ApiError(504, "UPSTREAM_TIMEOUT", "模型请求超时，请稍后重试。");
    throw new ApiError(502, "UPSTREAM_UNAVAILABLE", "无法连接模型服务，请检查 Base URL 和本地网络。");
  } finally {
    clearTimeout(timeout);
  }
  const status = Number(response?.status);
  const ok = response?.ok === true || (Number.isInteger(status) && status >= 200 && status < 300);
  if (!ok) {
    if (status === 401 || status === 403) throw new ApiError(502, "MODEL_AUTH_FAILED", "连接失败：API Key 无效或没有调用权限。");
    if (status === 404) throw new ApiError(502, "MODEL_ENDPOINT_NOT_FOUND", "连接失败：接口地址或模型 ID 不存在，请检查配置。");
    if (status === 429) throw new ApiError(502, "MODEL_RATE_LIMITED", "连接失败：模型服务限流，请稍后再试。");
    throw new ApiError(502, "MODEL_UPSTREAM_ERROR", `模型服务返回错误（HTTP ${status || "未知"}），请检查厂商协议和模型配置。`);
  }
  let raw;
  try { raw = await response.text(); } catch { throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "模型返回了无效结果。"); }
  if (typeof raw !== "string" || raw.length > MAX_UPSTREAM_RESPONSE_BYTES) {
    throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "模型返回结果无效或超出大小限制。");
  }
  try { return JSON.parse(raw); } catch { throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "模型返回了无效结果。"); }
}

async function requestConfiguredModelOnce(input, modelStore, fetchImpl) {
  const config = modelStore.get(input.modelConfigId);
  if (!config) throw new ApiError(404, "MODEL_NOT_FOUND", "当前模型配置不存在，请在模型设置中重新选择。");
  if (!config.enabled) throw new ApiError(409, "MODEL_DISABLED", "当前模型已停用，请在模型设置中启用后再运行。");
  try {
    const envelope = await requestModelCompletion(config, buildQcMessages(input), fetchImpl, { json: true, maxTokens: config.provider === "deepseek" ? 65_536 : 16_384 });
    const choice = envelope?.choices?.[0];
    const finishReason = String(choice?.finish_reason || "unknown");
    if (finishReason === "length") {
      throw new ApiError(502, "MODEL_OUTPUT_TRUNCATED", "模型输出未完整返回，系统将自动拆分并继续核查。", {
        failedStage: "model_output", modelCallStatus: "truncated", usage: envelope?.usage || {},
      });
    }
    const content = choice?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new ApiError(502, "MODEL_OUTPUT_EMPTY", "模型没有返回质控正文。", { failedStage: "model_output", modelCallStatus: "empty" });
    }
    let parsed;
    try { parsed = parseJsonContent(content); }
    catch (error) {
      if (error instanceof ApiError) error.trace = { failedStage: "json_parse", modelCallStatus: "returned" };
      throw error;
    }
    let findings;
    const contextFields = input.contextFields || input.fields;
    try { findings = validateFindings(parsed, contextFields, input.patientContext); }
    catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        throw new ApiError(502, "MODEL_SCHEMA_INVALID", "模型返回结果缺少必需字段或字段类型不符合接口约定。", { failedStage: "schema_validation", modelCallStatus: "returned" });
      }
      if (error instanceof ApiError && !error.trace) {
        error.trace = { failedStage: error.code === "MODEL_EVIDENCE_INVALID" ? "evidence_validation" : "schema_validation", modelCallStatus: "returned" };
      }
      throw error;
    }
    const usage = envelope?.usage || {};
    const evidenceSourceCounts = input.patientContext.evidence.reduce((counts, item) => ({ ...counts, [item.sourceType]: (counts[item.sourceType] || 0) + 1 }), {});
    return {
      findings,
      trace: {
        input: {
          documentCount: new Set(contextFields.map((field) => field.documentId)).size,
          fieldCount: contextFields.length,
          emptyFieldCount: contextFields.filter((field) => !field.text.trim()).length,
        },
        patientContext: {
          evidenceCount: input.patientContext.evidence.length,
          factCount: input.patientContext.facts.length,
          conflictCount: input.patientContext.conflicts.length,
          ruleCount: input.patientContext.deterministicRules.length,
          detail: `本机验证并接收 ${input.patientContext.evidence.length} 条同次住院证据、${input.patientContext.facts.length} 项 ClinicalFact、${input.patientContext.conflicts.length} 项冲突和 ${input.patientContext.deterministicRules.length} 条本地规则结果。`,
        },
        retrievals: [
          { title: "患者证据库（本次住院）", status: input.patientContext.evidence.length ? "done" : "insufficient", detail: `${input.patientContext.evidence.length} 条材料；${Object.entries(evidenceSourceCounts).map(([source, count]) => `${source} ${count}`).join("、") || "无可用证据"}` },
          { title: "医院质控规则", status: "done", detail: `本地确定性文书规则结果 ${input.patientContext.deterministicRules.length} 条。` },
          { title: "医学知识库", status: "not_configured", detail: "未接入医学规范/指南库，本次没有检索指南。" },
          { title: "编码映射规则", status: input.patientContext.facts.some((item) => /diagnosis|procedure/i.test(item.concept)) ? "partial" : "not_configured", detail: "仅使用本地 ClinicalFact 字段映射；未调用完整 ICD 权威编码库。" },
          { title: "医保规则库", status: "not_configured", detail: "国家医保监管“两库”未接入；DRG/DIP 3.0 分组规则属于独立分组流程，本次未调用。" },
        ],
        model: { name: config.name, modelId: config.modelId },
        modelCall: {
          finishReason,
          usage: {
            prompt_tokens: Number.isFinite(usage.prompt_tokens) ? usage.prompt_tokens : null,
            completion_tokens: Number.isFinite(usage.completion_tokens) ? usage.completion_tokens : null,
            total_tokens: Number.isFinite(usage.total_tokens) ? usage.total_tokens : null,
          },
        },
        validation: {
          findingCount: findings.length,
          anchorCount: findings.reduce((sum, item) => sum + item.anchors.length, 0),
          evidenceRefCount: findings.reduce((sum, item) => sum + item.evidenceRefs.length, 0),
        },
      },
    };
  } catch (error) {
    const apiError = error instanceof ApiError ? error : new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "模型调用失败。");
    if (!apiError.trace) {
      const outputReturned = ["MODEL_JSON_INVALID", "MODEL_SCHEMA_INVALID", "MODEL_EVIDENCE_INVALID", "MODEL_OUTPUT_EMPTY", "MODEL_OUTPUT_TRUNCATED"].includes(apiError.code);
      apiError.trace = {
        failedStage: apiError.code === "MODEL_JSON_INVALID" ? "json_parse"
          : apiError.code === "MODEL_SCHEMA_INVALID" ? "schema_validation"
            : apiError.code === "MODEL_EVIDENCE_INVALID" ? "evidence_validation"
              : outputReturned ? "model_output" : "model_request",
        modelCallStatus: apiError.code === "MODEL_OUTPUT_TRUNCATED" ? "truncated"
          : apiError.code === "MODEL_OUTPUT_EMPTY" ? "empty"
            : outputReturned ? "returned" : ["MODEL_NOT_FOUND", "MODEL_DISABLED", "API_KEY_MISSING"].includes(apiError.code) ? "not_started" : "failed_or_unconfirmed",
      };
    }
    throw apiError;
  }
}

function qcFieldKey(field) {
  return `${field.documentId}\u0000${field.fieldId}`;
}

function findingKey(finding) {
  return JSON.stringify([
    finding.severity, finding.qualityType, finding.title, finding.message,
    finding.anchors.map((anchor) => [anchor.documentId, anchor.fieldId, anchor.anchorType, anchor.quote]),
    finding.evidenceRefs,
  ]);
}

function sumUsage(results, failedUsage = []) {
  const names = ["prompt_tokens", "completion_tokens", "total_tokens"];
  return Object.fromEntries(names.map((name) => {
    const values = [...results.map((result) => result.trace.modelCall.usage[name]), ...failedUsage.map((usage) => usage?.[name])]
      .filter(Number.isFinite);
    return [name, values.length ? values.reduce((sum, value) => sum + value, 0) : null];
  }));
}

function combineQcResults(results, originalInput, requestCount, failedUsage = []) {
  const findings = [...new Map(results.flatMap((result) => result.findings).map((finding) => [findingKey(finding), finding])).values()];
  const trace = structuredClone(results[0].trace);
  trace.input = {
    documentCount: new Set(originalInput.fields.map((field) => field.documentId)).size,
    fieldCount: originalInput.fields.length,
    emptyFieldCount: originalInput.fields.filter((field) => !field.text.trim()).length,
  };
  trace.patientContext = {
    evidenceCount: originalInput.patientContext.evidence.length,
    factCount: originalInput.patientContext.facts.length,
    conflictCount: originalInput.patientContext.conflicts.length,
    ruleCount: originalInput.patientContext.deterministicRules.length,
    detail: `本次完整提交 ${originalInput.patientContext.evidence.length} 条证据、${originalInput.patientContext.facts.length} 项 ClinicalFact、${originalInput.patientContext.conflicts.length} 项冲突和 ${originalInput.patientContext.deterministicRules.length} 条本地规则结果。`,
  };
  trace.modelCall = { ...trace.modelCall, finishReason: "stop", usage: sumUsage(results, failedUsage) };
  trace.validation = {
    findingCount: findings.length,
    anchorCount: findings.reduce((sum, item) => sum + item.anchors.length, 0),
    evidenceRefCount: findings.reduce((sum, item) => sum + item.evidenceRefs.length, 0),
  };
  trace.processing = { automaticallySplit: true, requestCount };
  return { findings, trace };
}

async function requestConfiguredModel(input, modelStore, fetchImpl) {
  try {
    return await requestConfiguredModelOnce(input, modelStore, fetchImpl);
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "MODEL_OUTPUT_TRUNCATED") throw error;
    const contextFields = input.contextFields || input.fields;
    let parts;
    if (input.fields.length > 1) {
      const midpoint = Math.ceil(input.fields.length / 2);
      parts = [input.fields.slice(0, midpoint), input.fields.slice(midpoint)];
    } else {
      const field = input.fields[0];
      const text = Array.from(field.text);
      if (text.length < 2) {
        throw new ApiError(502, "MODEL_OUTPUT_UNRECOVERABLE", "模型连续返回未完整结果；系统已自动拆分并重试，仍无法完成结构校验。请稍后重试或检查模型服务状态。", {
          ...error.trace, failedStage: "model_output", modelCallStatus: "truncated",
        });
      }
      const midpoint = Math.ceil(text.length / 2);
      parts = [[{ ...field, text: text.slice(0, midpoint).join("") }], [{ ...field, text: text.slice(midpoint).join("") }]];
    }
    const results = [];
    let requestCount = 1;
    for (const fields of parts) {
      const result = await requestConfiguredModel({
        ...input,
        fields,
        contextFields,
        reviewFields: fields,
      }, modelStore, fetchImpl);
      results.push(result);
      requestCount += result.trace.processing?.requestCount || 1;
    }
    return combineQcResults(results, { ...input, fields: contextFields }, requestCount, [error.trace?.usage]);
  }
}

async function handleQualityControl(req, res, fetchImpl, modelStore) {
  const input = validateQcInput(await readJsonRequest(req));
  const result = await requestConfiguredModel(input, modelStore, fetchImpl);
  sendJson(res, 200, result);
}

function ensureEnvironmentModel(modelStore) {
  const environmentKey = typeof process.env.DEEPSEEK_API_KEY === "string" ? process.env.DEEPSEEK_API_KEY.trim() : "";
  if (!environmentKey || [...modelStore.values()].some((model) => model.provider === "deepseek")) return;
  modelStore.set("deepseek-env", {
    id: "deepseek-env", name: "DeepSeek Flash", provider: "deepseek", protocol: "openai-compatible",
    baseUrl: "https://api.deepseek.com", modelId: "deepseek-flash", apiKey: environmentKey,
    enabled: true, isDefault: modelStore.size === 0, connected: false,
  });
}

async function handleModelRoutes(req, res, { fetchImpl, modelStore, testedConfigs }) {
  const pathname = req.url.split("?", 1)[0];
  if (req.method === "GET" && pathname === AI_MODELS_PATH) {
    ensureEnvironmentModel(modelStore);
    sendJson(res, 200, { models: [...modelStore.values()].map(safeModelConfig) });
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "请使用 POST 提交模型配置。" } });
    return;
  }
  try {
    const input = validateModelConfig(await readJsonRequest(req));
    const existing = modelStore.get(input.id);
    const config = { ...input, apiKey: input.apiKey || existing?.apiKey || "", connected: false };
    if (pathname === AI_MODEL_TEST_PATH) {
      const envelope = await requestModelCompletion(config, [{ role: "user", content: "请仅回复 OK。" }], fetchImpl, { maxTokens: 8 });
      if (!envelope?.choices?.length) throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "连接失败：模型没有返回有效内容。");
      testedConfigs.set(config.id, modelSignature(config));
      sendJson(res, 200, { connected: true });
      return;
    }
    if (pathname !== AI_MODELS_PATH) { sendNotFound(res); return; }
    if (config.isDefault) {
      for (const [id, model] of modelStore) if (id !== config.id) modelStore.set(id, { ...model, isDefault: false });
    }
    config.connected = testedConfigs.get(config.id) === modelSignature(config)
      || Boolean(existing?.connected && modelSignature(existing) === modelSignature(config));
    testedConfigs.delete(config.id);
    modelStore.set(config.id, config);
    sendJson(res, 200, { models: [...modelStore.values()].map(safeModelConfig) });
  } catch (error) {
    if (res.headersSent) { res.destroy(); return; }
    const apiError = error instanceof ApiError ? error : new ApiError(500, "INTERNAL_ERROR", "模型配置无法保存。");
    sendJson(res, apiError.status, { error: { code: apiError.code, message: apiError.message } });
  }
}

async function serveStatic(pathname, res) {
  try {
    if (pathname === "/") pathname = "/index.html";
    let full;
    if (pathname.startsWith("/hm-editor-runtime/")) {
      const relative = pathname.slice("/hm-editor-runtime/".length);
      const runtimeRoot = join(root, "vendor", "hm_editor");
      for (const basePath of [join(runtimeRoot, "editorDist"), runtimeRoot]) {
        const base = resolve(basePath);
        const candidate = resolve(base, relative);
        if (candidate !== base && !candidate.startsWith(`${base}${sep}`)) continue;
        try {
          const info = await stat(candidate);
          if (info.isFile()) { full = candidate; break; }
        } catch {}
      }
      if (!full) throw new Error("runtime asset not found");
    } else {
      full = normalize(join(root, pathname));
      if (!full.startsWith(root)) throw new Error("forbidden");
    }
    const info = await stat(full);
    if (!info.isFile()) throw new Error("not file");
    const data = await readFile(full);
    res.writeHead(200, { "Content-Type": mime[extname(full)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  } catch (_) {
    sendNotFound(res);
  }
}

export async function handleRequest(req, res, { fetchImpl = globalThis.fetch, modelStore = new Map(), testedConfigs = new Map() } = {}) {
  let pathname;
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendNotFound(res);
    return;
  }
  if (pathname === AI_MODELS_PATH || pathname === AI_MODEL_TEST_PATH) {
    await handleModelRoutes(req, res, { fetchImpl, modelStore, testedConfigs });
    return;
  }
  if (pathname === QC_PATH) {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Use POST for medical record quality control." } });
      return;
    }
    try {
      await handleQualityControl(req, res, fetchImpl, modelStore);
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const apiError = error instanceof ApiError ? error : new ApiError(500, "INTERNAL_ERROR", "The request could not be completed.");
      sendJson(res, apiError.status, { error: { code: apiError.code, message: apiError.message, trace: apiError.trace || undefined } });
    }
    return;
  }
  await serveStatic(pathname, res);
}

export function createAppServer(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const modelStore = options.modelStore || new Map();
  const testedConfigs = new Map();
  return createServer((req, res) => {
    handleRequest(req, res, { fetchImpl, modelStore, testedConfigs }).catch(() => {
      if (!res.headersSent) sendJson(res, 500, { error: { code: "INTERNAL_ERROR", message: "The request could not be completed." } });
      else res.destroy();
    });
  });
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMainModule) {
  createAppServer().listen(port, "127.0.0.1", () => {
    console.log(`Medical System MVP: http://127.0.0.1:${port}`);
  });
}
