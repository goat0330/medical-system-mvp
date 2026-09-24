const BEIJING_POLICY_URL='https://ybj.beijing.gov.cn/zwgk/2024zcwj/202412/t20241231_3978283.html';

export const PAYMENT_POLICY_PROFILES = Object.freeze([
  Object.freeze({
    id:'WH-DRG-3.0',displayName:'国家 CHS-DRG 3.0',region:'湖北省武汉市',regionIncludes:'武汉',paymentMethod:'DRG',
    grouperSystem:'CHS-DRG',grouperVersion:'DRG-3.0',grouperReady:true,verified:false,groupParameters:Object.freeze({}),
    sourceAuthority:'国家医疗保障局',sourceUrl:'https://www.nhsa.gov.cn/',
    reason:'执行国家 CHS-DRG 3.0 分组；当前支付地区尚未接入已核验的本地权重和支付标准。',
  }),
  Object.freeze({
    id:'BJ-DRG-2.0-2025',displayName:'北京 DRG 2.0 · 2025（规则待接入）',region:'北京市',regionIncludes:'北京',paymentMethod:'DRG',
    grouperSystem:'BEIJING-DRG',grouperVersion:'BEIJING-DRG-2.0-2025',grouperReady:false,verified:false,rate:20425,groupParameters:Object.freeze({}),
    sourceAuthority:'北京市医疗保障局',sourceUrl:BEIJING_POLICY_URL,year:2025,effectiveDate:'2025-01-01',rateVerified:true,
    reason:'已核验北京市 2025 费率，但本地 682 组执行规则和完整支付表尚未接入；为避免跨版本计算，此方案暂不可执行。',
  }),
  Object.freeze({
    id:'DIP-3.0-TEST',displayName:'DIP 3.0测试统筹区',region:'DIP测试统筹区',regionIncludes:null,paymentMethod:'DIP',
    grouperSystem:'CHS-DIP',grouperVersion:'DIP-3.0',grouperReady:true,verified:false,groupParameters:Object.freeze({}),
    sourceAuthority:'国家医疗保障局',sourceUrl:'https://www.nhsa.gov.cn/',
    reason:'使用国家 DIP 3.0 分组规则验证测试流程；地方点值和支付政策未核验。',
  }),
]);

export function routePaymentPolicy({episode,policyProfileId=null}={}){
  const region=String(episode?.insurance?.region||'');
  let profile=policyProfileId?PAYMENT_POLICY_PROFILES.find((x)=>x.id===policyProfileId):null;
  if(!profile) profile=PAYMENT_POLICY_PROFILES.find((x)=>x.regionIncludes&&region.includes(x.regionIncludes));
  if(profile) return {...profile,region:profile.id==='WH-DRG-3.0'?region:profile.region,decisionSource:'payment_profile'};
  const declared=String(episode?.payment?.method||'').toUpperCase();
  if(declared==='DRG'||declared==='DIP') return {id:`DECLARED-${declared}`,displayName:`国家 CHS-${declared} 3.0`,region,paymentMethod:declared,grouperSystem:declared==='DRG'?'CHS-DRG':'CHS-DIP',grouperVersion:`${declared}-3.0`,grouperReady:true,verified:false,groupParameters:{},reason:'未命中本地支付 Profile，沿用 Episode 明确的支付方式；本地支付参数未核验。',decisionSource:'episode.payment.method'};
  return {id:'OTHER-PAYMENT',displayName:'支付规则待确认',region,paymentMethod:'OTHER',grouperSystem:null,grouperVersion:null,grouperReady:false,verified:false,groupParameters:{},reason:'当前没有可核验的 DRG/DIP 支付路由配置，系统不自动猜测。',decisionSource:'unresolved'};
}
