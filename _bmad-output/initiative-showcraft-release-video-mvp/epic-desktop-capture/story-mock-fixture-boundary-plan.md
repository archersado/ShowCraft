---
title: '桌面路径 mock/fixture 测试边界与无凭据回归'
type: 'feature'
ticket: '8'
created: '2026-10-15'
status: built
baseline_revision: 8c5e77087cbbb039fcc252e07f0c61ce40b2921f
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran:
  - 'blind-hunter'
  - 'edge-case-hunter'
  - 'verification-gap'
  - 'intent-alignment'
review_loop_iteration: 0
context:
  - 'openspec/changes/showcraft-release-video-mvp/specs/desktop-demo-capture/spec.md'
  - 'openspec/changes/showcraft-release-video-mvp/design.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 3.3 之后桌面路径（3.1 生命周期、3.2 观测动作、3.3 录制）已有约 47 个单测用例，全部走注入 fake，但存在三个缺口：(a) **「无需真实凭据」不是全量事实**——`releaseSource.test.ts` 的 5 个用例与 `mainDesktop.test.ts` 的 2 个用例硬编码 `/Users/archersado/workspace/startupOS/.../v0.3.3/changelog.md` 绝对路径，规划期本机实测（隔离探针：把该路径替换为不存在路径后运行）确认这 7 个用例在无 StartUpOS 工作区的机器上直接失败，即「任何机器 `pnpm test` 验证桌面路径语义」今天不成立；其中两个字节稳定性用例还依赖该仓库实时状态（既有备案项）。(b) 桌面路径的 I/O 矩阵语义散落在 `desktopActions.test.ts` / `desktopLifecycle.test.ts` / `mainDesktop.test.ts` / core `orchestrator.test.ts` 四处，没有一个显式的「干净环境必须全绿」回归清单，覆盖缺口无法审计。(c) 三项移交备案（3.3 架构师复核：actionDeadlineMs 观测最坏 ~120s 可超 30s 录屏窗口；`boundedDiagnostics` 尾部截断吞 `phase=` 前缀；releaseSource 字节稳定性环境敏感）需要二选一裁决，不能继续悬置。

**Approach:** 本 story 不改产品行为的主线，交付**可重复测试的边界**：新建 CLI 内部共享测试 helper（`packages/cli/src/desktopFixtures.ts`，相对导入、不进 index.ts 公共面）承载 canonical desktop fixtures——fake `DesktopRunnerPort` 生命周期、fake 观测 command（lsof/ps 桩）、fake recorder（screencapture 桩六形态）、自包含 fixture 仓库+changelog 构建器（规划期已实测：临时 `git init` + `desktop-v*` 标签 + 定向 commit subject 即可驱动 runDemo 完整走 release→evidence→gate→desktop 编排，gate 判 eligible、evidence.json/gate.json 双 run 字节稳定）。用 fixture 构建器收敛 7 个环境敏感用例（fixture 化为默认路径，真实 StartUpOS 断言降级为 `fs.existsSync` 条件选做的 opt-in 块，保留 PM 本机真实验证面）；补齐「干净环境必须全绿」回归套件并逐场景标注覆盖来源；落地 actionDeadlineMs 对齐（仅观测实现内部超时语义，`DesktopDemoPort` / orchestrator 签名零改动）；固化防伪成功语义回归断言并收敛 `boundedDiagnostics` `phase=` 前缀（截断时保留 phase 标记行，一处小改）。3.4 完成 = epic 3 收口。

## Boundaries & Constraints

**Always:** fixture 全部走既有注入 seam（`runner` / `command` / `recorder` / `runDirectory` / vi.mock desktopActions）——不为测试而重构产品代码，不新增公共 API（`index.ts` 不导出任何 fixture，沿用 `testing.ts` 相对导入惯例）；fixture 仓库构建用 `git init` + 白名单命令（init/config/add/commit/tag），构建在 `mkdtemp` 临时目录并在 afterEach 清理，与 `gitEvidence.test.ts` 既有模式一致；「干净环境必须全绿」的用例集显式列在 I/O 矩阵且逐项标注「现有用例已覆盖 / 本 story 新增」；防伪成功断言（失败记录无成功媒体引用、run 显式失败 @desktop、release/evidence/gate 保留、diagnostics ≤2048）在回归套件中逐条显式断言；字节契约断言锁定——mock run 4 文件、`--source` 未启用 `--desktop` 5 文件、重复运行 actions.json 逐字节相同、媒体文件只做存在性/ftyp 头核对；actionDeadlineMs 对齐仅在观测实现内部（`desktopActions.ts` 超时推导），`DesktopDemoPort` / `DesktopRunnerPort` / orchestrator / runStore 零改动；每项改动面在 Code Map 显式标注（含备案收敛项）。

**Never:** 不做 epic 4（Edge TTS、字幕、Remotion、90 秒拆分）；不做 GUI 内元素定位与点击；不做通用动作 DSL / 录制回放框架；不写 StartUpOS 任何文件；不新增 npm 依赖（vitest 既有 devDependency 足够，fixture 用 Node 原生 child_process + 文件 API）；不改 Story 1.6–3.3 既有产品行为与产物字节（声明的两处备案收敛除外：actionDeadlineMs 观测超时推导、boundedDiagnostics 截断保留 phase 前缀——均不触及成功路径产物字节）；不做 Windows 语义；不建审核 UI；不引入 CI 平台依赖（回归套件以本地 `pnpm test` 为准，vitest `include: ["packages/**/*.test.ts"]` 不变）；不把真实 StartUpOS 断言从「本机 opt-in」升级为必跑（也不删除——PM 本机真实验证面保留）；不为覆盖矩阵复刻 3.1 生命周期测试的假 app 五形态（`desktopLifecycle.test.ts` 已全覆盖，回归套件引用不重写）。

## I/O & Edge-Case Matrix

