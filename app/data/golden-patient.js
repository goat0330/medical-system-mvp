import { createEpisodeFixture as createGoldenEpisode } from '../../product/medical-system-golden-patient-v1/integration/app-data-episode.golden.js';

const root = new URL('../../product/medical-system-golden-patient-v1/', import.meta.url);

async function readJson(path) {
  const response = await fetch(new URL(path, root));
  if (!response.ok) throw new Error(`Golden patient asset unavailable: ${path}`);
  return response.json();
}

async function readText(path) {
  const response = await fetch(new URL(path, root));
  if (!response.ok) throw new Error(`Golden patient document unavailable: ${path}`);
  return response.text();
}

export async function loadGoldenPatientBundle() {
  const [manifest, documentIndex, vitals, labs, imaging, orders, pathology, feeItems, settlement, drg, dip, qcExpected, qc01, qc02, qc03] = await Promise.all([
    readJson('manifest.json'),
    readJson('data/document-index.json'),
    readJson('clinical/vitals.json'),
    readJson('clinical/labs.json'),
    readJson('clinical/imaging.json'),
    readJson('clinical/orders.json'),
    readJson('clinical/pathology.json'),
    readJson('billing/fee-items.json'),
    readJson('billing/settlement-list.json'),
    readJson('grouping/expected-drg-3.0.json'),
    readJson('grouping/expected-dip-3.0.json'),
    readJson('tests/expected-qc.json'),
    readJson('qc-variants/01_qc-v01.json'),
    readJson('qc-variants/02_qc-v02.json'),
    readJson('qc-variants/03_qc-v03.json'),
  ]);
  const documents = await Promise.all(documentIndex.templates.map(async (item) => ({
    ...item,
    text: await readText(item.source),
  })));
  return {
    manifest,
    documents,
    clinical: { vitals, labs, imaging, orders, pathology },
    billing: { feeItems, settlement },
    grouping: { drg, dip },
    qc: { expected: qcExpected, variants: [qc01, qc02, qc03] },
  };
}

export { createGoldenEpisode };
