# 产品架构：机制

## M-P01：端口与适配器让生产链路可替换

- 目标：在不重写业务规则的前提下，将 mock 链路替换为真实 LLM、Playwright/浏览器录制、TTS 或 HyperFrames。
- 结构承载：Narrative、Demo、Capture、Manifest 等 provider 接口（见 `structure.md`）。
- 运行行为：编排器只调用接口；适配器将供应商响应归一化为领域对象（见 `runtime.md`）。
- 验证：替换任一 provider 时，核心 schema 与状态机无修改。[S-001]

## M-P02：manifest 是演示与渲染之间的稳定契约

- 目标：让录制生产和视频视觉迭代能独立演进。
- 结构承载：Render Manifest、Capture Provider、Render Studio。
- 运行行为：录制结束后生成包含镜头、中文字幕、AI 配音引用、媒体引用和 CTA 的 manifest；Remotion 消费它渲染。
- 验证：demo manifest 可由 Remotion Studio 预览或输出 MP4。[S-001]

## M-P03：人工审核是交付门禁，而非可选通知

- 目标：确保自动生成内容在推广前符合产品事实与品牌表达。
- 结构承载：Review Gate、VideoAsset、ReleaseBrief。
- 运行行为：本地自动生产完成后 CLI 输出视频链接并进入 `pending_review`；用户查看链接后记录 `approved` 或 `changes_requested`，退回则附带修改意见。
- 验证：任何未批准 run 都不能标记业务交付完成；审批决定可回链到对应版本事实。[S-003]

## M-P04：文档地址优先于固定仓库约定

- 目标：允许运营团队处理不同仓库和本地文件布局的发布说明。
- 结构承载：Changelog Source Resolver、CLI、Changelog Sync。
- 运行行为：CLI 必填文档地址；对 StartUpOS 可由版本号推导默认发布说明路径，也允许直接传完整路径或 URL。
- 验证：同一 run 能以显式 Markdown 路径运行；对 StartUpOS 的默认路径解析出目标版本文档。[S-004]

## M-P05：本地 HTTP 预览把生成与审核连接为可操作闭环

- 目标：让运营人员无需定位产物目录就能审核视频。
- 结构承载：Preview Server、Review Gate、VideoAsset、CLI。
- 运行行为：渲染成功后在 loopback 地址提供视频和基础 run 摘要；CLI 打印 URL，审批命令写入审核决定。
- 验证：外部网络不可访问预览服务；本机浏览器能打开 URL，批准/退回后 run 状态改变。[S-005]

## M-P06：代码证据驱动版本专属演示路径

- 目标：让不同版本根据实际改动定位入口，而不依赖维护固定脚本。
- 结构承载：Changelog Sync、Code Evidence Explorer、Git history/diff、Feature-to-Entrypoint Evidence、ScenePlan。
- 运行行为：从版本说明提取 feature，检索关联提交和变动模块，产生带文件/符号/置信度的入口候选；仅高置信度候选进入自动化操作。
- 验证：每个自动操作镜头都能回链 Changelog 段落与至少一个代码证据；低置信度候选会被标为需人工补充。[S-006]
