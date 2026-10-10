---
id: 6
type: story
title: "感知与 IM 路由的首个证据驱动演示路径"
parent: epic-desktop-capture
covers: [R5, R6]
after: [5]
risk: high
---

# 感知与 IM 路由的首个证据驱动演示路径

## Description

实现感知与 IM 路由的首个证据驱动演示路径：desktop 阶段编排接入（gate 之后、scenePlan 之前）、actions.json 动作记录（同时引用 changelog sourceRef 与 commit/code 证据）、只读 URL 观测级动作实现，并验证动作失败不产生伪成功。

## Acceptance Criteria

Verify: 通过置信度门禁的感知与 IM 路由入口可在受控启动的 StartUpOS Desktop 上执行首个演示动作，动作记录同时引用 changelog 与 commit/code 证据；动作或启动失败时保留先前产物、失败阶段与可读诊断，且无伪成功产物、无进程残留。

## References

- parent — _bmad-output/initiative-showcraft-release-video-mvp/epic-desktop-capture/epic-desktop-capture.md
- plan — _bmad-output/initiative-showcraft-release-video-mvp/epic-desktop-capture/story-evidence-driven-demo-plan.md
- openspec/changes/showcraft-release-video-mvp/specs/desktop-demo-capture/spec.md
- openspec/changes/showcraft-release-video-mvp/tasks.md#3-startupos-desktop-演示与录屏
