---
title: 'Remotion composition 消费 manifest 渲染 MP4'
type: 'feature'
ticket: '12'
created: '2026-10-18'
status: built
baseline_revision: 23ed91978e1b06ec9568d3d1d7889d624d3795d2
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

**Problem:** tasks.md 4.3「创建 Remotion composition 并消费 manifest，验证 v0.3.3 感知/IM 样本可预览或渲染 MP4」在基线 `agent/agent/arch-221` @ `23ed919`（epic 1–3 + 4.1 + 4.2 完整交付，316 用例全绿）上尚无任何实现：manifest 的消费端只有测试断言，design.md「媒体生成合同」中「Remotion 只消费 manifest」的 renderer 未落地；4.2 已交付 `manifest.volumes` 分卷视图与 intro/outro 镜头（单 manifest、镜头数 = features+2、每卷 ≤90s），4.1 已交付 `narration.json`（per-scene `audioFile`/`audioDurationMs`/word 级 cues）与 MP3 音轨——但 manifest schema 本身不含音频/字幕/媒体引用字段，run 目录中也没有任何视频产物。R8 时长规则（每卷 ≤90s）与 R7 音轨已有上游保证，本 story 是把它们变成「可看、可审、可存」的 MP4 的最后一环（preview server 与审核命令属 epic 5，不做）。

**Approach:** 新增 core `compositionSchema` 声明与 cli Remotion renderer adapter，沿「core 定义合同、adapter 做实现、CLI 装配」的既有分层：**(a) core domain 扩展（spec delta）**——`renderManifestSchema` 增加可选 `composition` 字段（`{ format: "showcraft.remotion/v1", volumes: [{ index, durationSeconds }], … }` 的聚合声明，供 Remotion 端按卷构图；schema strict + superRefine 与 `volumes`/scenes 恰一对应），`renderFormatSchema` 扩展第二枚举值 `showcraft.remotion-manifest/v1`（沿 4.2「卷是 scenes 纯视图」同构模式；mock renderer 零改动，manifest.json 默认路径字节零变化）；**(b) cli 新建 `packages/cli/src/remotionRender.ts` adapter**——读 run 目录的 `manifest.json` + `narration.json`（若存在），按 manifest.volumes 逐卷构建 Remotion composition（每卷一个 MP4：`video-volume-N.mp4`），`calculateMetadata` 由 inputProps 驱动每卷时长（`plannedTotalSeconds × fps`），镜头画面用中文标题/旁白文字卡（v0.3.3 `--source` 无 `--desktop` 路径没有真实媒体可叠加；`--tts` 时每镜头 `<Audio src>` 挂对应 MP3），props 与字幕 cue 数据从 run 产物注入 composition（Remotion 只读 run 目录文件，不反向修改）；**(c) CLI `--render` 显式 opt-in flag**（沿 `--tts` 惯例：缺省关闭时产物集合与字节零变化），渲染成功把 MP4 文件名与卷映射记入 run 产物（`composition.json`，新 RunStage `composition` + `stageFileNames` 增量——4.1 narration stage 建模先例的第四次复用）；失败形态（浏览器缺失/渲染抛错/磁盘写入失败）→ run 显式失败 @composition、已完成产物保留、无伪成功 MP4。**本 story 含 spec delta**（localized-video-composition capability 新增「渲染视频」Requirement——spec 原文只覆盖时长编排与音轨，未覆盖渲染输出；delta 修改走 openspec change 流程，`validate --strict` 在新 delta 上通过）。验证矩阵：1/3/6 feature 的 v0.3.3 样本（mock 与 `--source` 两形态）渲染 1/1/2 卷 MP4、逐卷时长 = plannedTotalSeconds ±1s、`--tts` 时音画同步断言（cues 与音频轨同源），全部可无网络交付（真实渲染本地完成；Chrome Headless Shell 一次性下载属安装步骤非运行依赖）。

**规划期可行性实测（2026-10-18，本机 Node v24.21.0 / Darwin arm64 M5，throwaway 探针 `/tmp/remotion-probe`，未落盘于树）：**
1. `remotion@4.0.536`（stable，2026-10-16 发布；5.0 仅 alpha）+ `@remotion/bundler` + `@remotion/renderer` + `react@19.3.1`：安装成功，单 zod 4.5.4（与 workspace zod ^4.6.5 同 4.x 主版本，pnpm 可共存）。
2. `bundle()` + `selectComposition()` + `renderMedia({ codec: "h264" })`：30f/1280×720 纯文字卡 MP4 headless 渲染 ~3.5s 成功；`frameRange` 局部渲染成功；无需系统 ffmpeg（`@remotion/compositor-darwin-arm64` 自带 ffmpeg n7.1 + dylib）。
3. `<Composition calculateMetadata>`：inputProps `{ totalSeconds: 4 }` → durationInFrames 120 → 4.000s MP4（mvhd 实测 4000/1000）——props 驱动逐卷时长成立。
4. `<Audio src={staticFile("tone.wav")}>` + `renderMedia`：产物 MP4 含 `mp4a` 音轨（1.003s）——音轨混流成立，无需系统 ffmpeg。
5. `remotion studio`：HTTP 200 可服务（epic 5 预览可复用其 player 而非 studio 进程；本 story 不起 studio 常驻进程）。
6. 首次渲染自动下载 Chrome Headless Shell ~171MB 至 `<workspace-root>/node_modules/.remotion/chrome-headless-shell`（`getDownloadsCacheDir` 向上找 package.json；node_modules/ 已 gitignore；后续运行走缓存）。磁盘足迹：node_modules ~964MB（含 chrome shell 576MB 解压后）。
7. 许可：Remotion v4 Free License 覆盖个人与 ≤3 人组织商用；`licenseKey` 在 v4 为 optional（探针渲染全程未传 key）。作为计划输入记录，供用户知情；不是本 story 的实施阻塞。

