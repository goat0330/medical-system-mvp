/**
 * 医保审核最小确定性规则包。
 * 只执行当前 SettlementSnapshot / Episode 已具备数据粒度能够可靠判断的规则。
 * 对需要逐条收费明细、国家“两库”完整知识点的数据，返回 NOT_RUN，而不是伪造命中。
 */
export const AUDIT_RULE_PACK = Object.freeze({
  id: 'nhsa-audit-minimum-real-flow-2026-09',
  version: '2026-09-demo-subset',
  productionReady: false,
  rules: Object.freeze([
    { code: 'AQ-DATA-001', stage: 'DATA_QUALITY', name: '结算清单必填/时序/金额勾稽', deterministic: true },
    { code: 'AQ-CODE-001', stage: 'CODING', name: '医保标准编码确认', deterministic: true },
    { code: 'AQ-GROUP-001', stage: 'GROUPING_INTEGRITY', name: '分组规则可追溯性', deterministic: true },
    { code: 'AQ-CLAIM-DETAIL-001', stage: 'TWO_LIBRARIES', name: '逐条费用明细规则', deterministic: true, requires: 'claim_detail' },
  ]),
});
