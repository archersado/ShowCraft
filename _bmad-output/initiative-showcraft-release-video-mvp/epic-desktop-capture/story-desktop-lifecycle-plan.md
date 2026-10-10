---
title: 'StartUpOS Desktop 生命周期 adapter'
type: 'feature'
ticket: '5'
created: '2026-10-09'
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

**Problem:** Story 2.4 之后 run 已能产出 gate.json（`automatable: true` 的候选列表就是 epic 3 的消费输入），但 ShowCraft 没有任何能力接触 StartUpOS Desktop：desktop-demo-capture Requirement「仅执行证据充分的演示动作」的 Scenario 前提「桌面应用已就绪」没有承载——没有受控启动、没有就绪探测、没有停止逻辑；Requirement「保留失败诊断」在桌面维度（启动失败时保留失败阶段与可读诊断、不遗留进程、不产生伪成功）也无载体。design.md 的两条风险项（「桌面 UI 不稳定或需要认证 → 先以可重复启动、固定测试数据和显式就绪探测建立 runner」「本地预览进程残留 → 运行结束或显式 stop 时关闭」）与 Open Question「StartUpOS Desktop 的可重复启动、测试数据、认证和首屏就绪条件需要验证」都悬而未决。

**Approach:** 在 `@showcraft/core` 定义 `DesktopRunnerPort`（生命周期两方法 start/stop，就绪语义内嵌为 start 的成功条件；action 执行接口留给 3.2），在 CLI 侧新建 StartUpOS Desktop 生命周期 adapter（`desktopLifecycle.ts`）：以 `pnpm desktop:dev` 受控启动（detached spawn 独立进程组）、以 HTTP GET renderer URL 2xx（与 StartUpOS 自身 `waitForRendererReady` 同语义）加 Electron 主进程在本进程组内存活作就绪门禁、以组信号升级链（SIGTERM → grace 超时 → SIGKILL → 组清空验证）实现可诊断停止；所有失败路径先回收进程树再抛错（`DesktopRunnerError` 携带失败阶段、已耗时、输出摘录）。另附手动验证 CLI 入口（启动→就绪→保持→停止 + `pgrep`/`lsof` 前后对照证明进程零残留）。本 story 只做生命周期：不做元素定位与演示动作（3.2）、不做录屏（3.3）、不接入 orchestrator 编排（3.2）。

## Boundaries & Constraints

**Always:** port 定义在 core（`ports.ts`，纯类型与错误契约，无 I/O，与既有 ports 同文件同风格）；adapter 只用 Node 原生能力（`node:child_process` / `node:http` / `node:fs`），不新增 npm 依赖；spawn 必须 `detached`（独立进程组），停止必须对整组发信号——StartUpOS 实测 `next-server` 与 Electron 主进程是 concurrently 下的兄弟而非父子，只杀 Electron 必残留 Next dev 与 tsc watch；start 的任何失败（spawn 错误、就绪前退出、就绪超时）必须先完成进程组回收（await 组清空 + 零残留验证）再抛错；stop 幂等（未启动/已停止/进程已自行退出均为成功 no-op）；停止升级链 SIGTERM → grace 超时（默认 10s）→ SIGKILL → 组清空验证（`kill(-pgid, 0)` 抛 ESRCH）；就绪判定 = renderer URL HTTP 2xx 且 Electron 主进程在本组内出现并存活，就绪等待中检测到进程退出立即失败（不空等超时）；诊断必须含失败阶段、已耗时、rendererUrl 与输出末段摘录（stdout/stderr 各 8KB 环形缓冲）；StartUpOS 仓库严格只读——不写其任何文件、不读 `.env` 与 `data/model-providers/secrets` 等秘密（运行 StartUpOS 自身脚本产生的构建产物/数据写入是宿主应用自身行为，不属 ShowCraft 写操作）。

