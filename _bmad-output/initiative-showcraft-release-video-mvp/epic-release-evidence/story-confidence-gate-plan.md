---
title: '低置信度门禁与人工补充输出'
type: 'feature'
ticket: '4'
created: '2026-10-08'
status: draft
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

**Problem:** Story 2.3 之后每个有证据的 feature 都会产出入口候选（置信度取所引证据最高值），但置信度没有任何消费者：`evidenceMatching` 明确「只输出，不门禁」，orchestrator 对候选照单全收，mock scene planner 对所有 feature 输出 `narrationSource: "narration"`。code-evidence-discovery Requirement「保护低置信度候选」——「系统 MUST NOT 将缺少代码证据或低于配置置信度阈值的候选直接转为自动化操作」与 Scenario「证据不足时降级」（标为需要人工补充或旁白处理，而不执行产品操作）目前无法被 run 产物承载：无证据 feature 没有任何候选即无从谈起，低置信候选也没有任何「不可进入自动化」的显式表达。design.md 预留的 Open Question「代码证据的初始置信度阈值可在实现时作为配置默认值确定」同样悬而未决。

**Approach:** 在 `@showcraft/core` 新增确定性置信度门禁纯函数 `applyConfidenceGate`：以候选级最高引用证据置信度对照固定阈值（代码内常量，初始值 0.8），把候选划分为 `eligible`（达标、可进入 epic 3 自动化）与 `gated`（无证据 / 低于阈值，明确标记 `automatable: false`）两类，连同门禁报告落盘为第 5 个 run 产物 `gate.json`；CLI 在装配层把 evidence 结果过门禁后再交给下游——orchestrator 新增可选 gate stage（evidence 之后、scenePlan 之前），scene planner port 契约扩展为可感知每个 feature 的降级结果，mock scene planner 据此对被门禁 feature 输出 `narrationSource: "fallback"`（旁白兜底）、对通过门禁 feature 维持 `"narration"`。mock（无 `--source`）运行不注入 gate stage，产物保持 Story 1.6 的 4 文件字节不变。门禁只做分类与标注，不删除任何证据或候选（可审计性优先），「不产生桌面自动化动作」由 `automatable: false` 的显式 ineligible 表达承载，供 3.2 直接消费。

## Boundaries & Constraints

**Always:** 门禁是 core 纯函数（输入 evidence pack + 候选 + 阈值，输出分类结果，无 I/O、无 LLM）；阈值常量与门禁输出 schema 均在 core 定义（`gateThreshold` 常量 + `gateResultSchema` strict）；门禁产物走 run store 既有 schema 校验与 stable JSON 字节通道（`gate.json`，stage `"gate"` 插入 evidence 之后、scenePlan 之前）；每个被门禁 feature 的降级记录必须可审计——携带 featureId、降级原因（`no_evidence` / `below_threshold`）、被降级候选的证据引用（evidenceIds）或空数组（无证据）；`scenePlan.scenes[].narrationSource` 忠实反映门禁结果（gated → `fallback`，eligible → `narration`），`validateReleasePackageRelations` 增加 gate 产物与 scenePlan 的一致性校验；同一输入重复运行产物逐字节一致；threshold 边界语义为「置信度 ≥ 阈值即通过」（含等于）；CLI 装配层只在有 `--source` 且注入了 evidence port 时注入 gate stage。

