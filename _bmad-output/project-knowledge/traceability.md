# 追溯与断裂

| 业务目标 | 产品承载 | 技术承载 | 状态 |
|---|---|---|---|
| 从版本特性快速产出介绍视频 | Source Resolver、Changelog Sync、Release Intake、Narrative Planner、Render Studio | core schema、connectors/adapters、CLI、Remotion | 已确认首发边界 |
| 自动操作产品并录屏 | Demo Orchestrator、Capture Provider | 本地浏览器/录屏适配器端口 | 本地全自动；产品启动与认证 pending |
| 文案与镜头可审核 | ScenePlan、Render Manifest、Review Gate、任务产物 | 文件化 run 目录、CLI 视频链接与审核状态 | 人工审核已确认 |
| 中文配音与字幕 | Audio & Subtitle Provider、Render Manifest | 中文 TTS/字幕适配器 | 已确认；供应商 pending |
| 运营人员可审核预览 | Preview Server、Review Gate、VideoAsset | loopback HTTP 服务、CLI 审核命令、run 状态 | 已确认本地 HTTP 模式 |
| 版本专属操作路径 | Code Evidence Explorer、Feature-to-Entrypoint Evidence、ScenePlan | 只读 Git 提交/diff、置信度门禁、自动化适配器 | 已确认代码证据优先 |
| 多渲染器演进 | Render Manifest | Remotion + HyperFrames-compatible adapter | 兼容契约已规划；HyperFrames API pending |

## 活跃架构问题

| 问题 | 目标/差距 | 当前方案 | 影响节点 | 验证 |
|---|---|---|---|---|
| Q-20260928-001 | 将通用流水线收敛为可验证的首发产品边界 | StartUpOS Desktop + v0.3.3 感知/IM + commit 证据入口 + Xiaoxiao TTS + HTTP 审核 | 业务/产品/技术三维的结构、运行、机制 | 启动、关联、录制、TTS 与审核实现待验证 |

## 待验证断裂

1. `pending`：没有真实本地产品的启动命令、稳定元素选择器、测试数据或认证方案，无法设计可重复的自动化录屏适配器。
2. `pending`：远程 GitHub 的最小权限与 Markdown section 到 feature 的解析规则未定义。
3. `pending`：时长基础规则已确认；具体配置值、系列拆分命名、品牌资产和发布渠道尚未定义。
4. `pending`：视频链接确定为 loopback HTTP；审核的具体批准条件、退回意见格式、责任人和返工循环尚未建模。
5. `pending`：HyperFrames 的输入契约、许可证与运行环境未提供；当前只定义兼容 manifest 边界。
