---
id: 7
type: story
title: "本地录屏接入与媒体引用写入 run"
parent: epic-desktop-capture
covers: [R5, R6]
after: [6]
risk: high
---

# 本地录屏接入与媒体引用写入 run

## Description

接入本地录屏并将媒体引用写入 run：动作级 screencapture 录制（零 npm 依赖）、`DemoActionRecord.media` 可选引用字段、录制失败显式失败语义，并验证元素定位或录制失败时不产生伪成功视频。

## Acceptance Criteria

Verify: 通过置信度门禁的演示动作在执行时同步产出录屏素材（QuickTime H.264 文件直写 run 目录），媒体引用写入 actions.json 动作记录；录制启动失败、中途失败或产物空/损坏时 run 显式失败、无成功媒体引用、无伪成功视频；mock 4 文件与 `--source` 5 文件字节契约不变。

## References

- parent — _bmad-output/initiative-showcraft-release-video-mvp/epic-desktop-capture/epic-desktop-capture.md
- plan — _bmad-output/initiative-showcraft-release-video-mvp/epic-desktop-capture/story-local-recording-plan.md
- openspec/changes/showcraft-release-video-mvp/specs/desktop-demo-capture/spec.md
- openspec/changes/showcraft-release-video-mvp/tasks.md#3-startupos-desktop-演示与录屏
