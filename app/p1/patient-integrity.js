const GOLDEN_DATASET_ID = 'GOLDEN-CN-INPATIENT-CHOLE-001';
export function isGoldenEpisode(episode) { return Boolean(episode?.goldenData || episode?.datasetId === GOLDEN_DATASET_ID); }
export function ageAt(date, birthDate) {
  const d = new Date(date), b = new Date(birthDate); if (!Number.isFinite(d.getTime()) || !Number.isFinite(b.getTime())) return null;
  let age = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) age -= 1;
  return age;
}
export function birthDateForAge(admissionAt, age, seedBirthDate = '2000-02-18') {
  const a = new Date(admissionAt), seed = new Date(seedBirthDate); if (!Number.isFinite(a.getTime()) || !Number.isFinite(Number(age))) return seedBirthDate;
  const year = a.getFullYear() - Number(age); const month = Number.isFinite(seed.getTime()) ? seed.getMonth() : 1; const day = Number.isFinite(seed.getTime()) ? seed.getDate() : 18;
  const candidate = new Date(year, month, day); if (candidate > a) candidate.setFullYear(year - 1);
  return `${candidate.getFullYear()}-${String(candidate.getMonth()+1).padStart(2,'0')}-${String(candidate.getDate()).padStart(2,'0')}`;
}
export function normalizeSyntheticPatientEpisode(episode) {
  if (!episode || isGoldenEpisode(episode) || !episode.synthetic) return { changed: false, episode };
  const recordedAge = Number(episode.patient?.age); const currentBirthDate = episode.patient?.birthDate; const derived = ageAt(episode.admission?.at, currentBirthDate);
  let changed = false;
  if (Number.isFinite(recordedAge) && derived !== null && Math.abs(derived - recordedAge) > 1) {
    episode.patient.birthDate = birthDateForAge(episode.admission?.at, recordedAge, currentBirthDate);
    changed = true;
  }
  episode.syntheticCaseId = episode.syntheticCaseId || `SYNTH-${episode.episodeId}`;
  return { changed, episode };
}
