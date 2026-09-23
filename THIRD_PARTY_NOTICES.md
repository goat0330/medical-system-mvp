# Third-Party Notices

病历编辑模块使用 `huimeicloud/hm_editor` 开源编辑器 SDK 及其示例模板。首次启动时，`scripts/ensure-hmeditor.mjs` 从上游检出固定 commit 到 Git 忽略目录 `vendor/hm_editor/`，并本地构建运行时文件。本项目不把第三方完整仓库复制进自己的 Git 历史，也不修改上游模板的数据元标记。

- Upstream: https://github.com/huimeicloud/hm_editor
- Pinned revision: `6657869cd69f513ae62ab2722c9347ded9cc9e37`
- License: 保留上游仓库的 `LICENSE` 与各依赖许可声明；以本地 `vendor/hm_editor/` 中对应文件为准。

业务界面使用项目自身的模块命名；上游来源与许可仅在此处说明。上游 AI/语音服务需要另外配置，本地编辑器运行不代表模型服务已接入。
