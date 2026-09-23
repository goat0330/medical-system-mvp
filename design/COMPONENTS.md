# Base Components

## AppSidebar
直接复用母版尺寸和状态。导航项高 `5.6rem`，左右 `2.2rem`，间距 `1.4rem`，圆角 `.8rem`。

## PageHeader
所有一级业务页面必须使用；禁止页面自建标题栏。

## BaseCard
白底、`1.6rem` 圆角、母版 card shadow。业务页面不得新建平行 Card 体系。

## StatusBadge
只允许：blue / green / amber / red / gray。

语义：
- blue: 信息/进行中
- green: 正常/完成/通过
- amber: 待处理/需核验
- red: 高风险/阻断
- gray: 未开始/disabled/占位

## Button
默认、primary、danger、small。禁止业务页面定义新按钮颜色。

## ClinicalDataTable
表头高度 `5.2rem`，数据行 `6.5rem`，表头背景 `#f4f7fc`。

## Tabs
辅助区/详情切换使用底部蓝色 active indicator。