**Never:** 不做桌面操作、不实现 DesktopRunner（epic 3 范围）；不做 GitHub 网络抓取或任何新增网络访问；不引入新依赖；不做审核 UI/预览（epic 5）；不改变无 `--source` 时 mock demo 的任何输出字节（4 文件逐字节一致）；不删除或篡改 evidence.json 中的任何 entry 与候选（门禁只加标注、不做数据裁剪）；不引入通用配置框架或 CLI 阈值参数（Open Question 以代码默认值定案，参数化留待真实需求）；不修改 Story 2.3 的匹配算法与置信度权重；不读取 StartUpOS 工作树任何文件内容（沿用 2.3 只读 git 对象边界）。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| feature 无任何证据（无 entries 无候选） | v0.3.3 `section-2-section`（企业微信，实测 0 条证据） | gate 报告记录 `featureId`、`reason: "no_evidence"`、`automatable: false`、`evidenceIds: []`；scenePlan 对应 scene `narrationSource: "fallback"` | 无错误 |
| 候选低于阈值 | 某 feature 最高证据置信度 0.7（< 0.8） | gate 记录 `reason: "below_threshold"`、`automatable: false`，携带其候选的 evidenceIds 与置信度；scene `narrationSource: "fallback"` | 无错误 |
| 恰等于阈值 | 候选置信度恰为 0.8（如 0.4+0.2+0.2） | `>=` 语义 → `eligible: true`、`automatable: true`；单测锁定边界（含浮点实测：0.8 的三种累加路径均精确等于 0.8） | 无错误 |
| v0.3.3 实测分布（规划期实测） | `section-1-im` 最高 0.85；`section-3-agent` 最高 1.0；`section-4-section` 最高 1.0；`section-2-section` 0 条证据 | 前 3 个 feature `eligible`；`section-2-section` 被 `no_evidence` 门禁；scenePlan 中 3 个 `narration` + 1 个 `fallback` | 无错误 |
| 全部 feature 均被门禁 | 假想 release：所有 feature 无证据或低于阈值 | run 仍 completed；gate.json 全部 `automatable: false`；scenePlan 全部 `fallback`；evidence/候选照常保留 | 无错误 |
| 部分 feature 通过 | 混合分布 | gate 与 scenePlan 逐 feature 一致，互不影响 | 无错误 |
| mock 运行（无 `--source`） | 未提供 evidence port | 不注入 gate stage；run 目录与 Story 1.6 逐字节一致（4 文件：release/scene/manifest/run），无 gate.json | 无错误 |
| `--source` 运行产物变化 | 注入 evidence port | gate.json 照常落盘（第 5 文件）；scene.json 的 `narrationSource` 可能因门禁变化——属本 story 预期改动，与 mock 路径隔离 | 无错误 |
| 重复运行同一输入 | 两次 `--source` v0.3.3 运行 | gate.json / evidence.json / scene.json 字节逐字节一致 | 无错误 |
| gate 输出违反 schema | 引用不存在的 featureId 或缺字段 | run store schema 校验拒绝 → gate stage 失败，保留 release/evidence 产物与诊断（既有 stage 失败语义） | run 失败，诊断含字段路径 |
| 跨产物一致性 | gate 声称某 feature eligible 但其候选缺失 | `validateReleasePackageRelations` 扩展校验拒绝 | DomainValidationError，路径可定位 |

</frozen-after-approval>

## Code Map

