---
title: '只读 Git 证据检索与置信度'
type: 'feature'
ticket: '3'
created: '2026-09-29'
status: built
route: 'full'
route_source: 'auto'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
context:
  - 'openspec/changes/showcraft-release-video-mvp/specs/code-evidence-discovery/spec.md'
  - 'openspec/changes/showcraft-release-video-mvp/design.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 2.2 之后每个 feature 已可回链源段落（`sourceRef`），但 feature 与实际代码变更之间没有任何建模的关联：`evidenceEntrySchema`/`evidencePackSchema`/`entryPointCandidateSchema` 自 Story 1.2 起就绪却没有生产者，orchestrator 只有 3 个 stage。「为每个解析出的特性检索受允许 Git 仓库中的关联提交、diff、文件或符号，并输出带来源引用与置信度的证据包；感知与 IM 路由至少得到一个可回链提交或代码位置的入口候选」（code-evidence-discovery Requirement + Scenario）目前无法被 run 产物承载。

**Approach:** 新增 CodeEvidence port（core 定义契约，CLI 用只读 git 子进程实现并装配），orchestrator 在 release 之后、scenePlan 之前插入 evidence stage，产出 `evidence.json`（证据 entries + 入口候选 entryPoints）。匹配采用确定性规则：feature 标题/旁白中的拉丁词元（≥2 字符）与 commit subject/scope/变更文件路径段做词边界（或 ≥4 字符前缀）匹配，置信度按命中位置加权并 clamp 到 [0,1]；不引入 LLM、网络 API、机器学习或中文分词依赖。commit 区间由 changelog 版本号推导（`desktop-<version>` 及其前一版本标签构成 tag 区间）；仓库路径从 `--source` 文件位置向上发现 `.git`。无证据来源（内置 mock、仓库缺失、区间为空）时显式输出空证据：mock 跳过 evidence stage（行为与产物字节保持 Story 1.6 原样），`--source` 运行必有 evidence.json（entries 可为空）。

## Boundaries & Constraints

**Always:** Git 访问仅限只读子命令（`log`/`diff-tree`/`show`/`tag`），统一前置 `--no-optional-locks`，经 `execFile` 数组参数调用（无 shell 拼接）；外部输入进入 git 参数前校验字符白名单（标签 `[0-9A-Za-z.\-]`、commit hash `/^[0-9a-f]{40}$/`）；仓库发现只探测目录元数据（`<dir>/.git` 存在性），不读取 StartUpOS 工作树任何文件内容；evidence stage 产物走 run store 既有 stable JSON 字节通道并接受 schema 校验；跨产物一致性（`evidence.releaseVersion` 与 release.version 一致、evidence/entryPoints 的 featureId 引用存在）继续由 `validateReleasePackageRelations` 兜底；置信度为 [0,1] 确定性输出；同一输入重复运行产物逐字节一致。

