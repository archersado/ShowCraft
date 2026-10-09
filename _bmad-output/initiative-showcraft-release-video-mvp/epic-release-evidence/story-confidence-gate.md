---
id: 4
type: story
title: "低置信度门禁与人工补充"
parent: epic-release-evidence
covers: [R3, R4]
after: [3]
risk: medium
---

# 低置信度门禁与人工补充

## Description

实现低置信度门禁与人工补充输出，无代码证据或低于阈值的候选不产生自动化动作。

## Acceptance Criteria

Verify: 无证据 feature 被降级为人工补充或旁白，不会进入桌面自动化。

## References

- parent — _bmad-output/initiative-showcraft-release-video-mvp/epic-release-evidence/epic-release-evidence.md
- plan — _bmad-output/initiative-showcraft-release-video-mvp/epic-release-evidence/story-confidence-gate-plan.md
- openspec/changes/showcraft-release-video-mvp/specs/code-evidence-discovery/spec.md
- openspec/changes/showcraft-release-video-mvp/tasks.md#2-发布来源与代码证据
