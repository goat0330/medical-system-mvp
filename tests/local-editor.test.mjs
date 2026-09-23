import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { extractMedicalMetadata, buildMedicalRecordData, buildHmEditorData, loadDocumentSnapshot, resolveUniqueTextAnchor, runDocumentQc, saveDocumentSnapshot } from '../app/domain/medical-record-editor.js';
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
  { code: 'DE02.01.039.00', name: '姓名' },
  { code: 'DE02.01.040.00', name: '性别' },
]);
assert.ok(buildMedicalRecordData(hmTemplate, episode).some(x => x.keyName === '姓名' && x.keyValue === episode.patient.name));
const hmDropdowns = '<span data-hm-code="DE02.01.025.00" data-hm-name="民族" data-hm-node="newtextbox" data-hm-items="汉族(01)#蒙古族(02)" _texttype="下拉" _click="true" _selecttype="单选"></span><span data-hm-code="DE99.09.001.80" data-hm-name="婚姻状况" data-hm-node="newtextbox" data-hm-items="未婚#已婚#离婚" _texttype="下拉" _click="true" _selecttype="单选"></span>';
const dropdownData = buildHmEditorData(hmDropdowns, episode);
assert.deepEqual(dropdownData.map(x => x.keyValue), [{ code: '01', value: '汉族' }, { code: '', value: '已婚' }]);
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
