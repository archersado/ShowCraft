---
title: 'DeepMatch 网站上传图纸匹配供应商功能录屏（首轮验证目标 2）'
type: 'feature'
ticket: '10'
created: '2026-10-19'
status: 'draft'
route: 'full'
route_source: 'auto'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
context:
  - '_bmad-output/initiative-showcraft-release-video-mvp/epic-desktop-capture/epic-desktop-capture.md'
  - 'openspec/changes/showcraft-release-video-mvp/specs/desktop-demo-capture/spec.md'
  - 'openspec/changes/showcraft-release-video-mvp/design.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** epic 4 已收口（4.1–4.3 ✅），StartUpOS v0.3.3「感知与 IM 路由」视频链路（changelog → 证据 → Desktop 录屏 → 配音 → 合成）全部落地，但首轮验收目标只有 StartUpOS 一个样本。用户 2026-10-15 追加「网站录屏」作为**首轮验证目标 2**（与目标 1 并存、不插入原故事序列）：对 DeepMatch 官网（`/Users/archersado/workspace/website`，包名 deepmatch-website，Next.js 16）的「上传图纸，匹配对应产品供应商」功能（`components/quote-matcher.tsx`，section `#quick-quote`）做真实操作录屏，验证 ShowCraft 的「能力 + 步骤规划」载体能否以**已有 run 目录 / actions.json / media 引用契约**承载第二条真实录屏产物——即在不改动 ShowCraft 既有产品行为、不新增 npm 依赖、不写 website 仓库任何文件的前提下，产出「录屏素材 + run 记录」。用户 2026-10-19 指示工具链为：agent 控制 ego-browser 操作页面 + 对产品录屏；页面操作与系统级录屏是两个平面。

**Approach:** 本 story 不走 ShowCraft `--source`+`--desktop` 完整管线（DeepMatch 网站无 `desktop-v*` 式 git 标签证据链，强行走 gate 会伪造证据），而是交付一个**可重复执行的采集脚本**（只调既有 ShowCraft 契约，不新增 CLI 面、不改 pipeline）：ego-browser 单实例打开 DeepMatch 首页 → `setInputFiles` 上传样本图纸（本地临时副本）→ 等待「供应商匹配完成」状态（DOM 结构信号：上传 input 节点分离，语言无关）→ 截图存证；录屏平面沿用 3.3 已验收的 `/usr/sbin/screencapture -v -V <sec> -D 1`（TCC 已授权、QuickTime H.264 直写、零依赖），在动作前启动、动作完成后等待自然退出并校验产物（非空 + `ftyp` 头）。产物落 run 目录（`runs/website-demo-<runId>/`）：`recording-website-quote-match.mov` + `actions.json`（`DemoActionRecord` schema 校验，单步复合动作）+ `matched-state.png`（匹配完成截图）+ `capture-notes.md`（环境事实：URL、样本 SHA-256、dev server 来源、ego task space、录制参数）。actions.json 观测字段只记**形状事实**（页面状态码、匹配结果存在布尔），AI 识别的产品名/类目/供应商名单等时间敏感文本**只存在于录屏与截图中**，保证重复运行 actions.json 字节幂等（沿用 3.3 修订：媒体文件存在性/ftyp 核对、不比字节）。为此对 `demoActionObservationsSchema` 做一次**加法扩展**（新增两个可选观测键，镜像 3.3 对 schema 的加法扩展先例），对既有 338 测试与 mock 4 文件 / `--source` 5 文件字节契约零影响。

## Boundaries & Constraints

