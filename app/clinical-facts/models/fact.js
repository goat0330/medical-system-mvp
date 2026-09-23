export const FACT_STATUS = Object.freeze({
  CANDIDATE: 'CANDIDATE',
  CONFIRMED: 'CONFIRMED',
  CONFLICTED: 'CONFLICTED',
  REJECTED: 'REJECTED',
  SUPERSEDED: 'SUPERSEDED',
});

export function createClinicalFact(input = {}) {
  if (!input.factId) throw new Error('ClinicalFact.factId is required');
  if (!input.episodeId) throw new Error('ClinicalFact.episodeId is required');
  if (!input.concept) throw new Error('ClinicalFact.concept is required');
  return Object.freeze({
    factId: input.factId,
    episodeId: input.episodeId,
    concept: input.concept,
    value: input.value ?? null,
    status: input.status || FACT_STATUS.CANDIDATE,
    evidenceIds: [...new Set(input.evidenceIds || [])],
    selectedEvidenceId: input.selectedEvidenceId || null,
    sourceClass: input.sourceClass || null,
    confidence: input.confidence ?? null,
    decidedAt: input.decidedAt || null,
    decisionId: input.decisionId || null,
    impactScope: [...new Set(input.impactScope || [])],
    metadata: input.metadata || {},
  });
}
