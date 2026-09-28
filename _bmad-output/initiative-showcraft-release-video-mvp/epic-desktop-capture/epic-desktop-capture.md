---
type: epic
title: "StartUpOS Desktop 自动演示与录屏"
parent: initiative-showcraft-release-video-mvp
covers: [R5, R6]
after: [epic-release-evidence]
assignee: ""
risk: high
---

# StartUpOS Desktop 自动演示与录屏

## Description

把通过证据门禁的入口转成 StartUpOS Desktop 本地操作与录屏，并完整记录动作、媒体和失败诊断。

## Outcome

感知与 IM 路由可重复演示并生成真实录屏，失败不会被包装为成功。

## Done when

1. Desktop 可被受控启动、探测就绪和停止。
2. 感知与 IM 路由操作路径能从 evidence pack 执行。
3. 录屏与动作记录写入同一 run。
4. 启动、定位、录制失败均留下诊断且无伪成功产物。

## Boundaries

负责桌面生命周期、操作和录屏；不负责证据发现或视频合成。

## References

- parent — ../initiative-showcraft-release-video-mvp.md, R5–R6
- spec — openspec/changes/showcraft-release-video-mvp/specs/desktop-demo-capture/spec.md

## Notes

- Unknown: StartUpOS 的认证、测试数据和稳定 UI 就绪信号在本 Epic inception 时验证。

