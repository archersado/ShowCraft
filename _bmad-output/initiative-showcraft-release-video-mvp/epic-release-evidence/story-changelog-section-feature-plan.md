---
title: 'Changelog section 到 feature 映射'
type: 'feature'
ticket: '2'
created: '2026-09-29'
status: draft
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

**Problem:** Story 2.1 的 `createFileReleaseSource` 只把每个 section 变成占位 feature（id `section-N-slug`、旁白为 bullets 拼接），feature 与源段落之间没有建模的来源映射；`releaseFeatureSchema` 也没有任何来源字段。「每个 v0.3.3 feature 可回链原始段落与行号范围」的 2.2 验收语义既无法被 schema 校验，也不会出现在 run 产物中。

**Approach:** 在 `@showcraft/core` 新增 section→feature 归一化纯函数；`releaseFeatureSchema` 增加可选 `sourceRef` 子结构（`sectionIndex`/`sectionTitle`/`startLine`/`endLine`）承载 feature 级来源映射；CLI 用归一化函数替换占位映射。解析来源产生的 feature 必带完整 `sourceRef`，内置 mock release 不带该字段、行为保持不变；v0.3.3 changelog 作为回链验收样本。

## Boundaries & Constraints

**Always:** 每个 `##` section 严格归一化为一个 feature，保持文档顺序；feature id 沿用 `section-N-slug`（N 为 1-based section 序号），重复标题、纯 CJK 标题与空标题回退都不得产生 id 冲突或非法 id；由解析 section 产生的 feature 必须携带完整 `sourceRef`（行号区间来自 `parseReleaseDocument`）；无来源的 feature（内置 mock）不携带 `sourceRef` 且 schema 继续接受；schema 保持 strict——feature 对象未知字段拒绝，`sourceRef` 校验行号 ≥1 且 `endLine >= startLine`；归一化是 core 纯函数，fs 与装配留在 CLI。