「执行条件」列：**干净** = 无 StartUpOS 工作区、无 TCC 授权、无 3100 监听、无网络即可全绿（`pnpm test` 自动运行）；**真实** = 需 PM 本机 StartUpOS/TCC，仅存在于 Verification 手动段，不进回归套件。

| # | Scenario | Input / State | Expected Output / Behavior | Error Handling | 执行条件 | 覆盖来源 |
|---|----------|---------------|----------------------------|----------------|----------|----------|
| 1 | eligible → executed + media 成功路径 | fixture 仓库+changelog（gate 判 eligible）+ fixture HTTP 2xx + fake recorder 写伪 ftyp 文件 | actions.json 该记录 status=executed reason=eligible、`media: { file: "recording-<fid>.mov" }`、observations 四常量事实；run completed | 无错误 | 干净 | **现有**：desktopActions.test「records an eligible action and adds a validated relative media reference」；**本 story 新增**：同语义的端到端回归（fixture 仓库驱动 runDemo → 7 文件 + media 断言） |
| 2 | recording_failed——启动失败 | fake recorder 抛退出码 1 + stderr | 记录 status=failed reason=recording_failed、无 media、observations 保留、run failed @desktop、无伪成功 | 显式失败 | 干净 | **现有**：desktopActions.test「maps recorder failure to recording_failed…」+ mainDesktop.test recording_failed 编排用例 |
| 3 | recording_failed——中途失败 | fake recorder 中途退出非零 | 同上（recording_failed） | 显式失败 | 干净 | **现有**：同上（failure 形态覆盖）；**本 story 新增**：回归套件显式矩阵行断言（防回归审计用，语义同 2 无重复实现） |
| 4 | recording_failed——产物空/损坏 | fake recorder 写 0 字节 / 非 ftyp 文件 | recording_failed；损坏文件改名 `.failed` 留诊断、不进媒体引用 | 不产生成功媒体引用 | 干净 | **现有**：desktopActions.test「quarantines an invalid %s recording…」it.each 三形态 |
| 5 | action_failed——管理面非 2xx / shape 无效 | fixture HTTP 503 / success=false / candidateKeys 缺失或非字符串 | 记录 status=failed reason=action_failed、observations 保留形状事实；录屏成功时 media 仍写入（失败证据素材） | run failed @desktop | 干净 | **现有**：desktopActions.test「maps a management 503…」「fails when the management response lacks…」「rejects unsuccessful and non-string…」「keeps successful recording as evidence when the observed action fails」 |
| 6 | stop_failed | fake runner.stop() 抛错 | 记录改写 status=failed reason=stop_failed（既有 failed(action_failed)+media 保留语义不变）、diagnostics 追加 stop_failure= | 显式失败 | 干净 | **现有**：desktopActions.test「turns stop failure into a bounded failed record」「retains failed-action media when runner stop also fails」 |
| 7 | port_owner_mismatch | fake lsof/ps 返回组外 pid | 记录 status=failed reason=port_owner_mismatch、observations.port_owner_in_group=false | run failed @desktop | 干净 | **现有**：desktopActions.test「refuses a listener outside the runner process group」 |
| 8 | gate 缺失（mock run）→ desktop 阶段整体跳过 | 无 `--source`（mock） | 4 文件（release/scene/manifest/run），无 gate.json/evidence.json/actions.json、无录屏进程 | 无错误 | 干净 | **现有**：e2e.test「keeps mock runs at the 4-file set with no gate.json」+ core orchestrator.test「skips desktop when no desktop port」 |
| 9 | no_evidence / below_threshold → 零动作零录制零 runner 启动 | gate 全 no_evidence / below_threshold 决定 | 全部 skipped；runner.start 未调用（stops=0）、fake recorder 未调用 | 无错误 | 干净 | **现有**：desktopActions.test「does not start the runner when every decision is ineligible」「copies below-threshold evidence into a skipped record」 |
| 10 | `--desktop` 未伴随 `--source` | CLI 传 `--desktop` 无 `--source` | 用法错误退出、run 目录未创建 | flag 契约 | 干净 | **现有**：main.test「accepts --desktop only together with --source」「rejects programmatic desktop runs without a source…」 |
| 11 | mock 4 文件字节契约 | mock run 两次对比 | 4 文件逐字节相同；集合不含 gate.json | 无错误 | 干净 | **现有**：e2e.test「is byte-stable across identical runs」「keeps mock runs at the 4-file set」 |
| 12 | `--source` 5 文件字节契约 | fixture 仓库 `--source`（未启用 `--desktop`）两次 run | evidence/gate/scene 等逐字节相同；artifacts 列表 = 5 JSON | 无错误 | 干净 | **本 story 新增（fixture 化重写）**：releaseSource.test 两个 byte-stable 用例改走 fixture 仓库（现版本依赖真实 StartUpOS，见决策 3） |
| 13 | 重复运行 actions.json 幂等 | 同 changelog 两次 desktop run（独立目录） | actions.json 字节相同（media.file 常量字符串）；媒体文件存在性/ftyp 核对不比字节 | 无错误 | 干净 | **现有**：desktopActions.test「produces byte-identical records…」「keeps recorded action JSON byte-identical across independent run directories」 |
| 14 | 防伪成功——失败无成功媒体引用 | 上述任一失败场景 | failed(recording_failed/port_owner_mismatch/stop_failed) 记录 schema 禁止 media（domain refine 锁定）；failed(action_failed) 允许 media 但 run 仍 failed | schema refine + 断言 | 干净 | **现有**：domain.test media refine 用例 + 各失败用例 `not.toHaveProperty("media")`；**本 story 新增**：回归套件集中断言「任何 failed run 的 run.json status=failed 且成功媒体引用仅出现在 schema 允许的记录上」 |
| 15 | 防伪成功——失败 run 已完成产物保留 + 诊断有界 | desktop 阶段失败 | run 目录保留 release/evidence/gate/actions.json + run.json（failure.stage=desktop）；scene/manifest 不产生；diagnostics ≤2048 | 产物保留语义 | 干净 | **现有**：mainDesktop.test「persists actions and run diagnostics before rejecting…」+ core orchestrator.test「fails at desktop after persisting failed actions…」；**本 story 新增**：fixture 化重写 mainDesktop 两用例（去除真实 StartUpOS 依赖）+ boundedDiagnostics 截断保留 phase 前缀的新断言（决策 5） |
| 16 | 非 darwin 平台启用 `--desktop` | platform=linux（vi.spyOn） | runnable 记录 recording_failed、diagnostics=常量描述、不调 screencapture | 显式失败 | 干净 | **现有**：desktopActions.test「reports recording_failed on non-macOS…」 |
| 17 | 录制超时三形态（超时产物有效/缺失/挂起收尾） | fake recorder 三形态 + grace SIGKILL | 有效产物保留为 media；缺失/挂起 → recording_failed；进程不泄漏给 stop | 显式失败 | 干净 | **现有**：desktopActions.test「keeps valid timeout output…」「fails a timed-out recorder…」「bounds a recorder that never settles…」「forwards the calculated timeout…」 |
| 18 | 观测预算与录屏窗口对齐 | 录制激活（runDirectory+recorder）+ fixture HTTP 延迟超过推导预算 | 观测单请求超时 = floor(录制时长/4 槽位)；观测总预算 ≤ 录制窗口；延迟 fixture 触发 action_failed 而非 recording_failed 覆盖缺口 | 显式失败（action_failed） | 干净 | **本 story 新增（决策 4 落地）**：超时推导断言（转发值断言）+ 延迟 fixture 对齐用例 |
| 19 | 生命周期五形态 + 组信号语义 | fake app（serve/exit-fast/ignore-term/hang/exit-zero）+ fake-ps | 就绪/失败/回收/幂等全矩阵，`kill(-pgid,0)` 零残留 | 显式失败 | 干净 | **现有**：desktopLifecycle.test 12 矩阵用例（本 story 不重写，回归套件引用文件级全绿即可） |
| 20 | 真实 StartUpOS 端到端（含 TCC 录屏、3100、LaunchAgent） | PM 本机真实环境 | run completed + 媒体核对 + 进程零残留（沿用 3.3 Verification 全套） | 按 3.1/3.2/3.3 口径 | **真实** | 现有 3.3 Verification 惯例延续——不在本 story 新增自动化（TCC 授权不可脚本化预授权，3.3 决策 1 已定案）；本 story Verification 保留可选复跑段 |

