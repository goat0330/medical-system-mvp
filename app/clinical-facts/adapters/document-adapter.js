import { createEvidenceItem } from '../models/evidence.js';
import { collectionFieldForField, registryEntryForField, sourceClassForDocument, normalizeMappedValue } from '../mapping/mapping-registry.js';

const valueText = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return String(value.value ?? value.code ?? value.text ?? '');
  return String(value);
};

function collectionParts(raw, expectedPart) {
  if (raw && typeof raw === 'object' && (raw.code || raw.name)) {
    return [{ part: 'code', value: raw.code }, { part: 'name', value: raw.name }].filter((item) => item.value != null && String(item.value).trim());
  }
  const value = valueText(raw).trim();
  if (!value) return [];
  const compact = value.replace(/\s+/g, '');
  const part = expectedPart === 'auto'
    ? (/^[A-Z]\d[A-Z0-9.]*$/i.test(compact) || /^\d{2}(?:\.\d{2,4})?(?:X\d{1,3})?$/i.test(compact) ? 'code' : 'name')
    : expectedPart;
  return [{ part, value }];
}

function collectionEvidence({ episode, record, templateId, templateName, version, field, raw, collectionField, rowId, part, fieldIndex }) {
  const episodeId = episode.episodeId;
  const patientId = episode.patient?.patientId || null;
  const sourceClass = sourceClassForDocument(templateId);
  const value = part === 'code' ? normalizeMappedValue('diagnosis.principal.code', raw) : valueText(raw).trim();
  return createEvidenceItem({
    evidenceId: `EV-DOC-${episodeId}-${templateId}-${collectionField.collection.replaceAll('.', '-')}-${rowId}-${part}-${field.keyCode || fieldIndex + 1}`,
    episodeId, patientId, sourceType: 'EMR', sourceClass,
    sourceId: templateId, sourceDocumentType: templateId,
    sourceDocumentId: record.documentId || templateId, sourceVersion: version,
    fieldCode: field.keyCode || null, fieldName: field.keyName || null,
    value, recordedAt: record.savedAt || null,
    excerpt: `${templateName} · ${field.keyName || field.keyCode || '字段'}：${valueText(raw).trim()}`,
    factPath: `${collectionField.collection}[${rowId}].${part}`,
    structuredValue: raw,
    metadata: {
      templateName, status: record.status || null, fixtureSource: Boolean(record.fixtureSource),
      collection: collectionField.collection, collectionRowId: rowId, collectionPart: part,
    },
  });
}

export function evidenceFromDocumentSnapshots(episode, records = []) {
  const episodeId = episode?.episodeId;
  const patientId = episode?.patient?.patientId || null;
  const out = [];
  for (const [docIndex, record] of records.entries()) {
    if ((record.episodeId && record.episodeId !== episodeId) || (record.patientId && patientId && record.patientId !== patientId)) continue;
    const templateId = record.templateId || record.id || `document-${docIndex + 1}`;
    const templateName = record.templateName || record.name || templateId;
    const sourceClass = sourceClassForDocument(templateId);
    const version = record.version || record.sourceVersion || record.savedAt || `snapshot-${docIndex + 1}`;
    const fields = Array.isArray(record.snapshot?.data) ? record.snapshot.data : Array.isArray(record.data) ? record.data : [];
    const collectionCounts = new Map();
    for (const [fieldIndex, field] of fields.entries()) {
      const raw = field.keyValue ?? field.value ?? field.text ?? '';
      const collectionField = collectionFieldForField({ keyName: field.keyName });
      if (collectionField) {
        const counts = collectionCounts.get(collectionField.collection) || { code: 0, name: 0 };
        for (const item of collectionParts(raw, collectionField.part)) {
          const rowId = collectionField.ordinal || String(counts[item.part]++);
          out.push(collectionEvidence({ episode, record, templateId, templateName, version, field, raw: item.value, collectionField, rowId, part: item.part, fieldIndex }));
        }
        collectionCounts.set(collectionField.collection, counts);
        continue;
      }
      const mapping = registryEntryForField({ keyCode: field.keyCode, keyName: field.keyName, templateId });
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
