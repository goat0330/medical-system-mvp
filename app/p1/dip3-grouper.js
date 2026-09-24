import { DIP3_OFFICIAL } from './rules/compiled/dip3-official.js';
import { normalizeDrgInput } from './drg3-grouper.js';

function norm(v){return String(v||'').trim();}
function allProcedures(input){return [input.principalProcedure?.code,...(input.otherProcedures||[]).map(x=>x.code)].map(norm).filter(Boolean);}
function secondaryCodes(input){return (input.secondaryDiagnoses||[]).map(x=>norm(x.code)).filter(Boolean);}

function categoryNum(code){const m=norm(code).match(/^([A-Z])(\d{2})/);return m?{letter:m[1],num:Number(m[2])}:null;}
function codeMatches(code,spec){
  code=norm(code); spec=norm(spec); if(!code||!spec) return false;
  if(spec==='所有诊断'||spec==='所有手术操作'||spec==='所有操作') return true;
  const range=spec.match(/^([A-Z]\d{2})-([A-Z]\d{2})$/);
  if(range){const c=categoryNum(code),a=categoryNum(range[1]),b=categoryNum(range[2]);return !!c&&!!a&&!!b&&c.letter===a.letter&&a.letter===b.letter&&c.num>=a.num&&c.num<=b.num;}
  return code===spec || code.startsWith(spec);
}
function anySpec(code,specs){return (specs||[]).some(s=>codeMatches(code,s));}
function anyCode(codes,specs){return (codes||[]).some(c=>anySpec(c,specs));}
function expressionMatch(codes,expr){
  expr=norm(expr); if(!expr) return true;
  return expr.split('|').map(x=>x.trim()).filter(Boolean).some(alt=>{
    const required=alt.split('+').map(x=>x.trim()).filter(Boolean);
    return required.every(s=>codes.some(c=>codeMatches(c,s)));
  });
}
function listExpressionMatch(codes,specs){
  if(!specs||!specs.length) return true;
  return specs.some(s=>expressionMatch(codes,s));
}
function label(rule){
  const dx=rule.principalDiagnosisName||rule.name||''; const op=rule.principalProcedureName||rule.procedureName||'';
  return [dx,op].filter(x=>norm(x)).join(' + ') || `${rule.category||''}${rule.seq||''}`;
}
function buildDiagnosisCatalog(){
  const catalog=new Map();
  const add=(code,name)=>{
    code=norm(code).toUpperCase(); name=norm(name);
    if(!/^[A-Z]\d{2}(?:\.\d{1,6}[A-Z0-9]*)?$/.test(code)||!name) return;
    const current=catalog.get(code);
    if(!current||name.length>current.name.length) catalog.set(code,{code,name});
  };
  for(const key of ['pre','merge','burn','tumor','tb','base','primaryCare']){
    for(const rule of DIP3_OFFICIAL[key]||[]){
      const codes=Array.isArray(rule.principalDiagnosis)?rule.principalDiagnosis:[rule.principalDiagnosis||rule.code].filter(Boolean);
      const name=rule.principalDiagnosisName||rule.diagnosisName||rule.name;
      for(const code of codes) add(code,name);
    }
  }
  for(const rule of DIP3_OFFICIAL.excludedDiagnosis||[]) add(rule.code,rule.name);
  return [...catalog.values()].sort((a,b)=>a.code.localeCompare(b.code));
}
const DIP3_DIAGNOSIS_CATALOG=buildDiagnosisCatalog();
export function searchDip3DiagnosisCatalog(query=''){
  const term=norm(query).toLocaleLowerCase();
  return term?DIP3_DIAGNOSIS_CATALOG.filter(x=>x.code.toLocaleLowerCase().includes(term)||x.name.toLocaleLowerCase().includes(term)):DIP3_DIAGNOSIS_CATALOG;
}
function result(rule,type,input,trace,normalized){
  const primaryCare=(DIP3_OFFICIAL.primaryCare||[]).find(r=>anySpec(input.principalDiagnosis?.code,r.principalDiagnosis)&&listExpressionMatch(allProcedures(input),r.principalProcedure));
  return {
    status:normalized.mappingConfirmationRequired?'GROUPED_PENDING_CODING_CONFIRMATION':'GROUPED',method:'DIP',grouperSystem:'CHS-DIP',version:DIP3_OFFICIAL.version,
    rulePackId:DIP3_OFFICIAL.id,sourceFile:DIP3_OFFICIAL.sourceFile,sourceSha256:DIP3_OFFICIAL.sha256,counts:DIP3_OFFICIAL.counts,productionRuleCoverage:'OFFICIAL_WORKBOOK_FULL',
    normalizedInput:input,mappingConfirmationRequired:normalized.mappingConfirmationRequired,
    group:{code:`${rule.category}-${rule.seq}`,category:rule.category,sequence:rule.seq,name:label(rule),type,sourceSheet:rule.sourceSheet,sourceRow:rule.sourceRow},
    primaryCare:primaryCare?{matched:true,sequence:primaryCare.seq,name:primaryCare.principalDiagnosisName}: {matched:false}, trace,
  };
}