**Never:** 不做元素定位与演示动作（3.2）；不做录屏（3.3）；不接入 orchestrator 编排与 CLI demo 管线（3.2——mock 4 文件与 `--source` 5 文件产物路径零改动）；不写 StartUpOS 仓库任何文件；不新增 npm 依赖；不做 GUI 自动化框架选型（3.2 决策）；不依赖 stdout 字符串匹配作就绪门禁（实测无单一稳定就绪行，字符串耦合脆弱——`[electron-window-manager] create window` 仅可作诊断参考）；不做 Windows 进程树语义（本 story 以 POSIX 进程组信号实现并在 macOS 实测，Windows 适配记录为限制）；不引入通用配置框架（参数为 adapter options + 手动 CLI flag）；不修改 Story 2.1–2.4 的任何行为与产物。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| 正常启动→就绪→正常停止 | 有效 StartUpOS 根目录，`pnpm desktop:dev` 链成功，renderer URL 返回 2xx，Electron 主进程出现且存活 | start() resolve（携带 rendererUrl）；stop() 后整组退出，`kill(-pgid, 0)` 抛 ESRCH（零残留） | 无错误 |
| 可执行文件不存在 | spawn 命令解析失败（如 PATH 无 pnpm；测试注入不存在的二进制） | start() 拒绝；无进程可清理，直接抛出 | spawn 阶段错误（ENOENT 透传） |
| 启动脚本退出码非零 | 构建失败等：根进程在就绪前 exit ≠ 0 | 立即失败（不空等就绪超时）；先回收组内残留进程再抛错 | 就绪阶段错误：退出码 + 输出摘录 + 已耗时 |
| 就绪超时 | 进程存活但 renderer URL 持续非 2xx 或 Electron 主进程始终未出现（默认 180s） | 先整组回收再抛错；诊断含组内进程快照 | 就绪阶段错误：`readiness_timeout` + 已耗时 + rendererUrl + 摘录 |
| 启动后立即崩溃 | 就绪等待中 Electron 崩溃/被信号杀死 | 立即失败；先回收组内残留（Next dev 等兄弟进程）再抛错 | 就绪阶段错误：exit code/signal + 摘录 |
| 同一 runner 重复 start | start 进行中或会话未停止时再次 start | 拒绝（一个 runner 实例至多一个会话） | precondition 阶段错误：`already_started` |
| 外部已有实例（single-instance lock） | 本机已有 OriginOS CE Dev 实例持锁：Electron 秒退（exit 0）而 Next dev 继续存活 | HTTP 可达但 Electron 主进程不出现于本组 → 就绪超时失败，不产生伪就绪 | 就绪阶段错误：诊断含组内进程快照（Electron 缺席）与输出摘录，可定位单实例锁 |
| 停止时进程已自行退出 | stop() 前进程组已退出 | 幂等成功，返回「已退出」事实 | 无错误 |
| 停止超时升级 kill | 假 app 忽略 SIGTERM | grace（10s）后 SIGKILL 整组，组清空验证通过 | 若 SIGKILL 后仍残留 → stop 阶段错误（列出存活 pid） |
| 孙进程零残留 | 假 app spawn 自己的子进程 | 组信号覆盖全部后代，零残留验证通过 | 同上 |
| 就绪失败诊断可读性 | 任意就绪失败 | 错误 diagnostics 含：阶段、已耗时 ms、rendererUrl、stdout/stderr 末段摘录，字段非空可读 | 断言锁定 |
| 前置校验失败 | 目录不存在 / 无 package.json / 缺 `desktop:dev` 脚本 | 拒绝且未 spawn 任何进程 | precondition 阶段错误，指明缺失项 |

</frozen-after-approval>

## Code Map

