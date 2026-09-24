import { evidenceFromEpisode } from './adapters/episode-adapter.js';
import { evidenceFromDocumentSnapshots } from './adapters/document-adapter.js';
import { evidenceFromHis } from './adapters/his-adapter.js';
import { evidenceFromLis } from './adapters/lis-adapter.js';
import { evidenceFromRis } from './adapters/ris-adapter.js';
import { resolveClinicalFacts } from './reconciliation/fact-resolver.js';
import { detectFactConflicts, unresolvedBlockingConflicts } from './reconciliation/conflict-engine.js';
import { buildClinicalFactCollections } from './reconciliation/collection-resolver.js';
import { buildSettlementProjection } from './projection/settlement-projection.js';
import { buildGroupingFactProjection } from './projection/grouping-projection.js';
import { buildAuditProjection } from './projection/audit-projection.js';
import { buildFrontPageProjection } from './projection/frontpage-projection.js';

const safeStorage = () => typeof localStorage !== 'undefined' ? localStorage : null;
const decisionKey = (episodeId) => `medical-system:fact-decisions:${episodeId}`;
const contextKey = (episodeId) => `medical-system:clinical-facts:${episodeId}`;


export function loadClinicalFactContextSnapshot(episodeId, storage = safeStorage()) {
  if (!storage || !episodeId) return null;
  try { return JSON.parse(storage.getItem(contextKey(episodeId)) || 'null'); } catch { return null; }
}

export function persistClinicalFactContext(context, storage = safeStorage()) {
  if (!storage || !context?.episodeId) return context;
  const snapshot = {
    episodeId: context.episodeId, patientId: context.patientId, revision: context.revision,
    evidence: context.evidence, facts: context.facts, conflicts: context.conflicts, collections: context.collections, collectionConflicts: context.collectionConflicts, decisions: context.decisions,
    builtAt: new Date().toISOString(),
  };
  storage.setItem(contextKey(context.episodeId), JSON.stringify(snapshot));
  return context;
}

export function loadFactDecisions(episodeId, storage = safeStorage()) {
  if (!storage || !episodeId) return [];
  try { const parsed = JSON.parse(storage.getItem(decisionKey(episodeId)) || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

export function saveFactDecision(decision, storage = safeStorage()) {
  if (!storage) return decision;
  const current = loadFactDecisions(decision.episodeId, storage).filter((x) => x.concept !== decision.concept);
  current.push(decision);
  storage.setItem(decisionKey(decision.episodeId), JSON.stringify(current));
  return decision;
}

export function clearFactDecision(episodeId, concept, storage = safeStorage()) {
  if (!storage) return;
  const current = loadFactDecisions(episodeId, storage).filter((x) => x.concept !== concept);
  storage.setItem(decisionKey(episodeId), JSON.stringify(current));
}

export function buildClinicalFactContext({ episode, documentSnapshots = [], decisions = null } = {}) {
  if (!episode?.episodeId) throw new Error('episodeId is required to build clinical fact context');
  const chosenDecisions = (decisions || loadFactDecisions(episode.episodeId)).filter((item) => item.episodeId === episode.episodeId);
  const evidence = [
    ...evidenceFromEpisode(episode),
    ...evidenceFromDocumentSnapshots(episode, documentSnapshots),
    ...evidenceFromHis(episode),
    ...evidenceFromLis(episode),
    ...evidenceFromRis(episode),
  ].filter((item) => item.episodeId === episode.episodeId && (!item.patientId || !episode.patient?.patientId || item.patientId === episode.patient.patientId));
  const facts = resolveClinicalFacts({ episodeId: episode.episodeId, evidence, decisions: chosenDecisions });
  const conflicts = detectFactConflicts({ episodeId: episode.episodeId, evidence, facts });
  const { collections, conflicts: collectionConflicts } = buildClinicalFactCollections({ episodeId: episode.episodeId, evidence });
  const revisionSeed = JSON.stringify({
    episodeId: episode.episodeId,
    evidence: evidence.map((x) => [x.evidenceId, x.value, x.sourceVersion]),
    decisions: chosenDecisions.map((x) => [x.concept, x.selectedEvidenceId, x.selectedValue, x.decidedAt]),
  });
  let hash = 2166136261;
  for (let i = 0; i < revisionSeed.length; i += 1) hash = Math.imul(hash ^ revisionSeed.charCodeAt(i), 16777619);
  const context = {
    episodeId: episode.episodeId,
    patientId: episode.patient?.patientId || null,
    evidence,
    facts,
    conflicts,
    collections,
    collectionConflicts,
    decisions: chosenDecisions,
    revision: `FACT-${(hash >>> 0).toString(16).padStart(8,'0')}`,
  };
  context.blockingConflicts = unresolvedBlockingConflicts(conflicts);
  context.projections = {
    settlement: buildSettlementProjection(context),
    grouping: buildGroupingFactProjection(context),
    audit: buildAuditProjection(context),
    frontpage: buildFrontPageProjection(context),
  };
  persistClinicalFactContext(context);
  return context;
}

export { buildSettlementProjection, buildGroupingFactProjection, buildAuditProjection, buildFrontPageProjection };
