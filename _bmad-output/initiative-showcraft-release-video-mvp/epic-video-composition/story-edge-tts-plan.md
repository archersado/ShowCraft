---
title: 'Edge TTS zh-CN-XiaoxiaoNeural adapter 与中文时序输出'
type: 'feature'
ticket: '9'
created: '2026-10-15'
status: draft
baseline_revision: a99c2d5c7df0026f358d8a3ad3df2e4e060c9db5
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
context:
  - 'openspec/changes/showcraft-release-video-mvp/specs/localized-video-composition/spec.md'
  - 'openspec/changes/showcraft-release-video-mvp/design.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** epic 1–3 已交付 release→evidence→gate→desktop→scenePlan→manifest 六阶段管线与文件化 run（基线 `agent/agent/arch-221` @ `a99c2d5`，252 用例全绿），但 localized-video-composition spec 的 Requirement「生成中文配音与字幕」尚无任何实现：core 无 Narration port（design.md「Ports-and-adapters 编排」列出的 `Narration` port 在 `ports.ts` 尚未建模），CLI 产物中无音频与字幕时序，4.2 时长编排（需要音频实测时长做校准）与 4.3 Remotion（需要音频+字幕引用）均被此阻塞。同时 Edge TTS 服务端的 DRM 机制已升级（规划期实测：旧 Sec-MS-GEC v1 方案被 403 拒绝），可用性必须先实证、失败语义必须显式建模——design.md 风险条款「Edge TTS 网络或服务异常 → adapter 返回可诊断失败；首版不伪造音频」要求落地为代码合同。

**Approach:** 本 story 交付「配音 + 字幕时序」生成能力：core 新增 `NarrationPort`（design 既定六 port 之一补齐）+ orchestrator `narration` stage（scenePlan 之后、manifest 之前，Optional-port 惯例缺省跳过）；domain 新增 `subtitleCueSchema` / `narrationArtifactSchema`（`narration.json` 走 RunStore schema 校验通道）；CLI 新建零依赖 Edge TTS adapter（Node 24 原生 `WebSocket` 直连 WSS + 自实现 Sec-MS-GEC v2 DRM，规划期已完整实测：握手→speech.config→ssml→53 音频分片 37152 字节 MP3 + 14 条 WordBoundary，`afinfo` 确认 24kHz/48kbps/mono/6.192s，token 生成与上游 edge-tts 7.3.1 Python 实现逐字符一致）。CLI `--tts` 显式启用（`--voice` 可选覆盖，默认 `zh-CN-XiaoxiaoNeural` 常量），缺省关闭时 mock 4 文件 / `--source` 5 文件契约逐字节不变。TTS 全部失败形态（握手失败/服务拒绝/空音频/损坏/时序缺失）→ run 显式失败 @narration，无静音降级、无伪成功。不做 4.2 时长编排、不做 4.3 Remotion composition、不做 epic 5。

## Boundaries & Constraints

**Always:** `zh-CN-XiaoxiaoNeural` 作为默认 voice 常量（spec 权威）；narration 产物仅经显式 `--tts` opt-in 追加，缺省路径（mock 无 `--tts`、`--source` 未启用 `--desktop`）的产物集合与字节逐字节不变（既有 252 用例零回归）；narration stage 失败语义遵循既有先例——已落盘产物保留、`run.json` failure.stage=narration、诊断有界可读、任何失败不产生成功音频引用（首版不伪造音频，无静音/占位降级）；Edge TTS adapter 零 npm 依赖（Node 24 原生 `WebSocket` + `node:crypto` + `node:fs`）；单元测试全走注入 fake WebSocket / 固定时间戳 DRM 向量，真实网络调用只存在于 Verification 手动段（与桌面路径「干净环境全绿」纪律同构）；音频文件直写 run 目录（`narration-<sceneId>.mp3`），JSON 产物只存文件名引用（沿用 desktopActions media 惯例），`narration.json` 属媒体伴随产物、不做逐字节稳定断言（3.3 媒体修订延伸，显式声明于矩阵）；WordBoundary 的 100ns tick 换算 ms 一律向下取整；每项改动面在 Code Map 显式标注。

**Never:** 不做 4.2（时长编排 / 12–20 秒窗口 / 90 秒拆分 / 多 feature 时长矩阵）；不做 4.3（Remotion composition / MP4 渲染 / manifest 引用音视频的 schema 扩展——`renderFormatSchema`/`renderManifestSchema` 零改动）；不做 epic 5（preview server / 审核命令）；不做 DeepMatch 网站录屏（ARCH-234 挂起）；不改 Story 1.6–3.4 既有产品行为与产物字节（mock 4 文件 / `--source` 5 文件 / actions.json 幂等契约继续有效）；desktop 路径零改动；不写 StartUpOS 仓库任何文件；不动 `openspec/changes/showcraft-release-video-mvp/specs/` 既有 spec（localized-video-composition 的 Requirement 已覆盖本 story 语义，无 spec delta）；不新增 npm 依赖（零依赖方案已实测可行，无需用户豁免）；不引入 CI 平台依赖；不做 Windows 语义；不暴露语速/音调（prosody 固定 `+0Hz/+0%/+0%`）；不实现句级字幕聚合（cues 存服务端原始 word 级事实，聚合属消费侧决策）；不做 TTS 结果缓存/重试队列（首版单次调用，失败即显式失败）；不把真实 TTS 网络调用搬进 `pnpm test`（干净机器全绿纪律）。

