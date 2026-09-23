# medical-system-mvp → Gold Master 映射

| 旧实现 | Gold Master | 处理 |
|---|---|---|
| `.topbar` | `PageHeader` | 旧版删除，统一替换 |
| `.sidebar` / `.nav-item` | `AppSidebar` / `business-nav__link` | 统一替换 |
| `.card` | `BaseCard` | 统一视觉 primitive |
| `.tag` / `.status` | `StatusBadge` | 统一 5 种语义状态 |
| `.table` | `ClinicalDataTable` | 管理型列表统一使用 |
| 病历页面 | `Workbench` | 整页映射为 32rem / 1fr / 42rem，右侧辅助栏可调为 36–48rem |
| 病案首页 | `Workbench + MedicalDocument` | 不再另造布局 |
| DRG 卡片 | `GroupingPath + RuleTrace` | 新领域组件 |
| 风险卡 | `RiskIssueCard` | 新领域组件 |
| 证据详情 | `EvidencePanel` | 新领域组件 |
| 语音 | Workbench 右侧辅助区 | 仅占位，研发后接入 |
