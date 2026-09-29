---
id: 6
type: story
title: "Core 端到端测试"
parent: epic-runtime-foundation
covers: [E1, E2, E3, E4]
after: [5]
risk: medium
---

# Core 端到端测试

## Description

建立覆盖 mock CLI 成功路径和逐 provider 故障注入的跨模块端到端测试，锁定基础运行骨架的可追溯行为。

## Acceptance Criteria

Verify: 端到端测试验证成功 run 的完整产物集合，并逐一验证 provider 失败后的状态、诊断信息和已完成产物保留规则。

## References

- parent — _bmad-output/initiative-showcraft-release-video-mvp/epic-runtime-foundation/epic-runtime-foundation.md
- openspec/changes/showcraft-release-video-mvp/tasks.md#1-平台与核心领域
- openspec/changes/showcraft-release-video-mvp/design.md#run-产物与状态
