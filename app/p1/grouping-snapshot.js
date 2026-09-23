function normalizeSex(value) {
  const s = String(value || '');
  if (s === '男' || s === '1') return 1;
  if (s === '女' || s === '2') return 2;
  return null;
}

export function buildGroupingSnapshot({ episode, settlement }) {
  const principal = settlement?.inpatient?.principalDiagnosis || episode?.diagnoses?.principal || null;
  const secondary = settlement?.inpatient?.secondaryDiagnoses || episode?.diagnoses?.secondary || [];
  const primaryProcedure = settlement?.procedures?.primary || episode?.procedures?.[0] || null;
  const otherProcedures = settlement?.procedures?.others || episode?.procedures?.slice?.(1) || [];
  return {
    snapshotType: 'GROUPING_INPUT',
    episodeId: episode?.episodeId,
    patient: {
      sex: normalizeSex(episode?.patient?.sex),
      age: Number(episode?.patient?.age ?? NaN),
      birthDate: episode?.patient?.birthDate || null,
      ageInDays: episode?.patient?.ageInDays ?? episode?.clinicalProcess?.newbornAgeDays ?? null,
      newbornWeight: episode?.patient?.newbornWeight ?? episode?.clinicalProcess?.newbornWeight ?? null,
    },
    principalDiagnosis: principal ? { code: principal.code, name: principal.name } : null,
    secondaryDiagnoses: secondary.map((x) => ({ code: x.code, name: x.name })),
    principalProcedure: primaryProcedure ? { code: primaryProcedure.code, name: primaryProcedure.name } : null,
    otherProcedures: otherProcedures.map((x) => ({ code: x.code, name: x.name })),
    discharge: {
      method: episode?.discharge?.method || null,
      at: episode?.discharge?.at || null,
    },
    clinicalFactors: {
      lengthOfStay: settlement?.inpatient?.lengthOfStay ?? null,
      ventilatorDuration: episode?.clinicalProcess?.ventilatorDuration || null,
      icuStays: episode?.clinicalProcess?.icuStays || [],
    },
    source: {
      settlementClaimSerialNumber: settlement?.claimSerialNumber || null,
      medicalRecordNumber: settlement?.medicalRecordNumber || null,
    },
  };
}