**Never:** 不做低置信度门禁与人工补充输出（2.4 范围）；不做桌面操作（epic 3）；不做 GitHub 网络 API 抓取或任何网络访问；不写 StartUpOS 仓库任何文件、不读取其工作树文件内容、不触碰其脏状态与未提交内容、不读取 `.env` 类秘密文件；不改变无 `--source` 时 mock demo 的任何输出字节；不使用 LLM、网络 API 或机器学习匹配；不实现置信度阈值配置（2.4 范围）；不读取 Git 历史中 commit 消息体之外的任何路径内容（diff 只取 hunk 头与行样本用于 symbol 摘录，不展开全文件）。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| v0.3.3 感知与 IM 路由 feature | tag 区间 `desktop-v0.3.2..desktop-v0.3.3` 存在 | 至少一条 commit 证据（`edf1573` fix(perception)，或 `aadff7f` 中 sticky-route-store/routing 路径命中）+ 至少一个入口候选，evidenceIds 可回链 | 无错误 |
| 感知与 IM 路由（perception 命中链路） | feature 标题词元 `im`、`routing`，段落 bullet 词元 `sticky`、`route` | `im` 词边界命中 `edf1573` subject 的 `IM`、路径段 `perception-runtime` 命中 bullet 词元 `感知` 不参与（CJK 跳过）；scope `perception` 经路径段/subject 二级匹配命中 | 无错误 |
| 内置 mock release（无 `--source`） | 未提供仓库 | 跳过 evidence stage；run 目录与 Story 1.6 逐字节一致（4 文件：release/scene/manifest/run） | 无错误 |
| `--source` 指向仓库外 Markdown | 上溯至根目录无 `.git` | evidence.json 照常落盘：`entries: []`、`entryPoints: []` | 无错误（显式空证据） |
| `--source` 指向非 Git 目录中的 .md | `<dir>/.git` 不存在 | 同上（目录探测不报错，视为无证据来源） | 无错误 |
| 仓库存在但 tag 不存在 | `desktop-v0.3.2` 或 `desktop-v0.3.3` 缺失 | git log 返回非零 → 证据为空 entries；diagnostic 记入诊断信息，不中断 run | 无错误（空证据） |
| tag 区间内零提交 | 区间为空 | `entries: []`、`entryPoints: []` | 无错误 |
| feature 无任何命中 | 词元集合与全部 commit 无交集 | 该 feature 无 entries、无 entryPoints；不虚构证据 | 无错误 |
| 秘密路径防护 | StartUpOS `.env` 等从未被读取；git 只访问对象库 | 沿用 2.1/2.2 的 `isSecretPath` 语义；不新增读取面 | 无错误 |
| git 子命令失败（损坏仓库等） | `git log` 非零且非「无 tag」类 | evidence stage 以该 stage 失败，保留已完成 release 产物与诊断（与既有 stage 失败语义一致） | run 失败，诊断含 stderr 摘要 |
| 非 Conventional Commit subject | subject 无 `type(scope):` 前缀 | scope 规则跳过，subject 词元匹配照常 | 无错误 |
| 标签命名派生失败 | version 提取结果不含合法标签字符 | 区间解析直接走「无 tag」路径 → 空证据 | 无错误 |

</frozen-after-approval>

## Code Map

- `packages/core/src/ports.ts` -- 修改：新增 `CodeEvidencePort` 类型 `(release: ReleaseBrief) => Promise<EvidenceResult> | EvidenceResult`；新增 `EvidenceResult = { pack: EvidencePack; entryPoints: EntryPointCandidate[] }`；新增 `createMockCodeEvidence()`（返回空证据，供 core 测试使用）。
- `packages/core/src/evidenceMatching.ts` -- 新建：确定性匹配纯函数集 —— `collectTokens(text)`（拉丁词元小写化，≥2 字符，CJK 跳过）、`matchCommitsToFeatures(release, commits)`（词元 ↔ subject/scope/路径段匹配 + 置信度加权）、`deriveEntryCandidates(release, pack)`（从 commit/file 证据派生入口候选，置信度取所引证据最值）；纯函数、无 I/O、无 git 依赖。
- `packages/core/src/evidenceMatching.test.ts` -- 新建：覆盖 I/O 矩阵全部场景与置信度加权/去重/id 稳定性的单测（git 数据以内存 fixture 注入）。
- `packages/core/src/runStore.ts` -- 修改：`RunStage` 增加 `"evidence"`（插入 release 之后），`stageFileNames` 增加 `evidence: "evidence.json"`，`runStageOrder` 更新；`StageArtifact` 增加 evidence 分支（`evidencePackSchema` 校验）。
- `packages/core/src/orchestrator.ts` -- 修改：`PipelinePorts` 增加 `codeEvidence?: CodeEvidencePort`（可选——未提供即跳过 stage，mock 管线零改动）；`runPipeline` 在 release 成功后调用 `codeEvidence`，成功则 `recordArtifact`（stage `"evidence"`），port 未提供则跳过且进度推进不受影响。
- `packages/core/src/runStore.test.ts` / `packages/core/src/orchestrator.test.ts` / `packages/core/src/e2e.test.ts` -- 修改：evidence stage 的成功/失败/跳过断言；既有断言按新 stage 顺序更新（mock 管线不提供 codeEvidence 时字节保持不变）。
- `packages/core/src/index.ts` -- 修改：导出 `CodeEvidencePort`、`EvidenceResult`、`createMockCodeEvidence`、匹配函数。
- `packages/cli/src/gitEvidence.ts` -- 新建：只读 git 适配器 —— `discoverGitRepo(changelogPath)`（向上探测 `.git`）、`resolveTagRange(version, git)`（`desktop-v0.3.2..desktop-v0.3.3` 派生与 `tag --list` 校验）、`collectCommits(range, git)`（`log --no-optional-locks --format=... --name-only`，解析 subject/scope/文件列表）、`collectDiffSamples(commit, git)`（`diff-tree` 取首个 hunk 头与行样本供 symbol 摘录）；全部经 `execFile("git", [...])`，只读。
- `packages/cli/src/gitEvidence.test.ts` -- 新建：用 `git init` 临时仓库构造 fixture（两个 tag、若干 commit），覆盖区间解析、命中、空区间、无 tag、非 Git 目录路径；拒绝路径（参数白名单）单测。
- `packages/cli/src/main.ts` -- 修改：`--source` 时发现仓库并组装真实 `CodeEvidencePort`（从 release.version 推导 tag 区间），注入 `runPipeline`；无 `--source` 时不注入（mock 行为不变）；evidence stage 失败沿用既有 StageFailure 报错通道。
- `packages/cli/src/releaseSource.test.ts` / `packages/cli/src/e2e.test.ts` -- 修改：v0.3.3 断言扩展（evidence.json 存在、感知与 IM 路由 feature ≥1 可回链 commit 证据 + ≥1 入口候选）；mock run 断言产物仍为 4 文件（evidence.json 缺省）。
- `openspec/changes/showcraft-release-video-mvp/specs/code-evidence-discovery/spec.md` -- 验收语义权威（Requirement「生成特性代码证据包」）；本 story 无新增 spec delta，validate --strict 需继续通过。
- `openspec/changes/showcraft-release-video-mvp/design.md` -- 本 story 内修订 Non-Goal 一句（见 Design Notes「规格对齐」），属 openspec change 内文档修订，随本 story 提交。

