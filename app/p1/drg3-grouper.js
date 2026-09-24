import { DRG3_OFFICIAL } from './rules/compiled/drg3-official.js';

const LOCAL_CODING_CROSSWALK = Object.freeze([
  Object.freeze({
    from: 'K80.3', name: '胆总管结石伴胆管炎', to: 'K80.302', toName: '胆总管结石伴胆管炎',
    basis: '当前病例名称与官方3.0规则表 K80.302 名称一致；作为编码候选，必须由编码员人工确认。',
    requiresHumanConfirmation: true,
  }),
]);

let CACHE = null;
function cache(){
  if (CACHE) return CACHE;
  const sets = new Map(Object.entries(DRG3_OFFICIAL.sets).map(([k,v]) => [k,new Set(v)]));
  const exclusions = new Map(Object.entries(DRG3_OFFICIAL.exclusions).map(([k,v]) => [k,new Set(v)]));
  const adrgByMdc = new Map();
  for (const x of DRG3_OFFICIAL.adrg) {
    if (!adrgByMdc.has(x.mdc)) adrgByMdc.set(x.mdc,[]);
    adrgByMdc.get(x.mdc).push(x);
  }
  for (const arr of adrgByMdc.values()) arr.sort((a,b)=>(a.sort??9999)-(b.sort??9999));
  const drgByAdrg = new Map();
  for (const x of DRG3_OFFICIAL.drg) {
    if (!drgByAdrg.has(x.adrg)) drgByAdrg.set(x.adrg,[]);
    drgByAdrg.get(x.adrg).push(x);
  }
  for (const arr of drgByAdrg.values()) arr.sort((a,b)=>(a.sort??9999)-(b.sort??9999));
  CACHE={sets,exclusions,adrgByMdc,drgByAdrg,mdc:[...DRG3_OFFICIAL.mdc].sort((a,b)=>(a.sort??9999)-(b.sort??9999))};
  return CACHE;
}

function unique(xs){ return [...new Set((xs||[]).filter(Boolean))]; }
function toNum(v){ const n=Number(v); return Number.isFinite(n)?n:NaN; }
function normalizeCode(v){ return String(v||'').trim(); }

export function normalizeDrgInput(snapshot,{confirmedMappings=[]}={}){
  const trace=[]; const principal={...(snapshot.principalDiagnosis||{})};
  const proposed=LOCAL_CODING_CROSSWALK.find(x=>x.from===principal.code && (!x.name || x.name===principal.name));
  let mappingConfirmationRequired=false;
  if(proposed){
    const key=`${proposed.from}->${proposed.to}`; const confirmed=confirmedMappings.includes(key);
    trace.push({stage:'CODE_NORMALIZATION',status:confirmed?'CONFIRMED':'REQUIRES_CONFIRMATION',input:`${proposed.from} ${principal.name||''}`.trim(),output:`${proposed.to} ${proposed.toName}`,rule:proposed.basis,mappingKey:key});
    principal.originalCode=principal.code; principal.code=proposed.to; principal.name=proposed.toName; principal.mappingConfirmed=confirmed;
    mappingConfirmationRequired=!confirmed && proposed.requiresHumanConfirmation;
  } else trace.push({stage:'CODE_NORMALIZATION',status:'UNCHANGED',input:principal.code||'缺失',output:principal.code||'缺失',rule:'未应用本地编码候选映射；直接使用结算清单/病案首页编码。'});
  return {snapshot:{...snapshot,principalDiagnosis:principal},trace,mappingConfirmationRequired};
}

function effectiveSeverity(ctx){
  const c=cache(); const mcc=[], cc=[], excluded=[];
  for(const code of ctx.QTZD){
    const info=DRG3_OFFICIAL.cc[code]; if(!info) continue;
    const ex=info.exclusion ? c.exclusions.get(info.exclusion) : null;
    if(ex && ex.has(ctx.ZYZD)){ excluded.push({code,type:info.type,exclusion:info.exclusion}); continue; }
    if(info.type==='MCC') mcc.push(code); else if(info.type==='CC') cc.push(code);
  }
  return {MCC:unique(mcc),CC:unique(cc),excluded};
}