**Always:** 只清自己 spawn 的进程（dev server 仅在 4321 无可用 DeepMatch 服务时才启动，并在收尾 kill；绝不占用/触碰 3100；绝不动用户常驻的 ego lite 实例与 PM 已启动的 dev server）；ego-browser 只用 SKILL.md 列出的 API（taskSpace/page.goto/snapshot/setInputFiles/waitForSelector/screenshot/finish 等），CDP 仅作为诊断逃生舱不用于录屏；样本图纸先复制到本地临时路径再上传，原文件只读；website 仓库严格只读（前后 `git status --porcelain` 对照）；录屏产物必须校验（存在 + 非空 + `ftyp` 头 + qlmanage 抽帧目检）后才允许写入成功 media 引用；校验失败按 recording_failed 处理、改名 `.failed` 留诊断；actions.json 落盘前必须通过 `demoActionsSchema` 校验（复用 @showcraft/core 导出）；失败路径无伪成功——失败记录不携带成功 media（schema refine 既有约束）、诊断有界 ≤2048；时间敏感文本（AI 识别结果、供应商名、置信度数值）不写入 actions.json；每次采集运行独立 run 目录；录制窗口 ≥ 流程实测耗时的 2 倍且 ≥ 60s。

**Never:** 不写 website 仓库任何文件；不新增 npm 依赖（ffmpeg 不引入、无转码）；不做 epic 4 的 TTS/字幕/Remotion/90 秒拆分；不改 StartUpOS 路径与 StartUpOS 任何产物；不改 ShowCraft 既有 pipeline/CLI flag 面（main.ts、orchestrator、runStore 零改动）；不做 GUI 外的键盘鼠标坐标驱动（页面操作全走语义 selector）；不在 actions.json 记录 AI 时间敏感文本；不用 CDP `Page.startScreencast` 做交付录屏（论证见决策 1）；不在 ego-browser 之外的通道操作页面；mock 4 文件 / `--source` 5 文件字节契约不动；`openspec/changes/showcraft-release-video-mvp/` 下任何 spec 与 tasks.md 不修改。

## I/O & Edge-Case Matrix

| # | Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|----------|---------------|----------------------------|----------------|
| 1 | 成功路径 | 4321 有 DeepMatch dev server；TCC 已授权；样本 PDF 匹配成功 | run 目录含 `recording-website-quote-match.mov`（非空 ftyp）、`actions.json`（单条 executed 记录 + media.file + observations：website_page_status=200、matched_result_present=true）、`matched-state.png`、`capture-notes.md` | 无错误 |
| 2 | dev server 不可用且本机启动失败 | 4321 无监听且 `npm run dev --port 4321` 启动失败/超时 | 采集中止于预检：不创建 run 目录、无录屏、无 actions.json；诊断说明端口与启动输出摘录；最终报告显式失败 | 无伪成功 |
| 3 | 页面打不开 / 无匹配 UI | server 200 但首页无 `#quote-drawing-upload`（部署错误/版本漂移） | 同 #2：预检失败，无 run 目录 | 无伪成功 |
| 4 | 上传后识别失败（页面错误态） | analyze API 非 2xx 或返回 error；页面显示错误文本 | 录屏已启动则等待其自然退出并校验：产物有效时 actions.json 记 status=failed reason=action_failed + media（失败证据素材，refine 允许）+ matched_result_present=false；run 报告显式失败 | 显式失败 |
| 5 | 上传/等待超时 | 120s 内未出现匹配完成态（AI 慢/挂起） | 同 #4 语义（action_failed）；诊断注明等待超时；录屏产物按实际窗口收尾 | 显式失败 |
| 6 | 录制启动/中途失败/产物损坏 | screencapture 退出非零 / 无产物 / 0 字节 / 无 ftyp | actions.json 记 status=failed reason=recording_failed（不携 media，schema refine 禁止）；损坏文件改名 `.failed` 留诊断；页面操作事实（observations）保留 | 显式失败 |
| 7 | 重复运行 | 同一输入连续两次采集（独立 run 目录） | 两次 actions.json 字节相同（`cmp`）；两次媒体文件各自存在、非空、ftyp 有效（不比媒体字节——AI 结果差异只在媒体里） | 无错误 |
| 8 | 观测事实为时间敏感 | 两次运行 AI 返回不同产品名/类目/供应商 | 差异**不进入** actions.json（形状事实 Only）；差异留存在各自录屏/截图中 | 幂等保持 |
| 9 | 4321 被 DeepMatch dev server 占用（预期态） | 4321 LISTEN 且首页含「上传图纸，匹配对应产品供应商」 | 直接复用该 server（只读调用），不 spawn、不 kill——收尾对照确认其存活（非本 run 所有） | 无错误 |
| 10 | 4321 被非 DeepMatch 进程占用 | 4321 LISTEN 但首页不是 DeepMatch | 预检失败中止（不换端口、不杀进程），诊断含占用进程描述（不含 pid 敏感信息之外的内容）；报告交人决策 | 显式失败 |

