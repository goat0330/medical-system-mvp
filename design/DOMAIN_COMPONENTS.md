# Medical / Insurance Domain Components

新增医疗功能只能新增领域组件，且必须由 Base Components 构成。

## 已定义

### MedicalDocument
复用原母版：最大宽度 70rem、白色纸张、1.6rem 圆角、文书标题下 0.2rem 深色分隔线。

### GroupingPath
唯一 DRG/DIP 分组路径表达：MDC → ADRG → DRG。不得在其他页面重新画箭头/节点体系。

### RuleTrace
展示确定性规则命中步骤、排除原因和版本。

### RiskIssueCard
唯一风险线索卡：类型 + 风险级别 + 问题 + 操作。

### EvidencePanel
唯一证据详情面板。风险必须关联 evidenceRefs；AI 不得虚构证据。

### SettlementSection
医保结算清单分组字段展示组件。

## 后续新增

后续 DRG3GrouperAdapter、DIP3Parser、AuditEngine、EvidenceEngine 只修改数据层和这些领域组件内容，不允许创建第二套 Shell/Card/Table/Badge。