## Tasks & Acceptance

**Execution:**
- [ ] `packages/core/src/ports.ts` + `packages/core/src/index.ts` -- 定义 `CodeEvidencePort`/`EvidenceResult` 并导出 `createMockCodeEvidence`（空证据）；完成条件：`pnpm typecheck` 通过，core 单测中 mock 管线不接 evidence port 时 `e2e.test.ts` 既有断言不改仍全绿。
- [ ] `packages/core/src/evidenceMatching.ts` + `evidenceMatching.test.ts` -- 实现并覆盖：`collectTokens`（拉丁词元 ≥2 字符、小写化、CJK 跳过）、`matchCommitsToFeatures`（subject/scope/路径段词边界或 ≥4 字符前缀匹配；置信度 subject 命中 0.4、bullet-derived-token 命中 subject 0.25、文件路径段命中 0.2、多证据同 feature 取最大并保留全部 entries、同分按 commit hash 字典序稳定排序）、`deriveEntryCandidates`（每 feature 取最高置信证据派生候选，id 稳定 `entry-<featureId>`、evidenceIds 引用真实 entry、confidence 取所引证据最大值）；完成条件：矩阵全部场景单测绿。
- [ ] `packages/core/src/runStore.ts` + `orchestrator.ts` + `index.ts` -- evidence stage 接入：`RunStage`/`stageFileNames`/`runStageOrder`/`StageArtifact` 扩展，`PipelinePorts.codeEvidence` 可选，`runPipeline` 在 release 后调用；完成条件：新增 evidence stage 成功/失败/跳过单测绿；mock 管线（不提供 port）`e2e.test.ts` 字节断言不改仍绿。
- [ ] `packages/cli/src/gitEvidence.ts` + `gitEvidence.test.ts` -- 只读 git 适配器：仓库发现（向上探测 `.git`）、tag 区间解析（version → `desktop-v0.3.2..desktop-v0.3.3`，前序 tag 由 `tag --list` 排序取上一版本）、commit 收集（`log --no-optional-locks --format=... --name-only`）、diff 样本（`diff-tree --no-optional-locks -U0 -- <commit>` 首个 hunk）、参数白名单校验；完成条件：临时 git fixture 仓库单测绿，无网络依赖。
- [ ] `packages/cli/src/main.ts` -- 装配：`--source` 时构造真实 CodeEvidencePort 注入 `runPipeline`，无 `--source` 时不注入；完成条件：既有 CLI 测试断言不改仍全绿（mock 产物 4 文件字节不变）。
- [ ] `packages/cli/src/releaseSource.test.ts` + `packages/cli/src/e2e.test.ts` -- v0.3.3 端到端扩展：evidence.json 反向通过 `evidencePackSchema`；感知与 IM 路由（`section-1-im`）的 entries 至少一条 `kind:"commit"` 且 `reference.location` 为区间内真实 hash；entryPoints 至少一个且 evidenceIds 可解析；每项证据带 [0,1] 置信度；重复运行（`--output` 隔离）evidence.json 字节一致；mock run 目录仍为 4 文件；完成条件：`pnpm test` 全绿。

