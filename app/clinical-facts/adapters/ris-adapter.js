import { createEvidenceItem } from '../models/evidence.js';
export function evidenceFromRis(episode) {
  const out = [];
  const c = episode?.goldenData?.clinical || {};
  for (const [i, x] of (c.imaging || []).entries()) {
    out.push(createEvidenceItem({
      evidenceId: `EV-RIS-${episode.episodeId}-${x.reportId || i + 1}`,
      episodeId: episode.episodeId, patientId: episode.patient?.patientId || null,
      sourceType: 'RIS/PACS', sourceClass: 'RIS', sourceId: x.reportId || `imaging-${i+1}`,
      sourceVersion: episode.datasetVersion || 'golden', eventTime: x.at || null, value: x.impression || x.findings || x,
      excerpt: `${x.name || '影像报告'}：${x.findings || ''} 印象：${x.impression || ''}`.trim(),
      factPath: `goldenData.clinical.imaging[${i}]`, structuredValue: x,
    }));
  }
  for (const [i, x] of (c.vitals || []).entries()) {
    out.push(createEvidenceItem({
      evidenceId: `EV-VITAL-${episode.episodeId}-${i + 1}`,
      episodeId: episode.episodeId, patientId: episode.patient?.patientId || null,
      sourceType: 'NURSING', sourceClass: 'NURSING', sourceId: `vital-${i+1}`,
      sourceVersion: episode.datasetVersion || 'golden', eventTime: x.at || null, value: x,
      excerpt: `${x.at || ''} 体温${x.temperatureC ?? '—'}℃，脉搏${x.pulse ?? '—'}/分，血压${x.systolic ?? '—'}/${x.diastolic ?? '—'}mmHg，SpO₂ ${x.spo2 ?? '—'}%`.trim(),
      factPath: `goldenData.clinical.vitals[${i}]`, structuredValue: x,
    }));
  }
  return out;
}
