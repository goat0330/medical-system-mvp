import { buildSettlementList, validateSettlementList } from '../domain/settlement.js';
import { buildGroupingSnapshot } from './grouping-snapshot.js';
import { routePaymentPolicy } from './payment-policy-router.js';
import { groupDrg3 } from './drg3-grouper.js';
import { groupDip3 } from './dip3-grouper.js';
import { calculatePayment } from './payment-calculator.js';
import { runInsuranceAudit } from './audit-engine.js';
import { validateGroupingInputIntegrity } from './drg-input-validator.js';

function runGrouper(route,snapshot,confirmedMappings){
  if(route.paymentMethod==='DRG')return groupDrg3(snapshot,{confirmedMappings});
  if(route.paymentMethod==='DIP')return groupDip3(snapshot,{confirmedMappings});
  return {status:'OTHER_PAYMENT',method:'OTHER',group:null,trace:[]};
}
function invalidGroupingResult(route,inputIntegrity){
  return {
    status:'INVALID_INPUT',method:route.paymentMethod,group:null,errors:inputIntegrity.errors,
    trace:[{stage:'INPUT_INTEGRITY_VALIDATION',status:'FAIL',input:'分组工作台当前诊断/手术输入',output:inputIntegrity.errors.map((x)=>x.message).join('；'),rule:'正式执行前校验重复项与当前支付方式规则支持范围；无效输入不得继续作为可信分组结果。'}],
  };
}
function freezeRun(type,{episode,workspace}){
  const settlement=buildSettlementList(episode,{sourceDocuments:episode.documentSnapshots||[]});
  const issues=validateSettlementList(settlement);
  const route=routePaymentPolicy({episode,policyProfileId:workspace.policyProfileId});
  const snapshot=buildGroupingSnapshot({episode,settlement});
  const factBlocking=snapshot.quality?.blockingConflicts||[];
  const inputIntegrity=validateGroupingInputIntegrity({paymentMethod:route.paymentMethod,snapshot});
  let groupingResult;
  if(factBlocking.length){
    groupingResult={status:'BLOCKED_BY_FACT_CONFLICT',method:route.paymentMethod,group:null,trace:[{stage:'PATIENT_FACT_RECONCILIATION',status:'BLOCKED',input:'Patient Fact Store',output:`${factBlocking.length} 个关键事实冲突待确认`,rule:'正式/预分组必须使用已确认患者事实；多源冲突不得静默覆盖。'}]};
  }else if(!inputIntegrity.ok){
    groupingResult=invalidGroupingResult(route,inputIntegrity);
  }else{
    groupingResult=runGrouper(route,snapshot,workspace.confirmedMappings||[]);
  }
  const paymentResult=(factBlocking.length||!inputIntegrity.ok)?{status:'NOT_CALCULATED',reason:factBlocking.length?'患者关键事实存在未解决冲突。':'分组输入未通过完整性/规则支持校验。',amount:null}:calculatePayment({route,groupingResult,episode,localParameters:workspace.localPaymentParameters});
  return {runId:`${type}-${episode.episodeId}-${Date.now()}`,runType:type,createdAt:new Date().toISOString(),revision:workspace.revision||1,route,settlement,settlementIssues:issues,groupingSnapshot:snapshot,groupingResult,paymentResult,factConflicts:snapshot.quality?.conflicts||[],inputIntegrity};
}
export function runPreGrouping({episode,workspace}){return freezeRun('HOSPITAL_PRE_GROUPING',{episode,workspace});}
export function runFormalGrouping({episode,workspace}){
  const run=freezeRun('PAYER_FORMAL_GROUPING_LOCAL_REPLICA',{episode,workspace});
  const factBlocking=run.groupingSnapshot?.quality?.blockingConflicts||[];
  if(factBlocking.length){run.formalStatus='BLOCKED_BY_FACT_CONFLICT';return run;}
  if(!run.inputIntegrity?.ok){run.formalStatus='BLOCKED_BY_INPUT_INTEGRITY';return run;}
  const blocking=run.settlementIssues.filter((x)=>x.severity==='error');
  if(blocking.length){run.groupingResult={status:'BLOCKED_BY_DATA_QUALITY',method:run.route.paymentMethod,group:null,trace:[{stage:'FORMAL_SUBMISSION_VALIDATION',status:'BLOCKED',input:'医保结算清单',output:`${blocking.length}个阻断错误`,rule:'正式分组前先通过医保结算清单数据质量校验'}]};run.paymentResult={status:'NOT_CALCULATED',reason:'正式分组被数据质量阻断。',amount:null};run.formalStatus='BLOCKED_BY_DATA_QUALITY';return run;}
  if(run.groupingResult?.mappingConfirmationRequired){run.formalStatus='PENDING_CODING_CONFIRMATION';run.paymentResult={status:'NOT_CALCULATED',reason:'编码标准化候选尚未由编码员确认，正式分组结果只能作为试算。',amount:null};return run;}
  run.formalStatus=run.groupingResult?.group?'FORMAL_GROUPED':'NOT_GROUPED';return run;
}
export function runAuditAgainstFormal({episode,workspace,formalRun}){
  if(formalRun?.formalStatus==='BLOCKED_BY_FACT_CONFLICT')return {blocked:true,reason:'患者关键事实存在未解决的多源冲突，请先在“患者事实与证据”中人工确认。'};
  if(formalRun?.formalStatus==='BLOCKED_BY_INPUT_INTEGRITY')return {blocked:true,reason:'分组输入存在重复诊断/操作或当前 DRG 规则不支持的主要诊断编码，请先修正输入。'};
  if(!formalRun?.groupingResult?.group)return {blocked:true,reason:'请先锁定结算快照并完成正式分组。'};
  if(formalRun.formalStatus==='PENDING_CODING_CONFIRMATION')return {blocked:true,reason:'正式分组仍待编码员确认标准编码，不能进入正式医保审核。'};
  const auditRun=runInsuranceAudit({episode,settlementIssues:formalRun.settlementIssues,route:formalRun.route,groupingSnapshot:formalRun.groupingSnapshot,groupingResult:formalRun.groupingResult,paymentResult:formalRun.paymentResult,confirmedMappings:workspace.confirmedMappings||[]});
  return {...auditRun,formalRunId:formalRun.runId,createdAt:new Date().toISOString(),revision:workspace.revision||1,factRevision:formalRun.groupingSnapshot?.source?.factRevision||null};
}
