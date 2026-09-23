# Clinical UI Gold Master

本项目的唯一视觉母版是用户提供的 `intelligent-consultation-replica-complete.zip`。

原则不是“参考它重新设计”，而是：

> 既有页面和新增页面都必须看起来像原产品原生功能。

## 不可变视觉层

以下部分禁止业务开发者自行重设计：

- AppShell / Sidebar
- PageHeader
- Button / Input / Select
- Card
- StatusBadge
- Table
- Tabs
- Dialog / Drawer 视觉语义
- 字号、行高、间距、圆角、阴影
- 1920×1080 rem 缩放规则

设计画布：`1920 × 1080`，基准 `1rem = 10px`，按宽高较小比例等比缩放。

## 主色与语义

- Primary `#2f63f5`
- Strong text `#0f1b3d`
- Body text `#34415e`
- Secondary `#5f6d89`
- Muted `#7483a0`
- Success `#08864b / #e7f8ef`
- Warning `#c96a00 / #fff3e4`
- Danger `#d92d20 / #fff0ef`
- Info `#1f62e6 / #eaf2ff`

所有运行时颜色必须引用 `app/design/tokens.css`。

## 资源说明

参考包原本包含 Alibaba PuHuiTi 字体文件。交付 ZIP 不重新分发字体二进制；运行时使用 `Microsoft YaHei / PingFang SC / Noto Sans CJK SC` 回退。背景图片等非字体视觉资源保留用于视觉一致性。
