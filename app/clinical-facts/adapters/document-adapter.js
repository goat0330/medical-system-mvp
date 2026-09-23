import { createEvidenceItem } from '../models/evidence.js';
import { registryEntryForField, sourceClassForDocument, normalizeMappedValue } from '../mapping/mapping-registry.js';

const valueText = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return String(value.value ?? value.code ?? value.text ?? '');
  return String(value);
};

export function evidenceFromDocumentSnapshots(episode, records = []) {
  const episodeId = episode?.episodeId;
  const patientId = episode?.patient?.patientId || null;
  const out = [];
  for (const [docIndex, record] of records.entries()) {
    const templateId = record.templateId || record.id || `document-${docIndex + 1}`;
    const templateName = record.templateName || record.name || templateId;
    const sourceClass = sourceClassForDocument(templateId);
    const version = record.version || record.sourceVersion || record.savedAt || `snapshot-${docIndex + 1}`;
    const fields = Array.isArray(record.snapshot?.data) ? record.snapshot.data : Array.isArray(record.data) ? record.data : [];
    for (const [fieldIndex, field] of fields.entries()) {
      const mapping = registryEntryForField({ keyCode: field.keyCode, keyName: field.keyName, templateId });
      const raw = field.keyValue ?? field.value ?? field.text ?? '';
      const rendered = valueText(raw).trim();
      if (!rendered) continue;
      const concept = mapping?.concept || null;
      out.push(createEvidenceItem({
        evidenceId: `EV-DOC-${episodeId}-${templateId}-${field.keyCode || fieldIndex + 1}-${fieldIndex + 1}`,
        episodeId,
        patientId,
        sourceType: 'EMR',
        sourceClass,
        sourceId: templateId,
        sourceDocumentType: templateId,
        sourceDocumentId: record.documentId || templateId,
        sourceVersion: version,
        fieldCode: field.keyCode || null,
        fieldName: field.keyName || null,
        concept,
        value: concept ? normalizeMappedValue(concept, raw) : raw,
        recordedAt: record.savedAt || null,
        excerpt: `${templateName} · ${field.keyName || field.keyCode || '字段'}：${rendered}`,
        factPath: concept,
        structuredValue: raw,
        metadata: { templateName, status: record.status || null, fixtureSource: Boolean(record.fixtureSource) },
      }));
    }
    const text = String(record.snapshot?.text || record.text || '').trim();
    if (text) {
      out.push(createEvidenceItem({
        evidenceId: `EV-DOC-TEXT-${episodeId}-${templateId}-${docIndex + 1}`,
        episodeId,
        patientId,
        sourceType: 'EMR',
        sourceClass,
        sourceId: templateId,
        sourceDocumentType: templateId,
        sourceDocumentId: record.documentId || templateId,
        sourceVersion: version,
        recordedAt: record.savedAt || null,
        excerpt: text.slice(0, 1000),
        factPath: `documents.${templateId}`,
        metadata: { templateName, fullDocument: true, status: record.status || null },
      }));
    }
  }
  return out;
}
