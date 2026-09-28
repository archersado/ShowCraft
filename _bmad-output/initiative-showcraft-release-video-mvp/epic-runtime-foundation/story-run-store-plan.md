---
title: '实现文件化 Run Store 与阶段持久化'
type: 'feature'
ticket: '3'
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

**Problem:** Story 1.2 已交付领域 Schema 与稳定序列化，但 run 产物仍由 CLI 一次性写出；没有按阶段持久化、状态迁移与错误诊断的 run store，Story 1.4 的编排器无法在失败时保留已完成产物并记录失败阶段。

**Approach:** 在 `@showcraft/core` 新增无 Node I/O 的 run store 核心逻辑（阶段状态机 + 产物登记 + 诊断），由 CLI 承担文件写入装配；失败阶段保留此前产物并写入可诊断的失败 run 记录。

## Boundaries & Constraints

**Always:** run 目录内逐阶段写入 `release.json`、`evidence.json`（可选）、`scene.json`（可选）、`manifest.json`、`run.json`；run 记录必须携带 `runId`、`status` 与失败时的 `failure.stage`/`failure.reason`；状态只能沿 `pending → running → completed|failed` 单向迁移；文件写入使用 Story 1.2 的稳定序列化字节；失败绝不删除或清空已写入产物。

**Never:** 不实现 provider ports、编排器、真实 Changelog/Git/桌面/TTS/Remotion/HTTP adapter；不改变 `pnpm demo` 既有输出文件名与 `completed` 语义；不引入数据库或并发锁；不做任意业务审核逻辑（review 仍只是独立 Schema 字段）。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| 成功 run | 依次登记 release/manifest 产物并标记各阶段完成 | run 目录含全部阶段文件，`run.json` 状态 `completed` | 无错误 |
| 阶段中途失败 | manifest 阶段抛出诊断 | 已写入的 `release.json` 保留；`run.json` 状态 `failed` 且含 `failure.stage`/`reason` | 不删除任何已存在文件 |
| 非法状态迁移 | 对 `completed` run 再次 `start` 或回退 | 迁移被拒绝并给出可诊断错误 | run 状态不变 |
| 重复创建 run | 同一 run 目录已存在 | 拒绝覆盖已存在的 run 目录 | 报告路径与原因 |
| 产物校验失败 | 登记的产物未通过对应 Schema | 该产物不写入，阶段失败带字段路径诊断 | 已有产物保持不变 |

</frozen-after-approval>

## Code Map

- `packages/core/src/serialization.ts` -- Story 1.2 的稳定序列化与 Schema parse 工具；run store 直接复用，不重复实现。
- `packages/core/src/domain.ts` -- run record/status/failure Schema；store 的状态迁移以 `runStatusSchema` 枚举为准。
- `packages/core/src/runStore.ts` -- 新建：`RunStoreCore` 状态机（create/record/persist/fail），纯逻辑、无 fs 依赖，返回待写字节与诊断。
- `packages/core/src/runStore.test.ts` -- 新建：状态迁移、故障注入、产物保留、Schema 校验失败的单元测试。
- `packages/cli/src/runStore.ts` -- 新建：fs 装配层，把 `RunStoreCore` 的输出落盘到 run 目录。
- `packages/cli/src/main.ts` -- demo 改为经 run store 写三个文件，保持文件名与 `completed` 输出语义不变。
- `openspec/changes/showcraft-release-video-mvp/design.md` -- 文件化 run 与“失败保留产物”决策的权威来源。

## Tasks & Acceptance

**Execution:**
- [ ] `packages/core/src/runStore.ts` -- 实现阶段化 run store 核心：创建 run、按阶段登记 Schema 校验过的产物、`pending → running → completed|failed` 迁移与失败诊断，纯逻辑无 Node I/O。
- [ ] `packages/cli/src/runStore.ts` -- 实现 fs 装配：把核心输出的稳定 JSON 字节写入 run 目录，目录已存在时拒绝覆盖。
- [ ] `packages/cli/src/main.ts` -- demo 链路改经 run store；输出文件名、`completed` 状态与终端输出保持不变。
- [ ] `packages/core/src/runStore.test.ts`, `packages/cli/src/runStore.test.ts` -- 覆盖成功 run、阶段失败保留产物、非法迁移拒绝、重复创建拒绝与 demo 回归。

**Acceptance Criteria:**
- Given 依次登记合法产物，when run 完成，then run 目录含全部阶段文件且 `run.json` 为 `completed`，与既有 demo 输出等价。
- Given manifest 阶段注入失败，when run 结束，then `release.json` 仍在，`run.json` 状态 `failed` 且 `failure.stage` 指向 manifest 阶段并含可读原因。
- Given run 已 `completed`，when 再次启动或回退状态，then 迁移被拒绝且原状态不变。
- Given run 目录已存在，when 创建同名 run，then 拒绝并报告路径，不覆盖任何文件。

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Design Notes

核心/装配分层沿用 ports-and-adapters：`RunStoreCore` 只做状态与字节，CLI 做 fs——与 Story 1.4 编排器将 provider 注入 core 的方向一致。产物落盘前先过对应 Schema，避免把非法对象写进可审计产物。状态机只允许单向迁移，失败是终态之一；`failure` 复用 1.2 已定义的 `failure.stage`/`failure.reason` 字段。

## Verification

**Commands:**
- `pnpm lint` -- expected: 新增 run store 源码与测试满足 lint 规则。
- `pnpm typecheck` -- expected: run store 与 CLI 装配无 TypeScript 错误。
- `pnpm test` -- expected: 状态迁移、故障注入、产物保留与既有 CLI 回归测试全部通过。
- `pnpm demo -- --output /private/tmp/showcraft-runstore-demo` -- expected: 仍输出相同三个文件且可通过 core Schema 解析。
- `openspec validate showcraft-release-video-mvp --strict` -- expected: OpenSpec 结构校验继续通过。