function buildContext(input){
  const admissionDays=input.patient?.ageInDays ?? input.patient?.newbornAgeDays ?? null;
  const procedures=unique([input.principalProcedure?.code,...(input.otherProcedures||[]).map(x=>x.code)].map(normalizeCode));
  const ctx={
    ZYZD:normalizeCode(input.principalDiagnosis?.code),
    QTZD:unique((input.secondaryDiagnoses||[]).map(x=>normalizeCode(x.code))),
    ZYSS:normalizeCode(input.principalProcedure?.code),
    QTSS:unique((input.otherProcedures||[]).map(x=>normalizeCode(x.code))),
    NL:toNum(input.patient?.age), XSRTL:toNum(admissionDays), XSRTZ:toNum(input.patient?.newbornWeight), XB:toNum(input.patient?.sex),
    allProcedures:procedures,
  };
  const sev=effectiveSeverity(ctx); ctx.MCC=sev.MCC; ctx.CC=sev.CC; ctx.severityExcluded=sev.excluded;
  return ctx;
}

function varValues(ctx,name){
  if(name==='ZYZD'||name==='ZYSS') return ctx[name]?[ctx[name]]:[];
  if(name==='QTZD'||name==='QTSS'||name==='MCC'||name==='CC') return ctx[name]||[];
  return [];
}
function inNamedSet(ctx,varName,setName){
  if(setName==='MCC'||setName==='CC') return varValues(ctx,varName).some(x=>(ctx[setName]||[]).includes(x));
  const s=cache().sets.get(setName); if(!s) return false;
  return varValues(ctx,varName).some(x=>s.has(x));
}
function anyVarsInSet(ctx,varNames,setName){ return varNames.some(v=>inNamedSet(ctx,v,setName)); }
function varInAnySets(ctx,varName,setNames){ return setNames.some(s=>inNamedSet(ctx,varName,s)); }
function intersectionLen(ctx,setName,varNames){
  const s=cache().sets.get(setName); if(!s) return 0;
  return unique(varNames.flatMap(v=>varValues(ctx,v))).filter(x=>s.has(x)).length;
}

function jsStringArray(csv){ return `[${csv.split(',').map(x=>JSON.stringify(x.trim())).filter(x=>x!=='""').join(',')}]`; }
function translateFormula(formula){
  let f=String(formula||'').replace(/_x000D_/g,' ').replace(/\r?\n/g,' ').replace(/\bOR\b/g,'or').replace(/\s+/g,' ').trim();
  if(!f) return 'true';
  // length(OP_IC2 ∩ {ZYSS, QTSS})
  f=f.replace(/length\(\s*([A-Z0-9_]+)\s*∩\s*\{([^}]+)\}\s*\)/g,(_,set,vars)=>`intersectionLen(${JSON.stringify(set)},${jsStringArray(vars)})`);
  // {ZYSS, QTSS} in SET
  f=f.replace(/\{\s*([A-Z]+(?:\s*,\s*[A-Z]+)*)\s*\}\s+in\s+([A-Z0-9_]+)/g,(_,vars,set)=>`anyVarsInSet(${jsStringArray(vars)},${JSON.stringify(set)})`);
  // VAR not in SET
  f=f.replace(/\b(ZYZD|QTZD|ZYSS|QTSS)\s+not\s+in\s+([A-Z0-9_]+)/g,(_,v,set)=>`!inNamedSet(${JSON.stringify(v)},${JSON.stringify(set)})`);
  // VAR in {SET1, SET2}
  f=f.replace(/\b(ZYZD|QTZD|ZYSS|QTSS)\s+in\s+\{([^}]+)\}/g,(_,v,sets)=>`varInAnySets(${JSON.stringify(v)},${jsStringArray(sets)})`);
  // VAR in SET (including MCC / CC)
  f=f.replace(/\b(ZYZD|QTZD|ZYSS|QTSS)\s+in\s+([A-Z0-9_]+)/g,(_,v,set)=>`inNamedSet(${JSON.stringify(v)},${JSON.stringify(set)})`);
  f=f.replace(/\band\b/g,'&&').replace(/\bor\b/g,'||');
  f=f.replace(/(?<![<>=!])=(?!=)/g,'===');
  for(const v of ['NL','XSRTL','XSRTZ','XB']) f=f.replace(new RegExp(`\\b${v}\\b`,'g'),`num(${JSON.stringify(v)})`);
  return f;
}
const FORMULA_CACHE=new Map();
function evalFormula(formula,ctx){
  const key=String(formula||''); let compiled=FORMULA_CACHE.get(key);
  if(!compiled){
    const js=translateFormula(key);
    try { compiled=new Function('inNamedSet','anyVarsInSet','varInAnySets','intersectionLen','num',`return Boolean(${js});`); }
    catch(e){ return {matched:false,error:`公式编译失败: ${e.message}`,translated:js}; }
    FORMULA_CACHE.set(key,compiled);
  }
  try{
    const boundIn=(v,s)=>inNamedSet(ctx,v,s), boundAny=(vs,s)=>anyVarsInSet(ctx,vs,s), boundAnySets=(v,ss)=>varInAnySets(ctx,v,ss), boundInt=(s,vs)=>intersectionLen(ctx,s,vs), num=(v)=>ctx[v];
    return {matched:compiled(boundIn,boundAny,boundAnySets,boundInt,num),translated:translateFormula(key)};
  }catch(e){ return {matched:false,error:`公式执行失败: ${e.message}`,translated:translateFormula(key)}; }
}

