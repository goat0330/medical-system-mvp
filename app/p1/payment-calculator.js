const n=(v)=>{if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null;};
const MEDICINE_CATEGORIES=new Set(['medicine','drug','westernmedicine','tcm','patentmedicine','chinesemedicine']);
const COST_CATEGORY_LABELS=Object.freeze({medicine:'药品',examination:'检查',laboratory:'化验',treatment:'治疗',surgery:'手术',material:'材料',other:'其他'});

function costCategory(item){
  const category=String(item?.category||'').replace(/[\s_-]/g,'').toLowerCase();
  const name=String(item?.itemName||item?.name||'');
  if(MEDICINE_CATEGORIES.has(category)||/药|中药/.test(name))return 'medicine';
  if(['examination','laboratory','treatment','surgery','material'].includes(category))return category;
  return 'other';
}

export function aggregateCurrentCaseCost(episode){
  const source=Array.isArray(episode?.fees?.items)?episode.fees.items:[];
  const byCategory=new Map();
  for(const item of source){const category=costCategory(item);const rows=byCategory.get(category)||[];rows.push(item);byCategory.set(category,rows);}
  const selected=[...byCategory.values()].flatMap((rows)=>{
    const detail=rows.filter((item)=>!item.aggregateSource);
    return detail.length?detail:rows;
  });
  const categories=Object.fromEntries(Object.keys(COST_CATEGORY_LABELS).map((key)=>[key,0]));
  const daily=new Map(),medicineRows=new Map();let total=0,hasTimedItems=false;
  for(const item of selected){
    const amount=n(item.amount)??0;const category=costCategory(item);total+=amount;categories[category]+=amount;
    const billingTime=String(item.billingTime||'');const day=billingTime.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if(day){hasTimedItems=true;daily.set(day,(daily.get(day)||0)+amount);}
    const name=String(item.itemName||item.name||'').trim();
    if(category==='medicine'&&!item.aggregateSource&&name&&!/(药品费用|药费|围手术期药品|西药费|中成药费|中药饮片费)$/.test(name)){
      const current=medicineRows.get(name)||{name,quantity:0,amount:0,unitPrice:n(item.unitPrice)};
      current.quantity+=n(item.quantity??item.qty)??0;current.amount+=amount;
      if(current.unitPrice===null)current.unitPrice=n(item.unitPrice);
      medicineRows.set(name,current);
    }
  }
  const medicineAmount=categories.medicine;
  return {
    total,categories,medicineAmount,medicineShare:total>0?medicineAmount/total:null,
    dailyTrend:hasTimedItems?[...daily].sort(([a],[b])=>a.localeCompare(b)).map(([date,amount])=>({date,amount})):[],
    topMedicines:[...medicineRows.values()].sort((a,b)=>b.amount-a.amount).slice(0,5),
    hasMedicineDetails:medicineRows.size>0,hasTimedItems,
    itemCount:selected.length,costSource:source.length?'EPISODE_HIS_FEES':'NO_HIS_FEES',
  };
}

function profileMatches(route,groupingResult){
  return Boolean(route?.grouperVersion&&route.grouperVersion===groupingResult?.version
    &&route.paymentMethod===groupingResult?.method
    &&route.grouperSystem===groupingResult?.grouperSystem);
}

