# UI Foundation Migration v1

这是覆盖包，不是独立新项目。

解压到现有 `goat0330/medical-system-mvp` 根目录并覆盖同名文件后运行原项目：

```powershell
node server.mjs 8765
```

浏览器打开 `http://127.0.0.1:8765`。

## 本轮完成

- 将用户给出的电子病历智能体 ZIP 固化为 Gold Master。
- 当前 MVP 的六个页面全部映射到同一 Sidebar / PageHeader / Card / Table / Badge / Workbench 体系。
- 病历书写、病案首页直接复用 Workbench 三栏结构。
- 医保结算清单使用管理型 Section / Table 视觉。
- DRG/DIP 新增 GroupingPath / RuleTrace，但不新造页面风格。
- 智能审核新增 RiskIssueCard / EvidencePanel，并保留人工复核语义。
- 语音能力只保留 Workbench 右侧入口。
- 增加 DESIGN / LAYOUTS / COMPONENTS / DOMAIN_COMPONENTS / STATES / ICONS / COMPONENT_MAPPING / AGENTS。
- 增加 rem 等比缩放和 Design Contract test。

## 边界

本轮是前端 Presentation Layer 统一，不替换现有 `app/domain/*` 和 `app/data/*` 业务实现，也不伪造未接入的 DRG/DIP 3.0 正式执行结果。
