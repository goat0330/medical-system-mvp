import { buildSettlementList, validateSettlementList } from '../domain/settlement.js';
import { buildGroupingSnapshot } from './grouping-snapshot.js';
import { routePaymentPolicy } from './payment-policy-router.js';
import { groupDrg3 } from './drg3-grouper.js';
import { groupDip3 } from './dip3-grouper.js';
import { calculatePayment } from './payment-calculator.js';
import { runInsuranceAudit } from './audit-engine.js';

function runGrouper(route,snapshot,confirmedMappings){
  if(route.paymentMethod==='DRG') return groupDrg3(snapshot,{confirmedMappings});
  if(route.paymentMethod==='DIP') return groupDip3(snapshot,{confirmedMappings});
  return {status:'OTHER_PAYMENT',method:'OTHER',group:null,trace:[]};
}
function freezeRun(type,{episode,workspace}){
  const settlement=buildSettlementList(episode),issues=validateSettlementList(settlement),route=routePaymentPolicy({episode,policyProfileId:workspace.policyProfileId}),snapshot=buildGroupingSnapshot({episode,settlement}),groupingResult=runGrouper(route,snapshot,workspace.confirmedMappings||[]),paymentResult=calculatePayment({route,groupingResult,episode,localParameters:workspace.localPaymentParameters});
  return {runId:`${type}-${episode.episodeId}-${Date.now()}`,runType:type,createdAt:new Date().toISOString(),revision:workspace.revision||1,route,settlement,settlementIssues:issues,groupingSnapshot:snapshot,groupingResult,paymentResult};
}
export function runPreGrouping({episode,workspace}){return freezeRun('HOSPITAL_PRE_GROUPING',{episode,workspace});}
export function runFormalGrouping({episode,workspace}){const run=freezeRun('PAYER_FORMAL_GROUPING_LOCAL_REPLICA',{episode,workspace});const blocking=run.settlementIssues.filter((x)=>x.severity==='error');if(blocking.length){run.groupingResult={status:'BLOCKED_BY_DATA_QUALITY',method:run.route.paymentMethod,group:null,trace:[{stage:'FORMAL_SUBMISSION_VALIDATION',status:'BLOCKED',input:'医保结算清单',output:`${blocking.length}个阻断错误`,rule:'正式分组前先通过医保结算清单数据质量校验'}]};run.paymentResult={status:'NOT_CALCULATED',reason:'正式分组被数据质量阻断。',amount:null};run.formalStatus='BLOCKED_BY_DATA_QUALITY';return run;}if(run.groupingResult?.mappingConfirmationRequired){run.formalStatus='PENDING_CODING_CONFIRMATION';run.paymentResult={status:'NOT_CALCULATED',reason:'编码标准化候选尚未由编码员确认，正式分组结果只能作为试算。',amount:null};return run;}run.formalStatus=run.groupingResult?.group?'FORMAL_GROUPED':'NOT_GROUPED';return run;}
export function runAuditAgainstFormal({episode,workspace,formalRun}){if(!formalRun?.groupingResult?.group)return {blocked:true,reason:'请先锁定结算快照并完成正式分组。'};if(formalRun.formalStatus==='PENDING_CODING_CONFIRMATION')return {blocked:true,reason:'正式分组仍待编码员确认标准编码，不能进入正式医保审核。'};const auditRun=runInsuranceAudit({episode,settlementIssues:formalRun.settlementIssues,route:formalRun.route,groupingSnapshot:formalRun.groupingSnapshot,groupingResult:formalRun.groupingResult,paymentResult:formalRun.paymentResult,confirmedMappings:workspace.confirmedMappings||[]});return {...auditRun,formalRunId:formalRun.runId,createdAt:new Date().toISOString(),revision:workspace.revision||1};}
