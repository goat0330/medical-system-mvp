# Overlay Manifest

直接解压到现有 `medical-system-mvp` 根目录并覆盖。

## 核心覆盖

- `index.html`
- `app/main.js`
- `app/styles.css`
- `app/design/*`
- `app/ui/*`
- `app/domain/medical-record-editor.js`
- `app/data/templates.js`
- `product/medical-record-templates/*`
- `docs/*`
- `tests/*`
- `scripts/*`

## 保留并继续使用

- `app/domain/settlement.js`
- `app/domain/settlement-template.js`
- `app/data/episode.js`
- `app/data/settlement-fields.js`
- `rules/*`
- `server.mjs`

## 重要变化

病历编辑模块统一命名为“病历编辑质控”，运行时只加载本地代码和模板，不依赖远程编辑器站点。
