function fact(context, concept) { return context.facts.find((x) => x.concept === concept && x.status === 'CONFIRMED') || null; }
function ref(x) { return x ? { factId: x.factId, evidenceRefs: x.evidenceIds, selectedEvidenceId: x.selectedEvidenceId } : {}; }
export function buildGroupingFactProjection(context) {
  const sex = fact(context,'patient.sex'), age = fact(context,'patient.age'), birth = fact(context,'patient.birthDate');
  const dxCode = fact(context,'diagnosis.principal.code'), dxName = fact(context,'diagnosis.principal.name');
  const opCode = fact(context,'procedure.primary.code'), opName = fact(context,'procedure.primary.name');
  return {
    patient: {
      sex: sex?.value ?? null, age: age?.value ?? null, birthDate: birth?.value ?? null,
      factRefs: { sex: ref(sex), age: ref(age), birthDate: ref(birth) },
    },
    principalDiagnosis: dxCode || dxName ? { code: dxCode?.value || '', name: dxName?.value || '', factRefs: { code: ref(dxCode), name: ref(dxName) } } : null,
    principalProcedure: opCode || opName ? { code: opCode?.value || '', name: opName?.value || '', factRefs: { code: ref(opCode), name: ref(opName) } } : null,
    quality: {
      conflicts: context.conflicts.filter((x) => x.impactScope.includes('GROUPING')),
      blockingConflicts: context.conflicts.filter((x) => x.blocking && x.impactScope.includes('GROUPING')),
    },
    factRevision: context.revision,
  };
}
