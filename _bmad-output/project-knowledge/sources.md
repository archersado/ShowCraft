# 来源登记

| ID | 来源 | 类型 | 可支持的事实 | 状态 |
|---|---|---|---|---|
| S-001 | `_bmad-output/implementation-artifacts/plan-product-feature-video-assistant-skeleton.md` | 已批准实现计划 | 目标、边界、输入输出、组件、验收标准 | 已读取 |
| S-002 | 用户需求对话（2026-09-28） | 需求陈述 | 根据版本特性自动操作产品、录屏、配文案，并结合 Remotion/HyperFrames 生成介绍视频 | 已读取 |
| S-003 | 用户架构澄清（2026-09-28） | 用户确认的产品决策 | 运营团队是使用者；从 GitHub/本地 Changelog 同步；本地全自动执行；按特性数决定时长；中文 AI 配音/字幕；人工审核 | 已确认 |
| S-004 | 用户实施澄清与 StartUpOS 只读探查（2026-09-28） | 用户确认 + 外部项目文档 | CLI 接收 Changelog 文档路径；目标产品为 StartUpOS；采用动态时长；CLI 输出视频链接，由用户批准或退回；StartUpOS 发布 Changelog 位于 `docs/changes/releases/v<version>/changelog.md` | 已确认 |
| S-005 | 用户技术选择与 StartUpOS `v0.3.3` Changelog（2026-09-28） | 用户确认 + 只读发布说明 | 首发录制 StartUpOS 桌面版；使用 Edge TTS；以 HTTP 预览审核；`v0.3.3` 发布说明存在且含感知/IM、企业微信、Agent 协作与验证特性 | 已确认 |
| S-006 | 用户演示策略澄清（2026-09-28） | 用户确认的产品决策 | 由 Changelog 和相关 commit 代码共同发现版本专属产品入口；首条聚焦感知与 IM 路由；默认音色 `zh-CN-XiaoxiaoNeural`；审核要求事实、录屏、音画与时长均通过 | 已确认 |

任何未由以上来源支持的设计判断均以 `inferred` 或 `pending` 标记。
