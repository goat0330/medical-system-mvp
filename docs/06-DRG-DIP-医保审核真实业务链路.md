# DRG / DIP 3.0 → 医保审核真实业务链路

## 1. 原则

DRG/DIP 不是病例算法自由选择。先依据统筹区支付政策确定支付方式，再进入相应 Grouper。

```text
医保结算清单 + 费用明细
        ↓
数据质量校验
        ├─ 不通过 → 返回医院修改并重传
        ↓ 通过
PaymentPolicyRouter
        ├─ DRG统筹区 → DRG 3.0 Grouper
        ├─ DIP统筹区 → DIP 3.0 Grouper
        └─ 其他 → 其他支付方式
        ↓
GroupingRun + trace
        ↓
地方支付参数
        ↓
PaymentCalculation
        ↓
医保审核
        ↓
风险线索 → 证据调取 → 人工复核
        ↓
通过 / 退回 / 支付调整 / 稽核
        ↓
若退回：医院修改 → 新Snapshot → 重新分组 → 重新审核
```

## 2. DRG 3.0

规则源：`按病组（DRG）付费3.0版分组方案配置信息.xlsx`。

执行顺序：

```text
编码标准化/确认
→ 分组前校验
→ MDCA先期分组尝试
→ MDC
→ ADRG
→ CC/MCC + CCE排除
→ DRG细分
→ GroupingResult
```

每一步都记录：输入、规则原文、输出、来源 Sheet/行号。

## 3. DIP 3.0

规则源：`按病种分值（DIP）付费3.0版分组方案.xlsx`。

执行顺序：

```text
编码标准化/确认
→ 不纳入分组主要诊断检查
→ 不纳入分组主要手术操作（按保守治疗处理）
→ 先期分组
→ 主要诊断 + 主要操作 + 相关操作组合
→ 并项规则
→ 诊断辅助细分（烧伤/肿瘤/结核）
→ 基础规则核心病种
→ 未命中则进入“地方综合病种/补充规则”边界
```

## 4. 审核

```text
L0 数据质量
L1 编码/分组前置
L2 ClaimDetail + “两库”规则入口
L3 DRG/DIP分组完整性 + 反事实重分组
L4 EvidenceRequest：EMR/HIS/LIS/PACS/医嘱/手术记录
L5 人工复核
```

审核输出不是“AI直接认定骗保”，而是 `RiskIssue + EvidenceBundle + GroupingTrace`，由人工做通过、退回、支付调整或转稽核。

## 5. Payment 与 Grouper 分离

这两份官方 Excel解决的是分组规则，不包含武汉生产环境完整支付参数，因此：

```text
DRG Group → 武汉DRG权重 × 费率 × 调整参数
DIP Group → 地方病种分值 × 点值 × 调整参数
```

仍需独立地方 Payment Pack。当前系统不生成伪造支付金额。
