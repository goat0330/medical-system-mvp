import { createEpisodeFixture } from './data/episode.js';
import { buildSettlementList, validateSettlementList } from './domain/settlement.js';
import { PAYMENT_POLICY_PROFILES, routePaymentPolicy } from './p1/payment-policy-router.js';
import { readSavedDocumentSnapshots, extractClinicalFactsFromDocuments, applyPatientContext, applyDocumentFacts, workspaceFromEpisode, episodeFromWorkspace } from './p1/current-case-adapter.js';
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
  if(activeEpisode){
    return {
      episodeId:activeEpisode.episodeId,
      name:activeEpisode.patient?.name||'当前患者',
      sex:activeEpisode.patient?.sex||'',
      age:Number(activeEpisode.patient?.age),
      department:activeEpisode.admission?.department||'',
      bed:activeEpisode.admission?.bed||'',
    };
  }
  const sideName=document.querySelector('.sidebar-patient strong')?.textContent?.trim()||'';
  const sideText=document.querySelector('.sidebar-patient p')?.innerText||'';
  let episodeId=(sideText.split(/\n/).map(x=>x.trim()).find(x=>/^EP-|^IP-/.test(x)))||'';
  let meta=sideText.split(/\n/).find(x=>/·/.test(x))||'';
  const card=document.querySelector('.patient-selector-card');
  const cardMeta=card?.querySelector('.patient-selector-card__meta')?.textContent||'';
  const cardTop=card?.querySelector('.patient-selector-card__top strong')?.textContent||'';
  if(cardMeta){const parts=cardMeta.split('·').map(x=>x.trim());episodeId=parts[0]||episodeId;meta=parts.slice(1).join(' · ');}
  const parts=meta.split('·').map(x=>x.trim());
  const sex=parts.find(x=>x==='男'||x==='女')||''; const ageText=parts.find(x=>/\d+岁/.test(x))||''; const age=Number(ageText.match(/\d+/)?.[0]||NaN);
  const department=parts.find(x=>x!==sex&&!/\d+岁/.test(x)&&!/^EP-|^IP-/.test(x))||'';
  const bed=cardTop.match(/\d+床/)?.[0]||'';
  const name=(cardTop?cardTop.replace(/^\d+床/,'').trim():sideName)||'当前患者';
  return {episodeId:episodeId||'EP-DEMO-001',name,sex,age:Number.isFinite(age)?age:null,department,bed};
}

function buildBaseCase(context,activeEpisode=null){
  let episode=applyPatientContext(activeEpisode||createEpisodeFixture(),context);
  const savedDocs=readSavedDocumentSnapshots(context.episodeId).map((doc)=>({...doc,fixtureSource:false}));
  const savedIds=new Set(savedDocs.map((doc)=>doc.templateId));
  const fixtureDocs=(activeEpisode?.goldenData?.documents||[]).filter((doc)=>!savedIds.has(doc.templateId)).map((doc)=>({
    templateId:doc.templateId,templateName:doc.name,status:doc.status,fixtureSource:true,
    snapshot:{text:doc.text,data:[]},
  }));
  const docs=[...fixtureDocs,...savedDocs];
  const facts=extractClinicalFactsFromDocuments(docs);
  episode=applyDocumentFacts(episode,facts); episode.documentSnapshots=docs;
  return {episode,docs,facts};
}
function keyFor(id){return `${STORE_PREFIX}${id}`;}
function loadWorkspace(base){
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
  const w=workspaceFromEpisode(base.episode,{policyProfileId:base.episode.insurance?.region?.includes('武汉')?'WH-DRG-3.0':'DIP-3.0-TEST'});
  delete w.localPaymentParameters;
  return w;
}
function saveWorkspace(w){delete w.localPaymentParameters;w.updatedAt=new Date().toISOString();localStorage.setItem(keyFor(w.episodeId),JSON.stringify(w));}
function contextBundle(){const active=window.medicalSystemMvp?.getEpisodeContext?.()?.episode||null;const context=parsePatientContext(active),base=buildBaseCase(context,active),workspace=loadWorkspace(base);return {context,base,workspace};}
function workingEpisode(base,workspace){const e=episodeFromWorkspace(base.episode,workspace);e.documentSnapshots=base.docs;return e;}
function status(x){const s=String(x||'—');const tone=/FAIL|BLOCK|INVALID|HIGH|ERROR/i.test(s)?'red':/PASS|GROUPED|CALCULATED|CONFIRMED|READY/i.test(s)?'green':/PENDING|REVIEW|NOT_RUN|PARTIAL|STALE/i.test(s)?'amber':'gray';return statusBadge(s,tone,true);}
function btn(label,action,cls=''){const variant=cls==='primary'||cls==='success'?'primary':'';return appButton(label,{variant,size:'small',attrs:`data-op-action="${action}"`});}
function removeButton(type){return appButton('删除',{size:'small',attrs:`data-remove-row="${type}"`});}
function input(value,name,extra=''){return `<input class="app-input op-input" name="${name}" value="${esc(value)}" ${extra}>`;}
function select(value,name,opts,attrs=''){return `<select class="app-select op-input" name="${name}" ${attrs}>${opts.map(x=>`<option value="${esc(x.value)}" ${x.value===value?'selected':''}>${esc(x.label)}</option>`).join('')}</select>`;}

