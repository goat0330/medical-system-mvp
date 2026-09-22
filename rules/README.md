# 国家 DRG/DIP 3.0 规则包接入约定

国家 DRG/DIP 3.0 的正式通知和附件是版本主来源。当前项目只绑定版本元数据，未将 PDF 附件假装成可执行分组器。

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
