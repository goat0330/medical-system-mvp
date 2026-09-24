import assert from 'node:assert/strict';
import { createGoldenEpisode } from '../app/data/golden-patient.js';
import { buildClinicalFactContext } from '../app/clinical-facts/index.js';
import { applyDocumentFacts, episodeFromWorkspace, workspaceFromEpisode } from '../app/p1/current-case-adapter.js';
import { buildGroupingSnapshot } from '../app/p1/grouping-snapshot.js';
import { groupDrg3 } from '../app/p1/drg3-grouper.js';
import { runPreGrouping } from '../app/p1/workflow-orchestrator.js';
import { searchDiagnosisCatalog } from '../app/p1/diagnosis-catalog.js';
import { runFullChainQualityControl } from '../app/clinical-facts/quality/full-chain-quality.js';

const clone = (value) => structuredClone(value);
const episode = createGoldenEpisode();
episode.episodeId = 'EP-COLLECTION-TEST';
episode.patient.patientId = 'P-COLLECTION-TEST';

const doc = (templateId, templateName, fields) => ({
  episodeId: episode.episodeId, patientId: episode.patient.patientId, documentId: `DOC-${templateId}`,
  templateId, templateName, version: '1', snapshot: { data: fields.map(([keyName, keyValue]) => ({ keyName, keyValue })) },
});
const frontpage = doc('frontpage', '住院病案首页', [
  ['其他诊断编码1', 'I50.900'], ['其他诊断名称1', '心力衰竭'],
  ['其他手术及操作代码1', '55.6100'], ['其他手术及操作名称1', '肾移植术'],
]);
const discharge = doc('discharge', '出院记录', [
  ['其他诊断编码1', 'I50.900'], ['其他诊断名称1', '充血性心力衰竭'],
  ['其他手术及操作代码1', '55.6100'], ['其他手术及操作名称1', '肾脏移植'],
]);
const documents = [frontpage, discharge];
const prepared = applyDocumentFacts(episode, { sourceRecords: documents, sourceDocuments: documents });
const diagnosisFacts = prepared.clinicalFactContext.collections['diagnosis.secondary'];
const procedureFacts = prepared.clinicalFactContext.collections['procedure.others'];

assert.equal(diagnosisFacts.length, 1, 'same secondary diagnosis code is deduplicated across documents');
assert.equal(diagnosisFacts[0].code, 'I50.900');
assert.equal(diagnosisFacts[0].names.length, 2, 'different source names remain available for review');
assert.equal(diagnosisFacts[0].evidenceRefs.length, 4, 'code and name evidence from both documents is retained');
assert.deepEqual(new Set(diagnosisFacts[0].sourceNames), new Set(['住院病案首页', '出院记录']));
assert.equal(procedureFacts.length, 1, 'same other procedure code is deduplicated across documents');
assert.equal(procedureFacts[0].code, '55.6100', 'numeric ICD-9-CM-3 codes in ordinal fields are parsed as codes');
assert.equal(procedureFacts[0].evidenceRefs.length, 4);

const workspace = workspaceFromEpisode(prepared, { policyProfileId: 'WH-DRG-3.0' });
assert.equal(workspace.secondaryDiagnoses[0].code, 'I50.900');
assert.equal(workspace.secondaryDiagnoses[0].factRefs.evidenceRefs.length, 4);
assert.equal(workspace.otherProcedures[0].code, '55.6100');
assert.equal(workspace.otherProcedures[0].factRefs.evidenceRefs.length, 4);
const working = episodeFromWorkspace(prepared, workspace);
const run = runPreGrouping({ episode: working, workspace });
assert.equal(run.groupingSnapshot.secondaryDiagnoses[0].code, 'I50.900');
assert.equal(run.groupingSnapshot.otherProcedures[0].code, '55.6100');
assert.equal(run.groupingSnapshot.otherProcedures[0].factRefs.evidenceRefs.length, 4);
assert.equal(run.groupingResult.group.code, 'HC43', 'the mapped secondary diagnosis reaches official CC/MCC evaluation');

