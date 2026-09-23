# Layouts

## AppLayout

- Sidebar: `24rem`
- Collapsed Sidebar: `8.8rem`
- Content: `minmax(0, 1fr)`
- Full viewport, no body scroll.

## PageHeader

- Height: `9.6rem`
- Padding: `2rem 2.8rem 2rem 3.2rem`
- H1: `2rem / 3rem / 700`
- Description: `1.4rem / 2.4rem / 500`

## Clinical Workbench

固定三栏：

`32rem RecordNavigation | 1fr WorkbenchContent | 42rem PatientHistory`

PatientHistory has a keyboard-accessible resize handle and can be adjusted from 36rem to 48rem; the default is 42rem. The clinical workbench remains a three-column layout.

页面标题占三列顶部 `9.6rem`。

病历、病案首页、未来语音病历、编码确认优先复用 Workbench，禁止另做独立视觉壳。

文书导航顶部放置当前患者选择器；患者下拉浮层覆盖文书列表，不新增常驻列。患者卡片、`住院病历` 标题和文书列表容器统一使用 `1.8rem` 左右内边距。切换患者时，工作台整体绑定到新 `InpatientEpisode`，并清空该患者上下文不应继承的临时质控/审核状态。

## Management Page

医保结算清单、DRG/DIP、智能审核使用：

`PageHeader + page-content + BaseCard / ClinicalDataTable / StatusBadge`
