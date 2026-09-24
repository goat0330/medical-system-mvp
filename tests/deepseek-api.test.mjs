import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createAppServer } from "../server.mjs";

const keySetupScript = readFileSync(new URL("../scripts/configure-deepseek-key.ps1", import.meta.url), "utf8");
const keySetupLauncher = readFileSync(new URL("../scripts/configure-deepseek-key.bat", import.meta.url), "utf8");
assert.match(keySetupScript, /System\.Windows\.Forms\.TextBox/);
assert.match(keySetupScript, /UseSystemPasswordChar\s*=\s*\$true/);
assert.doesNotMatch(keySetupScript, /Read-Host/);
assert.match(keySetupLauncher, /-STA/);

const config = (apiKey = "test-only-key") => ({
  id: "test-model",
  name: "DeepSeek test",
  provider: "deepseek",
  protocol: "openai-compatible",
  baseUrl: "https://api.deepseek.com/v1",
  apiKey,
  modelId: "deepseek-chat",
  enabled: true,
  isDefault: true,
});

const input = {
  modelConfigId: "test-model",
  episodeId: "EP-TEST-001",
  documentId: "admission",
  documentTitle: "入院记录",
  principalDiagnosis: { name: "社区获得性肺炎", code: "J18.9" },
  scopes: { currentDocument: true, relatedDocuments: false, frontpageFields: false },
  qualityTypes: ["completeness", "consistency", "medical_reasonableness"],
  fields: [
    { name: "现病史", code: "HISTORY", fieldId: "history", documentId: "admission", documentTitle: "入院记录", text: "患者咳嗽3天，无发热。" },
    { name: "主诉", code: "CHIEF_COMPLAINT", fieldId: "chief-complaint", documentId: "admission", documentTitle: "入院记录", text: "咳嗽3天。" },
  ],
  patientContext: {
    evidence: [{ evidenceId: "QC-EV-1", sourceType: "LIS", documentTitle: "血常规", fieldName: "白细胞", fieldCode: "WBC", concept: "lab.wbc", value: "8.1", eventTime: "2026-09-23", excerpt: "白细胞 8.1×10^9/L" }],
    facts: [{ concept: "lab.wbc", value: "8.1", status: "CONFIRMED", evidenceIds: ["QC-EV-1"] }],
    conflicts: [],
    deterministicRules: [{ code: "RULE-1", severity: "warning", fieldName: "现病史", fieldCode: "HISTORY", fieldId: "history", message: "本地规则提示需补充症状演变。" }],
  },
};

async function startServer(fetchImpl, models = [config()]) {
  const modelStore = new Map(models.map((model) => [model.id, model]));
  const server = createAppServer({ fetchImpl, modelStore });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function postJson(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { response, text, json: JSON.parse(text) };
}

const postQc = (baseUrl, body) => postJson(baseUrl, "/api/medical-record-qc", body);

function mockResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return typeof payload === "string" ? payload : JSON.stringify(payload); },
  };
}

test("missing configured key returns a clear 503 without calling the model", async () => {
  let called = false;
  const { server, baseUrl } = await startServer(async () => {
    called = true;
    throw new Error("network must not be reached");
  }, [config("")]);
  try {
    const result = await postQc(baseUrl, input);
    assert.equal(result.response.status, 503);
    assert.equal(result.json.error.code, "API_KEY_MISSING");
    assert.equal(called, false);
  } finally {
    await closeServer(server);
  }
});

test("invalid and oversized input are rejected before the upstream call", async () => {
  let called = false;
  const { server, baseUrl } = await startServer(async () => {
    called = true;
    throw new Error("upstream must not be reached");
  });
  try {
    const invalid = await postQc(baseUrl, { ...input, fields: [{ ...input.fields[0], unexpected: "blocked" }] });
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.json.error.code, "INVALID_INPUT");

    const oversized = await postQc(baseUrl, {
      ...input,
      fields: Array.from({ length: 1_500 }, (_, index) => ({ ...input.fields[0], fieldId: `field-${index}`, text: "x".repeat(12_000) })),
    });
    assert.equal(oversized.response.status, 413);
    assert.equal(oversized.json.error.code, "PAYLOAD_TOO_LARGE");
    assert.equal(called, false);
  } finally {
    await closeServer(server);
  }
});