</frozen-after-approval>

## Code Map

- `_bmad-output/initiative-showcraft-release-video-mvp/epic-desktop-capture/story-website-demo-capture.md` -- 新建 story 存根（id: 10、after: [12]、parent: epic-desktop-capture、covers: [R5, R6]、risk: medium，沿用既有存根格式）。
- `_bmad-output/initiative-showcraft-release-video-mvp/initiative-showcraft-release-video-mvp.md` -- 修改：Done when 增补「首轮验证目标 2」条目 + Notes 登记（2026-10-19 用户指示；首轮验收 = 两项目标）。
- `packages/core/src/domain.ts` -- 修改（最小加法）：`demoActionObservationsSchema` 增加可选键 `website_page_status`（int 100–599）与 `matched_result_present`（boolean）；`.strict()` 语义不变，既有键与 refine 零改动。
- `packages/core/src/domain.test.ts` -- 修改：新观测键正反用例（website 路径 executed 记录合法；未知键仍拒绝）。
- `scripts/website-demo/` -- 新建采集脚本目录（不进 packages/cli、不新增 CLI flag 面）：
  - `capture.sh` -- 驱动器：预检（端口/首页标记/TCC）→ 启动 screencapture（后台，`-v -V <sec> -D 1`）→ 调 ego-browser 脚本 → 等待录制自然退出 → 产物校验 → 组装 run 目录（actions.json 经 schema 校验落盘）。
  - `page-flow.mjs` -- ego-browser 脚本（`ego-browser nodejs` 执行）：唯一 TaskSpace → goto 首页 → 等上传控件 → `setInputFiles` 样本副本 → `waitForSelector("loc=css:#quote-drawing-upload", { state: "detached" }, 120s)`（匹配完成 = 上传表单分支被结果分支替换）→ 截图 → 输出 JSON 结果摘要（形状事实）→ `finish({ keep: [] })`。
  - `assemble-actions.mjs` -- 从 page-flow 的形状事实组装 `demoActionsSchema` 校验的 actions.json（sourceRef/evidenceIds 指向本计划文档，常量）。
- `openspec/changes/showcraft-release-video-mvp/` -- **零改动**；本计划与 `desktop-demo-capture` spec 的对应关系仅在本文件声明：Requirement「仅执行证据充分的演示动作」THEN「保存录屏素材和动作记录」的**媒体契约语义**（动作记录 + media 引用 + 失败无伪成功）被 website 路径复用；Requirement 本身针对 StartUpOS Desktop，website 采集不是其 Scenario 实例，不产生 spec delta，`validate --strict` 不受影响。
- epic 4 前向兼容声明：`RenderManifest`/Remotion 只消费 manifest——website run 目录不产生 manifest.json（不进合成管线）；actions.json 的 media 引用保持「引用可解析、文件可定位」承诺（3.3 决策 2 第 (2)(3) 点），若未来把网站录屏纳入合成，其 manifest 组装器可按 featureId 从 actions.json 读取 media 引用，无需改动本契约。

## Tasks & Acceptance