## I/O & Edge-Case Matrix

「执行条件」列：**干净** = 无网络依赖、无凭据即可在 `pnpm test` 全绿（fake 注入）；**真实** = 需本机出站网络，仅存在于 Verification 手动段。

| # | Scenario | Input / State | Expected Output / Behavior | Error Handling | 执行条件 | 覆盖来源 |
|---|----------|---------------|----------------------------|----------------|----------|----------|
| 1 | TTS 成功路径 | fake WebSocket 返回 turn.start → audio.metadata(WordBoundary×N) → audio 分片×M → turn.end | run 目录追加 `narration.json`（schema 合法）+ 每场景 `narration-<sceneId>.mp3`（fake 字节）；cues 逐条对应 WordBoundary、tick→ms 向下取整、单调递增；audioDurationMs = ceil? 否——**round(bytes/6000)**（48kbps CBR） | 无错误 | 干净 | **本 story 新增**：edgeTtsNarration.test 协议层用例 + core orchestrator 集成用例 |
| 2 | mock 路径缺省（无 `--tts`） | mock run | 4 文件（release/scene/manifest/run），无 narration.json、无 mp3、WSS 从未连接 | 无错误 | 干净 | **现有**：e2e.test 4-file 断言锁定（既有用例零改动即回归）；**本 story 新增**：显式断言 narration port 缺省未注入 |
| 3 | `--source` 缺省（无 `--tts` 无 `--desktop`） | fixture `--source` run | 5 JSON 文件集合与字节不变 | 无错误 | 干净 | **现有**：releaseSource.test 字节契约既有断言锁定；**本 story 新增**：flag 契约用例（`--voice` 无 `--tts` 报用法错误） |
| 4 | `--tts` 启用（fake WS 注入） | `--source` + `--tts` | 5 JSON + narration.json + 1 mp3/场景；scenePlan→narration→manifest 顺序 | 无错误 | 干净 | **本 story 新增**：CLI 装配用例（注入 fake NarrationPort 断言 stage 顺序与文件集） |
| 5 | 握手失败——网络不可达 | fake WebSocket open 前 error（模拟 ENOTFOUND/ECONNREFUSED） | `NarrationError(phase="handshake")`；run failed @narration；已落盘产物保留；诊断含错误类别与耗时，≤2048 | 显式失败 | 干净 | **本 story 新增**：协议层失败用例 |
| 6 | 握手拒绝——服务 403（升级 DRM 后 close 1006） | fake WebSocket open 后立即 close(1006) | `NarrationError(phase="handshake")`，诊断含 close code 与「核对 DRM 常量 vs 上游 edge-tts 版本」提示 | 显式失败 | 干净 | **本 story 新增**：规划期实测 403→1006 形态固化（见 Design Notes 实测 2） |
| 7 | turn.end 无音频分片 | fake 只发文本帧不发 audio | `NarrationError(phase="synthesize", "synthesis produced no audio")`；无 mp3 落盘、无伪成功 | 显式失败 | 干净 | **本 story 新增** |
| 8 | 音频损坏（MP3 头核验失败） | fake 发非 MP3 sync-word 分片 | 失败；坏文件改名 `.failed` 留诊断（沿用 desktopActions quarantine 惯例） | 显式失败 | 干净 | **本 story 新增** |
| 9 | WordBoundary 缺失（请求了元数据但 0 条） | fake 发 audio 无 metadata | `NarrationError(phase="synthesize", "no word boundary metadata")`；narration.json 不落盘（音频不进产物引用） | 显式失败 | 干净 | **本 story 新增**：时序是本 story 交付物的一半，缺失即交付不完整 |
| 10 | response.error 帧 | fake 发 `Path:response.error` | `NarrationError(phase="synthesize")`，诊断含服务错误摘要（有界） | 显式失败 | 干净 | **本 story 新增** |
| 11 | X-RequestId 格式违约 | 实现固定使用无连字符大写 UUID（`randomUUID().replaceAll("-","").toUpperCase()`） | 服务接受（规划期实测：错误格式 → close 1002 "Expected a no-dash UUID"） | 防回归断言（构造消息单测锁定格式） | 干净 | **本 story 新增**：格式常量单测 |
| 12 | DRM token 生成确定性 | 固定 unix 时间戳向量（`1792064756.9800708`） | Sec-MS-GEC v2 = `F22985E6626F6D9A-A1AEE147C4F7AFEA6A26ED5C4EA9BCA0C0AF4C26AE355E408FAACC5851417BD9`（与上游 edge-tts 7.3.1 Python 实现逐字符一致——规划期实测锚定） | 向量断言 | 干净 | **本 story 新增**：edgeTtsDrm.test 固定向量 |
| 13 | narration 失败不影响既有无 TTS 路径 | 全部既有用例 | orchestrator narration 分支仅在 port 存在时进入；`StageProgress` 新值不触达既有路径 | 零回归 | 干净 | **现有**：`pnpm test` 全量零回归锁定 |
| 14 | cues 时序合理性 | cue.endMs > cue.startMs（schema refine）+ 后 cue.startMs ≥ 前 cue.startMs（单调） | 非法 cue 产出在 recordArtifact 通道被 DomainValidationError 拒绝 | schema 拒绝 | 干净 | **本 story 新增**：domain.test refine 用例 |
| 15 | narration.json 非字节稳定（媒体类修订） | 同一输入两次真实 TTS run | 音频字节与 audioDurationMs 允许差异；验证只做 schema + 存在性 + afinfo 可读性（手动段） | 显式声明：不断言逐字节相同 | **真实** | 3.3 媒体修订延伸；单元层 fake WS 的 JSON 断言不受影响（fake 输出确定性） |
| 16 | 真实 Edge TTS 端到端 | PM 本机 + 出站网络 | `pnpm demo -- --source <changelog> --tts` → run completed，narration.json cues 非空且 endMs ≤ audioDurationMs×1.05 容差，mp3 头 `fff3`/`fffb`、afinfo 报 MPG3 24kHz | 按 1–10 口径 | **真实** | Verification 手动段（规划期已预验证可行，见 Design Notes 实测 4） |
| 17 | en-US / 其他音色覆盖 | `--voice en-US-EmmaMultilingualNeural`（真实） | 同口径成功（规划期实测 9504 字节/1.584s）；单元层 voice 参数透传断言 | 按 1–10 口径 | 干净+**真实** | **本 story 新增**：参数透传单测 + 手动段复跑 |
| 18 | 代理出站路径 | `https_proxy` 环境变量 + undici 自动代理 | 成功（规划期实测代理路径握手+合成全通）；不实现额外代理代码（Node 24 undici 原生尊重环境变量） | 无错误 | **真实** | Verification 手动段可选复跑 |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain.ts` -- **修改**：新增 `subtitleCueSchema`（`{text: string min(1), startMs: int ≥0, endMs: int >0}` + refine `endMs > startMs`）、`narratedSceneSchema`（`{sceneId, featureId, audioFile: regex ^[A-Za-z0-9._-]+$ 且非 . / ..、audioDurationMs: int >0, voice: string min(1), cues: array(subtitleCue)}` + 数组级 refine cues.startMs 单调不减）、`narrationArtifactSchema`（`{releaseVersion, voice, scenes: array(narratedScene)}`，全部 `.strict()`）；导出对应类型 `SubtitleCue` / `NarratedScene` / `NarrationArtifact`。`renderFormatSchema`/`renderManifestSchema`/`sceneSchema` 零改动。
- `packages/core/src/ports.ts` -- **修改**：新增 `NarrationPort` 类型（`(release: ReleaseBrief, scenePlan: ScenePlan) => Promise<NarrationArtifact> | NarrationArtifact`——纯函数形状与 ScenePlannerPort/RendererPort 同构，无 I/O 于合同中）+ `NarrationErrorPhase = "handshake" | "synthesize"` + `NarrationError extends Error`（`phase` + `diagnostics` 字段，同 `DesktopRunnerError` 先例）。文件头注释「Real adapters (StartUpOS, Edge TTS, Remotion)」中 Edge TTS 一词自此有了对应物。
- `packages/core/src/orchestrator.ts` -- **修改**：`PipelinePorts` 增加可选 `narration?: NarrationPort`（注释注明缺省跳过语义与 evidence/gate/desktop 同构）；`StageProgress` 增加 `"narration"`；执行顺序 scenePlan 之后、manifest 之前：`if (ports.narration) { progress = "narration"; const artifact = await ports.narration(release, scenePlan); store.recordArtifact({ stage: "narration", value: artifact }); }`；`NarrationError`/其他异常经既有 catch → `store.fail(progress, …)` 自动落到 narration 阶段归因。成功路径其他 stage 代码零改动。
- `packages/core/src/runStore.ts` -- **修改**：`RunStage` 增加 `"narration"`；`runStageOrder` 在 `"scenePlan"` 后插入 `"narration"`；`stageFileNames` 增加 `narration: "narration.json"`；`recordArtifact` 增加 narration 分支（`narrationChecker` schema 校验，同 scenePlan 分支模式）。
- `packages/core/src/index.ts` -- **修改**：导出三个新 schema、三个新类型、`NarrationPort`/`NarrationError`/`NarrationErrorPhase`。
- `packages/cli/src/edgeTtsDrm.ts` -- **新建**：Sec-MS-GEC v2 token 生成（上游 rany2/edge-tts 7.3.1 `drm.py` 的忠实移植，约 120 行）：自定义 IV SHA-256（首 7 字节派生 IV + 14 项 schedule 常量表）+ CS64 摘要（14 项系数表混淆）+ 5 分钟窗口 tick 拼接 token 字符串；导出 `generateSecMsGecV2(unixTimestamp?)` 与常量 `EDGE_TTS_TRUSTED_TOKEN` / `CHROMIUM_FULL_VERSION`。**移植实现已规划期锚定向量**（矩阵 12）。文件头注释注明来源版本与「微软 DRM 常量为逆向所得、可能随服务端演进失效——失效表现为矩阵 6，更新方式为对照上游 edge-tts 发布版」。
- `packages/cli/src/edgeTtsNarration.ts` -- **新建**（核心交付）：`createEdgeTtsNarration(options: { runDirectory: string; voice?: string; connect?: WebSocketFactory })` 返回 `NarrationPort`。内部：WSS URL 组装（TrustedClientToken + ConnectionId + Sec-MS-GEC + Sec-MS-GEC-Version `2-143.0.3650.75`）→ 请求头（Origin chrome-extension 扩展 ID、Edge UA、Pragma/Cache-Control no-cache、Accept-Encoding/Language、Cookie muid）→ `speech.config` JSON 帧（wordBoundaryEnabled=true、outputFormat=`audio-24khz-48kbitrate-mono-mp3`）→ 逐场景 SSML 帧（`X-RequestId` 无连字符大写 UUID——矩阵 11 格式常量）→ 接收循环（文本帧 turn.start/response/audio.metadata/turn.end；二进制帧 2 字节 BE 头长 + header + payload，Path:audio 分片拼装、Path:WordBoundary 解析 tick→ms）→ 校验（非空音频、MP3 头 `fff3/fffb/fffa/fffx` sync word、cues 非空）→ 音频写 `join(runDirectory, 'narration-' + sceneId + '.mp3')` → 返回 `NarrationArtifact`。默认 `WebSocketFactory` 用全局 `WebSocket`；测试注入 fake（相对导入，不进公共面——沿用 desktopFixtures「CLI 内部 helper」惯例）。prosody 固定 `+0Hz/+0%/+0%`（决策 5）。
- `packages/cli/src/edgeTtsDrm.test.ts` -- **新建**：固定时间戳向量断言（矩阵 12）+ 邻近 5 分钟窗口同 token 断言（rounding 语义）。
- `packages/cli/src/edgeTtsNarration.test.ts` -- **新建**：矩阵 1/5–11 的协议层用例（fake WebSocket 注入：正常三段流、五类失败、消息格式锁定、cues 换算与单调性、quarantine 改名断言）；全部无网络。
- `packages/cli/src/main.ts` -- **修改**：`DemoOptions` 增加 `tts?: boolean; voice?: string`；`parseDemoArgs` 解析 `--tts`（布尔）与 `--voice <name>`（`--voice` 无 `--tts` → 用法错误，同 `--desktop requires --source` 契约先例）；`runDemo` 在 `options.tts` 时以 `createEdgeTtsNarration({ runDirectory, voice: options.voice })` 注入 `narration` port（run 目录创建后装配，与 desktopDemo 闭包注入同模式）。缺省两 flag 全空 → 装配面不变。
- `packages/cli/src/main.test.ts` -- **修改**：新增 flag 契约用例（矩阵 3 的 `--voice` 无 `--tts` 用法错误；`--tts` 不伴随 `--source` 允许——mock release + TTS 合法组合，矩阵 4 的 mock 变体）。
- `packages/core/src/orchestrator.test.ts` -- **修改**：新增 2 用例——narration port 注入时 stage 顺序断言（scenePlan → narration → manifest）+ narration 抛错时 `failure.stage === "narration"` 且已完成产物保留（矩阵 5/13 的 core 侧）。
- `packages/core/src/domain.test.ts` -- **修改**：新增 schema refine 用例（矩阵 14：endMs ≤ startMs 拒绝、cues 倒序拒绝、audioFile 非法字符拒绝）。
- `packages/core/src/runStore.test.ts` -- **修改**：narration artifact 记录与 `narration.json` 文件名映射断言。
- `openspec/changes/showcraft-release-video-mvp/specs/localized-video-composition/spec.md` -- 验收语义权威（Requirement「生成中文配音与字幕」：默认 Xiaoxiao 音色、每镜头中文旁白+同步字幕、渲染清单含配音引用与字幕时序）。**本 story 无新增 spec delta**（时长编排 Requirement 属 4.2，manifest 消费属 4.3），`validate --strict` 继续通过。
- `openspec/changes/showcraft-release-video-mvp/design.md` -- 决策权威（「媒体生成合同」「Ports-and-adapters 编排」）。**本 story 不修改该文件**；Non-Goal 张力边界澄清见 Design Notes 决策 6。

## Tasks & Acceptance

**Execution:**
- [ ] `packages/core/src/domain.ts` + `index.ts` -- narration 三 schema 与 refine；完成条件：`pnpm typecheck` 通过；domain.test 新增 refine 用例全绿（矩阵 14）。
- [ ] `packages/core/src/ports.ts` -- `NarrationPort`/`NarrationError`；完成条件：typecheck 通过，orchestrator.test 集成用例可编译引用。
- [ ] `packages/core/src/orchestrator.ts` + `runStore.ts` -- narration stage 与产物通道；完成条件：新增 stage 顺序/失败归因/产物命名用例全绿；既有 252 用例零回归（矩阵 2/3/13）。
- [ ] `packages/cli/src/edgeTtsDrm.ts` + `edgeTtsDrm.test.ts` -- DRM v2 移植；完成条件：固定时间戳向量断言逐字符通过（矩阵 12，向量已在规划期锚定于 Design Notes 实测 3）。
- [ ] `packages/cli/src/edgeTtsNarration.ts` + `edgeTtsNarration.test.ts` -- WSS 协议 adapter；完成条件：矩阵 1/5–11 协议层用例全绿（fake WS，无网络）；`X-RequestId` 格式常量锁定。
- [ ] `packages/cli/src/main.ts` + `main.test.ts` -- `--tts`/`--voice` 装配；完成条件：flag 契约用例全绿；`--tts` run（fake 注入）产出 5 JSON + narration.json + mp3 集合断言（矩阵 4）；既有 e2e 字节契约零回归。
- [ ] 真实网络冒烟（实施期一次性，手动段执行）：`pnpm demo -- --source <fixture或真实changelog> --tts --output runs` → afinfo 校验 mp3 + node 断言 narration.json cues；失败则按矩阵 5–10 诊断归因，不得伪造成功产物。

**Acceptance Criteria:**
- Given 不带 `--tts` 的任意既有调用形态，when `pnpm test` 与真实 run，then 产物集合与字节同基线 `a99c2d5` 逐字节相同（mock 4 文件 / `--source` 5 文件），narration stage 未进入。
- Given fake WebSocket 正常流（矩阵 1），when narration stage 执行，then run 目录出现合法 `narration.json`（schema 校验通过：cues 非空、单调、endMs > startMs、audioFile 命名白名单）与每场景 mp3，manifest/既有 stage 产物不变。
- Given 握手失败/服务拒绝/空音频/损坏音频/时序缺失任一形态（矩阵 5–10），when run，then `run.json` status=failed、failure.stage=narration、诊断有界且指明 phase、已完成产物保留、无成功音频引用（首版不伪造音频——无静音/占位降级路径）。
- Given 固定时间戳 DRM 向量，when `generateSecMsGecV2`，then 输出与规划期锚定值逐字符一致（矩阵 12）。
- Given 全量 `pnpm test`，then 基线 252 用例零回归 + 新增用例全绿且全部无网络依赖；`pnpm lint`、`pnpm typecheck`、`openspec validate showcraft-release-video-mvp --strict` 全部通过。
- Given 真实网络（手动段），when `--tts` run，then mp3 经 afinfo 报 MPG3/24kHz/48kbps/mono，narration.json 的 max(cue.endMs) ≤ audioDurationMs × 1.05（48kbps CBR 换算实测容差）。

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Design Notes

**决策 1——Narration/TTS 能力的建模位置（定案）：新 port `NarrationPort` + orchestrator 新 stage `narration`，产出独立 `narration.json`；不并入 scenePlan/manifest。** 论证：(a) design.md「Ports-and-adapters 编排」原文列明 core 定义 `ReleaseSource`、`CodeEvidence`、`DesktopRunner`、`Narration`、`Renderer` 与 `ReviewStore` ports——Narration port 是设计权威既定的建模，本 story 是把它从「注释里的词」变成 `ports.ts` 里的类型；`ports.ts:21` 注释「Real adapters (StartUpOS, Edge TTS, Remotion) implement the same shapes in later epics」中 Edge TTS 自 epic 1 起就被预告为独立 adapter。(b) 并入 scenePlan 被拒：scenePlan 是纯计划（`ScenePlannerPort` 同步纯函数形状、无 I/O），TTS 是网络 I/O + 文件落盘——合并会让 mock planner 被迫感知媒体路径，违反 ports「plain function contracts over domain objects — no I/O here」的既定注释语义。(c) 并入 manifest 被拒：renderer 是 mock 纯函数且 4.3 将被 Remotion renderer 整体替换，届时 TTS 失败归因会与渲染失败纠缠；且「Remotion 只消费 manifest」的设计合同要求 renderer 不知道音频来源。(d) 新 stage 对既有 6 stage 序列的影响被既有先例完全覆盖：`evidence`/`gate`/`desktop` 三个先例 stage 全部是「Optional port：absent 时 stage 整体跳过、产物集合回退」，narration 第四个加入同一模式，`RunStage`/`runStageOrder`/`stageFileNames` 各加一项，orchestrator 主干只加一个 `if (ports.narration)` 块。(e) 对 mock 路径（无 TTS）的字节契约影响为零——port 不注入则 stage 不进入，产物集合不变（这是矩阵 2/3 的锁定对象）。(f) epic 4.2/4.3 的消费方式：4.2 时长编排读 `narration.json` 的 `audioDurationMs` + cues 末值做 12–20 秒窗口校准（本 story 只记录实测事实、不做编排决策）；4.3 Remotion 的 manifest 扩展（音频/字幕引用字段）留给 4.3 的 spec delta，本 story 的 `renderManifestSchema` 零改动——**最小面优先**：TTS 仅在显式 `--tts` 时追加产物（`narration.json` + per-scene mp3），缺省关闭，mock 与既有 `--source` 契约逐字节不变。

**决策 2——Edge TTS 客户端实现路径（定案）：零依赖，Node 24 原生 `WebSocket` + WSS 直连，自实现 Sec-MS-GEC v2 DRM；不引入依赖、不调用外部 CLI。** 三选一论证（附规划期实测证据，全部 2026-10-15 本机 Node v24.21.0 实测）：
- **引入 npm 依赖（拒绝，无需用户裁决）**：`msedge-tts@2.1.0`（2026-10-13 发布、活跃维护、54KB）功能等价，但运行时依赖 5 包（`ws`、`axios`、`buffer`、`isomorphic-ws`、`stream-browserify`——后两个为浏览器兼容拖入，Node 环境纯冗余），且 `axios` 是完整 HTTP 客户端仅为一处握手。零依赖方案已被实测打通（下），「不新增 npm 依赖」硬约束无需豁免。Python `edge-tts` 7.3.1（pypi，同样活跃）需引入 Python 运行时 + 子进程管理 + 输出解析，跨运行时失败归因复杂，拒绝。
- **外部 CLI（拒绝）**：本机无 edge-tts CLI/Python 包（PM 已核实）；同上跨运行时成本。
- **零依赖（采纳）**：规划期完整实测通过——详见 Design Notes 实测 1–5。关键事实：服务端 2025 年起要求 Sec-MS-GEC v2 token（旧 v1 的 5 分钟 tick SHA-256 已 403，本机实测确认），v2 = `<CS64 16hex>-<SHA256 64hex>`，CS64 是 14 项系数表的 32 位混淆摘要，上游 edge-tts 7.3.1 `drm.py`（610 行）含全部常量；我将其忠实移植为 Node（`node:crypto` 不可直接用——服务端要求的 SHA-256 带**自定义 IV**（由 token 数据首 7 字节派生），标准 `createHash` 给不出，故 SHA-256 轮函数亦须自实现，约 60 行），**固定时间戳下与 Python 实现逐字符一致**（矩阵 12 锚定）。协议层约 80 行（undici WebSocket + 文本/二进制帧解析）。合计 DRM + 协议 + adapter ≈ 250 行单包内部代码，换来零依赖与全可测（DRM 纯函数向量断言、协议 fake WS 注入）。
- 风险声明：DRM 常量是逆向产物，微软可能再次变更（v1→v2 先例）。缓解：DRM 隔离在 `edgeTtsDrm.ts` 单文件 + 失败形态可诊断（矩阵 6 的 close code 诊断指向「对照上游 edge-tts 版本」）+ 更新路径 = 移植上游新常量表（纯常量替换，向量为回归锚）。此风险不构成引入依赖的理由——依赖同样逆向同一服务，失效面相同。

**决策 3——字幕时序的数据建模（定案）：core domain 新增 `subtitleCueSchema`（word 级原始事实），narration stage 产出独立 `narration.json`；句级聚合不做；manifest 扩展留给 4.3。** 论证：(a) Edge TTS 的 WordBoundary 元数据是 word/词组级（实测中文一句 14 条：单字「这」「是」、词「功能」、英文串「ShowCraft」各成一条；`Offset`/`Duration` 为 100ns tick，`text.Text`/`text.Length` 为文本与字符数）——**存原始事实，聚合是展示决策**：4.3 Remotion 叠字幕时才知道镜头时长约束下该按句还是按词切，本 story 过早聚合会锁死消费侧选择；word cues 可无损重建任意粒度。(b) schema 放 core domain（非 adapter 内部）：`narration.json` 走 `RunStoreCore.recordArtifact` 通道（schema 校验 + stable bytes），这是既有惯例——gate.json/actions.json/scene.json 的 schema 全在 core domain，adapter 层不定义 schema。(c) 数据形状：`narration.json = { releaseVersion, voice, scenes: [{ sceneId, featureId, audioFile, audioDurationMs, voice, cues: [{ text, startMs, endMs }] }] }`；tick→ms 向下取整（`Math.floor(tick / 10000)`）；`audioDurationMs = round(totalBytes / 6000)`（48kbps CBR：6000 字节/秒，实测 37152 字节 → 6192ms 与 afinfo `estimated duration: 6.192000 sec` 逐位一致——规划期实测锚定，不依赖 ffmpeg/afinfo，跨平台可断言）。(d) 前向兼容声明：本 story 只落 run 目录文件（narration.json + mp3），`renderManifestSchema`/`renderFormatSchema` 零改动；4.3 的 manifest 如何引用音频与字幕（新增字段 or 文件名约定）是 4.3 的 spec delta 决策点，本 story 不预置脚手架。(e) cues 合法性：`endMs > startMs`（cue 级 refine）+ `startMs` 单调不减（场景级 refine）——非法时序在 recordArtifact 通道被拒（矩阵 14），不进入产物。

**决策 4——失败语义（定案）：narration stage 显式失败，已完成产物保留，无伪成功；对无 TTS 路径零影响。** design.md 风险条款「adapter 返回可诊断失败；首版不伪造音频，后续可增加替代 provider」落地为：(a) `NarrationError(phase, diagnostics)`：`phase="handshake"`（TCP/TLS/WSS 升级失败、服务拒绝——实测 403 表现为 close 1006 无 reason，诊断需包含 close code 与「DRM 常量可能过期，对照上游 edge-tts」指引）与 `phase="synthesize"`（turn.end 无音频分片、MP3 头核验失败、cues 为空、response.error 帧、发送后异常关闭）。diagnostics 沿用 bounded 惯例（≤2048）。(b) 任一形态 → orchestrator 既有 catch → `store.fail("narration", …)` → run.json status=failed、failure.stage=narration、已落盘 release/…/scene.json 原样保留；损坏音频按 desktopActions quarantine 惯例改名 `.failed` 留诊断（不进产物引用）。(c) **无静音/占位降级路径**：cues 为空即失败（时序是交付物的一半，缺一半不算成功）；音频损坏不重试不降级（首版单次调用，重试策略属后续 story 的 provider 抽象）。(d) 对无 TTS 路径零影响：port 缺省不注入 → stage 不进入（`StageProgress` 新值不触达），既有 252 用例零改动全绿是验收硬条件（矩阵 13）。

**决策 5——配置与音色默认值（定案）：常量默认 + CLI flag 覆盖，语速/音调不暴露。** (a) `zh-CN-XiaoxiaoNeural` 是 spec 明文默认，落为 `edgeTtsNarration.ts` 导出常量 `DEFAULT_NARRATION_VOICE`（spec 文本同步引用，单一事实源）；CLI `--voice <name>` 可选覆盖（矩阵 17 的 en-US 冒烟走此路径）。(b) 语速/音调：spec 与 design 均未要求可调，prosody 固定 `+0Hz/+0%/+0%` 写死在 SSML 模板——不暴露 flag（最小面；未来需要时加 flag 是纯增量）。(c) 输出格式固定 `audio-24khz-48kbitrate-mono-mp3`（上游默认、CBR 使 audioDurationMs 换算精确、Remotion/浏览器原生支持；不做格式 flag）。(d) 与 4.2 的关系：本 story 只生成音频与时序并**记录实测校准数据**（audioDurationMs、cues 末值），「narration 文本长度 ↔ 音频时长」的编排关系（12–20 秒窗口内截断/扩展策略）明确留给 4.2 决策——narration.json 的结构已为 4.2 备好全部输入，但不预置任何编排逻辑。

**决策 6——design.md Non-Goal 张力澄清（定案：显式声明，不修改 design.md）。** design.md Non-Goal「不读取或写入 StartUpOS 的秘密文件或工作树」与「不承诺每条 Changelog 文案都存在可录制 UI」针对桌面自动化边界；本 story 的 Edge TTS 调用是对 `speech.platform.bing.com` 的**主动网络出站调用**（发送中文旁白文本、下载合成音频）——读取/下载的对象是本 run 自产的旁白音频，不触及 StartUpOS 工作树、不读取秘密文件、无入站服务暴露。数据出站内容 = scene plan 的 narration 文本（用户 release 输入的派生文案）：这属于产品功能本体（spec Requirement 明文要求调用 Edge TTS 生成配音），非 design.md 试图排除的行为。本澄清仅声明边界，不修改 design.md。

**规划期实测记录（2026-10-15，Node v24.21.0 / Darwin 25.5.0，供实施对照；探针代码未留痕于树，证据数值逐项可复验）。**
1. **服务端点可达性**：`speech.platform.bing.com` 直连与代理（`https_proxy=http://127.0.0.1:10808`）均通（HTTPS 400 探测为预期——无 WSS 升级）；HTTP/2 下 WS 升级请求返回 404（HTTP/2 无 WS 升级），强制 HTTP/1.1 后服务端响应 403 Forbidden——**旧版 Sec-MS-GEC v1（5 分钟 tick + token 的 SHA-256）与无 GEC 均被拒**，Node 原生 WebSocket 握手 code=1006。
2. **DRM v2 移植与锚定**：拉取上游 rany2/edge-tts（7.3.1，2026-10-13 发布）`drm.py`/`constants.py` 核对：`Sec-MS-GEC-Version = "2-143.0.3650.75"`、v2 token = `CS64(data)-SHA256-customIV(data)`、data = `floor(((unixTs + 11644473600) − mod 300) × 1e8)` 拼接 TrustedClientToken。Node 移植经三轮 debug（JS `>>` 算术移位 vs Python 逻辑移位 ×2 处；STATE 常量转写错误 ×1；CS64 状态链漏 rol16 ×2）后，**固定 ts `1792064756.9800708` 下与 Python 逐字符一致：`F22985E6626F6D9A-A1AEE147C4F7AFEA6A26ED5C4EA9BCA0C0AF4C26AE355E408FAACC5851417BD9`**——此即矩阵 12 的实施向量。
3. **完整合成往返（零依赖）**：WSS URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=<token>&ConnectionId=<32hex>&Sec-MS-GEC=<v2>&Sec-MS-GEC-Version=2-143.0.3650.75`；请求头 Origin `chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold`、UA `…Chrome/143.0.0.0…Edg/143.0.0.0`、`Pragma/Cache-Control: no-cache`、`Accept-Encoding: gzip, deflate, br, zstd`、`Accept-Language: en-US,en;q=0.9`、`Cookie: muid=<32hex>;`。实测两坑：**X-RequestId 必须无连字符 UUID**（错误格式 → close 1002 "Expected a no-dash UUID"，矩阵 11 来源）；undici 二进制帧为 Blob（须 `arrayBuffer()` 中转）。zh-CN-XiaoxiaoNeural 中文句实测：握手 1016ms → turn.start → response → 14 条 WordBoundary metadata → 53 个 audio 分片共 **37152 字节**，turn.end @2474ms；MP3 头 `fff3`；`afinfo` 确认 MPG3 / 24kHz / 48kbps / mono / **6.192s**（= 37152/6000，CBR 换算精确）。WordBoundary 样例：首字「这」Offset=1000000 tick(100ms) Duration=1750000(175ms)；末词「功能」Offset=51500000(5.15s) Duration=4500000(450ms)；`Offset+Duration` 总和 5.6s < 6.192s（尾部静音，容差口径入矩阵 16）。
4. **泛化验证**：en-US-EmmaMultilingualNeural 成功（9504 字节 / 1.584s）；代理路径成功（11808 字节）；Node 24 undici 原生尊重 `https_proxy`，无需代理代码。
5. **环境事实**：edge-tts CLI/Python 包未装、ffmpeg 未装（验证路径用 `afinfo`，不依赖 ffmpeg）；`afinfo`/`afconvert` 可用；Node 原生 `WebSocket`（undici）行为与浏览器一致（Blob 二进制帧）。
6. **基线核验**：本规划分支 = `agent/agent/arch-235` merge `agent/agent/arch-221` @ `a99c2d5`（与基线 0 diff）；`pnpm test` 252 用例 / 20 文件全绿、`pnpm lint` / `pnpm typecheck` / `openspec validate showcraft-release-video-mvp --strict` 全部通过。

**风险清单。** R1（中）：微软 DRM/协议再次演进 → 合成全路径失效。对策：DRM 隔离单文件 + 矩阵 6 诊断指向上游对照 + 固定向量回归；升级动作 = 常量表与版本串替换（纯常量 diff）。此风险不因引入第三方依赖而消除（依赖同步逆向同一服务）。R2（低）：WordBoundary 的 tick 粒度与 CBR 时长换算在长文本/多标点下的累积偏差——4.2 编排期若发现 >1% 偏差，届时引入 afinfo/MP3 帧解析校准（本 story 的 1.05 容差口径只用于验收断言，不进产品逻辑）。R3（低）：服务端对同文本合成结果可能非逐字节确定（规划期未做双跑字节对比）——narration.json 已显式声明不做字节稳定断言（矩阵 15），产物验收走 schema + 存在性 + afinfo（手动段）。R4（低）：`--tts` 与 `--desktop` 组合未在本 story 测试矩阵中覆盖（epic 5 端到端范围）——flag 层两者正交（各自独立注入 port），无交互代码路径；矩阵不声明该组合，防止隐含承诺。R5（低）：Node 24 原生 WebSocket 的 undici 实现细节（Blob 帧、代理环境变量）随 Node 版本演进——本仓 package.json engines 与 CI 均以本机 Node 24 为基线（PM 环境事实），如未来 Node 升级破坏 Blob 语义，`edgeTtsNarration.ts` 的 WebSocketFactory 注入点是隔离面。

**范围限定（重申）。** 只做 4.1：TTS 音频生成 + 字幕时序输出。不做 4.2（时长编排 / 90 秒拆分 / 多 feature 时长矩阵）；不做 4.3（Remotion composition / MP4 渲染 / manifest 音视频引用扩展）；不做 epic 5（preview server / 审核命令）；不做 DeepMatch 网站录屏（ARCH-234，挂起排 epic 4 之后）；不改 Story 1.6–3.4 既有产品行为与产物字节（mock 4 文件 / `--source` 5 文件 / actions.json 幂等契约继续有效）；desktop 路径零改动；不写 StartUpOS 仓库任何文件；不动既有 spec（无 spec delta）；不新增 npm 依赖；不引入 CI 平台依赖；不做 Windows 语义。

## Verification

**Commands（实施期，全部本地无网络）:**
- `pnpm lint` -- expected: 新增/修改源码与测试满足 lint 规则。
- `pnpm typecheck` -- expected: 无 TypeScript 错误。
- `pnpm test` -- expected: 基线 252 用例零回归 + 新增用例全绿（DRM 向量 2–3、协议层 8–10、orchestrator 2–3、domain/runStore refine 3–4、flag 契约 2）；总量 = 252 + 新增数（实施期回填）；新增用例全部无网络依赖。
- `openspec validate showcraft-release-video-mvp --strict` -- expected: 通过（无 spec delta）。
- 字节契约断言（既有断言锁定，不新增命令面）：mock run 4 文件 / `--source` 5 文件在无 `--tts` 路径逐字节不变——由 `e2e.test.ts`、`releaseSource.test.ts` 既有用例在 `pnpm test` 内强制；`--tts` 缺省不注入 port 由新增 main.test 断言。
- DRM 向量断言：`edgeTtsDrm.test.ts` 固定 ts `1792064756.9800708` → `F22985E6626F6D9A-A1AEE147C4F7AFEA6A26ED5C4EA9BCA0C0AF4C26AE355E408FAACC5851417BD9`（规划期锚定，禁止改动向量值）。

**真实网络验证（手动段，PM/架构师本机执行一次；实施者不得以本段替代干净回归）:**
- `pnpm demo -- --source <本地 markdown 路径> --tts --output runs` -- expected: run completed；run 目录 = 既有 5 JSON + `narration.json` + `narration-<sceneId>.mp3`（每场景一个）。
- `afinfo runs/<runId>/narration-<sceneId>.mp3` -- expected: `File type ID: MPG3`、`24000 Hz`、`48000 bits per second`、`1 ch`、estimated duration > 0。
- `node -e` 断言 narration.json：cues 数组非空、逐条 `endMs > startMs`、startMs 单调不减、`Math.max(...cues.map(c => c.endMs)) <= audioDurationMs * 1.05`、audioFile 与落盘文件名一致。
- 失败形态人工复验（可选，断网执行同命令）-- expected: run 显式失败 @narration、诊断含 phase 与 close code、已落盘产物保留、无 mp3 成功引用（矩阵 5/6 的真实形态）。
- `--voice en-US-EmmaMultilingualNeural` 复跑（可选）-- expected: 同口径成功（规划期预验证 1.584s）。
