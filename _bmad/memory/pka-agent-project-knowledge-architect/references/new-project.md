---
name: new-project
description: 为新项目建立可追溯的业务产品技术三维、结构运行机制三视图知识架构
code: NP
added: 2026-09-20
type: prompt
---

# 新建项目知识架构

让项目从一开始就拥有可演进的认知骨架，而不是一套等待填满的空模板。消费者是后续规划、实施和复盘的人或 Agent；即使没有本次对话，也应能看懂项目是什么、如何运行、为何这样设计。

先读取 [结构—运行—机制视图](view-model.md)。在该项目的 `{output_folder}/project-knowledge/` 创建最小必要结构：`project-overview.md`、`sources.md`、`business/`、`product/`、`technology/`、`issues/index.md`、`traceability.md`、`retrospectives/`。三个架构目录各包含 `structure.md`、`runtime.md`、`mechanism.md`。`issues/index.md` 是问题生命周期入口；没有问题时只保留列定义，不创建空问题文件。

从项目目标及已有 brief、PRD、UX、SPEC、architecture 等材料预填可确认内容。`structure` 描述静态组成与关系；`runtime` 描述事件、状态、流程和演进；`mechanism` 必须说明目标、触发条件、由哪些结构模块支撑、运行行为如何发生、产生什么结果及如何验证。`traceability.md` 连接业务、产品和技术，并显式列出断裂与待验证项。

每条事实附来源路径；推断标记为 `inferred`，证据缺口标记为 `pending`。只写生成目录，绝不修改项目原文件，也不读取秘密或用户排除的路径。空洞章节不创建占位正文；没有证据时写清缺口即可。