- `packages/core/src/ports.ts` -- 修改：新增 `DesktopRunnerPort`（`start(): Promise<DesktopStartInfo>`——resolve 即就绪，reject 即已回收的失败；`stop(): Promise<void>`——幂等整组回收）、`DesktopStartInfo`（`rendererUrl: string`）、`DesktopRunnerError`（`phase: "precondition" | "spawn" | "readiness" | "stop"` + `diagnostics: string`）。纯类型与错误契约，无 I/O。
- `packages/core/src/ports.test.ts` -- 修改：契约性轻断言（fake runner 满足 port 类型；`DesktopRunnerError` 可构造、字段可读）。
- `packages/core/src/index.ts` -- 修改：导出上述类型与错误类。
- `packages/cli/src/desktopLifecycle.ts` -- 新建：StartUpOS 生命周期 adapter `createStartUpOSDesktopRunner(options)`。组件：(1) 前置校验——StartUpOS 根目录存在且 `package.json` 含 `scripts["desktop:dev"]`；(2) 启动——detached spawn `pnpm desktop:dev`（cwd = StartUpOS 根，env 全量透传；spawn 命令可注入供测试）；(3) 就绪轮询——500ms 间隔，GET rendererUrl（默认 `http://localhost:3100`，常量可注入）要求 2xx，且经组内进程扫描（`ps -eo pid,pgid,command`，匹配二进制含 `/Electron.app/Contents/MacOS/Electron` 且命令行不含 `--type=`）确认 Electron 主进程存在并存活；任一 poll 间隙检测到组内根进程退出立即失败；默认就绪超时 180s；(4) 停止——`process.kill(-pgid, "SIGTERM")` → 等待组清空 ≤ 10s → `SIGKILL` → 再等 ≤ 5s → 仍残留则报错列 pid；组清空以 `kill(-pgid, 0)` 抛 ESRCH 为准；(5) 诊断——stdout/stderr 各 8KB 环形缓冲 + 就绪失败时组内进程快照。失败路径统一「先回收后抛错」。
- `packages/cli/src/desktopLifecycle.test.ts` -- 新建：以注入的 `node <fake-app.js>` 假命令（测试写入临时目录）模拟五种应用形态——正常启停（开 TCP 端口回 2xx、收 TERM 退出）、秒退非零、忽略 SIGTERM、spawn 孙进程、长挂不就绪——覆盖 I/O 矩阵全部 12 场景；零残留断言用 `kill(-pgid, 0)` 原生信号检查。无 GUI、无凭据、无真实 StartUpOS 依赖，新增用例总时长 < 30s。
- `packages/cli/src/desktopLifecycleCli.ts` -- 新建：手动验证入口，参数 `--startupos <path> [--hold-seconds 5] [--timeout-ms 180000]`：start → 打印就绪耗时 → hold → stop，逐阶段输出，退出码反映成败，子进程输出以 `[desktop]` 前缀透传；供 Verification 的 `pgrep`/`lsof` 前后对照。
- `package.json`（根）-- 修改：scripts 增加 `"desktop:lifecycle": "node --import tsx packages/cli/src/desktopLifecycleCli.ts"`（与既有 `"demo"` 同风格）。
- StartUpOS 仓库（只读参照，不改任何文件）：`packages/desktop/package.json`（`dev` 命令链）、`packages/desktop/src/main/main.ts`（`waitForRendererReady` HTTP 就绪语义、`before-quit` 优雅停机链、`requestSingleInstanceLock` 重复启动语义、dev 模式 `userData: OriginOS CE Dev`）、`packages/desktop/src/main/setup-data-root.ts` 与 `packages/core/src/lib/paths.ts`（dev 数据根 = 仓库 `data/`）。
- `openspec/changes/showcraft-release-video-mvp/specs/desktop-demo-capture/spec.md` -- 验收语义权威（Requirement「保留失败诊断」；「仅执行证据充分的演示动作」Scenario 前提「桌面应用已就绪」的本 story 语义）。本 story 无新增 spec delta，`validate --strict` 继续通过。
- `openspec/changes/showcraft-release-video-mvp/design.md` -- 决策权威（Ports-and-adapters：core 定义 `DesktopRunner` port；两条相关风险项；Open Question 的启动/就绪/认证部分由本计划实测回答）。本 story 不修改该文件。

