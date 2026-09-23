# P1 Operational Overlay Manifest

核心新增/替换：

- `app/p1-operational-workbench.js`：可输入、执行、修改、重跑的 DRG/DIP + 医保审核工作台
- `app/p1-operational.css`：工作台样式
- `app/p1/current-case-adapter.js`：当前患者 + 已保存病历/病案首页 → 分组/审核事实映射
- `app/p1/workflow-orchestrator.js`：院内预分组 → 正式分组 → 审核编排
- `app/p1/payment-policy-router.js`：Policy Profile 支付路由，不再使用 demo_override
- `app/p1/payment-calculator.js`：国家分组与地方支付参数分离
- `app/p1/audit-engine.js`：ClaimDetail + 反事实分组 + RiskIssue
- `app/p1/evidence-engine.js`：EMR/HIS/病案保存快照证据索引
- `app/domain/settlement.js`：费用同类多条明细正确汇总到结算清单
- `rulesets/official-source/*.xlsx`：用户提供的 DRG/DIP 3.0 官方源文件
- `app/p1/rules/compiled/*.js`：由官方 Excel 编译的运行规则包
- `tests/p1-operational.test.mjs`：端到端算法闭环测试
