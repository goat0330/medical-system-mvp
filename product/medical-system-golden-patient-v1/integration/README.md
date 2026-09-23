# medical-system-mvp 接入说明

目标仓库：`goat0330/medical-system-mvp`

## 最小接入
当前项目的 `app/data/episode.js` 只有一份基础 Episode，`app/main.js` 再克隆它并只替换姓名、年龄、ID。
这会导致患者年龄、出生日期、现病史、诊断和手术之间出现“看起来换了患者、实际临床事实没换”的问题。

### 推荐方式
1. Golden 包保存在 `product/medical-system-golden-patient-v1/`，不覆盖基础 fixture。
2. 当前患者栏的 `p-12` 使用这份完整 Episode；运行时 ID 使用 `EP-GOLDEN-001`，避免复用旧 `EP-DEMO-001` 的本地文书和工作区存档。
3. 10 份 Markdown 文书和 LIS/RIS/医嘱/病理资料随 Episode 一起进入 P1 证据索引；它们是样本来源证据，不会自动伪装成已编辑的 HmEditor 文书快照。
4. 当前 HmEditor 模板树尚无独立“术后首次病程记录”模板节点；Golden 文书可进入证据索引，但不能当作当前可编辑模板已完成。
5. `app/domain/settlement.js` 当前 `reportDate` 是硬编码日期。Golden 样本建议改成：
   `episode.discharge?.at?.slice(0, 10)`，避免申报日期早于住院时间。
6. 术后首次病程记录应在取得并核验对应模板后新增独立节点，不复用普通日常病程模板冒充。

## 本轮不做的事情
- 不向你的 GitHub 仓库 push；
- 不触发 Jenkins；
- 不把合成支付金额冒充武汉真实医保待遇计算结果；
- 不让大模型替代 DRG/DIP 确定性规则执行器。

## 验收主链
`患者/Encounter → EMR文书 → LIS/RIS → 手术记录 → 出院记录 → 病案首页 → 医保结算清单 → 清单质控 → DRG/DIP 3.0 → 医保审核`

DRG Golden 结果为 `HC45`。DIP 输入 `K80.000x002 + 51.2300` 会先命中 `K80.000` 排除规则，返回 `EXCLUDED_PRINCIPAL_DIAGNOSIS`；原包中的 `BX/1029` 预期与完整执行链冲突，仓库集成版已更正。三个 `qc-variants/` 是待接入业务质控的测试输入，不等于当前 UI 已具备故障注入开关。
