---
title: '感知与 IM 路由的首个证据驱动演示路径'
type: 'feature'
ticket: '6'
created: '2026-10-10'
status: ready-for-dev
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

**Problem:** Story 3.1 之后 ShowCraft 已能受控启停 StartUpOS Desktop（`DesktopRunnerPort` + `DesktopRunnerError`，进程零残留语义已验收），但 orchestrator 从未消费该 port：run 管线止步于 manifest（mock 4 文件 / `--source` 5 文件），desktop-demo-capture Requirement「仅执行证据充分的演示动作」的 Scenario「执行感知与 IM 路由演示」没有载体——gate.json 判定 eligible 的 section-1-im（感知与 IM 路由，置信度 0.85）没有变成任何可审计的桌面演示动作；tasks 3.2 的核心验收「动作记录同时引用 changelog 与 commit/code 证据」没有产物承载；Requirement「保留失败诊断」在桌面动作维度（动作失败时显式失败、先前产物保留、不产生伪成功）也未接入编排。3.1 交接的两项遗留（3100 共享端口 2xx 归因不可区分、releaseSource byte-stability 测试环境敏感）需要在本计划内给出结论或备案。

**Approach:** 在 `@showcraft/core` 新增最小的 stage 级 `DesktopDemoPort`（函数端口：输入 release + gate 结果，输出动作记录数组；`DesktopRunnerPort` 冻结不动），`desktop` 阶段插在 gate 与 scenePlan 之间；阶段 artifact `actions.json` 每条记录以 featureId 对接 gate 决定、以 sourceRef 回链 changelog 段落、以 evidenceIds 回链 evidence pack 条目，另携带仅含稳定事实（状态码、常量路径、形状布尔）的 observations——无时间戳、无计数、无易变 id，保证字节可复现。CLI 侧新建 `desktopActions.ts` adapter：复用 3.1 生命周期 runner（首动作前 start、try/finally stop，任何路径零残留），动作前执行「端口归属守卫」（3100 监听进程 pgid 必须在 runner 进程组内——3100 归因问题的执行面修复），动作实现 v1 仅注册感知与 IM 路由一项：以感知中心 URL 覆写 `ELECTRON_RENDERER_URL` 启动 3.1 的 `desktop:dev` 链，使链内 Electron 主窗口真实加载感知中心路由（`resolveRendererUrl` env 优先，规划期实测），runner 就绪探测与动作观测均指向该 URL，对感知管理 API 做只读观测与形状校验。新 CLI flag `--desktop <startupos-root>` 显式启用且必须伴随 `--source`；mock 路径与未启用 `--desktop` 的 `--source` 路径产物字节零改动。本 story 不做录屏（3.3）、不建 mock/fixture 测试边界（3.4）、不做通用 action DSL、不做 GUI 内元素定位与点击。

## Boundaries & Constraints

**Always:** port 与 schema 定义在 core（`ports.ts` 纯类型 + JSDoc 与既有 ports 同风格；`domain.ts` schema 经 `recordArtifact` 校验后落盘）；adapter 只用 Node 原生能力并复用 3.1 adapter，不新增 npm 依赖；仅 gate 判定 eligible 的 feature 允许 `status:"executed"`（schema refine 锁定：executed ⇒ reason=eligible ∧ evidenceIds≥1；no_evidence ⇒ evidenceIds=[]，镜像 gate 不变量）；动作记录的 sourceRef/evidenceIds 必须逐字段复制自 release/gate 的既有事实并经 `validateReleasePackageRelations` 扩展校验（featureId 存在、sourceRef 相等、evidenceIds 可解析到 evidence 条目）；desktop 阶段仅在 `--desktop` 显式启用且 gate 存在时运行，缺省跳过（与 evidence/gate 的 optional port 模式一致）；runner 生命周期：动作前 start、finally stop，start 失败与 stop 失败都映射为 desktop 阶段 StageFailure 并折叠有界诊断；动作失败 = 记录 `status:"failed"` 落盘后抛 StageFailure（run 标记失败、先前产物保留、无伪成功）；StartUpOS 严格只读——不调用 resolve-decision/retry-decision 等改状态接口，不写其文件、不读其秘密；观测仅记录形状事实（无计数/时间戳/进程号）。

