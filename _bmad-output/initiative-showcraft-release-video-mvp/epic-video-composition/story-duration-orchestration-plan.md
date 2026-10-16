---
title: 'feature 数量驱动的镜头时长与 90 秒系列拆分'
type: 'feature'
ticket: '11'
created: '2026-10-16'
status: draft
baseline_revision: 18f3d58835eaa32fca1588be725d3e0e6be2622a
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: ['blind-hunter', 'edge-case-hunter', 'verification-gap', 'intent-alignment']
context:
  - 'openspec/changes/showcraft-release-video-mvp/specs/localized-video-composition/spec.md'
  - 'openspec/changes/showcraft-release-video-mvp/design.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** localized-video-composition spec 的 Requirement「按特性数量编排时长」（R8：开场/结尾 10–15 秒、每项 feature 12–20 秒、预估总时长超过 90 秒按 feature 边界拆分且不拆分单个特性镜头）在基线 `agent/agent/arch-221` @ `18f3d58`（epic 1–3 + 4.1 完整交付，278 用例全绿）上尚无任何实现：mock `createMockScenePlanner` 每 feature 恰一镜头、固定 `plannedDurationSeconds: 15`（ports.ts:154-169）、无开场/结尾镜头；mock `createMockRenderer` 原样拷贝 scenePlan.scenes 进 manifest（ports.ts:171-177）；`renderManifestSchema` 为单清单结构（domain.ts:430-436），无分卷语义；`sceneSchema.plannedDurationSeconds` 注释自 1.2 起标注「duration orchestration lives in later stories」——本 story 即该 later story。4.3 Remotion 将「只消费 manifest」，若 4.2 不先落定时长编排与分卷的 manifest 合同，4.3 将无消费对象。同时 4.1 复核移交 `quarantineNarrationFile` 死代码、3.4 移交 `desktopFixtures.ts` 进 cli `dist/` 两个顺手清理项。

**Approach:** 本 story 交付 R8 全部语义，纯 core/CLI 逻辑编排、零网络依赖：core 新增纯函数模块 `durationOrchestration.ts`（时长常量、开场/结尾镜头构造、`planVolumes` 贪心分卷、`estimateTotalSeconds` 预估）；mock `createMockScenePlanner` 升级为含开场/结尾镜头的时长编排实现（feature 镜头 16s、开场/结尾 12s，均落在 spec 窗口内；开场/结尾以保留 featureId `intro`/`outro` 建模为 scenePlan 镜头）；mock `createMockRenderer` 升级为分卷实现（`renderManifestSchema` 增量扩展可选 `volumes` 字段——单一 `manifest.json` 内声明系列分卷，`stageFileNames`/`RunStage`/run 产物文件集合零改动）；orchestrator 在 manifest 阶段补 `validateReleasePackageRelations` 调用（沿 narration 先例）校验分卷关系；domain 增加保留字规则与分卷聚合校验。narration port/stage/`narrationArtifactSchema` 契约零改动——开场/结尾作为 scenePlan 镜头自然纳入 4.1 的恰一对应关系（`--tts` 时 intro/outro 同样获得配音与字幕，符合「镜头」语义）；1/3/6 feature 验证矩阵以纯函数级 + CLI 装配级两层无网络测试交付。本 story 属**契约修订**（默认路径 mock 4 文件 / `--source` 5 文件的内容随 scene/manifest 升级而变化）——需用户批准后方可实施（见 Design Notes 决策 4）。

## Boundaries & Constraints

**Always:** 时长常量与 spec 窗口一致——开场/结尾各 10–15s、每 feature 12–20s、单卷上界 90s（常量集中于 `durationOrchestration.ts` 并逐条注明 spec 依据）；时长分配与拆分全部走确定性纯函数（同输入恒同输出，无随机、无时钟、无网络）；预估总时长只依赖 scenePlan 自身的 `plannedDurationSeconds` 之和，不依赖 TTS/网络/真实音频时长（mock 与无 TTS 路径同样能触发拆分判断——`--tts` 真实 `audioDurationMs` 仅在 4.3+ 消费侧做校准核对，不进本 story 判定路径）；拆分严格按 feature 边界贪心：单镜头绝不跨卷、单 feature 可跨卷（多镜头 feature 时）但每卷 ≤90s；分卷结果逐卷稳定有序（volume 1..N 顺序 = scenePlan 场景顺序）；既有 schema/refine 语义零放松（`sceneSchema.plannedDurationSeconds > 0`、narration 一一对应、引用校验全保留）；每项改动面在 Code Map 显式标注；全部新增测试无网络、无 TTS、确定性输入。

