---
type: epic
title: "运行骨架与可追溯任务模型"
parent: initiative-showcraft-release-video-mvp
covers: []
after: []
assignee: ""
risk: medium
---

# 运行骨架与可追溯任务模型

## Description

建立所有能力共享的 TypeScript workspace、领域合同、provider ports、任务状态与文件化 run 产物，使后续 adapter 能独立开发且不重写核心语义。

## Outcome

一个无外部凭据的 mock CLI run 能从示例 release brief 走完编排链路，并留下可验证、可诊断的结构化产物。

## Requirements

- E1: workspace 统一提供 build、typecheck、test 和 demo 命令。（OpenSpec design，Ports-and-adapters）
- E2: release brief、evidence pack、scene plan、render manifest、run/review 状态拥有运行时 schema 和稳定序列化格式。（支撑 R1–R11）
- E3: core 只依赖 provider ports，CLI 负责装配 mock/real adapters。（OpenSpec design）
- E4: run 逐阶段保存产物、状态与错误；失败不清理已成功产物。（支撑 R2、R6、R10）

## Done when

1. 新克隆仓库安装依赖后，build、typecheck 和 test 命令可运行。
2. mock CLI run 生成 release、evidence、scene、manifest 和最终状态文件。
3. 任一 mock provider 失败时，run 记录失败阶段、原因和此前产物。
4. core 中不存在对 StartUpOS、Edge TTS、Remotion 或 HTTP server 的直接依赖。

## Boundaries

仅建立平台合同、编排和 mock tracer；不实现真实 Changelog/Git、桌面自动化、TTS、渲染或审核服务。

## References

- parent — ../initiative-showcraft-release-video-mvp.md, Requirements
- design — openspec/changes/showcraft-release-video-mvp/design.md, Decisions
- tasks — openspec/changes/showcraft-release-video-mvp/tasks.md, section 1

## Notes

- Decision: opening tracer 使用 mock adapters，真实外部依赖由后续 Epic 接入（2026-09-28）。
- Decision: Story 1 是贯穿 workspace、CLI、core 和文件产物的 tracer bullet（用户批准，2026-09-28）。
- Decision: Schema、run store 与 orchestrator 串行演进以避免共享核心代码碰撞；refactor sweep 后再运行跨模块端到端测试（用户批准，2026-09-28）。
- Deferred: 真实 Changelog/Git、Desktop、TTS、Remotion 和 HTTP review adapters 由后续 Epic 交付。