**Never:** 不扩展 `DesktopRunnerPort`（3.1 契约冻结，JSDoc 预留的 action 接口由本计划以独立 stage 端口方式落地而非在其上加方法）；不做通用 action DSL（注册表 = featureId→实现的常量映射，第二个 feature 出现时再评估）；不做 GUI 内元素定位、点击或键盘驱动（3.3/3.4 决策域）；不做录屏（3.3）；不建 mock/fixture 测试边界（3.4——本 story 单测只注入 fake runner 与本地 http fixture，不产出可复用 mock 工厂）；不修改 mock 路径与未启用 `--desktop` 的 `--source` 路径任何产物字节（Story 1.6 4 文件 / 2.4 5 文件契约不变）；不写 StartUpOS 任何文件；不新增 npm 依赖；不触碰 releaseSource.test.ts 既有字节稳定性断言（交接项②仅备案）；不做 Windows 进程/端口语义（沿用 3.1 的 POSIX/macOS 限制）；不改 Story 2.1–3.1 的任何行为与产物。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| 正常演示路径（eligible→executed） | v0.3.3 changelog + `--desktop`；gate 判 section-1-im eligible（0.85）；runner start 成功；端口归属守卫通过；window 路由与 management API 均 2xx 且数据形状符合 | actions.json：section-1-im 记录 status=executed（sourceRef=release 的 sourceRef，evidenceIds=gate 决定的 evidenceIds，observations 含 window_route_status/management_api_status/ask_user_candidate_present）；其余 feature 各一条 skipped；run completed；6 产物 release/evidence/gate/actions/scene/manifest | 无错误 |
| 动作执行失败（eligible-but-failed） | window 路由非 2xx，或 management API 非 2xx/5xx，或数据形状不符（decisions 缺 candidateKeys 等） | 该 feature 记录 status=failed reason=action_failed，observations 携带失败检查项与有界诊断；actions.json 先落盘；run.json failure.stage=desktop；release/evidence/gate/actions 保留，scene/manifest 不产生 | 显式失败，非伪成功 |
| 端口归属守卫失败 | 3100 监听进程 pgid 不在 runner 进程组内（遗留 next-server 或用户实例的 dev 链独占端口） | 记录 status=failed，observation 检查项 port_owner_in_group=false（常量描述，不含 pid）；run failed @desktop | 3100 归因问题的执行面修复路径 |
| no_evidence feature | section-2-section（v0.3.3 实测 no_evidence） | 记录 status=skipped reason=no_evidence，evidenceIds=[]，零动作执行 | 无错误 |
| below_threshold feature | 门禁给出 below_threshold（携带 evidenceIds 与 confidence） | 记录 status=skipped reason=below_threshold，evidenceIds 原样复制自 gate 决定 | 无错误 |
| gate 缺失 / mock run | 无 `--source`（mock），或 gate port 缺省 | desktop 阶段整体跳过；mock 4 文件 / 未启用时的 `--source` 5 文件字节与 Story 1.6/2.4 完全一致 | 无错误 |
| `--desktop` 未伴随 `--source` | CLI 传 `--desktop` 但无 `--source` | 用法错误退出；run 目录未创建、未 spawn 任何进程 | flag 契约（precondition） |
| runner 启动失败 | 前置校验失败 / 就绪超时 / 单实例锁秒退（3.1 语义） | run failed @desktop，reason 折叠 DesktopRunnerError phase + 有界诊断；actions.json 不存在；release/evidence/gate 保留；零残留进程 | 显式失败 |
| eligible 但动作未注册 | eligible feature 不在 v1 注册表（如 section-3-agent / section-4-section） | 记录 status=skipped reason=unsupported_feature（明确不执行，不伪成功） | 无错误 |
| 重复运行幂等 | 同一 changelog 连续两次 `--desktop` run（各自独立目录） | actions.json 字节相同（观测仅含形状事实）；StartUpOS 数据零写入；run 记录互不依赖 | 无错误 |
| stop 阶段失败 | stop() 抛 DesktopRunnerError（SIGKILL 后仍残留） | 动作记录已保存；run 失败原因含 stop 阶段诊断与残留事实（3.1 语义透传） | 显式失败 |

