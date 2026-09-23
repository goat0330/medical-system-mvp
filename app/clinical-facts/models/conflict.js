export function createFactConflict(input = {}) {
  if (!input.conflictId) throw new Error('FactConflict.conflictId is required');
  return Object.freeze({
    conflictId: input.conflictId,
    episodeId: input.episodeId,
    concept: input.concept,
    severity: input.severity || 'medium',
    status: input.status || 'PENDING_CONFIRMATION',
    candidates: input.candidates || [],
    reason: input.reason || '',
    impactScope: [...new Set(input.impactScope || [])],
    blocking: Boolean(input.blocking),
  });
}
