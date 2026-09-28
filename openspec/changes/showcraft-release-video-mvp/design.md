# Design

## Context

见 `proposal.md`。ShowCraft 是空白 TypeScript 项目；首个真实验收输入为 StartUpOS Desktop `v0.3.3`，但 StartUpOS 是只读外部仓库。系统必须从发布文案与 Git 证据定位版本专属入口，并在本机完成生成、预览与人工审核。

## Goals / Non-Goals

**Goals:**

- 用稳定的 release brief、evidence pack、scene plan、render manifest 与 run record 串联全链路。
- 将供应商与产品特定行为隔离在 adapter 内；core 只处理 schema、状态、置信度和编排。
- 默认把任何无代码证据或低置信度的动作降级为人工补充或旁白。
- 在不对外暴露产物的情况下提供可点击审核预览。

**Non-Goals:**

- 不实现云队列、账号体系、发布渠道、远程协作审核或无人工发布。
- 不读取或写入 StartUpOS 的秘密文件、工作树或 Git 历史。
- 不承诺每条 Changelog 文案都存在可录制 UI。

## Decisions

### Ports-and-adapters 编排

core 定义 `ReleaseSource`、`CodeEvidence`、`DesktopRunner`、`Narration`、`Renderer` 与 `ReviewStore` ports；CLI 负责依赖装配和 run 目录持久化。相比把流程直接写进 CLI，这允许 mock、StartUpOS、Edge TTS 和 Remotion 独立替换。

### 证据门禁先于桌面操作

release brief 的每个 feature 先生成 evidence pack：源段落、提交/文件/符号、入口候选、置信度。只有达到配置阈值并有可观察入口的候选才进入 DesktopRunner。替代方案是让模型直接从 Changelog 生成点击路径；因不可审计且容易误操作而拒绝。

### 文件化 run 与 loopback 预览

每次 run 保存输入、证据、场景、动作、媒体、manifest、状态与审核决定。Preview Server 只绑定 `127.0.0.1`，以 `http://127.0.0.1:<port>/runs/<id>/preview` 提供视频。相比 file URI，它能附带 run 摘要并保持 CLI 可复制的审核链接。

### 媒体生成合同

Scene plan 先固定镜头和中文文案；Edge TTS adapter 默认 `zh-CN-XiaoxiaoNeural` 输出音频及时序；subtitle adapter 从相同时序生成字幕；Remotion 只消费 manifest。超过 90 秒时在 feature 边界拆分，而不是截断镜头。

### 审核状态独立于技术完成

技术 run 可为 `completed`，业务状态仍为 `pending_review`。只有 `approved` 可交付；`changes_requested` 保存意见且保留全部产物。相比自动发布，保留运营团队对事实与品牌的最终责任。

## Risks / Trade-offs

- [Commit 与 feature 关联不完整] → 输出置信度和证据，低置信度不执行。
- [桌面 UI 不稳定或需要认证] → 先以可重复启动、固定测试数据和显式就绪探测建立 runner；失败保留诊断。
- [Edge TTS 网络或服务异常] → adapter 返回可诊断失败；首版不伪造音频，后续可增加替代 provider。
- [本地预览进程残留] → 绑定随机 loopback 端口，运行结束或显式 stop 时关闭。

## Migration Plan

1. 创建 workspace 与 mock adapters，确保无凭据 demo 可运行。
2. 添加 StartUpOS source/evidence/desktop adapters，并在 `v0.3.3` 上验证。
3. 添加 Edge TTS、Remotion、preview/review；通过人工审核后才扩大到其他版本。
4. 回滚方式：禁用真实 adapters，回退至 mock manifest；run 产物保持只读可审计。

## Open Questions

- StartUpOS Desktop 的可重复启动、测试数据、认证和首屏就绪条件需要在 Epic 2 的 tracer story 中验证。
- 代码证据的初始置信度阈值可在实现时作为配置默认值确定，不改变对低置信度不自动执行的规格。