- `packages/core/src/confidenceGate.ts` -- 新建：门禁纯函数集 —— `gateThreshold`（常量，初始值 0.8）、`applyConfidenceGate(release, evidence, entryPoints, threshold)`（逐 feature 分类：无证据 → `no_evidence`；候选最高置信度 < 阈值 → `below_threshold`；否则 `eligible`）、`GateDecision`/`GateResult` 类型与 `gateResultSchema`（strict）。输出保持 evidence/候选原数据 + 显式 `automatable` 标记，不裁剪。
- `packages/core/src/confidenceGate.test.ts` -- 新建：覆盖 I/O 矩阵全部场景与阈值边界（0.8 恰等、0.7999 浮点近邻、无证据、全部门禁、部分通过）的单测（内存 fixture 注入）。
- `packages/core/src/domain.ts` -- 修改：新增 `gateResultSchema`/`GateDecision`（若 schema 放 domain 而非独立文件，两处取其一，保持与仓库分层习惯一致）；`validateReleasePackageRelations` 增加 gate 与 scenePlan 的一致性校验（gated feature 的 scene `narrationSource` 必须为 `fallback`，eligible feature 必须为 `narration`——以 scenePlanner 实际产出的映射为准，见 Design Notes）。
- `packages/core/src/runStore.ts` -- 修改：`RunStage` 增加 `"gate"`（插入 evidence 之后、scenePlan 之前），`stageFileNames` 增加 `gate: "gate.json"`，`runStageOrder` 更新；`StageArtifact` 增加 gate 分支（`gateResultSchema` 校验）。
- `packages/core/src/orchestrator.ts` -- 修改：`PipelinePorts` 增加可选 `confidenceGate?: ConfidenceGatePort`（未提供即跳过 stage，mock 管线零改动）；`runPipeline` 在 evidence stage 成功后调用 gate，`recordArtifact` stage `"gate"`；gate 结果作为 scenePlanner 的新输入传递（port 签名扩展，见下）。
- `packages/core/src/ports.ts` -- 修改：新增 `ConfidenceGatePort` 类型；`ScenePlannerPort` 从 `(release) => ScenePlan` 扩展为 `(release, context: ScenePlanningContext) => ScenePlan`，其中 `ScenePlanningContext = { gatedFeatureIds?: ReadonlySet<string> }`（可选字段保持既有 planner 兼容）；mock scene planner 据此对 gated feature 输出 `narrationSource: "fallback"`。
- `packages/core/src/ports.test.ts` / `packages/core/src/orchestrator.test.ts` / `packages/core/src/runStore.test.ts` / `packages/core/src/e2e.test.ts` -- 修改：gate stage 成功/失败/跳过断言；mock 管线（无 gate port）字节不变断言保持。
- `packages/core/src/index.ts` -- 修改：导出 `gateThreshold`、`applyConfidenceGate`、`ConfidenceGatePort`、`GateResult`/`GateDecision` 类型与 schema。
- `packages/cli/src/main.ts` -- 修改：`--source` 且 evidence port 已注入时，在 `runPipeline` 的 ports 中加入 `confidenceGate`（包装 `applyConfidenceGate`，阈值取 core 常量）；无 `--source` 时不注入（mock 字节不变）；gate stage 失败沿用既有 StageFailure 报错通道。
- `packages/cli/src/main.test.ts` / `packages/cli/src/releaseSource.test.ts` / `packages/cli/src/e2e.test.ts` -- 修改：v0.3.3 端到端断言扩展（gate.json 存在且 reverse-parse、`section-2-section` 被 `no_evidence` 门禁、`section-1-im` eligible、scenePlan `narrationSource` 与门禁结果一致、重复运行 gate.json 字节一致）；mock run 断言产物仍为 4 文件。
- `openspec/changes/showcraft-release-video-mvp/specs/code-evidence-discovery/spec.md` -- 验收语义权威（Requirement「保护低置信度候选」+ Scenario「证据不足时降级」）；本 story 无新增 spec delta，`validate --strict` 需继续通过。
- `openspec/changes/showcraft-release-video-mvp/design.md` -- 验收语义权威（「证据门禁先于桌面操作」决策、降级 Goal）；本 story 不修改该文件（Open Question 以实现常量回答，无需改文档——若 PM 认为需要把阈值写回 design.md，属收尾 commit 的一行文档修订，随本 story 备案）。

## Tasks & Acceptance