**Never:** 不做 4.3（Remotion composition / MP4 渲染 / manifest 音视频引用扩展——音频文件与字幕时序如何进渲染留给 4.3 spec delta）；不做 epic 5（preview server / 审核命令）；不做 DeepMatch 网站录屏（ARCH-234 挂起）；不改 `openspec/changes/showcraft-release-video-mvp/specs/` 既有 spec（「按特性数量编排时长」Requirement 已覆盖本 story 全部语义，无 spec delta）；不改 narration port/stage/`--tts` 产物契约（narrationArtifactSchema、edgeTtsNarration.ts 协议层零改动——`--tts` 产物集合随 scenePlan 镜头数变化属决策 1 的显式影响面，已在矩阵 4 声明，`--tts` 触发逻辑与失败语义不动）；desktop 路径零改动（desktopActions/desktopLifecycle/desktopFixtures 行为不动）；不动 runStageOrder/stageFileNames/run 产物文件命名（manifest 始终单文件 `manifest.json`）；不新增 npm 依赖；不引入 CI 平台依赖；不做 Windows 语义；不暴露语速/音调/时长配置 flag（窗口常量首版写死，见决策 2）；不做按真实音频时长的二次校准编排（首版只做 planned 口径预估）；不把分卷拆到文件系统多 manifest（决策 3）。

## I/O & Edge-Case Matrix

「执行条件」列：**干净** = 无网络、无凭据、无 TTS 即可在 `pnpm test` 全绿。所有矩阵行的时长输入均为 `plannedDurationSeconds` 确定性值。

| # | Scenario | Input / State | Expected Output / Behavior | Error Handling | 执行条件 | 覆盖来源 |
|---|----------|---------------|----------------------------|----------------|----------|----------|
| 1 | 1 feature：不拆分 | planner 注入 1-feature release（intro 12 + feature 16 + outro 12 = 40s ≤ 90） | scenePlan = 3 镜头（intro/feature/outro）；manifest.volumes 恰 1 卷、总时长 40s、卷内 3 镜头 | 无错误 | 干净 | **本 story 新增**：durationOrchestration 纯函数 + orchestrator 集成用例 |
| 2 | 3 features：不拆分 | 12 + 16×3 + 12 = 72s ≤ 90 | volumes 恰 1 卷 5 镜头 | 无错误 | 干净 | **本 story 新增**：矩阵行（72s 距 90s 有 18s 余量，非贴边——贴边由矩阵 3 锁定） |
| 3 | 恰好 90s 边界 | 12 + 16×4 + 12 = 88s、再加一 feature 到 90s 整（构造 12+16×4+12+12×2=90，用 10s intro/outro 变体或直接纯函数注入 90s 总和） | 总和 = 90 时 **不拆分**（「超过 90 秒」为严格大于） | 无错误 | 干净 | **本 story 新增**：边界用例锁定 `> 90` 判定语义 |
| 4 | `--tts` 下 intro/outro 配音 | `--tts` run（fake 注入） | narration.scenes = scenePlan.scenes 恰一对应（含 intro/outro 场景）→ 比无 intro/outro 的旧契约多 2 个 mp3 + 2 条 narrated scene | 无错误（产物集合变化为契约修订的一部分） | 干净 | **本 story 新增**：沿 main.test 现有 fake narration 用例扩展 |
| 5 | 6 features：必然拆分 | 12 + 16×6 + 12 = 120s > 90 | volumes = 2 卷、逐卷 ≤ 90、卷边界在 feature 镜头之间、无镜头跨卷 | 无错误 | 干净 | **本 story 新增**：纯函数 + 装配级断言 |
| 6 | 单镜头超上界（防御） | 构造单 scene.plannedDurationSeconds = 120（> 90 且窗口 12–20 之外） | `planVolumes` 显式抛 `DurationOrchestrationError`（单镜头无法入任何 ≤90s 卷——spec「不拆分单个特性镜头」在此输入下不可满足，显式失败优于静默超限） | 显式错误 | 干净 | **本 story 新增**：mock planner 受 12–20s 窗口约束不会产出此输入；该行锁定纯函数合同而非产品路径 |
| 7 | 单 feature 跨卷 | 10 个 feature、每镜头 16s（纯函数注入） | feature A 的多个镜头可分属卷 N/卷 N+1（feature 边界拆分语义：镜头不可拆，feature 可分卷），每卷 ≤ 90 | 无错误 | 干净 | **本 story 新增**：澄清「不拆分单个特性镜头」≠「单 feature 不得跨卷」 |
| 8 | mock 默认路径（契约修订后） | mock run（无 flag） | 4 文件集合不变（release/scene/manifest/run）；scene.json 镜头数 = features+2、时长=编排值；manifest.json 含 volumes | 无错误 | 干净 | **既有**：e2e.test 4-file 集合断言继续锁定（内容字节随契约修订更新）；**本 story 新增**：修订后内容断言 |
| 9 | `--source` 缺省路径（契约修订后） | fixture `--source` run | 5 JSON 文件集合与 `run.artifacts` 顺序不变；scene/manifest 内容含编排时长与 volumes | 无错误 | 干净 | **既有**：releaseSource.test 5-file 断言继续锁定；**本 story 新增**：修订后内容断言 |
| 10 | 幂等/字节稳定 | 同一输入两次 run | scene.json/manifest.json 逐字节相同（编排为纯函数，无时钟）——除 runId 差异照旧 | 无错误 | 干净 | **既有**：byte-stable 用例在修订后契约上继续全绿 |
| 11 | gated feature 的 fallback 镜头 | evidence+gate fixture（低置信度 feature） | gated feature 镜头 narrationSource=fallback 且同样 16s 进编排；intro/outro 恒为 generated | 无错误 | 干净 | **本 story 新增**：gate×时长编排组合 |
| 12 | 保留 featureId 拒绝 | release.features 含 id=`intro` 或 `outro` 的 feature（fixture 注入） | DomainValidationError 显式拒绝（保留字与 release feature 冲突 → 失败归因 @scenePlan，诊断指明保留字） | 显式失败 | 干净 | **本 story 新增**：矩阵 6 的产品路径面 |
| 13 | volumes 一致性校验 | 手工构造 volumes 与 scenes 不一致（镜头 id 集合/顺序不符、时长越窗、缺 intro/outro、intro/outro 不在首/末卷） | `validateReleasePackageRelations` 显式拒绝（schema 聚合校验） | schema 拒绝 | 干净 | **本 story 新增**：domain.test 聚合用例 |
| 14 | 0 feature release | release.features=[] 被既有 schema min(1) 拒绝 | 行为不变（intro/outro 不会出现在空 feature 集上） | schema 拒绝 | 干净 | **既有**：domain.test 既有用例零改动 |
| 15 | 真实 `--tts` 手动段（可选） | PM 本机真实 TTS run | intro/outro 场景照常合成 MP3；narration.json 恰一对应全部镜头 | 按 4.1 矩阵口径 | **真实** | Verification 手动段（非验收必需，网络可选） |

