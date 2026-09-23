function n(v){const x=Number(v);return Number.isFinite(x)?x:null;}
export function calculatePayment({route,groupingResult,episode,localParameters=null}={}){
  if(!groupingResult?.group) return {status:'NOT_CALCULATED',reason:'无有效分组结果，不能进入支付测算。',amount:null};
  const adjustment=n(localParameters?.adjustment)??1;
  if(route?.paymentMethod==='DRG'){
    const weight=n(localParameters?.weight),rate=n(localParameters?.rate);
    if(weight!==null&&rate!==null&&weight>0&&rate>0) return {status:'CALCULATED_WITH_LOCAL_TEST_PARAMETERS',method:'DRG',group:groupingResult.group,amount:weight*rate*adjustment,parameters:{weight,rate,adjustment},region:route.region,note:'金额由当前工作台录入的本地测试参数计算，不代表医保生产结算结果。'};
  }
  if(route?.paymentMethod==='DIP'){
    const score=n(localParameters?.score),pointValue=n(localParameters?.pointValue);
    if(score!==null&&pointValue!==null&&score>0&&pointValue>0) return {status:'CALCULATED_WITH_LOCAL_TEST_PARAMETERS',method:'DIP',group:groupingResult.group,amount:score*pointValue*adjustment,parameters:{score,pointValue,adjustment},region:route.region,note:'金额由当前工作台录入的本地测试参数计算，不代表医保生产结算结果。'};
  }
  return {status:'PENDING_LOCAL_PARAMETERS',method:route?.paymentMethod,group:groupingResult.group,amount:null,region:route?.region,requiredParameters:route?.paymentMethod==='DRG'?['DRG权重','统筹区费率','机构/特殊调整参数']:['DIP病种分值','统筹区点值','机构/特殊调整参数'],currentCaseCost:Number(episode?.fees?.items?.reduce?.((s,x)=>s+Number(x.amount||0),0)||0),note:'国家分组规则与地方支付参数分离；未录入经核验的地方参数时不生成支付金额。'};
}