const groupingInput = {
  patient: { sex: 1, age: 43 }, principalDiagnosis: { code: 'K80.000x002' },
  principalProcedure: { code: '51.2300' }, secondaryDiagnoses: [],
};
assert.equal(groupDrg3(groupingInput).group.code, 'HC45');
assert.equal(groupDrg3({ ...groupingInput, secondaryDiagnoses: [{ code: 'I50.900' }] }).group.code, 'HC43');

// The paired-operation input below verifies official rule execution and transport only; it is not a clinical case.
const pairedOperationCase = { ...groupingInput, principalProcedure: { code: '52.8000' } };
assert.equal(groupDrg3(pairedOperationCase).group.code, 'AC39');
assert.equal(groupDrg3({ ...pairedOperationCase, otherProcedures: [{ code: '55.6100' }] }).group.code, 'AC19');

const conflictEpisode = clone(episode);
const conflictingDocument = doc('frontpage', '住院病案首页', [
  ['其他诊断编码1', 'I50.900'], ['其他诊断编码1', 'I10.900'], ['其他诊断名称1', '诊断编码冲突样本'],
]);
conflictEpisode.documentSnapshots = [conflictingDocument];
const conflictContext = buildClinicalFactContext({ episode: conflictEpisode, documentSnapshots: [conflictingDocument], decisions: [] });
assert.equal(conflictContext.collectionConflicts.length, 1);
const conflictWorkspace = workspaceFromEpisode({ ...conflictEpisode, clinicalFactContext: conflictContext });
const blocked = runPreGrouping({ episode: episodeFromWorkspace(conflictEpisode, conflictWorkspace), workspace: conflictWorkspace });
assert.equal(blocked.groupingResult.status, 'BLOCKED_BY_FACT_CONFLICT');
const qc = runFullChainQualityControl({ episode: conflictEpisode, documentSnapshots: [conflictingDocument], factContext: conflictContext });
assert.ok(qc.issues.some((issue) => issue.type === 'SECONDARY_DIAGNOSIS_CODE_CONFLICT' && issue.blocking));

const overrideWorkspace = clone(conflictWorkspace);
overrideWorkspace.secondaryDiagnoses = [{ code: 'I50.900', name: '心力衰竭', status: 'MANUAL_OVERRIDE' }];
overrideWorkspace.groupingInputSources['diagnosis.secondary'] = { status: 'MANUAL_OVERRIDE' };
const overridden = runPreGrouping({ episode: episodeFromWorkspace(conflictEpisode, overrideWorkspace), workspace: overrideWorkspace });
assert.notEqual(overridden.groupingResult.status, 'BLOCKED_BY_FACT_CONFLICT');
const resolvedQc = runFullChainQualityControl({ episode: conflictEpisode, factContext: conflictContext, resolvedCollections: ['diagnosis.secondary'] });
assert.ok(!resolvedQc.issues.some((issue) => issue.type === 'SECONDARY_DIAGNOSIS_CODE_CONFLICT'));

const drgNames = searchDiagnosisCatalog('胆囊结石', { paymentMethod: 'DRG' });
assert.ok(drgNames.some((item) => item.code === 'K80.000x002' && item.nameStatus === 'CANDIDATE'));
assert.ok(searchDiagnosisCatalog('K80.000x002', { paymentMethod: 'DRG' }).some((item) => item.code === 'K80.000x002'));
assert.ok(!searchDiagnosisCatalog('A15.400', { paymentMethod: 'DRG' }).some((item) => item.code === 'A15.400'));
assert.ok(searchDiagnosisCatalog('A15.400', { paymentMethod: 'DIP' }).some((item) => item.code === 'A15.400'));

console.log('PASS cross-document secondary diagnoses/procedures, evidence projection, conflict blocking, official grouper paths, and unified diagnosis search');