## Tasks & Acceptance

**Execution:**
- [ ] `packages/core/src/ports.ts` + `ports.test.ts` + `index.ts` -- 定义并导出 `DesktopRunnerPort`/`DesktopStartInfo`/`DesktopRunnerError`；完成条件：`pnpm typecheck` 通过，契约单测绿（fake 实现可赋值、错误字段断言），既有 176 测试零回归。
- [ ] `packages/cli/src/desktopLifecycle.ts` -- adapter 实现：前置校验、detached spawn、就绪轮询（HTTP 2xx + Electron 主进程存活 + 退出即败）、环形缓冲诊断、组信号升级链与零残留验证、失败先回收后抛错、会话状态机（idle→starting→ready→stopped，重复 start 拒绝、stop 幂等）；完成条件：既有 CLI/core 测试零改动仍全绿（mock 产物路径不受影响）。
- [ ] `packages/cli/src/desktopLifecycle.test.ts` -- 覆盖 I/O 矩阵全部 12 场景（含孙进程零残留、SIGKILL 升级、诊断可读性断言）；完成条件：`pnpm test` 全绿，新增用例不依赖真实 StartUpOS/GUI/凭据且总时长增量 < 30s。
- [ ] `packages/cli/src/desktopLifecycleCli.ts` + 根 `package.json` -- 手动验证命令与 script 注册；完成条件：无参运行报用法错误，`--startupos` 指向非法目录时报 precondition 错误且退出码非零。
- [ ] 实施期真实验证 -- 按 Verification 执行真实 StartUpOS 启动→就绪→停止（含 `pgrep`/`lsof` 前后对照），并把冷启动耗时、就绪耗时实测值回填本节 Implementation Notes。

**Acceptance Criteria:**
- Given 有效 StartUpOS 根目录，when `pnpm desktop:lifecycle -- --startupos <path> --hold-seconds 5`，then 命令输出 spawn→ready（含就绪耗时）→stopped 且退出码 0；随后 `pgrep -fl "dist-electron/desktop/src/main/main.js"` 无输出且 `lsof -iTCP:3100 -sTCP:LISTEN` 为空（进程零残留、端口释放）。
- Given 启动脚本就绪前退出（非零退出码、信号崩溃或单实例锁秒退），when start()，then 抛 `DesktopRunnerError`（phase=readiness），diagnostics 含退出信息、输出摘录、已耗时，且组内残留进程为 0。
- Given 就绪超时（进程存活但不就绪），when start()，then 先整组回收再抛错，diagnostics 含 `readiness_timeout`、rendererUrl 与组内进程快照。
- Given 假 app 忽略 SIGTERM，when stop()，then grace 超时后 SIGKILL 兜底且组清空验证通过；SIGKILL 后仍残留则 stop 阶段错误。
- Given stop() 重复调用、未启动即调用或进程已自行退出，when stop()，then 幂等成功。
- Given 非法 StartUpOS 目录，when start()，then precondition 阶段错误且未 spawn 任何进程。

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Design Notes