</frozen-after-approval>

## Code Map

- `packages/core/src/ports.ts` -- 修改：新增 `DesktopDemoPort`（`(release, gate) => Promise<DemoActionRecord[]>`，函数端口）与 `DemoActionRecord` 类型（JSDoc 声明 schema 见 `domain.ts`）；`DesktopRunnerPort`/`DesktopRunnerError` 契约与 JSDoc 不动。
- `packages/core/src/domain.ts` -- 修改：新增 `demoActionRecordSchema`（featureId、status: executed/failed/skipped、reason、sourceRef（`featureSourceRefSchema`）、evidenceIds、observations（固定字符串键的记录表，值限状态码/常量/布尔）、diagnostics 可选且有界）+ `demoActionsSchema`（releaseVersion、threshold、actions 数组）+ 不变量 refine：executed ⇒ reason=eligible ∧ evidenceIds.length≥1；skipped/failed 的 evidenceIds 复制自 gate 决定（no_evidence ⇒ 空数组）；observations 值类型受限。
- `packages/core/src/runStore.ts` -- 修改：`RunStage` 增加 `"desktop"`（位于 gate 与 scenePlan 之间）、`stageFileNames` 增加 `desktop: "actions.json"`、`StageArtifact` 增加 `{ stage: "desktop"; value: DemoActions }` 分支（schema 校验）；`runStageOrder` 同步。
- `packages/core/src/orchestrator.ts` -- 修改：`PipelinePorts` 增加 optional `desktopDemo?: DesktopDemoPort`（缺省 ⇒ desktop 阶段整体跳过，行为与 evidence/gate optional 模式一致）；`runPipeline` 在 gate 成功后、scenePlan 之前调用；`gatedFeatureIds` 语义不变（scenePlan 仍对 gated feature 生成 fallback 旁白——desktop 阶段不改变 scenePlan 的输入）。
- `packages/core/src/domain.ts`（关系校验）+ `packages/core/src/serialization.ts` -- 修改：`validateReleasePackageRelations` 增加 actions 校验：每条 action.featureId 存在于 release、sourceRef 与对应 feature.sourceRef 逐字段相等、executed 记录的 evidenceIds 全部可解析到 evidence.entries、releaseVersion 匹配。
- `packages/cli/src/desktopActions.ts` -- 新建：`createStartUpOSDemoActions(options)` 返回 `DesktopDemoPort`。组件：(1) 注册表 `const ACTIONS: ReadonlyMap<string, DemoActionImplementation>`——v1 仅 `section-1-im`；(2) runner 组装——`createStartUpOSDesktopRunner({ startupOsRoot, rendererUrl: senseCenterUrl })`（3.1 adapter 复用 + env 覆写注入见决策 2，不新增生命周期代码）；(3) 端口归属守卫——`lsof -ti :3100` 定位监听 pid、`ps -o pgid= -p <pid>` 取组，pgid ∉ runner 组 ⇒ 守卫失败（命令注入 seam 供测试）；(4) 感知与 IM 路由动作实现——就绪后 HTTP 观测 `{rendererUrl}`（感知中心路由，已由主窗口真实加载）与 `/api/perception/management`：状态码 + 形状事实（management JSON 含 decisions 数组且样本条目含 candidateKeys 字段）写入 observations，只读、无状态写入调用；(5) 失败映射——DesktopRunnerError.phase→reason（启动类）与检查项→reason（动作类），诊断折叠进 record.diagnostics（有界长度）。
- `packages/cli/src/desktopActions.test.ts` -- 新建：注入 fake runner（含 DesktopStartInfo 假 rendererUrl）+ 本地 `node:http` fixture 服务器（可编程状态码/形状），覆盖 I/O 矩阵全部 11 场景中的可自动化 9 项（真实 StartUpOS 的 2 项走 Verification 手动路径）；零残留断言沿用 3.1 的 fake 命令模式；总时长增量 < 20s。
- `packages/cli/src/main.ts` -- 修改：`DemoOptions` 增加 `desktopRoot?: string`；`parseDemoArgs` 增加 `--desktop <path>`（校验：出现时必须已有 `--source`，否则用法错误）；port 装配：`desktopRoot && source && codeEvidence && confidenceGate` 齐备时注入 `desktopDemo`，否则缺省（mock 路径与未启用路径零变化）。
- `package.json`（根）-- 无改动（`demo` script 已存在；不新增手动命令，动作路径由 `pnpm demo -- --source … --desktop …` 覆盖）。
- `openspec/changes/showcraft-release-video-mvp/specs/desktop-demo-capture/spec.md` -- 验收语义权威（本 story 无新增 spec delta，`validate --strict` 继续通过；Scenario「执行感知与 IM 路由演示」的「对应演示」在本计划内定义为只读 URL 观测动作，录屏由 3.3 接手）。
- `openspec/changes/showcraft-release-video-mvp/design.md` -- 决策权威（「证据门禁先于桌面操作」即本计划的编排位置依据；本 story 不修改该文件）。
- StartUpOS 仓库（只读参照，不改任何文件）：`packages/desktop/src/main/main.ts`（`resolveRendererUrl` 优先读 `ELECTRON_RENDERER_URL` env，行 ~179；dev 模式 `loadRenderer` 会对主窗口 `loadURL(rendererUrl)`）、`packages/web/src/app/window/page.tsx`（`windowType === 'sense-center'` 分支渲染 `<SenseCenter/>`）、`packages/web/src/components/os/sense-center/SenseCenter.tsx`（数据加载 `load()` → `GET /api/perception/management`；candidateName 中文映射）、`packages/web/src/app/api/perception/management/route.ts`（GET 无鉴权；PATCH resolve-decision **禁用**——本 story 只 GET）。