</frozen-after-approval>

## Code Map

- `packages/core/src/durationOrchestration.ts` -- **新建**（核心交付，纯函数模块）：`INTRO_OUTRO_MIN/MAX_SECONDS = 10/15`、`FEATURE_MIN/MAX_SECONDS = 12/20`、`VOLUME_LIMIT_SECONDS = 90`（常量逐条注明 spec「按特性数量编排时长」与 R8）；`INTRO_FEATURE_ID = "intro"`、`OUTRO_FEATURE_ID = "outro"` 保留字常量；`plannedFeatureDurationSeconds(narration)` ——确定性取 16s（窗口中值取整；首版不按文本长度推导，见决策 2）；`buildIntroOutroScenes(release)` 生成开场/结尾镜头（id `scene-intro`/`scene-outro`、narrationSource `generated`、标题与旁白文案常量）；`estimateTotalSeconds(scenes)` = Σ plannedDurationSeconds；`planVolumes(scenes, limit = 90)` 贪心：按序累计，下一镜头放不进当前卷则开新卷；单镜头 > limit 抛 `DurationOrchestrationError`；返回 `[{ scenes: [...] }]`（卷内镜头为 scenePlan.scenes 的子序列视图）。文件头注释声明「本模块是 spec R8 的唯一编排实现；4.3 renderer 消费其输出的 volumes 结构」。
- `packages/core/src/domain.ts` -- **修改**（三处增量，全部向后兼容）：①`sceneSchema.featureId` 语义扩展——featureId 允许保留字 `intro`/`outro`（schema 层不特判，引用校验层处理，见③）；sceneSchema 注释更新「duration orchestration landed in Story 4.2」；②`renderManifestSchema` 增加可选 `volumes: z.array(volumeSchema)`（`volumeSchema = { index: int ≥1, sceneIds: array(sceneIdSchema).min(1), plannedTotalSeconds: number > 0 }`，`.strict()`；`renderManifestSchema.superRefine`：volumes 存在时 sceneIds 拼接必须与 scenes 恰一对应（无遗漏/重复/乱序）——卷是 scenes 的纯视图）；③`validateReleasePackageRelations` 增量：`collectFeatureIds` 纳入 `intro`/`outro` 保留字（等价于引用校验自动放行），同时新增规则——release.features 出现 id `intro`/`outro` 时显式拒绝（`release.features` 路径报「reserved feature id」）；manifest.volumes 与 scenePlan 同在时校验卷时长/窗口一致性（feature 镜头 12–20、intro/outro 10–15、逐卷 ≤90）；scenePlan 含 intro/outro 场景时校验位置恰为首/末场景。`releasePackageSchema` 的 manifest 字段类型随 schema 自动扩展，零改动。
- `packages/core/src/durationOrchestration.test.ts` -- **新建**：窗口常量断言（intro/outro ∈[10,15]、feature ∈[12,20]、limit=90）；1/3/6 feature 分卷矩阵（矩阵 1/2/5/7）；恰好 90s 不拆分（矩阵 3）；单镜头超限显式错误（矩阵 6）；确定性断言（同输入两次调用 deepEqual）。
- `packages/core/src/ports.ts` -- **修改**：`createMockScenePlanner` 升级——场景序列 = intro + 每 feature 一镜头 + outro（duration 由 `durationOrchestration` 常量给出：intro/outro 12s、feature 16s；gated fallback 语义原样保留）；`createMockRenderer` 升级——调用 `estimateTotalSeconds` + `planVolumes` 产出带 `volumes` 的 manifest（>90s 自动多卷）。两函数行为变化即**契约修订**本体，需用户批准（决策 4）。`RendererPort`/`ScenePlannerPort` 类型签名零改动。
- `packages/core/src/testing.ts` -- **修改**：`sampleScene` 保留 15s（既有 12 处测试引用零改动）；新增 `sampleOrchestratedScenePlan(release)` helper 供新用例使用（intro/outro + 16s feature 镜头），不触碰既有 helper。
- `packages/core/src/orchestrator.ts` -- **修改**（最小增量）：manifest 阶段 `store.recordArtifact` 之前补 `validateReleasePackageRelations({ release, ...(evidencePack ? { evidence } : {}), ...(gateResult ? { gate } : {}), ...(desktopActions ? { actions } : {}), scenePlan, ...(narration ? { narration } : {}), manifest })`——沿 4.1 narration 聚合校验先例；实现时按各可选 stage 实际产物有条件组装（与 desktop 阶段既有组装模式同构）。主干执行顺序零改动。
- `packages/core/src/index.ts` -- **修改**：导出 `volumeSchema`、`DurationOrchestrationError`、durationOrchestration 公开函数与常量。
- `packages/core/src/domain.test.ts` -- **修改**：新增 volumes superRefine 用例（矩阵 13：拼接待续校验不一致拒绝）+ 保留 featureId 拒绝用例（矩阵 12 的 domain 面）。
- `packages/core/src/orchestrator.test.ts` -- **修改**：新增 1/6 feature 集成用例（矩阵 1/5 的 orchestrator 面）；既有 mock 15s 断言（orchestrator.test.ts:244 的自定义 planner 注入）不触产品路径，保留。
- `packages/core/src/ports.test.ts` -- **修改**：mock planner/renderer 升级后契约断言全量更新（镜头数 = features+2、时长窗口、volumes 结构）。
- `packages/core/src/e2e.test.ts`、`packages/core/src/runStore.test.ts`、`packages/cli/src/e2e.test.ts` -- **修改**：反解析断言照旧通过（schema 扩展兼容）；新增 volumes 字段存在性断言；字节稳定断言在新内容上继续锁定。
- `packages/cli/src/main.test.ts` -- **修改**：`--tts` fake 用例更新为 3 场景（mock release 1 feature → intro/feature/outro）narration 恰一对应（矩阵 4）。
- `packages/cli/src/releaseSource.test.ts` -- **修改**：5 文件契约断言集合不变；新增 scene.json 含 intro/outro、manifest.json 含 volumes 的内容断言（矩阵 9）。
- `packages/cli/src/edgeTtsNarration.ts` -- **修改**（顺手项 1，唯一非 4.2 语义改动）：删除死代码 `quarantineNarrationFile`（export 无任何引用，内部 quarantine 逻辑独立存在于 synthesize 失败路径——实查 4.1 复核移交）；删除后 `import { rename }` 若仅剩失败路径使用则保留、否则一并收敛；`pnpm lint`/`typecheck` 全绿为完成条件。
- `packages/cli/tsconfig.json` -- **修改**（顺手项 2）：`exclude` 增加 `"src/desktopFixtures.ts"`（实查：该文件仅被 4 个 `.test.ts` 引用、产品代码零引用；`pnpm build` 后 `dist/desktopFixtures.js|d.ts` 现已落盘为 dead code）。验证：`pnpm build` 通过且 `dist/` 不含 desktopFixtures.*、`pnpm test` 全绿（vitest 不走 tsc include，不受 exclude 影响）。
- `openspec/changes/showcraft-release-video-mvp/specs/localized-video-composition/spec.md` -- 验收语义权威（Requirement「按特性数量编排时长」）。**本 story 零 spec delta**；`validate --strict` 继续通过。
- `openspec/changes/showcraft-release-video-mvp/design.md` -- 「媒体生成合同」（超过 90 秒在 feature 边界拆分，而不是截断镜头）。**不修改**；决策 3 的建模选择是对该合同的实现细化，非合同变更。

