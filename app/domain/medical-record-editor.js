import { lengthOfStay } from "../data/episode.js";
import { SETTLEMENT_SOURCE_FIELDS } from "./settlement.js";

const HMEDITOR_RUNTIME_BASE = "/hm-editor-runtime";
const HMEDITOR_EDITOR_ID = "medical-record-editor";
let hmEditorSdkPromise;

function norm(value) {
  return String(value ?? "")
    .replace(/[\s：:（）()\[\]【】_\-]/g, "")
    .replace(/代码$/, "代码")
    .toLowerCase();
}

function cleanAnchorText(value) {
  return String(value ?? "").replace(/[\u200b\ufeff]/g, "");
}

export function resolveUniqueTextAnchor(text, quote) {
  const source = cleanAnchorText(text);
  const target = cleanAnchorText(quote).trim();
  if (!target) return null;
  const start = source.indexOf(target);
  if (start < 0 || source.indexOf(target, start + 1) >= 0) return null;
  return { start, end: start + target.length };
}

function indexTextNodes(root) {
  const document = root?.ownerDocument;
  if (!root || !document) return { text: "", positions: [] };
  const walker = document.createTreeWalker(root, 4);
  const positions = [];
  let text = "";
  let node;
  while ((node = walker.nextNode())) {
    const value = node.nodeValue || "";
    for (let offset = 0; offset < value.length; offset += 1) {
      if (value[offset] === "\u200b" || value[offset] === "\ufeff") continue;
      text += value[offset];
      positions.push({ node, offset });
    }
  }
  return { text, positions };
}

function rangeForQuote(root, quote) {
  const index = indexTextNodes(root);
  const match = resolveUniqueTextAnchor(index.text, quote);
  if (!match) return null;
  const start = index.positions[match.start];
  const end = index.positions[match.end - 1];
  if (!start || !end) return null;
  const range = root.ownerDocument.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset + 1);
  return range;
}

function diagnosisText(dx) {
  if (!dx) return "";
  return dx.code ? `${dx.name}（${dx.code}）` : dx.name || "";
}

function factValue(context, concept, fallback) {
  if (!context) return fallback;
  const fact = context.facts?.find((item) => item.concept === concept);
  if (!fact) return fallback;
  return fact.status === "CONFIRMED" ? fact.value : undefined;
}

function hmDateTime(value) {
  if (!value) return value;
  const raw = String(value);
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) return raw.replace("T", " ").slice(0, 19);
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return raw.replace("T", " ").slice(0, 19);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(date);
}