function snapshotFromForm(w){
  const q=(n)=>document.querySelector(`[name="${CSS.escape(n)}"]`);
  if(q('policyProfileId')) w.policyProfileId=q('policyProfileId').value;
  if(q('patient.sex')) w.patient.sex=q('patient.sex').value;
  if(q('patient.age')) w.patient.age=Number(q('patient.age').value||0);
  if(q('patient.ageInDays')) w.patient.ageInDays=q('patient.ageInDays').value===''?null:Number(q('patient.ageInDays').value);
  if(q('patient.newbornWeight')) w.patient.newbornWeight=q('patient.newbornWeight').value===''?null:Number(q('patient.newbornWeight').value);
  if(q('principalDiagnosis.code')) w.principalDiagnosis.code=q('principalDiagnosis.code').value.trim();
  if(q('principalDiagnosis.name')) w.principalDiagnosis.name=q('principalDiagnosis.name').value.trim();
  if(q('principalProcedure.code')) w.principalProcedure.code=q('principalProcedure.code').value.trim();
  if(q('principalProcedure.name')) w.principalProcedure.name=q('principalProcedure.name').value.trim();
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
function sourcePanel(base,w){
  const dx=base.facts.mainDiagnosis,op=base.facts.mainProcedure,docs=base.docs.length;
  const savedDocs=base.docs.filter((doc)=>!doc.fixtureSource).length;
  const fixtureDocs=base.docs.filter((doc)=>doc.fixtureSource).length;
  const value=(x)=>x?.code||x?.name||'未映射';
  const patients=window.medicalSystemMvp?.getPatientOptions?.()||[];
  const options=patients.map(x=>({value:x.key,label:`${x.bed} · ${x.name} · ${x.episodeId}`}));
  const selectedKey=window.medicalSystemMvp?.getSelectedPatientKey?.()||'';
  const sourceCountLabel=fixtureDocs?`${fixtureDocs} 份 Golden 样本文书`:`${savedDocs} 份已保存病历`;
  return `<div class="base-card op-source"><div class="op-source-identity"><div><b>当前患者数据源</b><span>${esc(base.episode.patient.name)} · ${esc(base.episode.episodeId)} · ${esc(base.episode.patient.sex)} · ${esc(base.episode.patient.age)}岁</span></div><label class="op-patient-selector">患者身份${select(selectedKey,'activePatientKey',options,'data-op-patient-select aria-label="选择当前患者"')}</label></div><div class="op-source-tags">${statusBadge(base.episode.synthetic?'Golden 合成测试 Episode':'当前 Episode',base.episode.synthetic?'amber':'green',true)}${statusBadge(sourceCountLabel,docs?'green':'gray',true)}${statusBadge(`${savedDocs} 份本地已保存`,savedDocs?'blue':'gray',true)}${statusBadge('国家 DRG/DIP 3.0 规则包','blue',true)}</div><div class="op-source-map"><span>主要诊断：${esc(value(dx||base.episode.diagnoses?.principal))}<small>${dx?'来自已保存病历/病案首页':'来自当前患者 Episode'}</small></span><span>主要手术/操作：${esc(value(op||base.episode.procedures?.[0]))}<small>${op?'来自已保存病历/病案首页':'来自当前患者 Episode'}</small></span></div><div>${btn('从当前患者重新映射','reload-current','secondary')}</div></div>`;
}
function diagnosisRows(w){return (w.secondaryDiagnoses||[]).map((d,i)=>`<div class="op-repeat-row" data-secondary-row><span class="op-index">${i+1}</span>${input(d.code,'',`data-field="code" placeholder="诊断编码"`)}${diagnosisNameField(d.name,'secondary')}${removeButton('secondary')}</div>`).join('');}
function diagnosisDialog(){return `<dialog id="op-diagnosis-dialog" class="op-diagnosis-dialog" aria-labelledby="op-diagnosis-title"><div class="op-diagnosis-dialog__head"><div><h2 id="op-diagnosis-title">选择疾病诊断</h2><p>检索国家 DIP 3.0 规则包收录的诊断名称或编码。</p></div><button type="button" class="app-button app-button--small" data-close-diagnosis-picker aria-label="关闭">关闭</button></div><label class="op-diagnosis-dialog__search-label" for="op-diagnosis-search">疾病名称 / ICD-10 编码</label><input id="op-diagnosis-search" class="app-input" type="search" autocomplete="off" placeholder="输入疾病名称或编码，例如：胆囊结石、K80.1"><div id="op-diagnosis-count" class="op-diagnosis-dialog__count" aria-live="polite"></div><div id="op-diagnosis-results" class="op-diagnosis-dialog__results" role="listbox" aria-label="诊断搜索结果"></div><div class="op-diagnosis-dialog__foot"><span>选择后自动同时填入诊断编码和名称；仍可手动修改。</span><button type="button" class="app-button app-button--small" data-close-diagnosis-picker>取消</button></div></dialog>`;}
function renderDiagnosisChoices(query=''){
  const list=document.querySelector('#op-diagnosis-results'),count=document.querySelector('#op-diagnosis-count');if(!list||!count)return;
  const matches=searchDip3DiagnosisCatalog(query);count.textContent=`${matches.length} 条匹配 · 显示前 ${Math.min(matches.length,40)} 条`;
  list.innerHTML=matches.length?matches.slice(0,40).map(x=>`<button type="button" class="op-diagnosis-choice" role="option" data-diagnosis-code="${esc(x.code)}" data-diagnosis-name="${esc(x.name)}"><span class="mono">${esc(x.code)}</span><span>${esc(x.name)}</span></button>`).join(''):'<div class="empty-state">没有找到匹配诊断，请换关键词或直接手动填写。</div>';
}
function resultCard(run){if(!run)return `<div class="empty-state">尚未执行。修改输入后点击“院内预分组”或“锁定清单并正式分组”。</div>`;const g=run.groupingResult||{};const isDrg=run.route?.paymentMethod==='DRG';const mapping=g.trace?.find?.((x)=>x.stage==='CODE_NORMALIZATION'&&x.mappingKey&&x.status==='REQUIRES_CONFIRMATION');const path=groupingPath(isDrg?{mdc:g.mdc?.code,adrg:g.adrg?.code,drg:g.group?.code}:{mdc:'DIP',adrg:g.group?.category||'规则路径',drg:g.group?.code,labels:['支付分支','匹配层级','DIP病种']});const trace=ruleTrace((g.trace||[]).map((x,i)=>({title:x.stage||`步骤 ${i+1}`,message:[x.input&&`输入：${x.input}`,x.rule&&`规则：${x.rule}`,x.output&&`输出：${x.output}`,x.source&&`来源：${x.source}`].filter(Boolean).join('；'),status:x.status||'完成',tone:/FAIL|BLOCK|INVALID/i.test(x.status||'')?'red':/MATCHED|PASS|GROUPED|BUILT/i.test(x.status||'')?'green':'blue'})));return `<div class="op-result-head"><div><small>${esc(run.runType)}${run.formalStatus?` · ${esc(run.formalStatus)}`:''}</small><strong>${esc(g.group?.code||g.status||'—')}</strong><span>${esc(g.group?.name||'')}</span></div>${status(g.status)}</div>${path}<div class="op-route-line">${statusBadge(run.route?.region||'统筹区待定','gray',true)}${statusBadge(run.route?.paymentMethod||'支付方式待定','blue',true)}${statusBadge(run.route?.grouperVersion||'规则版本待定','gray',true)}</div>${mapping?`<div class="notice op-warning">编码标准化：${esc(mapping.input)} 映射为 ${esc(mapping.output)} ${appButton('编码员确认并重跑',{variant:'primary',size:'small',attrs:`data-op-confirm-mapping="${esc(mapping.mappingKey)}"`})}</div>`:''}<div class="op-payment"><b>支付测算</b>${status(run.paymentResult?.status)}${run.paymentResult?.amount!=null?`<strong>¥${fmt(run.paymentResult.amount)}</strong>`:`<span>${esc(run.paymentResult?.note||run.paymentResult?.reason||'')}</span>`}</div>${trace}`;}

function renderGrouping(base,w){
  const profileOpts=PAYMENT_POLICY_PROFILES.map(x=>({value:x.id,label:`${x.region} · ${x.paymentMethod} · ${x.grouperVersion}`}));
  return `<div class="op-workbench">${sourcePanel(base,w)}
  <div class="op-grid-main"><section class="base-card op-card"><div class="base-card__header op-card-head"><div><h3>分组输入工作台</h3><p>这里的输入来自当前选中患者、已保存病历/病案首页和结算清单，可直接修改后重新执行。</p></div>${status(`REV ${w.revision}`)}</div>
  <div class="op-form-grid"><label>支付政策配置${select(w.policyProfileId,'policyProfileId',profileOpts)}</label><label>性别${select(w.patient.sex,'patient.sex',[{value:'男',label:'男'},{value:'女',label:'女'}])}</label><label>年龄${input(w.patient.age,'patient.age','type="number" min="0"')}</label><label>新生儿日龄${input(w.patient.ageInDays??'','patient.ageInDays','type="number" min="0" placeholder="非新生儿留空"')}</label><label>新生儿体重(g)${input(w.patient.newbornWeight??'','patient.newbornWeight','type="number" min="0" placeholder="非新生儿留空"')}</label></div>
  <div class="op-subsection"><h4>主要诊断</h4><div class="op-diagnosis-picker-row"><div class="op-two">${input(w.principalDiagnosis?.code||'','principalDiagnosis.code','placeholder="主要诊断编码"')}${input(w.principalDiagnosis?.name||'','principalDiagnosis.name','placeholder="主要诊断名称"')}</div>${diagnosisPickerButton('principal')}</div></div>
  <div class="op-subsection"><div class="op-row-head"><h4>其他诊断</h4>${btn('+ 添加诊断','add-secondary','secondary')}</div><div id="op-secondary-list">${diagnosisRows(w)}</div></div>
  <div class="op-subsection"><h4>主要手术 / 操作</h4><div class="op-two">${input(w.principalProcedure?.code||'','principalProcedure.code','placeholder="主要手术/操作编码"')}${input(w.principalProcedure?.name||'','principalProcedure.name','placeholder="主要手术/操作名称"')}</div></div>
  <div class="op-subsection"><div class="op-row-head"><h4>其他手术 / 操作</h4>${btn('+ 添加操作','add-procedure','secondary')}</div><div id="op-procedure-list">${procedureRows(w)}</div></div>
  <div class="op-actions">${btn('保存当前输入','save-group-input','secondary')}${btn('执行院内预分组','run-pre','primary')}${btn('锁定结算快照并执行正式分组','run-formal','success')}</div></section>
  <section class="base-card op-card"><div class="base-card__header op-card-head"><div><h3>分组执行结果</h3><p>医院预分组用于提前识别问题；正式分组使用锁定的结算快照，本地复刻医保侧规则执行。</p></div></div><h4 class="op-mini-title">院内预分组</h4>${resultCard(w.preGroupingRun)}<h4 class="op-mini-title">正式分组</h4>${resultCard(w.formalGroupingRun)}</section></div>
  <section class="base-card op-card"><div class="base-card__header op-card-head"><div><h3>业务状态</h3><p>正式分组后才进入医保审核；输入发生变化时，旧正式分组会被标记为过期。</p></div></div><div class="op-state-strip"><div><span>当前版本</span><b>V${w.revision}</b></div><div><span>正式分组</span><b>${w.formalGroupingRun?(w.formalGroupingRun.revision===w.revision?'已锁定':'已过期'):'未执行'}</b></div><div><span>智能审核</span><b>${w.auditRun?.finalStatus||'未执行'}</b></div><div><span>人工动作</span><b>${w.reviewLog?.length||0}</b></div></div></section></div>`;
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
  const {base,workspace}=contextBundle(); applying=true; content.dataset.operationalApplied='1'; const auditView=/智能医保审核/.test(header.textContent||''); content.innerHTML=auditView?renderAudit(base,workspace):renderGrouping(base,workspace); if(!auditView)content.insertAdjacentHTML('beforeend',diagnosisDialog()); bind(base,workspace); applying=false;
}
function rerender(){const c=document.querySelector('.page-content');if(c)c.dataset.operationalApplied='0';apply();}
const observer=new MutationObserver(()=>queueMicrotask(apply));observer.observe(document.querySelector('#app'),{childList:true,subtree:true});window.addEventListener('load',apply);setTimeout(apply,0);
