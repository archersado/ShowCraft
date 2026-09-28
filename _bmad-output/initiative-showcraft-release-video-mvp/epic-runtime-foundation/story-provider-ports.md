---
id: 4
type: story
title: "Provider Ports 与编排器"
parent: epic-runtime-foundation
covers: [E3, E4]
after: [3]
risk: high
---

# Provider Ports 与编排器

## Description

定义可注入的 provider ports，并实现由 CLI 装配 adapters、按阶段驱动任务和传播失败诊断的核心编排器。

## Acceptance Criteria

Verify: 单测可替换每个 provider，mock 成功链路完成全部阶段，任一 provider 失败均写入正确失败阶段和原因。

## References

- parent — _bmad-output/initiative-showcraft-release-video-mvp/epic-runtime-foundation/epic-runtime-foundation.md
- openspec/changes/showcraft-release-video-mvp/design.md#ports-and-adapters-编排
- openspec/changes/showcraft-release-video-mvp/tasks.md#1-平台与核心领域
