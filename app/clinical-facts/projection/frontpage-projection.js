export function buildFrontPageProjection(context) {
  return Object.fromEntries(context.facts.filter((x) => x.status === 'CONFIRMED' && x.impactScope.includes('FRONTPAGE')).map((x) => [x.concept, {
    value: x.value, factId: x.factId, evidenceRefs: x.evidenceIds, selectedEvidenceId: x.selectedEvidenceId,
  }]));
}
