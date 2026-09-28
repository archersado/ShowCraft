# Proposal

## Why

产品运营团队需要将版本说明稳定地转化为面向用户的功能介绍视频。当前过程依赖人工阅读 Changelog、寻找产品入口、录屏、配音、剪辑与审核，无法随每个版本重复执行和追溯。

## What Changes

- 新增从用户提供的本地 Markdown 路径或 GitHub URL 读取发布说明的 CLI 输入能力，并支持 StartUpOS 的版本说明约定。
- 新增由发布说明与只读 Git 提交/代码证据共同定位版本专属产品入口的能力；低置信度路径不自动执行。
- 新增 StartUpOS Desktop 本地自动演示、录屏、中文 Edge TTS 配音、字幕与按 feature 数动态编排的视频生成链路。
- 新增仅绑定 `127.0.0.1` 的 HTTP 审核预览与批准/退回状态记录。
- 以 StartUpOS `v0.3.3` 的“感知与 IM 路由”为首个端到端验收样本。

## Capabilities

### New Capabilities

- `release-source-ingestion`: CLI 接收并安全解析本地/GitHub 发布说明为结构化版本特性。
- `code-evidence-discovery`: 将版本特性与只读 Git 提交、diff、代码符号关联，形成带置信度的产品入口证据。
- `desktop-demo-capture`: 对高置信度入口在本地启动并操作 StartUpOS Desktop，产出可追溯录屏素材。
- `localized-video-composition`: 使用 `zh-CN-XiaoxiaoNeural`、中文字幕和动态时长规则生成 Remotion 视频。
- `local-review-preview`: 通过 loopback HTTP 提供审核预览，并记录人工批准或退回结果。

### Modified Capabilities

无；项目中尚无既有 OpenSpec capability。

## Impact

新增 TypeScript workspace 的 core schema、CLI、source/code-evidence connectors、桌面自动化与录屏 adapter、Edge TTS adapter、Remotion Studio、loopback preview server、run 产物存储及测试。StartUpOS 仓库与 Git 历史仅以只读方式使用；不会读取其 `.env`、凭据或写入任何文件。