**决策 1——DesktopRunnerPort 契约（定案）：start（就绪内嵌）+ stop 两方法，action 执行留给 3.2。** 就绪作为 start 的成功条件而非独立 `isReady()` 方法：(a) 「启动失败不遗留进程」的保证只需落在一个函数的失败路径里——start 抛错前必经 teardown；若拆成 `start()`/`waitReady()` 两步，会出现「spawn 成功但从未 waitReady 也从未 stop」的悬空态，清理责任归属变糊；(b) 3.2 的消费形态是「start 完成后执行动作」，就绪前置正是它需要的时点，start() resolve 即「可开始操作」；(c) port 保持最小，不为 3.2 的未知 action 形态预建接口（避免脚手架）——3.2 若需执行接口，扩展同一 port 或新增 port 属其决策范围。port 命名沿用 design.md 词汇 `DesktopRunner`（类型名 `DesktopRunnerPort`），定义在 core `ports.ts` 与既有五 port 同文件同风格（纯类型 + JSDoc）；实现在 CLI 侧新文件 `desktopLifecycle.ts`，沿用 2.3 `gitEvidence.ts` 建立的「core 契约、CLI 侧 I/O adapter、专用错误类、子进程仅用白名单化原生调用」惯例。`DesktopRunnerError.phase` 枚举（precondition/spawn/readiness/stop）使失败归属在 3.2 接入 orchestrator 时可直接映射到 StageFailure 语义——届时 run 产物层「保留已完成产物 + 失败阶段」由既有 stage 失败通道免费获得，本 story 的诊断设计（结构化 phase + diagnostics 文本）即为该接入预埋的接口面。

**决策 2——就绪信号源（定案）：HTTP GET renderer URL 2xx + Electron 主进程组内存活；拒绝 stdout 匹配与纯端口探测。** 规划期实测（2026-10-09，StartUpOS v0.4.4 本机运行中实例 + 源码核读）：启动链为 `pnpm desktop:dev` → 前置构建（pi-agent-adapter + 4 个 perception 插件 + desktop tsc build）→ `concurrently` 三路：`next dev -p 3100`、`tsc --watch`、`wait-on tcp:3100 && electron ../../dist-electron/desktop/src/main/main.js --renderer-url=http://localhost:3100`。就绪相关事实：(1) 宿主自身的 dev 链就是两级等待——`wait-on tcp:3100`（TCP 通）之后 Electron 仍要 `waitForRendererReady(rendererUrl, 60000)`（main.ts:420，HTTP GET 轮询、`response.ok` 才放行）——TCP 就绪 ≠ 应用就绪是 StartUpOS 作者自己的实现结论，适配器采用与其 `waitForRendererReady` 相同的 HTTP 2xx 语义即与宿主对齐，这是最强的论据；(2) 纯 stdout 匹配被拒：全 main.ts 无单一权威就绪行，唯一贴近的 `[electron-window-manager] create window`（window-manager.ts:231）是实现细节字符串，跨版本脆弱——只作诊断参考；(3) 残余缺口如实声明：HTTP 2xx + Electron 主进程存活仍不等价于「首帧已绘制」（Electron 自身就绪等待通过后还有服务注册与窗口创建序列），本 story 的就绪语义是「应用进程健康且渲染服务可服务」；首帧级就绪若 3.2 演示动作需要，应以 GUI 内探（其元素定位域）扩展，不在生命周期层伪造。附加守卫——「Electron 主进程在本组内出现且存活」拦截一个实测确认的真实伪成功路径：本机已有 OriginOS CE Dev 实例持 `requestSingleInstanceLock`（main.ts:50）时，验证性启动的 Electron 秒退（exit 0）而 concurrently 下的 Next dev 继续服务 HTTP——纯 HTTP 探测会误报就绪；组内主进程存活检查使其成为就绪超时失败并带可定位诊断。认证实测：`/api/projects`、`/`、`/desktop` 均无凭据返回 200（对运行中实例 curl 验证），无登录墙；测试数据实测：monorepo `data/` 存在含示例 projects（proj-A/B/C），dev 模式数据根为仓库 `data/`（`setup-data-root.ts` dev 分支 + `getMonorepoRoot()` 回退）——「固定测试数据」前提成立，数据隔离属 3.2 演示数据决策。

