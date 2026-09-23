const t = (id, group, name, docCode, file, requiredNames = []) => Object.freeze({
  id, group, name, docCode, file, requiredNames: Object.freeze(requiredNames), source: "local-medical-record-template"
});

export const MEDICAL_RECORD_TEMPLATE_BASE = "./product/medical-record-templates";

export const DOCUMENT_TEMPLATES = Object.freeze([
  t("frontpage", "病案首页", "住院病案首页", "inpatient_record", "inpatient_record.html", ["姓名", "住院号", "病案号"]),
  t("admission", "入院记录", "入院记录", "admission_record", "admission_record.html", ["姓名", "住院号"]),
  t("first-progress", "病程记录", "首次病程记录", "first_progress", "first_progress.html", ["姓名", "住院号"]),
  t("daily-progress", "病程记录", "日常病程记录", "daily_progress", "daily_progress_1.html", ["姓名", "住院号"]),
  t("attending-round", "病程记录", "主治医师查房记录", "attending_round", "daily_progress_3.html", ["姓名", "住院号"]),
  t("attending-first-round", "病程记录", "主治医师首次查房记录", "attending_first_round", "daily_progress_4.html", ["姓名", "住院号"]),
  t("surgery", "手术记录", "手术记录", "surgery_record", "surgery_record.html", ["姓名", "住院号", "手术名称"]),
  t("preop", "手术记录", "术前小结", "preop_summary", "surgery_record_1.html", ["姓名", "住院号"]),
  t("discharge", "出院记录", "出院记录", "discharge_record", "discharge_record.html", ["姓名", "住院号"]),
]);

export const DOCUMENT_GROUPS = Object.freeze(["病案首页", "入院记录", "病程记录", "手术记录", "出院记录"]);

export function getDocumentTemplate(id) {
  return DOCUMENT_TEMPLATES.find((item) => item.id === id) || DOCUMENT_TEMPLATES[0];
}

export function groupedTemplates() {
  return DOCUMENT_GROUPS.map((group) => ({
    group,
    items: DOCUMENT_TEMPLATES.filter((item) => item.group === group),
  })).filter((group) => group.items.length);
}
