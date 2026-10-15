# Memory

## ShowCraft

- 用户希望构建智能运营助手：根据版本特性自动演示产品、录屏、配文案，并用 Remotion/HyperFrames 生成介绍视频。
- 当前证据唯一来源是 `plan-product-feature-video-assistant-skeleton.md`；架构采用结构—运行—机制三视图，真实产品录制与供应商接入仍待验证。
- PKA 已安装于项目级 `.agents/skills/`；跨项目知识库暂不配置。
- 已确认 MVP：运营团队从 GitHub/本地 Changelog 同步版本事实，在本地全自动生成按特性伸缩的中文配音/字幕介绍视频，之后必须人工审核。
- ShowCraft CLI 以显式文档地址作为 Changelog 输入；首个产品是 StartUpOS，其发布说明默认约定为 `docs/changes/releases/v<version>/changelog.md`。CLI 输出视频链接供用户批准或退回。
- 首个验收样本是 StartUpOS Desktop 的 v0.3.3；配音选 Edge TTS，审核交付选本机 loopback HTTP 预览。
- 产品入口不使用静态脚本：ShowCraft 必须结合 Changelog 和关联 commit/diff 生成带置信度的操作路径；首条讲感知与 IM 路由，默认音色为 `zh-CN-XiaoxiaoNeural`，审核检查事实、录屏、音画和时长。
