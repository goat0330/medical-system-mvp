import { createQualityIssue } from '../models/quality-issue.js';
export function qualityIssuesFromFactConflicts(context) {
  return (context?.conflicts || []).map((conflict) => createQualityIssue({
    issueId: `QI-${conflict.conflictId}`,
    episodeId: context.episodeId,
    qcDomain: 'CROSS_DOCUMENT',
    type: 'CROSS_SOURCE_CONFLICT',
    severity: conflict.severity,
    title: `多源事实冲突：${conflict.concept}`,
    message: conflict.reason,
    factRefs: (context.facts || []).filter((x) => x.concept === conflict.concept).map((x) => x.factId),
    evidenceRefs: (conflict.candidates || []).map((x) => x.evidenceId).filter(Boolean),
    conflictRefs: [conflict.conflictId],
    impactScope: conflict.impactScope,
    blocking: conflict.blocking,
  }));
}
