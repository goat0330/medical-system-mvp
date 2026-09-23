import { buildSettlementList, validateSettlementList } from './domain/settlement.js';
import { PAYMENT_POLICY_PROFILES, routePaymentPolicy } from './p1/payment-policy-router.js';
import { preparePatientCase, applyPatientContext, workspaceFromEpisode, episodeFromWorkspace } from './p1/current-case-adapter.js';
import { buildWorkspaceSourceFingerprint, reconcileStoredWorkspace } from './p1/workspace-integrity.js';
import { isGoldenEpisode } from './p1/patient-integrity.js';
import { groupingStageLabel, groupingStatusLabel, groupingStatusTone, groupingTraceDetail, groupingTraceSummary } from './p1/grouping-presentation.js';
import { runPreGrouping, runFormalGrouping, runAuditAgainstFormal } from './p1/workflow-orchestrator.js';
import { appButton, statusBadge } from './ui/primitives.js';
import { groupingPath, ruleTrace, riskIssueCard, evidencePanel } from './ui/domain-components.js';
import { searchDip3DiagnosisCatalog } from './p1/dip3-grouper.js';

const STORE_PREFIX='medical-mvp-operational-v3:';
let applying=false;
let diagnosisPickerTarget=null;
const esc=(v)=>String(v??'').replace(/[&<>"']/g,(m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmt=(v)=>Number(v||0).toLocaleString('zh-CN',{maximumFractionDigits:2});
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
  reconcileStoredWorkspace({episodeId:base.episode.episodeId,sourceFingerprint});
  try{
    const raw=localStorage.getItem(keyFor(base.episode.episodeId));
    if(raw){
      const w=JSON.parse(raw);
      if(w?.episodeId===base.episode.episodeId){
        if(Object.prototype.hasOwnProperty.call(w,'localPaymentParameters')){
          delete w.localPaymentParameters; w.preGroupingRun=null; w.formalGroupingRun=null; w.auditRun=null;
        }
        return w;
      }
    }
  }catch{}
  const w=workspaceFromEpisode(base.episode,{policyProfileId:base.episode.insurance?.region?.includes('武汉')?'WH-DRG-3.0':''});
  delete w.localPaymentParameters;
  return w;
}
function saveWorkspace(w){delete w.localPaymentParameters;w.updatedAt=new Date().toISOString();localStorage.setItem(keyFor(w.episodeId),JSON.stringify(w));}
function contextBundle(){const active=window.medicalSystemMvp?.getEpisodeContext?.()?.episode||null;const context=parsePatientContext(active),base=buildBaseCase(context,active);if(!base)return {context,base:null,workspace:null};const workspace=loadWorkspace(base);return {context,base,workspace};}
function workingEpisode(base,workspace){const e=episodeFromWorkspace(base.episode,workspace);e.documentSnapshots=base.docs;return e;}
function status(x){const raw=String(x||'—');const tone=groupingStatusTone(raw);return statusBadge(groupingStatusLabel(raw),tone,true);}
function btn(label,action,cls='',disabled=false){const variant=cls==='primary'||cls==='success'?'primary':'';return appButton(label,{variant,size:'small',attrs:`data-op-action="${action}"${disabled?' disabled title="请先完成分组输入校验"':''}`});}
function removeButton(type){return appButton('删除',{size:'small',attrs:`data-remove-row="${type}"`});}
function input(value,name,extra=''){return `<input class="app-input op-input" name="${name}" value="${esc(value)}" ${extra}>`;}
function select(value,name,opts,attrs=''){return `<select class="app-select op-input" name="${name}" ${attrs}>${opts.map(x=>`<option value="${esc(x.value)}" ${x.value===value?'selected':''}>${esc(x.label)}</option>`).join('')}</select>`;}

function snapshotFromForm(w){
  const q=(n)=>document.querySelector(`[name="${CSS.escape(n)}"]`);
  const source=(path,before,after)=>{if(String(before??'')!==String(after??'')){w.groupingInputSources=w.groupingInputSources||{};w.groupingInputSources[path]={sourceType:'MANUAL',sourceName:'人工修改',status:'MANUAL_OVERRIDE',factId:null,evidenceRefs:[]};}};
  if(q('policyProfileId')) w.policyProfileId=q('policyProfileId').value;
  if(q('patient.sex')){const value=q('patient.sex').value;source('patient.sex',w.patient.sex,value);w.patient.sex=value;}
  if(q('patient.age')){const value=q('patient.age').value===''?'':Number(q('patient.age').value);source('patient.age',w.patient.age,value);w.patient.age=value;}
  if(q('patient.ageInDays')) w.patient.ageInDays=q('patient.ageInDays').value===''?null:Number(q('patient.ageInDays').value);
  if(q('patient.newbornWeight')) w.patient.newbornWeight=q('patient.newbornWeight').value===''?null:Number(q('patient.newbornWeight').value);
  if(q('principalDiagnosis.code')){const value=q('principalDiagnosis.code').value.trim();source('diagnosis.principal.code',w.principalDiagnosis.code,value);w.principalDiagnosis.code=value;}
  if(q('principalDiagnosis.name')){const value=q('principalDiagnosis.name').value.trim();source('diagnosis.principal.name',w.principalDiagnosis.name,value);w.principalDiagnosis.name=value;}
  if(q('principalProcedure.code')){const value=q('principalProcedure.code').value.trim();source('procedure.primary.code',w.principalProcedure.code,value);w.principalProcedure.code=value;}
  if(q('principalProcedure.name')){const value=q('principalProcedure.name').value.trim();source('procedure.primary.name',w.principalProcedure.name,value);w.principalProcedure.name=value;}
  w.secondaryDiagnoses=[...document.querySelectorAll('[data-secondary-row]')].map((row)=>({code:row.querySelector('[data-field="code"]').value.trim(),name:row.querySelector('[data-field="name"]').value.trim(),conditionAtAdmission:'有'})).filter(x=>x.code||x.name);
  w.otherProcedures=[...document.querySelectorAll('[data-procedure-row]')].map((row)=>({code:row.querySelector('[data-field="code"]').value.trim(),name:row.querySelector('[data-field="name"]').value.trim()})).filter(x=>x.code||x.name);
  return w;
}
function claimFromForm(w){
  w.claimDetails=[...document.querySelectorAll('[data-claim-row]')].map((row,i)=>({id:row.dataset.id||`CLAIM-${i+1}`,category:row.querySelector('[data-field="category"]').value,itemCode:row.querySelector('[data-field="code"]').value.trim(),itemName:row.querySelector('[data-field="name"]').value.trim(),billingTime:row.querySelector('[data-field="time"]').value,quantity:Number(row.querySelector('[data-field="qty"]').value||0),unitPrice:Number(row.querySelector('[data-field="price"]').value||0),amount:Number(row.querySelector('[data-field="amount"]').value||0),classA:0,classB:0,selfPay:0,other:0,aggregateSource:row.querySelector('[data-field="aggregate"]').checked}));
  return w;
}

function procedureRows(w){return (w.otherProcedures||[]).map((d,i)=>`<div class="op-repeat-row" data-procedure-row><span class="op-index">${i+1}</span>${input(d.code,'',`data-field="code" placeholder="手术/操作编码"`)}${input(d.name,'',`data-field="name" placeholder="手术/操作名称"`)}${removeButton('procedure')}</div>`).join('');}
function diagnosisPickerButton(target){return appButton('选择疾病',{size:'small',attrs:`data-open-diagnosis-picker="${target}"`});}
function diagnosisNameField(value,target){return `<div class="op-diagnosis-name-field">${input(value,'',`data-field="name" placeholder="诊断名称"`)}${diagnosisPickerButton(target)}</div>`;}
function factCell(base,concept){
  const fact=base.episode.clinicalFactContext?.facts?.find((item)=>item.concept===concept);
  if(!fact)return {value:'未采集',status:'MISSING',source:'暂无来源'};
  if(fact.status==='CONFLICTED')return {value:'待确认',status:fact.status,source:'多个来源存在差异'};
  const evidence=base.episode.clinicalFactContext.evidence.find((item)=>item.evidenceId===fact.selectedEvidenceId);
  return {value:fact.status==='CONFIRMED'?String(fact.value??'未采集'):'待确认',status:fact.status,source:evidence?.fieldName||evidence?.metadata?.templateName||evidence?.sourceType||'患者事实层'};
}
function inputSourceLabel(w,path){
  const source=w.groupingInputSources?.[path];if(!source)return '来源：未采集 · 状态：未映射';
  const names={EPISODE:'患者 Episode',EMR:'已保存病历',FRONTPAGE:'病案首页',SURGERY:'手术记录',ADMISSION:'入院记录',DISCHARGE:'出院记录',HIS:'HIS 费用',LIS:'LIS 检验',RIS:'RIS 影像',MANUAL:'人工修改',FACT_DECISION:'人工确认'};
  const label=source.sourceName||names[source.sourceType]||source.sourceType||'未映射';
  return `来源：${label} · 状态：${groupingStatusLabel(source.status)}`;
}
function sourcePanel(base,w){
  const dx=factCell(base,'diagnosis.principal.code'),op=factCell(base,'procedure.primary.code');
  const docs=base.docs.length,savedDocs=base.docs.filter((doc)=>!doc.fixtureSource).length,fixtureDocs=base.docs.filter((doc)=>doc.fixtureSource).length;
  const patients=window.medicalSystemMvp?.getPatientOptions?.()||[];
  const options=patients.map((x)=>({value:x.key,label:`${x.bed} · ${x.name} · ${x.episodeId}`}));
  const selectedKey=window.medicalSystemMvp?.getSelectedPatientKey?.()||'';
  const sourceCountLabel=fixtureDocs?`${fixtureDocs} 份 Golden 样本文书`:`${savedDocs} 份已保存病历`;
  const emptyClinical=!base.docs.length&&!base.episode.diagnoses?.principal?.code&&!base.episode.procedures?.length&&!base.episode.fees?.items?.length;
  const kind=isGoldenEpisode(base.episode)?'Golden 全流程样本':base.episode.synthetic?'合成工作列患者':'当前 Episode';
  return `<div class="base-card op-source"><div class="op-source-identity"><div><b>当前患者</b><span>${esc(base.episode.patient.name)} · ${esc(base.episode.episodeId)} · ${esc(base.episode.patient.sex||'性别未采集')}${base.episode.patient.age!=null?` · ${esc(base.episode.patient.age)}岁`:''}</span></div><label class="op-patient-selector">切换患者${select(selectedKey,'activePatientKey',options,'data-op-patient-select aria-label="选择当前患者"')}</label></div><div class="op-source-tags">${statusBadge(kind,isGoldenEpisode(base.episode)?'blue':'gray',true)}${statusBadge(sourceCountLabel,docs?'green':'gray',true)}${statusBadge(`${savedDocs} 份本地已保存`,savedDocs?'blue':'gray',true)}${statusBadge('国家 DRG/DIP 3.0规则','blue',true)}</div>${emptyClinical?'<div class="op-empty-clinical" role="status">暂无患者临床数据。此患者没有独立病历、诊断、手术或 HIS 费用，系统不会借用其他患者内容；请先录入本患者资料。</div>':''}<div class="op-source-map"><span>主要诊断：${esc(dx.value)}<small>${esc(dx.source)} · ${esc(groupingStatusLabel(dx.status))}</small></span><span>主要手术/操作：${esc(op.value)}<small>${esc(op.source)} · ${esc(groupingStatusLabel(op.status))}</small></span></div><div>${btn('从当前患者重新映射','reload-current','secondary')}</div></div>`;
}
function diagnosisRows(w){return (w.secondaryDiagnoses||[]).map((d,i)=>`<div class="op-repeat-row" data-secondary-row><span class="op-index">${i+1}</span>${input(d.code,'',`data-field="code" placeholder="诊断编码"`)}${diagnosisNameField(d.name,'secondary')}${removeButton('secondary')}</div>`).join('');}
function diagnosisDialog(){return `<dialog id="op-diagnosis-dialog" class="op-diagnosis-dialog" aria-labelledby="op-diagnosis-title"><div class="op-diagnosis-dialog__head"><div><h2 id="op-diagnosis-title">选择疾病诊断</h2><p>检索国家 DIP 3.0 规则包收录的诊断名称或编码。</p></div><button type="button" class="app-button app-button--small" data-close-diagnosis-picker aria-label="关闭">关闭</button></div><label class="op-diagnosis-dialog__search-label" for="op-diagnosis-search">疾病名称 / ICD-10 编码</label><input id="op-diagnosis-search" class="app-input" type="search" autocomplete="off" placeholder="输入疾病名称或编码，例如：胆囊结石、K80.1"><div id="op-diagnosis-count" class="op-diagnosis-dialog__count" aria-live="polite"></div><div id="op-diagnosis-results" class="op-diagnosis-dialog__results" role="listbox" aria-label="诊断搜索结果"></div><div class="op-diagnosis-dialog__foot"><span>选择后自动同时填入诊断编码和名称；仍可手动修改。</span><button type="button" class="app-button app-button--small" data-close-diagnosis-picker>取消</button></div></dialog>`;}
function renderDiagnosisChoices(query=''){
  const list=document.querySelector('#op-diagnosis-results'),count=document.querySelector('#op-diagnosis-count');if(!list||!count)return;
  const matches=searchDip3DiagnosisCatalog(query);count.textContent=`${matches.length} 条匹配 · 显示前 ${Math.min(matches.length,40)} 条`;
  list.innerHTML=matches.length?matches.slice(0,40).map(x=>`<button type="button" class="op-diagnosis-choice" role="option" data-diagnosis-code="${esc(x.code)}" data-diagnosis-name="${esc(x.name)}"><span class="mono">${esc(x.code)}</span><span>${esc(x.name)}</span></button>`).join(''):'<div class="empty-state">没有找到匹配诊断，请换关键词或直接手动填写。</div>';
}
function mappingCandidate(w){
  const run=w.preGroupingRun||w.formalGroupingRun;
  return run?.groupingResult?.trace?.find?.((row)=>row.stage==='CODE_NORMALIZATION'&&row.mappingKey&&row.status==='REQUIRES_CONFIRMATION')||null;
}
function groupingBlocker(base,w){
  const conflicts=(base.episode.clinicalFactContext?.conflicts||[]).filter((item)=>item.blocking&&item.impactScope?.includes('GROUPING'));
  const mapping=mappingCandidate(w);
  if(conflicts.length)return {title:'患者关键事实待确认',message:conflicts.map((item)=>item.reason).join('；'),next:'请先在上方患者事实卡中确认影响分组的冲突。'};
  if(mapping)return {title:'主要诊断编码待确认',message:`当前：${mapping.input}；建议：${mapping.output}。${mapping.rule||'这是候选映射，不会自动替换编码。'}`,next:'由编码员确认候选编码后，系统重新执行分组。',mapping};
  if(!w.principalDiagnosis?.code)return {title:'缺少主要诊断编码',message:'当前患者没有可用的主要诊断编码，不能执行有效分组。',next:'录入本患者主要诊断，选择或填写编码后先运行院内预分组。'};
  const run=w.formalGroupingRun?.revision===w.revision?w.formalGroupingRun:w.preGroupingRun;
  const errors=run?.groupingResult?.errors||[];
  if(errors.length)return {title:'分组输入未通过校验',message:errors.map((item)=>item.message).join('；'),next:'按错误提示修正诊断、手术或患者属性。'};
  if(run?.formalStatus==='BLOCKED_BY_DATA_QUALITY')return {title:'结算清单质控未通过',message:run.settlementIssues?.filter((item)=>item.severity==='error').map((item)=>item.message).join('；')||'结算清单存在阻断项。',next:'先补齐结算清单必填信息，再重新正式分组。'};
  return null;
}
function mappingBlockerCard(mapping){
  return `<section class="op-blocker-card"><div><span class="op-blocker-eyebrow">当前阻断问题</span><h4>主要诊断编码待确认</h4><p>当前：<b>${esc(mapping.input)}</b></p><p>推荐：<b>${esc(mapping.output)}</b></p><p>${esc(mapping.rule||'编码标准化候选需由编码员核实，不会自动替换。')}</p><div class="op-blocker-actions">${appButton('确认编码并继续分组',{variant:'primary',size:'small',attrs:`data-op-confirm-mapping="${esc(mapping.mappingKey)}"`})}<details><summary>查看依据</summary><p>依据：${esc(mapping.rule||'DRG 3.0编码支持目录及当前病例名称匹配')}</p><p>来源：${esc(mapping.source||'本地编码候选映射')}</p></details></div></div><span class="status-badge status-badge--amber">待确认</span></section>`;
}
function groupingSummary(base,w){
  const blocker=groupingBlocker(base,w),pre=w.preGroupingRun,formal=w.formalGroupingRun,formalCurrent=formal&&formal.revision===w.revision;
  const current=blockingRun=>blockingRun?.groupingResult?.group?.code||groupingStatusLabel(blockingRun?.groupingResult?.status||'NOT_RUN');
  const next=blocker?.next||(formalCurrent?'分组已完成；可进入智能医保审核。':pre?'预分组已完成；确认输入后执行正式分组。':'资料齐备后点击“执行院内预分组”。');
  const payment=formalCurrent?formal.paymentResult:pre?.paymentResult;
  return `<section class="base-card op-group-summary"><div class="base-card__header"><div><h3>当前分组状态</h3><p>${esc(base.episode.patient.name)} · ${esc(base.episode.episodeId)} · ${esc(next)}</p></div>${status(blocker?'BLOCKED':formalCurrent?'FORMAL_GROUPED':pre?'GROUPED':'NOT_RUN')}</div><div class="op-summary-grid"><div><span>院内预分组</span><b>${esc(current(pre))}</b></div><div><span>正式分组</span><b>${esc(formalCurrent?current(formal):formal?'结果已过期':'未执行')}</b></div><div><span>支付测算</span><b>${esc(groupingStatusLabel(payment?.status||'NOT_RUN'))}</b></div><div><span>医保审核</span><b>${esc(w.auditRun?.finalStatus?groupingStatusLabel(w.auditRun.finalStatus):'未开始')}</b></div></div>${blocker&&!blocker.mapping?`<div class="op-blocker-card"><div><span class="op-blocker-eyebrow">当前阻断问题</span><h4>${esc(blocker.title)}</h4><p>${esc(blocker.message)}</p><p>下一步：${esc(blocker.next)}</p></div>${status('BLOCKED')}</div>`:''}${blocker?.mapping?mappingBlockerCard(blocker.mapping):''}${payment?.status==='PENDING_LOCAL_PARAMETERS'?`<div class="op-payment-info"><b>支付测算暂不生成金额</b><span>尚未核验并配置本地权重、费率或点值；国家分组结果不等同于医保实际支付金额。</span></div>`:''}</section>`;
}
function resultCard(run){
  if(!run)return '<div class="empty-state">尚未执行分组。先核对当前患者资料，再运行院内预分组。</div>';
  const result=run.groupingResult||{},isDrg=run.route?.paymentMethod==='DRG';
  const path=groupingPath(isDrg?{mdc:result.mdc?.code,adrg:result.adrg?.code,drg:result.group?.code}:{mdc:'DIP',adrg:result.group?.category||'规则路径',drg:result.group?.code,labels:['支付分支','匹配层级','DIP病种']});
  const traceRows=result.trace||[];
  const steps=traceRows.length?`<ol class="op-rule-steps">${traceRows.map((row,index)=>`<li><div class="op-rule-step__head"><div><b>${index+1}. ${esc(groupingStageLabel(row.stage)||`分组步骤 ${index+1}`)}</b><small>${esc(groupingTraceSummary(row))}</small></div>${statusBadge(groupingStatusLabel(row.status||'DONE'),groupingStatusTone(row.status),true)}</div></li>`).join('')}</ol>`:'';
  const rows=traceRows.map((row,index)=>({title:groupingStageLabel(row.stage)||`步骤 ${index+1}`,message:[row.stage&&`规则阶段：${row.stage}`,groupingTraceDetail(row)].filter(Boolean).join('；'),status:groupingStatusLabel(row.status||'DONE'),tone:groupingStatusTone(row.status)}));
  const trace=rows.length?`<details class="op-rule-details"><summary>查看规则依据（${rows.length} 步）</summary>${ruleTrace(rows)}</details>`:'';
  const display=result.group?.code||groupingStatusLabel(result.status||'NOT_RUN');
  const runName=run.runType==='HOSPITAL_PRE_GROUPING'?'院内预分组':run.runType==='PAYER_FORMAL_GROUPING_LOCAL_REPLICA'?'医保侧规则本地复刻':'分组执行';
  const payment=run.paymentResult||{};
  const paymentLabel=payment.status==='PENDING_LOCAL_PARAMETERS'?'待本地支付参数':groupingStatusLabel(payment.status||'NOT_CALCULATED');
  const paymentTone=payment.status==='PENDING_LOCAL_PARAMETERS'?'blue':groupingStatusTone(payment.status);
  return `<div class="op-result-head"><div><small>${runName}${run.formalStatus?` · ${groupingStatusLabel(run.formalStatus)}`:''}</small><strong>${esc(display)}</strong><span>${esc(result.group?.name||result.errors?.map((item)=>item.message).join('；')||'暂无可展示的最终分组结果')}</span></div>${status(result.status)}</div>${path}${steps}<div class="op-route-line">${statusBadge(run.route?.region||'统筹区待定','gray',true)}${statusBadge(run.route?.paymentMethod||'支付方式待定','blue',true)}${statusBadge(run.route?.grouperVersion||'规则版本待定','gray',true)}</div><div class="op-payment"><b>支付测算</b>${statusBadge(paymentLabel,paymentTone,true)}${payment.amount!=null?`<strong>¥${fmt(payment.amount)}</strong>`:`<span>${esc(payment.note||payment.reason||'不影响国家规则分组结果。')}</span>`}</div>${trace}`;
}

function renderGrouping(base,w){
  const profileOpts=[{value:'',label:'未选择支付政策（请确认统筹区）'},...PAYMENT_POLICY_PROFILES.map(x=>({value:x.id,label:`${x.region} · ${x.paymentMethod} · ${x.grouperVersion}`}))];
  const blocking=(base.episode.clinicalFactContext?.conflicts||[]).some((item)=>item.blocking&&item.impactScope?.includes('GROUPING'));
  const canFormal=Boolean(w.principalDiagnosis?.code&&w.preGroupingRun?.inputIntegrity?.ok&&w.preGroupingRun?.groupingResult?.group&&!w.preGroupingRun?.settlementIssues?.some((issue)=>issue.severity==='error')&&!mappingCandidate(w)&&!blocking);
  return `<div class="op-workbench">${sourcePanel(base,w)}${groupingSummary(base,w)}
  <div class="op-grid-main"><section class="base-card op-card"><div class="base-card__header op-card-head"><div><h3>分组输入工作台</h3><p>这里的输入来自当前选中患者、已保存病历/病案首页和结算清单，可直接修改后重新执行。</p></div>${status(`REV ${w.revision}`)}</div>
  <div class="op-form-grid"><label>支付政策配置${select(w.policyProfileId,'policyProfileId',profileOpts)}</label><label>性别${select(w.patient.sex,'patient.sex',[{value:'男',label:'男'},{value:'女',label:'女'}])}<small class="op-input-origin">${esc(inputSourceLabel(w,'patient.sex'))}</small></label><label>年龄${input(w.patient.age,'patient.age','type="number" min="0"')}<small class="op-input-origin">${esc(inputSourceLabel(w,'patient.age'))}</small></label><label>新生儿日龄${input(w.patient.ageInDays??'','patient.ageInDays','type="number" min="0" placeholder="非新生儿留空"')}</label><label>新生儿体重(g)${input(w.patient.newbornWeight??'','patient.newbornWeight','type="number" min="0" placeholder="非新生儿留空"')}</label></div>
  <div class="op-subsection"><h4>主要诊断</h4><div class="op-diagnosis-picker-row"><div class="op-two">${input(w.principalDiagnosis?.code||'','principalDiagnosis.code','placeholder="主要诊断编码"')}${input(w.principalDiagnosis?.name||'','principalDiagnosis.name','placeholder="主要诊断名称"')}</div>${diagnosisPickerButton('principal')}</div><small class="op-input-origin">${esc(inputSourceLabel(w,'diagnosis.principal.code'))}</small></div>
  <div class="op-subsection"><div class="op-row-head"><h4>其他诊断</h4>${btn('+ 添加诊断','add-secondary','secondary')}</div><div id="op-secondary-list">${diagnosisRows(w)}</div></div>
  <div class="op-subsection"><h4>主要手术 / 操作</h4><div class="op-two">${input(w.principalProcedure?.code||'','principalProcedure.code','placeholder="主要手术/操作编码"')}${input(w.principalProcedure?.name||'','principalProcedure.name','placeholder="主要手术/操作名称"')}</div><small class="op-input-origin">${esc(inputSourceLabel(w,'procedure.primary.code'))}</small></div>
  <div class="op-subsection"><div class="op-row-head"><h4>其他手术 / 操作</h4>${btn('+ 添加操作','add-procedure','secondary')}</div><div id="op-procedure-list">${procedureRows(w)}</div></div>
  <div class="op-actions">${btn('执行院内预分组','run-pre','primary')}${btn('锁定结算快照并执行正式分组','run-formal','secondary',!canFormal)}${btn('保存当前输入','save-group-input','secondary')}</div></section>
  <section class="base-card op-card"><div class="base-card__header op-card-head"><div><h3>分组执行结果</h3><p>医院预分组用于提前识别问题；正式分组使用锁定的结算快照，本地复刻医保侧规则执行。</p></div></div><h4 class="op-mini-title">院内预分组</h4>${resultCard(w.preGroupingRun)}<h4 class="op-mini-title">正式分组</h4>${resultCard(w.formalGroupingRun)}</section></div>
  <section class="base-card op-card"><div class="base-card__header op-card-head"><div><h3>业务状态</h3><p>正式分组后才进入医保审核；输入发生变化时，旧正式分组会被标记为过期。</p></div></div><div class="op-state-strip"><div><span>当前版本</span><b>V${w.revision}</b></div><div><span>正式分组</span><b>${w.formalGroupingRun?(w.formalGroupingRun.revision===w.revision?'已锁定':'已过期'):'未执行'}</b></div><div><span>智能审核</span><b>${w.auditRun?.finalStatus?groupingStatusLabel(w.auditRun.finalStatus):'未执行'}</b></div><div><span>人工动作</span><b>${w.reviewLog?.length||0}</b></div></div></section></div>`;
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
function bind(base,w){
  document.querySelectorAll('[data-op-action]').forEach(b=>b.addEventListener('click',()=>handleAction(b.dataset.opAction,base,w)));
  document.querySelectorAll('[data-open-diagnosis-picker]').forEach(b=>{if(!b.dataset.bound){b.dataset.bound='1';b.addEventListener('click',()=>openDiagnosisPicker(b));}});
  document.querySelector('[data-op-patient-select]')?.addEventListener('change',(event)=>window.medicalSystemMvp?.selectPatientByKey?.(event.target.value));
  const diagnosisSearch=document.querySelector('#op-diagnosis-search');diagnosisSearch?.addEventListener('input',()=>renderDiagnosisChoices(diagnosisSearch.value));
  const diagnosisModal=document.querySelector('#op-diagnosis-dialog');diagnosisModal?.addEventListener('click',(event)=>{
    const choice=event.target.closest?.('[data-diagnosis-code]');
    if(choice&&diagnosisPickerTarget){diagnosisPickerTarget.code.value=choice.dataset.diagnosisCode;diagnosisPickerTarget.name.value=choice.dataset.diagnosisName;diagnosisModal.close();diagnosisPickerTarget=null;return;}
    if(event.target===diagnosisModal)diagnosisModal.close();
  });
  diagnosisModal?.addEventListener('close',()=>{diagnosisPickerTarget=null;});
  document.querySelectorAll('[data-close-diagnosis-picker]').forEach(b=>b.addEventListener('click',()=>diagnosisModal?.close()));
  document.querySelectorAll('[data-remove-row]').forEach(b=>b.addEventListener('click',()=>{b.closest(b.dataset.removeRow==='claim'?'tr':'.op-repeat-row')?.remove();}));
  document.querySelectorAll('[data-review]').forEach(b=>b.addEventListener('click',()=>{const note=prompt('复核意见（可选）：','')||'';w.reviewLog=[...(w.reviewLog||[]),{time:now(),riskId:b.dataset.risk,action:b.dataset.review,note}];if(w.auditRun?.risks){const r=w.auditRun.risks.find(x=>x.riskId===b.dataset.risk);if(r)r.status=b.dataset.review;}saveWorkspace(w);rerender();}));
  document.querySelectorAll('[data-op-confirm-mapping]').forEach(b=>b.addEventListener('click',()=>{w.confirmedMappings=[...new Set([...(w.confirmedMappings||[]),b.dataset.opConfirmMapping])];w.reviewLog=[...(w.reviewLog||[]),{time:now(),action:'CONFIRM_CODING_MAPPING',note:b.dataset.opConfirmMapping}];w.revision=(w.revision||1)+1;const e=workingEpisode(base,w);w.preGroupingRun=runPreGrouping({episode:e,workspace:w});w.formalGroupingRun=runFormalGrouping({episode:e,workspace:w});w.auditRun=null;saveWorkspace(w);rerender();}));
}
function openDiagnosisPicker(button){
  const row=button.closest('[data-secondary-row]');
  diagnosisPickerTarget=row?{code:row.querySelector('[data-field="code"]'),name:row.querySelector('[data-field="name"]')}:{code:document.querySelector('[name="principalDiagnosis.code"]'),name:document.querySelector('[name="principalDiagnosis.name"]')};
  const modal=document.querySelector('#op-diagnosis-dialog'),search=document.querySelector('#op-diagnosis-search');if(!modal||!search)return;
  search.value='';renderDiagnosisChoices('');modal.showModal();search.focus();
}
function handleAction(action,base,w){
  if(action==='reload-current'){localStorage.removeItem(keyFor(base.episode.episodeId));rerender();return;}
  if(action==='add-secondary'){document.querySelector('#op-secondary-list')?.insertAdjacentHTML('beforeend',`<div class="op-repeat-row" data-secondary-row><span class="op-index">+</span>${input('','',`data-field="code" placeholder="诊断编码"`)}${diagnosisNameField('','secondary')}${removeButton('secondary')}</div>`);rerenderBindOnly(base,w);return;}
  if(action==='add-procedure'){document.querySelector('#op-procedure-list')?.insertAdjacentHTML('beforeend',`<div class="op-repeat-row" data-procedure-row><span class="op-index">+</span>${input('','',`data-field="code" placeholder="手术/操作编码"`)}${input('','',`data-field="name" placeholder="手术/操作名称"`)}${removeButton('procedure')}</div>`);rerenderBindOnly(base,w);return;}
  if(action==='add-claim'){document.querySelector('#op-claim-body')?.insertAdjacentHTML('beforeend',`<tr data-claim-row data-id="CLAIM-${Date.now()}"><td>+</td><td><select class="app-select op-input" data-field="category"><option value="examination">检查</option><option value="laboratory">化验</option><option value="treatment">治疗</option><option value="surgery">手术</option><option value="material">材料</option><option value="westernMedicine">西药</option><option value="other">其他</option></select></td><td>${input('','',`data-field="code" placeholder="项目编码"`)}</td><td>${input('','',`data-field="name" placeholder="项目名称"`)}</td><td>${input(String(base.episode.admission.at).slice(0,16),'',`data-field="time" type="datetime-local"`)}</td><td>${input(1,'',`data-field="qty" type="number"`)}</td><td>${input(0,'',`data-field="price" type="number" step="0.01"`)}</td><td>${input(0,'',`data-field="amount" type="number" step="0.01"`)}</td><td><label class="op-check"><input type="checkbox" data-field="aggregate">逐条</label></td><td>${removeButton('claim')}</td></tr>`);rerenderBindOnly(base,w);return;}
  if(['save-group-input','run-pre','run-formal'].includes(action))snapshotFromForm(w);
  if(action==='save-group-input'){markChanged(w);rerender();return;}
  if(action==='run-pre'){w.revision=(w.revision||1)+1;const e=workingEpisode(base,w);w.preGroupingRun=runPreGrouping({episode:e,workspace:w});w.updatedAt=new Date().toISOString();saveWorkspace(w);rerender();return;}
  if(action==='run-formal'){w.revision=(w.revision||1)+1;const e=workingEpisode(base,w);w.formalGroupingRun=runFormalGrouping({episode:e,workspace:w});w.auditRun=null;w.updatedAt=new Date().toISOString();saveWorkspace(w);rerender();return;}
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
