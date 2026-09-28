---
type: epic
title: "中文视频编排与 Edge TTS"
parent: initiative-showcraft-release-video-mvp
covers: [R7, R8]
after: [epic-runtime-foundation]
assignee: ""
risk: medium
---

# 中文视频编排与 Edge TTS

## Description

将 scene plan 与媒体素材转成中文配音、字幕、动态时长 manifest 和 Remotion 视频。

## Outcome

任意符合合同的 mock 或真实录屏素材可生成满足时长规则的中文产品视频。

## Done when

1. 默认 Xiaoxiao 音色生成可用音轨和字幕时序。
2. 1、3、6 个 feature 的时长与系列拆分符合规格。
3. Remotion 可预览并渲染 manifest 为 MP4。
4. TTS 或渲染失败进入可诊断 run 状态。

## Boundaries

负责音画和渲染，不操作产品、不提供审核服务。

## References

- parent — ../initiative-showcraft-release-video-mvp.md, R7–R8
- spec — openspec/changes/showcraft-release-video-mvp/specs/localized-video-composition/spec.md