</frozen-after-approval>

## Code Map

- `packages/cli/src/desktopFixtures.ts` -- **新建**（核心交付）：CLI 内部共享测试 helper，相对导入、不进 index.ts。导出五组 fixture 构建器：(1) `buildDesktopReleaseFixture()`——临时目录内 `git init` 自包含仓库（`desktop-v0.1.0`/`desktop-v0.1.1` 标签、feature commit subject 定向命中 changelog 标题 token 使 gate 判 eligible——规划期实测 confidence 1.0 确定性成立）、写入 `docs/changes/releases/v0.1.1/changelog.md`（`## 感知与 IM 路由` 标题 + bullet 对应 narration token），返回 `{ root, changelogPath }`；(2) `fixtureHttpServer(options)`——现 desktopActions.test 的 `fixture()` 迁入（/window 2xx + /api/perception/management 可配状态/形状），生命周期管理（servers 数组 + afterEach 清理）随迁；(3) `fakeRunner(origin, options)`——现 desktopActions.test 的同名构建器迁入（processGroupId、start/stop 可配错误、stops 计数）；(4) `fakeRecorder(mode)`——现 desktopActions.test 的 screencapture 桩迁入（success/failure/missing/empty/corrupt/hang/timed-out-valid/timed-out-missing 八形态）；(5) `ownedPortCommand` / `validRecording` 等小常量随迁。全部为纯测试代码，零产品依赖面变化。
- `packages/cli/src/desktopActions.test.ts` -- 修改（收敛性重构 + 新增）：改为从 `./desktopFixtures.js` 导入 fixture（fixture/fakeRunner/fakeRecorder/ownedPort 替换本地定义，用例体不变）；新增「观测预算对齐」用例组（决策 4）：断言录制激活时观测请求转发 timeoutMs = floor(recordingDurationSeconds×1000/4)（沿用「forwards the calculated timeout」的转发值断言模式）、fixture HTTP 延迟超过推导预算时记录 action_failed（显式失败而非媒体覆盖缺口）；新增 diagnostics 截断保留 phase 前缀断言（决策 5）。
- `packages/cli/src/desktopActions.ts` -- 修改（备案收敛项 1，唯一产品代码改动）：观测超时推导——当录制激活（`options.runDirectory !== undefined && recorder !== undefined`）且调用方未显式传 `requestTimeoutMs` 时，`timeoutMs = Math.floor(recordingDurationSeconds * 1000 / 4)`（4 个槽位 = 路由 2 次尝试 + management 2 次尝试，观测最坏总时长 = 录制时长，媒体窗口完整覆盖观测）；录制未激活时保持 `30_000` 缺省不变（3.2 语义零变化）；显式传入 `requestTimeoutMs` 永远优先（既有 options 语义不变）。不改 `DesktopDemoPort` / `DesktopRunnerPort` / orchestrator 签名，不改成功路径任何产物字节。
- `packages/cli/src/mainDesktop.test.ts` -- 修改（备案收敛项 3 的一部分）：两用例的 `SOURCE` 从真实 StartUpOS 绝对路径改为 `buildDesktopReleaseFixture()` 的 changelogPath（`desktopRoot` 仍传 mock 桩值）；7 文件/5 文件清单断言、media 断言、failure.stage=desktop 断言全部保留——用例语义不变，仅输入源 fixture 化。真实 StartUpOS 的 desktop 编排断言不迁移（该维度由 PM 本机真实验证覆盖）。
- `packages/cli/src/releaseSource.test.ts` -- 修改（备案收敛项 3 主体）：5 个真实 StartUpOS 用例（parses / evidence / evidence byte-stable / gates / gate byte-stable）拆为两层——(a) fixture 层（必跑，干净环境）：用 `buildDesktopReleaseFixture()` 重写同语义断言（features 归一化/sourceRef 行号映射/evidence 回链/gate 结构/artifacts 5 文件/双 run 字节稳定——字节稳定性断言改为对同一 fixture 仓库的两次 run 对比，规划期已实测字节全等）；断言常量来自 fixture 定义而非真实仓库值（如 confidence 断言用 fixture 派生值 1.0，不复制 0.85）。(b) 真实层（opt-in，保留现有断言原文）：包在 `describe.runIf(existsSync(STARTUPO_CHANGELOG))` 内，仅当本机存在真实 StartUpOS 工作区时运行——PM/架构师本机继续提供真实仓库回归证据，干净机器自动跳过（跳过而非失败，与 win32 既有惯例同构）。`pnpm demo --source` 命令行用例已自带 corepack 探测跳过逻辑，不动。
- `packages/cli/src/main.ts` -- 无改动（runDemo 装配不变；fixture 驱动完全走现有 `--source` 路径）。
- `packages/core/src/*` -- 无改动（media refine、orchestrator desktop 编排、字节稳定通道均零改动；core orchestrator.test 既有 3 个 desktop 用例已覆盖矩阵 8/15，无需新增）。
- `openspec/changes/showcraft-release-video-mvp/specs/desktop-demo-capture/spec.md` -- 验收语义权威（两个 Requirement 的全部 THEN/THEN 子句由矩阵 1–19 的自动化断言映射；真实环境 Scenario 由矩阵 20 惯例延续）。本 story 无新增 spec delta，`validate --strict` 继续通过。
- `openspec/changes/showcraft-release-video-mvp/design.md` -- 决策权威（「文件化 run」「媒体生成合同」）。本 story 不修改该文件。

