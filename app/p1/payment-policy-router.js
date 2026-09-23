export const PAYMENT_POLICY_PROFILES = Object.freeze([
  Object.freeze({
    id:'WH-DRG-3.0', region:'湖北省武汉市', regionIncludes:'武汉', paymentMethod:'DRG', grouperVersion:'DRG-3.0',
    label:'武汉住院病例 · DRG 3.0业务路径', production:false,
    reason:'当前测试配置按武汉住院DRG业务路径运行；国家3.0分组规则使用官方Excel，地方权重、费率和特殊支付参数需另行配置。',
  }),
  Object.freeze({
    id:'DIP-3.0-TEST', region:'DIP测试统筹区', regionIncludes:null, paymentMethod:'DIP', grouperVersion:'DIP-3.0',
    label:'DIP 3.0统筹区测试配置', production:false,
    reason:'用于验证采用DIP的统筹区完整业务流程；支付方式来自Policy Profile，不是由病例算法预测。',
  }),
]);

export function routePaymentPolicy({episode,policyProfileId=null}={}){
  const region=String(episode?.insurance?.region||'');
  let profile=policyProfileId?PAYMENT_POLICY_PROFILES.find((x)=>x.id===policyProfileId):null;
  if(!profile) profile=PAYMENT_POLICY_PROFILES.find((x)=>x.regionIncludes&&region.includes(x.regionIncludes));
  if(profile) return {...profile,region:profile.id==='WH-DRG-3.0'?region:profile.region,decisionSource:'policy_profile'};
  const declared=String(episode?.payment?.method||'').toUpperCase();
  if(declared==='DRG'||declared==='DIP') return {id:`DECLARED-${declared}`,region,paymentMethod:declared,grouperVersion:`${declared}-3.0`,label:`${declared} · Episode声明`,production:false,reason:'未命中本地Policy Profile，沿用Episode明确支付方式；生产环境应由统筹区支付政策配置中心提供。',decisionSource:'episode.payment.method'};
  return {id:'OTHER-PAYMENT',region,paymentMethod:'OTHER',grouperVersion:null,label:'其他支付方式',production:false,reason:'当前没有可核验的DRG/DIP支付路由配置，系统不自动猜测。',decisionSource:'unresolved'};
}