## Tasks & Acceptance

**Execution:**
- [ ] `packages/core/src/domain.ts` + `runStore.ts` + `ports.ts` + `serialization.ts` -- schema、stage 扩展、port、关系校验；完成条件：`pnpm typecheck` 通过，schema 单测（不变量 refine 全分支）与既有 190 测试零回归。
- [ ] `packages/core/src/orchestrator.ts` -- optional `desktopDemo` 端口与 desktop 阶段编排；完成条件：orchestrator 单测新增（阶段跳过/失败保留先前产物/成功落盘顺序）全绿。
- [ ] `packages/cli/src/desktopActions.ts` -- adapter：注册表、runner 复用、端口归属守卫、观测动作实现、失败映射；完成条件：既有 CLI 测试零改动仍全绿。
- [ ] `packages/cli/src/desktopActions.test.ts` + `main.ts` flag 装配 -- I/O 矩阵可自动化 9 场景 + CLI 用法错误路径；完成条件：`pnpm test` 全绿，新增用例不依赖真实 StartUpOS/GUI 且总时长增量 < 20s。
- [ ] 实施期真实验证 -- 按 Verification 执行真实 StartUpOS `--source`+`--desktop` run（启动→就绪→动作→证据回链核对→停止），把冷启动/就绪/动作耗时实测值回填 Implementation Notes；核对进程零残留与 StartUpOS `data/` 零新增写入（对照 git status）。

**Acceptance Criteria:**
- Given v0.3.3 changelog 与本机 StartUpOS，when `pnpm demo -- --source <changelog> --output <root> --desktop <startupos-root>`，then run completed，产物 6 文件（release/evidence/gate/actions/scene/manifest.json），actions.json 中 section-1-im 记录 status=executed 且 observations.window_route_status=200 ∧ observations.management_api_status=200 ∧ observations.ask_user_candidate_present=true。
- Given 该 executed 记录，when 执行回链核对命令（见 Verification），then sourceRef 逐字段等于 release.json 中 section-1-im 的 sourceRef（sectionIndex=1/sectionTitle=感知与 IM 路由/startLine=5/endLine=11），且 evidenceIds 与 gate.json 中该 feature 决定的 evidenceIds 相等且每个 id 在 evidence.json 有条目、条目 location 是 40 位哈希。
- Given section-2-section（no_evidence）与两个 unsupported eligible feature，when 读 actions.json，then 三条 skipped 记录 reason 分别为 no_evidence/unsupported_feature/unsupported_feature，no_evidence 记录 evidenceIds=[]。
- Given 任意动作失败（fixture 返回 503 或形状缺失），when run，then run.json failure.stage=desktop、actions.json 仍存在且记录 status=failed、release/evidence/gate 保留、scene.json/manifest.json 不存在。
- Given mock run（无 `--source`）与未启用 `--desktop` 的 `--source` run，when 重复 Story 1.6/2.4 既有断言，then 4 文件/5 文件字节集合不变。
- Given `--desktop` 未伴随 `--source`，when 运行，then 用法错误、退出码非零、无 run 目录、无进程 spawn。
- Given 重复两次真实 run（独立 output 目录），when 对比 actions.json，then 字节相同。

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Design Notes