## Tasks & Acceptance

**Execution:**
- [x] `packages/cli/src/desktopFixtures.ts` -- 新建共享 fixture 构建器（fixture 仓库+changelog、fixture HTTP、fake runner/recorder/命令桩）；完成条件：`pnpm typecheck` 通过；新建 `desktopFixtures.test.ts` 冒烟用例（fixture 仓库构建 → runDemo → gate 判 eligible；两次 run evidence.json/gate.json 字节相同——规划期探针已验证该断言可全绿）。
- [x] `packages/cli/src/desktopActions.test.ts` -- fixture 迁移 + 新增用例；完成条件：既有 27 用例改导入后零语义变化全绿；新增观测预算对齐用例（转发值断言 + 延迟 fixture action_failed 断言）与 diagnostics phase 前缀断言全绿。
- [x] `packages/cli/src/desktopActions.ts` -- 观测超时推导（决策 4 落地，唯一产品改动）；完成条件：`pnpm typecheck` 通过；录制未激活路径 30_000 缺省行为有断言锁定；显式 `requestTimeoutMs` 优先有断言锁定；既有测试零回归。
- [x] `packages/cli/src/releaseSource.test.ts` + `mainDesktop.test.ts` -- 环境敏感用例收敛（决策 3 落地）；完成条件：fixture 层用例不依赖 `/Users/archersado/workspace/startupOS` 全绿；真实仓库用例在 `existsSync` 为假时跳过（本机为真时全绿——收尾机器双态各验一次）；mock 4 文件 / `--source` 5 文件既有字节断言零回归。
- [x] 回归套件审计 -- I/O 矩阵 1–19 每行在测试代码中可定位（用例名或文件引用写入计划 Implementation Notes 对照表）；完成条件：`pnpm test` 全绿且新增用例不依赖真实 StartUpOS/GUI/TCC/网络，总时长增量 < 15s。
- [x] 备案收敛复核 -- boundedDiagnostics 截断保留 `phase=<phase>` 首行（决策 5 落地）；完成条件：truncation 路径新断言（diagnostics 以 `phase=` 开头且长度 ≤2048）全绿；`failure.stage` 归因断言不变。

**Acceptance Criteria:**
- Given 不含 `/Users/archersado/workspace/startupOS` 的干净机器，when `pnpm test`，then 全部用例通过（真实 StartUpOS opt-in 块自动跳过，其余全绿）——本规划期已实测等价条件（见 Design Notes 实测记录），实施后以实施期实测为准。
- Given I/O 矩阵场景 1–19，when 审计回归套件，then 每行有对应自动化用例且标注「现有/新增」来源；场景 20 仅存在于 Verification 手动段。
- Given 录制激活且 fixture HTTP 延迟超过推导预算，when desktop run，then 记录 action_failed（run 显式失败、无伪成功媒体）而非产生覆盖不完整的成功媒体。
- Given mock run 与未启用 `--desktop` 的 fixture `--source` run，when 重复既有断言，then 4 文件/5 文件字节集合不变。
- Given 两次 fixture `--source` run（同一 fixture 仓库），when 对比 evidence.json/gate.json，then 逐字节相同。
- Given 观测/录制/停止任一失败（fake 注入），when run，then run.json failure.stage=desktop、已落盘产物保留、diagnostics ≤2048 且截断时以 `phase=` 开头、任何 failed 记录不携带成功媒体引用（schema 允许的 failed(action_failed)+media 失败证据除外，且 run 状态仍 failed）。

## Implementation Notes

实施完成（2026-10-15）。新增 `desktopFixtures.ts` 统一管理临时 Git 仓库、loopback HTTP server、runner、recorder、端口命令和录屏字节 fixture；fixture 不经 `index.ts` 导出。观测预算仅在录屏激活且未显式传值时按 `floor(duration×1000/4)` 推导；非录屏路径仍为 30 秒，显式值优先。超长 `DesktopRunnerError` 诊断保留 `phase=` 首行且总长不超过 2048。

