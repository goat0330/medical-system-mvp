import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { extractMedicalMetadata, buildMedicalRecordData, runDocumentQc } from '../app/domain/medical-record-editor.js';
import { createEpisodeFixture } from '../app/data/episode.js';
import { getDocumentTemplate } from '../app/data/templates.js';

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
const qc = runDocumentQc({ template:getDocumentTemplate('admission'), episode });
assert.equal(Array.isArray(qc.issues), true);

const editorSource = readFileSync(new URL('../app/domain/medical-record-editor.js', import.meta.url), 'utf8');
assert.doesNotMatch(editorSource, /https?:\/\//, 'local editor runtime must not depend on remote URLs');
assert.match(editorSource, /local-medical-record-editor/);
console.log('PASS local medical record editor');
