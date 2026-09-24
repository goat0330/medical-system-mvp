import { buildSettlementList, validateSettlementList } from './domain/settlement.js';
import { PAYMENT_POLICY_PROFILES, routePaymentPolicy } from './p1/payment-policy-router.js';
import { preparePatientCase, applyPatientContext, workspaceFromEpisode, remapWorkspaceFromEpisode, episodeFromWorkspace } from './p1/current-case-adapter.js';
import { buildWorkspaceSourceFingerprint, sourceFingerprintStorageKey } from './p1/workspace-integrity.js';
import { aggregateCurrentCaseCost } from './p1/payment-calculator.js';
import { isGoldenEpisode } from './p1/patient-integrity.js';
import { groupingStageLabel, groupingStatusLabel, groupingStatusTone, groupingTraceDetail } from './p1/grouping-presentation.js';
import { runPreGrouping, runFormalGrouping, runAuditAgainstFormal } from './p1/workflow-orchestrator.js';
import { appButton, statusBadge } from './ui/primitives.js';
import { groupingPath, ruleTrace, riskIssueCard, evidencePanel } from './ui/domain-components.js';
import { searchDiagnosisCatalog } from './p1/diagnosis-catalog.js';

const STORE_PREFIX='medical-mvp-operational-v3:';
let applying=false;
let diagnosisPickerTarget=null;
const esc=(v)=>String(v??'').replace(/[&<>"']/g,(m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const now=()=>new Date().toLocaleString('zh-CN',{hour12:false});
function deepClone(x){return typeof structuredClone==='function'?structuredClone(x):JSON.parse(JSON.stringify(x));}

function parsePatientContext(activeEpisode=null){
  if(!activeEpisode?.episodeId)return null;
  return {episodeId:activeEpisode.episodeId,name:activeEpisode.patient?.name||'当前患者',sex:activeEpisode.patient?.sex||'',age:Number.isFinite(Number(activeEpisode.patient?.age))?Number(activeEpisode.patient.age):null,department:activeEpisode.admission?.department||'',bed:activeEpisode.admission?.bed||''};
}

function buildBaseCase(context,activeEpisode=null){
  if(!context||!activeEpisode)return null;
  return preparePatientCase(applyPatientContext(activeEpisode,context));
}
function keyFor(id){return `${STORE_PREFIX}${id}`;}
function loadWorkspace(base){
  const sourceFingerprint=buildWorkspaceSourceFingerprint({episode:base.episode,documentSnapshots:base.docs,clinicalFactContext:base.episode.clinicalFactContext});
  try{
    const raw=localStorage.getItem(keyFor(base.episode.episodeId));
    if(raw){
      const w=JSON.parse(raw);
      if(w?.episodeId===base.episode.episodeId){
        if(w.collectionVersion!==1){
          localStorage.setItem(`medical-mvp-operational-archive-v1:${base.episode.episodeId}:collections-${Date.now()}`,raw);
          const fresh=workspaceFromEpisode(base.episode,{policyProfileId:PAYMENT_POLICY_PROFILES.some((item)=>item.id===w.policyProfileId)?w.policyProfileId:base.episode.insurance?.region?.includes('武汉')?'WH-DRG-3.0':''});
          fresh.revision=(w.revision||1)+1;saveWorkspace(fresh);return fresh;
        }
        if(Object.prototype.hasOwnProperty.call(w,'localPaymentParameters')){
          delete w.localPaymentParameters;
        }
        return w;
      }
    }
  }catch{}
  const w=workspaceFromEpisode(base.episode,{policyProfileId:base.episode.insurance?.region?.includes('武汉')?'WH-DRG-3.0':''});
  delete w.localPaymentParameters;
  localStorage.setItem(sourceFingerprintStorageKey(base.episode.episodeId),sourceFingerprint);
  saveWorkspace(w);
  return w;
}
function saveWorkspace(w){delete w.localPaymentParameters;w.updatedAt=new Date().toISOString();localStorage.setItem(keyFor(w.episodeId),JSON.stringify(w));}
function contextBundle(){const active=window.medicalSystemMvp?.getEpisodeContext?.()?.episode||null;const context=parsePatientContext(active),base=buildBaseCase(context,active);if(!base)return {context,base:null,workspace:null};const workspace=loadWorkspace(base);return {context,base,workspace};}
function workingEpisode(base,workspace){const e=episodeFromWorkspace(base.episode,workspace);e.documentSnapshots=base.docs;return e;}
function status(x){const raw=String(x||'—');const tone=groupingStatusTone(raw);return statusBadge(groupingStatusLabel(raw),tone,true);}
function btn(label,action,cls='',disabled=false){const variant=cls==='primary'||cls==='success'?'primary':'';return appButton(label,{variant,size:'small',attrs:`data-op-action="${action}"${disabled?' disabled title="请先完成分组输入校验"':''}`});}
function removeButton(type){return appButton('删除',{size:'small',attrs:`data-remove-row="${type}"`});}
function input(value,name,extra=''){return `<input class="app-input op-input" name="${name}" value="${esc(value)}" ${extra}>`;}
function select(value,name,opts,attrs=''){return `<select class="app-select op-input" name="${name}" ${attrs}>${opts.map(x=>`<option value="${esc(x.value)}" ${x.value===value?'selected':''} ${x.disabled?'disabled':''}>${esc(x.label)}</option>`).join('')}</select>`;}

function snapshotFromForm(w){
  const q=(n)=>document.querySelector(`[name="${CSS.escape(n)}"]`);
  w.groupingInputSources=w.groupingInputSources||{};
  const source=(path,before,after)=>{if(String(before??'')!==String(after??'')){w.groupingInputSources=w.groupingInputSources||{};w.groupingInputSources[path]={sourceType:'MANUAL',sourceName:'人工修改',status:'MANUAL_OVERRIDE',factId:null,evidenceRefs:[]};}};
  const collectionRows=(selector,collection,previous)=>{
    const rows=[...document.querySelectorAll(selector)].map((row,i)=>{
      const old=(previous||[]).find((item)=>item.itemId===row.dataset.itemId);
      const code=row.querySelector('[data-field="code"]').value.trim();const name=row.querySelector('[data-field="name"]').value.trim();
      const changed=!old||old.code!==code||old.name!==name;
      return {...(old||{}),itemId:old?.itemId||`MANUAL-${collection.replaceAll('.','-')}-${Date.now()}-${i}`,code,name,
        ...(changed?{status:'MANUAL_OVERRIDE',sources:[],evidenceRefs:[],factRefs:{factId:null,evidenceRefs:[]},sourceStatus:{code:{sourceType:'MANUAL',status:'MANUAL_OVERRIDE',evidenceRefs:[]},name:{sourceType:'MANUAL',status:'MANUAL_OVERRIDE',evidenceRefs:[]}}}:{})};
    }).filter((item)=>item.code||item.name);
    const before=(previous||[]).map((item)=>[item.code||'',item.name||'']);const after=rows.map((item)=>[item.code||'',item.name||'']);
    if(JSON.stringify(before)!==JSON.stringify(after))w.groupingInputSources[collection]={sourceType:'MANUAL',sourceName:'人工修改',status:'MANUAL_OVERRIDE',factId:null,evidenceRefs:[]};
    return rows;
  };
  if(q('policyProfileId')) w.policyProfileId=q('policyProfileId').value;
  if(q('patient.sex')){const value=q('patient.sex').value;source('patient.sex',w.patient.sex,value);w.patient.sex=value;}
  if(q('patient.age')){const value=q('patient.age').value===''?'':Number(q('patient.age').value);source('patient.age',w.patient.age,value);w.patient.age=value;}
  if(q('patient.ageInDays')){const value=q('patient.ageInDays').value===''?null:Number(q('patient.ageInDays').value);source('patient.ageInDays',w.patient.ageInDays,value);w.patient.ageInDays=value;}
  if(q('patient.newbornWeight')){const value=q('patient.newbornWeight').value===''?null:Number(q('patient.newbornWeight').value);source('patient.newbornWeight',w.patient.newbornWeight,value);w.patient.newbornWeight=value;}
  if(q('principalDiagnosis.code')){const value=q('principalDiagnosis.code').value.trim();source('diagnosis.principal.code',w.principalDiagnosis.code,value);w.principalDiagnosis.code=value;}
  if(q('principalDiagnosis.name')){const value=q('principalDiagnosis.name').value.trim();source('diagnosis.principal.name',w.principalDiagnosis.name,value);w.principalDiagnosis.name=value;}
  if(q('principalProcedure.code')){const value=q('principalProcedure.code').value.trim();source('procedure.primary.code',w.principalProcedure.code,value);w.principalProcedure.code=value;}
  if(q('principalProcedure.name')){const value=q('principalProcedure.name').value.trim();source('procedure.primary.name',w.principalProcedure.name,value);w.principalProcedure.name=value;}
  w.secondaryDiagnoses=collectionRows('[data-secondary-row]','diagnosis.secondary',w.secondaryDiagnoses);
  w.otherProcedures=collectionRows('[data-procedure-row]','procedure.others',w.otherProcedures);
  return w;
}
function claimFromForm(w){
  w.claimDetails=[...document.querySelectorAll('[data-claim-row]')].map((row,i)=>({id:row.dataset.id||`CLAIM-${i+1}`,category:row.querySelector('[data-field="category"]').value,itemCode:row.querySelector('[data-field="code"]').value.trim(),itemName:row.querySelector('[data-field="name"]').value.trim(),billingTime:row.querySelector('[data-field="time"]').value,quantity:Number(row.querySelector('[data-field="qty"]').value||0),unitPrice:Number(row.querySelector('[data-field="price"]').value||0),amount:Number(row.querySelector('[data-field="amount"]').value||0),classA:0,classB:0,selfPay:0,other:0,aggregateSource:row.querySelector('[data-field="aggregate"]').checked}));
  return w;
}

function diagnosisPickerButton(target){return appButton('选择疾病',{size:'small',attrs:`data-open-diagnosis-picker="${target}"`});}
function diagnosisNameField(value,target){return `<div class="op-diagnosis-name-field">${input(value,'',`data-field="name" placeholder="诊断名称"`)}${diagnosisPickerButton(target)}</div>`;}
function factCell(base,concept){
  const fact=base.episode.clinicalFactContext?.facts?.find((item)=>item.concept===concept);
  if(!fact)return {value:'未采集',status:'MISSING',source:'暂无来源'};
  if(fact.status==='CONFLICTED')return {value:'待确认',status:fact.status,source:'多个来源存在差异'};
  const evidence=base.episode.clinicalFactContext.evidence.find((item)=>item.evidenceId===fact.selectedEvidenceId);
  return {value:fact.status==='CONFIRMED'?String(fact.value??'未采集'):'待确认',status:fact.status,source:evidence?.fieldName||evidence?.metadata?.templateName||evidence?.sourceType||'患者事实层'};
}
function sourceDetails(base,refs=[]){
  const ids=new Set(refs||[]);const records=(base.episode.clinicalFactContext?.evidence||[]).filter((item)=>ids.has(item.evidenceId));
  return records.map((item)=>`<div><b>${esc(item.metadata?.templateName||item.sourceDocumentType||item.sourceType)}</b><p>${esc(item.excerpt||item.value)}</p></div>`).join('');
}
function fieldSource(base,w,path){
  const source=w.groupingInputSources?.[path];const refs=source?.evidenceRefs||[];
  if(!source)return '<small class="op-input-origin">未映射来源</small>';
  const names=[...new Set(refs.map((id)=>{const e=base.episode.clinicalFactContext?.evidence?.find((item)=>item.evidenceId===id);return e?.metadata?.templateName||e?.sourceDocumentType||e?.sourceType;}).filter(Boolean))];
  const label=source.status==='MANUAL_OVERRIDE'?'人工修改':names.join(' / ')||sourceNameFor(source.sourceType,source.sourceName);
  const tone=source.status==='CONFLICTED'?'amber':source.status==='MANUAL_OVERRIDE'?'blue':'green';
  return `<details class="op-field-source"><summary><span class="status-badge status-badge--${tone} status-badge--compact">${source.status==='CONFLICTED'?'待确认':`✓ ${esc(label)}`}</span></summary>${refs.length?sourceDetails(base,refs):'<p>此值由工作台人工录入。</p>'}</details>`;
}
function sourceNameFor(type,name=''){
  const names={EPISODE:'患者档案',EMR:'已保存病历',FRONTPAGE:'病案首页',SURGERY:'手术记录',ADMISSION:'入院记录',DISCHARGE:'出院记录',MANUAL:'人工修改',FACT_DECISION:'人工确认'};
  return name||names[type]||'患者事实';
}
function itemSource(base,item){
  const sources=item.sources||[];const labels=[...new Set(sources.map((source)=>source.sourceName).filter(Boolean))];
  const tone=item.status==='MANUAL_OVERRIDE'?'blue':item.evidenceRefs?.length?'green':'gray';const text=item.status==='MANUAL_OVERRIDE'?'人工修改':item.evidenceRefs?.length?`✓ ${labels.join(' / ')||'患者档案'}`:'未映射来源';
  return `<details class="op-field-source"><summary><span class="status-badge status-badge--${tone} status-badge--compact">${esc(text)}</span></summary>${sourceDetails(base,item.evidenceRefs||[])||'<p>此值由工作台人工录入或待补充。</p>'}</details>`;
}
function caseHeader(base,w){
  const patients=window.medicalSystemMvp?.getPatientOptions?.()||[];const options=patients.map((x)=>({value:x.key,label:`${x.bed} · ${x.name} · ${x.episodeId}`}));
  const selectedKey=window.medicalSystemMvp?.getSelectedPatientKey?.()||'';const route=routePaymentPolicy({episode:base.episode,policyProfileId:w.policyProfileId});
  const region=route.region||'统筹区待确认';
  const fingerprint=buildWorkspaceSourceFingerprint({episode:base.episode,documentSnapshots:base.docs,clinicalFactContext:base.episode.clinicalFactContext});
  const hasWorkspace=Boolean(localStorage.getItem(keyFor(base.episode.episodeId)));
  const sourceUpdated=hasWorkspace&&localStorage.getItem(sourceFingerprintStorageKey(base.episode.episodeId))!==fingerprint;
  const remapMessage=sourceUpdated?'患者资料或文书已更新；重新映射后再运行分组。':w.remapNotice||'';
  return `<section class="base-card op-case-header"><div class="op-case-header__identity"><b>当前病例</b><strong>${esc(base.episode.admission?.bed||'—')}床 · ${esc(base.episode.patient.name)} · ${esc(base.episode.patient.sex||'性别未采集')} · ${base.episode.patient.age==null?'年龄未采集':`${esc(base.episode.patient.age)}岁`}</strong><div class="op-case-meta"><span>支付地区：${esc(region)}</span><span>分组规则：${esc(route.displayName||'规则待确认')}</span></div>${remapMessage?`<p class="op-remap-message">${esc(remapMessage)}</p>`:''}</div><div class="op-case-header__controls"><label class="op-patient-selector">切换患者${select(selectedKey,'activePatientKey',options,'data-op-patient-select aria-label="选择当前患者"')}</label>${btn('重新映射','remap-current','secondary')}</div></section>`;
}
function sourcePanel(base,w){
  const dx=factCell(base,'diagnosis.principal.code'),op=factCell(base,'procedure.primary.code');
  const docs=base.docs.length,savedDocs=base.docs.filter((doc)=>!doc.fixtureSource).length;
  const patients=window.medicalSystemMvp?.getPatientOptions?.()||[];
  const options=patients.map((x)=>({value:x.key,label:`${x.bed} · ${x.name} · ${x.episodeId}`}));
  const selectedKey=window.medicalSystemMvp?.getSelectedPatientKey?.()||'';
  const goldenFixtureDocs=base.docs.filter((doc)=>doc.fixtureKind==='golden').length;
  const syntheticFixtureDocs=base.docs.filter((doc)=>doc.fixtureKind==='synthetic').length;
  const sourceCountLabel=goldenFixtureDocs?`${goldenFixtureDocs} 份 Golden 样本文书`:syntheticFixtureDocs?`${syntheticFixtureDocs} 份独立合成病例文书`:`${savedDocs} 份已保存病历`;
  const emptyClinical=!base.docs.length&&!base.episode.diagnoses?.principal?.code&&!base.episode.procedures?.length&&!base.episode.fees?.items?.length;
  const kind=isGoldenEpisode(base.episode)?'Golden 全流程样本':base.episode.synthetic?'独立合成测试病例':'当前 Episode';
  return `<div class="base-card op-source"><div class="op-source-identity"><div><b>当前患者</b><span>${esc(base.episode.patient.name)} · ${esc(base.episode.episodeId)} · ${esc(base.episode.patient.sex||'性别未采集')}${base.episode.patient.age!=null?` · ${esc(base.episode.patient.age)}岁`:''}</span></div><label class="op-patient-selector">切换患者${select(selectedKey,'activePatientKey',options,'data-op-patient-select aria-label="选择当前患者"')}</label></div><div class="op-source-tags">${statusBadge(kind,isGoldenEpisode(base.episode)?'blue':'gray',true)}${statusBadge(sourceCountLabel,docs?'green':'gray',true)}${statusBadge(`${savedDocs} 份本地已保存`,savedDocs?'blue':'gray',true)}${statusBadge('国家 DRG/DIP 3.0规则','blue',true)}</div>${emptyClinical?'<div class="op-empty-clinical" role="status">暂无患者临床数据。此患者没有独立病历、诊断、手术或 HIS 费用，系统不会借用其他患者内容；请先录入本患者资料。</div>':''}<div class="op-source-map"><span>主要诊断：${esc(dx.value)}<small>${esc(dx.source)} · ${esc(groupingStatusLabel(dx.status))}</small></span><span>主要手术/操作：${esc(op.value)}<small>${esc(op.source)} · ${esc(groupingStatusLabel(op.status))}</small></span></div></div>`;
}
function diagnosisRows(w,base){return (w.secondaryDiagnoses||[]).map((d,i)=>`<div class="op-repeat-row" data-secondary-row data-item-id="${esc(d.itemId||`secondary-${i}`)}"><span class="op-index">${i+1}</span>${input(d.code,'',`data-field="code" placeholder="诊断编码"`)}${diagnosisNameField(d.name,'secondary')}${removeButton('secondary')}${itemSource(base,d)}</div>`).join('');}
function procedureRows(w,base){return (w.otherProcedures||[]).map((d,i)=>`<div class="op-repeat-row" data-procedure-row data-item-id="${esc(d.itemId||`procedure-${i}`)}"><span class="op-index">${i+1}</span>${input(d.code,'',`data-field="code" placeholder="手术/操作编码"`)}${input(d.name,'',`data-field="name" placeholder="手术/操作名称"`)}${removeButton('procedure')}${itemSource(base,d)}</div>`).join('');}
function diagnosisDialog(){return `<dialog id="op-diagnosis-dialog" class="op-diagnosis-dialog" aria-labelledby="op-diagnosis-title"><div class="op-diagnosis-dialog__head"><div><h2 id="op-diagnosis-title">选择疾病诊断</h2><p>检索国家医保版疾病诊断编码；搜索范围随当前 DRG / DIP 规则校验。</p></div><button type="button" class="app-button app-button--small" data-close-diagnosis-picker aria-label="关闭">关闭</button></div><label class="op-diagnosis-dialog__search-label" for="op-diagnosis-search">疾病名称 / ICD-10 编码</label><input id="op-diagnosis-search" class="app-input" type="search" autocomplete="off" placeholder="输入疾病名称或编码，例如：胆囊结石、K80.1"><div id="op-diagnosis-count" class="op-diagnosis-dialog__count" aria-live="polite"></div><div id="op-diagnosis-results" class="op-diagnosis-dialog__results" role="listbox" aria-label="诊断搜索结果"></div><div class="op-diagnosis-dialog__foot"><span>选择后自动同时填入诊断编码和名称；仍可手动修改。</span><button type="button" class="app-button app-button--small" data-close-diagnosis-picker>取消</button></div></dialog>`;}
function renderDiagnosisChoices(query='',paymentMethod='DRG'){
  const list=document.querySelector('#op-diagnosis-results'),count=document.querySelector('#op-diagnosis-count');if(!list||!count)return;
  const matches=searchDiagnosisCatalog(query,{paymentMethod});count.textContent=`${matches.length} 条匹配 · 显示前 ${Math.min(matches.length,40)} 条`;
  list.innerHTML=matches.length?matches.slice(0,40).map(x=>`<button type="button" class="op-diagnosis-choice" role="option" data-diagnosis-code="${esc(x.code)}" data-diagnosis-name="${esc(x.name)}"><span class="mono">${esc(x.code)}</span><span>${esc(x.name)}${x.nameStatus==='CANDIDATE'?'<small class="op-diagnosis-candidate">名称候选，请核对具体亚目</small>':''}</span></button>`).join(''):'<div class="empty-state">没有找到匹配诊断，请换关键词或直接手动填写。</div>';
}
function mappingCandidate(w){
  const run=w.preGroupingRun||w.formalGroupingRun;
  return run?.groupingResult?.trace?.find?.((row)=>row.stage==='CODE_NORMALIZATION'&&row.mappingKey&&row.status==='REQUIRES_CONFIRMATION')||null;
}
function groupingBlocker(base,w){
  const conflicts=(base.episode.clinicalFactContext?.conflicts||[]).filter((item)=>item.blocking&&item.impactScope?.includes('GROUPING'));
  const collectionConflicts=(base.episode.clinicalFactContext?.collectionConflicts||[]).filter((item)=>w.groupingInputSources?.[item.collection]?.status!=='MANUAL_OVERRIDE');
  const mapping=mappingCandidate(w);
  if(conflicts.length)return {title:'存在关键字段冲突，暂不能分组',message:conflicts.map((item)=>item.reason).join('；'),next:'展开“患者事实与证据”查看来源并确认。',factConflict:true};
  if(collectionConflicts.length)return {title:'诊断或手术来源存在冲突，暂不能分组',message:collectionConflicts.map((item)=>`${item.reason} 候选：${item.candidates.map((candidate)=>candidate.value).join('、')}`).join('；'),next:'展开患者事实与证据核对候选，并在分组输入中保留经核实的编码。',factConflict:true};
  if(mapping)return {title:'主要诊断编码待确认',message:`当前：${mapping.input}；建议：${mapping.output}。${mapping.rule||'这是候选映射，不会自动替换编码。'}`,next:'由编码员确认候选编码后，系统重新执行分组。',mapping};
  if(!w.principalDiagnosis?.code)return {title:'缺少主要诊断编码',message:'当前患者没有可用的主要诊断编码，不能执行有效分组。',next:'录入本患者主要诊断，选择或填写编码后先运行院内预分组。'};
  const staleRun=[w.formalGroupingRun,w.preGroupingRun].find((item)=>item&&item.revision!==w.revision);
  if(staleRun)return {title:'患者资料已更新，请重新分组',message:'重新映射后的分组输入与上次结果不同；旧结果已过期，不能用于支付监测或审核。',next:'点击“重新分组”生成与当前患者资料一致的新结果。',stale:true};
  const run=w.formalGroupingRun?.revision===w.revision?w.formalGroupingRun:w.preGroupingRun;
  if(run?.groupingResult?.status==='GROUPER_NOT_AVAILABLE')return {title:'该方案的分组规则尚未接入',message:run.groupingResult.trace?.[0]?.rule||'不能使用其他版本规则替代。',next:'请切换到已接入的分组方案，或待匹配版本规则接入后再执行。'};
  const errors=run?.groupingResult?.errors||[];
  if(errors.length||run?.inputIntegrity?.errors?.length)return {title:'分组输入需要修正',message:[...errors,...(run?.inputIntegrity?.errors||[])].map((item)=>item.message).filter(Boolean).join('；'),next:'按提示修正编码或移除重复诊断、手术。'};
  if(run?.formalStatus==='BLOCKED_BY_DATA_QUALITY')return {title:'结算清单质控未通过',message:run.settlementIssues?.filter((item)=>item.severity==='error').map((item)=>item.message).join('；')||'结算清单存在阻断项。',next:'先补齐结算清单必填信息，再重新正式分组。'};
  return null;
}
function mappingBlockerCard(mapping){
  return `<section class="op-blocker-card"><div><span class="op-blocker-eyebrow">当前阻断问题</span><h4>主要诊断编码待确认</h4><p>当前：<b>${esc(mapping.input)}</b></p><p>推荐：<b>${esc(mapping.output)}</b></p><p>${esc(mapping.rule||'编码标准化候选需由编码员核实，不会自动替换。')}</p><div class="op-blocker-actions">${appButton('确认编码并继续分组',{variant:'primary',size:'small',attrs:`data-op-confirm-mapping="${esc(mapping.mappingKey)}"`})}<details><summary>查看依据</summary><p>依据：${esc(mapping.rule||'DRG 3.0编码支持目录及当前病例名称匹配')}</p><p>来源：${esc(mapping.source||'本地编码候选映射')}</p></details></div></div><span class="status-badge status-badge--amber">待确认</span></section>`;
}
function blockerCard(blocker){
  if(!blocker)return '';
  if(blocker.mapping)return mappingBlockerCard(blocker.mapping);
  const action=blocker.factConflict?'<button type="button" class="app-button app-button--small" data-open-fact-details>去确认</button>':'';
  return `<section class="op-blocker-card"><div><b>⚠ ${esc(blocker.title)}</b><p>${esc(blocker.message)}</p><small>${esc(blocker.next)}</small>${action}</div></section>`;
}
function traceWhy(row){
  if(row.stage==='CODE_NORMALIZATION')return row.status==='UNCHANGED'?'当前编码按原值直接进入所选规则版本。':'系统给出标准编码候选，须经编码员确认后才能使用。';
  if(row.stage==='PRE_GROUP_VALIDATION'||row.stage==='DIP_PRE_VALIDATION')return row.status==='PASS'?'患者属性、诊断和操作等分组必需输入已通过校验。':'输入未满足所选分组方案的校验条件。';
  if(row.stage==='CC_MCC_PRECOMPUTE')return '依据该分组版本的 CC/MCC 清单和排除关系逐项判断。';
  if(row.stage==='PRE_MDC')return row.status==='MATCHED'?'病例符合先期分组条件。':'未命中先期分组，继续常规 MDC 分组。';
  if(row.stage==='MDC')return row.status==='MATCHED'?'主要诊断符合该 MDC 的诊断范围。':'主要诊断未命中该 MDC 规则。';
  if(row.stage==='ADRG')return row.status==='MATCHED'?'诊断或手术操作符合该 ADRG 的核心分组条件。':'未命中该 ADRG，继续检查后续规则。';
  if(row.stage==='DRG')return row.status==='MATCHED'?'结合 ADRG、CC/MCC 及患者特征确定最终细分组。':'当前输入未得到最终 DRG。';
  if(String(row.stage||'').startsWith('DIP_'))return row.rule||'按所选 DIP 版本的规则顺序匹配。';
  return row.rule||row.reason||'按当前分组方案执行。';
}
function tracePresentation(result){
  return (result.trace||[]).map((row,index)=>{
    const details=[row.source&&{label:'规则来源',value:row.source},row.sourceSheet&&{label:'官方工作簿 Sheet',value:row.sourceSheet},row.sourceRow&&{label:'来源行',value:row.sourceRow},row.rule&&{label:'规则表达式',value:row.rule},result.version&&{label:'执行器版本',value:result.version},result.sourceSha256&&{label:'规则包 SHA-256',value:result.sourceSha256}].filter(Boolean);
    return {title:groupingStageLabel(row.stage)||`步骤 ${index+1}`,message:`输入：${row.input||'—'}；为什么：${traceWhy(row)}；结果：${row.output||groupingStatusLabel(row.status||'DONE')}`,status:groupingStatusLabel(row.status||'DONE'),tone:groupingStatusTone(row.status),details};
  });
}
function formatMoney(value){return `¥${Number(value||0).toLocaleString('zh-CN',{maximumFractionDigits:2})}`;}
function expenseStructure(cost){
  const labels=[['medicine','药品'],['examination','检查'],['laboratory','化验'],['treatment','治疗'],['surgery','手术'],['material','材料'],['other','其他']];
  const totals=labels.map(([key,label])=>`<div><span>${label}</span><b>${formatMoney(cost.categories[key]||0)}</b><small>${cost.total>0?`${((cost.categories[key]||0)/cost.total*100).toFixed(1)}%`:'—'}</small></div>`).join('');
  const top=cost.topMedicines.length?`<div class="op-medicine-table"><b>高费用药品 TOP ${cost.topMedicines.length}</b>${cost.topMedicines.map((item)=>`<div><span>${esc(item.name)}</span><span>${item.quantity} 件</span><span>${item.unitPrice==null?'单价未采集':formatMoney(item.unitPrice)}</span><b>${formatMoney(item.amount)}</b></div>`).join('')}</div>`:`<p class="op-cost-empty">${cost.medicineAmount>0?'当前 HIS 仅提供药品费用汇总，未提供逐药品明细；不生成药品 TOP 5。':'当前 HIS 未提供可识别的逐药品费用明细。'}</p>`;
  let trend='';
  if(cost.hasTimedItems){let cumulative=0;const rows=cost.dailyTrend.map((item)=>{cumulative+=item.amount;return {date:item.date,amount:item.amount,cumulative};});const max=Math.max(1,...rows.map((item)=>item.cumulative));trend=`<div class="op-cost-trend"><b>累计费用趋势</b>${rows.map((item)=>`<div><span>${esc(item.date)}</span><div class="op-cost-trend__track"><i style="width:${Math.min(100,item.cumulative/max*100).toFixed(1)}%"></i></div><small>${formatMoney(item.cumulative)}</small></div>`).join('')}</div>`;}
  else trend='<p class="op-cost-empty">HIS 费用未提供可追溯的计费时间，暂不展示趋势。</p>';
  return `<section class="op-cost-section"><div class="op-cost-section__head"><h4>费用结构</h4><strong>${cost.itemCount?formatMoney(cost.total):'暂无 HIS 费用明细'}</strong></div>${cost.itemCount?`<div class="op-cost-categories">${totals}</div><div class="op-cost-drug-summary"><span>药品费用 ${formatMoney(cost.medicineAmount)}</span><span>药品费占比 ${cost.medicineShare==null?'—':`${(cost.medicineShare*100).toFixed(1)}%`}</span></div>${top}${trend}`:'<p class="op-cost-empty">当前患者 Episode 未包含 HIS 费用明细；未借用其他患者费用。</p>'}</section>`;
}
function paymentMonitoring(payment,cost,route,stale){
  const p=stale?null:payment;const costTotal=cost.total;
  const hasReference=['WITHIN_REFERENCE_PAYMENT','OVER_REFERENCE_PAYMENT','REFERENCE_ONLY'].includes(p?.status)&&Number(p.referencePayment||p.amount)>0;
  if(hasReference){
    const reference=Number(p.referencePayment||p.amount),utilization=costTotal/reference,over=costTotal-reference;
    const state=p.status==='REFERENCE_ONLY'?'参考参数测算':over>0?'当前费用高于病组参考支付标准':'当前费用低于病组参考支付标准';
    return `<section class="op-payment-monitor"><div class="op-payment-monitor__head"><h4>支付监测</h4>${status(p.status==='REFERENCE_ONLY'?'REFERENCE_ONLY':over>0?'OVER_REFERENCE_PAYMENT':'WITHIN_REFERENCE_PAYMENT')}</div><div class="op-payment-metrics"><div><span>病组权重</span><b>${p.weight??'—'}</b></div><div><span>统筹区费率</span><b>${p.rate?`${formatMoney(p.rate)} / 权重`:'—'}</b></div><div><span>参考支付标准</span><b>${formatMoney(reference)}</b></div><div><span>当前累计费用</span><b>${formatMoney(costTotal)}</b></div></div><div class="op-payment-meter"><div><span>费用使用率</span><b>${(utilization*100).toFixed(1)}%</b></div><div class="op-payment-meter__track"><i class="${over>0?'is-over':''}" style="width:${Math.min(100,utilization*100).toFixed(1)}%"></i></div><p>${esc(state)}${over>0?` · 高于 ${formatMoney(over)}`:` · 剩余参考空间 ${formatMoney(Math.max(0,-over))}`}</p></div>${p.status==='REFERENCE_ONLY'?'<p class="op-cost-empty">此金额由未核验的本地测试参数得到，仅供演示，不代表医保生产支付。</p>':'<details><summary>监测口径说明</summary><p>DRG 支付标准用于支付与运营监测，不代表单个病例必须低于该金额；复杂、危重或特殊病例可能合理超过标准。</p></details>'}</section>`;
  }
  let explanation='当前支付地区尚未接入已核验的匹配版本支付参数。';
  if(stale)explanation='分组输入已更新；旧病组支付标准已失效，请重新分组。';
  else if(p?.status==='PAYMENT_PROFILE_VERSION_MISMATCH')explanation='当前支付参数与分组版本不匹配，无法计算参考支付标准。';
  else if(route?.grouperReady===false)explanation='该地区对应的本地分组规则尚未接入；不会用其他版本结果查询支付参数。';
  return `<section class="op-payment-monitor"><div class="op-payment-monitor__head"><h4>支付监测</h4>${status(stale?'STALE':p?.status||'PENDING_LOCAL_PARAMETERS')}</div><div class="op-payment-metrics"><div><span>病组权重</span><b>—</b></div><div><span>统筹区费率</span><b>${route?.id==='BJ-DRG-2.0-2025'&&route.grouperReady&&route.rateVerified?`${formatMoney(route.rate)} / 权重（官方费率）`:'—'}</b></div><div><span>参考支付标准</span><b>—</b></div><div><span>当前累计费用</span><b>${cost.itemCount?formatMoney(costTotal):'—'}</b></div></div><p class="op-cost-empty">${esc(explanation)}</p></section>`;
}
function resultCard(base,w,run,blocker){
  const cost=aggregateCurrentCaseCost({fees:{items:w.claimDetails||base.episode.fees?.items||[]}});
  if(!run)return `<div class="op-result-empty"><b>尚未分组</b><span>录入或确认当前患者的分组输入后，点击“重新分组”。</span></div>${paymentMonitoring(null,cost,routePaymentPolicy({episode:base.episode,policyProfileId:w.policyProfileId}),false)}${expenseStructure(cost)}${blockerCard(blocker)}<div data-grouping-qc-slot></div><div data-fact-details-slot></div>`;
  const result=run.groupingResult||{},isDrg=run.route?.paymentMethod==='DRG';
  const path=groupingPath(isDrg?{mdc:result.mdc?.code,adrg:result.adrg?.code,drg:result.group?.code}:{mdc:'DIP 3.0',adrg:result.group?.category||'国家规则匹配',drg:result.group?.code,labels:['分组方案','匹配类别','内部匹配标识']});
  const rows=tracePresentation(result).map((presentation,index)=>{const row=result.trace?.[index]||{};const raw=groupingTraceDetail(row);return {...presentation,details:[...presentation.details,...(raw?[{label:'原始规则 trace',value:raw}]:[])]};});const trace=rows.length?`<details class="op-rule-details"><summary aria-label="查看规则依据">查看完整分组依据（${rows.length} 步）</summary>${ruleTrace(rows)}</details>`:'';
  const display=result.group?.code||groupingStatusLabel(result.status||'NOT_RUN');
  const runName=run.runType==='PAYER_FORMAL_GROUPING_LOCAL_REPLICA'?'正式分组结果':'院内预分组结果';
  const payment=run.paymentResult||{};const stale=run.revision!==w.revision;
  const severity=result.severity?`MCC：${result.severity.mcc?.join('、')||'无'} · CC：${result.severity.cc?.join('、')||'无'}`:'辅助诊断/操作已参与分组';
  const mainOp=w.principalProcedure?.code?`${w.principalProcedure.code} ${w.principalProcedure.name||''}`:'无';
  const dipKey=!isDrg&&result.group?.code?`<small class="op-dip-key">DIP 规则匹配标识：${esc(result.group.code)}</small>`:'';
  const ruleLabel=run.route?.displayName||'分组规则待确认';
  return `<div class="op-result-head"><div><small>${runName}${stale?' · 已过期':''}</small><strong>${esc(display)}</strong><span>${esc(result.group?.name||result.errors?.map((item)=>item.message).join('；')||'暂无可展示的分组结果')}</span>${result.group?`<small class="op-group-rule-label">${esc(ruleLabel)}</small>`:''}${dipKey}</div>${status(stale?'STALE':result.status)}</div>${path}<div class="op-result-facts"><span>${esc(severity)}</span><span>关键手术：${esc(mainOp)}</span></div>${paymentMonitoring(payment,cost,run.route,stale)}${expenseStructure(cost)}${blockerCard(blocker)}${trace}<div data-grouping-qc-slot></div><div data-fact-details-slot></div>`;
}

function renderGrouping(base,w){
  const profileOpts=PAYMENT_POLICY_PROFILES.map((x)=>({value:x.id,label:x.displayName,disabled:x.grouperReady===false}));
  const blocking=(base.episode.clinicalFactContext?.conflicts||[]).some((item)=>item.blocking&&item.impactScope?.includes('GROUPING'));
  const currentRun=w.formalGroupingRun?.revision===w.revision?w.formalGroupingRun:w.preGroupingRun?.revision===w.revision?w.preGroupingRun:w.formalGroupingRun||w.preGroupingRun||null;
  const blocker=groupingBlocker(base,w);const canLock=Boolean(w.preGroupingRun?.revision===w.revision&&w.preGroupingRun?.inputIntegrity?.ok&&w.preGroupingRun?.groupingResult?.group&&!w.preGroupingRun?.settlementIssues?.some((issue)=>issue.severity==='error')&&!mappingCandidate(w)&&!blocking);
  return `<div class="op-workbench">${caseHeader(base,w)}<div class="op-grid-main"><section class="base-card op-card"><div class="base-card__header op-card-head"><div><h3>分组输入</h3><p>来源于当前患者及其已保存结构化文书；修改后重新运行真实国家规则。</p></div></div>
  <div class="op-form-grid"><label>支付 / 分组方案${select(w.policyProfileId,'policyProfileId',profileOpts)}</label><label>性别${select(w.patient.sex,'patient.sex',[{value:'男',label:'男'},{value:'女',label:'女'}])}${fieldSource(base,w,'patient.sex')}</label><label>年龄${input(w.patient.age,'patient.age','type="number" min="0"')}${fieldSource(base,w,'patient.age')}</label></div>
  <details class="op-more-factors"><summary>其他分组因素</summary><div class="op-form-grid"><label>新生儿日龄${input(w.patient.ageInDays??'','patient.ageInDays','type="number" min="0" placeholder="非新生儿留空"')}</label><label>新生儿体重(g)${input(w.patient.newbornWeight??'','patient.newbornWeight','type="number" min="0" placeholder="非新生儿留空"')}</label></div></details>
  <div class="op-subsection"><h4>主要诊断</h4><div class="op-diagnosis-picker-row"><div class="op-two">${input(w.principalDiagnosis?.code||'','principalDiagnosis.code','placeholder="主要诊断编码"')}${input(w.principalDiagnosis?.name||'','principalDiagnosis.name','placeholder="主要诊断名称"')}</div>${diagnosisPickerButton('principal')}</div>${fieldSource(base,w,'diagnosis.principal.code')}</div>
  <div class="op-subsection"><div class="op-row-head"><h4>其他诊断</h4>${btn('+ 添加诊断','add-secondary','secondary')}</div><div id="op-secondary-list">${diagnosisRows(w,base)}</div></div>
  <div class="op-subsection"><h4>主要手术 / 操作</h4><div class="op-two">${input(w.principalProcedure?.code||'','principalProcedure.code','placeholder="主要手术/操作编码"')}${input(w.principalProcedure?.name||'','principalProcedure.name','placeholder="主要手术/操作名称"')}</div>${fieldSource(base,w,'procedure.primary.code')}</div>
  <div class="op-subsection"><div class="op-row-head"><h4>其他手术 / 操作</h4>${btn('+ 添加操作','add-procedure','secondary')}</div><div id="op-procedure-list">${procedureRows(w,base)}</div></div>
  <div class="op-actions">${btn('重新分组','run-pre','primary')}${btn('锁定为正式分组','run-formal','secondary',!canLock)}</div></section>
  <section class="base-card op-card op-result-panel"><div class="base-card__header op-card-head"><div><h3>分组结果</h3><p>结果使用当前患者快照；支付地区与分组规则分别管理。</p></div><span class="op-result-state">${blocker?esc(blocker.title):currentRun?(currentRun.runType==='PAYER_FORMAL_GROUPING_LOCAL_REPLICA'?'正式分组':'院内预分组'):'尚未分组'}</span></div>${resultCard(base,w,currentRun,blocker)}</section></div></div>`;
}

function claimRows(w){return (w.claimDetails||[]).map((x,i)=>`<tr data-claim-row data-id="${esc(x.id||`CLAIM-${i+1}`)}"><td>${i+1}</td><td>${select(x.category,'',[{value:'bed',label:'床位'},{value:'consultation',label:'诊察'},{value:'examination',label:'检查'},{value:'laboratory',label:'化验'},{value:'treatment',label:'治疗'},{value:'surgery',label:'手术'},{value:'nursing',label:'护理'},{value:'material',label:'材料'},{value:'westernMedicine',label:'西药'},{value:'other',label:'其他'}]).replace('<select','<select data-field="category"')}</td><td>${input(x.itemCode||'','',`data-field="code" placeholder="医保项目编码"`)}</td><td>${input(x.itemName||'','',`data-field="name"`)}</td><td>${input(String(x.billingTime||'').slice(0,16),'',`data-field="time" type="datetime-local"`)}</td><td>${input(x.quantity,'',`data-field="qty" type="number" step="1"`)}</td><td>${input(x.unitPrice,'',`data-field="price" type="number" step="0.01"`)}</td><td>${input(x.amount,'',`data-field="amount" type="number" step="0.01"`)}</td><td><label class="op-check"><input type="checkbox" data-field="aggregate" ${x.aggregateSource?'checked':''}>汇总项</label></td><td>${removeButton('claim')}</td></tr>`).join('');}
function riskHtml(r,w){const review=w.reviewLog?.filter(x=>x.riskId===r.riskId).slice(-1)[0];const evidence=r.evidenceBundle?.evidence||[];const actions=[['审核通过','PASS',''],['退回医院','RETURN_TO_HOSPITAL','danger'],['规则不适用','RULE_NOT_APPLICABLE',''],['转稽核','ESCALATE','primary']].map(([label,action,variant])=>appButton(label,{variant,size:'small',attrs:`data-review="${action}" data-risk="${esc(r.riskId)}"`})).join('');const mapped={...r,id:r.riskId,code:r.ruleCode,severity:r.severity==='high'?'error':r.severity==='medium'?'warning':r.severity,evidenceRefs:evidence};const card=riskIssueCard(mapped,false,actions);const panel=evidencePanel({...mapped,evidenceRefs:evidence});return `<div class="op-risk-wrap">${card}${review?statusBadge(`已处理：${review.action}`,review.action==='RETURN_TO_HOSPITAL'?'amber':'green',true):''}<details class="op-evidence-details"><summary>查看证据 ${evidence.length} 条</summary>${panel}</details></div>`;}
function renderAudit(base,w){
  const formal=w.formalGroupingRun; const audit=w.auditRun; const stale=formal&&formal.revision!==w.revision;
  return `<div class="op-workbench">${sourcePanel(base,w)}<section class="base-card op-card"><div class="base-card__header op-card-head"><div><h3>医保审核输入</h3><p>审核只针对已锁定的正式分组快照。修改费用或病例后，需要重新正式分组再审核。</p></div>${formal?status(stale?'STALE':'READY'):status('NOT_RUN')}</div><div class="op-state-strip"><div><span>正式分组</span><b>${esc(formal?.groupingResult?.group?.code||formal?.groupingResult?.status||'未执行')}</b></div><div><span>支付方式</span><b>${esc(formal?.route?.paymentMethod||'—')}</b></div><div><span>清单流水号</span><b>${esc(formal?.settlement?.claimSerialNumber||base.episode.claimSerialNumber)}</b></div><div><span>病例版本</span><b>V${w.revision}</b></div></div>${!formal||stale?`<div class="notice op-warning">${!formal?'尚未执行正式分组。':'病例/费用已发生变化，旧正式分组已过期。'} ${btn('重新锁定并正式分组','run-formal-from-audit','success')}</div>`:''}</section>
  <section class="base-card op-card"><div class="base-card__header op-card-head"><div><h3>ClaimDetail 费用明细</h3><p>结算清单的费用汇总来自这里。只有逐条项目明细才能执行重复收费、计费时序以及后续国家“两库”规则。</p></div><div>${btn('+ 添加费用明细','add-claim','secondary')} ${btn('保存费用明细','save-claim','primary')}</div></div><div class="op-table-wrap"><table class="clinical-data-table op-table"><thead><tr><th>#</th><th>类别</th><th>项目编码</th><th>项目名称</th><th>计费时间</th><th>数量</th><th>单价</th><th>金额</th><th>来源</th><th></th></tr></thead><tbody id="op-claim-body">${claimRows(w)}</tbody></table></div><div class="op-hint">“汇总项”来自当前 Episode 费用分类，只用于结算清单汇总；补充逐条项目编码/时间后，才进入 ClaimDetail 确定性审核。</div></section>
  <section class="base-card op-card"><div class="op-actions">${btn('运行医保智能审核','run-audit','primary')}${btn('重新运行正式分组 + 审核','rerun-all','success')}</div>${audit?`<div class="op-stage-grid">${audit.stages.map(s=>`<div><b>${esc(s.id)} ${esc(s.name)}</b>${status(s.status)}<span>${esc(s.output)}</span></div>`).join('')}</div>`:'<div class="empty-state">尚未运行审核。</div>'}</section>
  <div class="op-grid-main"><section class="base-card op-card"><div class="base-card__header op-card-head"><div><h3>RiskIssue 风险线索</h3><p>每条风险均来自本次输入、正式分组结果或费用明细规则，不是预写卡片。</p></div><b>${audit?.risks?.length||0} 条</b></div>${audit?.risks?.length?audit.risks.map(r=>riskHtml(r,w)).join(''):'<div class="empty-state">暂无风险。你可以修改诊断/费用后重新执行，验证规则和反事实分组是否产生变化。</div>'}</section><section class="base-card op-card"><div class="base-card__header op-card-head"><div><h3>人工复核与重跑记录</h3><p>人工动作保存在当前患者工作区；退回后回到病例/费用修改，再重新锁定正式快照。</p></div></div><div class="op-history">${(w.reviewLog||[]).slice().reverse().map(x=>`<div><b>${esc(x.time)}</b><span>${esc(x.action)}${x.riskId?` · ${esc(x.riskId)}`:''}</span>${x.note?`<p>${esc(x.note)}</p>`:''}</div>`).join('')||'<div class="empty-state">暂无人工动作。</div>'}</div></section></div></div>`;
}

function markChanged(w){w.revision=(w.revision||1)+1;w.updatedAt=new Date().toISOString();w.auditRun=null;saveWorkspace(w);}
function remapCurrentPatient(base,w){
  snapshotFromForm(w);
  const fingerprint=buildWorkspaceSourceFingerprint({episode:base.episode,documentSnapshots:base.docs,clinicalFactContext:base.episode.clinicalFactContext});
  const sourceChanged=localStorage.getItem(sourceFingerprintStorageKey(base.episode.episodeId))!==fingerprint;
  const result=remapWorkspaceFromEpisode(base.episode,w,{sourceChanged});
  localStorage.setItem(sourceFingerprintStorageKey(base.episode.episodeId),fingerprint);
  saveWorkspace(result.workspace);
  rerender();
}
function bind(base,w){
  document.querySelectorAll('[data-op-action]').forEach(b=>b.addEventListener('click',()=>handleAction(b.dataset.opAction,base,w)));
  document.querySelectorAll('[data-open-diagnosis-picker]').forEach(b=>{if(!b.dataset.bound){b.dataset.bound='1';b.addEventListener('click',()=>openDiagnosisPicker(b));}});
  document.querySelector('[data-op-patient-select]')?.addEventListener('change',(event)=>window.medicalSystemMvp?.selectPatientByKey?.(event.target.value));
  const diagnosisSearch=document.querySelector('#op-diagnosis-search');diagnosisSearch?.addEventListener('input',()=>{const profile=PAYMENT_POLICY_PROFILES.find((item)=>item.id===document.querySelector('[name="policyProfileId"]')?.value);renderDiagnosisChoices(diagnosisSearch.value,profile?.paymentMethod||'DRG');});
  const diagnosisModal=document.querySelector('#op-diagnosis-dialog');diagnosisModal?.addEventListener('click',(event)=>{
    const choice=event.target.closest?.('[data-diagnosis-code]');
    if(choice&&diagnosisPickerTarget){diagnosisPickerTarget.code.value=choice.dataset.diagnosisCode;diagnosisPickerTarget.name.value=choice.dataset.diagnosisName;diagnosisModal.close();diagnosisPickerTarget=null;return;}
    if(event.target===diagnosisModal)diagnosisModal.close();
  });
  diagnosisModal?.addEventListener('close',()=>{diagnosisPickerTarget=null;});
  document.querySelectorAll('[data-close-diagnosis-picker]').forEach(b=>b.addEventListener('click',()=>diagnosisModal?.close()));
  document.querySelector('[data-open-fact-details]')?.addEventListener('click',()=>{const details=document.querySelector('#grouping-source-details');if(details){details.open=true;details.scrollIntoView({behavior:'smooth',block:'center'});}});
  document.querySelectorAll('[data-remove-row]').forEach(b=>b.addEventListener('click',()=>{b.closest(b.dataset.removeRow==='claim'?'tr':'.op-repeat-row')?.remove();}));
  document.querySelectorAll('[data-review]').forEach(b=>b.addEventListener('click',()=>{const note=prompt('复核意见（可选）：','')||'';w.reviewLog=[...(w.reviewLog||[]),{time:now(),riskId:b.dataset.risk,action:b.dataset.review,note}];if(w.auditRun?.risks){const r=w.auditRun.risks.find(x=>x.riskId===b.dataset.risk);if(r)r.status=b.dataset.review;}saveWorkspace(w);rerender();}));
  document.querySelectorAll('[data-op-confirm-mapping]').forEach(b=>b.addEventListener('click',()=>{w.confirmedMappings=[...new Set([...(w.confirmedMappings||[]),b.dataset.opConfirmMapping])];w.reviewLog=[...(w.reviewLog||[]),{time:now(),action:'CONFIRM_CODING_MAPPING',note:b.dataset.opConfirmMapping}];w.revision=(w.revision||1)+1;const e=workingEpisode(base,w);w.preGroupingRun=runPreGrouping({episode:e,workspace:w});w.formalGroupingRun=runFormalGrouping({episode:e,workspace:w});w.auditRun=null;saveWorkspace(w);rerender();}));
}
function openDiagnosisPicker(button){
  const row=button.closest('[data-secondary-row]');
  diagnosisPickerTarget=row?{code:row.querySelector('[data-field="code"]'),name:row.querySelector('[data-field="name"]')}:{code:document.querySelector('[name="principalDiagnosis.code"]'),name:document.querySelector('[name="principalDiagnosis.name"]')};
  const modal=document.querySelector('#op-diagnosis-dialog'),search=document.querySelector('#op-diagnosis-search');if(!modal||!search)return;
  search.value='';const profile=PAYMENT_POLICY_PROFILES.find((item)=>item.id===document.querySelector('[name="policyProfileId"]')?.value);renderDiagnosisChoices('',profile?.paymentMethod||'DRG');modal.showModal();search.focus();
}
function handleAction(action,base,w){
  if(action==='remap-current'){remapCurrentPatient(base,w);return;}
  if(action==='add-secondary'){document.querySelector('#op-secondary-list')?.insertAdjacentHTML('beforeend',`<div class="op-repeat-row" data-secondary-row><span class="op-index">+</span>${input('','',`data-field="code" placeholder="诊断编码"`)}${diagnosisNameField('','secondary')}${removeButton('secondary')}</div>`);rerenderBindOnly(base,w);return;}
  if(action==='add-procedure'){document.querySelector('#op-procedure-list')?.insertAdjacentHTML('beforeend',`<div class="op-repeat-row" data-procedure-row><span class="op-index">+</span>${input('','',`data-field="code" placeholder="手术/操作编码"`)}${input('','',`data-field="name" placeholder="手术/操作名称"`)}${removeButton('procedure')}</div>`);rerenderBindOnly(base,w);return;}
  if(action==='add-claim'){document.querySelector('#op-claim-body')?.insertAdjacentHTML('beforeend',`<tr data-claim-row data-id="CLAIM-${Date.now()}"><td>+</td><td><select class="app-select op-input" data-field="category"><option value="examination">检查</option><option value="laboratory">化验</option><option value="treatment">治疗</option><option value="surgery">手术</option><option value="material">材料</option><option value="westernMedicine">西药</option><option value="other">其他</option></select></td><td>${input('','',`data-field="code" placeholder="项目编码"`)}</td><td>${input('','',`data-field="name" placeholder="项目名称"`)}</td><td>${input(String(base.episode.admission.at).slice(0,16),'',`data-field="time" type="datetime-local"`)}</td><td>${input(1,'',`data-field="qty" type="number"`)}</td><td>${input(0,'',`data-field="price" type="number" step="0.01"`)}</td><td>${input(0,'',`data-field="amount" type="number" step="0.01"`)}</td><td><label class="op-check"><input type="checkbox" data-field="aggregate">逐条</label></td><td>${removeButton('claim')}</td></tr>`);rerenderBindOnly(base,w);return;}
  if(['save-group-input','run-pre','run-formal'].includes(action))snapshotFromForm(w);
  if(action==='save-group-input'){markChanged(w);rerender();return;}
  if(action==='run-pre'){w.revision=(w.revision||1)+1;const e=workingEpisode(base,w);w.preGroupingRun=runPreGrouping({episode:e,workspace:w});w.updatedAt=new Date().toISOString();saveWorkspace(w);rerender();return;}
  if(action==='run-formal'){
    const previous=JSON.stringify({policyProfileId:w.policyProfileId,patient:w.patient,principalDiagnosis:w.principalDiagnosis,secondaryDiagnoses:w.secondaryDiagnoses,principalProcedure:w.principalProcedure,otherProcedures:w.otherProcedures});
    snapshotFromForm(w);
    const current=JSON.stringify({policyProfileId:w.policyProfileId,patient:w.patient,principalDiagnosis:w.principalDiagnosis,secondaryDiagnoses:w.secondaryDiagnoses,principalProcedure:w.principalProcedure,otherProcedures:w.otherProcedures});
    if(previous!==current){markChanged(w);alert('分组输入已变化，请先点击“重新分组”确认结果，再锁定为正式分组。');rerender();return;}
    w.revision=(w.revision||1)+1;const e=workingEpisode(base,w);w.formalGroupingRun=runFormalGrouping({episode:e,workspace:w});w.auditRun=null;w.updatedAt=new Date().toISOString();saveWorkspace(w);rerender();return;
  }
  if(action==='save-claim'){claimFromForm(w);markChanged(w);rerender();return;}
  if(action==='run-formal-from-audit'){claimFromForm(w);w.revision=(w.revision||1)+1;const e=workingEpisode(base,w);w.formalGroupingRun=runFormalGrouping({episode:e,workspace:w});w.auditRun=null;saveWorkspace(w);rerender();return;}
  if(action==='run-audit'){claimFromForm(w);const e=workingEpisode(base,w);if(!w.formalGroupingRun||w.formalGroupingRun.revision!==w.revision){alert('当前正式分组不存在或已过期，请先重新锁定清单并执行正式分组。');return;}const next=runAuditAgainstFormal({episode:e,workspace:w,formalRun:w.formalGroupingRun});if(next?.blocked){alert(next.reason);return;}w.auditRun=next;saveWorkspace(w);rerender();return;}
  if(action==='rerun-all'){claimFromForm(w);w.revision=(w.revision||1)+1;const e=workingEpisode(base,w);w.formalGroupingRun=runFormalGrouping({episode:e,workspace:w});const next=runAuditAgainstFormal({episode:e,workspace:w,formalRun:w.formalGroupingRun});w.auditRun=next?.blocked?null:next;saveWorkspace(w);if(next?.blocked)alert(next.reason);rerender();return;}
}
function rerenderBindOnly(base,w){document.querySelectorAll('[data-remove-row]').forEach(b=>{if(!b.dataset.bound){b.dataset.bound='1';b.addEventListener('click',()=>b.closest(b.dataset.removeRow==='claim'?'tr':'.op-repeat-row')?.remove());}});document.querySelectorAll('[data-open-diagnosis-picker]').forEach(b=>{if(!b.dataset.bound){b.dataset.bound='1';b.addEventListener('click',()=>openDiagnosisPicker(b));}});}

function apply(){
  if(applying)return; const header=[...document.querySelectorAll('h1,h2')].find(x=>/DRG\s*\/\s*DIP 3\.0|智能医保审核/.test(x.textContent||'')); if(!header)return;
  const content=document.querySelector('.page-content'); if(!content||content.dataset.operationalApplied==='1')return;
  const {base,workspace}=contextBundle(); applying=true; content.dataset.operationalApplied='1'; const auditView=/智能医保审核/.test(header.textContent||''); if(!base){content.innerHTML='<section class="base-card"><h3>当前没有可用患者</h3><p>请先从患者工作列选择有效的住院 Episode，再进入分组或医保审核。</p></section>';applying=false;return;} content.innerHTML=auditView?renderAudit(base,workspace):renderGrouping(base,workspace); if(!auditView)content.insertAdjacentHTML('beforeend',diagnosisDialog()); bind(base,workspace); applying=false;
}
function rerender(){const c=document.querySelector('.page-content');if(c)c.dataset.operationalApplied='0';apply();}
const observer=new MutationObserver(()=>queueMicrotask(apply));observer.observe(document.querySelector('#app'),{childList:true,subtree:true});window.addEventListener('load',apply);setTimeout(apply,0);