## Tasks & Acceptance

**Execution:**
- [ ] `packages/core/src/durationOrchestration.ts` + `durationOrchestration.test.ts` -- 常量、intro/outro 构造、estimate、planVolumes 纯函数；完成条件：矩阵 1/2/3/5/6/7 纯函数层用例全绿、确定性断言通过；`pnpm typecheck` 通过。
- [ ] `packages/core/src/domain.ts` + `index.ts` + `domain.test.ts` -- volumes schema、superRefine、保留字规则、聚合校验；完成条件：矩阵 12/13 用例全绿；既有 domain 用例零回归。
- [ ] `packages/core/src/ports.ts` + `testing.ts` + `ports.test.ts` -- mock planner/renderer 时长编排升级（**契约修订提交点**）；完成条件：ports.test 更新后全绿；1/3/6 feature 的 scene/manifest 内容断言通过。
- [ ] `packages/core/src/orchestrator.ts` + `orchestrator.test.ts` + `runStore.test.ts` + core e2e -- manifest 聚合校验与集成矩阵；完成条件：矩阵 1/5/8/10/11 集成层全绿；既有 278 用例中除契约修订断言外零回归。
- [ ] `packages/cli/src/main.test.ts` + `releaseSource.test.ts` + cli e2e -- CLI 层修订后契约锁定与 `--tts` 扩展用例；完成条件：矩阵 4/9 用例全绿；mock 4 文件 / `--source` 5 文件集合断言继续通过（内容为修订后契约）。
- [ ] 顺手项：`quarantineNarrationFile` 删除 + cli tsconfig exclude desktopFixtures；完成条件：`pnpm build` 后 dist 无 desktopFixtures.*，lint/typecheck/test 全绿。
- [ ] 全量验证：见 Verification 段命令清单全部通过。

