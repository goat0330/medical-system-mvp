# 住院医疗智能系统 MVP

本项目以当前住院 Episode 串起病历编辑质控、病案首页、医保结算清单、国家 DRG/DIP 3.0 本地规则执行、医保审核和人工复核。界面外壳沿用 Gold Master；文书编辑区通过本地部署的开源结构化编辑器运行。

## 启动

首次运行需要 Git、Docker Desktop 已启动并可联网。双击 `start.bat`：脚本会将固定版本的上游编辑器检出到被 Git 忽略的 `vendor/hm_editor/`，在 Node 14 容器内安装构建依赖并执行上游 `grunt release`，然后启动本项目服务。

之后直接双击 `start.bat` 即可。浏览器打开：

```text
http://127.0.0.1:8765/?view=documents&template=admission
```

如果需要单独准备编辑器资源：

```text
node scripts/ensure-hmeditor.mjs
node server.mjs 8765
```

## 病历编辑质控

- 使用上游入院记录、病程、手术和出院模板；原始数据元编码和字段属性不改写。
- 使用上游 `HMEditorLoader.createEditorAsync`、`setDocContent`、`getDocContent`、`setDocReadOnly` 和销毁 API；工具栏、结构化数据元控件、分页和纸张由原运行时负责。
- 当前患者 Episode 映射到模板 `data-hm-code / data-hm-name`；保存后将 HTML、文本和数据元快照存入当前浏览器的 localStorage，重新加载可回读。
- 质控提醒逐条显示在工作台右侧；定位按数据元编码/字段名称或唯一原文片段跳转，并用编辑器外层标记定位，不改写病历正文。
- AI质控通过本地 `/api/medical-record-qc` 服务调用；在右侧“AI辅助”页通过“模型设置”添加/测试本地模型配置，再选择模型运行。API Key 仅保存在本地服务进程内存，不返回浏览器、不写入浏览器存储；服务重启后需重新配置。建议不会自动改写病历。
- 质控会把文书名、主诊断和非身份字段的临床原文发送至外部质控服务；身份字段不会单独提交，但临床正文仍可能含个人信息。请只使用虚构或已获授权的数据。
- `start.bat` 保留现有文书目录；未纳入会诊、接班、阶段小结、一般护理记录单、死亡记录和死亡病例讨论。
- 语音入口继续预留。未提供 API Key 且本地服务未配置备用密钥时，AI质控会明确提示输入密钥，不伪造分析结果。

## 分组与医保审核工作台

- `DRG / DIP 3.0` 和 `智能医保审核` 使用当前选中的患者 Episode；诊断、手术、患者属性和 ClaimDetail 可在工作台检查、修改并重新执行。
- 国家 DRG/DIP 3.0 本地执行规则由 `rulesets/official-source/` 中的两个工作簿编译生成，规则包代码位于 `app/p1/rules/compiled/`，逐步结果保留规则 trace 和来源行。
- 支持院内预分组、锁定结算快照后正式本地分组、确定性审核、证据调取及人工复核/退回重跑；此“正式分组”是本地规则复刻，不是医保生产平台的远程返回。
- Golden Patient 位于患者列表首位，包含 10 份样本文书及生命体征、LIS、RIS、医嘱、病理和结算数据，可用于本地全链路测试。样本为合成数据。

上游来源与固定版本：[`huimeicloud/hm_editor`](https://github.com/huimeicloud/hm_editor)，commit `6657869cd69f513ae62ab2722c9347ded9cc9e37`。模板/编辑器运行时由首次启动脚本从上游检出，未将第三方完整仓库提交进本项目。

## 业务边界

- 住院病案首页沿用上游模板；医保结算清单按项目提供的 193 项 PDF 映射。
- 本地分组器执行随项目提供的国家 3.0 工作簿规则，不等同医保生产平台的核定结果。DIP 先执行排除规则，再执行分组规则；具体病例结果以工作台 trace 为准。
- 武汉地方权重、费率、DIP 点值等尚未核验，支付计算保持 `PENDING_LOCAL_PARAMETERS`，界面不提供测试支付参数入口，也不生成冒充生产的支付金额。
- 当前审核覆盖清单质量、编码确认、ClaimDetail 基础时序/重复检查、反事实分组、证据索引和人工复核；国家医保智能监管“两库”完整知识点包尚未导入。
- 患者与规则样本用于本地测试；病历草稿和工作台状态保存在浏览器 `localStorage`，不是医院后端或多用户数据存储。不要使用未经授权的真实患者信息。

## 验收

```bat
verify-p1-operational.bat
verify-p1-real-flow.bat
```

全量测试及 Golden 样本自校验：

```powershell
node --test tests/*.test.mjs
node product/medical-system-golden-patient-v1/tests/validate-golden.mjs
```

## 第三方许可

上游代码与各依赖的许可请以 `vendor/hm_editor/LICENSE` 及对应目录声明为准；来源说明见 `THIRD_PARTY_NOTICES.md`。