**Never:** 不做 Git 证据检索（2.3 范围）；不实现低置信度门禁（2.4 范围）；不实现 GitHub 网络抓取；不改变无 `--source` 时 mock demo 的任何输出字节；不修改 `parseReleaseDocument` 的 section 解析与行号语义；不引入旁路映射表或额外映射文件；不新增配置项、重试或缓存；不写 StartUpOS 仓库任何文件。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| 合法多 section 文档 | v0.3.3 changelog（4 个 `##` section） | 4 个 feature 按文档顺序生成，id 依次为 `section-1-im`、`section-2-section`、`section-3-agent`、`section-4-section`，sourceRef 行号区间依次为 5–11、12–17、18–23、24–29 | 无错误 |
| 无 bullets 的 section | `## 标题` 后无列表行 | feature 照常生成；narration 回退为 section 标题；sourceRef 仍覆盖该段落 | 无错误 |
| 仅空 bullet 的 section | bullet 行内容为空白 | 空白 bullet 过滤后视同无 bullets，narration 回退标题 | 无错误 |
| 空标题 section | `## `（标题为空白） | title 与 `sourceRef.sectionTitle` 回退为「未命名段落」，feature 仍合法，不静默丢弃段落 | 无错误 |
| 重复标题 section | 两个同名 `##` 标题 | id 因序号 N 不同而唯一；`validateReleasePackageRelations` 的重复 id 检查兜底 | 无错误 |
| 零 section 文档 | 全文无 `##` 标题 | 归一化输出 `features: []`，releaseBriefSchema 以 min(1) 拒绝 | run 在 release 阶段失败，诊断含字段路径 |
| 无版本标题 | 一级标题无版本号 | version 回退文件名（2.1 既有行为），sourceRef 照常生成 | 无错误 |
| 内置 mock release | 无 `--source` | features 无 `sourceRef`，release.json 字节与 Story 1.6 完全一致 | 无错误 |
| 非法 sourceRef | endLine < startLine 或行号 < 1 | schema 拒绝该 feature | 诊断含字段路径 |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain.ts` -- 修改：新增 `featureSourceRefSchema`（strict + `endLine >= startLine` 校验）；`releaseFeatureSchema` 增加可选 `sourceRef` 并收紧为 `.strict()`；导出 `FeatureSourceRef` 类型。
- `packages/core/src/releaseMapping.ts` -- 新建：`normalizeSectionsToFeatures`（section→feature 归一化 + sourceRef 组装）与 `slugifyTitle`（从 CLI 迁入）；纯函数、无 I/O。
- `packages/core/src/releaseMapping.test.ts` -- 新建：覆盖 I/O 矩阵全部场景与 id 规则的单测。
- `packages/core/src/index.ts` -- 修改：导出 `normalizeSectionsToFeatures`、`slugifyTitle` 与 `FeatureSourceRef`。
- `packages/core/src/domain.test.ts` -- 修改：sourceRef 合法解析、缺省兼容、strict 未知键拒绝、非法行号拒绝。
- `packages/cli/src/main.ts` -- 修改：`createFileReleaseSource` 的占位 feature 映射替换为 core 归一化调用；删除 CLI 本地 `slugify`。
- `packages/cli/src/releaseSource.test.ts` -- 修改：v0.3.3 端到端断言扩展为逐 feature 校验 sourceRef 标题与行号；mock run 断言 `sourceRef` 缺省。
- `openspec/changes/showcraft-release-video-mvp/specs/release-source-ingestion/spec.md` -- 验收语义权威（Requirement「保留输入可追溯性」）；本 story 不修改该文件，无 spec delta。

## Tasks & Acceptance

**Execution:**
- [ ] `packages/core/src/domain.ts` -- 建模 feature 级来源映射：`featureSourceRefSchema`（`sectionIndex`/`sectionTitle`/`startLine`/`endLine`，strict，refine `endLine >= startLine`）+ `releaseFeatureSchema` 增加可选 `sourceRef` + feature 对象收紧为 `.strict()`；完成条件：`pnpm typecheck` 通过，且 domain.test.ts 新增四类断言（合法 sourceRef 解析、缺省时 mock 兼容、未知键拒绝、endLine<startLine 拒绝）全绿。
- [ ] `packages/core/src/releaseMapping.ts` + `releaseMapping.test.ts` + `packages/core/src/index.ts` -- 实现并导出 `normalizeSectionsToFeatures`/`slugifyTitle`：id 规则 `section-N-slug`、标题/旁白生成（非空 bullets 以「；」拼接，否则回退标题）、空标题回退「未命名段落」、重复标题 id 唯一、零 section 输出空数组；完成条件：releaseMapping.test.ts 覆盖 I/O 矩阵全部场景且通过。
- [ ] `packages/cli/src/main.ts` -- `createFileReleaseSource` 中占位 feature 构造替换为 `normalizeSectionsToFeatures(document.sections)`，删除本地 `slugify`；完成条件：无 `--source` 时既有 CLI 测试断言不改仍全绿（mock 行为不变）。
- [ ] `packages/cli/src/releaseSource.test.ts` -- v0.3.3 端到端断言扩展：每个 feature 的 `sourceRef.sectionTitle` 等于源文档标题、`startLine/endLine` 等于源段落行号区间（5–11/12–17/18–23/24–29）；无 `--source` 的 run 断言 `features[0].sourceRef` 为 undefined；完成条件：`pnpm test` 全绿。

**Acceptance Criteria:**
- Given v0.3.3 changelog 路径，when `pnpm demo -- --source <path>`，then release.json 中每个 feature 携带 sourceRef，`startLine–endLine` 可回链到该 section 在源文件中的原始行号区间，`sectionTitle` 与源标题一致。
- Given 任意携带 sourceRef 的 feature，when 以 releaseBriefSchema 解析 run 产物，then strict 校验通过（行号 ≥1、endLine ≥ startLine、无未知字段）。
- Given 无 `--source` 的 mock demo，when 运行，then release.json 无 sourceRef 且产物与 Story 1.6 逐字节一致。
- Given 空标题、重复标题、无 bullets、零 section 文档，when 归一化，then 行为与 I/O 矩阵逐行一致。

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Design Notes

**建模决策——`sourceRef` 子结构（定案）。** 三个候选的取舍：

1. *平铺可选字段*（`sectionTitle?/startLine?/endLine?` 直接放在 feature 上）：字段少，但三个独立 optional 会产生「有 startLine 无 endLine」的半截状态，需要额外 refine 兜底，判别来源也要逐字段检查。
2. *`sourceRef` 子结构（选定）*：映射原子化——要么完整存在、要么整体缺省，天然区分「来自解析 section」与「mock/人工 brief」两类 feature；strict 子对象与仓库既有 schema 风格（`evidenceReferenceSchema` 等）一致；后续 2.3 若需在 feature 级补充更多来源信息，扩展点收敛在同一个子结构内，不膨胀 feature 顶层字段。
3. *旁路映射表*（独立 mapping 文件/结构）：映射脱离 releaseBrief schema，落盘、校验、序列化都要另建通道，run 产物从单文件 `release.json` 变成两处才能还原完整语义；规格要求「保存解析出的特性与源段落之间的映射」由 run 产物直接承载即可，拒绝额外间接层。

**兼容性（定案）。** `sourceRef` 为可选：内置 mock release 与未来人工编辑的 brief 不携带该字段仍可解析；旧 run 产物（无 sourceRef）在新 schema 下继续可解析，回滚只需还原提交。`sourceRef` 不重复来源地址与摘要——run 级 `source` + `sourceDigest`（2.1 已有）与行号区间共同构成可复核三元组：摘要钉住内容，行号才可回放验证。

**id 规则（定案）。** 保留 `section-N-slug`：序号 N 保证重复标题与 slug 回退（纯 CJK 标题 slug 为 `section`）时 id 唯一且对文档顺序稳定；2.3 的 evidence 与 scene 引用只依赖 id 稳定性，不依赖 slug 可读性；人类可读的原始标题由 `sourceRef.sectionTitle` 承载。不引入 hash/全局递增等新方案——现有规则已被 2.1 测试锁定且满足唯一性。

**行号语义（沿用，不改动）。** `startLine` 为 `##` 标题行，`endLine` 为该 section 覆盖的最后一行（含紧邻下一个标题前的空行；文末 section 含结尾换行产生的空行）。回链语义为「覆盖该 section 的闭区间」；本 story 不收紧 `parseReleaseDocument` 的行为，避免重测 1.x 已锁定语义。

