---
type: epic
title: "本机预览、人工审核与端到端验收"
parent: initiative-showcraft-release-video-mvp
covers: [R9, R10, R11]
after: [epic-release-evidence, epic-desktop-capture, epic-video-composition]
assignee: ""
risk: medium
---

# 本机预览、人工审核与端到端验收

## Description

把已渲染视频通过仅本机可访问的 HTTP 地址交给运营审核，记录批准/退回，并完成 v0.3.3 感知与 IM 的端到端验收。

## Outcome

运营人员可打开 CLI 输出的 URL 检查视频，并以审核决定控制业务交付状态。

## Done when

1. 预览仅监听 loopback 且本机浏览器可打开。
2. 审核决定与意见持久化到 run。
3. 未批准 run 不能标记业务交付完成。
4. v0.3.3 感知与 IM 样本通过事实、录屏、音画同步和时长四项审核。

## Boundaries

负责本机预览、审核状态和端到端验收；不实现云发布或多人协作。

## References

- parent — ../initiative-showcraft-release-video-mvp.md, R9–R11
- spec — openspec/changes/showcraft-release-video-mvp/specs/local-review-preview/spec.md
- acceptance — openspec/changes/showcraft-release-video-mvp/tasks.md, section 5
