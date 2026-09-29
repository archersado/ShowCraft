---
title: '核心骨架 Refactor Sweep'
type: 'chore'
ticket: '5'
created: '2026-09-29'
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

**Problem:** Stories 1.1–1.4 各自快速交付后，core 中留下了演进残留：已被 ports 取代的 `tracer.ts` 仍作为公共导出、mock 数据与测试夹具在多个测试文件中重复定义、`Scene[]` 构造逻辑在 tracer 与 mock scene planner 中各有一份。

**Approach:** 移除 legacy tracer 路径（其行为已由 ports + orchestrator 等价覆盖），把公共 mock 数据与 pipeline 夹具收敛到 `testing.ts`，统一测试引用；不改变任何运行时行为。

## Boundaries & Constraints

**Always:** 公共 API 面只减不增（删除 tracer 导出，不新增运行时导出）；`build`、`typecheck`、`lint`、`test` 全部通过；demo 输出文件与语义不变；夹具去重后所有测试仍覆盖相同断言。

**Never:** 不引入新功能、新依赖或新 provider；不改 Schema 定义、状态机或编排器语义；不改 CLI 行为；不删除仍被引用的能力。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| 全量验证 | refactor 后 workspace | lint/typecheck/test/demo 全绿 | 任何回归即失败 |
| 旧 API 消费者 | 引用 `createMockTracerResult` 的代码 | 迁移到 ports 夹具后无引用残留 | tsc 拒绝已删除导出 |
| 夹具去重 | 多测试文件重复的 release/scene 构造 | 单一 `testing.ts` 来源 | 语义与原夹具等价 |

</frozen-after-approval>

## Code Map

- `packages/core/src/tracer.ts`, `packages/core/src/tracer.test.ts` -- 删除；其等价物在 `ports.ts`（mock 数据）与 `testing.ts`（夹具）。
- `packages/core/src/testing.ts` -- 新建：`mockRelease`、`mockPorts()`、`buildMockRunFiles()` 共享夹具（仅测试可 import，不进 index.ts 公共面）。
- `packages/core/src/index.ts` -- 移除 tracer 导出。
- `packages/cli/src/runStore.test.ts` 等 -- 改用共享夹具，删除各文件内重复定义。
- `openspec/changes/showcraft-release-video-mvp/design.md` -- 模块边界仍是权威；本次只是执行清理。

## Tasks & Acceptance

**Execution:**
- [ ] `packages/core/src/testing.ts` -- 收敛共享 mock 夹具。
- [ ] `packages/core/src/tracer.ts`, `packages/core/src/tracer.test.ts`, `packages/core/src/index.ts` -- 删除 legacy tracer 及其导出。
- [ ] `packages/core/src/*.test.ts`, `packages/cli/src/*.test.ts` -- 测试改用共享夹具，去除重复定义。
- [ ] 全量验证命令通过。

**Acceptance Criteria:**
- Given refactor 完成，when 运行 build/typecheck/lint/test/demo，then 全部通过且 demo 输出与 1.4 一致。
- Given core 依赖图，when 检查 imports，then 不存在具体外部 provider（仅 zod 运行时依赖）。
- Given 测试文件集合，when 检查夹具定义，then 无重复的 mock release/scene 构造。

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Design Notes

tracer 是 1.1 的 tracer bullet，其职责已被 1.2 Schema、1.4 ports/orchestrator 完全取代；保留会造成两份 mock 数据源头漂移。`testing.ts` 不从 `index.ts` 导出，保持公共 API 面干净——测试通过相对路径引用。

## Verification

**Commands:**
- `pnpm lint` -- expected: 通过。
- `pnpm typecheck` -- expected: 通过，无对已删除导出的引用。
- `pnpm test` -- expected: 全部通过，覆盖面不减。
- `pnpm demo -- --output /private/tmp/showcraft-sweep-demo` -- expected: 输出与 1.4 一致的四个文件。
- `openspec validate showcraft-release-video-mvp --strict` -- expected: 通过。
