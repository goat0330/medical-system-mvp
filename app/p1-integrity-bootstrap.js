import { preparePatientCase } from './p1/current-case-adapter.js';
import { buildWorkspaceSourceFingerprint, reconcileStoredWorkspace } from './p1/workspace-integrity.js';
import { normalizeSyntheticPatientEpisode } from './p1/patient-integrity.js';

const STATE_KEY = '__medicalSystemIntegrityState';

function synchronizeCurrentPatient(api) {
  const context = api?.getEpisodeContext?.(); const episode = context?.episode; if (!episode?.episodeId) return null;
  const normalized = normalizeSyntheticPatientEpisode(episode);
  const patientCase = preparePatientCase(episode);
  const sourceEpisode = patientCase?.episode || episode;
  const sourceFingerprint = buildWorkspaceSourceFingerprint({ episode: sourceEpisode, documentSnapshots: patientCase?.docs || [], clinicalFactContext: sourceEpisode.clinicalFactContext });
  const workspace = reconcileStoredWorkspace({ episodeId: episode.episodeId, sourceFingerprint });
  const state = { episodeId: episode.episodeId, sourceFingerprint, normalizedSyntheticIdentity: normalized.changed, workspace, at: new Date().toISOString() };
  window[STATE_KEY] = state;
  window.dispatchEvent(new CustomEvent('medical-system:source-integrity', { detail: state }));
  return state;
}

function init() {
  const api = window.medicalSystemMvp; if (!api?.getEpisodeContext || api.__sourceIntegrityWrapped) return false;
  api.__sourceIntegrityWrapped = true;
  const originalGet = api.getEpisodeContext.bind(api);
  api.getEpisodeContext = (...args) => { const context = originalGet(...args); normalizeSyntheticPatientEpisode(context?.episode); return context; };
  if (api.selectPatientByKey) {
    const originalSelect = api.selectPatientByKey.bind(api);
    api.selectPatientByKey = (key) => { const result = originalSelect(key); synchronizeCurrentPatient(api); return result; };
  }
  synchronizeCurrentPatient(api); return true;
}

let tries = 0;
function boot() { if (init()) return; if (tries++ < 40) setTimeout(boot, 25); }
boot();
window.addEventListener('load', () => synchronizeCurrentPatient(window.medicalSystemMvp));
