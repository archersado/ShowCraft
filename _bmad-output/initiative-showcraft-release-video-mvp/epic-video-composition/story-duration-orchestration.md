---
id: 11
type: story
title: "feature 数量驱动的镜头时长与 90 秒系列拆分"
parent: epic-video-composition
covers: [R8]
after: [9]
risk: medium
---

# feature 数量驱动的镜头时长与 90 秒系列拆分

## Description

实现 feature 数量驱动的镜头时长与 90 秒系列拆分：core 新增 `durationOrchestration` 纯函数模块（开场/结尾 10–15s、每 feature 12–20s 窗口常量、`planVolumes` 按 feature 边界贪心分卷、`estimateTotalSeconds` 确定性预估）；mock scenePlanner/renderer 升级为含开场/结尾镜头与分卷 manifest 的实现（单一 `manifest.json` 内 `volumes` 视图声明，`stageFileNames`/产物文件集合零改动）；narration 恰一对应自然覆盖开场/结尾（`--tts` 时 intro/outro 同获配音与字幕）；验证 1、3、6 个 feature 的 manifest 行为（40s/72s 不拆、120s 拆 2 卷、每卷 ≤90s、单镜头不跨卷）。默认路径 scene/manifest 内容随编排升级而变化，属**契约修订**，需用户批准后实施（plan 决策 4）。

## Acceptance Criteria

Verify: 1、3、6 个 feature 的 scenePlan 含 intro + N feature + outro 镜头且 manifest.volumes 分别为 1/1/2 卷（40s/72s/120s）；每卷 ≤90s、单镜头不跨卷、恰好 90s 不拆分、单镜头超 90s 显式失败；预估总时长 = plannedDurationSeconds 之和（不依赖 TTS/网络）；同输入重复 run 产物逐字节稳定；mock 4 文件 / `--source` 5 文件集合与 artifacts 顺序不变（内容为修订后契约并逐字节锁定）；`pnpm test` 既有非契约修订断言零回归且新增用例全绿无网络；`pnpm lint` / `pnpm typecheck` / `pnpm build` / `openspec validate showcraft-release-video-mvp --strict` 全部通过；顺手项 quarantineNarrationFile 死代码删除、desktopFixtures.ts 移出 cli dist。

## References

- parent — _bmad-output/initiative-showcraft-release-video-mvp/epic-video-composition/epic-video-composition.md
- plan — _bmad-output/initiative-showcraft-release-video-mvp/epic-video-composition/story-duration-orchestration-plan.md
- openspec/changes/showcraft-release-video-mvp/specs/localized-video-composition/spec.md
- openspec/changes/showcraft-release-video-mvp/tasks.md#4-中文视频合成
