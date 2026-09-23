import { buildClinicalFactContext, saveFactDecision, clearFactDecision } from './clinical-facts/index.js';
import { createFactDecision } from './clinical-facts/models/decision.js';
import { readPatientDocumentSnapshots } from './p1/current-case-adapter.js';

const esc=(v)=>String(v??'').replace(/[&<>"']/g,(m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let applying=false;
function labelForConcept(c){return ({'patient.age':'年龄','patient.birthDate':'出生日期','patient.sex':'性别','diagnosis.principal.code':'主要诊断编码','diagnosis.principal.name':'主要诊断','procedure.primary.code':'主要手术/操作编码','procedure.primary.name':'主要手术/操作名称','admission.at':'入院时间','discharge.at':'出院时间'})[c]||c;}
function sourceLabel(c){return [c.sourceDocumentType||c.sourceType,c.sourceVersion?`版本 ${c.sourceVersion}`:'',c.fieldName||''].filter(Boolean).join(' · ');}
function keyFact(context,concept){return context.facts.find((x)=>x.concept===concept&&x.status==='CONFIRMED')||context.facts.find((x)=>x.concept===concept)||null;}
function factCell(context,concept){const f=keyFact(context,concept);if(!f)return `<div><span>${esc(labelForConcept(concept))}</span><b>未映射</b><small>暂无统一事实</small></div>`;return `<div><span>${esc(labelForConcept(concept))}</span><b>${esc(f.value)}</b><small>${esc(f.status)} · ${f.evidenceIds.length} 条证据</small></div>`;}
function groupingFactCell(context,concept,label,relatedConcept=null){
  const fact=keyFact(context,concept);const confirmed=fact?.status==='CONFIRMED';
  const related=relatedConcept?keyFact(context,relatedConcept):null;
  const value=!fact?'未映射':confirmed?fact.value:'待确认';
  const note=!fact?'暂无统一事实':related?.status==='CONFIRMED'?`${related.value} · ${fact.evidenceIds.length} 条来源`:`${fact.evidenceIds.length} 条来源 · ${confirmed?'可映射':'需确认'}`;
  return `<div><span>${esc(label)}</span><b>${esc(value)}</b><small>${esc(note)}</small></div>`;
}
function renderGroupingFacts(context){
  const concepts=['patient.sex','patient.age','diagnosis.principal.code','diagnosis.principal.name','procedure.primary.code','procedure.primary.name'];
  const facts=concepts.map((concept)=>context.facts.find((x)=>x.concept===concept)).filter(Boolean);
  const evidenceIds=new Set(facts.flatMap((fact)=>fact.evidenceIds||[]));
  const evidence=context.evidence.filter((item)=>evidenceIds.has(item.evidenceId));
  const conflicts=(context.conflicts||[]).filter((item)=>item.impactScope?.includes('GROUPING'));
  return `<section class="base-card fact-platform-card" data-fact-platform-card><div class="base-card__header"><div><h3>分组输入来源</h3><p>仅列出本次分组使用的关键事实；来源证据和待确认冲突按需展开。</p></div></div><div class="fact-key-grid">${groupingFactCell(context,'patient.sex','性别')}${groupingFactCell(context,'patient.age','年龄')}${groupingFactCell(context,'diagnosis.principal.code','主要诊断编码','diagnosis.principal.name')}${groupingFactCell(context,'procedure.primary.code','主要手术/操作编码','procedure.primary.name')}</div>${conflicts.length?`<details class="fact-conflict-details"><summary>查看待确认的分组事实（${conflicts.length}）</summary><div class="fact-conflict-list">${conflicts.map(conflictHtml).join('')}</div></details>`:'<div class="fact-ok">未发现待确认的分组关键事实冲突。</div>'}<details class="fact-evidence-list"><summary>查看分组字段来源（${evidence.length}）</summary>${evidence.map((item)=>`<div><b>${esc(item.fieldName||item.metadata?.templateName||item.sourceType)}</b><span>${esc(item.sourceDocumentType||item.sourceType)}${item.sourceVersion?` · ${esc(item.sourceVersion)}`:''}</span><p>${esc(item.excerpt)}</p></div>`).join('')}</details></section>`;
}
function conflictHtml(conflict){
  return `<div class="fact-conflict ${conflict.blocking?'is-blocking':''}"><div class="fact-conflict__head"><div><b>${esc(labelForConcept(conflict.concept))}</b><span>${esc(conflict.reason)}</span></div><em>${conflict.blocking?'阻断下游':'需核实'}</em></div><div class="fact-conflict__candidates">${(conflict.candidates||[]).map((c,i)=>`<div><div><strong>候选 ${i+1}：${esc(typeof c.value==='object'?JSON.stringify(c.value):c.value)}</strong><small>${esc(sourceLabel(c)||c.excerpt||c.sourceType)}</small>${c.excerpt?`<p>${esc(c.excerpt)}</p>`:''}</div><button class="app-button app-button--small" data-fact-choose data-concept="${esc(conflict.concept)}" data-evidence="${esc(c.evidenceId||'')}" data-value="${esc(encodeURIComponent(JSON.stringify(c.value)))}">采用此值</button></div>`).join('')}</div><button class="fact-clear-decision" data-fact-clear="${esc(conflict.concept)}">清除人工裁定</button></div>`;
}
function render(context){
  const conflicts=context.conflicts||[],blocking=conflicts.filter((x)=>x.blocking).length;
  return `<section class="base-card fact-platform-card" data-fact-platform-card><div class="base-card__header"><div><h3>患者事实与证据</h3><p>病历 / 病案首页 / HIS / LIS / RIS 先进入统一事实层；存在冲突时不静默覆盖，人工确认后再供结算、分组和审核使用。</p></div><span class="fact-revision">${esc(context.revision)}</span></div><div class="fact-metrics"><div><span>Evidence</span><b>${context.evidence.length}</b></div><div><span>ClinicalFact</span><b>${context.facts.length}</b></div><div><span>冲突</span><b>${conflicts.length}</b></div><div><span>阻断</span><b>${blocking}</b></div></div><div class="fact-key-grid">${factCell(context,'patient.age')}${factCell(context,'diagnosis.principal.code')}${factCell(context,'procedure.primary.code')}</div>${conflicts.length?`<div class="fact-conflict-list"><h4>待确认多源冲突</h4>${conflicts.map(conflictHtml).join('')}</div>`:'<div class="fact-ok">当前关键事实来源一致，可以继续进入结算清单、DRG/DIP 与审核。</div>'}<details class="fact-evidence-list"><summary>查看证据索引（${context.evidence.length}）</summary>${context.evidence.slice(0,60).map((e)=>`<div><b>${esc(e.fieldName||e.metadata?.templateName||e.sourceType)}</b><span>${esc(e.sourceType)}${e.sourceVersion?` · ${esc(e.sourceVersion)}`:''}</span><p>${esc(e.excerpt)}</p></div>`).join('')}</details></section>`;
}
function bind(root,episodeId){
  root.querySelectorAll('[data-fact-choose]').forEach((button)=>button.addEventListener('click',()=>{
    const value=JSON.parse(decodeURIComponent(button.dataset.value));
    saveFactDecision(createFactDecision({decisionId:`DEC-${episodeId}-${button.dataset.concept}-${Date.now()}`,episodeId,concept:button.dataset.concept,selectedEvidenceId:button.dataset.evidence||null,selectedValue:value,reason:'用户在患者事实与证据工作台人工确认'}));
    const opKey=`medical-mvp-operational-v3:${episodeId}`;try{localStorage.removeItem(opKey);}catch{}
    location.reload();
  }));
  root.querySelectorAll('[data-fact-clear]').forEach((button)=>button.addEventListener('click',()=>{clearFactDecision(episodeId,button.dataset.factClear);try{localStorage.removeItem(`medical-mvp-operational-v3:${episodeId}`);}catch{}location.reload();}));
}
function apply(){
  if(applying)return;const content=document.querySelector('.page-content');if(!content||content.querySelector('[data-fact-platform-card]'))return;
  const header=[...document.querySelectorAll('h1,h2')].find((x)=>/DRG\s*\/\s*DIP 3\.0|智能医保审核|医疗保障基金结算清单/.test(x.textContent||''));if(!header)return;
  const episode=window.medicalSystemMvp?.getEpisodeContext?.()?.episode;if(!episode)return;
  applying=true;try{const context=buildClinicalFactContext({episode,documentSnapshots:readPatientDocumentSnapshots(episode)});const groupingOnly=/DRG\s*\/\s*DIP 3\.0/.test(header.textContent||'');const html=groupingOnly?renderGroupingFacts(context):render(context);const anchor=content.querySelector('.op-source')||content.firstElementChild;if(anchor)anchor.insertAdjacentHTML('afterend',html);else content.insertAdjacentHTML('afterbegin',html);const root=content.querySelector('[data-fact-platform-card]');if(root)bind(root,episode.episodeId);}finally{applying=false;}
}
const observer=new MutationObserver(()=>queueMicrotask(apply));observer.observe(document.querySelector('#app'),{childList:true,subtree:true});window.addEventListener('load',apply);setTimeout(apply,0);
