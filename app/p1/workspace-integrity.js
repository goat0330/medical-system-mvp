const WORKSPACE_PREFIX = 'medical-mvp-operational-v3:';
const SOURCE_PREFIX = 'medical-mvp-operational-source-v1:';
const ARCHIVE_PREFIX = 'medical-mvp-operational-archive-v1:';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
function hashText(text) { let h = 2166136261; for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return (h >>> 0).toString(16).padStart(8, '0'); }
function valueOf(v) { if (v && typeof v === 'object') return v.value ?? v.code ?? v.text ?? ''; return v ?? ''; }

export function buildWorkspaceSourceFingerprint({ episode, documentSnapshots = [] } = {}) {
  const payload = {
    episodeId: episode?.episodeId,
    patient: { sex: episode?.patient?.sex, age: episode?.patient?.age, birthDate: episode?.patient?.birthDate },
    diagnosis: {
      principal: episode?.diagnoses?.principal,
      secondary: (episode?.diagnoses?.secondary || []).map((x) => ({ code: x.code, name: x.name })),
    },
    procedures: (episode?.procedures || []).map((x) => ({ code: x.code, name: x.name, role: x.role })),
    admissionAt: episode?.admission?.at,
    dischargeAt: episode?.discharge?.at,
    documents: documentSnapshots.map((doc) => ({
      templateId: doc.templateId, savedAt: doc.savedAt, status: doc.status,
      data: (doc.snapshot?.data || []).map((field) => [field.keyCode, field.keyName, valueOf(field.keyValue)]),
    })),
  };
  return `SRC-${hashText(JSON.stringify(stable(payload)))}`;
}

export function workspaceStorageKey(episodeId) { return `${WORKSPACE_PREFIX}${episodeId}`; }
export function sourceFingerprintStorageKey(episodeId) { return `${SOURCE_PREFIX}${episodeId}`; }

export function reconcileStoredWorkspace({ episodeId, sourceFingerprint, storage = globalThis.localStorage } = {}) {
  if (!storage || !episodeId || !sourceFingerprint) return { reset: false, reason: 'NO_STORAGE' };
  const workspaceKey = workspaceStorageKey(episodeId);
  const sourceKey = sourceFingerprintStorageKey(episodeId);
  const rawWorkspace = storage.getItem(workspaceKey);
  const previousFingerprint = storage.getItem(sourceKey);
  let reset = false; let reason = 'SOURCE_UNCHANGED'; let archiveKey = null;
  if (rawWorkspace && previousFingerprint !== sourceFingerprint) {
    archiveKey = `${ARCHIVE_PREFIX}${episodeId}:${Date.now()}`;
    storage.setItem(archiveKey, rawWorkspace);
    storage.removeItem(workspaceKey);
    reset = true;
    reason = previousFingerprint ? 'PATIENT_SOURCE_CHANGED' : 'MIGRATED_LEGACY_WORKSPACE';
  }
  storage.setItem(sourceKey, sourceFingerprint);
  return { reset, reason, previousFingerprint, sourceFingerprint, archiveKey };
}