**规格对齐。** tasks.md 2.2 与 spec Requirement「保留输入可追溯性」的三要素映射：来源地址 = `brief.source`（2.1 交付）、内容摘要 = `brief.sourceDigest`（2.1 交付）、特性↔段落映射 = `feature.sourceRef`（本 story 交付）。无新增 spec delta，`openspec validate --strict` 仅需继续通过。

## Verification

**Commands:**
- `pnpm lint` -- expected: 新增/修改源码与测试满足 lint 规则。
- `pnpm typecheck` -- expected: 无 TypeScript 错误。
- `pnpm test` -- expected: 归一化单测、schema 兼容断言与既有回归（含 mock 字节稳定）全部通过。
- `pnpm demo -- --source /Users/archersado/workspace/startupOS/docs/changes/releases/v0.3.3/changelog.md` -- expected: run 目录生成（默认 `runs/`，重复执行可加 `--output <dir>` 隔离）；release.json 中 4 个 feature 的 sourceRef 行号区间依次为 5–11、12–17、18–23、24–29，`sectionTitle` 与源标题一致，id 依次为 `section-1-im`、`section-2-section`、`section-3-agent`、`section-4-section`；每个区间回看源文件均落在对应 `##` 段落内。
- `openspec validate showcraft-release-video-mvp --strict` -- expected: 通过（无 spec delta，结构校验不受影响）。