function matchFirst(rows,ctx){
  const errors=[];
  for(const row of rows){
    const r=evalFormula(row.rule,ctx); if(r.error) errors.push({code:row.code,error:r.error,rule:row.rule,translated:r.translated});
    if(r.matched) return {row,errors};
  }
  return {row:null,errors};
}

export function groupDrg3(snapshot,options={}){
  const normalized=normalizeDrgInput(snapshot,options); const input=normalized.snapshot; const trace=[...normalized.trace];
  const errors=[];
  if(!input.principalDiagnosis?.code) errors.push('缺少主要诊断编码');
  if(!Number.isFinite(Number(input.patient?.age))) errors.push('缺少有效年龄');
  trace.push({stage:'PRE_GROUP_VALIDATION',status:errors.length?'FAIL':'PASS',input:'患者属性 + 主要/其他诊断 + 主要/其他手术操作',output:errors.length?errors.join('；'):'通过',rule:'DRG 3.0 官方配置输入校验'});
  if(errors.length) return {status:'INVALID_INPUT',method:'DRG',version:DRG3_OFFICIAL.version,rulePackId:DRG3_OFFICIAL.id,trace,errors,normalizedInput:input};

  const ctx=buildContext(input); const c=cache();
  trace.push({stage:'CC_MCC_PRECOMPUTE',status:'DONE',input:`其他诊断=${ctx.QTZD.join(',')||'无'}`,output:`MCC=${ctx.MCC.join(',')||'无'}；CC=${ctx.CC.join(',')||'无'}；CCE排除=${ctx.severityExcluded.map(x=>x.code).join(',')||'无'}`,rule:'官方CC表 + 排除表'});

  // 先期分组 MDCA：直接执行 MDCA 下 ADRG 规则；命中才进入 MDCA。
  let mdc=null, adrg=null; let formulaErrors=[];
  const pre=matchFirst(c.adrgByMdc.get('MDCA')||[],ctx); formulaErrors.push(...pre.errors);
  if(pre.row){
    mdc=DRG3_OFFICIAL.mdc.find(x=>x.code==='MDCA')||{code:'MDCA',name:'先期分组'}; adrg=pre.row;
    trace.push({stage:'PRE_MDC',status:'MATCHED',input:`主要诊断=${ctx.ZYZD}；主要操作=${ctx.ZYSS||'无'}`,output:`${adrg.code} ${adrg.name}`,rule:adrg.rule,source:`ADRG!${adrg.sourceRow}`});
  } else {
    trace.push({stage:'PRE_MDC',status:'NOT_MATCHED',input:`主要诊断=${ctx.ZYZD}；主要操作=${ctx.ZYSS||'无'}`,output:'继续MDC分组',rule:'逐条执行MDCA下ADRG规则'});
    for(const candidate of c.mdc.filter(x=>x.code!=='MDCA')){
      const r=evalFormula(candidate.rule,ctx); if(r.error) formulaErrors.push({code:candidate.code,error:r.error,rule:candidate.rule,translated:r.translated});
      if(r.matched){mdc=candidate;break;}
    }
    if(!mdc){
      trace.push({stage:'MDC',status:'NOT_GROUPED',input:ctx.ZYZD,output:'未匹配MDC',rule:'官方MDC规则'});
      return {status:'NOT_GROUPED_MDC',method:'DRG',version:DRG3_OFFICIAL.version,rulePackId:DRG3_OFFICIAL.id,sourceSha256:DRG3_OFFICIAL.sha256,trace,formulaErrors,normalizedInput:input,mappingConfirmationRequired:normalized.mappingConfirmationRequired};
    }
    trace.push({stage:'MDC',status:'MATCHED',input:ctx.ZYZD,output:`${mdc.code} ${mdc.name}`,rule:mdc.rule,source:`MDC!${mdc.sourceRow}`});
    const m=matchFirst(c.adrgByMdc.get(mdc.code)||[],ctx); formulaErrors.push(...m.errors); adrg=m.row;
    if(!adrg){
      trace.push({stage:'ADRG',status:'NOT_GROUPED',input:`${mdc.code} + 诊断/操作`,output:'未匹配ADRG',rule:'官方ADRG规则'});
      return {status:'NOT_GROUPED_ADRG',method:'DRG',version:DRG3_OFFICIAL.version,rulePackId:DRG3_OFFICIAL.id,sourceSha256:DRG3_OFFICIAL.sha256,mdc,trace,formulaErrors,normalizedInput:input,mappingConfirmationRequired:normalized.mappingConfirmationRequired};
    }
    trace.push({stage:'ADRG',status:'MATCHED',input:`${mdc.code} + 诊断/操作`,output:`${adrg.code} ${adrg.name}`,rule:adrg.rule,source:`ADRG!${adrg.sourceRow}`});
  }

  const d=matchFirst(c.drgByAdrg.get(adrg.code)||[],ctx); formulaErrors.push(...d.errors); const drg=d.row;
  if(!drg){
    trace.push({stage:'DRG',status:'NOT_GROUPED',input:adrg.code,output:'未匹配细分组',rule:'官方DRG细分规则'});
    return {status:'NOT_GROUPED_DRG',method:'DRG',version:DRG3_OFFICIAL.version,rulePackId:DRG3_OFFICIAL.id,sourceSha256:DRG3_OFFICIAL.sha256,mdc,adrg,trace,formulaErrors,normalizedInput:input,mappingConfirmationRequired:normalized.mappingConfirmationRequired};
  }
  trace.push({stage:'DRG',status:'MATCHED',input:`${adrg.code}；年龄=${ctx.NL}；MCC=${ctx.MCC.join(',')||'无'}；CC=${ctx.CC.join(',')||'无'}`,output:`${drg.code} ${drg.name}`,rule:drg.rule||'该ADRG默认细分组',source:`DRG!${drg.sourceRow}`});
  return {
    status:normalized.mappingConfirmationRequired?'GROUPED_PENDING_CODING_CONFIRMATION':'GROUPED',method:'DRG',grouperSystem:'CHS-DRG',version:DRG3_OFFICIAL.version,
    rulePackId:DRG3_OFFICIAL.id,sourceFile:DRG3_OFFICIAL.sourceFile,sourceSha256:DRG3_OFFICIAL.sha256,counts:DRG3_OFFICIAL.counts,productionRuleCoverage:'OFFICIAL_WORKBOOK_FULL',
    normalizedInput:input,mappingConfirmationRequired:normalized.mappingConfirmationRequired,mdc:{code:mdc.code,name:mdc.name},adrg:{code:adrg.code,name:adrg.name},group:{code:drg.code,name:drg.name,type:'DRG'},
    severity:{mcc:ctx.MCC,cc:ctx.CC,excluded:ctx.severityExcluded},trace,formulaErrors,
  };
}