| 矩阵 | 自动化覆盖（本次 `pnpm test` 已运行） |
|---|---|
| 1 | `desktopActions.test.ts` “records an eligible action…”；`mainDesktop.test.ts` “injects the desktop adapter…” |
| 2–3 | `desktopActions.test.ts` “maps recorder failure…”；`mainDesktop.test.ts` failed desktop stage |
| 4 | `desktopActions.test.ts` invalid missing/empty/corrupt table |
| 5 | `desktopActions.test.ts` management 503 / invalid shape / failed action media |
| 6 | `desktopActions.test.ts` stop failure + failed-action media/stop failure |
| 7 | `desktopActions.test.ts` listener outside runner process group |
| 8 | `e2e.test.ts` mock 4-file set；core `orchestrator.test.ts` desktop omission |
| 9 | `desktopActions.test.ts` all ineligible / below threshold |
| 10 | `main.test.ts` desktop/source flag contract |
| 11 | CLI `e2e.test.ts` mock byte stability + 4-file set |
| 12 | `releaseSource.test.ts` fixture evidence/gate byte stability + five-artifact contract |
| 13 | `desktopActions.test.ts` repeated observations + independent recording directories |
| 14 | core `domain.test.ts` media refine；desktop failure tests assert no media except action-failure evidence |
| 15 | `mainDesktop.test.ts` failed run artifacts/stage；`desktopActions.test.ts` bounded phase diagnostics |
| 16 | `desktopActions.test.ts` non-macOS recording failure |
| 17 | `desktopActions.test.ts` valid/missing/hanging timeout recorder cases + forwarded recorder timeout |
| 18 | `desktopActions.test.ts` 30-second inactive default / quarter-window timeout / explicit override |
| 19 | `desktopLifecycle.test.ts` 12 lifecycle matrix tests |

验证：`pnpm build`、`pnpm lint`、`pnpm typecheck`、`openspec validate showcraft-release-video-mvp --strict` 全部通过；review 修正后的正常本机 `pnpm test` 为 20 files / 252 tests 全绿（8.57s）。将真实仓库常量临时替换为不存在路径后再次全量运行为 20 files / 247 passed / 5 opt-in skipped（7.96s），随后已恢复常量，证明干净机器路径全绿且跳过行为生效。

## Plan Change Log

## Review Triage Log

| ID | Verdict / route | Evidence |
|---|---|---|
| BH-1 | medium / patch | `desktopFixtures.ts` is included by the production CLI tsconfig yet imports `vitest`; the emitted module therefore has an undeclared runtime test-framework dependency. |
| BH-2 | low / reject | Separate fixture repositories can receive different commit hashes, but the approved byte contract explicitly compares two runs of the same repository; semantic repeatability is intact and fixed Git dates add machinery outside that contract. |
| BH-3 | medium / patch | Global `commit.gpgSign`, `tag.gpgSign`, or hooks can make the supposedly self-contained fixture fail on a clean machine; fixture Git commands must neutralize those settings. |
| BH-4 | low / patch | `decisions: null` is currently replaced by the valid default because of `??`, preventing the `unknown` fixture input from representing this malformed response. |
| BH-5 | low / patch | `ownedPortCommand` accepts any non-`lsof` executable and ignores arguments, so wrong production command construction could pass tests. |
| BH-6 | low / reject | The recorder fixture is intentionally used by the approved one-second recording tests; parameterizing duration is not needed for current behavior and adds fixture API complexity. |
| BH-7 | medium / patch | The inactive-default test proves only `timeout > 300ms`, not the promised exact `30_000ms` selection. |
| BH-8 | medium / patch | The explicit-timeout test proves only `timeout > 300ms`, not that caller value `500ms` is forwarded unchanged. |
| BH-9 | false / reject | The implementation intentionally requires both output directory and recorder; the two asymmetric states already remain non-recording states and no bad current outcome was demonstrated. |
| BH-10 | low / patch | Delayed fixture callbacks are not tracked; the 250ms timeout/300ms response case can leave a retry callback scheduled after server cleanup. |
| EC-1 | medium / patch | Same verified production-build Vitest dependency as BH-1. |
| EC-2 | low / patch | The loopback fixture does not reject a pre-listen server error, so rare bind/setup failures are not settled cleanly. |
| EC-3 | low / patch | A five-argument recorder call treats device id `1` as an output path; exact argument count must be checked. |
| EC-4 | low / patch | Empty-string `runDirectory` is truthy for timeout selection by `!== undefined` but falsy for actual recording, shortening observation with no recording active. |
| EC-5 | false / reject | Generic observation/recording errors have no lifecycle phase to preserve; the approved `phase=` guarantee applies to `DesktopRunnerError` diagnostics. |
| VG-1 | medium / patch | Repository search confirms there is no exact observation of the inactive `30_000` or explicit `500` HTTP timeout values; this duplicates BH-7/BH-8. |
| VG-2 | medium / patch | On simultaneous oversized start failure and stop failure, the already bounded phase-prefixed string is generically bounded again and loses `phase=`; no combination test exists. |
| IA-1 | medium / patch | Current tests split source pipeline, desktop adapter, and persistence across three surfaces; none runs `runDemo` through the real adapter with canonical fake I/O and verifies the media file, despite the approved end-to-end matrix row. |
| IA-2 | false / reject | The approved plan explicitly selected the four-request-slot formula rather than a new action-level deadline object; the diff implements that selected reading. |
| IA-3 | false / reject | The approved plan requires an auditable mapping plus `pnpm test`, not a new monolithic matrix file; the Implementation Notes mapping satisfies that surface. |

## Design Notes

