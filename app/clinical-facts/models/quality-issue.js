export function createQualityIssue(input = {}) {
  return Object.freeze({
    issueId: input.issueId,
    episodeId: input.episodeId,
    qcDomain: input.qcDomain || 'CROSS_DOCUMENT',
    type: input.type || 'FACT_CONFLICT',
    severity: input.severity || 'medium',
    title: input.title || input.message || '质控问题',
    message: input.message || '',
    source: input.source || null,
    field: input.field || null,
    target: input.target || null,
    ruleCode: input.ruleCode || null,
    factRefs: input.factRefs || [],
    evidenceRefs: input.evidenceRefs || [],
    conflictRefs: input.conflictRefs || [],
    impactScope: input.impactScope || [],
    status: input.status || 'PENDING_REVIEW',
    blocking: Boolean(input.blocking),
    action: input.action || null,
    metadata: input.metadata || {},
  });
}
