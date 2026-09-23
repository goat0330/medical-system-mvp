export function buildDocumentProjection(context, concepts = []) {
  const wanted = new Set(concepts);
  return context.facts.filter((x) => x.status === 'CONFIRMED' && (!wanted.size || wanted.has(x.concept))).map((x) => ({
    concept: x.concept, value: x.value, factId: x.factId, evidenceRefs: x.evidenceIds, selectedEvidenceId: x.selectedEvidenceId,
  }));
}
