import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { extractMedicalMetadata, buildMedicalRecordData, buildHmEditorData, mergeDocumentData, prepareHmEditorPayload, loadDocumentSnapshot, resolveUniqueTextAnchor, runDocumentQc, saveDocumentSnapshot } from '../app/domain/medical-record-editor.js';
import { buildClinicalFactContext } from '../app/clinical-facts/index.js';
import { createEpisodeFixture } from '../app/data/episode.js';
import { getDocumentTemplate } from '../app/data/templates.js';
import { qualitySummary } from '../app/domain/quality-control.js';

const dir = new URL('../product/medical-record-templates/', import.meta.url);
for (const file of ['admission_record.html','inpatient_record.html','first_progress.html','daily_progress_1.html','daily_progress_3.html','daily_progress_4.html','surgery_record.html','surgery_record_1.html','discharge_record.html']) {
  assert.equal(existsSync(new URL(file, dir)), true, `missing ${file}`);
  const html = readFileSync(new URL(file, dir), 'utf8');
  assert.match(html, /data-med-(code|name|node)=/, `${file} missing local medical data elements`);
  assert.doesNotMatch(html, /data-hm-(code|name|node)=/i, `${file} still contains old runtime data attributes`);
}

const admission = readFileSync(new URL('admission_record.html', dir), 'utf8');
const meta = extractMedicalMetadata(admission);
assert.ok(meta.length > 8, 'admission template should expose structured data elements');
const episode = createEpisodeFixture();
const mapped = buildMedicalRecordData(admission, episode);
assert.ok(mapped.some(x => x.keyName === '姓名' && x.keyValue === episode.patient.name));
const hmTemplate = '<span data-hm-code="DE02.01.039.00" data-hm-name="姓名" data-hm-node="newtextbox"></span><span data-hm-code="DE02.01.040.00" data-hm-name="性别" data-hm-node="newtextbox"></span>';
assert.deepEqual(extractMedicalMetadata(hmTemplate), [
  { code: 'DE02.01.039.00', name: '姓名', node: 'newtextbox' },
  { code: 'DE02.01.040.00', name: '性别', node: 'newtextbox' },
]);
assert.ok(buildMedicalRecordData(hmTemplate, episode).some(x => x.keyName === '姓名' && x.keyValue === episode.patient.name));
const hmDropdowns = '<span data-hm-code="DE02.01.025.00" data-hm-name="民族" data-hm-node="newtextbox" data-hm-items="汉族(01)#蒙古族(02)" _texttype="下拉" _click="true" _selecttype="单选"></span><span data-hm-code="DE99.09.001.80" data-hm-name="婚姻状况" data-hm-node="newtextbox" data-hm-items="未婚#已婚#离婚" _texttype="下拉" _click="true" _selecttype="单选"></span>';
const dropdownData = buildHmEditorData(hmDropdowns, episode);
assert.deepEqual(dropdownData.map(x => x.keyValue), [{ code: '01', value: '汉族' }, { code: '', value: '已婚' }]);
const huimeiFrontpage = readFileSync(new URL('../vendor/hm_editor/hmEditor/demo/file/inpatient_record.html', import.meta.url), 'utf8');
const frontpageEpisode = createEpisodeFixture();
const frontpageData = buildHmEditorData(huimeiFrontpage, frontpageEpisode);
const frontpageValue = name => frontpageData.find(item => item.keyName === name)?.keyValue;
assert.equal(frontpageValue('入院时间'), '2025-07-17 13:23:00', '惠每首页入院时间应映射到当前 Episode');
assert.equal(frontpageValue('预出院时间'), '2025-07-24 10:00', '惠每首页预出院时间应映射到当前 Episode');
assert.equal(frontpageValue('入院科别'), frontpageEpisode.admission.department);
assert.equal(frontpageValue('出院科别'), frontpageEpisode.discharge.department);
assert.deepEqual(frontpageValue('出院西医诊断_名称'), { code: frontpageEpisode.diagnoses.principal.code, value: frontpageEpisode.diagnoses.principal.name });
assert.deepEqual(frontpageValue('出院西医诊断_编码'), { code: frontpageEpisode.diagnoses.principal.code, value: frontpageEpisode.diagnoses.principal.code });
assert.deepEqual(frontpageValue('手术及操作名称_1'), { code: frontpageEpisode.procedures[0].code, value: frontpageEpisode.procedures[0].name });
assert.deepEqual(frontpageValue('手术及操作编码_1'), { code: frontpageEpisode.procedures[0].code, value: frontpageEpisode.procedures[0].code });
assert.equal(frontpageValue('手术及操作日期_1'), '2025-07-19');
assert.equal(frontpageValue('出院西医诊断_主要诊断_出院情况'), undefined, '没有来源的出院临床判断不得自动填写');
assert.deepEqual(frontpageValue('出院西医诊断_主要诊断_入院病情代码'), { code: '1', value: '有' });
const repeatedDiagnosisFields = '<span data-hm-code="DX-NAME-1" data-hm-name="出院西医诊断_其他诊断名称_1"></span><span data-hm-code="DX-CODE-1" data-hm-name="出院西医诊断_其他诊断编码_1"></span><span data-hm-code="DX-NAME-2" data-hm-name="出院西医诊断_其他诊断名称_2"></span><span data-hm-code="DX-CODE-2" data-hm-name="出院西医诊断_其他诊断编码_2"></span>';
const secondaryData = buildHmEditorData(repeatedDiagnosisFields, frontpageEpisode);
assert.deepEqual(secondaryData.map(({ keyName, keyValue }) => [keyName, keyValue]), [
  ['出院西医诊断_其他诊断名称_1', '高血压病'], ['出院西医诊断_其他诊断编码_1', 'I10.x00'],
  ['出院西医诊断_其他诊断名称_2', '2型糖尿病'], ['出院西医诊断_其他诊断编码_2', 'E11.900'],
]);
const secondaryAdmissionStatus = buildHmEditorData('<span data-hm-code="DX-STATUS-1" data-hm-name="出院西医诊断_其他诊断_入院病情代码_1" data-hm-items="1(有)#2(临床未确定)"></span>', frontpageEpisode);
assert.deepEqual(secondaryAdmissionStatus[0]?.keyValue, { code: '1', value: '有' });
const duplicateCodeFields = '<span data-hm-code="ANESTHESIA" data-hm-name="麻醉方式代码_1"></span><span data-hm-code="ANESTHESIA" data-hm-name="麻醉方式代码_2"></span>';
const duplicateCodeData = buildHmEditorData(duplicateCodeFields, frontpageEpisode);
assert.equal(duplicateCodeData.length, 1, '重复编码的数据元应保留名称以便 SDK 精确定位单个字段');
assert.equal(duplicateCodeData[0].keyName, '麻醉方式代码_1');
const mappedAnesthesia = frontpageData.find(item => item.keyName === '麻醉方式代码_1');
assert.deepEqual(mappedAnesthesia?.keyValue, { code: '1', value: '全身麻醉' });
assert.equal(frontpageData.some(item => item.keyName === '麻醉方式代码_2'), false, '不能把首台手术的麻醉方式复制到空白手术行');
const anesthesiaPayload = prepareHmEditorPayload(huimeiFrontpage, [mappedAnesthesia]);
assert.equal(anesthesiaPayload[0].keyCode, undefined, '重复编码必须退化为按数据元名称定位，避免 SDK 把值写入每个同码字段');
assert.equal(anesthesiaPayload[0].keyName, '麻醉方式代码_1');
assert.deepEqual(buildHmEditorData(huimeiFrontpage, frontpageEpisode, [
  { keyCode: 'DE05.01.025.00.009', keyName: '出院西医诊断_名称', keyValue: '' },
]).find(item => item.keyName === '出院西医诊断_名称')?.keyValue, { code: frontpageEpisode.diagnoses.principal.code, value: frontpageEpisode.diagnoses.principal.name }, '空白保存值不能覆盖当前患者映射');
const mergedFrontpage = mergeDocumentData({ html: huimeiFrontpage, initialData: [
  { keyCode: 'DE05.01.025.00.009', keyName: '出院西医诊断_名称', keyValue: '' },
] }, frontpageEpisode, { data: [
  { keyCode: 'DE05.01.025.00.009', keyName: '出院西医诊断_名称', keyValue: '' },
] });
assert.deepEqual(mergedFrontpage.find(item => item.keyName === '出院西医诊断_名称')?.keyValue, { code: frontpageEpisode.diagnoses.principal.code, value: frontpageEpisode.diagnoses.principal.name }, '空白 initialData 或旧草稿不能覆盖本次映射');
const savedFrontpage = mergeDocumentData({ html: huimeiFrontpage }, frontpageEpisode, { data: [
  { keyCode: 'DE05.01.025.00.009', keyName: '出院西医诊断_名称', keyValue: '医生已确认的首页诊断' },
] });
assert.deepEqual(savedFrontpage.find(item => item.keyName === '出院西医诊断_名称')?.keyValue, { code: frontpageEpisode.diagnoses.principal.code, value: '医生已确认的首页诊断' }, '非空医生手工值优先于 Episode 自动映射');
const conflictingContext = buildClinicalFactContext({ episode: frontpageEpisode, documentSnapshots: [{
  templateId: 'frontpage', episodeId: frontpageEpisode.episodeId, patientId: frontpageEpisode.patient.patientId,
  snapshot: { data: [
    { keyCode: 'DE05.01.025.00.009', keyName: '出院西医诊断_名称', keyValue: '冲突诊断' },
    { keyCode: 'DE05.01.024.00.044', keyName: '出院西医诊断_编码', keyValue: 'X99.999' },
  ] },
}] });
assert.equal(conflictingContext.facts.find(item => item.concept === 'diagnosis.principal.name')?.status, 'CONFLICTED');
const conflictSafeData = buildHmEditorData(huimeiFrontpage, frontpageEpisode, [], conflictingContext);
assert.equal(conflictSafeData.some(item => item.keyName === '出院西医诊断_名称'), false, '冲突诊断需人工确认，不应自动写入首页');
const episodeContext = buildClinicalFactContext({ episode: frontpageEpisode });
const contextMappedData = buildHmEditorData(huimeiFrontpage, frontpageEpisode, [], episodeContext);
assert.deepEqual(contextMappedData.find(item => item.keyName === '出院西医诊断_名称')?.keyValue, { code: frontpageEpisode.diagnoses.principal.code, value: frontpageEpisode.diagnoses.principal.name }, '选中患者 ClinicalFact 应参与实际模板写入');
assert.equal(contextMappedData.find(item => item.keyName === '预出院时间')?.keyValue, '2025-07-24 10:00', '标准化时间应按中国本地时间写回模板');
assert.equal(contextMappedData.some(item => item.keyName === '麻醉方式代码_2'), false, 'ClinicalFact 主手术麻醉方式不得复制到其余空手术行');
assert.deepEqual(resolveUniqueTextAnchor('入院前1天患者因腹痛就诊', '患者因腹痛'), { start: 5, end: 10 });
assert.equal(resolveUniqueTextAnchor('患者腹痛，患者恶心', '患者'), null, 'ambiguous quote must not silently choose the first occurrence');
assert.equal(resolveUniqueTextAnchor('现病史内容', '不存在的内容'), null, 'a missing quote must not fall back to the whole field');
const qc = runDocumentQc({ template:getDocumentTemplate('admission'), episode });
assert.equal(Array.isArray(qc.issues), true);
const missingFieldQc = runDocumentQc({
  template:getDocumentTemplate('admission'),
  episode,
  fields:[
    { fieldId:'hm-name-field', code:'DE02.01.039.00', name:'姓名', text:'' },
    { fieldId:'hm-inpatient-field', code:'DE01.00.014.00', name:'住院号', text:'EP-DEMO-001' },
  ],
});
assert.equal(missingFieldQc.issues.length, 1);
assert.deepEqual(missingFieldQc.issues[0].anchors[0], {
  fieldName:'姓名', fieldCode:'DE02.01.039.00', fieldId:'hm-name-field', anchorType:'field',
});
const inlineIssue = qualitySummary('admission', episode).inlineIssues[0];
assert.deepEqual({ fieldName: inlineIssue.fieldName, fieldCode: inlineIssue.fieldCode, anchorType: inlineIssue.anchorType }, {
  fieldName: '现病史', fieldCode: 'DE02.10.071.00', anchorType: 'field',
});

const store = new Map();
globalThis.localStorage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) };
saveDocumentSnapshot(getDocumentTemplate('admission'), episode, { html: '<body>保存后的病历</body>', text: '保存后的病历', data: [{ keyCode: 'DE04.01.119.00', keyValue: '已修改主诉' }] });
assert.equal(loadDocumentSnapshot(getDocumentTemplate('admission'), episode).snapshot.data[0].keyValue, '已修改主诉');

const editorSource = readFileSync(new URL('../app/domain/medical-record-editor.js', import.meta.url), 'utf8');
assert.doesNotMatch(editorSource, /https?:\/\//, 'local editor runtime must not depend on remote URLs');
assert.match(editorSource, /hm-editor-local-sdk/);
for (const api of ['createEditorAsync','setDocContent','getDocContent','setDocReadOnly','destroyEditor']) assert.ok(editorSource.includes(api), `missing upstream SDK API ${api}`);
assert.doesNotMatch(editorSource, /document\.execCommand|toolbarHtml/);
assert.match(editorSource, /editorWindow\.onElementChange = elementChangeHandler/);
console.log('PASS local HmEditor SDK adapter, structured mapping, and snapshot persistence');