test("configured DeepSeek model returns source-grounded findings", async () => {
  let requestUrl;
  let requestOptions;
  const finding = {
    qualityType: "consistency",
    severity: "warning",
    title: "现病史信息可补充",
    message: "现病史缺少对症状演变的描述。",
    fieldCode: "HISTORY",
    fieldId: "history",
    anchorType: "text",
    quote: "咳嗽",
    evidence: "现病史原文包含“咳嗽3天”。",
    rationale: "症状持续时间已给出，但演变信息不足。",
    suggestion: "请由医生补充症状演变及伴随症状。",
    evidenceRefs: ["QC-EV-1"],
    evidenceStatus: "sufficient",
  };
  const { server, baseUrl } = await startServer(async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return mockResponse({ choices: [{ message: { content: JSON.stringify({ findings: [finding] }) } }] });
  });
  try {
    const result = await postQc(baseUrl, input);
    assert.equal(result.response.status, 200);
    assert.equal(result.json.findings.length, 1);
    assert.equal(result.json.findings[0].title, finding.title);
    assert.equal(result.json.findings[0].documentId, "admission");
    assert.equal(result.json.findings[0].anchors[0].documentTitle, "入院记录");
    assert.equal(result.json.findings[0].qualityType, "consistency");
    assert.deepEqual(result.json.findings[0].evidenceRefs, ["QC-EV-1"]);
    assert.equal(result.json.findings[0].allowAutoEdit, false);
    assert.equal(result.json.trace.patientContext.evidenceCount, 1);
    assert.equal(result.json.trace.model.modelId, "deepseek-chat");
    assert.equal(result.json.trace.retrievals.find((item) => item.title === "医保规则库").status, "not_configured");
    assert.equal(requestUrl, "https://api.deepseek.com/v1/chat/completions");
    assert.equal(requestOptions.method, "POST");
    assert.equal(requestOptions.headers.Authorization, "Bearer test-only-key");
    const upstreamBody = JSON.parse(requestOptions.body);
    assert.equal(upstreamBody.model, "deepseek-chat");
    assert.equal(upstreamBody.response_format.type, "json_object");
    assert.deepEqual(JSON.parse(upstreamBody.messages[1].content), {
      documentTitle: input.documentTitle,
      principalDiagnosis: input.principalDiagnosis,
      scopes: input.scopes,
      qualityTypes: input.qualityTypes,
      fields: input.fields,
      patientContext: input.patientContext,
      knowledgeCoverage: {
        sameEpisodeEvidence: "provided_if_available",
        localDocumentRules: "provided_if_available",
        medicalGuidelines: "not_integrated",
        completeCodingAuthority: "not_integrated",
        nhsaInsuranceTwoLibraries: "not_integrated",
        drgDipGroupingRules: "separate_module_not_called_by_document_qc",
      },
    });
    assert.equal(upstreamBody.max_tokens, 65_536);
  } finally {
    await closeServer(server);
  }
});

test("configured API key is not forwarded in the prompt or response", async () => {
  const secret = "configured-test-secret";
  let requestOptions;
  const { server, baseUrl } = await startServer(async (_url, options) => {
    requestOptions = options;
    return mockResponse({ choices: [{ message: { content: JSON.stringify({ findings: [] }) } }] });
  }, [config(secret)]);
  try {
    const result = await postQc(baseUrl, input);
    assert.equal(result.response.status, 200);
    assert.equal(requestOptions.headers.Authorization, `Bearer ${secret}`);
    assert.equal(requestOptions.body.includes(secret), false);
    assert.equal(result.text.includes(secret), false);
  } finally {
    await closeServer(server);
  }
});

test("model test and save routes keep API keys out of returned model data", async () => {
  const secret = "model-config-secret";
  const { server, baseUrl } = await startServer(async () => mockResponse({ choices: [{ message: { content: "OK" } }] }), []);
  try {
    const tested = await postJson(baseUrl, "/api/ai/models/test", config(secret));
    assert.equal(tested.response.status, 200);
    assert.deepEqual(tested.json, { connected: true });

    const saved = await postJson(baseUrl, "/api/ai/models", config(secret));
    assert.equal(saved.response.status, 200);
    assert.equal(saved.json.models[0].connected, true);
    assert.equal(saved.json.models[0].apiKeyConfigured, true);
    assert.equal(JSON.stringify(saved.json).includes(secret), false);
    const listed = await fetch(`${baseUrl}/api/ai/models`);
    const listedText = await listed.text();
    assert.equal(listed.status, 200);
    assert.equal(listedText.includes(secret), false);
  } finally {
    await closeServer(server);
  }
});

test("invalid model anchors are not returned", async () => {
  const invalidFinding = {
    severity: "critical", title: "无效锚点", message: "测试", fieldCode: "HISTORY", fieldId: "history",
    anchorType: "text", quote: "不存在的原文", evidence: "测试", rationale: "测试", suggestion: "测试",
  };
  const { server, baseUrl } = await startServer(async () => mockResponse({ choices: [{ message: { content: JSON.stringify({ findings: [invalidFinding] }) } }] }));
  try {
    const result = await postQc(baseUrl, input);
    assert.equal(result.response.status, 502);
    assert.equal(result.json.error.code, "MODEL_EVIDENCE_INVALID");
    assert.equal(result.json.error.trace.failedStage, "evidence_validation");
  } finally {
    await closeServer(server);
  }
});

