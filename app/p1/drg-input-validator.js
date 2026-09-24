import { DRG3_OFFICIAL } from './rules/compiled/drg3-official.js';

export const DRG_LOCAL_CODING_CROSSWALK = Object.freeze([
  Object.freeze({ from: 'K80.3', to: 'K80.302', reason: '项目现有本地编码候选映射；正式使用前仍需编码员确认。' }),
]);

let DIAGNOSIS_INDEX = null;
let DIAGNOSIS_CANONICAL_CODES = null;
function normalizeCode(value) { return String(value || '').trim().toUpperCase(); }
function diagnosisIndex() {
  if (DIAGNOSIS_INDEX) return DIAGNOSIS_INDEX;
  const byCode = new Map();
  const canonicalCodes = new Map();
  for (const [setName, codes] of Object.entries(DRG3_OFFICIAL.sets || {})) {
    if (!/^DI_/i.test(setName)) continue;
    for (const raw of codes || []) {
      const code = normalizeCode(raw);
      if (!code) continue;
      if (!canonicalCodes.has(code)) canonicalCodes.set(code, String(raw).trim());
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code).push(setName);
    }
  }
  DIAGNOSIS_INDEX = byCode;
  DIAGNOSIS_CANONICAL_CODES = canonicalCodes;
  return DIAGNOSIS_INDEX;
}

export function getDrg3DiagnosisSupport(code) {
  const rawCode = normalizeCode(code);
  if (!rawCode) return { code: rawCode, supported: false, status: 'MISSING', matchedSets: [], effectiveCode: rawCode };
  const direct = diagnosisIndex().get(rawCode) || [];
  if (direct.length) return { code: rawCode, supported: true, status: 'SUPPORTED', matchedSets: direct, effectiveCode: rawCode };
  const mapping = DRG_LOCAL_CODING_CROSSWALK.find((item) => normalizeCode(item.from) === rawCode);
  if (mapping) {
    const mappedSets = diagnosisIndex().get(normalizeCode(mapping.to)) || [];
    if (mappedSets.length) return {
      code: rawCode, supported: true, status: 'MAPPED_CANDIDATE', matchedSets: mappedSets,
      effectiveCode: normalizeCode(mapping.to), mapping,
    };
  }
  return { code: rawCode, supported: false, status: 'UNSUPPORTED', matchedSets: [], effectiveCode: rawCode };
}

export function isDrg3DiagnosisCodeSupported(code) { return getDrg3DiagnosisSupport(code).supported; }

export function searchDrg3DiagnosisCodes(query = '', limit = 40) {
  const term = normalizeCode(query);
  if (!term) return [];
  diagnosisIndex();
  return [...DIAGNOSIS_INDEX.keys()]
    .filter((code) => code.includes(term))
    .sort((a, b) => Number(b === term) - Number(a === term) || Number(b.startsWith(term)) - Number(a.startsWith(term)) || a.localeCompare(b))
    .slice(0, limit)
    .map((code) => DIAGNOSIS_CANONICAL_CODES.get(code) || code);
}

function duplicateCodes(items = []) {
  const seen = new Set(); const duplicates = new Set();
  for (const item of items) {
    const code = normalizeCode(item?.code ?? item);
    if (!code) continue;
    if (seen.has(code)) duplicates.add(code); else seen.add(code);
  }
  return [...duplicates];
}

export function validateGroupingInputIntegrity({ paymentMethod = 'DRG', snapshot } = {}) {
  const method = String(paymentMethod || '').toUpperCase();
  const errors = []; const warnings = [];
  const principal = normalizeCode(snapshot?.principalDiagnosis?.code);
  const secondaries = (snapshot?.secondaryDiagnoses || []).map((x) => normalizeCode(x?.code)).filter(Boolean);
  const primaryProcedure = normalizeCode(snapshot?.principalProcedure?.code);
  const otherProcedures = (snapshot?.otherProcedures || []).map((x) => normalizeCode(x?.code)).filter(Boolean);

  if (!principal) errors.push({ code: 'PRINCIPAL_DIAGNOSIS_REQUIRED', message: '缺少主要诊断编码。', field: 'principalDiagnosis.code' });
  if (principal && secondaries.includes(principal)) errors.push({ code: 'PRINCIPAL_DIAGNOSIS_DUPLICATED', message: `主要诊断 ${principal} 同时出现在其他诊断中。`, field: 'secondaryDiagnoses' });
  for (const code of duplicateCodes(secondaries)) errors.push({ code: 'SECONDARY_DIAGNOSIS_DUPLICATED', message: `其他诊断 ${code} 重复录入。`, field: 'secondaryDiagnoses' });
  if (primaryProcedure && otherProcedures.includes(primaryProcedure)) errors.push({ code: 'PRIMARY_PROCEDURE_DUPLICATED', message: `主要手术/操作 ${primaryProcedure} 同时出现在其他手术/操作中。`, field: 'otherProcedures' });
  for (const code of duplicateCodes(otherProcedures)) errors.push({ code: 'OTHER_PROCEDURE_DUPLICATED', message: `其他手术/操作 ${code} 重复录入。`, field: 'otherProcedures' });

  let principalSupport = null;
  if (method === 'DRG' && principal) {
    principalSupport = getDrg3DiagnosisSupport(principal);
    if (!principalSupport.supported) {
      errors.push({
        code: 'DRG_PRINCIPAL_DIAGNOSIS_UNSUPPORTED',
        message: `主要诊断编码 ${principal} 未被当前 DRG 3.0 官方规则诊断集合精确收录，不能把 NOT_GROUPED 当作可信分组结果。`,
        field: 'principalDiagnosis.code',
      });
    } else if (principalSupport.status === 'MAPPED_CANDIDATE') {
      warnings.push({
        code: 'DRG_PRINCIPAL_DIAGNOSIS_MAPPING_REQUIRED',
        message: `${principal} 需先映射为 ${principalSupport.effectiveCode} 并由编码员确认。`,
        field: 'principalDiagnosis.code', mapping: principalSupport.mapping,
      });
    }
  }

  return {
    ok: errors.length === 0,
    paymentMethod: method,
    errors,
    warnings,
    principalSupport,
    checkedAt: new Date().toISOString(),
  };
}

export function getDrg3DiagnosisIndexMeta() {
  return { exactDiagnosisCodes: diagnosisIndex().size, rulePackId: DRG3_OFFICIAL.id, version: DRG3_OFFICIAL.version, sha256: DRG3_OFFICIAL.sha256 };
}
