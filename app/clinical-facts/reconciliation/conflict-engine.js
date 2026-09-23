import { createFactConflict } from '../models/conflict.js';
import { MAPPING_BY_CONCEPT, normalizeMappedValue } from '../mapping/mapping-registry.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function genericConflicts({ episodeId, evidence, facts }) {
  const out = [];
  for (const fact of facts.filter((x) => x.status === 'CONFLICTED')) {
    const mapping = MAPPING_BY_CONCEPT[fact.concept] || {};
    const candidates = evidence.filter((x) => fact.evidenceIds.includes(x.evidenceId)).map((x) => ({
      evidenceId: x.evidenceId,
      value: normalizeMappedValue(fact.concept, x.value),
      sourceType: x.sourceType,
      sourceClass: x.sourceClass,
      sourceDocumentType: x.sourceDocumentType,
      sourceVersion: x.sourceVersion,
      fieldCode: x.fieldCode,
      fieldName: x.fieldName,
      excerpt: x.excerpt,
    }));
    out.push(createFactConflict({
      conflictId: `CONFLICT-${episodeId}-${fact.concept.replace(/[^a-zA-Z0-9]+/g,'-')}`,
      episodeId,
      concept: fact.concept,
      severity: mapping.critical ? 'high' : 'medium',
      blocking: Boolean(mapping.critical),
      candidates,
      reason: `同一患者事实“${fact.concept}”存在多个不一致来源，不能静默覆盖。`,
      impactScope: mapping.impactScope || [],
    }));
  }
  return out;
}

function derivedAgeConflict({ episodeId, evidence, facts }) {
  const birth = facts.find((x) => x.concept === 'patient.birthDate' && x.status === 'CONFIRMED');
  const admission = facts.find((x) => x.concept === 'admission.at' && x.status === 'CONFIRMED');
  const age = facts.find((x) => x.concept === 'patient.age');
  if (!birth || !admission || !age) return null;
  const b = new Date(birth.value); const a = new Date(admission.value);
  if (!Number.isFinite(b.getTime()) || !Number.isFinite(a.getTime())) return null;
  let computed = a.getUTCFullYear() - b.getUTCFullYear();
  const beforeBirthday = a.getUTCMonth() < b.getUTCMonth() || (a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() < b.getUTCDate());
  if (beforeBirthday) computed -= 1;
  const recorded = Number(age.value);
  if (!Number.isFinite(recorded) || Math.abs(recorded - computed) <= 1) return null;
  const ageEvidence = evidence.filter((x) => age.evidenceIds.includes(x.evidenceId)).map((x) => ({
    evidenceId: x.evidenceId, value: x.value, sourceType: x.sourceType, sourceClass: x.sourceClass,
    sourceDocumentType: x.sourceDocumentType, sourceVersion: x.sourceVersion, fieldCode: x.fieldCode, fieldName: x.fieldName, excerpt: x.excerpt,
  }));
  return createFactConflict({
    conflictId: `CONFLICT-${episodeId}-patient-age-derived`,
    episodeId,
    concept: 'patient.age',
    severity: 'high', blocking: true,
    reason: `记录年龄 ${recorded} 岁与出生日期 + 入院日期推算年龄 ${computed} 岁不一致。`,
    impactScope: ['FRONTPAGE','SETTLEMENT','GROUPING','AUDIT'],
    candidates: [
      ...ageEvidence,
      { evidenceId: 'DERIVED-AGE', value: computed, sourceType: 'DERIVED', sourceClass: 'DERIVED', excerpt: `由出生日期 ${String(birth.value).slice(0,10)} 与入院日期 ${String(admission.value).slice(0,10)} 推算` },
    ],
  });
}

export function detectFactConflicts({ episodeId, evidence = [], facts = [] } = {}) {
  let conflicts = genericConflicts({ episodeId, evidence, facts });
  const derived = derivedAgeConflict({ episodeId, evidence, facts });
  if (derived) {
    conflicts = conflicts.filter((x) => x.concept !== 'patient.age');
    conflicts.push(derived);
  }
  return conflicts;
}

export function unresolvedBlockingConflicts(conflicts = []) {
  return conflicts.filter((x) => x.blocking && x.status !== 'RESOLVED');
}
