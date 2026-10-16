---
id: 9
type: story
title: "Edge TTS zh-CN-XiaoxiaoNeural adapter 与中文时序输出"
parent: epic-video-composition
covers: [R7]
after: [8]
risk: medium
---

# Edge TTS zh-CN-XiaoxiaoNeural adapter 与中文时序输出

## Description

实现 Edge TTS `zh-CN-XiaoxiaoNeural` adapter 与中文时序输出：零依赖 Node 24 原生 `WebSocket` WSS 直连 + 自实现 Sec-MS-GEC v2 DRM（规划期已完整实测可行，见 plan 决策 2），core 新增 `NarrationPort` + orchestrator `narration` stage，CLI `--tts` 显式启用产出 `narration.json`（word 级字幕时序 cues + 音频实测时长）与每场景 MP3；全部失败形态显式失败 @narration、无伪成功，缺省路径产物字节零变化。验证中文文本生成可用音轨与字幕时序。

## Acceptance Criteria

Verify: 不带 `--tts` 时 mock 4 文件 / `--source` 5 文件契约逐字节不变且 narration stage 不进入；`--tts` 时 run 目录追加 schema 合法的 `narration.json`（cues 非空、单调、tick→ms 向下取整）与每场景 MP3；握手失败/服务拒绝/空音频/损坏/时序缺失全部 run 显式失败、已完成产物保留、诊断有界、无静音降级；DRM token 与上游 edge-tts 7.3.1 固定向量逐字符一致；`pnpm test` 基线 252 用例零回归且新增用例无网络依赖；真实网络手动段 afinfo 报 MPG3/24kHz/48kbps/mono 且 cues 末值 ≤ audioDurationMs×1.05。

## References

- parent — _bmad-output/initiative-showcraft-release-video-mvp/epic-video-composition/epic-video-composition.md
- plan — _bmad-output/initiative-showcraft-release-video-mvp/epic-video-composition/story-edge-tts-plan.md
- openspec/changes/showcraft-release-video-mvp/specs/localized-video-composition/spec.md
- openspec/changes/showcraft-release-video-mvp/tasks.md#4-中文视频合成