function matchPre(rule,input){
  const dx=rule.principalDiagnosis.includes('所有诊断') || anySpec(input.principalDiagnosis?.code,rule.principalDiagnosis);
  return dx && listExpressionMatch(allProcedures(input),rule.principalProcedure);
}
function matchMerge(rule,input){
  if(!anySpec(input.principalDiagnosis?.code,rule.principalDiagnosis)) return false;
  if(!listExpressionMatch([input.principalProcedure?.code].filter(Boolean),rule.principalProcedure)) return false;
  if(rule.relatedProcedure?.length){
    const related=(input.otherProcedures||[]).map(x=>x.code).filter(Boolean);
    if(!listExpressionMatch(related,rule.relatedProcedure)) return false;
  }
  return true;
}
function matchBurn(rule,input){
  return anySpec(input.principalDiagnosis?.code,rule.principalDiagnosis)
    && anyCode(secondaryCodes(input),rule.secondaryDiagnosis)
    && listExpressionMatch([input.principalProcedure?.code].filter(Boolean),rule.principalProcedure)
    && listExpressionMatch((input.otherProcedures||[]).map(x=>x.code),rule.relatedProcedure);
}
function matchTumor(rule,input){
  return anySpec(input.principalDiagnosis?.code,rule.principalDiagnosis)
    && anyCode(secondaryCodes(input),rule.secondaryDiagnosis)
    && expressionMatch(allProcedures(input),rule.procedureExpression);
}
function isDrugResistant(input){
  const resistantSet=new Set((DIP3_OFFICIAL.tbResistantDiagnosis||[]).map(x=>x.code));
  return resistantSet.has(input.principalDiagnosis?.code) || secondaryCodes(input).some(x=>x==='U84.300'||x.startsWith('U84.300'));
}
function matchTb(rule,input){
  if(!anySpec(input.principalDiagnosis?.code,rule.principalDiagnosis)) return false;
  if(!listExpressionMatch([input.principalProcedure?.code].filter(Boolean),rule.principalProcedure)) return false;
  const expected=rule.drugResistant==='是'; return expected===isDrugResistant(input);
}
function matchBase(rule,input){
  return anySpec(input.principalDiagnosis?.code,rule.principalDiagnosis)
    && listExpressionMatch([input.principalProcedure?.code].filter(Boolean),rule.principalProcedure);
}

