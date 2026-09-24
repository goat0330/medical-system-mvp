import { buildClinicalFactContext } from './clinical-facts/index.js';
import { runFullChainQualityControl } from './clinical-facts/quality/full-chain-quality.js';
import { readPatientDocumentSnapshots } from './p1/current-case-adapter.js';
import { buildSettlementList } from './domain/settlement.js';
import { filterGroupingQualityIssues, groupingImpactLabel, groupingQualityDomainLabel, groupingStatusLabel } from './p1/grouping-presentation.js';

const esc=(v)=>String(v??'').replace(/[&<>"']/g,(m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let applying=false;
const WORKSPACE_PREFIX='medical-mvp-operational-v3:';
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
function domainCard(domain, localized=false){const state=localized?groupingStatusLabel(domain.status):domain.status;return `<div class="full-qc-domain full-qc-domain--${domain.status.toLowerCase()}"><div><b>${esc(domain.label)}</b><span>${domain.issueCount} 项关联问题${domain.blockingCount?` · ${domain.blockingCount} 项阻断`:''}</span></div><em class="status-badge status-badge--${tone(domain.status)} status-badge--compact">${esc(state)}</em></div>`;}
function issueRow(issue, localized=false){const impact=(issue.impactScope||[]).map((scope)=>localized?groupingImpactLabel(scope):scope).join(' / ')||'当前环节';const domain=localized?groupingQualityDomainLabel(issue.qcDomain):issue.qcDomain;const title=localized?issue.title.replace(/^分组失败：(.+)$/,(_,state)=>`分组失败：${groupingStatusLabel(state)}`):issue.title;return `<div class="full-qc-issue ${issue.blocking?'is-blocking':''}"><div><b>${esc(title)}</b><p>${esc(issue.message||'')}</p><small>${esc(domain)} · 影响：${esc(impact)} · 证据 ${issue.evidenceRefs?.length||0} 条</small></div><span>${issue.blocking?'阻断':'核实'}</span></div>`;}
function render(run, groupingOnly=false){
  if(groupingOnly){
    const relevant=filterGroupingQualityIssues(run.issues);
    const visibleIds=new Set(relevant.map((issue)=>issue.issueId));
    const otherIssues=run.issues.filter((issue)=>!visibleIds.has(issue.issueId));
    const groupDomain=run.domains.find((domain)=>domain.id==='GROUPING');
    const blocked=relevant.some((issue)=>issue.blocking||issue.severity==='high');
    const status=blocked?'BLOCKED':relevant.length?'REVIEW':groupDomain?.status||'NOT_RUN';
    const summary=relevant.length?`${relevant.length} 项质控问题影响当前分组。`:'分组尚未执行；当前未发现已知的分组阻断项。';
    return `<details class="full-qc-card op-qc-details" data-full-chain-qc><summary>分组质控 · ${relevant.length?`${relevant.length} 项关联事项（${blocked?'阻断':'待核实'}）`:'当前无已知阻断项'}<span class="status-badge status-badge--${tone(status)} status-badge--compact">${esc(groupingStatusLabel(status))}</span></summary><div class="op-qc-details__body"><p>${esc(summary)}仅展示影响当前 DRG/DIP 的事项。</p>${relevant.length?`<div class="full-qc-issues">${relevant.map((issue)=>issueRow(issue,true)).join('')}</div>`:'<div class="fact-ok">关键输入检查无已知分组阻断项；执行分组后仍需查看规则结果。</div>'}<details class="full-qc-details"><summary>查看全流程质控（6 个环节 · ${run.summary.total} 个独立问题）</summary><div><div class="full-qc-domains">${run.domains.map((domain)=>domainCard(domain,true)).join('')}</div>${otherIssues.length?otherIssues.map((issue)=>issueRow(issue,true)).join(''):'<p class="full-qc-more">其余环节当前没有额外问题。</p>'}</div></details></div></details>`;
  }
  return `<section class="base-card full-qc-card" data-full-chain-qc><div class="base-card__header"><div><h3>全流程质控</h3><p>六类质控共用同一 Patient Fact / Evidence 底座：单文书 → 跨源一致性 → 病案首页 → 结算清单 → DRG/DIP → 医保审核。</p></div><div class="full-qc-head-status"><strong>${run.summary.total}</strong><span>独立问题</span><em class="status-badge status-badge--${tone(run.finalStatus)} status-badge--compact">${esc(run.finalStatus)}</em></div></div><div class="full-qc-domains">${run.domains.map(domainCard).join('')}</div>${run.issues.length?`<details class="full-qc-details"><summary>查看质控问题 · ${run.summary.blocking} 项阻断 / ${run.summary.total} 个独立问题</summary><div>${run.issues.slice(0,12).map(issueRow).join('')}${run.issues.length>12?`<p class="full-qc-more">还有 ${run.issues.length-12} 项，请在对应业务环节继续处理。</p>`:''}</div></details>`:'<div class="fact-ok">当前已执行环节未发现质控问题。</div>'}</section>`;
}
function activePage(){const header=[...document.querySelectorAll('h1,h2')].find((x)=>/Episode 总览|病案首页|医疗保障基金结算清单|DRG\s*\/\s*DIP 3\.0|智能医保审核/.test(x.textContent||''));if(!header)return null;return /DRG\s*\/\s*DIP 3\.0/.test(header.textContent||'')?'GROUPING':'OTHER';}
function apply(){if(applying)return;const page=activePage();if(!page)return;const content=document.querySelector('.page-content');if(!content||content.querySelector('[data-full-chain-qc]'))return;const ctx=window.medicalSystemMvp?.getEpisodeContext?.();const episode=ctx?.episode;if(!episode)return;applying=true;try{const docs=readPatientDocumentSnapshots(episode);const facts=buildClinicalFactContext({episode,documentSnapshots:docs});const workspace=workspaceFor(episode.episodeId);const groupingRun=workspace?.formalGroupingRun||workspace?.preGroupingRun||null;const settlement=buildSettlementList(episode,{sourceDocuments:docs});const resolvedCollections=Object.entries(workspace?.groupingInputSources||{}).filter(([,source])=>source.status==='MANUAL_OVERRIDE').map(([collection])=>collection);const run=runFullChainQualityControl({episode,documentSnapshots:docs,factContext:facts,settlement,groupingRun,auditRun:workspace?.auditRun||null,resolvedCollections});const groupingOnly=page==='GROUPING';const slot=groupingOnly?content.querySelector('[data-grouping-qc-slot]'):null;const factCard=content.querySelector('[data-fact-platform-card]');const anchor=factCard||content.querySelector('.op-source')||content.firstElementChild;if(slot)slot.insertAdjacentHTML('beforeend',render(run,true));else if(anchor)anchor.insertAdjacentHTML('afterend',render(run,groupingOnly));else content.insertAdjacentHTML('afterbegin',render(run,groupingOnly));}finally{applying=false;}}
const observer=new MutationObserver(()=>queueMicrotask(apply));observer.observe(document.querySelector('#app'),{childList:true,subtree:true});window.addEventListener('medical-system:source-integrity',()=>queueMicrotask(()=>{document.querySelector('[data-full-chain-qc]')?.remove();apply();}));window.addEventListener('load',apply);setTimeout(apply,0);