**Acceptance Criteria:**
- Given 1/3/6 个 feature 的 release（mock 与纯函数注入两种输入形态），when run mock pipeline，then scenePlan 含 intro + N feature + outro 镜头、manifest.volumes 在 40s/72s/120s 下分别为 1/1/2 卷、每卷 ≤90s、单镜头不跨卷、卷序与场景顺序一致（spec「多特性视频拆分」Scenario 语义）。
- Given 预估总时长恰好 90s，when planVolumes，then 不拆分（「超过 90 秒」严格大于语义锁定）。
- Given `--tts`（fake 注入），when run，then narration.scenes 与 scenePlan.scenes（含 intro/outro）恰一对应——产物集合变化已由用户批准的契约修订覆盖。
- Given 修订后契约，when 重复运行，then mock 4 文件 / `--source` 5 文件集合与 artifacts 顺序不变、新内容逐字节稳定（纯函数确定性）。
- Given `pnpm test` 全量，then 既有 278 用例中非契约修订断言零回归 + 新增用例全绿且全部无网络；`pnpm lint`、`pnpm typecheck`、`pnpm build`、`openspec validate showcraft-release-video-mvp --strict` 全部通过。
- Given dist 检查，when `pnpm build`，then cli dist 不再含 desktopFixtures.*（顺手项 2 完成）；`grep -r quarantineNarrationFile packages/` 无结果（顺手项 1 完成）。

## Implementation Notes

（实施期待研发回填：实际镜头时长常量如有微调、契约修订后各文件字节样例、`--tts` 真实产物计数。）

## Plan Change Log

## Review Triage Log

## Design Notes

**决策 1——开场/结尾镜头的建模（定案）：作为 scenePlan 镜头建模，featureId 使用保留字 `intro`/`outro`；引用校验规则扩展而非豁免。** 论证：(a) spec 语义权威——「系统 SHALL 为开场和结尾分配 10–15 秒」，R8 的时长窗口以「分配」语言指称开场/结尾与 feature 同一计量单位；design.md「媒体生成合同」首句「Scene plan 先固定镜头和中文文案」——开场/结尾有中文文案（4.1 已具备对任意 scene.narration 合成配音与字幕的完整能力），把它们建模为 scenePlan 镜头是唯一让 4.1 交付物（narration 恰一对应 + `--tts` 产物集）无需任何修改即自然覆盖开场/结尾的选择：`--tts` 时 intro/outro 获得 MP3 与 word 级 cues，与「为每个镜头生成中文旁白和同步字幕」（R7 Requirement）逐字一致。(b) 拒绝「清单级元数据」建模（`scenePlan.intro/outro` 独立字段）：R7 要求每个镜头有配音与字幕，元数据形态将迫使 4.1 的恰一对应关系与 4.3 的消费逻辑各自特判 intro/outro，两处消费面扩大；镜头形态则零特判。(c) 拒绝「schema 特例」：把 `sceneSchema.featureId` 改为 optional/union 会让全部 7 处 `assertReferences` 调用点（domain.ts:557-575）以及 gate↔scenePlan 一致性校验承担 nullable 分支——放大面远大于收益。(d) 采纳「引用校验规则扩展」：`collectFeatureIds` 在校验 scenePlan/narration/manifest 场景引用时纳入 `intro`/`outro` 保留字（实现为引用校验的允许集增加两项，而非对特定场景豁免——规则仍全局一致、可单测）；同时新增正向规则：release.features 不得占用 `intro`/`outro`（矩阵 12 显式失败优于静默碰撞——若用户 changelog 恰有同名 section，当前实现必须在 scenePlan 阶段显式拒绝而非产出歧义产物）。(e) mock 字节契约影响：默认路径 scene.json 镜头数 +2、manifest.json 增加 volumes 字段——属决策 4 契约修订的一部分，显式提交用户批准。(f) 对 4.3 前向兼容：Remotion 只读 manifest.volumes + scenes，intro/outro 就是普通镜头（带 featureId 标记），消费端可用 featureId==intro/outro 做样式区分，无需新字段。