export function counterfactualDrg3(snapshot,options={}){
  const base=groupDrg3(snapshot,options); const impacts=[];
  for(const diag of snapshot.secondaryDiagnoses||[]){
    const next={...snapshot,secondaryDiagnoses:(snapshot.secondaryDiagnoses||[]).filter(x=>x!==diag)}; const r=groupDrg3(next,options);
    impacts.push({diagnosis:diag,baseGroup:base.group?.code||null,withoutDiagnosisGroup:r.group?.code||null,changesGroup:(base.group?.code||null)!==(r.group?.code||null),trace:r.trace});
  }
  return {base,impacts};
}

export function getDrg3RulePackMeta(){ return {id:DRG3_OFFICIAL.id,version:DRG3_OFFICIAL.version,sourceFile:DRG3_OFFICIAL.sourceFile,sha256:DRG3_OFFICIAL.sha256,counts:DRG3_OFFICIAL.counts}; }

export function validateDrg3FormulaCoverage(){
  const rows=[...DRG3_OFFICIAL.mdc,...DRG3_OFFICIAL.adrg,...DRG3_OFFICIAL.drg]; const errors=[];
  for(const row of rows){
    const js=translateFormula(row.rule||'');
    try{ new Function('inNamedSet','anyVarsInSet','varInAnySets','intersectionLen','num',`return Boolean(${js});`); }
    catch(e){ errors.push({code:row.code,rule:row.rule,translated:js,error:e.message}); }
  }
  return {total:rows.length,errors};
}