test("cross-field and missing-information anchors stay grounded in source fields", async () => {
  const findings = [
    {
      severity: "warning", title: "主诉与现病史可相互核对", message: "两处记录都提到咳嗽，但描述粒度不同。",
      fieldCode: "HISTORY", fieldId: "history", anchorType: "text", quote: "咳嗽",
      anchors: [
        { fieldName: "现病史", fieldCode: "HISTORY", fieldId: "history", anchorType: "text", quote: "咳嗽" },
        { fieldName: "主诉", fieldCode: "CHIEF_COMPLAINT", fieldId: "chief-complaint", anchorType: "text", quote: "咳嗽" },
      ],
      evidence: "主诉和现病史均有咳嗽原文。", rationale: "同一症状在两处文书中可进行一致性核对。", suggestion: "请由医生确认两处症状描述一致。",
    },
    {
      severity: "info", title: "补充现病史", message: "现病史缺少伴随症状描述。",
      fieldCode: "HISTORY", fieldId: "history", anchorType: "field", quote: "",
      anchors: [{ fieldName: "现病史", fieldCode: "HISTORY", fieldId: "history", anchorType: "field", quote: "" }],
      evidence: "现病史字段未提供伴随症状。", rationale: "缺少信息不能绑定到不存在的原文片段。", suggestion: "请由医生补充伴随症状。",
    },
  ];
  const { server, baseUrl } = await startServer(async () => mockResponse({ choices: [{ message: { content: JSON.stringify({ findings }) } }] }));
  try {
    const result = await postQc(baseUrl, input);
    assert.equal(result.response.status, 200);
    assert.equal(result.json.findings[0].anchors.length, 2);
    assert.equal(result.json.findings[0].anchors[1].documentId, "admission");
    assert.equal(result.json.findings[1].anchors.length, 1);
    assert.equal(result.json.findings[1].anchors[0].anchorType, "field");
    assert.equal(result.json.findings[1].anchors[0].quote, "");
  } finally {
    await closeServer(server);
  }
});

test("patient evidence citations must belong to this request", async () => {
  const finding = {
    severity: "warning", title: "引用越界", message: "不可引用未提交材料。", fieldCode: "HISTORY", fieldId: "history",
    anchorType: "text", quote: "咳嗽", evidenceRefs: ["OTHER-EPISODE-EVIDENCE"], evidence: "不可信", rationale: "不可信", suggestion: "医生核验。",
  };
  const { server, baseUrl } = await startServer(async () => mockResponse({ choices: [{ message: { content: JSON.stringify({ findings: [finding] }) } }] }));
  try {
    const result = await postQc(baseUrl, input);
    assert.equal(result.response.status, 502);
    assert.equal(result.json.error.code, "MODEL_EVIDENCE_INVALID");
    assert.equal(result.json.error.trace.failedStage, "evidence_validation");
  } finally {
    await closeServer(server);
  }
});

test("quality control accepts more than 500 fields and uncapped context arrays", async () => {
  let received;
  const expandedContext = {
    evidence: Array.from({ length: 75 }, (_, index) => ({
      evidenceId: `QC-EV-${index + 1}`, sourceType: "LIS", documentTitle: "检验报告", fieldName: `指标${index + 1}`,
      fieldCode: `LAB-${index + 1}`, concept: `lab.${index + 1}`, value: "正常", eventTime: "2026-09-23", excerpt: "检验结果正常",
    })),
    facts: Array.from({ length: 120 }, (_, index) => ({ concept: `lab.${index + 1}`, value: "正常", status: "CONFIRMED", evidenceIds: [`QC-EV-${index % 75 + 1}`] })),
    conflicts: Array.from({ length: 30 }, (_, index) => ({
      conflictId: `C-${index + 1}`, concept: `conflict.${index + 1}`, severity: "warning", blocking: false, reason: "需要人工核对",
      evidenceIds: Array.from({ length: 20 }, (_unused, refIndex) => `QC-EV-${(refIndex + index) % 75 + 1}`),
    })),
    deterministicRules: Array.from({ length: 30 }, (_, index) => ({ code: `RULE-${index + 1}`, severity: "warning", fieldName: "字段", fieldCode: "HISTORY", fieldId: "history", message: "本地规则提醒" })),
  };
  const expandedInput = {
    ...input,
    fields: Array.from({ length: 650 }, (_, index) => ({
      name: `字段${index + 1}`, code: `FIELD-${index + 1}`, fieldId: `field-${index + 1}`, documentId: "admission", documentTitle: "入院记录", text: `记录内容${index + 1}`,
    })),
    patientContext: expandedContext,
  };
  const { server, baseUrl } = await startServer(async (_url, options) => {
    received = JSON.parse(JSON.parse(options.body).messages[1].content);
    return mockResponse({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ findings: [] }) } }] });
  });
  try {
    const result = await postQc(baseUrl, expandedInput);
    assert.equal(result.response.status, 200);
    assert.equal(received.fields.length, 650);
    assert.equal(received.patientContext.evidence.length, 75);
    assert.equal(received.patientContext.facts.length, 120);
    assert.equal(received.patientContext.conflicts.length, 30);
    assert.equal(received.patientContext.conflicts[0].evidenceIds.length, 20);
    assert.equal(received.patientContext.deterministicRules.length, 30);
    assert.equal(result.json.trace.input.fieldCount, 650);
  } finally {
    await closeServer(server);
  }
});