**Execution:**
- [ ] `packages/core/src/domain.ts` + `domain.test.ts` -- 观测键加法扩展 + 用例；完成条件：`pnpm typecheck`/`pnpm lint` 通过，既有 338 测试零回归。
- [ ] `scripts/website-demo/` 三件套 -- capture.sh / page-flow.mjs / assemble-actions.mjs；完成条件：dry-run（不录制）与带录制各跑通一次，产物通过校验。
- [ ] 实施期真实采集 -- 按 Verification 执行两次完整采集（独立 run 目录），回填 Implementation Notes（录制时长/产物大小/帧耗时/AI 端到端耗时实测值）。

**Acceptance Criteria:**
- Given 4321 DeepMatch dev server 与 TCC 授权，when 执行 `scripts/website-demo/capture.sh`，then run 目录含 `recording-website-quote-match.mov`（>0 字节、`ftyp` 头、时长 ≥ 流程耗时）、`actions.json`（demoActionsSchema 校验通过；单条 status=executed reason=eligible 记录，media.file=常量，observations.website_page_status=200 ∧ matched_result_present=true）、`matched-state.png`（匹配完成页面）、`capture-notes.md`（样本 SHA-256 前缀、dev server 来源、录制参数、耗时）。
- Given 两次连续采集（独立目录），when `cmp` 两次 actions.json，then 字节相同；两次媒体文件各自存在、非空、ftyp 有效（不比较媒体字节）。
- Given 任一失败形态（#2–#6），when 采集，then 无伪成功产物（failed 记录无成功 media 引用 / 预检失败无 run 目录），诊断有界可读。
- Given website 仓库，when 采集前后 `git -C /Users/archersado/workspace/website status --porcelain`，then 输出一致（严格只读）。
- Given 采集收尾，when `lsof -iTCP:4321 -sTCP:LISTEN` 与 `pgrep -fl screencapture`，then 无本 run spawn 的残留（复用的 PM server 不在其列；3100 全程未被触碰）。
- Given ShowCraft 仓库，when `pnpm test`，then 338 基线 + 新增观测键用例全绿；mock 4 文件 / `--source` 5 文件字节契约断言不变。

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Design Notes

**决策 1——录屏方式定案：系统级 `screencapture -v -V <sec> -D 1`，否决 CDP `Page.startScreencast`。** 规划期实测（2026-10-19，本机 Darwin 25.5.0）：`/usr/sbin/screencapture -x` 退出码 0（TCC 对宿主 app 链 ai.multica.desktop 已授权，沿用 3.3 实测结论）；`screencapture -v -V 3 -D 1` 实测产出 2.3MB 文件、头部 `b'\x00\x00\x00\x14ftypqt  '`（QuickTime H.264）——与 3.3 落地的 `recordActionMedia` 产物格式逐字节同源，校验函数（stat 非零 + 前 12 字节 ftyp）直接复用语义。CDP 方案否决理由：(a) ego-browser SKILL.md 的 API 面未包含 screencast；`page.cdp()` 是诊断性逃生通道（文档明示「Raw CDP invalidates refs」，且事件需经 `page.events()` 缓冲数组轮询，非 EventEmitter——长录屏事件流轮询脆弱且与 ego 自身 CDP 会话交织）；(b) `Page.startScreencast` 产出的是 **base64 JPEG 帧流**而非视频文件，组装成单个 `.mov` 必须引入编码器——ffmpeg 未安装（`which ffmpeg` 空）且零依赖约束下无编码路径；(c) 若退化为「帧序列存档」则破坏 media 契约（`recording-<featureId>.mov` 单文件、QuickTime 容器、epic 4 可直接消费）并使 epic 4 消费面需要新分支。故录屏平面 = screencapture（复用 3.3 录制器语义），页面操作平面 = ego-browser，两平面由 capture.sh 以时序编排（先起录制、后跑页面流、等待自然收尾）。**窗口覆盖论证**：`-D 1` 录主显示器全屏，ego-browser 页面操作发生在 ego lite 桌面窗口内——要求采集期间 ego lite 窗口在前台（人工前置条件，capture-notes 记录）；产物校验含 qlmanage 抽帧目检（系统自带，零依赖），实施期人工确认画面覆盖页面操作过程。隐私面与 3.3 R4 同口径：全屏录制仅在本机 dev 环境短窗口执行。