**决策 3——进程管理（定案）：detached spawn 独立进程组 + 组信号升级链 + `kill(-pgid, 0)` 零残留验证。** 启动：spawn `pnpm desktop:dev`（cwd = StartUpOS 根，env 全量透传以保 PATH/pnpm 可用），`detached: true` 使根进程成为新进程组组长——实测用户运行实例整链（sh → pnpm → concurrently → {pnpm next, tsc watch, wait-on→electron cli→Electron main→5 helpers}）共享同一 pgid，组信号一次覆盖全部后代。停止：`process.kill(-pgid, "SIGTERM")` → 等待组清空 ≤ grace 10s（StartUpOS `before-quit` 有优雅停机链：窗口关闭、插件 stop、调度器、agent bridge、`shutdownGlobalSpawner`——需要这个余量；非 darwin 平台 `window-all-closed` 亦会 quit）→ 未清空则 `SIGKILL` → 再等 ≤ 5s → 仍残留则 stop 阶段错误并列出存活 pid。零残留验证与测试断言共用同一原语：`kill(-pgid, 0)` 抛 ESRCH 即组空，无需解析 ps 文本。为什么必须组杀而非只杀 Electron：实测 `next-server`（如 pid 76038）与 Electron 主进程（76056）是 concurrently 下的兄弟节点，且 StartUpOS 仅在打包模式才由主进程托管 renderer server（`ensurePackagedRendererUrl`，main.ts:268 附近）——dev 模式下只杀 Electron 必然残留 Next dev + tsc watch，这正是 design.md「本地预览进程残留」风险的具体形态，本 story 的停止语义按「不遗留进程」从严实现。失败路径顺序（验收核心）：spawn 后任何失败——spawn 'error'（ENOENT，无树可清直接抛）、就绪等待中检测到退出（先回收组内残留的兄弟进程再抛）、就绪超时（同前）——回收完成（组清空验证通过）之后才抛 `DesktopRunnerError`，错误因此总能陈述「残留 0」。已知限制（记录不解决）：pgid 复用的理论竞态（组清空验证窗口内概率可忽略）；Windows 无 POSIX 进程组语义，本 story 信号模型仅 macOS/Linux（MVP 验收环境 macOS，实测 Darwin 25.5.0），Windows 适配留待真实需求。

**决策 4——可测试性（定案）：注入假命令的单测边界 + 真实应用手动验证；3.1 建立生命周期层 mock，3.4 接手动作/录屏层。** 自动化单测不依赖真实 StartUpOS/GUI/凭据：adapter options 允许注入 spawn 命令（默认 `pnpm desktop:dev`；测试传 `node <fake-app.js>`，假 app 由测试写入临时目录）与 rendererUrl/超时参数（默认常量）。假 app 按矩阵编排五种行为：正常启停（本地开 HTTP 端口回 2xx、收到 TERM 优雅退出）、秒退非零、忽略 SIGTERM（验证 SIGKILL 升级）、spawn 孙进程（验证组杀覆盖后代）、长挂不就绪（验证超时回收）。零残留断言用 `kill(-pgid, 0)` 原生信号检查，与平台 ps 语法解耦。真实 StartUpOS 的验证走 `desktop:lifecycle` 手动命令（Verification 节），实施期实跑一次并把冷启动/就绪耗时回填 Implementation Notes；真实启动不进自动化回归——它依赖本机 GUI 会话与分钟级构建，进 CI 必脆。与 3.4 的分工：3.1 建立「生命周期层」的测试边界（假命令协议 + 真实应用手动验证命令），其注入点（spawn 命令、rendererUrl、超时）即 3.4 复用的接缝；3.4 在其上为元素定位、演示动作与录屏建立 mock/fixture 边界。core 侧不提供 `createMockDesktopRunner` 工厂——3.1 时编排层尚无消费者（orchestrator 接入属 3.2），提前造 mock 是脚手架；3.2 需要时随其编排接入一并提供。