export function calculatePayment({route,groupingResult,episode,localParameters=null}={}){
  const currentCaseCost=aggregateCurrentCaseCost(episode);
  if(groupingResult?.group&&!profileMatches(route,groupingResult))return {
    status:'PAYMENT_PROFILE_VERSION_MISMATCH',method:route?.paymentMethod,group:groupingResult.group,amount:null,
    currentCaseCost:currentCaseCost.total,costBreakdown:currentCaseCost,reason:'当前支付参数与分组版本不匹配，无法计算参考支付标准。',
  };
  if(!groupingResult?.group)return {status:'NOT_CALCULATED',reason:'无有效分组结果，不能查询病组支付标准。',amount:null,currentCaseCost:currentCaseCost.total,costBreakdown:currentCaseCost};

  const adjustment=n(localParameters?.adjustment)??1;
  if(route?.paymentMethod==='DRG'){
    const weight=n(localParameters?.weight),rate=n(localParameters?.rate);
    if(weight!==null&&rate!==null&&weight>0&&rate>0&&adjustment>0){
      const referencePayment=weight*rate*adjustment;const over=currentCaseCost.total>referencePayment;
      return {status:'REFERENCE_ONLY',calculationStatus:'CALCULATED_WITH_LOCAL_TEST_PARAMETERS',method:'DRG',group:groupingResult.group,amount:referencePayment,referencePayment,weight,rate,adjustment,currentCaseCost:currentCaseCost.total,costBreakdown:currentCaseCost,utilization:referencePayment>0?currentCaseCost.total/referencePayment:null,variance:currentCaseCost.total-referencePayment,comparisonStatus:over?'OVER_REFERENCE_PAYMENT':'WITHIN_REFERENCE_PAYMENT',region:route.region,note:'当前手工参数仅用于本地参考测算，不代表已核验或生产支付标准。'};
    }
  }
  if(route?.paymentMethod==='DIP'){
    const score=n(localParameters?.score),pointValue=n(localParameters?.pointValue);
    if(score!==null&&pointValue!==null&&score>0&&pointValue>0&&adjustment>0){
      const referencePayment=score*pointValue*adjustment;const over=currentCaseCost.total>referencePayment;
      return {status:'REFERENCE_ONLY',calculationStatus:'CALCULATED_WITH_LOCAL_TEST_PARAMETERS',method:'DIP',group:groupingResult.group,amount:referencePayment,referencePayment,score,pointValue,adjustment,currentCaseCost:currentCaseCost.total,costBreakdown:currentCaseCost,utilization:referencePayment>0?currentCaseCost.total/referencePayment:null,variance:currentCaseCost.total-referencePayment,comparisonStatus:over?'OVER_REFERENCE_PAYMENT':'WITHIN_REFERENCE_PAYMENT',region:route.region,note:'当前手工参数仅用于本地参考测算，不代表已核验或生产支付标准。'};
    }
  }

  const groupParameters=route?.groupParameters?.[groupingResult.group.code];
  const rate=n(route?.rate),weight=n(groupParameters?.weight),explicitPayment=n(groupParameters?.referencePayment);
  if(route?.verified&&groupParameters&&adjustment>0&&((explicitPayment!==null&&explicitPayment>0)||(weight!==null&&weight>0&&rate!==null&&rate>0))){
    const referencePayment=explicitPayment??weight*rate*(n(route?.institutionCoefficient)??1);
    const over=currentCaseCost.total>referencePayment;
    return {status:over?'OVER_REFERENCE_PAYMENT':'WITHIN_REFERENCE_PAYMENT',calculationStatus:'CALCULATED_WITH_VERIFIED_PARAMETERS',method:route.paymentMethod,group:groupingResult.group,amount:referencePayment,referencePayment,weight,rate,currentCaseCost:currentCaseCost.total,costBreakdown:currentCaseCost,utilization:referencePayment>0?currentCaseCost.total/referencePayment:null,variance:currentCaseCost.total-referencePayment,region:route.region,profileId:route.id,sourceAuthority:route.sourceAuthority,sourceUrl:route.sourceUrl,note:'参考支付标准用于支付与运营监测，不代表单个病例必须低于该金额。'};
  }
  return {
    status:'PENDING_LOCAL_PARAMETERS',method:route?.paymentMethod,group:groupingResult.group,amount:null,
    currentCaseCost:currentCaseCost.total,costBreakdown:currentCaseCost,region:route?.region,
    requiredParameters:route?.paymentMethod==='DRG'?['病组权重','统筹区费率','机构调整参数']:['DIP病种分值','统筹区点值','机构调整参数'],
    note:'当前支付地区尚未接入已核验的匹配版本支付参数，不生成参考支付标准或生产金额。',
  };
}
