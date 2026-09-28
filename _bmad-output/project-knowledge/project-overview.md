# ShowCraft 项目概览

## 定位

ShowCraft 是一个面向产品运营的智能视频生产助手：将版本特性转成可审核的讲解脚本、产品操作步骤、录屏素材清单和视频渲染清单，最终由 Remotion 或兼容的合成器生成产品介绍视频。

## 当前边界

- 已确认：首个交付服务产品运营团队，为用户进行功能介绍并辅助产品推广；其基础是无需外部凭据即可运行的 TypeScript 骨架，含 mock 演示链路、CLI、任务产物与 Remotion 模板。[来源：S-001, S-003]
- 已确认：真实 LLM、浏览器自动化、录屏、TTS 与 HyperFrames 以适配器接入，不在骨架中绑定供应商或处理凭据。[来源：同上]
- 已确认：CLI 接受 Changelog 文档地址作为参数；StartUpOS 的版本说明可默认指向 `docs/changes/releases/v<version>/changelog.md`，也允许用户传入其他本地/GitHub 文档。[来源：S-004]
- 已确认：CLI 输出可查看的视频链接；用户据此批准或退回。动态时长采用“开场/结尾 10–15 秒 + 每项特性 12–20 秒，超过 90 秒拆分系列”的规则。[来源：S-003, S-004]
- 已确认：首发录制对象为 StartUpOS 桌面版，输入为 `v0.3.3` 发布说明；中文配音优先使用 Edge TTS，审核链接为本地 HTTP 预览地址。[来源：S-005]
- 已确认：ShowCraft 结合 Changelog 与关联提交代码发现每个版本的产品入口；首条聚焦感知与 IM 路由，默认音色 `zh-CN-XiaoxiaoNeural`，审核须同时通过事实、录屏、音画同步和时长检查。[来源：S-006]
- `pending`：StartUpOS 的启动/认证与种子数据、commit—feature 关联算法、品牌规范和 Edge TTS 失败降级策略尚未提供。

## 架构阅读方式

业务、产品、技术各有“结构—运行—机制”视图；`traceability.md` 连接三者。未标注 `inferred` 的陈述均来自已批准的项目计划。