**Execution:**
- [ ] `packages/core/src/confidenceGate.ts` + `confidenceGate.test.ts` + `index.ts` -- 实现并导出 `gateThreshold`（0.8）、`applyConfidenceGate`、`GateResult`/`GateDecision` 与 strict schema；完成条件：I/O 矩阵全部场景单测绿（含 0.8 恰等边界、浮点近邻、全部门禁、部分通过），`pnpm typecheck` 通过。
- [ ] `packages/core/src/runStore.ts` + `orchestrator.ts` + `ports.ts` -- gate stage 接入：`RunStage`/`stageFileNames`/`runStageOrder`/`StageArtifact` 扩展，`PipelinePorts.confidenceGate` 可选，`ScenePlannerPort` 增加 `ScenePlanningContext`（gatedFeatureIds），`runPipeline` 在 evidence 后调用 gate 并把 gated 集合传给 scenePlanner；完成条件：新增 gate stage 成功/失败/跳过单测绿；mock 管线（不提供 port）`e2e.test.ts` 字节断言不改仍绿。
- [ ] `packages/core/src/domain.ts` -- `validateReleasePackageRelations` 增加 gate ↔ scenePlan 一致性校验（逐 feature：gated → `fallback`、eligible → `narration`；gate 引用的 featureId 必须存在）；完成条件：一致性破坏用例单测拒绝且路径清晰，合法产物继续通过。
- [ ] `packages/core/src/ports.ts` -- mock scene planner 按 gatedFeatureIds 输出 `narrationSource: "fallback"`（gated）/ `"narration"`（其余）；完成条件：core 单测覆盖「有 gated context 时 mock planner 降级、无 context 时行为与 2.3 完全一致」。
- [ ] `packages/cli/src/main.ts` -- 装配：`--source` 且已注入 evidence port 时构造 confidenceGate port 注入 `runPipeline`；无 `--source` 时不注入；完成条件：既有 CLI 测试断言不改仍全绿（mock 产物 4 文件字节不变）。
- [ ] `packages/cli/src/releaseSource.test.ts` + `packages/cli/src/e2e.test.ts` -- v0.3.3 端到端扩展：gate.json 反向通过 `gateResultSchema`；`section-2-section` 恰有一条 decision（`reason: "no_evidence"`、`automatable: false`）；`section-1-im`/`section-3-agent`/`section-4-section` `automatable: true`；scene.json 中 `section-2-section` 的 scene `narrationSource` 为 `fallback`、其余为 `narration`；gate 的 evidenceIds 引用可解析到 evidence.json 真实 entry（no_evidence 时为空数组）；重复运行 gate.json 字节一致；mock run 目录仍为 4 文件；完成条件：`pnpm test` 全绿。

**Acceptance Criteria:**
- Given StartUpOS v0.3.3 changelog 路径，when `pnpm demo -- --source <path>`，then gate.json 中无证据的 feature（`section-2-section`）被标记 `no_evidence` 且 `automatable: false`，达到阈值的 feature（`section-1-im` ≥ 0.8）标记 `automatable: true`；被门禁 feature 的 scene `narrationSource` 为 `fallback`，通过 feature 为 `narration`。
- Given 无 `--source` 的 mock demo，when 运行，then 不产生 gate.json，run 目录与 Story 1.6 逐字节一致。
- Given 候选置信度恰等于阈值 0.8，when 门禁，then 通过（`>=` 边界语义，单测锁定）。
- Given 全部 feature 均无证据或低于阈值，when 运行，then run 仍 completed，gate.json 全部 `automatable: false`，不产生任何可进入自动化（epic 3 DesktopRunner 输入）的候选标记。
- Given 同一输入重复运行，when 比较 run 目录，then gate.json 与 scene.json 字节逐字节一致。
- Given 任意 gate 产物，when 以 `gateResultSchema` + `validateReleasePackageRelations` 校验，then 通过（版本一致、featureId 引用存在、gate 与 scenePlan 一致）。

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Design Notes

**决策 1——门禁位置（定案）：orchestrator 新增可选 gate stage + CLI 装配层注入。** 三个候选的取舍：

1. *CLI 装配层旁路处理*（CLI 拿到 evidence 结果后先过门禁再交给 orchestrator）：orchestrator 零改动，但门禁结果脱离 run store 的 schema 校验与 stable 字节通道（2.3 Design Notes 已论证过同型方案的缺陷——失败归因退化、3.2 要绕开 orchestrator 另建读取路径），且「gate 产物要不要落盘」没有自然挂点。拒绝。
2. *orchestrator gate stage（选定）*：与 1.4 stage 语义、2.3 evidence stage 完全同构——门禁失败在 gate stage 归因、release/evidence 产物保留；port 可选（`confidenceGate?`）使 mock 管线零改动、mock 字节稳定性继续被既有测试锁定；`gate.json` 与 `evidence.json` 同通道落盘。门禁在 evidence 之后、scenePlan 之前，正好满足 design.md「证据门禁先于桌面操作」的顺序语义（scenePlan 是降级结果的第一个消费者，DesktopRunner 是 epic 3 的下一个消费者）。
3. *scene planner 内部处理*（planner 自己读 evidence 做阈值判断）：把「分类」与「消费」混进同一 port，任何下游（epic 3 的 3.2）都要重新实现或绕过阈值逻辑才能拿到 eligibility；且 mock planner 将被迫携带门禁职责，无 `--source` 路径的隔离变复杂。拒绝——planner 只消费门禁结果（gatedFeatureIds），不产生它。

