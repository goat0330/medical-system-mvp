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

`32rem RecordNavigation | 1fr WorkbenchContent | 36rem PatientHistory`

页面标题占三列顶部 `9.6rem`。

病历、病案首页、未来语音病历、编码确认优先复用 Workbench，禁止另做独立视觉壳。

## Management Page

医保结算清单、DRG/DIP、智能审核使用：

`PageHeader + page-content + BaseCard / ClinicalDataTable / StatusBadge`
