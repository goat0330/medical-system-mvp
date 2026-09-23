import { createEvidenceItem } from '../models/evidence.js';
export function evidenceFromHis(episode) {
  const out = [];
  for (const [i, x] of (episode?.fees?.items || []).entries()) {
    out.push(createEvidenceItem({
      evidenceId: `EV-HIS-${episode.episodeId}-${x.id || x.itemCode || x.serviceCode || i + 1}`,
      episodeId: episode.episodeId,
      patientId: episode.patient?.patientId || null,
      sourceType: 'HIS', sourceClass: 'HIS', sourceId: x.id || x.itemCode || x.serviceCode || `fee-${i+1}`,
      sourceVersion: episode.fees?.businessSerialNumber || 'current',
      value: x,
      eventTime: x.billingTime || null,
      excerpt: `${x.itemCode || x.serviceCode || ''} ${x.name || x.itemName || '费用项目'} 数量=${x.quantity ?? x.qty ?? ''} 单价=${x.unitPrice ?? ''} 金额=${x.amount ?? ''} 计费时间=${x.billingTime || ''}`.trim(),
      factPath: `fees.items[${i}]`, structuredValue: x,
    }));
  }
  for (const [i, x] of (episode?.goldenData?.clinical?.orders || []).entries()) {
    out.push(createEvidenceItem({
      evidenceId: `EV-HIS-ORDER-${episode.episodeId}-${x.orderId || i + 1}`,
      episodeId: episode.episodeId, patientId: episode.patient?.patientId || null,
      sourceType: 'HIS', sourceClass: 'HIS', sourceId: x.orderId || `order-${i+1}`,
      sourceVersion: episode.datasetVersion || 'golden', value: x, eventTime: x.startAt || null,
      excerpt: `${x.type || '医嘱'}：${x.name || ''} ${x.startAt || ''} ${x.status || ''}`.trim(),
      factPath: `goldenData.clinical.orders[${i}]`, structuredValue: x,
    }));
  }
  return out;
}