## Boundaries & Constraints

**Always:** Remotion 只消费 run 目录既有的 `manifest.json`/`narration.json`/音频文件——renderer 不读取 release/evidence/gate/actions（消费面 = 4.2 决策 3 的「volumes + scenes」设计合同）；逐卷渲染 = manifest.volumes 逐项构图，每卷 MP4 时长由该卷 `plannedTotalSeconds` 唯一决定（`calculateMetadata` 纯函数推导，禁止在 composition 内用时钟/随机）；音画同步数据源唯一 = `narration.json` 的 cues 与 audioDurationMs（4.1 word 级原始事实，渲染端不重新估算、不截断）；`--render` 缺省关闭时 mock 4 文件 / `--source` 5 文件契约与既有 316 用例零回归（沿用 `--tts` opt-in 惯例）；渲染失败显式失败 @composition、诊断有界（≤2048）、已完成产物保留、不产生伪成功 MP4；新 RunStage/composition.json 走 RunStoreCore schema 校验通道（gate/actions/narration 同一惯例）；新增依赖锁定精确版本（remotion@4.0.536 系列同一版本号，react/react-dom 与 Remotion peer range 一致）；每项改动面在 Code Map 显式标注。

**Never:** 不做 epic 5（preview server / loopback HTTP / 审核命令——5.1/5.2 范围；本 story 的「预览」语义由「渲染出的 MP4 文件在 run 目录可直接播放」承载，HTTP 预览留给 epic 5）；不做 DeepMatch 网站录屏（ARCH-234 挂起）；不改 4.2 既有编排语义——durationOrchestration、planVolumes、volumes superRefine、mock planner/renderer 行为零改动；不改 narration port/stage/`--tts` 产物契约（edgeTtsNarration.ts 协议层零改动）；desktop 路径零改动（desktopActions/desktopLifecycle/desktopFixtures 行为不动；本 story 不叠加真实 `.mov` 录屏素材到画面——`--desktop`+`--render` 组合的媒体叠加留待后续 story，首版渲染以文字卡 + TTS 音轨为完整闭环）；不动 runStageOrder 既有 7 stage 的顺序与语义（只在尾部追加 `composition` 可选 stage，沿 narration 先例）；不把 Remotion Studio 集成进产品路径（studio 仅开发期工具，`renderMedia` 编程式渲染是唯一产品路径）；不做云渲染/分布式渲染/渲染队列；不做 Windows 语义（首版验证 darwin arm64；`@remotion/compositor-*` 平台包按 optional deps 自动解析，不做平台特判代码）；不暴露分辨率/fps/码率 CLI flag（首版常量 1280×720@30fps，spec 未要求可调）；不做字幕硬编码烧录之外的样式系统（首版把 cue 文本按句聚合为底部字幕条，聚合是渲染端展示决策——4.1 决策 3 预留的消费侧选择在此落地，不改动 cues 原始数据）；不做渲染结果与真实音频时长的二次校准报警（4.2 决策 2(d) 留给消费侧的核对若实施，仅作诊断输出不做失败语义——实际首版不做，避免超范围）；不把 Chrome Headless Shell 下载逻辑写进测试（CI/测试环境用已缓存浏览器；下载是首次本地运行的安装事实，测试矩阵全部注入或断言跳过策略）。

## I/O & Edge-Case Matrix

「执行条件」列：**干净** = 无网络、无凭据、无 TTS 即可在 `pnpm test` 全绿（渲染类测试用 fake/stub 或标记隔离；见矩阵备注）；**真实** = 需要本机已安装依赖与 Chrome Headless Shell 缓存（实施期一次性执行并记录产物指纹）。

