# Overlay Manifest — Clinical Facts + Full-chain QC

累计包含上一版 `clinical-facts` 全部文件。

## 新增

- `app/p1/drg-input-validator.js`
- `app/p1/workspace-integrity.js`
- `app/p1/patient-integrity.js`
- `app/p1-integrity-bootstrap.js`
- `app/p1-ui-integrity-overlay.js`
- `app/clinical-facts/quality/full-chain-quality.js`
- `app/full-chain-qc-overlay.js`
- `app/full-chain-qc.css`
- `tests/p1-input-integrity.test.mjs`
- `tests/full-chain-quality.test.mjs`
- `verify-full-chain-qc.bat`
- `docs/09-全流程六域质控与分组输入完整性.md`
- `README-FULL-CHAIN-QC.md`

## 替换/升级

- `index.html`
- `app/p1/workflow-orchestrator.js`
- `app/p1/current-case-adapter.js`
- `app/clinical-facts/models/quality-issue.js`
- 以及上一版事实/证据层已经替换的 settlement / evidence / grouping snapshot 等文件。

## 不替换

- `app/main.js`
- `app/services/ai/model-config.js`
- `server.mjs`
- `tests/deepseek-api.test.mjs`
