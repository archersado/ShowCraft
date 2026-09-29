---
title: '实现 CLI release 来源输入与安全解析'
type: 'feature'
ticket: '1'
created: '2026-09-29'
status: built
route: 'full'
route_source: 'auto'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
context:
  - 'openspec/changes/showcraft-release-video-mvp/specs/release-source-ingestion/spec.md'
  - 'openspec/changes/showcraft-release-video-mvp/design.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 当前 release brief 只能来自内置 mock；CLI 尚无 `--source` 输入能力，无法从本地 Markdown 或 GitHub URL 读取真实版本说明并校验来源安全性。

**Approach:** 在 core 新增 release source 解析模块（本地 Markdown 路径与 GitHub URL 两种来源，安全校验 + 按约定提取版本与 section），CLI 增加 `--source` 参数并装配真实文件读取；StartUpOS v0.3.3 changelog 作为首个验收样本。

## Boundaries & Constraints

**Always:** 只读访问来源文件；`--source` 指向本地 Markdown 文件时解析为结构化 section 列表；GitHub URL 仅做格式与可达性校验（真实抓取在后续 story）；拒绝目录、非 Markdown 文件、`.env` 类秘密文件与不存在路径，并给出可读原因；run 目录保存来源地址。

**Never:** 不解析 section 到 feature 的映射（2.2 范围）；不做 Git 证据检索（2.3 范围）；不写 StartUpOS 仓库任何文件；不读取其 `.env`、凭据或秘密文件；不实现网络抓取与缓存。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| 合法本地 Markdown | v0.3.3 changelog 路径 | 解析出版本号 `v0.3.3` 与 section 列表（感知与 IM 路由等） | 无错误 |
| 目录来源 | `--source <dir>` | 拒绝创建 run | 报告来源是目录 |
| 非 Markdown | `--source notes.txt` | 拒绝 | 报告仅支持 .md |
| 秘密文件 | `--source .env` | 拒绝 | 明确拒绝秘密文件 |
| 不存在路径 | `--source /no/such/file.md` | 拒绝 | 报告路径不存在 |
| GitHub URL | `--source https://github.com/o/r/blob/main/CHANGELOG.md` | 通过格式校验，解析为 URL 来源 | 非法 host/格式给出原因 |
| 无 --source | 不传参数 | 回退内置 mock release（demo 行为不变） | 无错误 |

</frozen-after-approval>

## Code Map

- `packages/core/src/releaseSource.ts` -- 新建：来源类型（local path / GitHub URL）、安全校验规则、Markdown 文本读取后的版本/section 提取（纯函数，fs 由 CLI 注入）。
- `packages/core/src/releaseSource.test.ts` -- 新建：v0.3.3 fixture 解析与全部拒绝路径单测。
- `packages/cli/src/main.ts` -- `--source` 参数解析与来源校验装配；无该参数时保持 mock 行为。
- `packages/cli/src/releaseSource.test.ts` -- 新建：端到端 `--source` 行为与拒绝路径。
- `/Users/archersado/workspace/startupOS/docs/changes/releases/v0.3.3/changelog.md` -- 只读验收样本；ShowCraft 不修改该仓库。
- `openspec/changes/showcraft-release-video-mvp/specs/release-source-ingestion/spec.md` -- 验收语义权威。

## Tasks & Acceptance

**Execution:**
- [ ] `packages/core/src/releaseSource.ts` -- 定义 `ReleaseSourceRef`（local/github）、安全校验（目录/扩展名/秘密文件/存在性）、GitHub URL 格式校验、Markdown section 提取（`## 标题` → section，首个 `# ` 标题中的版本号）。
- [ ] `packages/cli/src/main.ts` -- 增加 `--source <path|url>`；local 来源读取文件并经 core 解析，产出带 `source` 与版本的 release 数据结构（feature 映射留给 2.2，本 story 产出原始 sections）。
- [ ] 测试覆盖上表全部场景。

**Acceptance Criteria:**
- Given v0.3.3 changelog 路径，when `pnpm demo -- --source <path>`，then run 目录生成且来源与版本可追溯。
- Given 目录/.env/.txt/不存在路径，when 传入，then 拒绝且原因指明类别。
- Given 合法 GitHub URL，when 传入，then 格式校验通过。
- Given 不传 `--source`，when 运行 demo，then 行为与 1.6 完全一致。

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Design Notes

版本号取自 changelog 一级标题（`# OriginOS CE v0.3.3`），遵循 StartUpOS 约定。安全校验在 core 纯函数层做（对传入的 stats/内容判断），CLI 只做 fs 读取与装配，保持 ports-and-adapters。GitHub URL 本 story 仅格式校验，不下载数据——真实获取依赖网络，属于后续增强；产物追溯先由本地路径覆盖。

## Verification

**Commands:**
- `pnpm lint` / `pnpm typecheck` / `pnpm test` -- expected: 全部通过。
- `pnpm demo -- --source /Users/archersado/workspace/startupOS/docs/changes/releases/v0.3.3/changelog.md --output /private/tmp/showcraft-source-demo` -- expected: run 目录生成，release 来源为该路径、版本为 v0.3.3。
- `pnpm demo -- --source /Users/archersado/workspace/startupOS/.env --output /private/tmp/showcraft-source-demo` -- expected: 非零退出，报告秘密文件被拒绝。
- `openspec validate showcraft-release-video-mvp --strict` -- expected: 通过。
