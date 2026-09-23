import { buildClinicalFactContext } from '../clinical-facts/index.js';

function legacyEvidence(id,sourceType,sourceId,title,excerpt,factPath=null,structuredValue=null){return {evidenceId:id,sourceType,sourceId,title,excerpt,factPath,structuredValue};}

function mapEvidenceItem(item){
  return {
    evidenceId:item.evidenceId,
    sourceType:item.sourceType,
    sourceId:item.sourceId||item.sourceDocumentId,
    title:item.fieldName || item.metadata?.templateName || item.sourceDocumentType || item.sourceId || item.sourceType,
    excerpt:item.excerpt,
    factPath:item.factPath || item.concept,
    structuredValue:item.structuredValue ?? item.value,
    concept:item.concept || null,
    sourceDocumentType:item.sourceDocumentType || null,
    sourceVersion:item.sourceVersion || null,
    fieldCode:item.fieldCode || null,
    fieldName:item.fieldName || null,
  };
}

export function buildEvidenceIndex(episode){
  const context=episode?.clinicalFactContext || buildClinicalFactContext({episode,documentSnapshots:episode?.documentSnapshots||[]});
  const out=context.evidence.map(mapEvidenceItem);
  // Preserve legacy raw references when they carry external IDs not otherwise indexed.
  for(const [i,x] of (episode?.evidence||[]).entries()){
    const id=x.evidenceId||`EV-RAW-${i+1}`;
    if(out.some((e)=>e.evidenceId===id))continue;
    out.push({...x,evidenceId:id,title:x.label||x.sourceId,excerpt:x.excerpt||x.label||'原始证据引用',factPath:x.factPath||null});
  }
  if(!out.length&&episode?.admission?.history){
    out.push(legacyEvidence('EV-P1-ADMISSION','EMR','admission','入院记录/现病史',episode.admission.history,'admission.history'));
  }
  return out;
}

export function retrieveEvidence({risk,episode}){
  const index=buildEvidenceIndex(episode),paths=risk?.evidenceFactPaths||[],types=risk?.evidenceTypes||[],refs=risk?.evidenceRefs||[];const target=String(risk?.target||'').toLowerCase();
  let selected=index.filter(e=>refs.includes(e.evidenceId)||paths.some(p=>e.factPath&&(e.factPath===p||e.factPath.startsWith(p)||p.startsWith(e.factPath)))||types.includes(e.sourceType));
  if(target){const exact=index.filter(e=>`${e.title} ${e.excerpt} ${e.concept||''}`.toLowerCase().includes(target));selected=[...exact,...selected.filter(x=>!exact.includes(x))];}
  if(!selected.length&&risk?.type==='CODING_STANDARDIZATION')selected=index.filter(e=>['EPISODE','EMR'].includes(e.sourceType));
  if(!selected.length&&/FEE|CLAIM_DETAIL/.test(risk?.type||''))selected=index.filter(e=>e.sourceType==='HIS');
  const dedup=[...new Map(selected.map((x)=>[x.evidenceId,x])).values()];
  return {request:{riskId:risk?.riskId,target:risk?.target||risk?.title,requestedAt:new Date().toISOString(),requestedSources:['EMR','HIS','LIS','RIS/PACS','NURSING']},evidence:dedup.slice(0,20),completeness:dedup.length?'AVAILABLE':'NOT_AVAILABLE'};
}
