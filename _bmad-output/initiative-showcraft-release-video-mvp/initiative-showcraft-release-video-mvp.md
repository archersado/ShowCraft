---
type: initiative
title: "ShowCraft Release Video MVP"
parent: none
covers: [R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11]
after: []
assignee: ""
risk: high
---

# ShowCraft Release Video MVP

## Description

把产品版本说明转化为证据可追溯的桌面功能演示视频：自动发现版本专属入口、操作 StartUpOS Desktop、录屏、中文配音与字幕、渲染，并交给运营人员审核。

## Outcome

运营团队能从 StartUpOS `v0.3.3` Changelog 发起一次 run，并在本机 HTTP 地址审核“感知与 IM 路由”介绍视频；所有镜头均能回链发布说明和代码证据。

## Requirements

- R1: CLI 接受合法本地 Markdown 或 GitHub 文档 URL，并解析为至少一个版本特性。
- R2: run 保存来源摘要及 feature 到原始段落的映射。
- R3: 每项 feature 生成带 commit/diff/file/symbol 引用和置信度的代码证据包。
- R4: 缺少证据或低置信度候选不得直接触发产品操作。
- R5: 高置信度入口可在本地 StartUpOS Desktop 中执行并录屏，动作与证据一同保存。
- R6: 启动、定位或录制失败时保留产物和可读诊断，不产生伪成功视频。
- R7: 默认使用 `zh-CN-XiaoxiaoNeural` 生成中文配音与同步字幕。
- R8: 开场/结尾 10–15 秒、每项 feature 12–20 秒，超过 90 秒按 feature 边界拆分。
- R9: 渲染成功后提供仅绑定 `127.0.0.1` 的 HTTP 审核预览。
- R10: 用户可记录 `approved` 或 `changes_requested` 及审核意见。
- R11: 未批准 run 不得标记为业务交付完成。

## Done when

1. StartUpOS `v0.3.3` 的感知与 IM 路由能从 Changelog 和代码证据生成可审核视频。
2. 每个自动演示镜头都能回链发布说明与 Git 代码证据，低置信度候选不会被执行。
3. 视频含中文配音、字幕，并符合动态时长与拆分规则。
4. 本机 HTTP 预览可用且不监听局域网；审核决定可持久化。
5. 功能事实、录屏状态、音画同步和时长四项审核均通过后，run 才能完成业务交付。

## Boundaries

包含本地 CLI、证据发现、StartUpOS Desktop 自动化、媒体生成和人工审核。排除云队列、账号系统、远程协作、发布渠道和无人审核发布。Tracer path：mock run 骨架 → v0.3.3 证据 → Desktop 录屏 → 中文视频 → HTTP 审核。

- Touch point: StartUpOS 仓库与 Git 历史 — 只读 Changelog、提交与代码；owner: epic-release-evidence
- Touch point: StartUpOS Desktop — 只读运行和 UI 操作；owner: epic-desktop-capture
- Touch point: Edge TTS — 外部免费语音服务；owner: epic-video-composition

## References

- spec — openspec/changes/showcraft-release-video-mvp/proposal.md, Capabilities
- design — openspec/changes/showcraft-release-video-mvp/design.md
- tasks — openspec/changes/showcraft-release-video-mvp/tasks.md
- architecture — _bmad-output/project-knowledge/traceability.md

## Notes

- Decision: 采用 OpenSpec 管理 SDD 规格、仓库 Markdown 管理 Initiative/Epic/Story（用户决定，2026-09-28）。
- Decision: 首个验收样本为 StartUpOS Desktop v0.3.3 的感知与 IM 路由（用户决定，2026-09-28）。
- Unknown: StartUpOS 的稳定启动/认证与 UI 就绪条件由 desktop capture epic 的 tracer story 验证。

