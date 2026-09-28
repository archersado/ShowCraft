---
title: '建立领域 Schema 与稳定序列化合同'
type: 'feature'
ticket: '2'
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

**Problem:** Story 1.1 的 mock tracer 只有内部 TypeScript 类型，无法拒绝不完整或非法的跨阶段数据，也没有可由后续 source、desktop、render 与 review adapter 共同依赖的稳定 JSON 合同。

**Approach:** 在 `@showcraft/core` 中引入运行时 Schema，统一定义 release brief、evidence pack、scene plan、render manifest 以及技术 run/业务 review 状态；提供确定性的 JSON 序列化与反序列化入口，并让既有 mock tracer 使用这些合同。

## Boundaries & Constraints

**Always:** Schema 必须在运行时校验并导出推导后的 TypeScript 类型；release 必须至少有一个 feature；枚举状态、置信度范围、ID 和关联关系必须可诊断地验证；同一领域对象必须稳定序列化、反序列化后保持等价；错误应给出字段路径或可读原因。

**Never:** 不实现文件化 run store、状态迁移器、provider ports、CLI 参数、真实 Changelog/Git/桌面/TTS/Remotion/HTTP adapter；不把低置信度门禁或业务流程逻辑提前塞入 Schema；不改变 CLI 现有 demo 的文件名和 completed 输出语义。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| 合法领域对象 | 含一个 feature 的 release、与其关联的 evidence/scene/manifest/run | runtime parse 成功；stable JSON 可 parse 回等价对象 | 无错误 |
| 不完整 release | 缺版本、feature 或 feature 为空 | release parse 失败 | 返回包含字段路径的诊断 |
| 非法关联或状态 | 不存在的 featureId、置信度超出 0–1、未知 run/review status | 相应 Schema parse 失败 | 不产生被接受的领域对象 |
| 技术完成待审核 | `completed` run 与 `pending_review` review | 两个独立状态均可合法序列化 | 不将 pending review 伪装为 approved |

</frozen-after-approval>

## Code Map

- `packages/core/src/tracer.ts` -- 当前固定 mock 数据和临时类型；用新领域类型/Schema 校验 tracer 输出，但保持其无 Node I/O 的性质。
- `packages/core/src/index.ts` -- core 的公共导出入口；新增 Schema、类型和序列化函数的唯一公开出口。
- `packages/core/src/tracer.test.ts` -- 已验证 mock release → manifest → run；扩展为验证 tracer 产物符合正式合同。
- `packages/cli/src/main.ts` -- 只将 tracer 结果写为 JSON；不改动其文件系统责任或 CLI 行为。
- `openspec/changes/showcraft-release-video-mvp/design.md` -- 领域合同与技术 run/业务审核状态独立的权威设计。
- `openspec/changes/showcraft-release-video-mvp/tasks.md` -- 本 Story 对应 1.2；1.3 的编排/run store 保持未完成。
- `package.json`, `pnpm-lock.yaml` -- 新增并锁定 Zod 运行时 Schema 依赖。

## Tasks & Acceptance

**Execution:**
- [ ] `package.json`, `pnpm-lock.yaml` -- 增加并锁定运行时 Schema 库，避免只依赖 TypeScript 编译期类型。
- [ ] `packages/core/src/domain.ts` -- 定义并导出 release brief、feature、source mapping、evidence pack/entrypoint、scene plan、render manifest、run record 与 review decision 的 Zod Schema 和推导类型；在对象间执行必要的 feature 关联校验。
- [ ] `packages/core/src/serialization.ts` -- 提供按对象键稳定排序的 JSON 输出，以及接收 Schema 的 parse/round-trip 工具，使文件化存储可在 Story 1.3 直接复用。
- [ ] `packages/core/src/index.ts`, `packages/core/src/tracer.ts` -- 公开领域合同并将 mock tracer 重写为正式 Schema 可接受的数据，不引入 provider 或 I/O。
- [ ] `packages/core/src/domain.test.ts`, `packages/core/src/serialization.test.ts`, `packages/core/src/tracer.test.ts` -- 覆盖合法 round-trip、空 feature/缺字段/非法状态与置信度、关联错误、独立 review 状态和 tracer 合同回归。

**Acceptance Criteria:**
- Given 任一合法 release/evidence/scene/manifest/run/review 对象，when 以对应 Schema parse 并稳定序列化再 parse，then 得到等价的领域对象和一致 JSON 字节序列。
- Given 缺少必填字段、空 feature 数组、非法枚举或超出范围的置信度，when 调用 safe parse，then 返回失败且问题指向相应字段路径。
- Given evidence、scene 或 manifest 引用不存在的 feature，when 组合成领域对象，then 关联校验拒绝该对象。
- Given technical run 为 `completed` 而 review 为 `pending_review`，when 序列化并反序列化，then 两个状态均被保留且不转为 `approved`。
- Given 既有 `pnpm demo`，when 生成 mock 产物，then 仍输出相同三个文件并通过正式 Schema 验证。

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Design Notes

Schema 分为两层：单体对象 Schema 负责局部字段和枚举，聚合对象 Schema 负责 `featureId` 的跨对象引用。稳定序列化递归排序 plain object 键，不重排数组，从而保留镜头和特性原有业务顺序。技术状态与审核状态作为不同字段/对象建模，避免技术成功被误解为业务可交付。

## Verification

**Commands:**
- `pnpm install --frozen-lockfile` -- expected: lockfile 与运行时 Schema 依赖可复现安装。
- `pnpm lint` -- expected: 新增 core 源码与测试满足 lint 规则。
- `pnpm typecheck` -- expected: Schema 推导类型和 mock tracer 无 TypeScript 错误。
- `pnpm test` -- expected: Schema、稳定序列化、关联校验与既有 CLI 回归测试全部通过。
- `pnpm demo -- --output /private/tmp/showcraft-schema-demo` -- expected: 生成的三个 JSON 仍可被 core Schema 解析。
- `openspec validate showcraft-release-video-mvp --strict` -- expected: OpenSpec 结构校验继续通过。