**决策 1——mock/fixture 边界的落点（定案）：CLI 内部共享测试 helper `packages/cli/src/desktopFixtures.ts`，不进 core、不进公共 API。** 备选对比：(a) 扩展 core `testing.ts`——拒绝：core 的 fixture 面是管线级（mock release/scene/manifest + `mockPorts()`），而 desktop fixtures 的四类构件（fake `DesktopRunnerPort` 带 `processGroupId`、fake 观测 command 的 lsof/ps 桩语义、fake recorder 的 screencapture 参数断言、fixture 仓库驱动 runDemo）全部依赖 **CLI adapter 的注入 seam 形状**——`Command` 签名、`DesktopActionsOptions`、runDemo 的 `--source` 路径语义都在 cli 包；放进 core 会把 CLI 测试细节倒灌进 core（违反依赖方向：core 不得感知 cli 的测试面）。core orchestrator 的 3 个 desktop 编排用例已用内联 fake 覆盖（矩阵 8/15 的 core 侧），无需共享。(b) 独立 fixture 数据文件（JSON/JS 常量）——拒绝：fixture 仓库必须运行时 `git init` 构建（commit 哈希即证据数据，静态文件给不出），HTTP 桩需要生命周期管理，「数据文件」形态装不下。(c) **采纳**：`packages/cli/src/desktopFixtures.ts` 单文件，与 desktopActions.test.ts 同目录、相对导入（沿用 e2e.test.ts 导入 `../../core/src/testing.js` 的跨文件惯例与 testing.ts「不进 index.ts」约定），现有测试文件内的四组本地构建器原样迁入（零行为漂移），新回归用例与新文件复用同一套。**最小面论证**：一个新测试 helper 文件 + 两个测试文件导入改造 + 一个产品文件 5 行超时推导，`DesktopDemoPort`/orchestrator/runStore/domain 全部零改动。

**决策 2——「无需真实凭据」回归套件的覆盖矩阵（定案）：矩阵 1–19 干净环境全绿，逐项标注覆盖来源，不重写已覆盖用例。** 审计结论（规划期逐文件核对 239 用例得出）：19 个矩阵场景中 15 个已有用例覆盖（desktopActions.test 27 用例、desktopLifecycle.test 12 矩阵、mainDesktop.test 2 编排用例、main.test/desktopActions flag 契约、e2e.test 字节契约、core orchestrator.test/desktop 编排），**新增面收敛为四组**：(1) fixture 仓库驱动的端到端 desktop 编排回归（矩阵 1 的 runDemo 级断言——7 文件 + gate eligible + media 引用）；(2) 观测预算对齐用例（矩阵 18，决策 4 配套）；(3) diagnostics 截断 phase 前缀断言（矩阵 15 扩展，决策 5 配套）；(4) releaseSource/mainDesktop 的 7 个环境敏感用例 fixture 化重写（决策 3）。刻意不做的：不把 desktopLifecycle 12 矩阵重写进回归套件（已全覆盖且用例质量高，引用文件级全绿即可）；不为「三形态 recording_failed」写三份重复编排测试（desktopActions 单元层已覆盖，mainDesktop 编排层一个 recording_failed 用例锁定 run 级语义已足够）。矩阵 20（真实 StartUpOS 全链路）维持 3.3 既有真实验证惯例——TCC 授权归因宿主 app 不可脚本化（3.3 决策 1 实测定案），任何把它搬进 `pnpm test` 的方案都违反「不虚构可测性」。

**决策 3——环境敏感用例的处置（定案）：收敛——fixture 化为默认路径，真实 StartUpOS 断言降级为 opt-in。** 既有备案的偶发抖动只是表象，规划期隔离实测证明实质更重：路径替换探针下 7 个用例（releaseSource 5 + mainDesktop 2）直接 `ReleaseSourceError` 失败——「干净机器 pnpm test 全绿」今天不成立，这与 3.4 验收语义「无需真实凭据的回归测试通过」正面冲突，**必须收敛，不能维持备案**。收敛方案：规划期探针已实证自包含 fixture 仓库（tmp `git init` + `desktop-v0.1.0/0.1.1` 标签 + 定向 commit subject `fix(perception): prompt IM users for ambiguous targets` + `## 感知与 IM 路由` changelog）可驱动 runDemo 完整走 release→evidence→gate（eligible，confidence 1.0 确定性）→ desktop 编排，且同一 fixture 仓库两次 run 的 evidence.json/gate.json **逐字节相同**（字节稳定性探针实测通过）。真实仓库断言不删除——包进 `describe.runIf(existsSync(STARTUPO_CHANGELOG))`，PM/架构师本机（文件存在）继续全量运行真实回归证据，干净机器跳过。双态行为与既有 `platform !== "win32"` 条件惯例同构，无新机制。**fixture 断言纪律**：fixture 层断言常量必须从 fixture 定义推导（如 confidence=1.0），禁止复制真实仓库值（0.85）——否则 fixture 化只是把环境耦合换个地方藏。

