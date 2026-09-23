# 住院医疗智能系统 · 本地化前端覆盖包

本包完成两件事：

1. 全部业务页面统一到项目 Gold Master 设计系统：AppSidebar / PageHeader / Card / Table / Workbench / Badge / Button / 1920×1080 rem 缩放。
2. “病历编辑质控”改为项目自有本地组件：模板、工具栏、数据元绑定、质控提醒、正文定位、草稿保存和医生确认均在本地运行，不依赖任何外部编辑器站点。

## 运行

```powershell
node server.mjs 8765
```

浏览器打开：

```text
http://127.0.0.1:8765/?view=documents&template=admission
```

也可以双击 `start.bat`。

## 本地病历编辑质控

核心文件：

```text
app/domain/medical-record-editor.js
product/medical-record-templates/
app/design/record-editor.css
```

能力：

- 左侧住院文书树；
- 本地医疗文书纸张模板；
- `data-med-code / data-med-name / data-med-node` 数据元；
- Episode → 文书数据元映射；
- 本地编辑工具栏；
- 顶部质控提醒；
- 正文内联质控；
- 忽略、查看全部、去评估；
- 草稿保存；
- 医生确认后只读；
- AI 与语音入口保留。

运行时没有远程 SDK、远程模板或外站 fallback。

## 医保结算清单

保留三页纸张式《医疗保障基金结算清单》展示，数据来自当前 Episode / 病案 / HIS 费用演示数据，并运行必填、时序和金额勾稽质控。

## P1 边界

DRG/DIP 3.0 与智能医保审核页面保持真实业务输入与 UI 框架，但本包不伪造正式分组结果。下一阶段接国家 3.0 Grouper Adapter、两库确定性审核、反事实分组和证据调取。

## 验收

```powershell
verify-p0.bat
```

或：

```bash
node tests/local-editor.test.mjs
node tests/design-contract.test.mjs
node tests/ui-runtime.test.mjs
node tests/settlement.test.mjs
node tests/integration.test.mjs
```

## 开源来源说明

部分医疗文书模板结构依据开源医疗编辑器示例整理并做了本地化数据元转换。第三方许可证与来源仅保留在 `THIRD_PARTY_NOTICES.md`，不作为产品模块名称或用户界面品牌。