**决策 2——契约承载面（定案）：不新增 CLI 面；run 目录手工装配 + 采集脚本三件套；单步复合动作 + 常量 media 引用。** 备选对比：(a) 新增 ShowCraft CLI flag（如 `--website-demo`）——拒绝：该 flag 需要 main.ts 装配新 port、`--desktop` 语义族扩展、parseDemoArgs 面扩大，而 website 路径无 gate/evidence 输入，塞进现有 flag 族会制造「半启用的 desktop 阶段」歧义；(b) 走完整 `--source`+`--desktop` 管线（给 DeepMatch 造 changelog+git 标签证据链）——拒绝：证据是伪造的（website 仓库无 desktop-v* 标签惯例），违反「不虚构可录性/证据」与 R4 精神；(c) **采纳**：`scripts/website-demo/capture.sh`（编排）+ `page-flow.mjs`（ego-browser 页面操作）+ `assemble-actions.mjs`（actions.json 组装与 schema 校验），零 pipeline 改动、零 CLI flag 面变化。action 粒度 = **单步复合动作**（featureId 常量 `website-quote-match`，一条记录覆盖 打开页面→上传→识别→匹配→截图 全流程）：上传/识别/匹配分步会产生三条 executed 记录，但 (i) 页面流程是一次连续用户操作（无中间可停驻的独立动作边界），(ii) 录屏是一个连续窗口（分步记录配多录屏会切割同一流程、或三条记录共享一个媒体文件违反「每动作至多一个媒体文件」语义），(iii) reason 枚举无「步骤级」语义。media 引用：`recording-website-quote-match.mov`（featureIdSchema 字符集内 + media.file 白名单双保险），由 screencapture 直写 run 目录（3.3 语义），成功媒体引用仅在产物校验通过后写入。sourceRef 指向本计划文件的实施步骤章节（sectionIndex/sectionTitle/startLine/endLine，实施期回填精确行号），evidenceIds = `[story-website-demo-capture-plan]`（指向计划文档的常量 id）——**显式声明**：website 路径无 evidence.json/gate.json，evidenceIds 不做条目解析（`validateReleasePackageRelations` 是管线内校验，手工装配路径只过 `demoActionsSchema`），这个放宽是本计划对「证据回链」语义的显式收窄而非静默破坏。

**决策 3——幂等与字节契约影响（定案）：actions.json 全常量字段 ⇒ 字节幂等保持；时间敏感文本只进媒体；既有契约零影响。** 实测证据（2026-10-19）：同一样本 PDF 直 POST `/api/analyze-drawing`，PM 2026-10-15 测得「变焦座 / 精密机械加工（CNC）/ 92% / 3 家供应商」，本规划 run 实测返回「高压电缆组件 / 工业电缆… / 85%」——**AI 识别结果跨运行不稳定已实证**。对策：(a) actions.json 记录字段全部为常量（featureId/status/reason/sourceRef/evidenceIds/media.file/observations 形状事实），AI 文本零进入——重复运行 `cmp` 断言成立；(b) 自动化断言用**子串/结构**而非全文——完成信号 = `#quote-drawing-upload` 节点分离（语言无关、DOM 结构信号，不依赖「供应商匹配完成」文案的 i18n 状态）；(c) 媒体文件非字节稳定（帧率 13–15fps 波动 + AI 结果差异），沿用 3.3 修订：存在性 + 非空 + ftyp 头核对，不 `cmp`。对既有契约的零影响论证：mock 路径与未启用 `--desktop` 的 `--source` 路径不经过 website 采集脚本（新文件、零 import 进 pipeline），desktop stage 在两条路径上照旧跳过 ⇒ 4/5 文件集合与字节逐位不变；`demoActionObservationsSchema` 加法扩展只增可选键，既有用例无一处枚举完整键集或断言键集大小，338 测试零回归（实施期以全量测试复跑证明）。