**决策 4——actionDeadlineMs 裁决（定案）：落地 3.4，观测实现内部超时对齐，签名零改动。** 论证：3.3 复核移交的风险是「观测最坏 ~120s（路由 2 次×30s + management 2 次×30s 重试）可超固定 30s 录屏窗口（+10s 宽限 = 40s 硬顶），媒体覆盖不完整」。选择落地而非延后的理由：(a) 3.3 复核已明确「建议 3.4 或 epic 4 前收尾」，3.4 是 epic 3 收口 story，延后意味着 epic 4 开工前还要再开一个独立 story（流程成本高于顺势落地）；(b) 本 story 的回归套件需要**确定的预算语义**才能断言「媒体覆盖观测窗口」——不落地则矩阵 18 只能测「失败是显式的」，测不了「窗口是对齐的」，3.4 的可重复测试边界少一块；(c) 落地面已验证极小且测试安全（规划期核对：`requestTimeoutMs` 当前无任何测试引用、无其他消费者，`main.ts` 不传递该参数——推导完全内聚在 `createStartUpOSDemoActions` 内）。**具体语义**：录制激活（`runDirectory` 已注入且 `recorder` 非空）且调用方未显式传 `requestTimeoutMs` 时，观测单请求超时 = `Math.floor(recordingDurationSeconds × 1000 / 4)`——4 槽位 = `getWithRetry` 路由至多 2 次 + management 至多 2 次，观测最坏总时长 = 录制时长，媒体窗口恒覆盖观测窗口（宽限 10s 仍为 recorder 收尾兜底）；录制未激活（单元测试缺省路径 / 非 darwin）保持 30_000 缺省（3.2 语义逐字节不变）；显式 `requestTimeoutMs` 永远优先。**字节契约影响评估：成功路径零影响**（observations 只记状态码与形状布尔，超时预算不进产物；fixture 延迟为毫秒级，250ms–7500ms 预算不触发）；失败路径 diagnostics 可能含 `request timed out after Nms`（N 随预算变化），但失败路径诊断本就不做字节断言（3.3 决策 3 已定案「真实 run 的 actions.json 幂等断言仅在录屏成功路径上执行」）。**失败模式变化**：病态慢环境下原表现「observation 120s + recording 40s 处 killed → recording_failed（伪失败噪音）」变为「observation 在预算内显式超时 → action_failed」——两者都是显式失败无伪成功，但新语义的失败原因归因更准（是动作超时不是录制问题），且媒体窗口不再被观测溢出击穿。实施注意：既有测试注入 `recordingDurationSeconds: 1` 时推导预算 250ms，fixture HTTP 毫秒级响应余量 50 倍（规划期本机 fixture 响应 <5ms 实测）；若实施期出现负载抖动，可在具体用例显式注入 `requestTimeoutMs`（options 语义既有），不需要产品代码加护栏。

**决策 5——防伪成功语义的回归固化与 boundedDiagnostics 裁决（定案）：固化 + 收敛 phase 前缀。** 防伪成功四条断言线在现有用例中已分散覆盖（失败无成功媒体引用：schema refine + `not.toHaveProperty("media")` 用例组；run 显式失败 @desktop：mainDesktop + core orchestrator 用例；已完成产物保留：同上；诊断有界：`toBeLessThanOrEqual(2048)`），本 story 的增量是**集中固化**：回归审计把矩阵 1–19 每行对应到具体用例名写入 Implementation Notes，使「防伪成功」从隐含语义变为可审计清单，任何后续改动破坏其中一条即测试失败。**boundedDiagnostics `phase=` 前缀裁决：收敛**（3.3 备案移交项）。规划期实测复现：`DesktopRunnerError` 携带 >2048 字符诊断时，`…`+尾部截断把 `phase=<phase>` 首行吞掉（探针输出 `…xxx…`，`phase=` 丢失），run.json failure.reason 的可读性受损且违反「诊断可读」验收语义；3.3 曾维持备案（避免诊断面变化），但 3.4 正是诊断面重构的预留窗口（3.3 决策记录原文「若后续 story 需要重构诊断格式（如 3.4 fixture 边界），一并处理」）。收敛方案（最小面）：`boundedDiagnostics` 截断分支改为保留 phase 标记行——`DesktopRunnerError` 且超长时输出 `phase=<phase>\n…<尾部>`（首行不受截断影响，尾部摘录语义不变，总长仍 ≤2048）；非 DesktopRunnerError 路径（`stop_failure=` 组合等）不受影响。改动面：`desktopActions.ts` 单函数 + 新断言；影响仅在超长诊断的失败路径，成功路径产物字节零变化。3100 三处硬编码备案项维持现状（3.3 已裁决，本 story 无触碰理由，不再重开）。

**规划期实测记录（2026-10-15，干净环境等价性验证，供实施对照）。** 环境与基线：分支 `agent/agent/arch-233`（基于统一基线 `agent/agent/arch-221` @ `29c0a15` merge），本机 Darwin 25.5.0，StartUpOS 工作区在测（3100 LISTEN、LaunchAgent dev 链活跃）。基线核验：`pnpm test` 239 用例/19 文件全绿（14.5s–17.7s 两轮）、`pnpm lint` / `pnpm typecheck` / `openspec validate showcraft-release-video-mvp --strict` 全部通过。等价性探针四组（全部为规划期一次性探针，未留痕于树）：
1. **无 StartUpOS 模拟**：`releaseSource.test.ts` 整文件路径替换为不存在路径后运行 → 16 用例中 5 失败（parses / evidence / evidence byte-stable / gates / gate byte-stable，全部 `ReleaseSourceError: does not exist`）；`mainDesktop.test.ts` 同法 → 2 用例全失败（gate 阶段前置的 source 校验失败）。**结论：7 个用例是「无需真实凭据」的现行违约点，收敛必要性成立（决策 3）。**
2. **桌面路径套件隔离**：`desktopActions.test.ts` + `desktopLifecycle.test.ts` + `mainDesktop.test.ts` + core `ports.test.ts` 单独运行 → 47 用例全绿（8.24s）。核对确认 desktopActions/lifecycle 测试全部走注入 seam（fixture HTTP 绑定 127.0.0.1 随机端口、fake lsof/ps 命令桩、fake recorder、假 app 进程树 + fake-ps），无 3100/TCC/screencapture 依赖。**结论：桌面单元/生命周期层已干净，违约面收敛于上述 7 个用例。**
3. **fixture 仓库可行性**：一次性探针测试——tmp 目录 `git init` + seed commit + `desktop-v0.1.0` 标签 + feature commit（subject `fix(perception): prompt IM users for ambiguous targets`）+ fixture changelog（`## 感知与 IM 路由` + 对应 bullet）+ `desktop-v0.1.1` 标签 → `runDemo({ source })` 完整走通，gate 判 `section-1-im` eligible（confidence 1.0，确定性）；加 mocked desktopDemo 后产出完整 7 文件 desktop 集（actions.json 含 executed+media）。**结论：fixture 驱动端到端 desktop 编排成立（决策 1/2/3 的核心依据）。** 注意实施细节：feature commit 必须落在两个标签之间（探针初版误把 feature commit 放在 v0.1.1 标签后 → gate 判 no_evidence，修正顺序后 eligible）。
4. **fixture 字节稳定性**：同一 fixture 仓库两次 runDemo（独立 output 目录）→ evidence.json、gate.json 逐字节相同（`Buffer.equals` 断言通过）。**结论：矩阵 12 的 fixture 化重写在数据层成立。** 注意：fixture 仓库只构建一次、两次 run 复用（两次重建会产生不同 commit 哈希——SHA 由时间戳决定——字节对比必须在同一仓库上做）。
5. **boundedDiagnostics 复现**：Node 探针模拟 3000 字符 diagnostics 的 DesktopRunnerError → 截断输出以 `…` 开头、`phase=` 丢失；stop_failed 组合路径截断后 `stop_failure=` 前缀保留。**结论：phase 前缀丢失仅在 DesktopRunnerError 超长路径，收敛改动面为单分支（决策 5）。**
6. **actionDeadlineMs 现状核对**：`requestTimeoutMs` 在测试与产品代码中无引用（仅 `desktopActions.ts:343` 缺省 30_000），`getWithRetry` 确认为超时/异常后单次重试（最坏 2×timeout/端点）；录制窗口 = duration+grace（40s 默认硬顶）。**结论：决策 4 的对齐语义与最小落点成立。**

