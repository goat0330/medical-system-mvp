export function createFactDecision(input = {}) {
  if (!input.decisionId) throw new Error('FactDecision.decisionId is required');
  return Object.freeze({
    decisionId: input.decisionId,
    episodeId: input.episodeId,
    concept: input.concept,
    selectedEvidenceId: input.selectedEvidenceId || null,
    selectedValue: input.selectedValue ?? null,
    actorRole: input.actorRole || 'HUMAN_REVIEWER',
    actorName: input.actorName || null,
    reason: input.reason || '',
    decidedAt: input.decidedAt || new Date().toISOString(),
  });
}
