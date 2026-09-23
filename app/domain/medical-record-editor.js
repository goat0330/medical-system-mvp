import { MEDICAL_RECORD_TEMPLATE_BASE } from "../data/templates.js";
import { lengthOfStay } from "../data/episode.js";

function norm(value) {
  return String(value ?? "")
    .replace(/[\s：:（）()\[\]【】_\-]/g, "")
    .replace(/代码$/, "代码")
    .toLowerCase();
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
  const url = `${MEDICAL_RECORD_TEMPLATE_BASE}/${template.file}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`本地病历模板加载失败：${template.file}`);
  const html = await response.text();
  if (!/data-med-(code|name|node)/.test(html)) throw new Error(`模板 ${template.file} 缺少本地数据元标记`);
  return { html, source: url };
}

export function extractMedicalMetadata(html) {
  const results = [];
  const tagPattern = /<[^>]+data-med-(?:code|name)=["'][^"']+["'][^>]*>/gi;
  for (const match of String(html || "").matchAll(tagPattern)) {
    const tag = match[0];
    const name = tag.match(/data-med-name=["']([^"']*)["']/i)?.[1] || "";
    const code = tag.match(/data-med-code=["']([^"']*)["']/i)?.[1] || "";
    if (!name || !code) continue;
    const key = `${code}|${name}`;
    if (!results.some((x) => `${x.code}|${x.name}` === key)) results.push({ code, name });
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

function applyData(root, data) {
  for (const datum of data) {
    const nodes = [...root.querySelectorAll(`[data-med-code="${CSS.escape(datum.keyCode)}"]`)];
    for (const node of nodes) {
      const content = node.querySelector(".med-field-content") || node;
      content.textContent = datum.keyValue;
      content.removeAttribute("_placeholdertext");
    }
  }
}

function normalizeEditableFields(root) {
  root.querySelectorAll(".med-field-content").forEach((el) => {
    const parent = el.closest("[data-med-node]");
    const type = parent?.getAttribute("_texttype") || el.getAttribute("_texttype") || "";
    const notAllow = parent?.hasAttribute("notallowwrite") || el.hasAttribute("notallowwrite");
    if (!notAllow && type !== "下拉") el.setAttribute("contenteditable", "true");
    else el.setAttribute("contenteditable", "false");
  });
  root.querySelectorAll("[data-med-node='labelbox']").forEach((el) => el.setAttribute("contenteditable", "false"));
}

function toolbarHtml() {
  return `<div class="record-editor-toolbar" role="toolbar" aria-label="病历编辑工具栏">
    <button data-editor-cmd="undo" title="撤销">↶</button><button data-editor-cmd="redo" title="重做">↷</button><span class="toolbar-divider"></span>
    <button data-editor-cmd="justifyLeft" title="左对齐">≡</button><button data-editor-cmd="justifyCenter" title="居中">≣</button><button data-editor-cmd="justifyRight" title="右对齐">≡</button><span class="toolbar-divider"></span>
    <button data-editor-cmd="insertUnorderedList" title="项目符号">•≡</button><button data-editor-cmd="insertOrderedList" title="编号">1≡</button><button data-editor-action="table" title="表格">▦</button><button data-editor-action="symbol" title="特殊字符">Ω</button><span class="toolbar-divider"></span>
    <label class="record-editor-select">字体<select data-editor-select="fontName"><option>微软雅黑</option><option>宋体</option><option>黑体</option></select></label>
    <label class="record-editor-select">大小<select data-editor-select="fontSize"><option value="3">14</option><option value="4">16</option><option value="5">18</option></select></label>
    <button data-editor-cmd="bold" class="toolbar-text strong">B</button><button data-editor-cmd="italic" class="toolbar-text italic">I</button><button data-editor-cmd="underline" class="toolbar-text underline">U</button><button data-editor-cmd="strikeThrough" class="toolbar-text strike">S</button><button data-editor-cmd="subscript">x₂</button><button data-editor-cmd="superscript">x²</button><span class="toolbar-divider"></span>
    <button data-editor-action="search" title="查找">⌕</button>
  </div>`;
}

function bindToolbar(host, paper) {
  host.querySelectorAll("[data-editor-cmd]").forEach((button) => button.addEventListener("click", () => {
    paper.focus();
    document.execCommand(button.dataset.editorCmd, false, null);
  }));
  host.querySelectorAll("[data-editor-select]").forEach((select) => select.addEventListener("change", () => {
    paper.focus();
    const cmd = select.dataset.editorSelect;
    const value = cmd === "fontName" ? select.value : select.value;
    document.execCommand(cmd, false, value);
  }));
}

export async function mountMedicalRecordEditor({ container, template, episode }) {
  const host = typeof container === "string" ? document.querySelector(container) : container;
  if (!host) throw new Error("病历编辑器容器不存在");
  host.innerHTML = `<div class="record-editor-loading">正在加载本地病历模板…</div>`;

  const templateResult = await fetchMedicalRecordTemplate(template);
  const parser = new DOMParser();
  const parsed = parser.parseFromString(templateResult.html, "text/html");
  const data = buildMedicalRecordData(templateResult.html, episode);
  applyData(parsed, data);
  normalizeEditableFields(parsed);

  host.innerHTML = `${toolbarHtml()}<div class="record-editor-viewport"><article class="record-editor-paper" tabindex="0">${parsed.body.innerHTML}</article></div>`;
  const paper = host.querySelector(".record-editor-paper");
  bindToolbar(host, paper);

  return {
    mode: "local-medical-record-editor",
    source: templateResult.source,
    data,
    async snapshot() {
      const payload = [...paper.querySelectorAll("[data-med-code]")].map((node) => ({
        keyCode: node.getAttribute("data-med-code") || "",
        keyName: node.getAttribute("data-med-name") || "",
        keyValue: (node.querySelector(".med-field-content") || node).textContent?.trim() || "",
      }));
      return { html: paper.innerHTML, text: paper.innerText, data: payload };
    },
    setReadOnly(value) {
      paper.querySelectorAll(".med-field-content").forEach((el) => el.setAttribute("contenteditable", value ? "false" : "true"));
      paper.classList.toggle("is-readonly", Boolean(value));
    },
    destroy() { host.innerHTML = ""; },
  };
}

export function runDocumentQc({ template, episode }) {
  const issues = [];
  const values = episodeFacts(episode);
  const has = (name) => values.some((f) => f.aliases.some((a) => norm(a) === norm(name)) && String(f.value || "").trim());
  for (const required of template.requiredNames || []) {
    if (!has(required)) issues.push({ severity: "error", code: "REQUIRED_FIELD_MISSING", field: required, message: `必填数据元“${required}”缺失。` });
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
    status,
    savedAt: new Date().toISOString(),
    snapshot,
  };
  localStorage.setItem(`medical-system:document:${episode.episodeId}:${template.id}`, JSON.stringify(record));
  return record;
}