**决策 2——时长取值与「预估总时长」口径（定案）：固定值——feature 镜头 16s、intro/outro 各 12s；预估 = Σ plannedDurationSeconds；不引入文本长度推导。** 论证：(a) spec 只约束窗口（12–20 / 10–15），未要求按内容自适应；tasks.md 4.2 的验证对象是「1、3、6 个 feature 的 manifest 行为」——即数量驱动的拆分行为，不是单镜头时长精度。固定 16s（feature 窗口中值向上取整）与 12s（intro/outro 窗口中值）是窗口内最简单的确定性取值。(b) 拒绝「文本长度→时长推导」：规则必须确定、可单测、无网络——字数/秒的经验系数（如 4.2 字/秒）对中文 TTS 的真实时长的预测误差在 4.1 实测中已可见（「这」175ms vs 尾部静音 592ms，cue 末值 5.6s vs 音频 6.192s，偏差 ~10%），推导出的 planned 值既不等于真实音频时长也不比固定值更有信息量，却引入一条需要单独维护与单测的映射规则——违反「避免无必要的抽象」。(c) 预估口径取 **planned 之和**而非真实 `audioDurationMs` 之和，理由有三：①spec 原文「预估总时长超过 90 秒时 SHALL 按特性边界拆分」——「预估」修饰总时长，判断必须发生在合成前；②拆分判断在 renderer（manifest 阶段），而 narration 是可选 stage（无 `--tts` 时不存在 audioDurationMs）——用真实音频做判定会让拆分行为依赖 flag 组合，违反「mock 与无 TTS 路径也要能触发拆分判断」的硬要求；③确定性——planned 之和是纯函数，两次 run 逐字节一致（矩阵 10），audioDurationMs 则随 TTS 输出波动（narration.json 已声明不做字节稳定断言）。(d) 与 4.3 的关系：真实 `audioDurationMs` 的核对（如「卷 planned ≤90 但真实音频和 >95」的报警）属于 4.3 渲染期的消费侧校验，本 story 不预置。(e) 配置面：窗口常量首版不暴露 CLI flag——spec 未要求可调，flag 是纯增量（沿 4.1 决策 5「prosody 不暴露」同构先例）。

**决策 3——系列拆分的数据建模（定案）：单 `manifest.json` 内可选 `volumes` 数组声明分卷；`stageFileNames`/RunStage/产物文件集合零改动；`renderFormatSchema` 版本号不动。** 三选一论证：(a) **多 manifest 文件（拒绝）**：`manifest-01.json`… 要求 `stageFileNames` 单文件映射改为多值或动态映射、`RunStoreCore.recordArtifact` 的 manifest 分支特殊化、run.json 的 artifacts 数组语义扩展、`renderFormatSchema` 或文件命名约定新增——4 处既有合同为同一语义变更联动，且 4.3「Remotion 只消费 manifest」需要重新定义「消费哪一个文件」；(b) **单 manifest + 分组字段（变体，实质同 (c) 但场景重复）**：在 scenes 数组上打 `volumeIndex` 标签被拒——把「卷」这一聚合概念拆散进每个镜头，消费端需自行 group-by 重建卷边界，卷级不变量（每卷 ≤90、无遗漏/重复）无法在 schema 层校验；(c) **单 manifest + volumes 视图（采纳）**：`volumes: [{ index, sceneIds, plannedTotalSeconds }]` 是 scenes 的纯投影（superRefine 强制 sceneIds 拼接与 scenes 恰一对应：无遗漏、无重复、顺序一致）——scenes 保持既有语义（全量镜头序列），volumes 只声明「渲染时如何分组为多个 ≤90s 的视频清单」；4.3 Remotion 按 volumes 逐卷构图，每卷一个 composition；逐字节契约只需修订 manifest.json 一个文件的内容；schema 校验把「卷视图与场景集一致」从消费端约定提升为 domain 不变量（矩阵 13）。(d) 对 4.1 narration 产物的关系：narration 覆盖全部场景（含 intro/outro），分卷 manifest 是其子集视图——卷不改变 scenePlan↔narration 恰一对应，音频/字幕引用进 manifest 仍属 4.3 spec delta，本 story 不预置。(e) 确定性：`planVolumes` 为一维贪心（按序累计，装不下则开新卷），对同一 scenes 输入恒同输出；不追求「最少卷数」（那需要 NP 式搜索，违反最小面）；单镜头 >90s 是不可满足输入，显式抛错（矩阵 6）优于静默产出超限卷——spec 的「不拆分单个特性镜头」在该输入下没有合法解。