**决策 1——演示动作端口契约（定案）：独立 stage 级 `DesktopDemoPort`，`DesktopRunnerPort` 冻结不动。** 备选是给 `DesktopRunnerPort` 扩展 `performAction(feature, gate)`：拒绝，因为 (a) 3.1 契约已经 human-approval 冻结并验收（「演示动作执行留在 3.2」的 JSDoc 预留只是说明消费时点，不是预授权扩展点）；在其上加方法会改动已验收接口，违反「接口稳定」；(b) 动作执行的输入是 gate 结果而非 runner 会话状态——它是管线阶段语义（「gate 之后做什么」），不是生命周期语义（「app 是否就绪」）；(c) 与 evidence/gate 的 optional 函数端口同构，orchestrator 以同一模式消费，接入成本最低。`DesktopDemoPort = (release, gate) => Promise<DemoActionRecord[]>`：gate 直接作为入参，port 内部不再重读 store；runner 由 adapter 自己持有（port 实现闭包内组装），orchestrator 不感知 runner 存在——保持 core 零 I/O。scope：注册表 = featureId→实现的常量映射，v1 一项（section-1-im）；第二个 feature 进来时才评估注册表是否升级为数据驱动（避免脚手架）。不做通用 action DSL——本 story 的动作是硬编码的感知与 IM 路由演示实现，不是可配置的步骤序列。

**决策 2——触发机制（定案）：URL 可寻址的感知中心 + ELECTRON_RENDERER_URL env 覆写启动 dev 链；证据链为规划期实测。** 规划期实测（2026-10-10，StartUpOS v0.4.7 本机运行实例 + 源码核读 + git 范围核验）：逐一排除了外部可编程触发面——无 deep link 协议注册（main.ts 无 `setAsDefaultProtocolClient`/`open-url`）；无应用菜单项（无 Menu 模板含感知中心）；spotlight 注册表无 sense-center 条目（`setItems` 调用点仅 home/dock 上下文菜单）；全局快捷键仅 CmdOrCtrl+Shift+D/CmdOrCtrl+K/CmdOrCtrl+Shift+O（shortcuts.ts）；`window:create` IPC 仅 preload 暴露且渲染进程外部无法触达。可编程触达路径实测成立的只有 URL：感知中心是 `/window?windowType=sense-center` 可寻址路由（`/window/page.tsx` 按 windowType 分发渲染 `<SenseCenter/>`，实测 curl 200），其数据面是 `GET /api/perception/management`（无鉴权，实测 200，返回 36 条 decisions，含 candidateKeys/ask_user_to_choose_target 0.99 等形状）。关键实施细节：3.1 的 dev 链启动 Electron 主窗口加载的是 home 路由，不会自动打开感知中心；本计划的动作实现改为 **env 覆写启动**——`ELECTRON_RENDERER_URL=<sense-center-url> pnpm desktop:dev`（`resolveRendererUrl` 优先读 `ELECTRON_RENDERER_URL` env（main.ts ~179 行），优先级高于 concurrently 链内 argv 传入的 `--renderer-url=http://localhost:3100`；`loadRenderer` dev 模式对主窗口 `window.loadURL(rendererUrl)`），主窗口因此真实加载感知中心路由——无需直启 `dist-electron` 产物，完整保留 3.1 验收过的 dev 链（构建、tsc watch、concurrently 三路、进程组语义），新鲜度前提自动成立。runner 侧 `rendererUrl` 选项同步传入感知中心 URL，使 3.1 就绪探测（HTTP 2xx + Electron 主进程组内存活）与动作观测指向同一地址，语义一致。**可触发性声明：成立，但限定为「URL 观测级」**——无 GUI 内元素点击能力（Electron 主窗口加载后无外部执行 JS 通道；`window:create` IPC 与 dock 点击都是渲染进程内部行为），若未来需要按钮级操作（如 DecisionStage 的 resolve 按钮），需 GUI 自动化框架（3.3/3.4 决策域）或坐标点击（脆弱，本 story 明确拒绝）。**不虚构更深的可触发性**：resolve-decision 在 dev 模式 Electron 下走 IPC handler 可真实执行，但那是对 StartUpOS 的写操作（改变决策状态），本 story 的只读边界排除它。

