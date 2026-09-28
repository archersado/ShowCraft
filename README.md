# ShowCraft

ShowCraft 将版本说明逐步转化为可审核的产品功能介绍视频。本仓库当前完成的是无外部依赖的 mock CLI tracer：它验证 workspace、命令入口和结构化 run 产物，不会读取 StartUpOS、启动桌面应用、调用 TTS、渲染视频或启动 HTTP 服务。

## 环境

- Node.js 24 或更高
- pnpm 12.4.1

## 安装与验证

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

## 运行 mock tracer

```bash
pnpm demo
pnpm demo -- --output /tmp/showcraft-runs
```

命令会输出一个绝对 run 目录，其中包含：

- `release.json`：固定示例发布输入
- `manifest.json`：由示例功能构造的 mock scene manifest
- `run.json`：状态为 `completed` 的技术 run 结果

默认产物位于仓库的 `runs/` 目录，该目录不会被 Git 跟踪。生产领域 Schema、文件化 run store、真实 Changelog/Git 证据、桌面操作、录屏、中文 TTS、Remotion 渲染和 HTTP 审核将在后续 Story 中实现。