**决策 4——失败语义（定案，防伪成功核心）。** 预检失败（dev server 不可用/占用非 DeepMatch/首页无上传控件）：不创建 run 目录、不启动录屏、不落任何产物文件——失败以最终报告呈现（诊断含端口状态与启动输出摘录，有界）；这与 3.3「runner start 失败 → actions.json 不存在」的语义同构。流程中失败（识别 API 报错/等待超时）：录屏已在窗口内 → 等待 screencapture 自然退出（不可 SIGTERM 提前杀——3.3 实测 TERM 中断无产物）→ 产物校验：有效则 actions.json 记 failed(action_failed) + media（失败证据素材，refine 允许）+ matched_result_present=false；无效则 failed(action_failed) 无 media。录制失败三形态（启动失败/中途失败/产物空或无 ftyp）：failed(recording_failed)、损坏文件改名 `.failed`、observations 保留——全部沿用 3.3 已验收语义与 schema refine 既有约束（recording_failed 禁止 media）。所有失败诊断有界 ≤2048。**无伪成功不变量**：executed 记录 ⇔ 录屏产物校验通过 ∧ 匹配完成信号出现；二者缺一即显式失败。

**决策 5——边界与硬约束确认（定案）。** (1) website 仓库只读：采集只发 HTTP 请求与读文件，样本 PDF 复制到 run 目录外临时路径再 setInputFiles；前后 `git status --porcelain` 对照（规划期基线：HEAD a449463699cba1cfea8bf22891ecf27c4e7c34d5，工作树干净）。(2) 零 npm 依赖：采集脚本用系统能力（ego-browser CLI、screencapture、qlmanage、python3 标准库）+ Node 原生模块；schema 校验经仓库内 tsx 直引 `packages/core/src/domain.ts`。(3) 不做 epic 4 合成、不做 StartUpOS 路径改动。(4) ego-browser 只用 SKILL.md v2.1.0 列出的 API；唯一 TaskSpace（本 run 专用名），`finish({ keep: [] })` 收尾；绝不动用户常驻 ego lite 实例（只创建/结束自己的 task space）。(5) 端口纪律：4321 优先复用已监听的 DeepMatch dev server（规划期实测：PM 于 09:34 启动的 `npm run dev --port 4321`，pid 55488/55511，首页标记验证 200）；无可用服务才自行 spawn 并在收尾 kill 自己的；**3100 全程不触碰**（StartUpOS dev 链 LaunchAgent 持有）。