function episodeFacts(episode, context = null) {
  const principal = episode.diagnoses?.principal || {};
  const baseProcedure = episode.procedures?.[0] || {};
  const procedure = {
    ...baseProcedure,
    name: factValue(context, "procedure.primary.name", baseProcedure.name),
    code: factValue(context, "procedure.primary.code", baseProcedure.code),
    anesthesiaType: factValue(context, "procedure.primary.anesthesiaType", baseProcedure.anesthesiaType),
  };
  const admissionAt = factValue(context, "admission.at", episode.admission?.at);
  const dischargeAt = factValue(context, "discharge.at", episode.discharge?.at);
  return [
    { aliases: ["医疗机构名称"], value: episode.institution?.name || "XX省第XX人民医院" },
    { aliases: ["姓名", "患者姓名"], value: factValue(context, "patient.name", episode.patient?.name) },
    { aliases: ["性别"], value: factValue(context, "patient.sex", episode.patient?.sex) },
    { aliases: ["出生日期"], value: factValue(context, "patient.birthDate", episode.patient?.birthDate) },
    { aliases: ["年龄"], value: (() => { const age = factValue(context, "patient.age", episode.patient?.age); return age !== undefined && age !== null ? `${age}岁` : ""; })() },
    { aliases: ["国籍"], value: factValue(context, "patient.nationality", episode.patient?.nationality) },
    { aliases: ["民族"], value: episode.patient?.ethnicity },
    { aliases: ["婚姻状况", "婚姻"], value: episode.patient?.maritalStatus },
    { aliases: ["职业类别代码", "职业"], value: episode.patient?.occupation },
    { aliases: ["现住址"], value: episode.patient?.currentAddress },
    { aliases: ["出生地"], value: episode.patient?.birthPlace },
    { aliases: ["病案号"], value: episode.medicalRecordNumber },
    { aliases: ["住院号"], value: episode.inpatientNumber },
    { aliases: ["床位号"], value: episode.admission?.bed },
    { aliases: ["科室名称", "入院科别"], value: factValue(context, "admission.department", episode.admission?.department) },
    { aliases: ["出院科别"], value: factValue(context, "discharge.department", episode.discharge?.department) },
    { aliases: ["病区名称"], value: episode.admission?.ward },
    { aliases: ["入院日期时间", "入院时间"], value: hmDateTime(admissionAt) },
    { aliases: ["出院日期时间", "出院时间", "预出院时间"], value: hmDateTime(dischargeAt)?.slice(0, 16) },
    { aliases: ["实际住院天数", "住院天数"], value: lengthOfStay(episode) },
    { aliases: ["主诉"], value: episode.admission?.chiefComplaint },
    { aliases: ["现病史"], value: episode.admission?.history },
    { aliases: ["主要诊断", "出院主要诊断", "主要诊断名称", "出院西医诊断_名称"], value: factValue(context, "diagnosis.principal.name", principal.name) },
    { aliases: ["主要诊断疾病编码", "主要诊断代码", "疾病编码", "出院西医诊断_编码"], value: factValue(context, "diagnosis.principal.code", principal.code) },
    { aliases: ["初步诊断", "入院诊断", "初步诊断-西医诊断名称"], value: diagnosisText(episode.diagnoses?.principal) },
    { aliases: ["手术名称", "主要手术及操作名称", "手术及操作名称"], value: procedure?.name },
    { aliases: ["手术及操作代码", "手术及操作编码", "主要手术及操作代码"], value: procedure?.code },
    { aliases: ["手术日期时间", "手术及操作日期"], value: procedure?.startAt?.slice(0, 10) || procedure?.day },
    { aliases: ["手术开始日期时间"], value: procedure?.startAt?.slice(11, 16) },
    { aliases: ["手术结束日期时间"], value: procedure?.endAt?.slice(11, 16) },
    { aliases: ["手术者姓名", "主治医师姓名", "主诊医师姓名"], value: procedure?.operator?.name || episode.discharge?.attendingPhysician?.name },
    { aliases: ["麻醉医师姓名"], value: procedure?.anesthesiologist?.name },
    { aliases: ["麻醉方式代码", "麻醉方式"], value: procedure?.anesthesiaType },
    { aliases: ["离院方式", "出院方式"], value: episode.discharge?.method },
  ].filter((x) => x.value !== undefined && x.value !== null && x.value !== "");
}

