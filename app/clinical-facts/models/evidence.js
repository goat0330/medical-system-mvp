export function createEvidenceItem(input = {}) {
  if (!input.evidenceId) throw new Error('EvidenceItem.evidenceId is required');
  if (!input.episodeId) throw new Error('EvidenceItem.episodeId is required');
  return Object.freeze({
    evidenceId: input.evidenceId,
    episodeId: input.episodeId,
    patientId: input.patientId || null,
    sourceType: input.sourceType || 'UNKNOWN',
    sourceClass: input.sourceClass || input.sourceType || 'UNKNOWN',
    sourceId: input.sourceId || null,
    sourceDocumentType: input.sourceDocumentType || null,
    sourceDocumentId: input.sourceDocumentId || null,
    sourceVersion: input.sourceVersion || null,
    fieldCode: input.fieldCode || null,
    fieldName: input.fieldName || null,
    concept: input.concept || null,
    value: input.value ?? null,
    eventTime: input.eventTime || null,
    recordedAt: input.recordedAt || null,
    excerpt: input.excerpt || '',
    factPath: input.factPath || null,
    structuredValue: input.structuredValue ?? null,
    metadata: input.metadata || {},
  });
}