**规划期实测记录（2026-10-19，供实施对照；证据即时落盘）。**
- 环境：ego-browser 二进制 `/Users/archersado/.local/bin/ego-browser` 在位，`ego-browser skill` 输出完整（v2.1.0，550 行，`[ego-browser:skill] end of guide` 行在位）；`Page.startScreencast` 不在 SKILL API 面（仅 page.cdp 逃生通道，佐证决策 1）。
- TCC：`screencapture -x` 退出码 0；`screencapture -v -V 3 -D 1` 产出 2,316,696 字节、头 12 字节 `00 00 00 14 ftyp qt ␠␠`——录屏授权在位。
- 端口：4321 由 PM 启动的 DeepMatch dev server 占用（`npm run dev --port 4321` ← next-server v16.2.6，09:34 启动，父链 launchd；GET / = 200 且含「上传图纸，匹配对应产品供应商」）——按决策 5 复用；3100 被 StartUpOS 链占用（不动）。
- 样本：`/Users/archersado/workspace/auto_quotation/.materials/Y2005-15变焦座+生产用图.pdf`（116,662 字节，SHA-256 前缀 b458bf324befae42）；POST /api/analyze-drawing 端到端 200（KIMI_API_KEY 在位——只验 env 名存在未读值），返回 `{"productName":"高压电缆组件","category":"工业电缆（…）","confidence":0.85,...}`（与 PM 2026-10-15 的「变焦座/CNC/92%」不同 → 时间敏感实证）。
- 页面结构（只读核读 quote-matcher.tsx，287 行）：上传 input `#quote-drawing-upload`（sr-only，accept 含 .pdf）；`selectFile` → `startMatching` 自动触发；完成态 = state:"matched" 三元分支整体替换上传分支（input 分离）；首界面语言默认 zh（lib/i18n.tsx useState("zh")）；匹配卡片 `rankSuppliers(...).slice(0, 3)`。
- 供应商名录：data/suppliers-public.json 共 70 家、5 类 × 10（排名稳定但 AI 类目判定不稳 ⇒ 名称不进 actions.json）。
- 【待补：ego-browser 全流程 dry-run + 录制覆盖验证结果——见下】

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test` -- expected: 全绿；338 既有 + 新增观测键用例；mock 4 文件 / `--source` 5 文件断言不变。
- `lsof -nP -iTCP:4321 -sTCP:LISTEN` + `curl -s http://localhost:4321/ | grep -c "上传图纸，匹配对应产品供应商"` -- expected: 有监听且标记命中（复用路径）或无监听（脚本自行启动路径）。
- `scripts/website-demo/capture.sh --duration 90 --output runs/website-demo` -- expected: 退出码 0；stdout 打印 run 目录与 RECording-OK；产物四件齐（mov/actions.json/png/notes）。
- 产物核对（对 run 目录）：
  - `python3 -c "raw=open('<run>/recording-website-quote-match.mov','rb').read(); print('ftyp:', raw[4:12])"` -- expected: `b'ftypqt  '`。
  - `qlmanage -t -s 640 -o <tmp> <run>/recording-website-quote-match.mov` 后目检缩略图 -- expected: 画面为 ego-browser 的 DeepMatch 页面（窗口覆盖性人工确认点）。
  - `pnpm tsx -e "import {demoActionsSchema} from './packages/core/src/domain.ts'; import fs from 'node:fs'; const r=demoActionsSchema.safeParse(JSON.parse(fs.readFileSync('<run>/actions.json','utf8'))); console.log(r.success)"` -- expected: true。
  - `jq '.actions[0] | {featureId, status, reason, media, observations}' <run>/actions.json` -- expected: featureId=website-quote-match、status=executed、reason=eligible、media.file=recording-website-quote-match.mov、observations.website_page_status=200 ∧ matched_result_present=true。
- 重复上条采集（新 run 目录）-- expected: 两次 actions.json 字节相同（`cmp`）；两次 mov 各自非空 ftyp（不比字节）。
- `git -C /Users/archersado/workspace/website status --porcelain` -- expected: 采集前后输出一致。
- 收尾对照：`lsof -nP -iTCP:4321 -sTCP:LISTEN; pgrep -fl screencapture; lsof -nP -iTCP:3100 -sTCP:LISTEN` -- expected: 4321 仅剩非本 run 的原有服务（若有）、无 screencapture 残留、3100 与采集前一致。
- `openspec validate showcraft-release-video-mvp --strict` -- expected: 通过（无 spec delta）。

## 风险清单

- R1（中）：全屏录屏录到用户桌面其他内容（隐私面）——采集窗口短（≤120s）、人工确认 ego lite 在前台、产物存 run 目录；3.3 R4 同口径。
- R2（中）：AI 识别端到端耗时波动（服务端 maxDuration 180s；实测 13–40s 量级）——录制窗口 = 实测耗时 × 2 且 ≥ 60s；超时路径按 #5 显式失败。
- R3（低）：ego lite 窗口不在前台导致录屏画面不含页面操作——qlmanage 抽帧目检拦截；重采前人工置前。
- R4（低）：用户/PM 关闭其 4321 dev server——capture.sh 预检降级为自行启动并收尾清理；两者互斥判定见 I/O 矩阵 #9/#10。
- R5（低）：DeepMatch 页面结构漂移（上传 input id 变化）——预检断言拦截，报告显式失败（不静默降级）。
