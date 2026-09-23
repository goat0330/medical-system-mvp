import { buildClinicalFactContext } from './clinical-facts/index.js';
import { runFullChainQualityControl } from './clinical-facts/quality/full-chain-quality.js';
import { readSavedDocumentSnapshots } from './p1/current-case-adapter.js';
import { buildSettlementList } from './domain/settlement.js';

const esc=(v)=>String(v??'').replace(/[&<>"']/g,(m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let applying=false;
const WORKSPACE_PREFIX='medical-mvp-operational-v3:';
function goldenDocuments(episode,saved){const ids=new Set(saved.map((x)=>x.templateId));return (episode?.goldenData?.documents||[]).filter((x)=>!ids.has(x.templateId)).map((x)=>({templateId:x.templateId,templateName:x.name,status:x.status,fixtureSource:true,version:episode.datasetVersion||'golden',snapshot:{text:x.text,data:[]}}));}
function documentsFor(episode){const saved=readSavedDocumentSnapshots(episode.episodeId).map((x)=>({...x,fixtureSource:false}));return [...goldenDocuments(episode,saved),...saved];}
function workspaceFor(id){
  try{
    const workspace=JSON.parse(localStorage.getItem(`${WORKSPACE_PREFIX}${id}`)||'null');
    if(!workspace)return null;
    if(Number(workspace.formalGroupingRun?.revision)!==Number(workspace.revision))workspace.formalGroupingRun=null;
    if(Number(workspace.preGroupingRun?.revision)!==Number(workspace.revision))workspace.preGroupingRun=null;
    if(Number(workspace.auditRun?.revision)!==Number(workspace.revision))workspace.auditRun=null;
    return workspace;
  }catch{return null;}
}
function tone(status){return status==='PASS'?'green':status==='BLOCKED'?'red':status==='REVIEW'?'amber':'gray';}
function domainCard(domain){return `<div class="full-qc-domain full-qc-domain--${domain.status.toLowerCase()}"><div><b>${esc(domain.label)}</b><span>${domain.issueCount} 条问题${domain.blockingCount?` · ${domain.blockingCount} 条阻断`:''}</span></div><em class="status-badge status-badge--${tone(domain.status)} status-badge--compact">${esc(domain.status)}</em></div>`;}
function issueRow(issue){const impact=(issue.impactScope||[]).join(' / ')||'当前环节';return `<div class="full-qc-issue ${issue.blocking?'is-blocking':''}"><div><b>${esc(issue.title)}</b><p>${esc(issue.message||'')}</p><small>${esc(issue.qcDomain)} · 影响：${esc(impact)} · 证据 ${issue.evidenceRefs?.length||0} 条</small></div><span>${issue.blocking?'阻断':'核实'}</span></div>`;}
function render(run){return `<section class="base-card full-qc-card" data-full-chain-qc><div class="base-card__header"><div><h3>全流程质控</h3><p>六类质控共用同一 Patient Fact / Evidence 底座：单文书 → 跨源一致性 → 病案首页 → 结算清单 → DRG/DIP → 医保审核。</p></div><div class="full-qc-head-status"><strong>${run.summary.total}</strong><span>问题</span><em class="status-badge status-badge--${tone(run.finalStatus)} status-badge--compact">${esc(run.finalStatus)}</em></div></div><div class="full-qc-domains">${run.domains.map(domainCard).join('')}</div>${run.issues.length?`<details class="full-qc-details" ${run.summary.blocking?'open':''}><summary>查看质控问题 · ${run.summary.blocking} 条阻断 / ${run.summary.total} 条全部</summary><div>${run.issues.slice(0,12).map(issueRow).join('')}${run.issues.length>12?`<p class="full-qc-more">还有 ${run.issues.length-12} 条，请在对应业务环节继续处理。</p>`:''}</div></details>`:'<div class="fact-ok">当前已执行环节未发现质控问题。</div>'}</section>`;}
function relevantPage(){const header=[...document.querySelectorAll('h1,h2')].find((x)=>/Episode 总览|病案首页|医疗保障基金结算清单|DRG\s*\/\s*DIP 3\.0|智能医保审核/.test(x.textContent||''));return Boolean(header);}
function apply(){if(applying||!relevantPage())return;const content=document.querySelector('.page-content');if(!content||content.querySelector('[data-full-chain-qc]'))return;const ctx=window.medicalSystemMvp?.getEpisodeContext?.();const episode=ctx?.episode;if(!episode)return;applying=true;try{const docs=documentsFor(episode);const facts=buildClinicalFactContext({episode,documentSnapshots:docs});const workspace=workspaceFor(episode.episodeId);const groupingRun=workspace?.formalGroupingRun||workspace?.preGroupingRun||null;const settlement=buildSettlementList(episode,{sourceDocuments:docs});const run=runFullChainQualityControl({episode,documentSnapshots:docs,factContext:facts,settlement,groupingRun,auditRun:workspace?.auditRun||null});const factCard=content.querySelector('[data-fact-platform-card]');const anchor=factCard||content.querySelector('.op-source')||content.firstElementChild;if(anchor)anchor.insertAdjacentHTML('afterend',render(run));else content.insertAdjacentHTML('afterbegin',render(run));}finally{applying=false;}}
const observer=new MutationObserver(()=>queueMicrotask(apply));observer.observe(document.querySelector('#app'),{childList:true,subtree:true});window.addEventListener('medical-system:source-integrity',()=>queueMicrotask(()=>{document.querySelector('[data-full-chain-qc]')?.remove();apply();}));window.addEventListener('load',apply);setTimeout(apply,0);