export async function fetchMedicalRecordTemplate(template) {
  const url = `${HMEDITOR_RUNTIME_BASE}/hmEditor/demo/file/${encodeURIComponent(template.file)}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`惠每本地病历模板加载失败：${template.file}`);
  const html = await response.text();
  if (!/data-hm-(code|name|node)/.test(html)) throw new Error(`模板 ${template.file} 缺少结构化数据元标记`);
  return { html, source: url };
}

export function extractMedicalMetadata(html) {
  const results = [];
  const tagPattern = /<[^>]+>/g;
  for (const match of String(html || "").matchAll(tagPattern)) {
    const tag = match[0];
    const name = tag.match(/data-(?:med|hm)-name=["']([^"']*)["']/i)?.[1] || "";
    const code = tag.match(/data-(?:med|hm)-code=["']([^"']*)["']/i)?.[1] || "";
    const node = tag.match(/data-hm-node=["']([^"']*)["']/i)?.[1] || "";
    const searchPair = tag.match(/_searchpair=["']([^"']*)["']/i)?.[1] || "";
    const items = tag.match(/data-hm-items=["']([^"']*)["']/i)?.[1];
    if (!name || !code) continue;
    const key = `${code}|${name}`;
    if (!results.some((x) => `${x.code}|${x.name}` === key)) {
      results.push({ code, name, ...(node ? { node } : {}), ...(searchPair ? { searchPair } : {}), ...(items ? { items: items.split("#") } : {}) });
    }
  }
  return results;
}

function episodeCollection(context, collection, fallback) {
  if (!context?.collections || !Array.isArray(context.collections[collection])) return fallback || [];
  if (context.collectionConflicts?.some((item) => item.collection === collection && item.blocking)) return [];
  return context.collections[collection];
}

function frontpageCollectionValue(item, episode, context) {
  const name = item.name || "";
  const normalized = norm(name);
  const ordinal = Math.max(0, Number(name.match(/_(\d+)$/)?.[1] || 1) - 1);
  if (normalized.includes("主要诊断") && normalized.includes("入院病情")) {
    return { matched: true, value: episode.diagnoses?.principal?.conditionAtAdmission };
  }
  if (normalized.includes("主要诊断") && normalized.includes("出院情况")) {
    return { matched: true, value: episode.diagnoses?.principal?.conditionAtDischarge };
  }
  if (normalized.includes("其他诊断")) {
    const row = episodeCollection(context, "diagnosis.secondary", episode.diagnoses?.secondary)[ordinal];
    if (!row) return { matched: true, value: undefined };
    const episodeRow = (episode.diagnoses?.secondary || []).find((item) => item.code && item.code === row.code) || episode.diagnoses?.secondary?.[ordinal];
    if (normalized.includes("入院病情")) return { matched: true, value: episodeRow?.conditionAtAdmission ?? row.conditionAtAdmission };
    if (normalized.includes("出院情况")) return { matched: true, value: episodeRow?.conditionAtDischarge ?? row.conditionAtDischarge };
    if (normalized.includes("编码") || normalized.includes("代码")) return { matched: true, value: row.code };
    if (normalized.includes("名称")) return { matched: true, value: row.name };
  }
  if (normalized.includes("手术及操作")) {
    const primary = episode.procedures?.[0] || {};
    const others = episodeCollection(context, "procedure.others", episode.procedures?.slice(1)).map((row) => ({ ...row }));
    const procedure = ordinal === 0
      ? { ...primary, name: factValue(context, "procedure.primary.name", primary.name), code: factValue(context, "procedure.primary.code", primary.code) }
      : others[ordinal - 1];
    if (!procedure) return { matched: true, value: undefined };
    if (normalized.includes("麻醉方式")) return { matched: true, value: procedure.anesthesiaType };
    if (normalized.includes("日期")) return { matched: true, value: procedure.startAt?.slice(0, 10) || procedure.day };
    if (normalized.includes("编码") || normalized.includes("代码")) return { matched: true, value: procedure.code };
    if (normalized.includes("名称")) return { matched: true, value: procedure.name };
  }
  if (normalized.includes("麻醉方式")) {
    const procedure = ordinal === 0 ? episode.procedures?.[0] : episode.procedures?.[ordinal];
    return { matched: true, value: ordinal === 0
      ? factValue(context, "procedure.primary.anesthesiaType", procedure?.anesthesiaType)
      : procedure?.anesthesiaType };
  }
  return { matched: false };
}

export function buildMedicalRecordData(html, episode, clinicalFactContext = null) {
  const meta = extractMedicalMetadata(html);
  const facts = episodeFacts(episode, clinicalFactContext);
  return meta.flatMap((item) => {
    const itemName = norm(item.name);
    const collectionValue = frontpageCollectionValue(item, episode, clinicalFactContext);
    if (collectionValue.matched) return collectionValue.value === undefined || collectionValue.value === null || collectionValue.value === ""
      ? []
      : [{ keyCode: item.code, keyName: item.name, keyValue: String(collectionValue.value) }];
    const fact = facts.find((f) => f.aliases.some((aliasRaw) => {
      const alias = norm(aliasRaw);
      return itemName === alias || itemName.includes(alias) || alias.includes(itemName);
    }));
    return fact ? [{ keyCode: item.code, keyName: item.name, keyValue: String(fact.value) }] : [];
  });
}

function hmEditorValue(item, value) {
  if (!item.items?.length || typeof value !== "string") return value;
  const selected = item.items.find((option) => {
    const match = option.match(/^(.*?)\(([^()]*)\)\s*$/);
    return match ? [match[1], match[2]].some((part) => norm(part) === norm(value)) : norm(option) === norm(value);
  });
  if (!selected) return value;
  const match = selected.match(/^(.*?)\(([^()]*)\)\s*$/);
  if (!match) return { code: "", value: selected };
  const left = match[1].trim();
  const right = match[2].trim();
  const leftIsCode = /^\d+(?:[.-]\d+)*$/.test(left);
  const rightIsCode = /^\d+(?:[.-]\d+)*$/.test(right);
  return leftIsCode && !rightIsCode
    ? { code: left, value: right }
    : { code: right, value: left };
}

function searchboxValue(item, value, valuesByName) {
  const isCode = /编码|代码/.test(item.name);
  const pair = valuesByName.get(norm(item.searchPair));
  const displayValue = (candidate, preferCode = false) => {
    if (candidate && typeof candidate === "object") return candidate[preferCode ? "code" : "value"] ?? candidate.value ?? candidate.code ?? "";
    return candidate ?? "";
  };
  const ownCode = value && typeof value === "object" ? value.code : "";
  const code = isCode ? ownCode || displayValue(value, true) : displayValue(pair, true) || ownCode;
  const display = displayValue(value, isCode);
  return { code: String(code || ""), value: String(display || "") };
}

function finalizeHmEditorValues(metadata, values, fieldKey) {
  const valuesByName = new Map(metadata.map((item) => [norm(item.name), values.get(fieldKey({ keyCode: item.code, keyName: item.name }))?.keyValue]));
  return metadata.flatMap((item) => {
    const value = values.get(fieldKey({ keyCode: item.code, keyName: item.name }));
    if (!value) return [];
    return [{
      keyCode: item.code,
      keyName: item.name,
      keyValue: item.node === "searchbox" ? searchboxValue(item, value.keyValue, valuesByName) : hmEditorValue(item, value.keyValue),
    }];
  });
}

export function buildHmEditorData(html, episode, savedData = [], clinicalFactContext = null) {
  const hasValue = (value) => {
    if (value === undefined || value === null) return false;
    if (Array.isArray(value)) return value.some(hasValue);
    if (typeof value === "object") return hasValue(value.value) || hasValue(value.code);
    return String(value).trim() !== "";
  };
  const fieldKey = (item) => `${item.keyCode || ""}|${norm(item.keyName || "")}`;
  const values = new Map(buildMedicalRecordData(html, episode, clinicalFactContext).filter((item) => hasValue(item.keyValue)).map((item) => [fieldKey(item), item]));
  const metadataByCode = new Map();
  for (const item of extractMedicalMetadata(html)) metadataByCode.set(item.code, [...(metadataByCode.get(item.code) || []), item]);
  for (const item of savedData) {
    if (!hasValue(item.keyValue)) continue;
    const matches = metadataByCode.get(item.keyCode) || [];
    const keyName = item.keyName || (matches.length === 1 ? matches[0].name : "");
    if (keyName) values.set(fieldKey({ ...item, keyName }), { ...item, keyName });
    else if (matches.length === 0) values.set(fieldKey(item), item);
  }
  const metadata = extractMedicalMetadata(html);
  return finalizeHmEditorValues(metadata, values, fieldKey);
}

function loadHmEditorSdk() {
  if (window.HMEditorLoader) return Promise.resolve(window.HMEditorLoader);
  if (hmEditorSdkPromise) return hmEditorSdkPromise;
  hmEditorSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${HMEDITOR_RUNTIME_BASE}/hmEditor/iframe/HmEditorIfame.js`;
    script.async = true;
    script.onload = () => window.HMEditorLoader ? resolve(window.HMEditorLoader) : reject(new Error("本地结构化编辑器 SDK 未初始化"));
    script.onerror = () => reject(new Error("本地结构化编辑器 SDK 加载失败，请先运行 start.bat 完成本地构建"));
    document.head.appendChild(script);
  }).catch((error) => {
    hmEditorSdkPromise = null;
    throw error;
  });
  return hmEditorSdkPromise;
}

