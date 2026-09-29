---
id: 5
type: story
title: "核心骨架 Refactor Sweep"
parent: epic-runtime-foundation
covers: [E1, E2, E3, E4]
after: [1, 2, 3, 4]
risk: low
---

# 核心骨架 Refactor Sweep

## Description

在基础链路完成后统一整理模块边界、命名、公共测试夹具和错误类型，消除 tracer 演进留下的重复与泄漏。

## Acceptance Criteria

Verify: build、typecheck、lint 和 test 全部通过，core 的依赖图中不存在具体外部 provider，且公共夹具没有重复定义。

## References

- parent — _bmad-output/initiative-showcraft-release-video-mvp/epic-runtime-foundation/epic-runtime-foundation.md
- openspec/changes/showcraft-release-video-mvp/design.md#模块边界
