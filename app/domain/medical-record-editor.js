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

function episodeFacts(episode) {
  const procedure = episode.procedures?.[0];
  return [
    { aliases: ["医疗机构名称"], value: episode.institution?.name || "XX省第XX人民医院" },
    { aliases: ["姓名", "患者姓名"], value: episode.patient?.name },
    { aliases: ["性别"], value: episode.patient?.sex },
    { aliases: ["出生日期"], value: episode.patient?.birthDate },
    { aliases: ["年龄"], value: episode.patient?.age !== undefined && episode.patient?.age !== null ? `${episode.patient.age}岁` : "" },
    { aliases: ["国籍"], value: episode.patient?.nationality },
    { aliases: ["民族"], value: episode.patient?.ethnicity },
    { aliases: ["婚姻状况", "婚姻"], value: episode.patient?.maritalStatus },
    { aliases: ["职业类别代码", "职业"], value: episode.patient?.occupation },
    { aliases: ["现住址"], value: episode.patient?.currentAddress },
    { aliases: ["出生地"], value: episode.patient?.birthPlace },
    { aliases: ["病案号"], value: episode.medicalRecordNumber },
    { aliases: ["住院号"], value: episode.inpatientNumber },
    { aliases: ["床位号"], value: episode.admission?.bed },
    { aliases: ["科室名称", "入院科别"], value: episode.admission?.department },
    { aliases: ["病区名称"], value: episode.admission?.ward },
    { aliases: ["入院日期时间", "入院时间"], value: episode.admission?.at?.replace("T", " ").slice(0, 19) },
    { aliases: ["出院日期时间", "出院时间"], value: episode.discharge?.at?.replace("T", " ").slice(0, 16) },
    { aliases: ["实际住院天数", "住院天数"], value: lengthOfStay(episode) },
    { aliases: ["主诉"], value: episode.admission?.chiefComplaint },
    { aliases: ["现病史"], value: episode.admission?.history },
    { aliases: ["主要诊断", "出院主要诊断", "主要诊断名称"], value: episode.diagnoses?.principal?.name },
    { aliases: ["主要诊断疾病编码", "主要诊断代码", "疾病编码"], value: episode.diagnoses?.principal?.code },
    { aliases: ["初步诊断", "入院诊断", "初步诊断-西医诊断名称"], value: diagnosisText(episode.diagnoses?.principal) },
    { aliases: ["手术名称", "主要手术及操作名称"], value: procedure?.name },
    { aliases: ["手术及操作代码", "主要手术及操作代码"], value: procedure?.code },
    { aliases: ["手术日期时间"], value: procedure?.startAt?.slice(0, 10) },
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
    const items = tag.match(/data-hm-items=["']([^"']*)["']/i)?.[1];
    if (!name || !code) continue;
    const key = `${code}|${name}`;
    if (!results.some((x) => `${x.code}|${x.name}` === key)) {
      results.push({ code, name, ...(items ? { items: items.split("#") } : {}) });
    }
  }
  return results;
}

export function buildMedicalRecordData(html, episode) {
  const meta = extractMedicalMetadata(html);
  const facts = episodeFacts(episode);
  return meta.flatMap((item) => {
    const itemName = norm(item.name);
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
    const code = option.match(/\(([^()]*)\)\s*$/)?.[1];
    const label = option.replace(/\([^()]*\)\s*$/, "");
    return norm(label) === norm(value) || (code && norm(code) === norm(value));
  });
  if (!selected) return value;
  const match = selected.match(/^(.*?)\(([^()]*)\)\s*$/);
  return { code: match?.[2] || "", value: match?.[1] || selected };
}

export function buildHmEditorData(html, episode, savedData = []) {
  const hasValue = (value) => {
    if (value === undefined || value === null) return false;
    if (Array.isArray(value)) return value.some(hasValue);
    if (typeof value === "object") return hasValue(value.value) || hasValue(value.code);
    return String(value).trim() !== "";
  };
  const values = new Map(buildMedicalRecordData(html, episode).filter((item) => hasValue(item.keyValue)).map((item) => [item.keyCode, item]));
  for (const item of savedData) if (hasValue(item.keyValue)) values.set(item.keyCode, item);
  return extractMedicalMetadata(html).reduce((result, item) => {
    if (!result.some((value) => value.keyCode === item.code) && values.has(item.code)) {
      const savedValue = savedData.find((value) => value.keyCode === item.code && hasValue(value.keyValue))?.keyValue;
      const value = savedValue !== undefined ? savedValue : hmEditorValue(item, values.get(item.code).keyValue);
      result.push({ keyCode: item.code, keyName: item.name, keyValue: value });
    }
    return result;
  }, []);
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

function mergeDocumentData(template, episode, savedSnapshot) {
  const values = new Map(buildHmEditorData(template.html, episode).map((item) => [item.keyCode, item]));
  for (const item of template.initialData || []) values.set(item.keyCode, item);
  for (const item of savedSnapshot?.data || []) values.set(item.keyCode, item);
  return [...values.values()];
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

export async function mountMedicalRecordEditor({ container, template, episode, onChange }) {
  const host = typeof container === "string" ? document.querySelector(container) : container;
  if (!host) throw new Error("病历编辑器容器不存在");
  host.innerHTML = `<div class="record-editor-loading">正在加载本地结构化病历编辑器…</div>`;
  const templateResult = template.html
    ? { html: template.html, source: "local-settlement-template" }
    : await fetchMedicalRecordTemplate(template);
  const sdk = await loadHmEditorSdk();
  const saved = loadDocumentSnapshot(template, episode);
  const data = mergeDocumentData({ ...template, html: templateResult.html }, episode, saved?.snapshot);
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
    data,
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
      const payload = (content.data || []).map((item) => ({ ...item, keyName: names.get(item.keyCode) || item.keyName || "" }));
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