export function mergeDocumentData(template, episode, savedSnapshot, clinicalFactContext = null) {
  const metadata = extractMedicalMetadata(template.html);
  const metadataByCode = new Map();
  for (const item of metadata) metadataByCode.set(item.code, [...(metadataByCode.get(item.code) || []), item]);
  const fieldKey = (item) => `${item.keyCode || ""}|${norm(item.keyName || "")}`;
  const hasValue = (value) => {
    if (value === undefined || value === null) return false;
    if (Array.isArray(value)) return value.some(hasValue);
    if (typeof value === "object") return hasValue(value.value) || hasValue(value.code);
    return String(value).trim() !== "";
  };
  const values = new Map(buildMedicalRecordData(template.html, episode, clinicalFactContext).map((item) => [fieldKey(item), item]));
  const merge = (items = []) => {
    for (const item of items) {
      if (!hasValue(item.keyValue)) continue;
      const candidates = metadataByCode.get(item.keyCode) || [];
      const keyName = item.keyName || (candidates.length === 1 ? candidates[0].name : "");
      if (keyName || candidates.length === 0) values.set(fieldKey({ ...item, keyName }), { ...item, ...(keyName ? { keyName } : {}) });
    }
  };
  merge(template.initialData || []);
  merge(savedSnapshot?.data || []);
  const mapped = finalizeHmEditorValues(metadata, values, fieldKey);
  const known = new Set(metadata.map((item) => fieldKey({ keyCode: item.code, keyName: item.name })));
  return [...mapped, ...[...values.entries()].filter(([key]) => !known.has(key)).map(([, item]) => item)];
}

