---
title: '建立 Workspace 与 mock CLI tracer'
type: 'feature'
ticket: '1'
created: '2026-09-28'
status: 'built'
baseline_revision: 'NO_VCS'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: ['blind-hunter', 'edge-case-hunter', 'verification-gap', 'intent-alignment']
review_loop_iteration: 0
context:
  - 'openspec/changes/showcraft-release-video-mvp/proposal.md'
  - 'openspec/changes/showcraft-release-video-mvp/design.md'
  - 'openspec/changes/showcraft-release-video-mvp/tasks.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** ShowCraft 目前只有规划工件，尚无可安装、可检查或可运行的产品骨架。因此后续 Changelog、桌面、TTS 和渲染 adapter 无法在统一边界内增量交付，也没有可验证的最小端到端路径。

**Approach:** 建立 pnpm TypeScript monorepo，以 `core` 承载无外部依赖的 mock tracer，以 `cli` 装配它；demo 命令将固定示例 release 转换为 mock manifest 和 `completed` run 状态，并输出到被 Git 忽略的本机 run 目录。

## Boundaries & Constraints

**Always:** 使用 Node 24 与 pnpm workspace；提供根级 `build`、`typecheck`、`test`、`demo` 命令；demo 必须无需凭据、网络、StartUpOS 或桌面应用即可完成；产物必须是可检查的 JSON，且 CLI 输出其目录和最终状态。

**Never:** 不实现生产 schema、文件化 run store、真实 provider ports、Changelog/Git/桌面/TTS/Remotion/HTTP adapter，亦不读取 StartUpOS 或任意用户凭据；不把 mock tracer 当作后续领域合同的替代品。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Happy path | `pnpm demo` 与可写的默认 `runs/` 目录 | 生成包含 `release.json`、`manifest.json`、`run.json` 的新 run 目录，run 状态为 `completed` | 不依赖网络或外部进程 |
| Custom output | `pnpm demo -- --output <path>`，路径可创建 | 在指定路径下创建单独 run 目录并打印绝对路径 | 创建目录失败时 CLI 以非零状态退出并输出原因 |
| Regression check | 干净安装后的 workspace | build、typecheck 与 test 可执行 | 编译或测试失败必须返回非零状态 |

</frozen-after-approval>

## Code Map

