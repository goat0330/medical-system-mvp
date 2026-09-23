import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./", import.meta.url));
const port = Number(process.argv[2] || 8765);
const QC_PATH = "/api/medical-record-qc";
const AI_MODELS_PATH = "/api/ai/models";
const AI_MODEL_TEST_PATH = "/api/ai/models/test";
const MAX_REQUEST_BYTES = 128 * 1024;
const MAX_UPSTREAM_RESPONSE_BYTES = 256 * 1024;
const MAX_FIELDS = 200;
const MAX_FINDINGS = 24;
const MAX_ANCHORS_PER_FINDING = 8;
const UPSTREAM_TIMEOUT_MS = 15_000;
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
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
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

function validateQcInput(input) {
  if (!isPlainObject(input)) throw new ApiError(400, "INVALID_INPUT", "Request shape is invalid.");
  const allowedKeys = new Set(["modelConfigId", "episodeId", "documentId", "documentTitle", "principalDiagnosis", "scopes", "fields"]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) throw new ApiError(400, "INVALID_INPUT", "Request shape is invalid.");
  if (!Array.isArray(input.fields) || input.fields.length === 0 || input.fields.length > MAX_FIELDS) {
    throw new ApiError(400, "INVALID_INPUT", "Request shape is invalid.");
  }
  if (!isPlainObject(input.scopes)) throw new ApiError(400, "INVALID_INPUT", "Request shape is invalid.");
  assertExactKeys(input.scopes, ["currentDocument", "relatedDocuments", "frontpageFields"]);
  const scopes = Object.fromEntries(Object.entries(input.scopes).map(([key, value]) => {
    if (typeof value !== "boolean") throw new ApiError(400, "INVALID_INPUT", "Request shape is invalid.");
    return [key, value];
  }));
  if (!Object.values(scopes).some(Boolean)) throw new ApiError(400, "QC_SCOPE_REQUIRED", "请至少选择一个质控范围。");
  return {
    modelConfigId: readString(input.modelConfigId, 120),
    episodeId: readString(input.episodeId, 200),
    documentId: readString(input.documentId, 120),
    documentTitle: readString(input.documentTitle, 200),
    principalDiagnosis: normalizePrincipalDiagnosis(input.principalDiagnosis),
    scopes,
    fields: input.fields.map((field) => {
      if (!isPlainObject(field)) throw new ApiError(400, "INVALID_INPUT", "Request shape is invalid.");
      const allowedFieldKeys = new Set(["name", "code", "fieldId", "text", "documentId", "documentTitle"]);
      if (Object.keys(field).some((key) => !allowedFieldKeys.has(key))) throw new ApiError(400, "INVALID_INPUT", "Request shape is invalid.");
      return {
        name: readString(field.name, 200),
        code: readString(field.code, 120),
        fieldId: readString(field.fieldId, 200),
        text: readString(field.text, 12_000, true),
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
  "Review only the selected document scopes, principal diagnosis, and supplied fields.",
  "Do not invent patient identity, bed, record ID, clinical facts, citations, or unsupported diagnoses.",
  "Return only a JSON object with one key, findings.",
  "Each finding must contain severity (critical, warning, or info), title, message, fieldCode, fieldId, anchorType (text or field), quote, evidence, rationale, and suggestion.",
  "Use fieldCode, fieldId, documentId, and documentTitle from the supplied fields, or null for a cross-field finding.",
  "For anchorType text, quote must be an exact non-empty substring of the selected field text.",
  "For anchorType field, quote should be an empty string unless an exact supporting substring is available.",
  "When anchors are present, each item must contain fieldName, fieldCode, fieldId, documentId, documentTitle, anchorType, and quote.",
  "When a finding compares 主诉 and 现病史, include two text anchors when both source fields support the finding; make the first anchor the top-level primary anchor.",
  "For missing information, include one field anchor with an empty quote and do not invent quote text.",
  "Do not propose automatic edits; suggestions are for human review.",
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
        fields: input.fields,
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
    throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "模型返回了无效结果。");
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
    throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "模型返回了无效结果。");
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

function validateFindings(modelResponse, fields) {
  if (!isPlainObject(modelResponse) || !Array.isArray(modelResponse.findings) || modelResponse.findings.length > MAX_FINDINGS) {
    throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "模型返回了无效结果。");
  }
  return modelResponse.findings.map((finding) => {
    if (!isPlainObject(finding)) throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "模型返回了无效结果。");
    const severity = severityAliases.get(String(finding.severity || "").trim().toLowerCase());
    const anchorType = finding.anchorType;
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
      throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "模型返回了无效结果。");
    }
    if (anchorType === "field" && quote && scopedTarget && !scopedTarget.text.includes(quote)) {
      throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "模型返回了无效结果。");
    }
    if (anchorType === "field" && quote && !scopedTarget) {
      throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "模型返回了无效结果。");
    }
    const anchors = finding.anchors === undefined
      ? scopedTarget ? [{ fieldName: scopedTarget.name, fieldCode: scopedTarget.code, fieldId: scopedTarget.fieldId, documentId: scopedTarget.documentId, documentTitle: scopedTarget.documentTitle, anchorType, quote }] : []
      : (() => {
        if (!Array.isArray(finding.anchors) || finding.anchors.length > MAX_ANCHORS_PER_FINDING) {
          throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "模型返回了无效结果。");
        }
        return finding.anchors.map((anchor) => validateAnchor(anchor, fields));
      })();
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

async function requestModelCompletion(config, messages, fetchImpl, { json = false, maxTokens = 1_600 } = {}) {
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

async function requestConfiguredModel(input, modelStore, fetchImpl) {
  const config = modelStore.get(input.modelConfigId);
  if (!config) throw new ApiError(404, "MODEL_NOT_FOUND", "当前模型配置不存在，请在模型设置中重新选择。");
  if (!config.enabled) throw new ApiError(409, "MODEL_DISABLED", "当前模型已停用，请在模型设置中启用后再运行。");
  const envelope = await requestModelCompletion(config, buildQcMessages(input), fetchImpl, { json: true });
  const content = envelope?.choices?.[0]?.message?.content;
  try {
    return validateFindings(parseJsonContent(content), input.fields);
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "模型返回结果不符合质控格式。");
    }
    throw error;
  }
}

async function handleQualityControl(req, res, fetchImpl, modelStore) {
  const input = validateQcInput(await readJsonRequest(req));
  const findings = await requestConfiguredModel(input, modelStore, fetchImpl);
  sendJson(res, 200, { findings });
}

function ensureEnvironmentModel(modelStore) {
  const environmentKey = typeof process.env.DEEPSEEK_API_KEY === "string" ? process.env.DEEPSEEK_API_KEY.trim() : "";
  if (!environmentKey || [...modelStore.values()].some((model) => model.provider === "deepseek")) return;
  modelStore.set("deepseek-env", {
    id: "deepseek-env", name: "DeepSeek", provider: "deepseek", protocol: "openai-compatible",
    baseUrl: "https://api.deepseek.com", modelId: "deepseek-chat", apiKey: environmentKey,
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
      sendJson(res, apiError.status, { error: { code: apiError.code, message: apiError.message } });
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