export function prepareHmEditorPayload(html, data) {
  const codeCounts = new Map();
  for (const item of extractMedicalMetadata(html)) codeCounts.set(item.code, (codeCounts.get(item.code) || 0) + 1);
  return data.map((item) => {
    if ((codeCounts.get(item.keyCode) || 0) < 2) return item;
    const { keyCode, ...byName } = item;
    return byName;
  });
}

function settlementPathForNode(node) {
  const explicit = node?.getAttribute("data-settlement-path");
  if (explicit) return explicit;
  const code = node?.getAttribute("data-hm-code") || "";
  if (code.startsWith("SETTLEMENT.")) return code.slice("SETTLEMENT.".length);
  return Object.entries(SETTLEMENT_SOURCE_FIELDS).find(([, binding]) => binding.code === code)?.[0] || "";
}

export function loadDocumentSnapshot(template, episode) {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(`medical-system:document:${episode.episodeId}:${template.id}`);
    const record = raw ? JSON.parse(raw) : null;
    if (record?.episodeId && record.episodeId !== episode.episodeId) return null;
    if (record?.patientId && episode.patient?.patientId && record.patientId !== episode.patient.patientId) return null;
    return record;
  } catch {
    return null;
  }
}

export async function mountMedicalRecordEditor({ container, template, episode, onChange, clinicalFactContext = null }) {
  const host = typeof container === "string" ? document.querySelector(container) : container;
  if (!host) throw new Error("病历编辑器容器不存在");
  host.innerHTML = `<div class="record-editor-loading">正在加载本地结构化病历编辑器…</div>`;
  const templateResult = template.html
    ? { html: template.html, source: "local-settlement-template" }
    : await fetchMedicalRecordTemplate(template);
  const sdk = await loadHmEditorSdk();
  const saved = loadDocumentSnapshot(template, episode);
  const data = mergeDocumentData({ ...template, html: templateResult.html }, episode, saved?.snapshot, clinicalFactContext);
  const editorData = prepareHmEditorPayload(templateResult.html, data);
  const editorId = `${HMEDITOR_EDITOR_ID}-${template.id}-${Date.now()}`;
  host.innerHTML = `<div id="${editorId}" class="hm-editor-frame-host"><div class="record-editor-loading">正在初始化结构化编辑器…</div></div>`;
  const frameHost = host.querySelector(`#${editorId}`);
  frameHost.innerHTML = "";
  const sdkHost = `${window.location.origin}${HMEDITOR_RUNTIME_BASE}`;
  const editor = await sdk.createEditorAsync({
    container: frameHost,
    id: editorId,
    style: { width: "100%", height: "100%", border: "none" },
    readOnly: false,
    editorConfig: template.editorConfig || {},
    editShowPaddingTopBottom: true,
    sdkHost,
  });
  editor.setDocContent({
    code: template.docCode || template.id,
    docTplName: template.name,
    docContent: saved?.snapshot?.html || templateResult.html,
    data: editorData,
  });
  const docCode = template.docCode || template.id;
  const fieldElements = () => {
    const iframe = frameHost.querySelector("iframe");
    const editorDocument = iframe?.contentDocument;
    const contentDocument = editorDocument?.querySelector("iframe.cke_wysiwyg_frame")?.contentDocument;
    return [...(contentDocument?.querySelectorAll("[data-hm-name][data-hm-code]") || [])];
  };
  const structuredFields = () => fieldElements().map((node) => {
    const content = node.querySelector(".new-textbox-content") || node;
    return {
      fieldId: node.getAttribute("data-hm-id") || "",
      code: node.getAttribute("data-hm-code") || "",
      name: node.getAttribute("data-hm-name") || "",
      path: settlementPathForNode(node),
      text: indexTextNodes(content).text,
    };
  });
  let changeDocument = null;
  let changeWindow = null;
  let previousOnElementChange = null;
  let elementChangeHandler = null;
  const handleEditorChange = (event) => {
    if (!onChange) return;
    const node = event.target?.closest?.("[data-settlement-path], [data-hm-code][data-hm-name]");
    if (!node) return;
    const path = settlementPathForNode(node);
    const content = node.querySelector(".new-textbox-content") || node;
    onChange({ path, value: indexTextNodes(content).text, fields: structuredFields() });
  };
  const attachInputListener = () => {
    const iframe = frameHost.querySelector("iframe");
    const doc = iframe?.contentDocument?.querySelector("iframe.cke_wysiwyg_frame")?.contentDocument;
    const editorWindow = iframe?.contentWindow;
    if (!doc || !editorWindow) return false;
    if (doc === changeDocument) return true;
    if (changeWindow?.onElementChange === elementChangeHandler) {
      if (previousOnElementChange) changeWindow.onElementChange = previousOnElementChange;
      else delete changeWindow.onElementChange;
    }
    changeDocument = doc;
    changeWindow = editorWindow;
    previousOnElementChange = editorWindow.onElementChange;
    elementChangeHandler = (element) => {
      try {
        previousOnElementChange?.call(editorWindow, element);
      } finally {
        editorWindow.setTimeout(() => handleEditorChange({ target: element }), 0);
      }
    };
    editorWindow.onElementChange = elementChangeHandler;
    return true;
  };
  const inputPoll = window.setInterval(() => {
    if (attachInputListener()) window.clearInterval(inputPoll);
  }, 50);
  let anchorCleanup = () => {};
  const clearQualityAnchor = () => {
    anchorCleanup();
    anchorCleanup = () => {};
  };

  return {
    mode: "hm-editor-local-sdk",
    source: templateResult.source,
    data,
    async snapshot() {
      const content = editor.getDocContent(docCode)?.[0];
      if (!content) throw new Error("无法从结构化编辑器读取当前文书内容");
      const names = new Map(extractMedicalMetadata(templateResult.html).map((item) => [item.code, item.name]));
      const payload = (content.data || []).map((item) => ({ ...item, keyName: item.keyName || names.get(item.keyCode) || "" }));
      return { html: content.html || "", text: content.text || "", data: payload };
    },
    setReadOnly(value) {
      editor.setDocReadOnly(docCode, Boolean(value));
    },
    getStructuredFields: structuredFields,
    focusField(field) {
      const matches = fieldElements().filter((node) => settlementPathForNode(node) === field
        || node.getAttribute("data-hm-code") === field
        || norm(node.getAttribute("data-hm-name")) === norm(field));
      if (matches.length !== 1) return false;
      const target = matches[0];
      const content = target.querySelector(".new-textbox-content") || target;
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      content.focus?.();
      return true;
    },
    updateCalculatedFields(totals) {
      const iframe = frameHost.querySelector("iframe");
      const doc = iframe?.contentDocument?.querySelector("iframe.cke_wysiwyg_frame")?.contentDocument;
      for (const [key, value] of Object.entries(totals || {})) {
        const target = doc?.querySelector(`[data-settlement-total="${key}"], .settlement-total--${key}`);
        if (target) target.textContent = Number(value || 0).toFixed(2);
      }
    },
    async focusQualityIssue(issue, onPosition = () => {}) {
      const iframe = frameHost.querySelector("iframe");
      const editorDocument = iframe?.contentDocument;
      const contentFrame = editorDocument?.querySelector("iframe.cke_wysiwyg_frame");
      const contentDocument = contentFrame?.contentDocument;
      if (!contentDocument || !contentFrame) return false;
      clearQualityAnchor();

      const nodes = [...contentDocument.querySelectorAll("[data-hm-name][data-hm-code]")];
      const anchors = Array.isArray(issue.anchors) && issue.anchors.length ? issue.anchors : [issue.anchor || issue];
      const resolved = anchors.map((anchor) => {
        const code = anchor.fieldCode || anchor.code || "";
        const name = anchor.fieldName || anchor.name || "";
        let candidates = nodes.filter((node) => (!code || node.getAttribute("data-hm-code") === code)
          && (!name || norm(node.getAttribute("data-hm-name")) === norm(name)));
        if (anchor.fieldId) candidates = candidates.filter((node) => node.getAttribute("data-hm-id") === anchor.fieldId);
        const type = anchor.anchorType || (anchor.quote ? "text" : "field");
        const matches = candidates.map((target) => {
          const content = target.querySelector(".new-textbox-content") || target;
          const range = type === "text" ? rangeForQuote(content, anchor.quote) : null;
          return { target, content, range };
        }).filter((match) => type === "text" ? Boolean(match.range) : true);
        if (matches.length !== 1) return null;
        const match = matches[0];
        if (!match.range) {
          match.range = contentDocument.createRange();
          match.range.selectNodeContents(match.content);
        }
        return { ...match, anchor, type };
      });
      if (!resolved.length || resolved.some((item) => !item)) return false;

      const primary = resolved[0];
      primary.target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      primary.content.focus?.();
      const updatePosition = () => {
        const outerRect = iframe.getBoundingClientRect();
        const contentRect = contentFrame.getBoundingClientRect();
        const hostRect = host.getBoundingClientRect();
        const marks = resolved.flatMap((item) => {
          const rects = [...item.range.getClientRects()];
          if (!rects.length) rects.push(item.content.getBoundingClientRect());
          return rects.map((rect) => ({
            left: outerRect.left - hostRect.left + contentRect.left + rect.left,
            top: outerRect.top - hostRect.top + contentRect.top + rect.top,
            width: rect.width,
            height: rect.height,
            type: item.type,
          }));
        });
        const targetRect = primary.range.getClientRects()[0] || primary.target.getBoundingClientRect();
        onPosition({
          left: Math.max(8, outerRect.left - hostRect.left + contentRect.left + targetRect.left),
          top: Math.max(8, outerRect.top - hostRect.top + contentRect.top + targetRect.bottom + 8),
          marks,
        });
      };
      const schedulePosition = () => contentFrame.contentWindow?.requestAnimationFrame(updatePosition);
      const outerWindow = editorDocument.defaultView;
      const innerWindow = contentFrame.contentWindow;
      outerWindow?.addEventListener("scroll", schedulePosition, true);
      innerWindow?.addEventListener("scroll", schedulePosition, true);
      window.addEventListener("resize", schedulePosition);
      anchorCleanup = () => {
        outerWindow?.removeEventListener("scroll", schedulePosition, true);
        innerWindow?.removeEventListener("scroll", schedulePosition, true);
        window.removeEventListener("resize", schedulePosition);
      };
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      updatePosition();
      return true;
    },
    clearQualityAnchor,
    destroy() {
      window.clearInterval(inputPoll);
      if (changeWindow?.onElementChange === elementChangeHandler) {
        if (previousOnElementChange) changeWindow.onElementChange = previousOnElementChange;
        else delete changeWindow.onElementChange;
      }
      clearQualityAnchor();
      window.HMEditorLoader?.destroyEditor(editorId);
    },
  };
}