- `openspec/changes/showcraft-release-video-mvp/proposal.md` -- MVP 的能力边界；本 Story 仅提供后续能力共享的本机、无凭据起点。
- `openspec/changes/showcraft-release-video-mvp/design.md` -- 规定 core 与 CLI 的 ports-and-adapters 方向和文件化 run 的长期目标；本次仅实现 mock tracer，不引入真实 adapter。
- `openspec/changes/showcraft-release-video-mvp/tasks.md` -- OpenSpec 任务 1.1 是本 Story 的完成范围；1.2/1.3 保持未完成。
- `_bmad-output/initiative-showcraft-release-video-mvp/epic-runtime-foundation/epic-runtime-foundation.md` -- E1/E3 与 mock-only 边界的权威来源。
- `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json` -- 新建根级 workspace、脚本和共享 TypeScript 配置；仓库尚无可复用代码。
- `packages/core/src/tracer.ts` -- 新建最小、内部专用的 mock pipeline 与 JSON 产物构造；不得提前暴露生产领域 schema。
- `packages/cli/src/main.ts` -- 新建 CLI 参数解析、输出目录创建、tracer 调用与稳定终端输出。
- `packages/core/src/tracer.test.ts`、`packages/cli/src/main.test.ts` -- 新建无外部依赖的单元/集成测试。

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore` -- 建立 pnpm monorepo、根级 build/typecheck/test/demo 命令、共享严格 TypeScript 配置和 `runs/` 忽略规则，使新克隆环境有一致入口。
- [x] `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/tracer.ts` -- 实现仅供 demo 使用的固定 release → mock manifest → completed run tracer，并把 JSON 内容以纯数据返回，保持 core 无 Node I/O 与真实依赖。
- [x] `packages/cli/package.json`, `packages/cli/tsconfig.json`, `packages/cli/src/main.ts` -- 实现 `demo` 可调用的 Node CLI，支持可选 `--output`、创建唯一 run 目录、写入三个命名 JSON 文件，并在写入错误时非零退出。
- [x] `packages/core/src/tracer.test.ts`, `packages/cli/src/main.test.ts` -- 覆盖 tracer 输出语义、默认输出和自定义输出目录，以及无法创建输出目录的失败结果，防止未来 adapter 工作破坏最小路径。
- [x] `README.md` -- 说明所需 Node/pnpm 版本、安装、四个根级命令、demo 产物和本 Story 明确未实现的真实能力。

**Acceptance Criteria:**
- Given 新克隆仓库且已安装依赖，when 运行 `pnpm build`、`pnpm typecheck` 与 `pnpm test`，then 三个命令都以零状态结束。
- Given 默认本机环境，when 运行 `pnpm demo`，then CLI 输出一个绝对 run 路径，且该目录包含合法 JSON 的 `release.json`、`manifest.json`、`run.json`，其中 run 状态为 `completed`。
- Given 可创建的自定义输出路径，when 运行 `pnpm demo -- --output <path>`，then 三个产物写入该路径下新建的 run 目录而非仓库追踪文件。
- Given 输出路径不可创建或不可写，when CLI 尝试执行 demo，then CLI 返回非零状态并报告可读错误，不产生 `completed` run。
- Given Story 1.1 完成，when 搜索 core 依赖，then 不存在 StartUpOS、Edge TTS、Remotion、HTTP server 或真实 provider adapter 的导入。

## Implementation Notes

- 2026-09-28: 根 workspace 使用 pnpm 12、TypeScript、Vitest 和 tsx；`pnpm-workspace.yaml` 明确批准 esbuild 的安装构建脚本，以使干净安装可复现。
- 2026-09-28: mock tracer 保持 core 纯数据，CLI 独占 Node 文件系统写入；CLI 接受 pnpm 传入的可选 `--` 分隔符。
- 2026-09-28: 审阅后新增 ESLint 根命令；run 目录拒绝复用或路径逃逸，且按 release、manifest、run 的顺序写入，避免失败时留下伪 completed 状态。

## Plan Change Log

## Review Triage Log

- 2026-09-28 — blind-hunter: **medium / patch** — 根级缺少 lint 命令，偏离 OpenSpec 1.1 的共享 lint/test/typecheck 要求；已新增 ESLint 配置、依赖与 `pnpm lint`，命令已通过。
- 2026-09-28 — blind-hunter: **false** — `@showcraft/core` 尚未导出可直接由 Node 执行的 `dist` 并不破坏本 Story；包为 private，已验证的用户入口是根级 `pnpm demo`，并非发布后的编译包运行时。
- 2026-09-28 — blind-hunter: **false** — private workspace package 没有 `bin` 入口不违反已批准的根级 `pnpm demo` CLI 目标；发布型 CLI 留待后续产品化决策。
- 2026-09-28 — blind-hunter: **medium / patch** — 并行写入可能在其他产物失败时留下 completed run；已改为 release、manifest、run 顺序写入，run 状态只在前置产物写入成功后落盘。
- 2026-09-28 — blind-hunter: **medium / patch** — `mkdir(..., recursive)` 会复用同名 run；已先创建 root、再以非 recursive 模式创建 run，且回归测试覆盖碰撞拒绝。
- 2026-09-28 — blind-hunter: **low / patch** — 测试辅助入口可用绝对或 traversal runId 逃出 output root；已拒绝非单段 run ID，并加入回归测试。
- 2026-09-28 — blind-hunter: **low / rejected** — 未注入模拟磁盘写入失败的测试；顺序写入已消除伪 completed 状态，而为极低频磁盘错误新增测试专用 I/O 抽象会超出该 tracer 的最小边界。
- 2026-09-28 — blind-hunter: **medium / patch** — 原测试只调用导出的 helper，未验证根命令；已以子进程运行实际 `pnpm demo` 并断言输出目录、完成状态和产物。
- 2026-09-28 — blind-hunter: **false** — custom output 与默认路径使用同一写入实现；默认路径已解析并断言三个 JSON，custom output 额外断言产物落在指定目录，无独立实现分支可导致其格式分歧。
- 2026-09-28 — blind-hunter: **medium / patch** — 原产物测试仅作字符串包含判断；已解析三个 JSON 并断言版本、manifest 引用和 completed 状态。
- 2026-09-28 — edge-case-hunter: **medium / patch** — completed run 在其他写入失败后可见；与 blind-hunter 同一根因，已用顺序写入修复。
- 2026-09-28 — edge-case-hunter: **medium / patch** — run ID 碰撞可复用既有目录；与 blind-hunter 同一根因，已用非 recursive 创建与碰撞测试修复。
- 2026-09-28 — edge-case-hunter: **low / patch** — runId 路径逃逸；与 blind-hunter 同一根因，已做单段 ID 校验并测试。
- 2026-09-28 — verification-gap: **medium / patch** — 缺少真实根 CLI 调用的验证；已新增 `pnpm demo` 子进程测试。
- 2026-09-28 — verification-gap: **medium / patch** — 缺少 JSON 有效性验证；已解析并断言所有默认产物。
- 2026-09-28 — intent-alignment: **false** — 审计指出测试初始时停留在模块边界；上述根命令和 JSON 合同测试已将验证提升到已批准的可观察 CLI 边界，未发现额外偏离。

## Design Notes

mock tracer 是故意短命的垂直切片：它验证包边界、命令入口和产物契约形状，但不声明可被后续 Epic 依赖的领域模型。Story 1.2 将用运行时 schema 替换其内部数据，Story 1.3 再把写入与状态迁移抽到正式 run store。

## Verification

**Commands:**
- `pnpm install` -- expected: 安装 workspace 依赖并生成可复现的 `pnpm-lock.yaml`；后续干净安装可使用 `pnpm install --frozen-lockfile`。
- `pnpm build` -- expected: core 与 CLI 均产出无 TypeScript 编译错误的构建结果。
- `pnpm typecheck` -- expected: 所有 workspace 包在不输出文件的检查下通过。
- `pnpm test` -- expected: mock tracer、CLI 输出和错误路径测试通过。
- `pnpm demo` -- expected: 打印绝对 run 路径与 `completed`，该路径中的三个 JSON 可被 `jq` 读取。
- `openspec validate showcraft-release-video-mvp --strict` -- expected: 实现后 OpenSpec 变更仍通过严格结构校验。