**决策 3——编排位置与 actions.json 契约（定案）：gate 之后、scenePlan 之前；`desktop` 为第五个 RunStage。** 编排位置依据 desktop-demo-capture spec 的 WHEN 前置（「通过置信度门禁」「桌面应用已就绪」）：gate 决定消费资格，desktop 执行动作，scenePlan 保持在其后不受动作结果影响（scenePlan 的 gatedFeatureIds 语义不变——fallback 旁白是「不能自动化的 feature 怎么讲」，与「eligible feature 的动作是否执行成功」正交；即使动作失败，scenePlan 的旁白决策依据仍是 gate 结果而非动作结果）。mock 4 文件与未启用 `--desktop` 的 `--source` 5 文件字节不变由 optional port 模式保证（与 evidence/gate 同构：缺省即跳过，`runStageOrder` 中的空位不落盘）。actions.json 契约：顶层 `{ releaseVersion, threshold, actions }`（threshold 复制自 gate，便于独立审计）；每条 action `{ featureId, status, reason, sourceRef?, evidenceIds, observations?, diagnostics? }`——sourceRef 仅 eligible+executed/failed 记录携带（逐字段复制 release 的 sourceRef，不重新推导）；evidenceIds：executed/failed/skipped(below_threshold) 从 gate 决定原样复制、skipped(no_evidence) 为空数组、skipped(unsupported_feature) 从 gate 决定复制（eligible 必有 evidenceIds，schema refine 锁定）；observations 仅常量事实（状态码、URL 常量、形状布尔、检查项名），键集固定、序列化键序稳定（`stableJsonBytes` 已保证）——这是重复运行字节幂等的关键约束；diagnostics 有界（复用 3.1 的 tail 截断风格，≤2KB）。失败语义：动作失败 = 先落盘 failed 记录（actions.json 是 desktop 阶段产物，`recordArtifact` 校验通过即保留）再抛 StageFailure("desktop")；orchestrator 既有 fail() 语义免费获得「先前产物保留 + run failed + scene/manifest 不产生」。runner 生命周期归 adapter：port 调用内首动作前 start、finally stop；动作记录生成在 stop 之后（避免 stop 失败淹没动作结果——stop 失败单独映射为第二个失败原因追加）。

**决策 4——证据回链与逐字段验收（定案）：actions.json 的 sourceRef/evidenceIds 是复制不是引用，验收 = 与 release/gate/evidence 的逐字段比对命令。** 设计原则：动作记录不引入新的标识体系，回链字段从既有产物逐字段复制（sourceRef 5 字段、evidenceIds 字符串数组），使 actions.json 单文件可独立审计；一致性由 `validateReleasePackageRelations` 扩展（actions 校验段）在落盘时强制。逐字段验收命令（实施期执行并在 Implementation Notes 回填输出）：(1) changelog 回链——`jq '.features[] | select(.id=="section-1-im") | .sourceRef' runs/<id>/release.json` 与 actions.json 中 executed 记录 sourceRef 深比较，且 `sed -n '5,11p' <changelog>` 首行是 `## 感知与 IM 路由`（sectionTitle 与源文档双证）；(2) commit 证据回链——`jq '.actions[] | select(.featureId=="section-1-im") | .evidenceIds' runs/<id>/actions.json` 与 gate.json 同 feature 决定的 evidenceIds 相等，每个 id 在 evidence.json 有条目且 `kind=="commit"`、`reference.location` 匹配 40 位哈希、`confidence ≥ 0.8`；(3) commit 真实性——哈希存在于 `git rev-list desktop-v0.3.2..desktop-v0.3.3` 且 `git log -1 <hash>` 主题含感知/路由词汇（实测 range 内 aadff7f「release: prepare v0.3.3」含 SenseCenter.tsx candidateName 中文映射新增、edf1573「fix(perception): prompt IM users for ambiguous targets」、d5df3d5「fix(settings): save Jev config from dialog save」均可命中）；(4) UI 资产回链——executed 记录 observations.ask_user_candidate_present=true 且 SenseCenter.tsx `candidateName` 函数（「请用户选择角色或能力」映射）在 aadff7f diff 中可 grep 到——changelog 第 10 行「感知中心使用中文资产名称展示候选」→ UI 代码 → 动作观测的三点闭环。