**规划期实测记录（2026-10-09，供实施对照）。** StartUpOS 本地工作副本 `/Users/archersado/workspace/startupOS`（v0.4.4，AGPL-3.0）。`dist-electron/desktop/src/main/main.js` 已存在且新鲜（`desktop:dev` 链每次重建）——实施期无需预构建步骤，但链内 5 个插件构建 + tsc + Next dev 冷启动需计入就绪超时（默认 180s 的依据）。进程树（实测 ps）：concurrently 三路并行，`next-server` 与 Electron 主进程为兄弟；Electron 主进程挂 5 个 Helper（gpu/utility/3 renderer）；全链共享 pgid。就绪信号：宿主自身 `waitForRendererReady` HTTP 轮询语义（见决策 2）。停止语义：`before-quit` 优雅停机链（见决策 3）。重复启动副作用：`requestSingleInstanceLock`——持锁失败方 `app.quit()` 秒退，无窗口；对本 story 的影响即 I/O 矩阵第 7 行（HTTP 假就绪守卫）。环境实测：node v24.21.0（StartUpOS engines ≥22.19 ✓）、系统 pnpm 12.4.1 可驱动其脚本（运行中实例即证）。ShowCraft 侧零新增依赖：`node:child_process`（spawn/kill）、`node:http`（就绪 GET）、`node:fs`（前置校验）即足。规划期刻意未启停用户的运行实例（避免破坏其交互会话）：启动/停止全链路由实施期手动验证命令完成，这正是 Verification 命令的职责。

**风险声明（启动链复杂度）与降级选项。** `desktop:dev` 链长（5 插件构建 + tsc + concurrently 三路 + wait-on + Electron），任一环失败都以非零退出或就绪超时显式呈现，本计划的诊断设计（退出码 + 输出摘录 + 组内进程快照）足以归因，无需拆解该链。降级选项（按优先序，仅在实施期实测发现链路抖动时启用）：(a) 调大 `--timeout-ms`（参数化已内建，无代码改动）；(b) 要求预先构建产物、适配器改直启 `electron dist-electron/desktop/src/main/main.js --renderer-url=…`（跳过 concurrently 与 wait-on；`dist-electron` 已实测存在）——会绕开宿主 dev 链的自动重建，需在实施记录中标注产物新鲜度前提；记录为降级路径，本 story 不实现。另录：dev 模式 Electron 会 `openDevTools({ mode: 'detach' })`（main.ts `loadRenderer`）弹出独立 DevTools 窗口——不影响生命周期与进程回收；录屏阶段（3.3）若受干扰，由 3.3 以打包模式或 env 开关处理，本 story 不处理。

**范围限定（重申）。** 不做元素定位与演示动作（3.2）、不做录屏（3.3）、不接入 orchestrator/CLI demo 管线（3.2）、不写 StartUpOS 仓库任何文件、不读其秘密文件、不新增 npm 依赖、不做 GUI 自动化框架选型（3.2）、不做 Windows 进程模型、不改 Story 2.1–2.4 任何行为与产物字节。

## Verification

**Commands:**
- `pnpm lint` -- expected: 新增/修改源码与测试满足 lint 规则。
- `pnpm typecheck` -- expected: 无 TypeScript 错误。
- `pnpm test` -- expected: 既有 176 测试零回归 + 新增 desktop lifecycle 单测（I/O 矩阵 12 场景）全绿。
- `pgrep -fl "dist-electron/desktop/src/main/main.js"; lsof -iTCP:3100 -sTCP:LISTEN` -- expected: 均无输出（验证前对照基线，需先关闭本机已有 OriginOS CE Dev 实例）。
- `pnpm desktop:lifecycle -- --startupos /Users/archersado/workspace/startupOS --hold-seconds 5` -- expected: 输出 spawn→ready（含就绪耗时）→stopped 三阶段，退出码 0。
- 重复上条 `pgrep`/`lsof` -- expected: 仍无输出——证明启动→就绪→停止全链路进程零残留、端口释放。（若故意不关既有实例再跑，则应得到就绪超时失败且诊断含「Electron 主进程缺席」快照——即 I/O 矩阵第 7 行的实测路径，同样零残留。）
- `openspec validate showcraft-release-video-mvp --strict` -- expected: 通过（无 spec delta）。
