import { settlementPathForConcept } from '../mapping/mapping-registry.js';
export function buildSettlementProjection(context) {
  const fields = {};
  for (const fact of context.facts) {
    if (fact.status !== 'CONFIRMED') continue;
    const path = settlementPathForConcept(fact.concept);
    if (!path) continue;
    fields[path] = { value: fact.value, factId: fact.factId, evidenceRefs: fact.evidenceIds, selectedEvidenceId: fact.selectedEvidenceId };
  }
  return { episodeId: context.episodeId, revision: context.revision, fields, conflicts: context.conflicts.filter((x) => x.impactScope.includes('SETTLEMENT')) };
}