**规划期实测记录（2026-10-10，供实施对照）。** StartUpOS 本地副本 `/Users/archersado/workspace/startupOS`（v0.4.7，AGPL-3.0），运行中实例实测：`/api/perception/management` 200（decisions 36 条、样本 candidateKeys 含 ask_user_to_choose_target + 5 个 role-agent、threshold 0.8、decisionCandidateGrants 2 条规则）；`/window?windowType=sense-center&title=test` 200；`dist-electron/desktop/src/main/main.js` 存在且新鲜（desktop:dev 链持续重建）；运行实例 pgid 36428（next-server 与 Electron 主进程同组，3.1 组语义成立）。触发面排除清单（全部实测）：deep link 无、Menu 无、spotlight 无、shortcut 无（仅 D/K/O 三键且均不含感知中心）、tray 无 sense-center 直达、`window:create` IPC preload-only。env 覆写启动路径可行性（源码核读）：`resolveRendererUrl` 优先读 `ELECTRON_RENDERER_URL` env、次读 `--renderer-url=` argv（main.ts ~179 行）——env 命中即返回，优先级高于 concurrently 链内 argv 传入的 `--renderer-url=http://localhost:3100`；感知中心 URL 需 URL 编码后写入 env（query 含 `windowType=sense-center&title=…`）。`loadRenderer` dev 模式对主窗口 loadURL + detach DevTools（DevTools 弹窗不影响观测，3.1 已记录）。管理 API 形状：`{success:true,data:{connectors,grants,rules,health,audit,eventTraces,deadLetters,decisions,decisionCandidateGrants}}`；decisions 条目含 `candidateKeys:string[]`、`answers.routeTarget.probabilities`。守卫实测：`lsof -ti :3100` 可定位监听 pid，`ps -o pgid= -p <pid>` 可取组。风险实测记录：用户日常实例与本 run 并存时端口归属守卫会正确拒绝（遗留链的 pgid 不在 runner 组内）——这是预期行为不是缺陷，实施期真实验证前需确认 3100 无其他占用者。

**风险声明与交接项结论。** 交接项①（3100 共享端口 2xx 归因不可区分）——结论：执行面修复 + 诊断面备案。3.1 的就绪判定（HTTP 2xx + Electron 主进程组内存活）已排除「外部实例占端口导致伪就绪」，但「2xx 由谁服务」在 3.1 语义内仍不可区分（用户实例的 next-server 与本 run 的 next-server 都可能应答）。本计划在动作前增加端口归属守卫（3100 监听进程 pgid ∈ runner 进程组），使动作观测的 2xx 必然来自本 run 启动的链——归因在执行面闭环；诊断文案使用常量描述（`port_owner_in_group=false`）不打印 pid/pgrp 以保持字节幂等。剩余场景（用户实例先占、runner 链等待超时）落入 3.1 就绪超时路径，语义不变。交接项②（releaseSource byte-stability 测试环境敏感）——结论：备案不复现、不修改。该测试对本机负载敏感（首次运行 2 失败/重跑全绿，与 3.1 期间的记录一致）；根因是测试内并发 runDemo 对机器负载敏感，非产物不确定；3.2 不触碰该文件既有断言（Always 边界已锁），实施期如复现按 3.1 同口径记录（重跑验证 + 在测试失败输出中确认非产物字节问题）。
其他风险：(a) env 覆写对 dev 链的传导面——env 由 adapter 注入 spawn（3.1 的 env 全量透传点扩展为「透传 + 覆写 ELECTRON_RENDERER_URL」），Next dev 仍绑定 3100（端口由链内 argv 固定，env 只改 Electron 加载地址），故 rendererUrl/端口/守卫三者语义一致：Next 服务 3100、Electron 加载感知中心 URL（同主机同端口的不同路由路径）、守卫检查 3100 组归属；(b) Next.js dev 首次编译感知中心路由的冷加载延迟 → 3.1 就绪探测 GET 感知中心 URL 本身就会触发该路由编译（就绪即编译完成），观测动作无需额外等待；观测动作带超时（默认 30s，参数可注入）与单次重试（幂等 GET）；(c) StartUpOS 数据根被读侧污染风险 → 仅 GET 无写调用，management GET 实测无副作用（服务端 facade 只读 list）；(d) 感知中心路由对 `nativeWindow=1` 的依赖 → 实测 curl 无该参数亦 200（page.tsx 仅影响背景透明样式），观测用完整窗口参数但断言不依赖它。