**Acceptance Criteria:**
- Given StartUpOS v0.3.3 changelog 路径且 `desktop-v0.3.2..desktop-v0.3.3` 可用，when `pnpm demo -- --source <path>`，then evidence.json 中感知与 IM 路由 feature 至少一个入口候选，可回链到区间内真实 commit 或代码位置（`edf1573` 等），每条证据与候选均带 [0,1] 置信度。
- Given 无 `--source` 的 mock demo，when 运行，then 不产生 evidence.json，run 目录与 Story 1.6 逐字节一致。
- Given 仓库缺失、非 Git 目录、tag 缺失或区间为空，when 运行，then evidence.json 照常落盘且 `entries` 为空数组，run 仍 completed。
- Given 同一输入重复运行，when 比较 run 目录，then evidence.json 字节逐字节一致。
- Given 任意 evidence pack，when 以 `evidencePackSchema` + `validateReleasePackageRelations` 校验，then 通过（版本一致、featureId 引用存在）。

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Design Notes

**建模决策——CodeEvidence port + orchestrator evidence stage（定案）。** 三个候选的取舍：

1. *CLI 内旁路计算*（CLI 在 runPipeline 前后自行算证据、单独写 evidence.json）：改动最小，但证据脱离 run store 的 schema 校验与 stable 字节通道，失败归因（哪个 stage 失败、保留了什么产物）退化为 CLI 特例；2.4 门禁、3.2 桌面动作引用证据时都要绕开 orchestrator 另建读取路径。
2. *CodeEvidence port + evidence stage（选定）*：与 1.4 的 stage 语义天然对齐——证据失败在 evidence stage 归因、release 产物保留；port 可选（`codeEvidence?`）使 mock 管线零改动、mock 字节稳定性继续被既有测试锁定；`evidence.json` 与 `release.json`/`scene.json` 同通道落盘，跨产物校验由 `validateReleasePackageRelations` 兜底。scenePlan 依赖证据排序的扩展（未来）在同一位置获得数据。代价是 orchestrator 增加一个可选 stage 分支，属可接受复杂度。
3. *塞进 ReleaseSource port*（release 阶段一并返回证据）：让单一 port 背负两种 I/O（读 changelog + 读 git），mock release source 也要为证据返回空壳；release stage 失败语义与证据失败语义搅在一起。拒绝。

**Git 访问方式（定案）。** 只读 `git` 子进程（`log`/`diff-tree`/`tag`，前置 `--no-optional-locks`，`execFile` 数组参数）优于读 `.git` 对象文件：零新增依赖即可获得完整历史查询能力，且避免自行实现 packfile/引用解析（高错误面、需维护）；`--no-optional-locks` 保证不与用户在 StartUpOS 上的任何并发 git 操作争锁。仓库路径来源：从 `--source` 文件位置向上探测 `.git`（约定推导）而非新增 CLI 参数——2.1 已确立「来源由 changelog 位置承载」的模型，StartUpOS changelog 天然位于其仓库内；独立参数留待未来出现「changelog 在仓库外」的真实需求再加（避免脚手架）。commit 区间：从 changelog 版本号（`v0.3.3`，2.1 已提取）推导 `desktop-<version>` 与前一版本 tag 构成区间；StartUpOS 遵循 `desktop-vX.Y.Z` 标签约定（PM 已实测存在）。仓库缺失/非 Git/无 tag/空区间统一显式降级为空证据（`entries: []`）——证据检索是尽力而为的富化，不是正确性前提；只有 git 子进程的意外失败（如仓库损坏）才作为 evidence stage 失败。安全边界：只读子命令 + 参数白名单 + 数组参数调用，杜绝注入；绝不读取工作树文件内容、绝不触碰未提交状态。

