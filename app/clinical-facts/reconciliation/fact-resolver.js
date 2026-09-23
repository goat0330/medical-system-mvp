import { createClinicalFact, FACT_STATUS } from '../models/fact.js';
import { MAPPING_BY_CONCEPT, normalizeMappedValue } from '../mapping/mapping-registry.js';

const stable = (value) => JSON.stringify(value);
const equalByPolicy = (concept, a, b) => {
  const policy = MAPPING_BY_CONCEPT[concept]?.conflictPolicy || 'exact';
  if (policy === 'numeric') return Number(a) === Number(b);
  if (policy === 'datetime') {
    const da = new Date(a), db = new Date(b);
    return Number.isFinite(da.getTime()) && Number.isFinite(db.getTime()) ? Math.abs(da - db) < 60000 : String(a) === String(b);
  }
  return stable(a) === stable(b);
};

function decisionFor(concept, decisions = []) {
  return [...decisions].reverse().find((d) => d.concept === concept) || null;
}

function chooseByPriority(mapping, candidates) {
  const priority = mapping?.sourcePriority || [];
  return [...candidates].sort((a, b) => {
    const ai = priority.indexOf(a.sourceClass); const bi = priority.indexOf(b.sourceClass);
    const ap = ai < 0 ? 999 : ai; const bp = bi < 0 ? 999 : bi;
    if (ap !== bp) return ap - bp;
    return String(b.recordedAt || '').localeCompare(String(a.recordedAt || ''));
  })[0] || null;
}

export function resolveClinicalFacts({ episodeId, evidence = [], decisions = [] } = {}) {
  const grouped = new Map();
  for (const item of evidence) {
    if (!item.concept) continue;
    if (!grouped.has(item.concept)) grouped.set(item.concept, []);
    grouped.get(item.concept).push(item);
  }
  const facts = [];
  for (const [concept, candidates] of grouped.entries()) {
    const mapping = MAPPING_BY_CONCEPT[concept] || { impactScope: [] };
    const normalized = candidates.map((x) => ({ ...x, normalizedValue: normalizeMappedValue(concept, x.value) }));
    const unique = [];
    for (const candidate of normalized) {
      if (!unique.some((x) => equalByPolicy(concept, x.normalizedValue, candidate.normalizedValue))) unique.push(candidate);
    }
    const decision = decisionFor(concept, decisions);
    let chosen = null;
    let status = FACT_STATUS.CANDIDATE;
    if (decision) {
      chosen = normalized.find((x) => x.evidenceId === decision.selectedEvidenceId)
        || normalized.find((x) => equalByPolicy(concept, x.normalizedValue, normalizeMappedValue(concept, decision.selectedValue)));
      if (!chosen && decision.selectedValue !== undefined && decision.selectedValue !== null) {
        chosen = { evidenceId: decision.selectedEvidenceId || decision.decisionId, sourceClass: 'FACT_DECISION', normalizedValue: normalizeMappedValue(concept, decision.selectedValue), recordedAt: decision.decidedAt };
      }
      if (chosen) status = FACT_STATUS.CONFIRMED;
    }
    if (!chosen && unique.length === 1) {
      chosen = chooseByPriority(mapping, normalized);
      status = FACT_STATUS.CONFIRMED;
    }
    if (!chosen && unique.length > 1) {
      chosen = chooseByPriority(mapping, normalized);
      status = FACT_STATUS.CONFLICTED;
    }
    if (!chosen) continue;
    facts.push(createClinicalFact({
      factId: `FACT-${episodeId}-${concept.replace(/[^a-zA-Z0-9]+/g,'-')}`,
      episodeId,
      concept,
      value: chosen.normalizedValue,
      status,
      evidenceIds: [...new Set([...normalized.map((x) => x.evidenceId), ...(decision && chosen?.sourceClass === 'FACT_DECISION' ? [chosen.evidenceId] : [])])],
      selectedEvidenceId: status === FACT_STATUS.CONFIRMED ? chosen.evidenceId : null,
      sourceClass: chosen.sourceClass,
      decisionId: decision?.decisionId || null,
      decidedAt: decision?.decidedAt || null,
      impactScope: mapping.impactScope || [],
      metadata: { candidateValues: unique.map((x) => x.normalizedValue) },
    }));
  }
  return facts;
}
