---
type: epic
title: "发布说明与代码证据发现"
parent: initiative-showcraft-release-video-mvp
covers: [R1, R2, R3, R4]
after: [epic-runtime-foundation]
assignee: ""
risk: high
---

# 发布说明与代码证据发现

## Description

从 CLI 文档来源生成可追溯 release brief，并只读分析关联 Git 提交与代码，形成带置信度的产品入口证据。

## Outcome

StartUpOS v0.3.3 感知与 IM 路由获得可回链源段落和 commit/code 的入口候选，低置信度结果不会进入自动化。

## Done when

1. 合法本地/GitHub Markdown 可解析，无效和秘密来源被拒绝。
2. 每项 feature 可回链源段落。
3. evidence pack 含代码引用、候选入口和置信度。
4. 低置信度候选被明确降级，不产生自动化动作。

## Boundaries

负责输入与证据，不启动或操作桌面产品。

## References

- parent — ../initiative-showcraft-release-video-mvp.md, R1–R4
- spec — openspec/changes/showcraft-release-video-mvp/specs/release-source-ingestion/spec.md
- spec — openspec/changes/showcraft-release-video-mvp/specs/code-evidence-discovery/spec.md