**决策 2——阈值配置默认值（定案）：代码内常量 `gateThreshold = 0.8`，候选级语义。** 取值论证：v0.3.3 实测四 feature 置信度分布为 0.85 / 1.0 / 1.0 / 无证据。阈值必须 (a) 让「感知与 IM 路由」通过（0.85，spec Scenario 点名的验收样本），(b) 把纯噪声命中挡在门外。观察权重表：0.4 是单次标题词元命中 subject 的分值，两个独立 0.4 命中（0.8）才表达「标题级双重印证」；低于 0.8 的分数（0.2/0.25/0.4/0.45/0.5/0.6/0.65/0.75）全部可以由单一词元或纯路径段命中构成，属于「顺带相似」而非「入口证据」。0.8 恰好把「仅一条标题词元命中」（0.4~0.6）与「多处独立命中」分开，且不靠拍脑袋小数（0.75、0.85 这类没有结构含义的值）。存放形式：core 导出常量，不做 CLI 参数、不做配置文件——Open Question 问的是「初始默认值」，参数化是未来出现真实需求（不同产品阈值不同）时的最小扩展点，现在建框架属脚手架。语义作用层级：候选级（对 entryPointCandidate 引用的最高证据置信度判断），不对证据级逐条过滤——2.3 的语义是「全部命中保留为 entries」，门禁裁剪 entries 会破坏「只输出不裁剪」的可审计契约；候选才是「可进入自动化」的载体，与 spec「MUST NOT 将候选直接转为自动化操作」逐字对应。与 `confidenceSchema` [0,1] 的关系：阈值取值域就在 [0,1] 内，边界语义 `confidence >= threshold`（含等于）。浮点边界已实测：0.8 的全部可达累加路径（0.4+0.4、0.4+0.2+0.2、0.2×4、0.25×2+0.2+0.2……）在 IEEE 754 下均 ≥ 0.8（枚举验证，无 0.7999…99 陷阱；0.4+0.2 恒为 0.6000000000000001，仍低于阈值，语义一致）。单测将锁定「恰为 0.8 通过」。

**决策 3——降级输出形状（定案）：gate.json 报告 + scenePlan.narrationSource 两者，以 gate.json 为权威。** 单独方案的不足：(a) 只改 scenePlan——降级原因（no_evidence vs below_threshold）与证据引用在 scene schema 无处安放，3.2/epic 5 无法区分「为什么降级」；(b) 只出报告——scene planner 不消费的话 mock 管线以外没有任何产物体现「人工补充或旁白」，spec Scenario 的「标为需要人工补充或旁白处理」落不了地。因此：gate.json 携带结构化 decision（featureId、reason、automatable、confidence、evidenceIds——全部可回链 evidence.json 的 entry id 与 release.json 的 feature id，`validateReleasePackageRelations` 扩展校验引用存在性与 gate↔scene 一致性）；mock scene planner 消费 gatedFeatureIds，对 gated feature 输出 `narrationSource: "fallback"`（旁白兜底，narration 文本沿用 feature.narration——文本生成质量属 epic 4，本 story 只定来源语义）、eligible feature 维持 `"narration"`。`human_supplement` 本 story 不产出（没有任何「人工已补充」的输入通道，它是 epic 5 审核/人工编辑阶段的语义），但 gate.json 的 reason 枚举与 schema 注释明确该去向，避免 epic 5 返工。`--source` 运行的 scene.json/manifest.json 行为变化（4 个 scene 中被门禁者 `narrationSource` 从 `narration` 变 `fallback`）是本 story 预期改动：它是「降级可观测」的载体本身；与 mock 路径的隔离由「gate stage 可选、不注入即不存在」保证，既有 mock 字节测试继续锁定。

