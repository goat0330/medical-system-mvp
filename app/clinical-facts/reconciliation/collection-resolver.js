const SOURCE_PRIORITY = { FACT_DECISION: 0, FRONTPAGE: 1, DISCHARGE: 2, SURGERY: 3, ADMISSION: 4, PROGRESS: 5, EPISODE: 6 };
const normalizeCode = (value) => String(value ?? '').normalize('NFKC').replace(/\s+/g, '').toUpperCase();
const normalizeName = (value) => String(value ?? '').normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase();

function factId(episodeId, collection, identity) {
  return `CF-${episodeId}-${collection.replaceAll('.', '-')}-${encodeURIComponent(identity)}`;
}

function mergeEvidence(target, row) {
  const codeEvidence = row.codeEvidence || [];
  const nameEvidence = row.nameEvidence || [];
  target.evidenceRefs = [...new Set([...target.evidenceRefs, ...codeEvidence.map((item) => item.evidenceId), ...nameEvidence.map((item) => item.evidenceId)])];
  target.codeEvidenceRefs = [...new Set([...target.codeEvidenceRefs, ...codeEvidence.map((item) => item.evidenceId)])];
  target.nameEvidenceRefs = [...new Set([...target.nameEvidenceRefs, ...nameEvidence.map((item) => item.evidenceId)])];
  for (const item of [...codeEvidence, ...nameEvidence]) {
    const sourceName = item.metadata?.templateName || item.sourceDocumentType || item.sourceType;
    const key = `${item.evidenceId}:${item.value}`;
    if (!target.sources.some((source) => source.key === key)) target.sources.push({ key, sourceName, sourceType: item.sourceType, sourceClass: item.sourceClass, fieldName: item.fieldName, value: item.value, evidenceId: item.evidenceId });
  }
  for (const item of nameEvidence) {
    const name = String(item.value ?? '').trim();
    if (name && !target.names.some((entry) => entry.value === name)) target.names.push({ value: name, evidenceRefs: [item.evidenceId], sourceClass: item.sourceClass });
    else if (name) {
      const entry = target.names.find((candidate) => candidate.value === name);
      entry.evidenceRefs = [...new Set([...entry.evidenceRefs, item.evidenceId])];
    }
  }
}

export function buildClinicalFactCollections({ episodeId, evidence = [] } = {}) {
  const rows = new Map();
  for (const item of evidence) {
    const collection = item.metadata?.collection;
    const rowId = item.metadata?.collectionRowId;
    const part = item.metadata?.collectionPart;
    if (!['diagnosis.secondary', 'procedure.others'].includes(collection) || rowId == null || !['code', 'name'].includes(part)) continue;
    const sourceKey = [collection, item.sourceType, item.sourceDocumentId || item.sourceId || '', item.sourceVersion || '', rowId].join('|');
    const row = rows.get(sourceKey) || { collection, codeEvidence: [], nameEvidence: [] };
    row[`${part}Evidence`].push(item);
    rows.set(sourceKey, row);
  }

  const result = { 'diagnosis.secondary': [], 'procedure.others': [] };
  const conflicts = [];
  for (const row of rows.values()) {
    const codeValues = [...new Set(row.codeEvidence.map((item) => normalizeCode(item.value)).filter(Boolean))];
    const names = [...new Set(row.nameEvidence.map((item) => String(item.value ?? '').trim()).filter(Boolean))];
    if (codeValues.length > 1) {
      const source = row.codeEvidence.map((item) => item.sourceDocumentId || item.sourceId || '').join('-');
      const rowId = row.codeEvidence[0]?.metadata?.collectionRowId || '';
      conflicts.push({
        conflictId: `COLLECTION-${episodeId}-${encodeURIComponent(row.collection)}-${encodeURIComponent(source)}-${encodeURIComponent(rowId)}`,
        episodeId, collection: row.collection, blocking: true,
        reason: `同一结构化来源的${row.collection==='diagnosis.secondary'?'其他诊断':'其他手术/操作'}行包含多个不同编码。`,
        candidates: codeValues.map((code) => ({ value: code, evidenceIds: row.codeEvidence.filter((item) => normalizeCode(item.value) === code).map((item) => item.evidenceId) })),
      });
    }
    const candidates = codeValues.length ? codeValues : [null];
    for (const code of candidates) {
      const identity = code ? `CODE:${code}` : names[0] ? `NAME:${normalizeName(names[0])}` : '';
      if (!identity) continue;
      const target = result[row.collection].find((item) => item.identity === identity) || {
        itemId: factId(episodeId, row.collection, identity), factId: factId(episodeId, row.collection, identity),
        identity, collection: row.collection, code, name: '', names: [], evidenceRefs: [], sources: [], status: code ? 'MAPPED' : 'INCOMPLETE',
        codeEvidenceRefs: [], nameEvidenceRefs: [],
      };
      const candidateRow = { ...row, codeEvidence: code ? row.codeEvidence.filter((item) => normalizeCode(item.value) === code) : [] };
      mergeEvidence(target, candidateRow);
      if (!target._inserted) {
        target._inserted = true;
        result[row.collection].push(target);
      }
    }
  }

  for (const collection of Object.keys(result)) {
    const items = result[collection];
    for (const item of items) {
      item.sources.sort((a, b) => (SOURCE_PRIORITY[a.sourceClass] ?? 99) - (SOURCE_PRIORITY[b.sourceClass] ?? 99));
      item.names.sort((a, b) => (SOURCE_PRIORITY[a.sourceClass] ?? 99) - (SOURCE_PRIORITY[b.sourceClass] ?? 99));
      item.name = item.names[0]?.value || '';
      delete item.identity;
      delete item._inserted;
    }
    const coded = items.filter((item) => item.code);
    for (const item of items.filter((candidate) => !candidate.code)) {
      const matches = coded.filter((candidate) => candidate.names.some((name) => normalizeName(name.value) === normalizeName(item.name)));
      if (matches.length === 1) {
        const target = matches[0];
        target.evidenceRefs = [...new Set([...target.evidenceRefs, ...item.evidenceRefs])];
        target.nameEvidenceRefs = [...new Set([...target.nameEvidenceRefs, ...item.nameEvidenceRefs])];
        target.sources.push(...item.sources.filter((source) => !target.sources.some((candidate) => candidate.key === source.key)));
        target.names.push(...item.names.filter((name) => !target.names.some((candidate) => candidate.value === name.value)));
        items.splice(items.indexOf(item), 1);
      }
    }
    for (const item of items) {
      item.sources = item.sources.map(({ key, ...source }) => source);
      item.factRefs = { factId: item.factId, evidenceRefs: item.evidenceRefs };
      item.sourceStatus = {
        code: { sourceType: item.sources.find((source) => source.fieldName && /编码|代码/.test(source.fieldName))?.sourceType || 'UNMAPPED', status: item.code ? 'MAPPED' : 'MISSING', factId: item.factId, evidenceRefs: item.codeEvidenceRefs },
        name: { sourceType: item.sources.find((source) => source.fieldName && /名称|诊断|手术|操作/.test(source.fieldName))?.sourceType || 'UNMAPPED', status: item.name ? 'MAPPED' : 'MISSING', factId: item.factId, evidenceRefs: item.nameEvidenceRefs },
      };
      delete item.codeEvidenceRefs;
      delete item.nameEvidenceRefs;
      item.sourceNames = [...new Set(item.sources.map((source) => source.sourceName).filter(Boolean))];
    }
  }
  return { collections: result, conflicts };
}