**决策 4——mock 字节契约处置（定案：契约修订，需用户批准；不做 opt-in 门控）。** 论证：(a) 事实：4.2 的交付物是「feature 数量驱动的镜头时长与 90 秒系列拆分」，而 mock 路径是 tasks.md 4.2 验证矩阵（1/3/6 feature）的唯一无 TTS 载体——若走 opt-in flag（如 `--duration-orchestration`），则默认路径的 scene/manifest 永远不含编排结果，4.2 的核心语义在默认产品路径上缺席，且 4.3 Remotion 消费的 manifest（默认路径产出）不含 volumes，等于 4.2 只在测试 flag 下存在——与本 story 在管线中的定位矛盾。(b) 契约修订的边界面（全部显式列出）：mock 4 文件 / `--source` 5 文件中 **scene.json 与 manifest.json 内容变化**（镜头数 +2、时长 15→16/12、manifest 增 volumes）；文件集合、artifacts 顺序、release/evidence/gate/actions/run 字节、`--tts`/desktop 的 flag 语义与失败形态全部不变；e2e/releaseSource 的集合断言继续通过，内容级断言更新为新契约并逐字节锁定（矩阵 8/9/10）。(c) `--tts` 产物影响：mock release 1 feature 时 narration 场景 1→3（+intro/outro），mp3 计数 +2——属决策 1 的显式影响面，计入本次修订范围。(d) **此项为「需用户批准」项：计划批准即视为契约修订批准**；若用户否决，回退方案 = opt-in flag 门控（默认路径零变化、4.2 语义仅 flag 路径可见），届时 4.3 消费端需显式启用该 flag——此张力将在用户否决时重新规划。(e) 既有先例：3.3 曾以「媒体类产物不做字节稳定断言」修订过 actions.json 幂等契约的适用边界（PM 验收通过），本修订同属「显式声明 + 全量锁定新契约」模式，非静默破坏。

**决策 5——1/3/6 feature 验证矩阵与拆分算法（定案）。** (a) 时长推演（feature 16s、intro/outro 12s）：1 feature = 12+16+12 = **40s**（不拆）；3 features = 12+48+12 = **72s**（不拆，距 90s 余量 18s）；6 features = 12+96+12 = **120s**（拆 2 卷）。任务书推算的「3 features ≈ 56–90s 上界贴边」风险在本取值下不存在（72s 有余量），贴边由矩阵 3 的恰好 90s 构造用例单独锁定——不依赖真实 3-feature release 恰好落在 90s。(b) 矩阵分层：纯函数层（durationOrchestration.test，构造任意 scenes 序列，覆盖 1/3/6、=90、>90、单镜头超限、多镜头跨卷）+ orchestrator 集成层（注入 planner 的 1/6 feature run，断言 manifest.volumes）+ CLI 层（mock run 与 `--source` fixture run 的产物内容断言；fixture 为 1 feature，故 CLI 层 6-feature 用 mock release 的 6-feature 变体走 runPipeline 装配）。(c) 每卷 ≤90s 与单镜头不跨卷由 planVolumes 不变量直接保证并逐卷断言；「不拆分单个特性镜头」的完整语义 = 镜头不跨卷（单 feature 多镜头时可跨卷，矩阵 7 澄清）。(d) CLI 验证命令（无网络）：`pnpm demo -- --output runs`（mock 4 文件）与 `pnpm demo -- --source <fixture changelog> --output runs`（5 文件）+ 新增 e2e 断言；6-feature 场景以测试内注入完成，无需真实 changelog。(e) 全部矩阵行执行条件为「干净」，真实网络仅剩可选手动段（矩阵 15，非验收必需）。