**范围限定（重申）。** 不做录屏（3.3）、不建 mock/fixture 边界（3.4）、不做 GUI 内元素定位与点击（3.3+）、不做通用 action DSL、不写 StartUpOS 任何文件/调用其状态变更 API、不读其秘密、不新增 npm 依赖、不做 Windows 语义、不改 Story 1.6/2.1–3.1 任何行为与产物字节、不修改 `DesktopRunnerPort` 契约。

## Verification

**Commands:**
- `pnpm lint` -- expected: 新增/修改源码与测试满足 lint 规则。
- `pnpm typecheck` -- expected: 无 TypeScript 错误。
- `pnpm test` -- expected: 既有 190 测试零回归 + 新增 desktop actions 单测（I/O 矩阵 11 场景中的 9 个可自动化场景 + CLI 用法路径）全绿。
- `pgrep -fl "dist-electron/desktop/src/main/main.js"; lsof -iTCP:3100 -sTCP:LISTEN` -- expected: 验证前均无输出（真实 run 前对照基线；需先关闭本机已有 OriginOS CE Dev 实例）。
- `pnpm demo -- --source /Users/archersado/workspace/startupOS/docs/changes/releases/v0.3.3/changelog.md --output runs --desktop /Users/archersado/workspace/startupOS` -- expected: run completed；run 目录含 release/evidence/gate/actions/scene/manifest.json 六文件；stdout 打印 Run directory 与 Status: completed。
- 证据回链逐字段核对（对上条 run 目录执行，输出回填 Implementation Notes）：
  - `jq '.actions[] | select(.featureId=="section-1-im")' <run>/actions.json` -- expected: status=executed，sourceRef `{sectionIndex:1, sectionTitle:"感知与 IM 路由", startLine:5, endLine:11}`，observations 含 window_route_status=200、management_api_status=200、ask_user_candidate_present=true。
  - `jq -r '.actions[] | select(.featureId=="section-1-im") | .evidenceIds[]' <run>/actions.json | while read id; do jq -e --arg id "$id" '.entries[] | select(.id==$id and .kind=="commit" and (.reference.location|test("^[0-9a-f]{40}$")) and .confidence>=0.8)' <run>/evidence.json >/dev/null || exit 1; done && echo BACKLINK-OK` -- expected: BACKLINK-OK（每个 evidenceId 可解析到 ≥0.8 置信度的 commit 条目）。
  - `sed -n '5p' <changelog>` -- expected: `## 感知与 IM 路由`（sourceRef.startLine 与源文档互证）。
  - `<startupos>` 内 `git log --format=%s -1 <evidence hash>` -- expected: 主题命中感知/IM/路由词汇且哈希在 desktop-v0.3.2..desktop-v0.3.3 区间（3.2 验收「同时引用 changelog 与 commit/code 证据」的 commit 侧）。
- 重复上条 demo run（新 output 目录）-- expected: 两次 actions.json 字节相同（`cmp`）。
- `pgrep -fl "dist-electron/desktop/src/main/main.js"; lsof -iTCP:3100 -sTCP:LISTEN` -- expected: 仍无输出（启动→动作→停止全链路进程零残留、端口释放）。
- `openspec validate showcraft-release-video-mvp --strict` -- expected: 通过（无 spec delta）。
