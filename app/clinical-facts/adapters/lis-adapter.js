import { createEvidenceItem } from '../models/evidence.js';
export function evidenceFromLis(episode) {
  const out = [];
  const c = episode?.goldenData?.clinical || {};
  for (const [i, panel] of (c.labs || []).entries()) {
    for (const [j, x] of (panel.items || []).entries()) {
      out.push(createEvidenceItem({
        evidenceId: `EV-LIS-${episode.episodeId}-${panel.panelId || i + 1}-${x.code || j + 1}`,
        episodeId: episode.episodeId, patientId: episode.patient?.patientId || null,
        sourceType: 'LIS', sourceClass: 'LIS', sourceId: panel.panelId || `lab-${i+1}`,
        sourceVersion: episode.datasetVersion || 'golden', eventTime: panel.at || null, value: x.value,
        excerpt: `${x.name || x.code || '检验项目'}：${x.value ?? '—'} ${x.unit || ''}；参考值 ${x.ref || '未提供'}；标记 ${x.flag || '未标记'}`,
        factPath: `goldenData.clinical.labs[${i}].items[${j}]`, structuredValue: x,
      }));
    }
  }
  for (const [i, x] of (c.pathology || []).entries()) {
    out.push(createEvidenceItem({
      evidenceId: `EV-PATH-${episode.episodeId}-${x.reportId || i + 1}`,
      episodeId: episode.episodeId, patientId: episode.patient?.patientId || null,
      sourceType: 'LIS/PATH', sourceClass: 'LIS', sourceId: x.reportId || `path-${i+1}`,
      sourceVersion: episode.datasetVersion || 'golden', eventTime: x.at || null, value: x.diagnosis || x,
      excerpt: `${x.specimen || '病理'}：${x.diagnosis || ''}`.trim(), factPath: `goldenData.clinical.pathology[${i}]`, structuredValue: x,
    }));
  }
  return out;
}