export function runDocumentQc({ template, episode, fields = [] }) {
  const issues = [];
  const values = episodeFacts(episode);
  const has = (name) => fields.length
    ? fields.some((field) => norm(field.name) === norm(name) && String(field.text || "").trim())
    : values.some((f) => f.aliases.some((a) => norm(a) === norm(name)) && String(f.value || "").trim());
  for (const required of template.requiredNames || []) {
    if (!has(required)) {
      const field = fields.find((item) => norm(item.name) === norm(required));
      issues.push({
        severity: "error",
        code: "REQUIRED_FIELD_MISSING",
        field: required,
        fieldName: required,
        fieldCode: field?.code,
        anchors: [{ fieldName: field?.name || required, fieldCode: field?.code, fieldId: field?.fieldId, anchorType: "field" }],
        message: `必填数据元“${required}”缺失。`,
      });
    }
  }
  const admission = new Date(episode.admission?.at);
  const discharge = new Date(episode.discharge?.at);
  if (Number.isFinite(admission.getTime()) && Number.isFinite(discharge.getTime()) && discharge <= admission) {
    issues.push({ severity: "error", code: "EPISODE_TIME_INVALID", field: "出院时间", message: "出院时间必须晚于入院时间。" });
  }
  if (template.id === "surgery" && !episode.procedures?.length) {
    issues.push({ severity: "error", code: "PROCEDURE_FACT_MISSING", field: "手术名称", message: "手术记录存在，但住院 Episode 中没有手术事实。" });
  }
  return { ok: !issues.some((x) => x.severity === "error"), issues };
}

export function saveDocumentSnapshot(template, episode, snapshot, status = "draft") {
  const record = {
    templateId: template.id,
    templateName: template.name,
    episodeId: episode.episodeId,
    patientId: episode.patient?.patientId || null,
    status,
    savedAt: new Date().toISOString(),
    snapshot,
  };
  localStorage.setItem(`medical-system:document:${episode.episodeId}:${template.id}`, JSON.stringify(record));
  return record;
}
