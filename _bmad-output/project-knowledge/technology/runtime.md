# 技术架构：运行

1. CLI 接受 `--source <path-or-url>`；Source Resolver 验证其为允许的 Markdown 文档，对 StartUpOS 版本说明可按约定推导路径。
2. Changelog connector 以只读方式解析版本变更，归一化后交给 core schema；Code Evidence Explorer 查询关联 commit/diff，输出入口候选和置信度。
3. 编排器只对高置信度入口候选创建自动化动作，启动 StartUpOS 桌面版，并以阶段事件驱动 Narrative、Demo、Capture、Edge TTS、字幕和 Manifest provider。
4. CLI 将每个阶段产物与状态落入 run 目录；异常保留已完成文件并返回非零退出码。
5. Studio 从 manifest 接收 props，在本地预览或通过 Remotion render 输出 MP4；Preview Server 绑定 `127.0.0.1` 并由 CLI 输出 HTTP 视频链接，进入人工审核门禁。

## 运行约束

- 默认 adapters 不访问网络、不要求 API Key。[S-001]
- 本地全自动运行要求目标产品能在本机以可重复的方式启动；启动命令、种子数据和认证策略仍为 `pending`。[S-003]
- StartUpOS 可从 `docs/changes/releases/v<version>/changelog.md` 读取版本说明；用户也可显式传入文档地址。远程 GitHub 的最小权限策略和 Markdown 解析规则仍为 `pending`。[S-004]
- 首发以 StartUpOS `v0.3.3` 和桌面启动路径验证；实际 `pnpm desktop:dev` 启动协调、首屏就绪探测、测试数据与认证策略仍为 `pending`。[S-005]
- Edge TTS 默认采用 `zh-CN-XiaoxiaoNeural`；失败时的重试、静音占位或其他 TTS 降级策略仍为 `pending`。[S-006]
- 并发、持久任务队列和远程执行不在首个骨架范围内。[S-001]