export function groupDip3(snapshot,options={}){
  const normalized=normalizeDrgInput(snapshot,options); let input=normalized.snapshot; const trace=[...normalized.trace]; const errors=[];
  if(!input.principalDiagnosis?.code) errors.push('缺少主要诊断编码');
  trace.push({stage:'DIP_PRE_VALIDATION',status:errors.length?'FAIL':'PASS',input:'主要诊断 + 主要操作 + 其他诊断/操作 + 患者属性',output:errors.length?errors.join('；'):'通过',rule:'DIP 3.0官方方案输入校验'});
  if(errors.length) return {status:'INVALID_INPUT',method:'DIP',version:DIP3_OFFICIAL.version,rulePackId:DIP3_OFFICIAL.id,trace,errors,normalizedInput:input};

  const excludedDx=(DIP3_OFFICIAL.excludedDiagnosis||[]).find(x=>codeMatches(input.principalDiagnosis.code,x.code));
  trace.push({stage:'DIP_EXCLUSION_DIAGNOSIS',status:excludedDx?'MATCHED':'PASS',input:input.principalDiagnosis.code,output:excludedDx?`${excludedDx.code} ${excludedDx.name}`:'未命中不纳入分组的主要诊断',rule:'五、不纳入分组的主要诊断'});
  if(excludedDx) return {status:'EXCLUDED_PRINCIPAL_DIAGNOSIS',method:'DIP',version:DIP3_OFFICIAL.version,rulePackId:DIP3_OFFICIAL.id,sourceSha256:DIP3_OFFICIAL.sha256,trace,normalizedInput:input,mappingConfirmationRequired:normalized.mappingConfirmationRequired,exclusion:excludedDx};

  const excludedProc=input.principalProcedure?.code ? (DIP3_OFFICIAL.excludedProcedure||[]).find(x=>codeMatches(input.principalProcedure.code,x.code)) : null;
  if(excludedProc){
    trace.push({stage:'DIP_EXCLUSION_PROCEDURE',status:'MATCHED_AS_CONSERVATIVE',input:input.principalProcedure.code,output:'该主要手术操作按保守治疗入组，不作为主要操作参与后续组合匹配',rule:excludedProc.note||'五、不纳入分组的主要手术操作'});
    input={...input,principalProcedure:null,otherProcedures:[...(input.otherProcedures||[])]};
  } else trace.push({stage:'DIP_EXCLUSION_PROCEDURE',status:'PASS',input:input.principalProcedure?.code||'无主要操作',output:'未命中主要手术操作排除表',rule:'五、不纳入分组的主要手术操作'});

  for(const rule of DIP3_OFFICIAL.pre||[]){ if(matchPre(rule,input)){
    trace.push({stage:'DIP_PRE_GROUP',status:'MATCHED',input:`${input.principalDiagnosis.code} + ${input.principalProcedure?.code||'保守治疗'}`,output:`${rule.category}-${rule.seq} ${label(rule)}`,rule:'一、先期分组',source:`${rule.sourceSheet}!${rule.sourceRow}`});
    return result(rule,'PRE_GROUP',input,trace,normalized);
  }}
  trace.push({stage:'DIP_PRE_GROUP',status:'NOT_MATCHED',input:`${input.principalDiagnosis.code} + ${input.principalProcedure?.code||'保守治疗'}`,output:'进入核心病种规则链',rule:'一、先期分组'});

  const combined=`${input.principalDiagnosis.code} + ${input.principalProcedure?.code||'保守治疗'}${input.otherProcedures?.length?` + 相关操作(${input.otherProcedures.map(x=>x.code).join(',')})`:''}`;
  trace.push({stage:'DIP_BASE_COMBINATION',status:'BUILT',input:'主要诊断 + 主要操作 + 相关手术操作',output:combined,rule:'DIP 3.0核心病种组合输入'});

  for(const rule of DIP3_OFFICIAL.merge||[]){ if(matchMerge(rule,input)){
    trace.push({stage:'DIP_MERGE_RULE',status:'MATCHED',input:combined,output:`${rule.category}-${rule.seq} ${label(rule)}`,rule:'二、并项规则下的核心病种',source:`${rule.sourceSheet}!${rule.sourceRow}`});
    return result(rule,'MERGE_CORE',input,trace,normalized);
  }}
  trace.push({stage:'DIP_MERGE_RULE',status:'NOT_MATCHED',input:combined,output:'继续诊断辅助细分',rule:'二、并项规则下的核心病种'});

  for(const rule of DIP3_OFFICIAL.burn||[]){ if(matchBurn(rule,input)){
    trace.push({stage:'DIP_AUX_BURN',status:'MATCHED',input:combined,output:`${rule.category}-${rule.seq} ${label(rule)}`,rule:`三、诊断辅助细分-烧伤：${rule.burnDegree} / ${rule.burnArea}`,source:`${rule.sourceSheet}!${rule.sourceRow}`});
    return result(rule,'AUX_BURN',input,trace,normalized);
  }}
  for(const rule of DIP3_OFFICIAL.tumor||[]){ if(matchTumor(rule,input)){
    trace.push({stage:'DIP_AUX_TUMOR',status:'MATCHED',input:combined,output:`${rule.category}-${rule.seq} ${label(rule)}`,rule:'三、诊断辅助细分-肿瘤',source:`${rule.sourceSheet}!${rule.sourceRow}`});
    return result(rule,'AUX_TUMOR',input,trace,normalized);
  }}
  for(const rule of DIP3_OFFICIAL.tb||[]){ if(matchTb(rule,input)){
    trace.push({stage:'DIP_AUX_TB',status:'MATCHED',input:combined,output:`${rule.category}-${rule.seq} ${label(rule)}`,rule:`三、诊断辅助细分-结核；耐药=${rule.drugResistant}`,source:`${rule.sourceSheet}!${rule.sourceRow}`});
    return result(rule,'AUX_TB',input,trace,normalized);
  }}
  trace.push({stage:'DIP_AUXILIARY',status:'NOT_MATCHED',input:`其他诊断=${secondaryCodes(input).join(',')||'无'}；年龄=${input.patient?.age??'NA'}`,output:'继续基础规则',rule:'三、诊断辅助细分'});

  for(const rule of DIP3_OFFICIAL.base||[]){ if(matchBase(rule,input)){
    trace.push({stage:'DIP_CORE_GROUP',status:'MATCHED',input:combined,output:`${rule.category}-${rule.seq} ${label(rule)}`,rule:'四、基础规则下的核心病种',source:`${rule.sourceSheet}!${rule.sourceRow}`});
    return result(rule,'BASE_CORE',input,trace,normalized);
  }}
  trace.push({stage:'DIP_CORE_GROUP',status:'NOT_GROUPED_CORE',input:combined,output:'未命中官方核心病种；实际结算需继续按统筹区综合病种/地方补充规则处理',rule:'国家DIP 3.0核心病种方案'});
  return {status:'NOT_GROUPED_CORE',method:'DIP',version:DIP3_OFFICIAL.version,rulePackId:DIP3_OFFICIAL.id,sourceFile:DIP3_OFFICIAL.sourceFile,sourceSha256:DIP3_OFFICIAL.sha256,counts:DIP3_OFFICIAL.counts,productionRuleCoverage:'OFFICIAL_WORKBOOK_FULL',trace,normalizedInput:input,mappingConfirmationRequired:normalized.mappingConfirmationRequired,group:null};
}

