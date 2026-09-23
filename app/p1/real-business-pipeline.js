import { buildGroupingSnapshot } from './grouping-snapshot.js';
import { routePaymentPolicy } from './payment-policy-router.js';
import { groupDrg3 } from './drg3-grouper.js';
import { groupDip3 } from './dip3-grouper.js';
import { calculatePayment } from './payment-calculator.js';
import { runInsuranceAudit } from './audit-engine.js';

export function runRealBusinessPipeline({episode,settlement,settlementIssues=[],policyProfileId=null,overrideMethod=null,confirmedMappings=[],localPaymentParameters=null}={}){
  const profileId=policyProfileId||(overrideMethod==='DIP'?'DIP-3.0-TEST':overrideMethod==='DRG'?'WH-DRG-3.0':null);
  const route=routePaymentPolicy({episode,policyProfileId:profileId});
  const groupingSnapshot=buildGroupingSnapshot({episode,settlement}); const blocking=settlementIssues.filter((x)=>x.severity==='error');
  let groupingResult;
  if(blocking.length)groupingResult={status:'BLOCKED_BY_DATA_QUALITY',method:route.paymentMethod,group:null,trace:[{stage:'PRE_GROUP_VALIDATION',status:'BLOCKED',input:'医保结算清单',output:`${blocking.length}个阻断错误，先退回医院修改后重传`,rule:'数据质量校验先于正式分组'}]};
  else if(route.paymentMethod==='DRG')groupingResult=groupDrg3(groupingSnapshot,{confirmedMappings});
  else if(route.paymentMethod==='DIP')groupingResult=groupDip3(groupingSnapshot,{confirmedMappings});
  else groupingResult={status:'OTHER_PAYMENT',method:'OTHER',group:null,trace:[]};
  const paymentResult=calculatePayment({route,groupingResult,episode,localParameters:localPaymentParameters});
  const auditRun=runInsuranceAudit({episode,settlementIssues,route,groupingSnapshot,groupingResult,paymentResult,confirmedMappings});
  return {route,groupingSnapshot,groupingResult,paymentResult,auditRun,flow:[{id:'SETTLEMENT',name:'医保结算清单',input:'病案首页 + HIS费用 + 患者待遇',output:settlement?.claimSerialNumber||'已生成'},{id:'VALIDATION',name:'数据接收/质量校验',input:'结算清单 + 编码 + 时间/费用勾稽',output:blocking.length?'退回医院修改':'通过'},{id:'ROUTER',name:'支付方式路由',input:`${route.region} + Policy Profile`,output:route.paymentMethod},{id:'GROUPING',name:`${route.paymentMethod} 3.0分组链`,input:'患者属性 + 诊断 + 手术/操作',output:groupingResult?.group?.code||groupingResult?.status},{id:'PAYMENT',name:'支付测算',input:'分组结果 + 地方参数',output:paymentResult.status},{id:'AUDIT',name:'医保智能审核',input:'清单 + ClaimDetail + 分组结果',output:auditRun.finalStatus},{id:'EVIDENCE',name:'证据调取',input:'需临床依据的风险线索',output:`${auditRun.risks.length}条EvidenceBundle`},{id:'REVIEW',name:'人工复核',input:'RiskIssue + EvidenceBundle',output:auditRun.risks.length?'待处理':'可进入结算'}]};
}
