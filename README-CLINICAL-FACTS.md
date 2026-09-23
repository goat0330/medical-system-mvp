# 患者事实与证据层覆盖包

基线：`goat0330/medical-system-mvp` main，核对提交 `14e5745147d8408e45213da0b274e6c6acd6c0c5`（2026-09-23）。

本包不是另做一套 Demo，而是在当前“病历 → 病案首页 → 医保结算清单 → DRG/DIP → 医保审核”之间插入统一 Patient Fact / Evidence 层。

## 新的数据链

```text
EMR / 病案首页 / Episode / HIS / LIS / RIS-PACS
                     ↓
                Evidence Store
                     ↓
              Fact Candidate
                     ↓
        Conflict Detection / Decision
                     ↓
              Confirmed Fact
                     ↓
     Settlement / Grouping / Audit Projection
```

## 核心行为

- 每个结构化病历字段生成 EvidenceItem：来源文书、模板、字段编码、保存时间/版本、原值均保留。
- Episode、HIS费用、Golden Patient 的 LIS/RIS/生命体征/医嘱/病理一起进入证据索引。
- 同一 canonical concept 出现多个值时不再静默覆盖，形成 FactConflict。
- 年龄增加派生一致性检查：出生日期 + 入院日期与记录年龄明显不一致时产生阻断冲突。
- 人工选择某个候选值后生成 FactDecision，并写入 `medical-system:fact-decisions:<episodeId>`。
- Patient Fact Context 写入 `medical-system:clinical-facts:<episodeId>`，便于本地联调查看。
- 医保结算清单优先使用 Confirmed Fact Projection，并保留 `fieldFactRefs / fieldEvidenceRefs / fieldSources`。
- GroupingSnapshot 为主要诊断、主要手术、年龄、性别等增加 fact/evidence refs。
- 关键事实冲突会阻断正式分组，不允许继续以静默覆盖后的值进入 DRG/DIP。
- Evidence Engine 改为查询统一 Evidence Store，医保审核风险可回溯到具体来源字段/文书版本。

## UI

DRG/DIP、医保审核、结算清单页面会新增“患者事实与证据”卡片：

- Evidence 数量
- ClinicalFact 数量
- 冲突数量 / 阻断数量
- 年龄 / 主要诊断 / 主要手术等关键事实
- 冲突候选来源、版本、字段与摘录
- `采用此值` 人工裁定
- Evidence Index 展开查看

人工裁定后页面会重载并使旧 operational workspace 失效，确保重新生成结算/分组/审核输入。

## 当前映射覆盖

本轮先把仓库现有真实使用的核心字段收敛进统一 Mapping Registry：人口学、入出院、主要诊断、主要手术/操作、麻醉/术者等；它替代各模块重复的 alias/优先级判断。

**本包没有宣称已经完成医保结算清单完整 193 项接口字典。** 193 项仍需要下一轮根据正式字典逐项扩展 Mapping Registry；现在保留现有清单版式与字段，并让已映射字段先走统一事实层。

## 覆盖方式

解压后将目录内容直接覆盖到仓库根目录，不删除原有 DRG/DIP 官方规则包、HmEditor runtime 或 Golden Patient。

然后运行：

```bat
verify-clinical-facts.bat
```

再按原方式启动：

```bat
start.bat
```

或：

```bash
node server.mjs 8765
```

## 验收重点

1. 选择 Golden Patient 或任一当前患者。
2. 打开 DRG/DIP / 医保审核 / 结算清单。
3. 查看“患者事实与证据”卡片。
4. 制造或保留多源字段冲突，确认系统出现 FactConflict，不静默覆盖。
5. 对冲突点击“采用此值”。
6. 重新进入正式分组，确认冲突解除后才允许继续。
7. 在分组/审核证据中检查来源文书、字段编码和版本。

