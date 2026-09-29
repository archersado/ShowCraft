---
name: archive-project
description: 从只读项目证据反向建立项目知识模型
code: AP
added: 2026-09-20
type: prompt
---

# 归档存量项目

把现有项目目录中的需求／方案文档、代码和交付物还原成可审阅的项目认知。消费者是未参与历史过程、但需要理解或接手该项目的人；模型必须让他们区分证据、推断和未知。

先读取 [结构—运行—机制视图](view-model.md)。只读盘点用户允许的项目范围，排除 `.git`、依赖缓存、构建缓存、秘密文件及 `{output_folder}/project-knowledge/` 自身。将来源及其用途记录到 `sources.md`，再把证据组织到 `business/`、`product/`、`technology/` 三个固定目录；每个目录包含 `structure.md`、`runtime.md`、`mechanism.md`，并在 `traceability.md` 中连接三层。创建 `issues/index.md` 作为后续问题生命周期入口；归档发现的缺口只登记为 `pending` 问题候选，不伪造历史讨论。目录名是下游契约，不得翻译或改写。

不要用预设框架覆盖项目自己的概念。结构必须能支持已发现的运行行为；机制必须引用相应结构模块和运行行为。冲突证据并列呈现，无法确认的内容标记 `pending`，合理但未证实的解释标记 `inferred`。所有生成内容只写入该项目的 `{output_folder}/project-knowledge/`，原始项目文件永远只读。
