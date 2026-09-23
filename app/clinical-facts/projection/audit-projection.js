export function buildAuditProjection(context) {
  return {
    episodeId: context.episodeId,
    factRevision: context.revision,
    confirmedFacts: context.facts.filter((x) => x.status === 'CONFIRMED'),
    conflicts: context.conflicts.filter((x) => x.impactScope.includes('AUDIT')),
    evidence: context.evidence,
  };
}
