---
id: 5
type: story
title: "StartUpOS Desktop 生命周期 adapter"
parent: epic-desktop-capture
covers: [R5, R6]
after: [4]
risk: high
---

# StartUpOS Desktop 生命周期 adapter

## Description

建立 StartUpOS Desktop 生命周期 adapter、就绪探测和可诊断的停止逻辑，并验证启动失败不会遗留进程。

## Acceptance Criteria

Verify: 桌面应用可被受控启动、探测就绪并停止；启动或就绪失败时保留可读诊断、回收全部进程且不产生伪成功。

## References

- parent — _bmad-output/initiative-showcraft-release-video-mvp/epic-desktop-capture/epic-desktop-capture.md
- plan — _bmad-output/initiative-showcraft-release-video-mvp/epic-desktop-capture/story-desktop-lifecycle-plan.md
- openspec/changes/showcraft-release-video-mvp/specs/desktop-demo-capture/spec.md
- openspec/changes/showcraft-release-video-mvp/tasks.md#3-startupos-desktop-演示与录屏
