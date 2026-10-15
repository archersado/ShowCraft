---
title: '本地录屏接入与媒体引用写入 run'
type: 'feature'
ticket: '7'
created: '2026-10-14'
status: built
route: 'full'
route_source: 'auto'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
context:
  - 'openspec/changes/showcraft-release-video-mvp/specs/desktop-demo-capture/spec.md'
  - 'openspec/changes/showcraft-release-video-mvp/design.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 3.2 之后 desktop 阶段已产出动作记录（actions.json，只读 URL 观测级动作），但 desktop-demo-capture Requirement「仅执行证据充分的演示动作」的 THEN「保存录屏素材和动作记录」中**录屏素材维度没有任何载体**——run 目录只有 JSON 产物，无媒体文件、无媒体引用；epic「Done when 3. 录屏与动作记录写入同一 run」未满足。Requirement「保留失败诊断」的 Scenario「桌面入口不可定位」（run 标记为失败且不产生虚假的成功录屏）在 3.2 只覆盖了元素定位失败（路由不可达 → action_failed → run 失败），「录制失败」这一新失败维度尚不存在（没有录制就没有录制失败）；design.md「文件化 run」要求每次 run 保存媒体，「媒体生成合同」规定 epic 4 Remotion 只消费 manifest——本 story 不做消费端，但媒体引用契约必须给出与 epic 4 的前向兼容声明。3.2 移交两项备案（boundedDiagnostics 尾部截断吞 phase= 前缀；3100 三处硬编码）需给出结论。

**Approach:** 录制采用 macOS 原生 `screencapture -v -V <seconds>`（零 npm 依赖；规划期实测本机可执行、TCC 授权路径已实测打通、ffmpeg 未装且不新增依赖）。录制以**动作级**接入 `desktopActions.ts` adapter：每个 runnable 动作前启动固定时长（默认 30s）的全屏录屏（主显示器），动作完成后等待 screencapture 自行退出并校验产物（文件存在、非空、QuickTime `ftyp` 头），媒体文件由 screencapture **直写 run 目录**（`recording-<featureId>.mov`）；媒体引用以可选字段 `media: { file: "<fileName>" }` 附加到对应动作记录——`DemoActionRecord` schema 扩展（`recording_failed` 新失败原因 + `media` 可选字段），`DesktopDemoPort` 函数签名冻结不动，orchestrator 零改动。runDemo 前置创建 run 目录（原来是 pipeline 之后创建），使 adapter 在 pipeline 期间就能拿到确定的落盘路径。录制启动失败、中途失败、产物空/损坏 → 该动作记录 `status:"failed" reason:"recording_failed"`（已获得的观测事实保留在 observations）→ orchestrator 既有 failed-record 通道抛 StageFailure → run 显式失败 @desktop、无成功媒体引用、无伪成功视频。「元素定位」语义沿用 3.2 的 URL 观测映射（路由非 2xx/形状不符 = 入口不可定位 = action_failed），本 story 验证其与录屏叠加后的组合语义。重复运行断言修订：actions.json 仍逐字节相同（media 引用为常量字符串），媒体文件只做存在性/头部核对，不做字节比较；mock 4 文件与未启用 `--desktop` 的 `--source` 5 文件契约零改动。

## Boundaries & Constraints

**Always:** 录制工具只用系统能力（`/usr/sbin/screencapture`，execFile 白名单调用，参数全部为常量或经校验的数字/路径，无 shell 拼接）；录屏仅在 runner 已就绪且端口归属守卫通过后、在 runner 存活窗口内启动与收尾（stop 前完成）；每个 runnable 动作至多一个媒体文件，文件名常量化（`recording-<featureId>.mov`，featureId 经既有 featureIdSchema 白名单校验）；录屏产物必须校验后才允许写入成功媒体引用（存在 + 非 0 字节 + `ftyp` 头），校验失败按 recording_failed 处理且**不保留**损坏文件（改名 `.failed` 留诊断，不进媒体引用）；录制失败必须反映为动作记录失败（status=failed reason=recording_failed，携带有界诊断），actions.json 先落盘再抛 StageFailure（沿用 3.2 通道）；已成功的观测事实（HTTP 状态码等）在录制失败时保留在 observations；媒体文件不进入 `RunStoreCore` 字节稳定通道（不 schema 校验字节、不进 collectFiles、不进 run.json artifacts 列表——run.json artifacts 只列 JSON 产物，媒体引用的唯一权威在 actions.json 的 media 字段）；diagnostics 有界 ≤2048（复用 boundedDiagnostics）；StartUpOS 严格只读不变；screencapture 进程必须在 adapter 内 await 收尾（不允许把仍在录制的子进程留给 stop 阶段）。