export function getDip3RulePackMeta(){return {id:DIP3_OFFICIAL.id,version:DIP3_OFFICIAL.version,sourceFile:DIP3_OFFICIAL.sourceFile,sha256:DIP3_OFFICIAL.sha256,counts:DIP3_OFFICIAL.counts};}

export function counterfactualDip3(snapshot,options={}){
  const base=groupDip3(snapshot,options); const impacts=[];
  for(const diag of snapshot.secondaryDiagnoses||[]){
    const next={...snapshot,secondaryDiagnoses:(snapshot.secondaryDiagnoses||[]).filter(x=>x!==diag)}; const r=groupDip3(next,options);
    impacts.push({kind:'SECONDARY_DIAGNOSIS',item:diag,baseGroup:base.group?.code||null,withoutItemGroup:r.group?.code||null,changesGroup:(base.group?.code||null)!==(r.group?.code||null)});
  }
  for(const proc of snapshot.otherProcedures||[]){
    const next={...snapshot,otherProcedures:(snapshot.otherProcedures||[]).filter(x=>x!==proc)}; const r=groupDip3(next,options);
    impacts.push({kind:'RELATED_PROCEDURE',item:proc,baseGroup:base.group?.code||null,withoutItemGroup:r.group?.code||null,changesGroup:(base.group?.code||null)!==(r.group?.code||null)});
  }
  return {base,impacts};
}