**feature↔commit 匹配策略（定案）。** 确定性词元匹配：从 feature 的 `sourceRef.sectionTitle` 与旁白 bullets 收集拉丁词元（≥2 字符、小写化；CJK 跳过——StartUpOS changelog 与 commit subject 均为英文，中文语义映射不在此 story 硬编码）；与 commit 的 subject 词元、`type(scope):` 的 scope、变更文件路径段（如 `perception-runtime`、`sticky-route-store`）做词边界匹配（词元 ≥4 字符时也接受前缀命中，覆盖 `routing`↔`router` 类屈折）。置信度加权（定案初始值，实现时可在常量表微调，但不引入配置项）：subject 命中 0.4、bullet 词元命中 subject 0.25、文件路径段命中 0.2，同 feature 多条证据取最大作为候选置信度，全部命中作为 entries 保留。「感知与 IM 路由」的可复现命中链路：标题词元 `im` 词边界命中 `edf1573`（`fix(perception): prompt IM users for ambiguous targets`）的 subject；bullet 词元 `sticky`、`route` 与 `aadff7f` 变更路径段 `sticky-route-store.ts`/`perception-router.ts` 命中（PM 已实测区间内该提交存在且含这些文件）。无命中 → 该 feature 无 entries、无候选，不虚构、不猜测——「只输出，不门禁」，门禁是 2.4。

**design.md Non-Goal 张力的显式解决（定案）。** design.md Goals/Non-Goals 写有「不读取或写入 StartUpOS 的秘密文件、工作树或 Git 历史」，而 proposal.md 的 What Changes 与 Impact 同页明确「新增由发布说明与只读 Git 提交/代码证据共同定位版本专属产品入口的能力」「StartUpOS 仓库与 Git 历史仅以只读方式使用」——同文件内两处表述自相矛盾，Non-Goal 是笔误级别的过严表述。解决方式：随本 story 修订 design.md 该行为「不读取或写入 StartUpOS 的秘密文件或工作树；Git 历史仅以只读 tag 区间查询方式使用（`code-evidence-discovery`）」。修订理由：(a) spec（Requirement「生成特性代码证据包」）与 tasks 2.3 均以只读 Git 历史为 SHALL，Non-Goal 与规格直接冲突时以规格为准；(b) 修订后的边界仍完整保留真实意图——绝不触碰秘密文件与工作树脏状态，Git 只读且限于 tag 区间的对象查询，不扩大任何读取面。该修订属 openspec change 内文档修订，不产生 spec delta，`validate --strict` 继续通过。

**置信度语义（定案）。** 置信度是本 story 的确定性输出（`confidenceSchema` [0,1] 已有），表达「该证据与 feature 关联的规则化强度」；阈值判断与降级（人工补充/旁白）明确不在本 story（2.4 范围），`entryPointCandidateSchema` 的注释已预留该边界。不做阈值配置项——2.4 引入门禁时再定配置形状，避免脚手架。

**范围限定（重申）。** 不做低置信度门禁（2.4）、不做桌面操作（epic 3）、不做 GitHub 网络 API 抓取、不写 StartUpOS 仓库任何文件、不改 mock demo 行为。

## Verification

**Commands:**
- `pnpm lint` -- expected: 新增/修改源码与测试满足 lint 规则。
- `pnpm typecheck` -- expected: 无 TypeScript 错误。
- `pnpm test` -- expected: 匹配单测、evidence stage 单测、git 适配器 fixture 单测与既有回归（含 mock 字节稳定）全部通过。
- `pnpm demo -- --source /Users/archersado/workspace/startupOS/docs/changes/releases/v0.3.3/changelog.md --output /private/tmp/showcraft-evidence-demo` -- expected: run 目录生成；evidence.json 存在且感知与 IM 路由 feature（`section-1-im`）至少一个入口候选，可回链到区间内 commit（如 `edf1573`）或代码位置，每项证据与候选带 [0,1] 置信度；重复执行加 `--output <dir>` 隔离后 evidence.json 字节一致。
- `openspec validate showcraft-release-video-mvp --strict` -- expected: 通过（design.md 修订不产生 spec delta）。
