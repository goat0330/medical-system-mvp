import { searchDip3DiagnosisCatalog } from './dip3-grouper.js';
import { isDrg3DiagnosisCodeSupported, searchDrg3DiagnosisCodes } from './drg-input-validator.js';

let dipNamesByCode = null;
function namesByCode() {
  if (!dipNamesByCode) dipNamesByCode = new Map(searchDip3DiagnosisCatalog('').map((item) => [item.code.toUpperCase(), item.name]));
  return dipNamesByCode;
}

export function searchDiagnosisCatalog(query = '', { paymentMethod = 'DRG', limit = 40 } = {}) {
  const term = String(query || '').trim();
  const method = String(paymentMethod || 'DRG').toUpperCase();
  const byCode = new Map();
  if (method !== 'DRG') {
    for (const item of searchDip3DiagnosisCatalog(term)) {
      byCode.set(item.code.toUpperCase(), { ...item, source: '国家医保诊断目录' });
    }
    return [...byCode.values()].slice(0, limit);
  }

  const numericQuery = /^[A-Z0-9.]+$/i.test(term);
  const addDrgCode = (code, name, nameStatus = 'MATCHED') => {
    if (!byCode.has(code)) byCode.set(code, {
      code, name: name || '已收录，名称待匹配', source: '国家 CHS-DRG 3.0', nameStatus,
    });
  };
  if (numericQuery) {
    for (const code of searchDrg3DiagnosisCodes(term, limit)) {
      const exactName = namesByCode().get(code);
      const relatedName = namesByCode().get(code.split(/X/i)[0]);
      addDrgCode(code, exactName || relatedName || '', exactName ? 'MATCHED' : relatedName ? 'CANDIDATE' : 'MISSING');
    }
  } else {
    for (const item of searchDip3DiagnosisCatalog(term)) {
      const exactCode = item.code.toUpperCase();
      if (isDrg3DiagnosisCodeSupported(exactCode)) addDrgCode(exactCode, item.name);
      const familyCodes = searchDrg3DiagnosisCodes(exactCode, limit * 4)
        .filter((code) => code.split(/X/i)[0] === exactCode);
      for (const code of familyCodes) addDrgCode(code, item.name, 'CANDIDATE');
    }
  }
  return [...byCode.values()].slice(0, limit);
}
