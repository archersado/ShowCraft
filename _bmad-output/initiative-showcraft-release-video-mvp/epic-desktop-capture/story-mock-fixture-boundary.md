---
id: 8
type: story
title: "桌面路径 mock/fixture 测试边界与无凭据回归"
parent: epic-desktop-capture
covers: [R5, R6]
after: [7]
risk: medium
---

# 桌面路径 mock/fixture 测试边界与无凭据回归

## Description

为桌面路径加入可重复测试的 mock/fixture 边界：canonical desktop fixtures（fake runner / fake 观测命令 / fake recorder / 自包含 fixture 仓库+changelog）落点固定为 CLI 内部测试 helper，定义「无需真实凭据」回归套件的覆盖矩阵，并把环境敏感用例与三项移交备案收敛定案。交付后任何干净机器（无 StartUpOS、无 TCC 授权、无 3100 端口、无网络）上 `pnpm test` 全绿即验证桌面路径语义，且不破坏 mock 4 文件 / `--source` 5 文件字节契约。

## Acceptance Criteria

Verify: 在不含 `/Users/archersado/workspace/startupOS` 的干净机器上 `pnpm test` 全绿（桌面路径回归套件全部通过）；I/O 矩阵全部场景（eligible 成功 / recording_failed 三形态 / action_failed / stop_failed / port_owner_mismatch / gate 缺失跳过 / no_evidence 零启动 / `--desktop` 用法错误 / 字节契约幂等）均有对应自动化用例且逐项标注覆盖来源；防伪成功语义（失败无成功媒体引用、run 显式失败 @desktop、已完成产物保留、诊断有界）固化为回归断言；三项备案（actionDeadlineMs、boundedDiagnostics `phase=` 前缀、releaseSource 环境敏感用例）按计划裁决执行；mock 4 文件与 `--source` 5 文件字节契约零改动。

## References

- parent — _bmad-output/initiative-showcraft-release-video-mvp/epic-desktop-capture/epic-desktop-capture.md
- plan — _bmad-output/initiative-showcraft-release-video-mvp/epic-desktop-capture/story-mock-fixture-boundary-plan.md
- openspec/changes/showcraft-release-video-mvp/specs/desktop-demo-capture/spec.md
- openspec/changes/showcraft-release-video-mvp/tasks.md#3-startupos-desktop-演示与录屏
