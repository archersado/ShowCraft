---
title: 'Core 端到端测试'
type: 'feature'
ticket: '6'
created: '2026-09-29'
status: ready-for-dev
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

**Problem:** 1.1–1.5 的验证都是模块内单测或单点故障注入；尚无把 ports → orchestrator → run store → CLI 落盘串成一条链、对成功产物集合与逐 provider 故障后的可追溯行为做整体锁定的端到端测试。

**Approach:** 新增跨模块端到端测试（core 内存链路 + CLI 临时目录落盘两层），锁定成功 run 的完整产物集合与字节级稳定输出，并逐一注入每个 provider 的失败验证状态、诊断与产物保留规则。

## Boundaries & Constraints

**Always:** 端到端测试必须走真实编排器与 run store（不 mock store 内部）；CLI 层测试写临时目录并在用例后清理；失败注入逐 provider 独立验证 `failure.stage`、`failure.reason` 与保留产物；测试断言产物可通过核心 Schema 反向解析。

**Never:** 不引入新依赖、新运行时功能或对 core 私有内部的白盒断言；不改变任何模块行为或公共 API；不测试 Epic 2+ 的 provider（evidence/desktop/TTS/render）。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| 成功端到端 | mock ports 全部成功 | CLI 落盘四文件，`run.json` 为 `completed` 且 artifacts 齐全，产物反解通过 Schema | 无错误 |
| 字节稳定 | 相同输入跑两次 | 四文件字节完全一致 | 差异即失败 |
| source 失败端到端 | release port 抛错 | `run.json` 落盘为 `failed`，`failure.stage="release"`，无其他产物文件 | 保留 run.json |
| planner/renderer 失败端到端 | 对应 port 抛错 | 前序产物文件在盘上保留，`failure.stage` 归因正确 | 不删除任何已写文件 |
| 非法产物端到端 | provider 返回空 features | 非法文件不落盘，run 记录失败并含字段路径 | 不产生损坏 JSON |

</frozen-after-approval>

## Code Map

- `packages/core/src/testing.ts` -- 1.5 的共享夹具；端到端测试复用，不重复定义。
- `packages/core/src/e2e.test.ts` -- 新建：core 内存端到端（ports → orchestrator → store），逐 provider 失败注入。
- `packages/cli/src/e2e.test.ts` -- 新建：CLI 落盘端到端（临时目录），成功产物集合与失败保留规则。
- `packages/cli/src/main.ts`, `packages/cli/src/runStore.ts` -- 只作为被测装配层；不为测试改动行为。
- `openspec/changes/showcraft-release-video-mvp/design.md` -- 失败保留产物与 run 可追溯性的权威语义。

## Tasks & Acceptance

**Execution:**
- [ ] `packages/core/src/e2e.test.ts` -- 内存端到端：成功链路产物集合、逐 provider 失败的状态/诊断/保留、非法产物拒绝。
- [ ] `packages/cli/src/e2e.test.ts` -- 落盘端到端：临时目录真实写盘、字节稳定、失败后部分产物在盘、Schema 反解。
- [ ] 全量验证命令通过。

**Acceptance Criteria:**
- Given mock ports 全部成功，when 端到端运行并落盘，then run 目录含 release/scene/manifest/run 四文件且均可被核心 Schema 解析。
- Given 相同输入两次运行，when 比较字节，then 四文件逐字节相同（runId 固定时）。
- Given 每个 provider 分别抛错，when 端到端运行，then `failure.stage` 精确归因、此前产物完整保留、`run.json` 始终落盘。
- Given provider 返回空 features 的 release，when 端到端运行，then 不落盘非法 release.json 且 run 以 release 阶段失败。

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Design Notes

端到端测试是行为锁而非功能开发：只消费 1.4/1.5 已交付的公共 API 与 CLI 入口，禁止白盒断言内部状态，为 Epic 2+ 替换真实 adapters 提供回归安全网。CLI 层用临时目录 + afterEach 清理，沿用既有测试约定。

## Verification

**Commands:**
- `pnpm lint` -- expected: 通过。
- `pnpm typecheck` -- expected: 通过。
- `pnpm test` -- expected: 新端到端用例与既有回归全部通过。
- `pnpm demo -- --output /private/tmp/showcraft-e2e-demo` -- expected: 输出与 1.5 一致。
- `openspec validate showcraft-release-video-mvp --strict` -- expected: 通过。
