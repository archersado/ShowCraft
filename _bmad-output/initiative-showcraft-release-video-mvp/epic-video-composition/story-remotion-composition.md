---
id: 12
type: story
title: "Remotion composition 消费 manifest 渲染 MP4"
parent: epic-video-composition
covers: [R8]
after: [11]
risk: medium
---

# Remotion composition 消费 manifest 渲染 MP4

## Description

实现 Remotion composition 并消费 manifest：core 新增 `composition` Optional stage 与 `composition.json` schema（卷映射：index/mp4File/durationSeconds/sceneIds，聚合校验与 manifest.volumes 恰一对应）；cli 新建 Remotion renderer adapter（`remotion@4.0.536` 系精确锁定 + 自带 ffmpeg 无系统依赖，规划期已完整实测可行，见 plan 决策 2）——按 manifest.volumes 逐卷渲染 `video-volume-N.mp4`（fps 30/1280×720 常量，`calculateMetadata` 由 plannedTotalSeconds 推导时长），文字卡画面 + 可选 `<Audio>` 挂 4.1 MP3 + word 级 cues 确定性聚合字幕条；CLI `--render` 显式 opt-in（沿 `--tts` 惯例，缺省关闭时 4.2 修订后契约逐字节不变、316 用例零回归）；渲染失败显式失败 @composition、已完成产物保留、无伪成功 MP4。验证 v0.3.3 感知/IM 样本可渲染 MP4（1/3/6 feature → 1/1/2 卷、逐卷时长 = plannedTotalSeconds ±1s）。含 spec delta（localized-video-composition 新增「渲染视频」Requirement）；依赖引入（remotion/bundler/renderer/react）需用户批准（plan 决策 2）。

## Acceptance Criteria

Verify: mock 1/3/6 feature + `--render` 分别产出 1/1/2 个 `video-volume-N.mp4`、逐卷实测时长 = plannedTotalSeconds ±1s、卷序与 manifest.volumes 一致且单镜头不跨卷；`--tts` 时每镜头音轨引用 4.1 MP3、composition.json 记录 audioFiles、字幕条由 cues 确定性聚合（narration.json 原始数据零改动）；无 `--render` 时产物集合与字节同 4.2 验收基线逐字节一致、既有 316 用例零回归；渲染失败（stub 注入）显式失败 @composition、已完成产物保留、composition.json 不落盘；音频超过 planned 窗口显式失败；Remotion 三包同版本精确锁定、`pnpm build` 后 cli dist 无 .tsx 产物、渲染路径零系统 ffmpeg 依赖；`pnpm test` 既有用例零回归且新增用例全部 stub 注入无浏览器依赖；`pnpm lint` / `pnpm typecheck` / `pnpm build` / `openspec validate showcraft-release-video-mvp --strict`（含 spec delta）全部通过；实施期真实渲染手动段对 v0.3.3 `--source` 产出 72s 单卷 MP4（mvhd 实测核对）。

## References

- parent — _bmad-output/initiative-showcraft-release-video-mvp/epic-video-composition/epic-video-composition.md
- plan — _bmad-output/initiative-showcraft-release-video-mvp/epic-video-composition/story-remotion-composition-plan.md
- openspec/changes/showcraft-release-video-mvp/specs/localized-video-composition/spec.md
- openspec/changes/showcraft-release-video-mvp/tasks.md#4-中文视频合成
