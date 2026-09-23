# Clinical Facts Overlay Manifest

## 新增

- `app/clinical-facts/`：Evidence / Fact / Conflict / Decision / Mapping / Projection 核心层
- `app/clinical-facts-overlay.js`：患者事实与证据 UI
- `app/clinical-facts.css`
- `tests/clinical-facts.test.mjs`
- `docs/08-患者事实与证据层.md`
- `README-CLINICAL-FACTS.md`
- `verify-clinical-facts.bat`

## 替换

- `index.html`
- `app/domain/settlement.js`
- `app/p1/current-case-adapter.js`
- `app/p1/evidence-engine.js`
- `app/p1/grouping-snapshot.js`
- `app/p1/workflow-orchestrator.js`

## 不修改

- DRG 3.0 / DIP 3.0 官方规则包
- `drg3-grouper.js` / `dip3-grouper.js`
- 当前 HmEditor 运行时和病历 UI
- Golden Patient 原始数据
- AI 模型配置及现有单文书 AI 质控
