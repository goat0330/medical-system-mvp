# 患者事实层 + 六域全流程质控 + DRG 输入完整性覆盖包

基线：`goat0330/medical-system-mvp` main @ `14e5745147d8408e45213da0b274e6c6acd6c0c5`。

本包是**累计覆盖包**：包含上一版 Patient Fact / Evidence / Conflict / Projection 底座，并继续补齐六类全流程质控，同时修复 DRG/DIP 工作台截图暴露的真实操作链问题。

## 这次修复截图中的四个问题

1. **旧工作台草稿污染当前患者**
   - 新增患者源数据 fingerprint。
   - 旧版没有 fingerprint 的 `medical-mvp-operational-v3:<episodeId>` 会先归档，再从当前患者重新映射。
   - 后续如果病历/患者源事实发生变化，旧工作台也会归档，不会继续静默恢复过期 A15.400 等输入。
   - 归档键：`medical-mvp-operational-archive-v1:<episodeId>:<timestamp>`。

2. **非 Golden 合成患者年龄与出生日期混用旧病例**
   - 不再把所有 `synthetic` 都显示成 Golden。
   - Golden 只认 `goldenData / datasetId / datasetVersion`。
   - 对普通合成患者，如果“患者列表年龄”和旧基线出生日期明显矛盾，运行时按入院日 + 当前年龄纠正合成数据 birthDate，避免把测试夹具错误当成患者事实冲突。
   - 不修改真实/Golden 数据。

3. **DIP 诊断目录被直接拿来给 DRG 使用**
   - 新增 `drg-input-validator.js`，从官方 DRG 3.0 编译规则的 `DI_*` 集合建立精确支持索引。
   - DRG 路径的诊断选择弹窗只显示 DRG 官方规则可识别编码（以及项目已有的待确认本地编码候选映射）。
   - 手工输入仍允许，但执行前再次校验。
   - `A15.400` 这类当前 DRG 规则精确不收录的输入会返回 `INVALID_INPUT`，不再落到 `NOT_GROUPED_MDC` 后让用户误以为规则执行完成。

4. **失败状态被染成绿色**
   - UI 完整性层会把 `NOT_GROUPED / INVALID / UNSUPPORTED / BLOCKED / FAIL / ERROR` 统一纠正为红色失败状态。

## 六域全流程质控

新增统一 `QualityIssue` 聚合器：

1. `DOCUMENT`：单文书完整性/时序/必填等。
2. `CROSS_DOCUMENT`：跨文书、跨系统 Patient Fact 冲突。
3. `FRONT_PAGE`：病案首页关键诊断、手术、年龄、性别与已确认事实的一致性。
4. `SETTLEMENT`：医保结算清单必填、时序、金额勾稽、患者事实冲突。
5. `GROUPING`：DRG/DIP 输入完整性、规则支持范围、事实冲突、编码确认、分组失败。
6. `INSURANCE_AUDIT`：ClaimDetail、反事实分组及现有医保审核风险。

六类问题统一输出：

```text
QualityIssue
├─ qcDomain
├─ type
├─ severity
├─ factRefs[]
├─ evidenceRefs[]
├─ conflictRefs[]
├─ impactScope[]
├─ blocking
└─ status
```

页面增加“全流程质控”卡片，六个域共用上一版 Patient Fact / Evidence 底座，不各自重新翻病历。

## 对现有核心代码的保护

本覆盖包**不替换**：

- `app/main.js`
- `app/services/ai/model-config.js`
- `server.mjs`
- `tests/deepseek-api.test.mjs`

因此不会覆盖你本地提到的这些未提交改动。患者/工作台完整性通过新增 bootstrap/overlay 接入。

仍会覆盖上一版已经接入事实层的：

- `app/domain/settlement.js`
- `app/p1/current-case-adapter.js`
- `app/p1/evidence-engine.js`
- `app/p1/grouping-snapshot.js`
- `app/p1/workflow-orchestrator.js`
- `index.html`

## 验收

覆盖仓库根目录后运行：

```bat
verify-full-chain-qc.bat
```

关键人工验收：

### 截图回归

选择 `EP-DEMO-002`：

- 不应再显示 `Golden 合成测试 Episode`；应显示普通“合成测试 Episode”。
- 如果浏览器里仍保存旧 A15.400 工作台，首次进入会显示“旧草稿已归档并从当前患者重新映射”。
- DRG 选择疾病时，`A15.400` 不应作为“当前 DRG 3.0 可用编码”出现在结果中。
- 手工录入 `A15.400` 并把它同时放入其他诊断，再执行预分组：应得到 `INVALID_INPUT`，并明确提示“DRG规则不支持 + 主要诊断重复”，不能继续支付测算。
- `NOT_GROUPED_*` / `INVALID_INPUT` 必须是红色失败状态。

### 事实/证据回归

- 点击患者事实冲突可看到来源文书/版本/字段/证据。
- 人工裁定后生成 FactDecision，不删除原证据。
- 阻断冲突未处理时正式分组被阻断。

### 六域质控

在结算、DRG/DIP、医保审核等页面可以看到统一“全流程质控”卡片，固定展示六个域；未运行的分组/审核应显示 `NOT_RUN`，不能伪装 PASS。
