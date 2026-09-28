# 技术架构：结构

## 代码边界

| 层/包 | 职责 | 依赖方向 |
|---|---|---|
| `packages/core` | Zod schema、领域对象、状态机、编排器、端口定义 | 不依赖具体服务或 UI |
| `packages/adapters` | mock 文案、演示、录屏及 HyperFrames manifest 实现 | 依赖 core |
| `packages/connectors` | GitHub/本地 Changelog 读取、中文 TTS、字幕生成与审核存储适配器 | 依赖 core；首发可由 adapters 合并实现 |
| `apps/cli` | 命令解析、文件读取、任务产物写入、退出码 | 依赖 core/adapters |
| `packages/connectors/source-resolver` | 验证用户传入的本地路径/GitHub URL，并解析 StartUpOS 的版本 Changelog 默认路径 | 只读外部项目；拒绝目录遍历与秘密文件 |
| `packages/connectors/code-evidence` | 从受允许 Git 仓库的提交、diff、文件与符号构建 feature-to-entrypoint 证据包 | 只读 Git；不读取 `.env` 或写入目标仓库 |
| `packages/review` | 生成受控本地视频链接并记录审核决定 | 可先由 CLI 子命令实现 |
| `packages/adapters/edge-tts` | 调用 Edge TTS 生成中文音轨并返回时序元数据 | 依赖 core port；不在 core 中直接发网络请求 |
| `packages/preview-server` | 在 `127.0.0.1` 提供只读视频与 run 摘要 | 不绑定 `0.0.0.0`，不提供外部发布能力 |
| `apps/studio` | Remotion composition 与视频输出 | 消费 manifest |
| `examples/releases` | 版本输入样例 | 被 CLI 消费 |
| `output/` | 每次运行的隔离产物目录 | 运行时生成，需忽略版本控制 |

## 外部边界

GitHub、中文 TTS、产品浏览器自动化、录屏、云存储和发布渠道均在适配器之外；本地 Changelog 可无凭据读取，其他凭据经运行环境注入，不能写入仓库。ShowCraft 对 StartUpOS 及其 Git 历史只读，且不读取 `.env`、凭据或令牌；预览服务只绑定 loopback。[S-001, S-004, S-005, S-006]