**顺手项处置（定案：两项均纳入）。** ①`quarantineNarrationFile`（edgeTtsNarration.ts:429-434）：全仓唯一出现点即定义处，export 零引用（4.1 复核移交定性「死代码」实查成立；`.failed` 改名的产品路径是 synthesize 内联实现，不经过该函数）——删除，验证 = grep 无结果 + 全量测试绿。②`desktopFixtures.ts` 进 cli dist：实查 247 行 fixture 构建代码（git init/http server/临时目录管理）仅被 4 个 `.test.ts` 引用、产品代码零引用，`pnpm build` 实测 dist 落盘 `desktopFixtures.js`+`d.ts`——cli tsconfig exclude 增加该文件，验证 = build 后 dist 无此文件 + 4 个测试文件照常全绿（vitest 直读 src，不走 tsc include；`typecheck` 走同一 tsconfig，需确认 exclude 不影响测试文件对它的类型解析——test 文件不在该 tsconfig include 内，由 vitest/tsx 即时转译，无影响）。风险：未来产品代码若需引用 fixtures 将被 typecheck 拒绝——这是期望行为（fixture 不应进生产路径）。

**风险清单。** R1（低）：保留字 `intro`/`outro` 与真实 changelog section 撞名 → 矩阵 12 显式拒绝。诊断信息需指明「release feature id 与开场/结尾保留字冲突，请改写该 section 标题」；发生概率低（需用户 section 标题恰为这两个词），失败可诊断可恢复。R2（低）：volumes superRefine 与 planVolumes 双处维护卷一致性——由「planVolumes 是唯一 volumes 生产者、mock renderer 是唯一产品调用方」约束；若 4.3 引入第二个生产者，校验自动成为其合同的验收器，方向正确。R3（低）：16s/12s 取值未来需按真实 TTS 时长校准——预留调整点在 durationOrchestration 常量（单文件单点），4.3 实测后如需文本长度推导再引入（决策 2 已论证其成本，不提前）。R4（中）：契约修订涉及面广（两包 6 个测试文件的内容断言）——实施时以「先升级 mock + 新契约断言、再逐文件修复既有断言」顺序推进，避免中间态红海；全部改动一次 PR 内完成，回滚 = revert 单个 merge。R5（低）：orchestrator manifest 阶段新增聚合校验对 `--source`+`--desktop` 组合路径的影响——该校验只读既有产物做关系断言，desktop media 直写文件不在校验范围（media 引用校验属 3.3 既有 refine），不新增失败面。

**范围限定（重申）。** 只做 4.2：时长编排 + 90 秒系列拆分 + 1/3/6 验证矩阵 + 两项顺手清理。不做 4.3（Remotion composition / MP4 渲染 / manifest 音视频引用）；不做 epic 5；不做 DeepMatch 网站录屏（ARCH-234，挂起排 epic 4 之后）；不改既有 spec（无 spec delta）；narration port/stage/`--tts` 语义零改动（产物集合变化属决策 1/4 显式批准面）；desktop 路径零改动；不新增 npm 依赖；不引入 CI 平台依赖；不做 Windows 语义；不暴露时长/语速/音调配置。

## Verification

**Commands（实施期，全部本地无网络）:**
- `pnpm lint` -- expected: 新增/修改源码与测试满足 lint 规则（含删除死代码后无 unused import）。
- `pnpm typecheck` -- expected: 无 TypeScript 错误（含 cli tsconfig exclude 变更后）。
- `pnpm build` -- expected: 构建通过且 `packages/cli/dist/` 不含 desktopFixtures.*（顺手项 2 验证）。
- `pnpm test` -- expected: 既有 278 用例中非契约修订断言零回归 + 新增用例全绿（durationOrchestration 矩阵 ~8–10、domain volumes/保留字 ~5、ports 契约更新 ~3、orchestrator 集成 ~3、CLI 层 ~4；实施期回填总数）；新增用例全部无网络依赖。
- `openspec validate showcraft-release-video-mvp --strict` -- expected: 通过（无 spec delta）。

**1/3/6 feature 矩阵断言（`pnpm test` 内强制，无网络）:**
- 1 feature（40s）：volumes 恰 1 卷、卷内 3 镜头（intro/feature/outro 顺序）。
- 3 features（72s）：volumes 恰 1 卷、卷内 5 镜头。
- 6 features（120s）：volumes 2 卷、每卷 plannedTotalSeconds ≤ 90、sceneIds 拼接 = 全部 sceneId 无遗漏/重复/乱序、任一镜头的 sceneId 仅出现在一个卷中（单镜头不跨卷）。
- 恰好 90s：不拆分（单卷）。
- 单镜头 120s：DurationOrchestrationError 显式失败。
- 既有契约断言（决策 4 结论 = 契约修订）：修订后 mock 4 文件 / `--source` 5 文件集合断言（既有用例）+ 修订后内容断言（scene.json 镜头数与时长、manifest.json volumes 结构）全量锁定；重复 run 逐字节稳定断言在新内容上继续通过。

**真实网络验证（可选手动段，非验收必需）:**
- `pnpm demo -- --source <本地 markdown> --tts --output runs` -- expected: run completed；intro/outro 场景各得 1 个 MP3 与 narration.json 条目（恰一对应 scenePlan 全部场景）；manifest.json 含 volumes。