| # | Scenario | Input / State | Expected Output / Behavior | Error Handling | 执行条件 | 覆盖来源 |
|---|----------|---------------|----------------------------|----------------|----------|----------|
| 1 | 1 feature mock 渲染 | mock run + `--render`（1 feature，40s 单卷） | `video-volume-1.mp4` 产出，时长 40s±1s，1280×720@30fps，1200 帧；composition.json 记录卷映射 | 无错误 | 干净（渲染 stub）+ 真实 | **本 story 新增**：adapter 单测 + 实施期真实渲染 |
| 2 | 3 features `--source` 渲染 | v0.3.3 fixture `--source` + `--render`（72s 单卷） | `video-volume-1.mp4` 72s±1s；镜头序列 intro/feature×3/outro 与 manifest.volumes[0].sceneIds 一致 | 无错误 | 干净（渲染 stub）+ 真实 | **本 story 新增** |
| 3 | 6 features 拆卷渲染 | 注入 6-feature release + `--render`（120s → 2 卷） | `video-volume-1.mp4`（76s）+ `video-volume-2.mp4`（44s），逐卷 ≤90s、卷序 = manifest.volumes 顺序 | 无错误 | 干净（渲染 stub）+ 真实 | **本 story 新增**：spec「多特性视频拆分」渲染面 |
| 4 | `--tts` + `--render` 音画同步 | `--tts`（fake 注入 3 场景）+ `--render` | 每镜头 `<Audio>` 引用 `narration-<sceneId>.mp3`；composition.json 记录 audioFiles；字幕条按 cues 聚合显示 | 无错误 | 干净（fake 音频 + stub 渲染） | **本 story 新增**：R7 消费面 |
| 5 | `--render` 缺省 | mock run 无 flag | 产物集合与 4.2 修订后契约逐字节一致（4 文件）；composition stage 不进入；316 用例零回归 | 无错误 | 干净 | **既有**：e2e 字节锁定继续全绿 |
| 6 | 无 narration 渲染 | `--render` 且无 `--tts` | 纯文字卡 MP4（无音轨或静音轨）；不要求 narration.json 存在 | 无错误 | 干净 | **本 story 新增**：renderer 对可选产物的容错 |
| 7 | manifest 无 volumes | 手工构造 legacy manifest（无 volumes 字段）+ `--render` | 显式失败 @composition（诊断：manifest 缺少 volumes，无法逐卷渲染——4.2 合同是 volumes 的唯一生产者，legacy 输入不受支持且可诊断） | 显式错误 | 干净 | **本 story 新增**：拒绝静默全片渲染 |
| 8 | narration 与 manifest 场景不一致 | `--tts` 产物 sceneId 集合 ≠ manifest.scenes | 聚合校验（validateReleasePackageRelations 已有）在 narration 阶段先行拒绝；renderer 不重复校验 | schema 拒绝（既有） | 干净 | **既有**：4.1/4.2 聚合校验覆盖 |
| 9 | 渲染进程失败 | 注入 renderMedia 抛错（fake renderer 层） | run 显式失败 @composition、failure.reason 含原始诊断（有界）、已落盘产物保留、无 MP4 引用写入 composition.json | 显式错误 | 干净 | **本 story 新增**：失败语义沿 narration 先例 |
| 10 | 浏览器缺失 | Chrome Headless Shell 未缓存且下载不可达 | 失败诊断指向 `npx remotion browser ensure`（或等价一次性安装命令），失败 @composition、无伪成功 | 显式错误 | 真实（手动段） | **本 story 新增**：安装期可诊断性 |
| 11 | 单卷时长推导一致性 | 对每卷 `calculateMetadata` 推导帧数 | frames = round(plannedTotalSeconds × 30)；MP4 实际时长误差 ≤1s（h264 帧对齐） | 无错误 | 真实 | **本 story 新增**：时长合同验收 |
| 12 | 音频长于镜头 planned | 构造 narration audioDurationMs > plannedDurationSeconds×1000 | 首版显式失败 @composition（诊断：场景 X 音频 Y ms 超过 planned Z s——音画合同冲突，显式暴露优于静音截断或溢出串音；4.1 实测 cue 末值 ≤ 音频时长的 ~90%，正常 TTS 输出不会触发） | 显式错误 | 干净 | **本 story 新增**：音画合同负向面 |
| 13 | 字幕 cue 聚合 | word 级 cues 聚合为句级字幕条 | 按标点/时长窗口聚合的确定性纯函数（单测锁定；不改 narration.json 原始数据）；cue 末值 > audioDurationMs×1.05 已被 4.1 schema 拒绝 | 无错误 | 干净 | **本 story 新增**：4.1 决策 3 消费侧落地 |
| 14 | composition.json schema | 手工构造非法 composition.json（卷数与 manifest.volumes 不符、帧数/时长为负、缺 volume 映射） | recordArtifact 通道拒绝（DomainValidationError） | schema 拒绝 | 干净 | **本 story 新增** |
| 15 | `--desktop` + `--render` 组合 | v0.3.3 `--source --desktop --render`（如有真实录屏 media） | 首版明确诊断：media 叠加未支持，按矩阵 6 语义渲染文字卡（不读取 actions media；显式声明非静默丢弃） | 无错误（显式声明） | 真实（手动段，可选） | **本 story 新增**：组合边界显式化 |
| 16 | 渲染产物字节稳定 | 同一 run 目录重复渲染 | 逐卷 MP4 逐字节稳定（Remotion 渲染确定性 + 固定常量；h264 编码器版本固定于 compositor 包）——声明为验收断言 | 无错误 | 真实 | **本 story 新增** |
| 17 | run 产物追溯 | 任意渲染 run | composition.json 含 runId、逐卷 {index, mp4File, durationSeconds, sceneIds}；run.json artifacts 顺序含 composition.json（渲染成功时） | 无错误 | 干净 | **本 story 新增** |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain.ts` -- **修改**（spec delta 的 schema 载体）：①`renderFormatSchema` 扩展为 `z.enum(["showcraft.mock-manifest/v1", "showcraft.remotion-manifest/v1"])`；②新增 `compositionVolumeSchema`（`{ index: int ≥1, durationSeconds: number >0, sceneIds: array(sceneIdSchema).min(1) }`，strict）与 `compositionSchema`（`{ format: z.literal("showcraft.remotion/v1"), volumes: array(compositionVolumeSchema).min(1) }`，strict + superRefine：卷 index 连续、sceneIds 拼接与 manifest.scenes 恰一对应）；③`renderManifestSchema` 增加可选 `composition: compositionSchema`，superRefine 增量：composition.volumes 与 manifest.volumes 恰一对应（逐卷 index 与 sceneIds 相等、durationSeconds 与 plannedTotalSeconds 相等）；④`releasePackageSchema.manifest` 随 schema 自动扩展零改动；⑤`validateReleasePackageRelations` 不新增规则（卷一致性已由 manifest superRefine 承担，避免双处维护——4.2 复核已确立「校验放 schema 聚合层」的分界）。`Composition`/`CompositionVolume` 类型导出。
- `packages/core/src/runStore.ts` -- **修改**（沿 4.1 narration stage 先例）：`RunStage` 联合增加 `"composition"`；`runStageOrder` 尾部追加；`stageFileNames.composition = "composition.json"`。既有 7 stage 顺序与文件名零改动。
- `packages/core/src/orchestrator.ts` -- **修改**（最小增量）：新增 Optional `compositionPort`（类型 `CompositionPort = (run: { runDirectory: string; manifest: RenderManifest; narration?: NarrationArtifact }) => Promise<CompositionResult>`——端口形状在实施期按 RunStoreCore 的 run 目录访问面微调，frozen 语义 = 输入只含 manifest 与 narration 的消费面、输出为卷映射产物）；在 manifest 阶段之后、`store.complete()` 之前 `if (ports.compositionPort)` 块：调用、聚合校验（若产物含跨对象引用）、`store.recordArtifact({ stage: "composition", value })`。缺省不注入时零行为变化。
- `packages/core/src/index.ts` -- **修改**：导出 compositionSchema/compositionVolumeSchema/类型与 RunStage 扩展（随既有导出惯例）。
- `packages/core/src/domain.test.ts` -- **修改**：composition schema 合法/非法矩阵（矩阵 14）+ renderFormat 新枚举值解析 + composition↔volumes 一致性 superRefine 用例；既有用例零回归。
- `packages/core/src/orchestrator.test.ts`、`packages/core/src/runStore.test.ts` -- **修改**：composition stage 的 Optional 语义用例（不注入 → 产物集合不变；注入 → artifacts 追加）；runStageOrder/stageFileNames 断言更新（既有断言锁定 7 stage，本 story 扩为 8 stage——契约变更在计划内显式声明）。
- `packages/cli/src/remotionRender.ts` -- **新建**（本 story 核心交付）：Remotion adapter。`createRemotionRenderer({ runDirectory, fps?, width?, height? })` → CompositionPort。实现：①读 run 目录 manifest.json/narration.json（经 schema 反解析）；②manifest 无 volumes → 显式失败（矩阵 7）；③`bundle({ entryPoint: <内置 composition 模板> })` + 按 manifest.volumes 逐卷 `renderMedia({ codec: "h264", outputLocation: join(runDirectory, "video-volume-N.mp4"), inputProps: { volume: {...}, scenes: [...], cues: [...] } })`——composition 模板用 `calculateMetadata` 从 props 推导 durationInFrames；④每镜头文字卡（标题 + 旁白摘录 + intro/outro 样式区分）+ 可选 `<Audio src={staticFile(narration-<id>.mp3)}>` + 底部字幕条（cue 聚合纯函数，见 subtitleGrouping.ts）；⑤失败包装为有界诊断（沿用 NarrationError 形态的 phase/diagnostics 模式，phase="render"）；⑥音频 > planned 的合同检查（矩阵 12）在渲染前逐场景执行，纯函数可单测。
- `packages/cli/src/remotionComposition/` -- **新建目录**（Remotion 组件，tsconfig include 需覆盖或用独立 tsconfig——实施期按 cli tsconfig 既有 exclude/include 惯例处理，测试文件照旧 vitest 直读）：`Root.tsx`（Composition 注册，id 常量 `showcraft-volume`）、`VolumeComposition.tsx`（逐卷时序：`<Sequence>` 按场景拼接，文字卡 + Audio + 字幕条）、`subtitleGrouping.ts`（cue→句级字幕条确定性聚合纯函数，无 React 依赖可独立单测）、`volumeProps.ts`（manifest.volumes + narration → per-volume inputProps 的纯函数映射，单测锁定）。**注意**：.tsx 组件不进 `pnpm build` 的 tsc dist（cli tsconfig exclude 或独立构建；产品运行时通过 `bundle()` 现场转译——bundle 是 webpack/rspack 打包器，接受 ts/tsx 源码，无需预编译）。
- `packages/cli/src/main.ts` -- **修改**：`--render` flag 解析（parseDemoArgs 增量）；`runDemo` 增量——`options.render` 为真时注入 `compositionPort: createRemotionRenderer({ runDirectory })`；`--render` 与产物契约的关系沿 `--tts` 惯例（缺省关闭零变化）。usage 文本更新。
- `packages/cli/src/subtitleGrouping.test.ts`（或并入 remotionComposition 目录测试）-- **新建**：cue 聚合确定性矩阵（矩阵 13）：句边界切分、跨 cue 聚合、空 cues 容错、cue 末值越界容错（schema 已拒，纯函数防御性处理）。
- `packages/cli/src/remotionRender.test.ts` -- **新建**：矩阵 1/3/4/6/7/9/12/17 的 adapter 层用例（renderMedia 注入 fake：类型上 adapter 依赖注入渲染函数，产品路径用真实 `renderMedia`，测试注入 stub——零浏览器依赖全绿）；volumeProps 映射与时长推导纯函数断言（矩阵 11 的推导面）。
- `packages/cli/src/main.test.ts` -- **修改**：`--render` flag 解析用例（含 `--render` 无值、与 `--tts` 组合）；`--render` 缺省时产物集合零变化断言（矩阵 5 的 CLI 面）。
- `packages/cli/src/e2e.test.ts`、`packages/cli/src/releaseSource.test.ts` -- **修改**：矩阵 5 既有字节/集合断言继续锁定（预期零改动全绿）；新增 `--render` stub 注入的 e2e 变体（composition.json 产物断言，矩阵 17）。
- `packages/cli/src/desktopFixtures.ts` 及 desktop 路径 -- **零改动**（Never 声明）。
- `package.json` / `packages/cli/package.json` -- **修改**（唯一依赖变更面，需用户批准）：`packages/cli` dependencies 新增 `remotion@4.0.536`、`@remotion/bundler@4.0.536`、`@remotion/renderer@4.0.536`（三包同版本号精确锁定）、`react@19.3.1`、`react-dom@19.3.1`（devDependencies 或 dependencies 按实施期 resolve——react 组件仅经 bundle() 现场转译进渲染闭包，不进 cli dist）。pnpm-workspace `allowBuilds` 若 esbuild postinstall 需要则增量（现已有 esbuild 条目，预期零改动）。**依赖新增属契约修订级决策，见 Design Notes 决策 2。**
- `openspec/changes/showcraft-release-video-mvp/specs/localized-video-composition/spec.md` -- **修改（本 story 唯一 spec delta）**：新增 Requirement「渲染视频」——系统 SHALL 按 render manifest 的 volumes 逐卷渲染 MP4 视频，每卷时长与 plannedTotalSeconds 一致，`--tts` 时包含对应镜头配音音轨。Scenario：①逐卷渲染（WHEN manifest 含 2 卷 THEN 输出 2 个 ≤90s 的 MP4 且单镜头不跨卷）；②音画同步（WHEN 镜头有配音 THEN 渲染清单引用该音频）。delta 提交与实施同分支，`openspec validate showcraft-release-video-mvp --strict` 在含 delta 状态下通过。
- `openspec/changes/showcraft-release-video-mvp/design.md` -- **不修改**：「Remotion 只消费 manifest」与本 story Approach 一致；`composition` 字段进 manifest 属对该合同的实施细化（manifest 是唯一消费输入），非合同变更。

## Tasks & Acceptance

**Execution:**
- [ ] `packages/core/src/domain.ts` + `domain.test.ts` — renderFormat 扩展、compositionSchema、manifest.superRefine 一致性；完成条件：矩阵 14 用例全绿、既有 domain 用例零回归、`pnpm typecheck` 通过。
- [ ] `packages/core/src/runStore.ts` + `orchestrator.ts` + `index.ts` + 对应测试 — composition Optional stage（RunStage/顺序/stageFileNames/端口/编排增量）；完成条件：不注入时 316 用例零回归；注入时 artifacts 追加与失败归因 @composition 断言全绿。
- [ ] `packages/cli/src/remotionComposition/`（Root/VolumeComposition/subtitleGrouping/volumeProps）+ `subtitleGrouping.test.ts` — composition 模板与纯函数层；完成条件：矩阵 13 纯函数用例全绿、volumeProps 映射断言全绿、tsx 组件不进 tsc dist（`pnpm build` 后 cli dist 无 .tsx 产物）。
- [ ] `packages/cli/src/remotionRender.ts` + `remotionRender.test.ts` — adapter（bundle/renderMedia 编排、失败语义、音频合同检查、渲染函数注入点）；完成条件：矩阵 1/3/4/6/7/9/12/17 adapter 层全绿（stub 注入、无浏览器依赖）。
- [ ] `packages/cli/src/main.ts` + `main.test.ts` + e2e — `--render` flag 装配与 CLI 契约；完成条件：矩阵 5 CLI 面零回归 + `--render` e2e stub 变体全绿。
- [ ] spec delta：localized-video-composition 新增「渲染视频」Requirement + openspec validate --strict 通过。
- [ ] 依赖新增：package.json 变更 + `pnpm install` + 锁文件更新；完成条件：`pnpm lint`/`typecheck`/`build`/`test`/`openspec validate --strict` 全绿。
- [ ] 实施期真实渲染手动段（非 CI）：本机执行矩阵 1/2/3/11/16 的真实 `renderMedia`（mock 1 feature / v0.3.3 `--source` 3 features / 6 features 拆卷），记录每卷 MP4 的 mvhd 实测时长与字节数到实施回报；矩阵 10 的浏览器缺失诊断在首次安装语境下顺带确认。

**Acceptance Criteria:**
- Given mock 1/3/6 feature release + `--render`，when run，then 分别产出 1/1/2 个 `video-volume-N.mp4`，逐卷实测时长 = 该卷 plannedTotalSeconds ±1s（矩阵 1/2/3/11），卷序与 manifest.volumes 一致、单镜头不跨卷（上游 4.2 合同的渲染面复现）。
- Given `--tts`（fake）+ `--render`，when run，then 每镜头画面序列引用其 MP3 音轨、composition.json 记录 audioFiles、字幕条由 cues 确定性聚合（矩阵 4/13）。
- Given 无 `--render`，when 任意既有路径 run，then 产物集合与字节同 4.2 验收基线逐字节一致、316 用例零回归（矩阵 5）。
- Given 渲染中途失败（stub 注入），when run，then run 显式失败 @composition、已完成产物保留、composition.json 不落盘（矩阵 9）。
- Given 依赖新增，when `pnpm install && pnpm build`，then 三包 Remotion 依赖同版本锁定、cli dist 无 .tsx 产物、无系统 ffmpeg 依赖（compositor 自带）。
- Given 全量验证，when `pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm test` / `openspec validate showcraft-release-video-mvp --strict`，then 全部通过（spec delta 在 change 目录内，validate --strict 按含 delta 语义通过）。
- Given 实施期真实渲染段，when 对 v0.3.3 `--source`（感知与 IM 路由样本）+ `--render`，then 产出 72s 单卷 MP4 可直接播放（mvhd 时长核对），作为 tasks.md 4.3「验证 v0.3.3 感知/IM 样本可预览或渲染 MP4」的验收锚。

## Design Notes

**决策 1——manifest 扩展 vs 独立 composition 清单文件（定案：扩展 `renderManifestSchema` 可选 `composition` 字段 + `renderFormatSchema` 增第二枚举值；不新增独立文件、不动 stageFileNames 的 manifest 单文件假设）。** 论证：(a) design.md「媒体生成合同」明文「Remotion 只消费 manifest」——消费输入必须是 manifest 本身或其派生；新增独立 `composition.json` 作为「渲染合同」会引入第二个消费入口，违反单一输入源设计（渲染所需的一切 = volumes + scenes + narration 已在既有产物中）。(b) 但 4.2 的 `volumes` 只有 `{ index, sceneIds, plannedTotalSeconds }`——没有渲染时长与「这份 manifest 是给 Remotion 的」声明；在 manifest 上加可选 `composition` 聚合视图（每卷 durationSeconds + format 标识）与 4.2 决策 3 的「volumes 是 scenes 纯视图」同构：composition 是 volumes 的渲染投影，superRefine 强制恰一对应，零双源风险。(c) renderFormatSchema 扩第二枚举值的语义：mock renderer 产出的 manifest 继续是 `showcraft.mock-manifest/v1` 且**不含 composition**（mock renderer 零改动、默认路径字节零变化）；Remotion 渲染成功后写回的 composition.json（run 级产物）与 manifest 的 format 无关——**修正**：composition 字段由谁写入？→ 本 story 决策：composition 字段由 renderer adapter 在渲染成功后写回 manifest.json（`renderFormatSchema` 升级为 `showcraft.remotion-manifest/v1` 表明「已渲染」状态）**被否决**——manifest.json 是 manifest 阶段的产物，渲染后改写会破坏「产物不可变」直觉与字节稳定断言。最终定案：**`composition` 字段进 `composition.json`（新 RunStage 产物），不进 manifest.json**——manifest 保持 4.2 原样（mock renderer 零改动、renderFormatSchema 零改动），composition.json 携带 `{ format: "showcraft.remotion/v1", volumes: [...] }` 独立 schema，聚合校验走 validateReleasePackageRelations 增量（composition.volumes ↔ manifest.volumes 恰一对应）。这同时消解 renderFormat 枚举扩展的必要性——**Code Map 的 domain 改动面相应收敛为：新增 compositionSchema 独立 schema + releasePackageSchema 增可选 `composition` 字段 + 聚合校验一条规则；renderFormatSchema 零改动**。(d) 拒绝「无新 schema，渲染就是文件」：composition.json 走 RunStoreCore schema 通道是 gate/actions/narration 的既定惯例，渲染的卷映射（哪个 MP4 对应哪卷）必须可校验、可追溯（矩阵 17），自由文件做不到。

**决策 2——Remotion 依赖引入（定案：`remotion@4.0.536` + `@remotion/bundler@4.0.536` + `@remotion/renderer@4.0.536` + `react@19.3.1` + `react-dom@19.3.1`，全部精确版本锁定；属「新增 npm 依赖」的显式决策，需用户批准）。** 论证：(a) tasks.md 4.3 明文「创建 Remotion composition」——Remotion 是 spec 指定的实现载体，design.md「媒体生成合同」与 ports 注释（ports.ts:27「Real adapters (…Remotion)…」）两处预告；依赖引入是任务本体而非范围扩张，与 4.1「零依赖 Edge TTS」不同（TTS 无既定库约束，Remotion 有）。(b) 版本策略：4.0.536 是 stable latest（2026-10-16 发布，活跃维护）；5.0/4.1-alpha 不采用（breaking changes 未稳定，含 ENABLE_V5_BREAKING_CHANGES 的 license 与 inputProps 语义变化）；三包同版本锁是 Remotion 官方版本一致性要求（`remotion versions` 命令即做此校验）。(c) 许可事实（规划期实读 LICENSE.md）：v4 Free License 覆盖个人与 ≤3 人组织商用；`licenseKey` 在 v4 optional（探针渲染未传 key 成功）；v5 计划收紧 contractor 计入条款——作为决策输入记录，若组织规模超出免费档，需用户另行采购 company license（实施不阻塞）。(d) 资源足迹：node_modules ~964MB（含首次渲染自动下载 Chrome Headless Shell ~171MB 压缩/576MB 解压至 `node_modules/.remotion/`，gitignore 已覆盖，一次性）；渲染运行时无系统 ffmpeg 依赖（compositor-darwin-arm64 自带 ffmpeg n7.1 dylibs——规划期实测（见 Intent 实测 2/5）。(e) 拒绝的自研替代：手写 canvas/ffmpeg 编排 = 重新实现 Remotion 的 React 时间轴模型，成本数量级高且不可维护；`@remotion/player` 预览（无渲染）不满足 4.3「渲染 MP4」验收。(f) pnpm 兼容性：Remotion 包无 postinstall 脚本（平台二进制走 optionalDependencies），workspace allowBuilds 现有 esbuild 条目已覆盖 bundler 链；zod 4.5.4（Remotion 内部）与 workspace zod ^4.6.5 同主版本共存无冲突（pnpm 嵌套解析，规划期 npm 树实测单版本 dedupe）。

**决策 3——渲染编排建模（定案：新 Optional `composition` stage（尾部第 8 stage）+ `composition.json` 产物；`--render` CLI flag 显式 opt-in；不做「渲染即 renderer port 替换」。** 论证：(a) 4.1 决策 1 的 stage 建模先例第四次数用：composition 是「渲染期 I/O + 文件落盘」——与 renderer（manifest 阶段的纯函数产出 manifest）职责分离；把 Remotion 塞进 RendererPort 会迫使 mock renderer 感知文件系统与浏览器，违反 ports「no I/O here」注释语义，且 mock 路径将无条件承担渲染成本（302→316 用例的运行时间与 CI 稳定性）。(b) Optional stage 语义：不注入 `compositionPort`（无 `--render`）→ stage 不进入 → 产物集合与字节零变化（矩阵 5 的 316 零回归是硬条件）；注入 → manifest 之后执行，失败归因 @composition、已完成产物保留（沿 narration 先例，矩阵 9）。(c) `--render` 沿 `--tts` opt-in 惯例而非默认开启：渲染需要浏览器二进制（首次 ~171MB 下载）与每卷数秒的渲染耗时——默认路径（测试、CI、既有用户脚本）必须零影响；这与 4.2 契约修订「mock 内容必须变」不同——渲染是**新增能力**不是**行为修订**，opt-in 是惯例的正确应用。(d) CompositionPort 输入 `{ runDirectory, manifest, narration? }`：runDirectory 是渲染文件读写与 Remotion bundle 的锚点；narration 可选（矩阵 6 无 TTS 渲染）；**不传 release/evidence/gate/actions**——消费面严格收敛于 design 合同的「manifest + 音轨」，gate 状态对渲染不可见（fallback 镜头照常渲染，其 narrationSource 已在 scene 数据中）。(e) 失败语义补充：渲染成功但 composition.json 落盘失败 → 同样 @composition 显式失败（MP4 已存在但无产物引用——下次重跑覆盖，不在本 story 做部分恢复）。

**决策 4——画面与音画同步建模（定案：文字卡 + 底部字幕条 + 可选 `<Audio>`；fps 30 / 1280×720 常量；cue 聚合是渲染端确定性纯函数；音频超窗显式失败。** 论证：(a) v0.3.3 `--source`（无 `--desktop`）没有真实媒体素材——镜头画面首版 = 中文标题 + 旁白摘录的文字卡，intro/outro 用 featureId==intro/outro 做样式区分（4.2 决策 1(f) 预留的消费面）；这不是功能妥协而是数据现实：该路径的输入只有文本。(b) 音画同步的数据源唯一 = narration.json：每镜头 `<Audio src={staticFile(\`narration-${scene.id}.mp3\`)}>` 挂 4.1 产物，`<Sequence from={场景起始帧}>` 按场景时长推进——场景起始帧由 plannedDurationSeconds 累计推导（与 volumes 的 plannedTotalSeconds 同源），不读真实音频时长做时间轴（若音频略短于 planned，尾部静帧；矩阵 12 锁定音频**长于** planned 时显式失败——正常 TTS 输出 cue 末值 ≤ 音频×0.9 且 4.1 实测偏差 ~10% 在 16s 窗口下不触发，真实音频超窗只在异常 TTS 输出下发生，显式暴露优于静音截断）。(c) 字幕：word 级 cues 按「标点/时长窗口」聚合成句级字幕条（4.1 决策 3 明文预留的渲染端展示决策在此落地）；聚合函数是纯函数（subtitleGrouping.ts）单测锁定（矩阵 13），narration.json 原始数据零改动。(d) fps 30 / 1280×720 写死常量：spec 未要求可调，flag 是纯增量（沿 4.1 决策 5/4.2 决策 2(e) 同构先例）；16s 镜头 = 480 帧、90s 卷 = 2700 帧，帧数与 plannedTotalSeconds 严格线性（矩阵 11）。(e) 拒绝「烧录字幕进画面替代字幕轨」之外的选择（独立 .srt 文件、软字幕轨）：首版交付物是「可播放 MP4」，硬编码字幕是最小完整方案；.srt 输出可作后续增量（不在矩阵承诺内）。

**决策 5——v0.3.3 验证形态与矩阵执行条件分层（定案：矩阵 1/4/6/7/9/12/13/14/17 全部「干净」执行（stub 注入渲染函数）；矩阵 1/2/3/11/16 叠加「真实」层在实施期手动执行并记录实测值；矩阵 10 归安装期手动段；矩阵 15 可选。** 论证：(a) `pnpm test` 必须无浏览器依赖全绿——CI/干净机器不预装 Chrome Headless Shell；adapter 以「渲染函数注入」为测试面（createRemotionRenderer 接受 `renderMedia` 实现参数，产品路径默认真实实现、测试注入 stub 断言调用参数与产物映射），bundle 步骤同样注入（stub bundle 返回哨兵 serveUrl）。(b) 真实渲染的验收语义：tasks.md 4.3 的「验证 v0.3.3 感知/IM 样本可预览或渲染 MP4」以实施期真实渲染段的实测记录为验收锚（对齐 4.1「真实 TTS 手动段」与 4.2「可选手动段」的先例——真实 I/O 层的验证记录进实施回报，不进 pnpm test）。(c) 矩阵 16（渲染字节稳定）标注「真实」：h264 编码在同 compositor 版本下确定性强，但把它放进 CI 每次跑会引入浏览器依赖——实施期连跑两次比对 mp4 字节，结论记入回报。(d) `--desktop`+`--render`（矩阵 15）只做显式声明验证：真实录屏 .mov 叠加进画面需要 OffthreadVideo + 素材对齐设计，属 epic 5 端到端（5.3）的媒体消费面——本 story 显式「media 不读取」并输出诊断，防止静默丢媒体被误读为支持。

**风险清单。** R1（中）：Chrome Headless Shell 首次下载依赖网络（~171MB，Google CDN）——安装期一次性事实，失败诊断明确指向手动安装命令（矩阵 10）；已缓存后运行期零网络。R2（中）：Remotion DRM/许可条款演进（v5 收紧 contractor 条款已公示）——锁版本 4.0.536 短期免疫；升级评估留待 v5 stable 后的独立决策；若组织规模超免费档需 company license（用户决策项，不阻塞实施）。R3（低）：zod/React 版本交互——探针实测单 zod 4.5.4 dedupe、react 19.3.1 满足 peer >=16.8；pnpm 嵌套解析兜底。R4（低）：渲染耗时（每卷数秒）与 run 目录体积（每卷 MP4 ~MB 级）——mock/CI 路径不渲染（opt-in），无 CI 影响；runs/ 已 gitignore。R5（低）：`.tsx` 组件与 cli tsc build 的交互——Remotion 组件不进 dist（bundle() 现场转译），实施期用 tsconfig exclude 收敛并验证 `pnpm build` 无 tsx 产物（沿 desktopFixtures exclude 先例）。R6（低）：composition stage 的 runStageOrder 断言变更波及既有 runStore.test——本 story 计划内显式契约变更（7→8 stage），断言增量更新；replay/回放类消费者无（runStageOrder 仅测试与编排内引用，实查）。

**范围限定（重申）。** 只做 4.3：Remotion composition 消费 manifest 渲染逐卷 MP4 + `--render` opt-in + composition stage/产物 + spec delta「渲染视频」Requirement + 依赖引入。不做 epic 5（preview server / 审核命令 / 未批准不可交付——5.1/5.2/5.3/5.4）；不做 DeepMatch 网站录屏（ARCH-234 挂起）；不改 4.1/4.2 交付语义（narration 契约、durationOrchestration、volumes schema 与 mock renderer 行为零改动；runStageOrder 仅尾部追加）；desktop 路径零改动；不做云渲染/Windows/分辨率 fps 码率 flag/独立字幕文件/渲染队列；不把 Chrome 下载逻辑写进测试。

## Verification

**Commands（实施期，全部本地）:**
- `pnpm lint` -- expected: 新增/修改源码与测试满足 lint 规则（含 .tsx 组件、新增依赖后无 unused import）。
- `pnpm typecheck` -- expected: 无 TypeScript 错误（含 react 类型引入与 tsconfig include/exclude 调整后）。
- `pnpm build` -- expected: 构建通过且 cli dist 无 .tsx 产物（R5 验证）。
- `pnpm test` -- expected: 既有 316 用例零回归（矩阵 5 硬条件）+ 新增用例全绿且全部无网络/无浏览器依赖（stub 注入；domain ~6、runStore/orchestrator ~5、subtitleGrouping ~4、volumeProps/时长推导 ~3、remotionRender adapter ~8、CLI flag/e2e ~4；实施期回填总数）。
- `openspec validate showcraft-release-video-mvp --strict` -- expected: 通过（含本 story 新增「渲染视频」Requirement delta）。

**渲染矩阵断言（`pnpm test` 内强制，stub 注入，无浏览器）:**
- composition schema：合法结构解析、卷数与 manifest.volumes 不符拒绝、负/零时长拒绝、sceneIds 与 scenes 不一致拒绝（矩阵 14）。
- composition stage：不注入 → artifacts 不含 composition.json（零回归）；注入成功 → artifacts 追加且 run.json completed；注入失败 → failure.stage=composition、已落盘产物保留（矩阵 9/17）。
- volumeProps：manifest.volumes + narration → 逐卷 inputProps 的映射断言（场景起始帧累计、音频文件名引用、cues 透传）；音频超窗（audioDurationMs > planned×1000）显式失败（矩阵 12）。
- subtitleGrouping：句级聚合确定性、跨 cue 聚合、空 cues 防御（矩阵 13）。
- CLI：`--render` 解析、缺省零变化、`--render`+`--tts` 组合、usage 文本（矩阵 4/5）。

**真实渲染段（实施期手动，非 CI；结果记入实施回报）:**
- 本机 `pnpm demo -- --output runs --render`（mock 1 feature）→ `video-volume-1.mp4` mvhd 实测 40s±1s（矩阵 1/11）。
- 本机 `pnpm demo -- --source <v0.3.3 changelog> --output runs --render` → 72s 单卷 MP4（矩阵 2，v0.3.3 感知/IM 样本验收锚）。
- 本机 6-feature release + `--render` → 2 个 MP4（76s/44s）（矩阵 3/11）。
- 同输入重复渲染逐字节比对（矩阵 16）。
- `--tts` 真实渲染（可选，需出站网络 + TTS）：3 MP3 音轨进 MP4（矩阵 4 真实层）。