test("truncated model output is automatically split and every field is reviewed", async () => {
  const fields = Array.from({ length: 73 }, (_, index) => ({
    name: `字段${index + 1}`, code: `FIELD-${index + 1}`, fieldId: `field-${index + 1}`, documentId: "admission", documentTitle: "入院记录", text: `原文${index + 1}`,
  }));
  const seenFieldIds = [];
  const { server, baseUrl } = await startServer(async (_url, options) => {
    const requestBody = JSON.parse(options.body);
    const prompt = JSON.parse(requestBody.messages[1].content);
    const reviewFields = prompt.reviewFields || prompt.fields;
    if (reviewFields.length > 1) return mockResponse({ choices: [{ finish_reason: "length", message: { content: "" } }] });
    const field = prompt.fields.find((item) => item.fieldId === reviewFields[0].fieldId);
    seenFieldIds.push(field.fieldId);
    const finding = {
      severity: "warning", title: `核查${field.name}`, message: `请核对${field.name}。`, fieldCode: field.code, fieldId: field.fieldId,
      documentId: field.documentId, anchorType: "text", quote: field.text, evidence: "与提交原文核对。", rationale: "回归测试。", suggestion: "请人工核验。",
    };
    return mockResponse({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ findings: [finding] }) } }] });
  });
  try {
    const result = await postQc(baseUrl, { ...input, fields });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.findings.length, 73);
    assert.deepEqual([...seenFieldIds].sort(), fields.map((field) => field.fieldId).sort());
    assert.equal(result.json.trace.input.fieldCount, 73);
    assert.equal(result.json.trace.processing.automaticallySplit, true);
    assert.equal(result.json.trace.processing.requestCount, 145);
  } finally {
    await closeServer(server);
  }
});

test("quality-control findings are not capped at 24", async () => {
  const fields = Array.from({ length: 30 }, (_, index) => ({
    name: `字段${index + 1}`, code: `FIELD-${index + 1}`, fieldId: `field-${index + 1}`, documentId: "admission", documentTitle: "入院记录", text: `原文${index + 1}`,
  }));
  const findings = fields.map((field) => ({
    severity: "info", title: `核查${field.name}`, message: `请关注${field.name}。`, fieldCode: field.code, fieldId: field.fieldId,
    documentId: field.documentId, anchorType: "text", quote: field.text, evidence: "核对原文。", rationale: "覆盖测试。", suggestion: "医生确认。",
  }));
  const { server, baseUrl } = await startServer(async () => mockResponse({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ findings }) } }] }));
  try {
    const result = await postQc(baseUrl, { ...input, fields });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.findings.length, 30);
  } finally {
    await closeServer(server);
  }
});

test("upstream errors do not echo the configured API key", async () => {
  const secret = "test-secret-must-not-return";
  const { server, baseUrl } = await startServer(async () => mockResponse(`upstream detail ${secret}`, 401), [config(secret)]);
  try {
    const result = await postQc(baseUrl, input);
    assert.equal(result.response.status, 502);
    assert.equal(result.json.error.code, "MODEL_AUTH_FAILED");
    assert.equal(result.text.includes(secret), false);
  } finally {
    await closeServer(server);
  }
});

test("existing static root route remains available", async () => {
  const { server, baseUrl } = await startServer(async () => { throw new Error("static route must not call the model"); });
  try {
    const response = await fetch(`${baseUrl}/`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /住院医疗|<title>/i);
  } finally {
    await closeServer(server);
  }
});

test("existing HmEditor runtime route remains available", async () => {
  const { server, baseUrl } = await startServer(async () => { throw new Error("runtime route must not call the model"); });
  try {
    const response = await fetch(`${baseUrl}/hm-editor-runtime/all.min.js`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /javascript/);
    assert.ok((await response.text()).length > 0);
  } finally {
    await closeServer(server);
  }
});