**决策 4——「不产生桌面自动化动作」的可验证语义（定案）：gate decision 的 `automatable` 显式布尔 + eligible 集合为空断言。** epic 3 前尚无 DesktopRunner，无法以「没执行动作」直接验收；本 story 把验收锚定为：(a) 每个被门禁 feature 在 gate.json 中有 `automatable: false` 的显式记录（而非「缺省即不存在」——显式标记才可被 3.2 消费与测试）；(b) 「无证据 feature 不会产生桌面自动化动作」翻译为测试断言：「gate 后 eligible 集合不包含该 feature」。3.2 的消费契约由此直接可得：DesktopRunner 的输入 = gate.json 中 `automatable: true` 的候选列表；本 story 交付的就是这个列表的生成与校验。该表达写入 `gateResultSchema` 字段注释，作为跨 epic 契约。

**复核遗留备案（非阻塞，沿用 2.3 复核记录）。** 两项 2.3 复核观察在本计划登记，均不在本 story 修复：(1) `git log` 非零退出统一降级为空证据——本 story 不改证据检索语义，门禁对「空证据」的语义恰好是 `no_evidence` 降级，行为闭环安全；(2) diff excerpt 实为首文件 hunk 头而非符号级摘录——影响证据可读性不影响门禁判定（门禁只读置信度数值）。若未来 story 修复摘录质量，gate 产物无需变更。

**规划期实测记录（2026-10-08，供实施对照）。** 基于 `3bac2a0` 代码对 StartUpOS v0.3.3（tag 区间 `desktop-v0.3.2..desktop-v0.3.3`，25 commits）实跑：`section-1-im` 3 条证据（最高 0.85，`edf15733`）；`section-2-section` 0 条（纯 CJK 标题与旁白，无拉丁词元命中）；`section-3-agent` 11 条（最高 1.0）；`section-4-section` 16 条（最高 1.0，注：「验证」section 的验证性内容与 release prep commit 路径大面积词元相交，属匹配器的已知特性，门禁按数据如实分类）。30 entries / 3 entryPoints 总量。两次运行 evidence.json 逐字节一致。基线绿：`pnpm lint` / `typecheck` 通过、`pnpm test` 141 用例（本机存在个别 git fixture 子进程超时抖动，重跑通过——与本 story 无关，备案供 PM 知悉）、`openspec validate --strict` 通过。

**范围限定（重申）。** 不做桌面操作（epic 3）、不做 GitHub 网络抓取或新增网络访问、不引入新依赖、不做审核 UI/预览（epic 5）、不改 mock demo 行为、不扩权读取 StartUpOS 任何文件、不建通用配置框架。

## Verification

**Commands:**
- `pnpm lint` -- expected: 新增/修改源码与测试满足 lint 规则。
- `pnpm typecheck` -- expected: 无 TypeScript 错误。
- `pnpm test` -- expected: 门禁单测、gate stage 单测、schema 一致性断言与既有回归（含 mock 字节稳定）全部通过。
- `pnpm demo -- --source /Users/archersado/workspace/startupOS/docs/changes/releases/v0.3.3/changelog.md --output /tmp/showcraft-gate-demo` -- expected: run 目录生成，5 文件（release/evidence/gate/scene/manifest + run.json）；gate.json 中 `section-2-section` 为 `no_evidence` + `automatable: false`，`section-1-im`（0.85）等其余 feature `automatable: true`；scene.json 中 `section-2-section` 的 scene `narrationSource: "fallback"`、其余 `"narration"`——达标的感知与 IM 路由 feature 与被降级 feature 区分明确；重复运行（`--output` 隔离目录）gate.json 与 scene.json 字节一致。
- `openspec validate showcraft-release-video-mvp --strict` -- expected: 通过（无 spec delta）。
