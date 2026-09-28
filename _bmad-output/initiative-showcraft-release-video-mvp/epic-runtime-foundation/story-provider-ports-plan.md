---
title: '实现 Provider Ports 与核心编排器'
type: 'feature'
ticket: '4'
created: '2026-09-28'
status: built
route: 'full'
route_source: 'auto'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
context:
  - 'openspec/changes/showcraft-release-video-mvp/design.md'
  - 'openspec/changes/showcraft-release-video-mvp/tasks.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** mock tracer 的固定流程与 CLI 耦合：阶段顺序、产物构造都写死在 `createMockTracerResult` 中，无法替换任一 provider，也无法让失败沿阶段传播到 run store。

**Approach:** 在 `@showcraft/core` 定义最小 provider ports（release source、scene planner、renderer）与 `Orchestrator`：按阶段调用 ports、经 run store 登记产物、失败时以 `failure.stage`/`reason` 落盘；CLI 装配 mock adapters 驱动既有 demo。

## Boundaries & Constraints

**Always:** ports 定义在 core 且不依赖 Node I/O；每个阶段产物必须经 RunStoreCore 登记并过 Schema；任一 provider 抛错时编排器捕获并把阶段名与原因写入 run 记录；已成功阶段的产物保留；CLI 负责所有 fs 操作。

**Never:** 不定义 StartUpOS/Edge TTS/Remotion/HTTP 真实 adapter；不实现 DesktopRunner/ReviewStore 的可执行逻辑（Epic 3/5 范围，本次不引入这两个 port）；不改变 `pnpm demo` 的输出文件名（release/scene/manifest/run）与 `completed` 语义；不引入配置系统、并发或重试逻辑。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| 全部 mock 成功 | 注入三个 mock providers | run 完成，四文件齐全，状态 `completed` | 无错误 |
| source 失败 | release port 抛错 | run 状态 `failed`，`failure.stage="release"`，目录仍创建且 `run.json` 写入 | 已有产物保留 |
| planner/renderer 失败 | 后续阶段抛错 | 前阶段产物保留，`failure.stage` 指向该阶段 | 不清空 run 目录 |
| 非法产物 | provider 返回缺 feature 的 release | 产物被 Schema 拒绝，阶段失败带字段路径 | 不写入非法文件 |

</frozen-after-approval>

## Code Map

- `packages/core/src/runStore.ts` -- Story 1.3 的 RunStoreCore；编排器按阶段调用其 recordArtifact/fail。
- `packages/core/src/ports.ts` -- 新建：`ReleaseSourcePort`、`ScenePlannerPort`、`RendererPort` 类型与 mock 实现。
- `packages/core/src/orchestrator.ts` -- 新建：阶段驱动循环，注入 ports 与 RunStoreCore，失败诊断传播。
- `packages/core/src/tracer.ts` -- mock 数据构造迁往 ports mock 实现；tracer 保留为兼容导出或移除（保持 demo 行为不变为限）。
- `packages/cli/src/main.ts` -- 装配 mock ports + Orchestrator + RunStoreCore；CLI 行为与文件输出不变。
- `openspec/changes/showcraft-release-video-mvp/design.md` -- ports-and-adapters 编排的权威设计。

## Tasks & Acceptance

**Execution:**
- [ ] `packages/core/src/ports.ts` -- 定义三个 provider ports（输入/输出均为领域对象）与 `createMock*` 实现；mock 数据从 tracer 迁入。
- [ ] `packages/core/src/orchestrator.ts` -- 实现 `runPipeline(ports, store)`：release → scenePlan → manifest 阶段循环，异常映射为 `fail(stage, reason)`。
- [ ] `packages/cli/src/main.ts` -- demo 改为装配 ports 与编排器；输出与现状一致。
- [ ] `packages/core/src/orchestrator.test.ts`, `packages/cli/src/orchestrator.test.ts` -- 覆盖可替换 provider、成功链路、每阶段注入失败、非法产物拒绝。

**Acceptance Criteria:**
- Given 全部 mock providers，when 编排器运行，then 产生与现有 demo 等价的四文件 run。
- Given 任一阶段 provider 抛错，when 编排器捕获，then run 记录 `failure.stage` 为该阶段且此前产物完整保留。
- Given provider 返回缺 feature 的 release，when 登记，then Schema 拒绝且 run 以该阶段失败。
- Given 替换任一 port 为自定义 fake，when 运行，then 无需改动 core 其余代码即可生效。

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Design Notes

只引入当前 mock 链路需要的三个 ports（release source、scene planner、renderer）；DesktopRunner/ReviewStore 留给 Epic 3/5，避免空转接口。编排器不做重试与配置门禁——置信度门禁属于 Epic 2 evidence 流程。阶段名与 RunStage 对齐，失败诊断直接复用 1.3 的 failure 字段。

## Verification

**Commands:**
- `pnpm lint` -- expected: 新增 ports/orchestrator 源码与测试满足 lint 规则。
- `pnpm typecheck` -- expected: 无 TypeScript 错误。
- `pnpm test` -- expected: 编排器、故障注入与既有回归测试全部通过。
- `pnpm demo -- --output /private/tmp/showcraft-orchestrator-demo` -- expected: 输出与现状一致的四个文件且 Schema 可解析。
- `openspec validate showcraft-release-video-mvp --strict` -- expected: OpenSpec 结构校验继续通过。
