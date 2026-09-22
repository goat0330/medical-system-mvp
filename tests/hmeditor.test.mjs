import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const moduleRoot = await mkdtemp(join(tmpdir(), 'hmeditor-esm-test-'));
const sourceFiles = [
  'app/data/templates.js',
  'app/data/episode.js',
  'app/domain/hmeditor.js',
];

async function loadSourceModules() {
  for (const relativePath of sourceFiles) {
    const sourcePath = join(projectRoot, relativePath);
    const targetPath = join(moduleRoot, relativePath.replace(/\.js$/, '.mjs'));
    await mkdir(dirname(targetPath), { recursive: true });
    let source = await readFile(sourcePath, 'utf8');
    source = source.replaceAll('../data/templates.js', '../data/templates.mjs');
    await writeFile(targetPath, source, 'utf8');
  }

  const templates = await import(pathToFileURL(join(moduleRoot, 'app/data/templates.mjs')).href);
  const episode = await import(pathToFileURL(join(moduleRoot, 'app/data/episode.mjs')).href);
  const hmeditor = await import(pathToFileURL(join(moduleRoot, 'app/domain/hmeditor.mjs')).href);
  return { templates, episode, hmeditor };
}

try {
  const { templates, episode, hmeditor } = await loadSourceModules();
  const {
    HMEDITOR_EXCLUDED_TEMPLATE_NAMES,
    HMEDITOR_TEMPLATES,
    getHmEditorTemplate,
    listEnabledHmEditorTemplates,
  } = templates;
  const { createEpisodeFixture } = episode;
  const { createHmEditorAdapter, generateDocumentDraft } = hmeditor;

  const excludedNames = [
    '会诊',
    '接班',
    '阶段小结',
    '一般护理记录单',
    '死亡记录',
    '死亡病例讨论记录',
  ];
  const enabledNames = new Set(listEnabledHmEditorTemplates().map((item) => item.templateName));
  for (const name of excludedNames) {
    assert.equal(enabledNames.has(name), false, `排除模板不能启用：${name}`);
    assert.equal(HMEDITOR_EXCLUDED_TEMPLATE_NAMES.some((item) => item.startsWith(name)), true);
  }
  assert.equal(HMEDITOR_TEMPLATES.find((item) => item.templateName === '24小时内入出院记录').enabled, false);

  const frontPageTemplate = getHmEditorTemplate('HM_INPATIENT_FRONT_PAGE');
  assert.equal(frontPageTemplate.templateName, '住院病案首页');
  assert.equal(frontPageTemplate.source, 'HmEditor');
  assert.ok(frontPageTemplate.id && frontPageTemplate.keyCode);

  const fixture = createEpisodeFixture();
  assert.equal(fixture.synthetic, true);
  assert.equal(fixture.diagnoses.primary.code, fixture.icd.primary.code);
  assert.equal(fixture.documents.dailyCourseRecords.length, 2);
  assert.equal(fixture.costs.total, fixture.settlement.totalAmount);

  const adapter = createHmEditorAdapter();
  const frontPageDraft = generateDocumentDraft('hm-inpatient-front-page', fixture, { adapter });
  assert.equal(frontPageDraft.status, 'draft');
  assert.equal(frontPageDraft.requiresHumanSignoff, true);
  assert.equal(frontPageDraft.source, 'HmEditor');
  assert.equal(frontPageDraft.editor.adapter, 'HmEditor');
  assert.equal(frontPageDraft.editor.isMock, true);
  assert.equal(adapter.getDocData().patient.patientId, 'P-DEMO-001');
  assert.match(adapter.getDocHtml(), /data-hm-editor-mode="compat-mock"/);
  assert.ok(frontPageDraft.evidenceRefs.some((ref) => ref.evidenceId === 'EV-DEMO-COST'));
  assert.ok(frontPageDraft.evidenceRefs.some((ref) => ref.evidenceId === 'EV-DEMO-FIRST-COURSE'));
  assert.ok(adapter.qc(frontPageDraft).some((item) => item.code === 'HUMAN_SIGNOFF_REQUIRED'));
  assert.ok(frontPageDraft.qc.issues.some((item) => item.code === 'HUMAN_SIGNOFF_REQUIRED'));

  const incompleteEpisode = createEpisodeFixture();
  delete incompleteEpisode.diagnoses.primary;
  delete incompleteEpisode.costs.total;
  const incompleteDraft = generateDocumentDraft('hm-inpatient-front-page', incompleteEpisode);
  const missingPaths = new Set(incompleteDraft.missingFacts.map((item) => item.factPath));
  assert.equal(missingPaths.has('diagnoses.primary'), true);
  assert.equal(missingPaths.has('costs.total'), true);
  assert.ok(incompleteDraft.missingFacts.every((item) => item.message.includes('AI 不会编造')));
  assert.ok(incompleteDraft.qc.issues.some((item) => item.code === 'MISSING_REQUIRED_FACT'));
} finally {
  await rm(moduleRoot, { recursive: true, force: true });
}

console.log('hmeditor tests passed');
