# 国家 DRG/DIP 3.0 规则包接入约定

国家 DRG/DIP 3.0 工作簿是当前本地规则包的来源。原始文件保存在 `rulesets/official-source/`，由 `scripts/compile-official-rulepacks.py` 编译为 `app/p1/rules/compiled/` 中的运行时数据；工作簿版本和 SHA-256 记录在 `rules/rule-manifest.json`。重新编译后应运行 `node tests/p1-real-flow.test.mjs` 验证分组与 trace。

这套 Grouper 是对随项目工作簿规则的本地确定性执行，不是医保生产分组服务。武汉地方支付参数不在工作簿内；未经核验时不得输出生产支付金额。完整国家医保智能监管“两库”也不属于这两份分组工作簿。

规则包接入后，每次分组必须保留：

    national_rule_version
    payment_mode
    effective_date
    input_snapshot_id
    grouping_path
    execution_status
    source_reference

分组、编码校验、费用合计、结算对账和支付公式走确定性服务。AI 可以抽取事实、给出编码候选、解释分组路径和生成申诉草稿，但不得静默改写已确认事实。

武汉/湖北地方参数本轮不启用；未来新增地方 profile 时，必须与国家规则包和支付参数分开版本化。
