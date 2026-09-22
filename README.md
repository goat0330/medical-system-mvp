# 住院医疗与医保闭环 MVP

这是一个以单患者住院 Episode 为主线的可运行演示：病历模板生成 → 病案首页 → 医保结算清单 → 国家 DRG/DIP 3.0 输入检查 → 智能审核 → 模拟提交与对账。

## 本轮已经锁定的范围

- 病案首页直接使用惠每 HmEditor 的模板语义与适配层，不把旧版 PDF 版式当作编辑器。
- 保留：住院病案首页、入院记录、首次病程记录、日常病程记录、主治医生首次查房/查房、手术记录、术前小结、出院记录。
- 排除：会诊、接班、阶段小结、一般护理记录单、死亡记录、死亡病例讨论记录。
- 医保结算清单以医保结算清单（193项）.pdf 的三页版式和字段语义分组为展示依据；未经核验的官方字段号不写死。
- 分组口径只保留国家 DRG 3.0 / DIP 3.0。武汉地方权重、费率、细分组和生产接口本轮不启用。
- AI 只生成文书草稿、抽取事实、提示缺失和解释证据；编码、质控、费用合计、结算对账和最终审核由确定性逻辑或人工完成。

## 运行

需要 Node.js 18+：

    cd /d D:\研究生作业\北武院实习\医疗系统MVP
    node server.mjs 8765

打开 http://127.0.0.1:8765，或双击 start.bat。

## 结算实现边界

当前实现的是可回放的本地闭环，不是医保生产平台联调：

    Episode facts
      → SettlementList（193 项语义分组）
      → validateSettlementList（必填、时间、编码、金额勾稽）
      → ClaimSnapshot（输入快照 + 幂等键）
      → ClaimBatch（本地 mock 申报批次）
      → InsuranceResponse（本地 mock 反馈）
      → Reconciliation（申报/支付/扣款差异）

这个对象链参考 I-ONE 的 settlement list → claim snapshot → claim batch → insurance response → reconciliation 设计，但没有把 Frappe 作为本项目运行依赖。真实医保平台的鉴权、接口地址、报文编码、联调和生产反馈仍需用医院/统筹区材料替换 mock。

## 目录

- index.html、app/main.js、app/styles.css：可运行的 MVP 前端。
- app/domain/hmeditor.js、app/data/templates.js：惠每模板注册、文书草稿和兼容适配层。
- app/domain/settlement.js、app/data/settlement-fields.js：结算清单、质控、快照、模拟反馈和对账。
- tests/：无外部依赖的 Node smoke tests。
- docs/01-规则版本与武汉本地化.md：国家 3.0 当前口径与地方化暂缓边界。
- docs/02-MVP业务闭环.md：页面、对象和验收路径。
- docs/03-结算清单与仓库调研.md：PDF、国家文件和开源仓库的落地结论。
- rules/rule-manifest.json：国家 3.0 规则源与“正式规则包未内置”状态。

## 当前不宣称

本项目不宣称已经接入惠每商业服务、国家 3.0 正式可执行分组器或任何医保生产平台；界面上的“国家 3.0”是版本绑定和输入边界，正式分组/支付必须在取得可执行规则包、统筹区参数和接口联调材料后启用。
