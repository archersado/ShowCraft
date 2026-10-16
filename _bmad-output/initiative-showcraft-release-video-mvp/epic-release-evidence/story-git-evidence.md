---
id: 3
type: story
title: "只读 Git 证据检索与置信度"
parent: epic-release-evidence
covers: [R2, R3]
after: [2]
risk: high
---

# 只读 Git 证据检索与置信度

## Description

实现只读 Git 提交/diff/符号证据检索与确定性 feature↔commit 匹配，输出带置信度的证据包与入口候选。

## Acceptance Criteria

Verify: 对 v0.3.3 的感知与 IM 路由 feature 检索出可回链 commit/diff/符号的入口候选，每项带置信度。

## References

- parent — _bmad-output/initiative-showcraft-release-video-mvp/epic-release-evidence/epic-release-evidence.md
- plan — _bmad-output/initiative-showcraft-release-video-mvp/epic-release-evidence/story-git-evidence-plan.md
- openspec/changes/showcraft-release-video-mvp/specs/code-evidence-discovery/spec.md
- openspec/changes/showcraft-release-video-mvp/tasks.md#2-发布来源与代码证据
