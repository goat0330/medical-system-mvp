import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGoldenEpisode, loadGoldenPatientBundle } from '../app/data/golden-patient.js';
import { buildSettlementList } from '../app/domain/settlement.js';
import { workspaceFromEpisode } from '../app/p1/current-case-adapter.js';
import { runFormalGrouping, runPreGrouping } from '../app/p1/workflow-orchestrator.js';
import { buildEvidenceIndex } from '../app/p1/evidence-engine.js';
import expectedDrg from '../product/medical-system-golden-patient-v1/grouping/expected-drg-3.0.json' with { type: 'json' };
import expectedDip from '../product/medical-system-golden-patient-v1/grouping/expected-dip-3.0.json' with { type: 'json' };
import vitals from '../product/medical-system-golden-patient-v1/clinical/vitals.json' with { type: 'json' };
import labs from '../product/medical-system-golden-patient-v1/clinical/labs.json' with { type: 'json' };
import imaging from '../product/medical-system-golden-patient-v1/clinical/imaging.json' with { type: 'json' };
import orders from '../product/medical-system-golden-patient-v1/clinical/orders.json' with { type: 'json' };
import pathology from '../product/medical-system-golden-patient-v1/clinical/pathology.json' with { type: 'json' };

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const text = readFileSync(new URL(url), 'utf8');
  return { ok: true, async text() { return text; }, async json() { return JSON.parse(text); } };
};
let bundle;
try { bundle = await loadGoldenPatientBundle(); } finally { globalThis.fetch = originalFetch; }
assert.equal(bundle.documents.length, 10);
assert.equal(bundle.clinical.labs.length, 3);
assert.equal(bundle.qc.variants.length, 3);

const episode = createGoldenEpisode();
episode.goldenData = {
  clinical: { vitals, labs, imaging, orders, pathology },
  documents: [],
};

const settlement = buildSettlementList(episode);
assert.equal(settlement.fees.totals.amount, 13400);

const drgWorkspace = workspaceFromEpisode(episode, { policyProfileId: 'WH-DRG-3.0' });
const drgRun = runFormalGrouping({ episode, workspace: drgWorkspace });
assert.equal(drgRun.groupingResult.group.code, expectedDrg.expectedPath.at(-1).code);

const dipWorkspace = workspaceFromEpisode(episode, { policyProfileId: 'DIP-3.0-TEST' });
const dipRun = runPreGrouping({ episode, workspace: dipWorkspace });
assert.equal(dipRun.groupingResult.status, expectedDip.expectedResult.status);
assert.equal(dipRun.groupingResult.exclusion.code, expectedDip.expectedResult.exclusion.code);

const evidence = buildEvidenceIndex(episode);
assert.ok(evidence.some((item) => item.sourceType === 'LIS' && item.sourceId === 'LAB-20260918'));
assert.ok(evidence.some((item) => item.sourceType === 'RIS' && item.sourceId === 'IMG-US-001'));
assert.ok(evidence.some((item) => item.sourceType === 'EMR' && item.sourceId === 'VITAL-1'));

console.log('PASS Golden patient integration: settlement, DRG HC45, DIP diagnosis exclusion, and clinical evidence');
