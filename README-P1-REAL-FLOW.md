# P1 最终覆盖包：官方 DRG / DIP 3.0 + 真实业务链路

本覆盖包直接使用本轮提供的两个 3.0 Excel 作为分组规则源：

- `rulesets/official-source/按病组（DRG）付费3.0版分组方案配置信息.xlsx`
- `rulesets/official-source/按病种分值（DIP）付费3.0版分组方案.xlsx`

覆盖到 `goat0330/medical-system-mvp` 根目录后，按原项目方式运行：

```powershell
node server.mjs 8765
```

## 已完成的真实链路

```text
病案首页 / 医保结算清单
        ↓
数据质量校验
        ↓
PaymentPolicyRouter
        ↓
按统筹区配置走 DRG 或 DIP
        ↓
DRG 3.0：Pre-MDC → MDC → ADRG → CC/MCC/CCE → DRG
DIP 3.0：排除 → 先期分组 → 并项 → 诊断辅助细分 → 基础核心病种
        ↓
GroupingResult + 完整 trace
        ↓
支付参数核验状态（缺少地方参数时不生成金额）
        ↓
医保审核
        ↓
数据质量 / 编码 / ClaimDetail / 分组完整性 / 反事实重分组
        ↓
EvidenceRequest → EMR/HIS等证据
        ↓
RiskIssue + EvidenceBundle
        ↓
人工复核
        ↓
通过 / 退回修改 / 支付调整 / 转稽核
        ↓
修改后重新生成清单 → 重分组 → 重审核
```

## DRG 3.0

运行时不再引用手写 Demo 表。`scripts/compile-official-rulepacks.py` 会把官方 Excel 编译为：

```text
app/p1/rules/compiled/drg3-official.js
```

当前源码包编译得到：

- MDC：26 条有效配置
- ADRG：537 条配置
- DRG：870 条配置
- 诊断/手术集合行：106,950
- CC/MCC 条目：7,918
- 排除表行：21,036

> 上述数字是**本次上传 Excel 的实际行数/配置数**，不是对外政策摘要里的统计口径；系统以源文件为准，不自行改写。

DRG 公式执行器支持当前工作簿出现的规则语法，包括：

- `ZYZD / QTZD / ZYSS / QTSS`
- `in / not in`
- `and / or`
- 年龄、出生天数、出生体重、性别条件
- `{ZYZD, QTZD}` / `{ZYSS, QTSS}` 集合判断
- `length(SET ∩ {ZYSS, QTSS})`
- CC / MCC / CCE 排除

所有 1,433 条 MDC/ADRG/DRG 公式均执行编译检查，当前自动测试为 0 个公式语法错误。

## DIP 3.0

官方 DIP Excel 已完整导入：

- 先期分组：20
- 并项规则：1,725
- 烧伤辅助细分：25
- 肿瘤辅助细分：42
- 结核辅助细分：46
- 结核耐药诊断：48
- 基础核心病种：3,268
- 不纳入分组主要诊断：4,742
- 不纳入分组主要手术操作：4,111
- 基层病种：127

规则测试病例 `K80.302 + 51.2300` 会命中官方 Excel 并得到以下内部匹配键：

```text
K80.302 + 51.2300
→ 二、并项规则下的核心病种
→ 分类 BX / 序号 1029
```

页面显示 `BX-1029` 只是为了给 RuleRun 一个稳定内部键；同时展示原始“分类、序号、来源Sheet、来源行”，不把它伪装成地方支付病种代码。

注意：Golden Patient 的主诊断为 `K80.000x002`，它会先命中 DIP 不纳入分组诊断前缀 `K80.000`，实际结果是 `EXCLUDED_PRINCIPAL_DIAGNOSIS`，不是 `BX/1029`。两个病例用于验证不同规则路径。

## 源文件完整性

```text
DRG XLSX SHA256
2037d128255502a072e0585dff59dabc97864e2e7a8ed22e894bdd48c53dcb5e

DIP XLSX SHA256
dec2b17b8f277bec8153d8d8922380e8145ca420dc90758bcb45ad2a98a5dc7d
```

页面会展示实际使用的规则源文件、SHA256、规则规模与每一步 source row。

## 验收

```powershell
verify-p1-real-flow.bat
```

或：

```powershell
node tests/p1-real-flow.test.mjs
```

预期：

```text
PASS P1 official DRG/DIP 3.0 real business flow
```

重点页面：

1. `DRG / DIP 3.0`
   - 先看统筹区支付方式路由
   - 再看分组输入
   - 再看官方 Excel 逐步 trace
   - 武汉默认 DRG；切换 DIP 只是验证另一个统筹区分支，不代表武汉同病例同时采用两种支付方式

2. `智能医保审核`
   - L0 数据质量
   - L1 编码确认
   - L2 ClaimDetail/两库入口
   - L3 DRG/DIP完整性与反事实重分组
   - L4 临床证据调取
   - L5 人工复核

## 仍然明确保留的边界

- **分组规则**：本包已改成上传的官方 DRG/DIP 3.0 Excel。
- **支付金额**：武汉地方权重、费率、DIP点值、机构调整系数等未在这两份 Excel 中提供，因此返回 `PENDING_LOCAL_PARAMETERS`，不编造金额；工作台不提供地方测试参数录入入口。
- **国家医保智能监管“两库”完整知识点**：这两份 Excel 不包含“两库”24万+知识点，因此本包没有把其伪造进来。已有 ClaimDetail 时执行可确定的基础时序/重复性检查；完整项目限定、适应症、频次等审核仍需单独导入“两库”知识点包。
- **语音**：不在本轮范围，继续保留现有接口位。