**风险清单。** R1（低）：fixture 仓库构建对 git 环境的依赖——`git init`/`commit` 在无 git 配置的机器上需要显式 `config user.email/user.name`（fixture 构建器已内置，`gitEvidence.test.ts` 同模式已验证）；git 不可用的环境整组 fixture 用例失败，但该环境连 `gitEvidence` 主路径也无法运行，非本 story 引入的约束。R2（低）：`recordingDurationSeconds: 1` 测试的 250ms 观测预算在极端负载下的抖动——fixture HTTP 本机毫秒级响应（探针 3 实测 <5ms），余量 50 倍；兜底方案为具体用例显式注入 `requestTimeoutMs`（决策 4 实施注意）。R3（低）：真实 StartUpOS opt-in 块在 PM 本机以外被误认为遗漏——计划与 Implementation Notes 对照表显式标注「跳过是预期行为」（与 `describe.runIf(process.platform !== "win32")` 既有惯例同构）。R4（低）：观测超时推导改变病态慢环境下的失败原因分布（recording_failed → action_failed）——更准确的归因，但 PM 真实验收时若遇 action_failed+超时诊断应先核对预算语义（决策 4）而非按 3.2 口径归因。

**范围限定（重申）。** 不做 epic 4（Edge TTS、字幕、Remotion、90 秒拆分）；不做 GUI 内元素定位与点击；不做通用动作 DSL / 录制回放框架；不写 StartUpOS 任何文件；不新增 npm 依赖；不改 Story 1.6–3.3 既有产品行为与产物字节（声明的两处备案收敛除外：观测超时推导、boundedDiagnostics phase 前缀——成功路径产物字节零变化，失败路径语义显式声明于决策 4/5）；不做 Windows 语义；不建审核 UI；不引入 CI 平台依赖；不把真实 StartUpOS 验证自动化（矩阵 20 维持人工惯例）。

## Verification

**Commands（实施期，干净机器等价性以实施分支实测为准）:**
- `pnpm lint` -- expected: 新增/修改源码与测试满足 lint 规则。
- `pnpm typecheck` -- expected: 无 TypeScript 错误。
- `pnpm test` -- expected: 基线 239 用例零回归 + 新增 fixture/预算/截断用例全绿；总量 = 239 + 新增数（实施期回填）。
- `mv /Users/archersado/workspace/startupOS /Users/archersado/workspace/startupOS.bak && pnpm test && mv /Users/archersado/workspace/startupOS.bak /Users/archersado/workspace/startupOS` -- **干净环境等价性核心验证**：临时移走真实 StartUpOS 工作区后全量 `pnpm test`，expected: 全绿（真实 StartUpOS opt-in 块自动跳过、fixture 层全通过）；结束后立即移回。若本机 dev 链正被占用，改用 `HOME` 无关的路径替换法（实施者可临时改测试常量验证后还原，或信任 opt-in 跳过逻辑 + 单独运行 fixture 文件）。**实施期必须实际执行一次并回填输出，不得以规划期探针替代。**
- `pnpm vitest run packages/cli/src/releaseSource.test.ts packages/cli/src/mainDesktop.test.ts packages/cli/src/desktopActions.test.ts` -- expected: fixture 层用例全绿且输出无真实路径引用（`grep -c "archersado" <对应文件>` = 0——fixture 层代码不再含绝对用户路径，仅 opt-in 块保留常量）。
- 字节契约断言（既有断言锁定，不新增命令面）：mock run 4 文件 / fixture `--source` 5 文件 / 重复运行 actions.json 幂等——由 `e2e.test.ts`、`releaseSource.test.ts`（fixture 层）、`desktopActions.test.ts` 既有+迁移用例在 `pnpm test` 内强制。
- 真实 StartUpOS 端到端（可选复跑段，PM 本机执行一次以确认 opt-in 块仍绿；完整验收沿 3.3 惯例）：
  - `pgrep -fl "dist-electron/desktop/src/main/main.js"; lsof -iTCP:3100 -sTCP:LISTEN` -- expected: 验证前无输出（bootout LaunchAgent 腾出 3100，注意 Codex app-server 约 6 分钟后自动拉起 dev 链——窗口内一次跑完）。
  - `pnpm demo -- --source /Users/archersado/workspace/startupOS/docs/changes/releases/v0.3.3/changelog.md --output runs --desktop /Users/archersado/workspace/startupOS` -- expected: run completed，7 JSON + `recording-section-1-im.mov`（非空、ftyp 头）；opt-in 真实用例同机全绿。
  - `pgrep -fl "dist-electron/desktop/src/main/main.js"; lsof -iTCP:3100 -sTCP:LISTEN; pgrep -fl screencapture` -- expected: 均无输出（零残留）。
- `openspec validate showcraft-release-video-mvp --strict` -- expected: 通过（无 spec delta）。
