function evidence(id,sourceType,sourceId,title,excerpt,factPath=null,structuredValue=null){return {evidenceId:id,sourceType,sourceId,title,excerpt,factPath,structuredValue};}
function readDocRecords(episode){
  const records=episode?.documentSnapshots||[]; const out=[];
  for(const [i,r] of records.entries()){
    const text=String(r.snapshot?.text||'').trim();
    if(text) out.push(evidence(`EV-DOC-${i+1}`,'EMR',r.templateId||`doc-${i}`,r.templateName||'病历文书',text.slice(0,500),`documents.${r.templateId}`,r.snapshot?.data||[]));
  }
  return out;
}
function readGoldenClinicalRecords(episode){
  const c=episode?.goldenData?.clinical||{}; const out=[];
  for(const [i,x] of (c.vitals||[]).entries())out.push(evidence(`EV-GOLDEN-VITAL-${i+1}`,'EMR',`VITAL-${i+1}`,'生命体征',`${x.at||''} 体温${x.temperatureC??'—'}℃，脉搏${x.pulse??'—'}/分，呼吸${x.respiration??'—'}/分，血压${x.systolic??'—'}/${x.diastolic??'—'}mmHg，SpO₂ ${x.spo2??'—'}%`.trim(),`goldenData.clinical.vitals[${i}]`,x));
  for(const [i,panel] of (c.labs||[]).entries())for(const [j,x] of (panel.items||[]).entries())out.push(evidence(`EV-GOLDEN-LAB-${panel.panelId}-${x.code||j+1}`,'LIS',panel.panelId,`${x.name||x.code||'检验项目'}（${x.code||'无编码'}）`,`${panel.at||''} ${x.value??'—'} ${x.unit||''}；参考值 ${x.ref||'未提供'}；标记 ${x.flag||'未标记'}`.trim(),`goldenData.clinical.labs[${i}].items[${j}]`,x));
  for(const [i,x] of (c.imaging||[]).entries())out.push(evidence(`EV-GOLDEN-RIS-${x.reportId||i+1}`,'RIS',x.reportId||`imaging-${i+1}`,x.name||'影像报告',`${x.at||''} ${x.findings||''} 印象：${x.impression||''}`.trim(),`goldenData.clinical.imaging[${i}]`,x));
  for(const [i,x] of (c.orders||[]).entries())out.push(evidence(`EV-GOLDEN-ORDER-${x.orderId||i+1}`,'HIS',x.orderId||`order-${i+1}`,`${x.type||'医嘱'}：${x.name||''}`,`${x.startAt||''} ${x.status||''}`.trim(),`goldenData.clinical.orders[${i}]`,x));
  for(const [i,x] of (c.pathology||[]).entries())out.push(evidence(`EV-GOLDEN-PATH-${x.reportId||i+1}`,'LIS/PATH',x.reportId||`pathology-${i+1}`,`${x.specimen||'病理'}报告`,`${x.at||''} ${x.diagnosis||''}`.trim(),`goldenData.clinical.pathology[${i}]`,x));
  return out;
}
export function buildEvidenceIndex(episode){
  const out=[];const principal=episode?.diagnoses?.principal;
  out.push(evidence('EV-P1-ADMISSION','EMR','admission','入院记录/现病史',episode?.admission?.history||episode?.admission?.chiefComplaint||'未采集','admission.history'));
  out.push(evidence('EV-P1-DX','CASE_FACT','diagnoses.principal','主要诊断',`${principal?.code||''} ${principal?.name||''}`.trim(),'diagnoses.principal',principal||null));
  for(const [i,d] of (episode?.diagnoses?.secondary||[]).entries())out.push(evidence(`EV-P1-SDX-${i+1}`,'CASE_FACT',`diagnoses.secondary[${i}]`,`其他诊断 ${i+1}`,`${d.code||''} ${d.name||''}`.trim(),`diagnoses.secondary[${i}]`,d));
  for(const [i,p] of (episode?.procedures||[]).entries())out.push(evidence(`EV-P1-PROC-${i+1}`,'EMR',p.id||`procedure-${i}`,i===0?'主要手术/操作':`其他手术/操作 ${i}`,`${p.code||''} ${p.name||''}`.trim(),`procedures[${i}]`,p));
  for(const [i,x] of (episode?.fees?.items||[]).entries())out.push(evidence(`EV-P1-FEE-${i+1}`,'HIS',x.itemCode||x.serviceCode||`fee-${i}`,x.name||`费用项目${i+1}`,`${x.itemCode||x.serviceCode||''} ${x.name||''} 数量=${x.quantity??x.qty??''} 单价=${x.unitPrice??''} 金额=${x.amount??''} 计费时间=${x.billingTime||''}`.trim(),`fees.items[${i}]`,x));
  out.push(...readDocRecords(episode));
  out.push(...readGoldenClinicalRecords(episode));
  out.push(...(episode?.evidence||[]).map((x,i)=>({...x,evidenceId:x.evidenceId||`EV-RAW-${i+1}`,title:x.label||x.sourceId,excerpt:x.excerpt||x.label||'原始证据引用',factPath:x.factPath||null})));
  return out;
}
export function retrieveEvidence({risk,episode}){
  const index=buildEvidenceIndex(episode),paths=risk?.evidenceFactPaths||[],types=risk?.evidenceTypes||[];const target=String(risk?.target||'').toLowerCase();
  let selected=index.filter(e=>paths.some(p=>e.factPath&&(e.factPath===p||e.factPath.startsWith(p)||p.startsWith(e.factPath)))||types.includes(e.sourceType));
  if(target){const exact=index.filter(e=>`${e.title} ${e.excerpt}`.toLowerCase().includes(target));selected=[...exact,...selected.filter(x=>!exact.includes(x))];}
  if(!selected.length&&risk?.type==='CODING_STANDARDIZATION')selected=index.filter(e=>['CASE_FACT','EMR'].includes(e.sourceType));
  if(!selected.length&&/FEE|CLAIM_DETAIL/.test(risk?.type||''))selected=index.filter(e=>e.sourceType==='HIS');
  return {request:{riskId:risk?.riskId,target:risk?.target||risk?.title,requestedAt:new Date().toISOString(),requestedSources:['EMR','HIS','LIS','RIS','PACS']},evidence:selected.slice(0,12),completeness:selected.length?'AVAILABLE':'NOT_AVAILABLE'};
}
