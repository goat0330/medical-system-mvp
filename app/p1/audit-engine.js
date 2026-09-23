import { AUDIT_RULE_PACK } from './rules/audit-rule-pack.js';
import { counterfactualDrg3 } from './drg3-grouper.js';
import { counterfactualDip3 } from './dip3-grouper.js';
import { retrieveEvidence } from './evidence-engine.js';
function risk(base){return {status:'PENDING_REVIEW',severity:'medium',...base};}
function parseDate(v){const d=new Date(v);return Number.isFinite(d.getTime())?d:null;}
function runClaimDetailChecks(episode){
  const all=episode?.fees?.items||[]; const items=all.filter(x=>!x.aggregateSource && (x.itemCode||x.serviceCode||x.billingTime)); const risks=[];
  if(!items.length)return {available:false,risks,summary:'当前没有可执行逐条审核的ClaimDetail。费用汇总可以生成结算清单，但重复收费/限频次/适应症等需要逐条项目明细。'};
  const admission=parseDate(episode?.admission?.at),discharge=parseDate(episode?.discharge?.at),seen=new Map();
  for(const [i,item] of items.entries()){
    const code=String(item.itemCode||item.serviceCode||'').trim(),name=String(item.name||'').trim(),t=parseDate(item.billingTime),qty=Number(item.quantity??1),unit=Number(item.unitPrice??0),amount=Number(item.amount??0);
    if(Math.abs(qty*unit-amount)>0.01)risks.push(risk({riskId:`CLAIM-AMOUNT-${i+1}`,type:'CLAIM_DETAIL_AMOUNT',severity:'high',title:'费用明细金额与数量×单价不一致',ruleCode:'AQ-CLAIM-AMOUNT-001',target:code||name,reason:`${name||code}：数量${qty} × 单价${unit} ≠ 金额${amount}。`,evidenceFactPaths:[`fees.items[${i}]`]}));
    if(t&&admission&&discharge&&(t<admission||t>discharge))risks.push(risk({riskId:`CLAIM-TIME-${i+1}`,type:'CLAIM_DETAIL_TIME',severity:'high',title:'费用明细计费时间超出住院区间',ruleCode:'AQ-CLAIM-TIME-001',target:code||name,reason:`${name||code} 计费时间 ${item.billingTime} 不在住院区间内。`,evidenceFactPaths:[`fees.items[${i}]`]}));
    const day=t?t.toISOString().slice(0,10):String(item.billingTime||'').slice(0,10),identity=code||name,key=[identity,day,qty,unit,amount].join('|');
    if(identity&&seen.has(key))risks.push(risk({riskId:`CLAIM-DUP-${i+1}`,type:'CLAIM_DETAIL_DUPLICATE',severity:'medium',title:'存在同日同项目完全重复收费记录',ruleCode:'AQ-CLAIM-DUP-001',target:identity,reason:`${name||code} 与第${seen.get(key)+1}条明细项目、日期、数量、单价和金额完全相同。是否违规仍需结合国家/地方“两库”规则。`,evidenceFactPaths:[`fees.items[${seen.get(key)}]`,`fees.items[${i}]`]})); else if(identity)seen.set(key,i);
  }
  const coded=items.filter(x=>x.itemCode||x.serviceCode).length;
  return {available:true,risks,summary:`已执行${items.length}条ClaimDetail基础确定性审核（其中${coded}条有项目编码）。国家“两库”支付限定、频次、适应症规则需要正式知识点包继续扩展。`};
}
export function runInsuranceAudit({episode,settlementIssues=[],route,groupingSnapshot,groupingResult,paymentResult,confirmedMappings=[]}={}){
  const stages=[],risks=[],blocking=settlementIssues.filter(x=>x.severity==='error');
  stages.push({id:'L0',name:'数据接收与质量校验',input:'医保结算清单 + Episode',output:blocking.length?`${blocking.length}个阻断问题，退回医院修改后重传`:'通过',status:blocking.length?'BLOCKED':'PASS'});
  settlementIssues.forEach((issue,i)=>risks.push(risk({riskId:`SETTLEMENT-${i+1}`,type:'SETTLEMENT_DATA_QUALITY',severity:issue.severity==='error'?'high':'medium',title:issue.message,ruleCode:issue.code,target:issue.field,evidenceFactPaths:['fees.items']})));
  const normalization=groupingResult?.trace?.find(x=>x.stage==='CODE_NORMALIZATION'&&x.status==='REQUIRES_CONFIRMATION');
  if(normalization&&!confirmedMappings.includes(normalization.mappingKey))risks.push(risk({riskId:'CODING-MAP-001',type:'CODING_STANDARDIZATION',severity:'high',title:'主要诊断需确认医保标准编码映射',ruleCode:'AQ-CODE-001',target:normalization.input,reason:`${normalization.input} → ${normalization.output}。试算可以使用候选标准码，但正式结算清单应由编码员确认。`,evidenceFactPaths:['diagnoses.principal','admission.history'],action:{type:'CONFIRM_MAPPING',mappingKey:normalization.mappingKey}}));
  stages.push({id:'L1',name:'编码与分组前置审核',input:'诊断/手术编码 + 清单字段',output:normalization?'发现编码确认事项':'基础编码检查完成',status:normalization?'REVIEW':'PASS'});
  const claim=runClaimDetailChecks(episode);risks.push(...claim.risks);stages.push({id:'L2',name:'费用明细 / 国家“两库”规则入口',input:claim.available?'ClaimDetail[] + 规则/知识点':'费用分类汇总',output:claim.summary,status:claim.available?(claim.risks.length?'REVIEW':'PARTIAL'):'NOT_RUN',note:'当前执行输入本身可确定的基础规则；国家/地方“两库”正式知识点应作为独立Rule Pack接入。'});
  if(!blocking.length&&groupingResult?.group&&route?.paymentMethod==='DRG'){
    const cf=counterfactualDrg3(groupingSnapshot,{confirmedMappings}),impactful=cf.impacts.filter(x=>x.changesGroup);stages.push({id:'L3',name:'DRG完整性 / 反事实重分组',input:'DRG结果 + 其他诊断',output:impactful.length?`${impactful.length}个其他诊断会改变最终DRG`:'未发现其他诊断改变最终DRG',status:'PASS'});
    impactful.forEach((impact,i)=>risks.push(risk({riskId:`DRG-IMPACT-${i+1}`,type:'DRG_GROUPING_IMPACT',severity:'high',title:`诊断 ${impact.diagnosis.code} 会改变DRG`,ruleCode:'AQ-GROUP-DRG-001',target:impact.diagnosis.code,reason:`完整病例 ${impact.baseGroup}；移除该诊断后 ${impact.withoutDiagnosisGroup}。该诊断属于分组关键因素，需要核验临床证据。`,evidenceFactPaths:['diagnoses.secondary','admission.history']})));
  }else if(!blocking.length&&groupingResult?.group&&route?.paymentMethod==='DIP'){
    const cf=counterfactualDip3(groupingSnapshot,{confirmedMappings}),impactful=cf.impacts.filter(x=>x.changesGroup);stages.push({id:'L3',name:'DIP完整性 / 反事实重分组',input:'DIP入组结果 + 其他诊断/相关操作',output:impactful.length?`${impactful.length}个辅助因素会改变DIP入组`:'当前其他诊断/相关操作未改变DIP入组',status:'PASS'});
    impactful.forEach((impact,i)=>risks.push(risk({riskId:`DIP-IMPACT-${i+1}`,type:'DIP_GROUPING_IMPACT',severity:'high',title:`${impact.kind==='SECONDARY_DIAGNOSIS'?'其他诊断':'相关操作'} ${impact.item.code} 会改变DIP入组`,ruleCode:'AQ-GROUP-DIP-001',target:impact.item.code,reason:`完整病例 ${impact.baseGroup}；移除该因素后 ${impact.withoutItemGroup||'未入组'}。需要核验该因素的临床真实性。`,evidenceFactPaths:impact.kind==='SECONDARY_DIAGNOSIS'?['diagnoses.secondary','admission.history']:['procedures']})));
  }else stages.push({id:'L3',name:'DRG/DIP分组完整性审核',input:'GroupingResult',output:blocking.length?'被数据质量阻断':'无有效正式分组结果',status:blocking.length?'BLOCKED':'NOT_RUN'});
  const clinicalRisks=risks.filter(r=>['CODING_STANDARDIZATION','DRG_GROUPING_IMPACT','DIP_GROUPING_IMPACT'].includes(r.type));stages.push({id:'L4',name:'临床证据调取',input:'需要医学依据的风险线索',output:clinicalRisks.length?`${clinicalRisks.length}条风险发起EvidenceRequest`:'当前无需要临床证据的分组风险',status:clinicalRisks.length?'READY':'PASS'});
  const enriched=risks.map(r=>({...r,evidenceBundle:retrieveEvidence({risk:r,episode})}));stages.push({id:'L5',name:'人工复核',input:'RiskIssue + EvidenceBundle + 分组trace',output:enriched.length?'待人工处置：通过/退回/规则不适用/转稽核':'无待复核风险，可进入后续结算',status:enriched.length?'PENDING':'PASS'});
  return {auditId:`AUDIT-${episode?.episodeId||'CASE'}-${Date.now()}`,rulePack:AUDIT_RULE_PACK.id,route:route?.paymentMethod,grouping:groupingResult?.group||null,paymentStatus:paymentResult?.status||null,stages,risks:enriched,finalStatus:blocking.length?'BLOCKED':(enriched.length?'PENDING_REVIEW':'PASS')};
}