**Never:** 不扩展 `DesktopDemoPort` / `DesktopRunnerPort` 函数签名（schema 内扩展）；不新增 npm 依赖（ffmpeg 不引入——未安装且 H.264 .mov 已满足 epic 4 前向兼容）；不做 epery 4 的 TTS/字幕/Remotion/90 秒拆分；不做 mock/fixture 测试边界（3.4，本 story 单测仍用 fake 命令与 fixture HTTP）；不做 GUI 内元素定位与点击、不做通用 action DSL / 录制回放框架；不写 StartUpOS 任何文件；不做窗口定向录制与多显示器选择（v1 全屏主显示器 `-D 1`，窗口 id 稳定性与权限面实测不足，记录为限制）；不做 Windows 语义（screencapture 仅 macOS；非 darwin 平台 desktop 阶段行为与 3.2 一致——动作本身不依赖平台，录制层在非 darwin 上直接 recording_failed）；不改 Story 1.6–3.2 既有行为与产物字节（计划内声明的 DemoActionRecord schema 扩展与 runDemo run 目录创建时点除外）；不把媒体文件字节纳入幂等断言；不把媒体文件列进 run.json artifacts（保持该字段语义为「schema 校验过的 JSON 产物」）。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| 正常演示路径（eligible→executed→录屏成功） | v0.3.3 changelog + `--desktop`；gate 判 section-1-im eligible；TCC 已授权；runner 就绪、守卫通过、观测 2xx、screencapture 正常退出且产物可解析 | actions.json：section-1-im 记录 status=executed 且 `media: { file: "recording-section-1-im.mov" }`；run 目录含该媒体文件（非空、ftyp 头）；run completed；产物 6 JSON + 1 媒体 | 无错误 |
| 录制启动失败 | screencapture 立即退出非零（TCC 被拒/输出路径不可写） | 该动作记录 status=failed reason=recording_failed，diagnostics 含退出码与 stderr 摘录（有界）；无媒体引用；actions.json 落盘后 run failed @desktop；观测产物 release/evidence/gate 保留，scene/manifest 不产生 | 显式失败，无伪成功 |
| 录制中途失败 | 录制进程在动作完成前退出非零（如屏幕会话中断） | 同上：recording_failed；已完成的动作观测事实保留在 observations；无成功媒体引用 | 显式失败 |
| 产物空/损坏 | screencapture 退出 0 但文件 0 字节或无 `ftyp` 头（中断写入） | 记录 status=failed reason=recording_failed（diagnostics 指明产物校验失败项）；损坏文件改名 `<name>.failed` 保留诊断、不进媒体引用；run failed @desktop | 不产生成功媒体引用 |
| 观测动作失败（元素不可定位）+ 录屏成功 | 路由非 2xx 或形状不符（3.2 语义）；录屏进程本身正常 | 记录 status=failed reason=action_failed（**观测失败优先于录制结果**）；录屏文件照常收尾并校验，校验通过则 `media` 引用仍写入（失败证据素材，供诊断）；run 仍 failed @desktop | 伪成功防护不变：failed 记录不产生「成功视频」声明 |
| 观测成功但录屏失败 | 观测 2xx 且形状符合；screencapture 失败 | 记录 status=failed reason=recording_failed，observations 保留 200/形状事实（不降级为 skipped、不伪成功） | 显式失败 |
| no_evidence / below_threshold feature | gate 判定不可自动化 | 记录 skipped（3.2 语义），零动作零录制，无媒体引用 | 无错误 |
| gate 缺失 / mock run | 无 `--source`（mock），或 gate port 缺省 | desktop 阶段整体跳过；mock 4 文件 / 未启用时 5 文件字节与 Story 1.6/2.4 完全一致；无任何录屏进程 | 无错误 |
| 未启用 `--desktop` 的 `--source` run | 仅 `--source` | 5 文件字节不变；无录屏 | 无错误 |
| 重复运行幂等 | 同一 changelog 连续两次 `--desktop` run（独立目录） | actions.json 字节相同（media.file 为常量字符串）；媒体文件分别存在、均为非空 ftyp 文件（存在性/头部核对，不比较字节） | 无错误 |
| `--desktop` 未伴随 `--source` | CLI 传 `--desktop` 无 `--source` | 用法错误退出（3.2 契约不变）；run 目录未创建 | flag 契约 |
| stop 失败 | runner.stop() 抛错（3.1 语义） | 动作记录（含录制结果）已保存；stop_failed 语义透传（3.2 既有逻辑） | 显式失败 |
| 非 darwin 平台 | process.platform !== "darwin" 时启用 `--desktop` | runnable 动作记录 status=failed reason=recording_failed（diagnostics=platform不支持录制的常量描述）；单测注入 fake 命令不触发真实平台分支 | 显式失败（可自动化测试） |
| screencapture 超时不退出 | 录制进程超过 `-V` 时长 + 宽限（默认 +10s）仍存活 | adapter SIGKILL screencapture 进程；产物若有效则按正常校验处理，否则 recording_failed | 显式失败；进程不泄漏给 stop |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain.ts` -- 修改：(1) `demoActionReasonSchema` 增加 `"recording_failed"`；(2) `demoActionRecordSchema` 增加可选字段 `media: z.object({ file: z.string().min(1).regex(/^[A-Za-z0-9._-]+$/) }).strict().optional()`（文件名白名单字符集，杜绝路径穿越）；(3) refine 扩展：`media` 仅允许出现在 status=executed 或 status=failed（reason=action_failed）的记录上——skipped 记录携带 media 视为非法；status=failed(reason=recording_failed) 的记录不得携带 media（失败即无成功媒体引用）；`validateReleasePackageRelations` actions 校验段不扩展（media 不参与 release/gate 回链）。
- `packages/core/src/runStore.ts` -- 无改动（媒体不走 RunStoreCore 通道；actions.json 仍经 `demoActionsSchema` 校验落盘）。
- `packages/core/src/orchestrator.ts` -- 无改动（failed-record → StageFailure 通道、desktop 阶段编排、`releasePackageSchema.actions` 均自动兼容新字段）。
- `packages/core/src/ports.ts` -- 无改动（`DesktopDemoPort` 签名冻结）。
- `packages/cli/src/desktopActions.ts` -- 修改（核心交付）：(1) `DesktopActionsOptions` 增加 `runDirectory?: string`、`recorder?: Command`（复用既有 `command` 注入 seam——screencapture 作为另一个 execFile 调用走同一 seam）、`recordingDurationSeconds?: number`（默认 30）、`recordingGraceMs?: number`（默认 10_000）；(2) 新增 `recordActionMedia(runDirectory, featureId, durationMs, command)`：execFile `screencapture -v -V <sec> -D 1 <runDirectory>/recording-<featureId>.mov`，Promise 在进程退出后 resolve；返回 `{ ok: true } | { ok: false; diagnostics: string }`；(3) 产物校验 `verifyRecording(path)`：stat 非零字节 + 读前 12 字节比对 QuickTime `ftyp`（异步 read）；(4) 动作执行序改为「start 录屏 → 执行观测动作 → 等待录屏进程退出 → 校验产物 → 组装记录」；(5) runDirectory 缺省（单元测试路径）时跳过录制，行为与 3.2 完全一致（录像层整体 no-op，不产生 media 字段）——这保证既有 218 测试零改动。
- `packages/cli/src/main.ts` -- 修改：`runDemo` 在 `runPipeline` 之前 `createRunDirectory`（runId 冲突检查前移；pipeline 完成后只 `persistRunEvents`，不再重复创建目录）；`createStartUpOSDemoActions({ startupOsRoot, runDirectory })` 传入预创建目录。注意：pipeline 失败时 run 目录已存在且只含 desktop 阶段已落盘的 actions.json + 收尾写入的 run.json——与现状（失败时目录含全部已完成产物 + run.json）语义一致，仅创建时点提前。
- `packages/cli/src/desktopActions.test.ts` -- 修改：注入 fake recorder 命令（`node <fake.js>` 假 screencapture：正常退出+写伪 ftyp 文件 / 退出非零 / 退出 0 不写文件 / 写 0 字节文件 / 挂起超时）覆盖 I/O 矩阵可自动化场景；既有 fake runner fixture 复用；runDirectory 注入临时目录；总时长增量 < 20s。
- `packages/cli/src/mainDesktop.test.ts` -- 修改：mock desktopDemo 记录可带 media 字段（覆盖 schema refine 正反分支）；既有用例补 4 文件/5 文件字节断言不破坏的回归（实为不变，断言锁定）。
- `packages/core/src/domain.test.ts` -- 修改：`recording_failed` reason 与 `media` 字段的 schema 校验用例（executed+media 合法、failed(action_failed)+media 合法、failed(recording_failed)+media 非法、skipped+media 非法、非法文件名字符串非法）。
- `openspec/changes/showcraft-release-video-mvp/specs/desktop-demo-capture/spec.md` -- 验收语义权威（Requirement「仅执行证据充分的演示动作」THEN「保存录屏素材和动作记录」由本 story 实现；Requirement「保留失败诊断」Scenario「桌面入口不可定位」的元素定位映射沿用 3.2 定义 + 「不产生虚假的成功录屏」由录制失败语义保证）。本 story 无新增 spec delta，`validate --strict` 继续通过。
- `openspec/changes/showcraft-release-video-mvp/design.md` -- 决策权威（「文件化 run」保存媒体；「媒体生成合同」Remotion 只消费 manifest）。本 story 不修改该文件。

## Tasks & Acceptance

**Execution:**
- [ ] `packages/core/src/domain.ts` + `domain.test.ts` -- `recording_failed` reason、`media` 可选字段与 refine 扩展；完成条件：`pnpm typecheck` 通过，新 schema 用例全绿，既有 218 测试零回归。
- [ ] `packages/cli/src/desktopActions.ts` -- 录制接入：recordActionMedia、产物校验、动作执行序改造、runDirectory 缺省 no-op 路径；完成条件：既有 CLI 测试零改动仍全绿（缺省路径行为不变）。
- [ ] `packages/cli/src/main.ts` -- run 目录前置创建 + runDirectory 注入；完成条件：mock 4 文件 / `--source` 5 文件既有字节断言零回归；`--desktop` 无 `--source` 用法错误路径不变。
- [ ] `packages/cli/src/desktopActions.test.ts` + `mainDesktop.test.ts` -- I/O 矩阵可自动化场景 + schema refine 用例；完成条件：`pnpm test` 全绿，新增用例不依赖真实 StartUpOS/GUI/TCC 且总时长增量 < 20s。
- [ ] 实施期真实验证 -- 按 Verification 执行真实 StartUpOS `--source`+`--desktop` run（含录屏与媒体文件核对、进程零残留对照），把录制时长/产物大小/帧率实测值回填 Implementation Notes。

**Acceptance Criteria:**
- Given v0.3.3 changelog 与本机 StartUpOS（TCC 已授权），when `pnpm demo -- --source <changelog> --output runs --desktop <startupos>`，then run completed，run 目录含 release/evidence/gate/actions/scene/manifest.json 六 JSON 文件加 `recording-section-1-im.mov`；actions.json 中 section-1-im 记录 status=executed 且 media.file=`recording-section-1-im.mov`；媒体文件非空且前 12 字节含 QuickTime `ftyp`。
- Given 录制启动失败（fixture screencapture 退出非零），when run，then run.json failure.stage=desktop、actions.json 中该记录 status=failed reason=recording_failed、无 media 字段、run 目录无媒体文件、release/evidence/gate 保留、scene/manifest 不存在。
- Given screencapture 退出 0 但产物 0 字节或无 ftyp 头（fixture），when run，then 记录 status=failed reason=recording_failed 且产物改名 `.failed` 保留、无成功媒体引用。
- Given 观测动作失败（fixture HTTP 503）且录屏成功，when run，then 记录 status=failed reason=action_failed 且 media 引用存在（失败证据素材），run failed @desktop。
- Given mock run 与未启用 `--desktop` 的 `--source` run，when 重复 Story 1.6/2.4 既有断言，then 4 文件/5 文件字节集合不变。
- Given 重复两次真实 `--desktop` run（独立 output 目录），when 对比，then 两次 actions.json 字节相同（`cmp`），两次媒体文件各自存在、非空、ftyp 头有效（不比较媒体字节）。
- Given `--desktop` 未伴随 `--source`，when 运行，then 用法错误、退出码非零、无 run 目录、无进程 spawn（3.2 契约）。

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Design Notes

**决策 1——录制工具与权限（定案）：macOS 原生 `screencapture`，零 npm 依赖；TCC 授权已在规划期实测打通，但授权归因于宿主 app 且不可脚本化，列为环境前置条件与风险。** 规划期实测（2026-10-14，Darwin 25.5.1 / macOS 26.5）：

- **可执行性与格式**：`/usr/sbin/screencapture` 存在；`screencapture -v -V <sec>` 实测产出 H.264（avc1）QuickTime `.mov`（实测 `.mp4` 扩展名也写 `ftyp qt` 容器——统一用 `.mov` 扩展名）。实测时长准确（1s/3s/5s/10s 探针：10s 命令实测 10.23s 墙钟、产物 9.96s；帧率 13–15fps；3420×2214 Retina 2x 全屏；10s 产物 ~12MB，30s 上限预期 ~36MB 量级——媒体不进字节稳定通道的原因之一）。`-R x,y,w,h` 区域录制实测精确（800×500 请求 → 1600×1000 像素，2x）；`-l <windowid>` 窗口定向实测可用（CGWindowListCopyWindowInfo 可枚举窗口与标题，实测 Electron 主窗口 title="OriginOS" 1280×840 可被定向录制，2560×1680 像素）。**但窗口定向 v1 不启用**：(a) `-V` 与 `-l` 组合的产物尺寸随窗口实时状态波动、标题匹配依赖 GUI 状态（env 覆写后主窗口标题是否变为「感知中心」未实测）；(b) 多显示器 `-D` 语义未在双屏环境实测。v1 采用 `-D 1` 主显示器全屏，窗口定向列为后续增强（风险已记录）。
- **TCC 权限（关键实测）**：初始状态 `screencapture -x`（静图）与 `-v`（录屏）均失败——stderr「could not create image from display」、退出码 1；`log show` 实测 tccd 报「用户拒绝了应用程序、窗口、显示器捕捉的TCC」（ScreenCaptureKit error -3801）。执行 `tccutil reset ScreenCapture` 后，系统对**宿主 app**（本 run 的 responsible process = `ai.multica.desktop`，Multica 桌面客户端，经 multica daemon → claude → zsh → screencapture 传播 TCC 责任）弹出/应用了授权，此后静图与录屏均成功（实测录屏 4s 产物 H.264 正常）。**结论：可录性成立但依赖宿主 app 的 TCC 授权**——(a) 授权是 per-app（ai.multica.desktop）而非 per-binary 的，Multica 桌面客户端持授权则其子进程链上的 screencapture 放行；(b) `tccutil reset` 会清掉授权，reset 后需要一次系统设置内的用户确认（本机实测 reset 后下一次 capture 直接成功，说明系统对宿主 app 弹出了用户已预授权的静默路径或缓存了 app 级决定——此行为**不可依赖**，跨机器/跨版本可能要求人工在系统设置里勾选）；(c) PM/用户机器上首次真实验收前必须人工确认 TCC：系统设置 → 隐私与安全性 → 屏幕录制 → Multica 已启用。**此为本计划最大的环境依赖，显式列为风险 R1**：权限不满足时所有 runnable 动作 → recording_failed → run failed @desktop（显式失败、无伪成功——防伪成功语义天然覆盖此路径，I/O 矩阵第 2 行）。
- **取消与残留语义（实测）**：录制期间不产生文件（文件仅在正常结束时原子写出）；录制中途 SIGTERM 杀 screencapture → 退出码 143、**无产物文件**（无损坏半成品）——「录制中断 = 无媒体引用 + 显式失败」的语义与工具行为天然对齐；`-V` 超时保护下进程自然退出，adapter 另加 +10s 宽限 SIGKILL 兜底防挂起。并发双录实测可用（两个 screencapture 同时录各自成功）——但本 story 每动作单录制、串行执行，不用并发。
- **ffmpeg 未安装**（`which ffmpeg` 空）——不新增 npm 依赖（任务书范围限定）；H.264 .mov 已是 Remotion（epic 4）可直接消费的格式，无需转码。
- 备选否决记录：(a) ffmpeg（未装 + 新依赖）；(b) AVFoundation 原生绑定（需 npm 原生模块，违反零依赖）；(c) Swift/ScreenCaptureKit 自写 CLI（开发成本高、同为 TCC 面且 `CGWindowListCreateImage` 在 macOS 15+ 已 obsoleted，实测 swift 编译报 unavailable）；(d) `screencapture -v` 不带 `-V`（交互式停止，无 CLI 非交互停止通道——SIGTERM 实测产生无产物退出，故 `-V` 固定时长是唯一非交互路径，动作级时长配比即为此设计）。

**决策 2——媒体产物契约（定案）：screencapture 直写 run 目录 + `DemoActionRecord.media` 可选字段；run.json artifacts 不扩展；epic 4 前向兼容声明。** 备选对比：(a) 走 RunStoreCore stage artifact——拒绝：媒体文件非 JSON、非字节稳定，硬塞进 `stageFileNames`/`collectFiles` 会破坏「stage artifact = schema 校验的稳定 JSON 字节」这一贯穿 1.3–3.2 的不变量，且 run.json artifacts 列表语义（JSON 产物清单）被污染；(b) 独立 `media.json` 清单——拒绝：v1 每动作至多一个媒体文件，引用落在动作记录上即可单文件审计（actions.json 已是 desktop 阶段权威审计面），新建清单文件是为「多媒体/转码产物」预建的脚手架（epic 4 若需要，在 manifest 侧扩展属其决策域）；(c) **采纳**：媒体文件由 adapter 直写 run 目录（文件名常量 `recording-<featureId>.mov`，featureId 经既有 featureIdSchema 约束 + media.file 正则白名单双保险），动作记录携带 `media: { file }` 引用。**最小面论证**：schema 加一个可选字段 + adapter 加一个录制函数，`DesktopDemoPort`/orchestrator/runStore/`DesktopRunnerPort` 全部零改动。**与 epic 4 前向兼容声明**：design.md「媒体生成合同」规定 Remotion 只消费 manifest——本 story 不实现消费端；前向兼容承诺为：(1) 媒体文件自描述（QuickTime 标准容器 H.264，无 sidecar 元数据依赖）；(2) actions.json 的 media.file 是相对 run 目录的稳定文件名，epic 4 的 manifest 组装器可直接从 actions.json 读取引用而无需重新解析媒体；(3) epic 4 若需要镜头级媒体映射（feature → 录屏片段），其数据源就是 actions.json 逐动作的 media 字段——本契约不锁死 epic 4 的 manifest schema，只保证「引用可解析、文件可定位」；(4) 媒体文件命名预留 epic 4 的产出物（如 `render-*.mp4`）不冲突。

**决策 3——字节幂等契约修订（定案）：JSON 产物字节稳定语义不变；媒体文件天然非字节稳定，验收断言改为存在性 + 非空 + ftyp 头核对。** actions.json 字节幂等不受媒体字段破坏的关键：media.file 是常量字符串（无哈希、无时间戳、无大小），`stableJsonBytes` 键序稳定既有保证覆盖新字段；诊断文本（recording_failed 时）只含退出码/校验项名等常量事实与有界 stderr 摘录——stderr 摘录在真实环境下含系统文案（如 TCC 拒绝文案），**真实 run 的 actions.json 幂等断言仅在录屏成功路径上执行**（失败路径的诊断含环境文案，不做字节断言，这与 3.2 的 observations 仅形状事实原则一致：成功路径 observations/media 全常量，失败路径 diagnostics 允许环境事实）。mock 4 文件与 `--source` 5 文件契约零改动由「runDirectory 缺省 → 录制层 no-op」保证：单测与 mock/--source 路径不注入 runDirectory，adapter 行为与 3.2 逐字节一致。真实重复运行断言（任务书要求）：actions.json 逐字节相同（`cmp`）+ 两个媒体文件分别存在、>0 字节、`ftyp` 头存在（`head -c 12 | grep ftyp` 或 python 解析）——不 `cmp` 媒体文件。

**决策 4——录制失败语义与「元素定位」映射（定案，防伪成功核心）。** 录制失败三形态统一为 recording_failed：(a) 启动失败（execFile 非零退出/ENOENT）——diagnostics 含退出码与 stderr 摘录；(b) 中途失败——screencapture 非零退出且无产物或产物不可解析；(c) 产物空/损坏——退出 0 但 stat 0 字节或前 12 字节无 `ftyp`（实测 TERM 中断场景不产文件、坏路径产 stderr「Failed to save」，两类都归此通道兜底）。三种形态都不落 `media` 字段（schema refine 禁止 failed(recording_failed) 携带 media）、不保留损坏产物为「成功」（改名 `.failed` 仅作诊断附件，验收断言明确「无成功媒体引用」）、动作记录 failed → orchestrator 既有通道抛 StageFailure("desktop") → run 显式失败。**「元素定位」语义映射论证**：spec Scenario「桌面入口不可定位」的自动化语义是「自动化无法定位预期产品入口」。本 initiative 的可编程触达面经 3.2 规划期实测排除清单确认唯一入口是 URL 可寻址路由——「定位入口」在本系统的可执行语义就是「感知中心路由可达且 management API 形状符合」：路由非 2xx / API 非 2xx / 形状缺失 / ask_user 候选不存在 = 入口不可定位 = action_failed（3.2 已实现并验收）。本 story 不改变该映射（不做 GUI 内元素定位，任务书范围限定），新增的是**组合语义**：入口定位失败时录制进程本身可能已产出录屏——该录屏记录的是「导航到入口失败」的过程证据，不是「成功演示」的证据；契约上 failed(action_failed) 允许携带 media 引用（失败证据素材），但 run 状态仍 failed、epic 4 消费端不应把 failed run 的媒体作为成功素材使用（前向兼容声明第 4 点的边界）。反之观测成功、录制失败 → recording_failed → run 失败：**演示「成功」要求观测与录制同时成功**，任一失败都不产生伪成功视频。Scenario THEN「run 标记为失败且不产生虚假的成功录屏」由这两条组合覆盖。

**决策 5——编排接入（定案）：动作级录制生命周期，包在既有观测动作外层；DesktopDemoPort 签名不动；录制在 runner 存活窗口内完成。** 位置选择：动作级（每个 runnable 动作一个录制）而非阶段级（一个 run 一个录制）——理由：(a) spec THEN「保存录屏素材和动作记录」是逐动作语义（每条记录对应自己的素材）；(b) epic 4 的镜头组织按 feature 拆分，动作级媒体与镜头一一对应，阶段级录屏需要 epic 4 再切分（无消费端约定）；(c) 失败隔离：一个动作的录制失败不污染其他动作的记录（虽然 v1 单 runnable 动作，契约上按 N 动作设计）。执行序（在 3.2 的 start→守卫→动作→stop 骨架内）：守卫通过后，对每个 runnable 动作——`启动 screencapture -v -V 30 -D 1 <runDir>/recording-<fid>.mov`（后台 execFile）→ 执行观测动作（GET 路由 + GET management）→ `await` screencapture 退出（宽限 +10s 后 SIGKILL）→ 校验产物 → 组装记录（executed+media / failed+reason）。录制始终在 runner start 成功与 stop 之前（runner 生命周期归 adapter 的 3.2 结构不变），stop 前收尾保证「录屏里桌面是活的」。`runDemo` 的 run 目录创建时点提前到 pipeline 之前：这是唯一需要动 main.ts 编排的改动（原来是 pipeline 完成后 persist 时创建），使 adapter 在 port 调用期间拿到确定落盘路径——备选是 orchestrator 传递路径（需要改 PipelinePorts 签名，违反最小面）或 adapter 自行猜测目录（违反确定性）。run 目录创建提前的副作用核验：`RunAlreadyExistsError` 冲突检测从「pipeline 后」提前到「pipeline 前」（更早失败，语义更严格）；失败 run 的目录含已落盘产物 + run.json，与现状一致。**超时兜底**：`-V 30` + 观测动作自身 30s 超时——录制窗口 ≥ 动作窗口，动作先完成、录制随后自然结束；screencapture 挂起（实测未出现）由 +10s 宽限 SIGKILL 兜底（I/O 矩阵第 14 行）。

**两项 3.2 备案项结论。** ① boundedDiagnostics 尾部截断吞 `phase=` 前缀——结论：**维持现状，继续备案**。该行为只影响 run.json failure.reason 的可读性（phase= 前缀被截掉时诊断尾部仍完整），failure.stage 由 orchestrator 独立归因不受影响；3.3 不触碰 desktopActions 诊断格式（避免 actions.json 诊断面变化引入新断言面），若后续 story 需要重构诊断格式（如 3.4 fixture 边界），一并处理。② 3100 端口/守卫/默认 origin 三处硬编码——结论：**维持现状，继续备案**。3.3 的录制层不触碰端口与 origin 语义（录制目标是文件路径与 screencapture 进程，不感知 renderer 端口）；唯一相关点是 `recordActionMedia` 的输出路径来自 runDemo 注入，与 DEFAULT_RENDERER_ORIGIN 无耦合。两项均不构成本 story 的阻塞或改动理由。

**规划期实测记录（2026-10-14，供实施对照）。** 环境：Darwin 25.5.1（macOS 26.5.1），agent 进程链 multica daemon（Multica.app，ai.multica.desktop）→ claude CLI → zsh → screencapture。探测结论汇总：(1) 初始 TCC 拒绝：静图与录屏均 exit 1，stderr「could not create image from display」，tccd 日志报 ScreenCaptureKit -3801「用户拒绝了应用程序、窗口、显示器捕捉的TCC」；(2) `tccutil reset ScreenCapture` 后下一次 capture 成功——授权落到宿主 app `ai.multica.desktop`（tccd 日志 TCCDEvent Modify kTCCServiceScreenCapture identifier=ai.multica.desktop 实证）；此后录屏稳定可复现；(3) 录屏产物：QuickTime `ftyp qt` 容器（`.mp4` 扩展名亦同）、H.264 avc1、全屏 3420×2214（2x Retina）、帧率 13–15fps、时长准确（±0.1s）；10s ≈ 12MB、5s ≈ 1.5–2.3MB（内容相关）；区域 `-R` 精确 2x；窗口 `-l <CGWindowID>` 可用（CGWindowListCopyWindowInfo 枚举，实测 Electron 主窗口 title="OriginOS"）；(4) 取消语义：录制中 TERM 杀进程 → 无产物文件、退出码 143；录制期间文件不出现（结束才原子写出）；(5) 失败路径：`-V` 与非交互取消兼容（无 `-V` 需交互）；坏输出路径 → stderr「Failed to save to final location …」退出 1；(6) 并发双录可用（未用于本设计）；(7) 本机 StartUpOS 实例在测（LaunchAgent com.originos.desktop-dev.codex ppid 链活跃，3100 LISTEN，真实验证窗口需短并前后 pgrep/lsof 对照——3.2 验收教训沿用）。**测试边界声明**：单测全部走注入 fake 命令 seam（不触真实 screencapture/TCC）；真实 screencapture 路径只在 Verification 手动验证与实施期真实验证中执行；CI 无 macOS GUI 会话/无 TCC 授权环境下，真实录屏路径必然 recording_failed——这不影响单测（fake seam），但「真实 run completed」类验收只能在 PM 本机执行（与 3.2 真实验证同惯例）。

**风险清单。** R1（高）：TCC 授权依赖宿主 app（ai.multica.desktop）的屏幕录制权限，跨机器不可脚本化预授权——首台机器/首次验收需人工在系统设置确认；权限缺失时的行为是显式失败（recording_failed），不阻塞其他产物。缓解：Verification 首条命令前置检查。R2（中）：`-V` 固定时长录制与动作耗时的配比——观测动作实测数秒内完成，30s 录制窗口充分覆盖；若未来动作变长，`recordingDurationSeconds` 参数已注入可调。R3（低）：screencapture 在系统负载下帧率波动（实测 13–15fps）——epic 4 合成对帧率无断言（Remotion 按时间轴消费），不构成本 story 验收维度。R4（低）：全屏录制会录入用户桌面其他内容（隐私面）——v1 接受（PM 验收环境即本机 dev 环境，StartUpOS 全屏演示为预期内容）；窗口定向录制为已实测可行的后续增强，不在本 story（避免标题匹配脆弱性）。R5（中）：真实验证窗口与 LaunchAgent 干扰（3.2 教训沿用）——验证前后 pgrep/lsof 对照、窗口短、失败按 3.1/3.2 口径归因。

**范围限定（重申）。** 不做 epic 4（Edge TTS、字幕、Remotion、90 秒拆分）；不做 mock/fixture 测试边界（3.4）；不做 GUI 内元素定位与点击；不做通用动作 DSL / 录制回放框架；不写 StartUpOS 任何文件；不新增 npm 依赖；不改 Story 1.6–3.2 既有行为与产物字节（声明的 schema 扩展与 run 目录创建时点除外）；不做窗口定向录制与多显示器选择（v1 全屏主显示器）；不做 Windows 语义。

## Verification

**Commands:**
- `pnpm lint` -- expected: 新增/修改源码与测试满足 lint 规则。
- `pnpm typecheck` -- expected: 无 TypeScript 错误。
- `pnpm test` -- expected: 既有 218 测试零回归 + 新增 schema/adapter/编排用例全绿（不依赖真实 StartUpOS/GUI/TCC）。
- `screencapture -x /tmp/showcraft-tcc-check.png && rm /tmp/showcraft-tcc-check.png` -- expected: 退出码 0（TCC 前置检查；失败则先在系统设置 → 隐私与安全性 → 屏幕录制为 Multica 授权，或按 R1 处理）。真实录屏验收前必跑。
- `pgrep -fl "dist-electron/desktop/src/main/main.js"; lsof -iTCP:3100 -sTCP:LISTEN` -- expected: 验证前均无输出（需先关闭本机已有 OriginOS CE Dev 实例；注意 LaunchAgent com.originos.desktop-dev.codex 可能自动重启 dev 链，验证窗口要短，前后对照）。
- `pnpm demo -- --source /Users/archersado/workspace/startupOS/docs/changes/releases/v0.3.3/changelog.md --output runs --desktop /Users/archersado/workspace/startupOS` -- expected: run completed；run 目录含 release/evidence/gate/actions/scene/manifest.json 六 JSON + `recording-section-1-im.mov`；stdout 打印 Run directory 与 Status: completed。
- 媒体产物核对（对上条 run 目录）：
  - `ls -la <run>/recording-section-1-im.mov` -- expected: 存在且 > 0 字节（预期数十 MB 量级，30s 全屏）。
  - `python3 -c "raw=open('<run>/recording-section-1-im.mov','rb').read(); print('ftyp:', raw[4:12]); print('avc1:', b'avc1' in raw)"` -- expected: `ftyp: b'ftypqt  '` 且 avc1 True（QuickTime H.264）。
  - `python3 -c "raw=open('<run>/recording-section-1-im.mov','rb').read(); m=raw.find(b'mvhd'); ts=int.from_bytes(raw[m+16:m+20],'big'); dur=int.from_bytes(raw[m+20:m+24],'big'); print(round(dur/ts,1),'s')"` -- expected: ≥ 观测动作耗时（≈30s 录制窗口）。
  - `jq '.actions[] | select(.featureId=="section-1-im") | .media' <run>/actions.json` -- expected: `{"file":"recording-section-1-im.mov"}`。
  - `jq '.actions[] | select(.featureId=="section-1-im") | {status, reason, observations}' <run>/actions.json` -- expected: status=executed、reason=eligible、observations 含 window_route_status=200 ∧ management_api_status=200 ∧ ask_user_candidate_present=true（3.2 语义不变）。
- 防伪成功路径手动验证（可选，实施期执行一次）：临时移走 screencapture PATH 或注入失败 fixture 后跑 `--desktop` run -- expected: run failed @desktop、actions.json 记录 recording_failed、无 media 字段、无 `recording-*.mov`（或仅有 `.failed` 诊断改名文件）、release/evidence/gate 保留。
- 重复上条真实 demo run（新 output 目录）-- expected: 两次 actions.json 字节相同（`cmp`）；两次媒体文件均存在、非空、ftyp 头有效（不比较媒体字节）。
- `pgrep -fl "dist-electron/desktop/src/main/main.js"; lsof -iTCP:3100 -sTCP:LISTEN; pgrep -fl screencapture` -- expected: 均无输出（启动→录制→动作→停止全链路进程零残留、端口释放、无遗留录制进程）。
- StartUpOS `data/` 零写入对照（`git -C /Users/archersado/workspace/startupOS status --porcelain data/`）-- expected: 与验收前一致（StartUpOS 严格只读）。
- `openspec validate showcraft-release-video-mvp --strict` -- expected: 通过（无 spec delta）。
