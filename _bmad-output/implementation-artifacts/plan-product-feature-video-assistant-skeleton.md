---
title: 'Product Feature Video Assistant Skeleton'
type: 'feature'
ticket: ''
created: '2026-09-28'
status: 'draft'
route: 'full'
route_source: 'auto'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 产品每次发布新版本后，运营人员需要手工理解特性、操作产品、录屏、撰写文案并剪辑成介绍视频，流程重复且难以规模化。

**Approach:** 构建一个可运行的 TypeScript 项目骨架，把“版本特性 → 演示脚本 → 浏览器操作与录屏 → 视频合成”建模为可恢复的任务流水线；提供本地示例与 Remotion 渲染入口，并为真实 LLM、产品自动化、录屏、TTS 与 HyperFrames 保留清晰适配器边界。

## Boundaries & Constraints

**Always:** 使用结构化 schema 校验输入和中间产物；流水线任务可追踪状态与失败原因；外部服务均通过接口注入；默认示例无需 API Key 即可运行；输出保存在单次任务目录中，包含脚本、录屏清单和渲染清单。

**Never:** 不内置用户产品凭据或绕过登录；不假装已完成真实产品录制；不绑定单一 LLM/TTS/浏览器供应商；不实现完整 SaaS 控制台、队列集群、云存储或正式发布系统。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 本地演示 | 合法版本清单与 mock 产品步骤 | 生成旁白、镜头、自动化动作和 Remotion 渲染清单 | 无错误 |
| 非法清单 | 缺少版本号、特性或步骤 | 在开始任务前拒绝执行 | 返回带字段路径的校验错误 |
| 适配器失败 | 某个操作或录屏步骤失败 | 任务标记失败并保留已生成产物 | 记录阶段、错误信息与可重试上下文 |
| 空特性 | features 为空 | 不创建任务产物 | 明确提示至少需要一个特性 |

</frozen-after-approval>

## Code Map

- `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` -- 新仓库的 workspace、脚本和 TypeScript 基线。
- `packages/core/src/` -- 领域 schema、流水线状态、端口接口与编排服务；不依赖具体渲染或浏览器实现。
- `packages/adapters/src/` -- mock 文案、产品操作、录屏及 HyperFrames 清单适配器；未来替换真实供应商。
- `apps/cli/src/` -- 从版本清单启动任务并输出结构化结果的命令行入口。
- `apps/studio/src/` -- Remotion composition，根据渲染清单组合标题、字幕和演示媒体。
- `examples/releases/` -- 可直接运行的示例版本清单。
- `docs/architecture.md` -- 数据流、扩展点、凭据边界和真实接入路线。

## Tasks & Acceptance

**Execution:**
- [ ] 根配置文件 -- 初始化 pnpm TypeScript workspace，统一 build、typecheck、test、demo 与 render 脚本。
- [ ] `packages/core/src/` -- 定义 Zod schema、任务状态机、适配器端口和逐阶段编排器，使失败可定位且产物可复用。
- [ ] `packages/adapters/src/` -- 实现无凭据 mock 适配器及 HyperFrames-compatible manifest 导出器，证明端口可组合。
- [ ] `apps/cli/src/` -- 实现 `plan`/`run` 命令和任务目录持久化，支持从 JSON 版本说明生成全套中间产物。
- [ ] `apps/studio/src/` -- 创建 Remotion 视频模板，消费 manifest 展示开场、特性镜头、字幕与结尾 CTA。
- [ ] `examples/releases/demo.json` 与 `README.md` -- 提供端到端演示、目录说明、真实服务接入指引和安全注意事项。
- [ ] `packages/core/test/` -- 覆盖合法输入、非法输入、空特性、适配器失败和状态转换。

**Acceptance Criteria:**
- Given 新克隆且无任何外部凭据的仓库，when 安装依赖并运行 demo，then 任务目录包含经 schema 校验的脚本、动作、录屏占位产物、Remotion manifest 和最终状态。
- Given demo 生成的 manifest，when 启动 Remotion Studio 或执行渲染命令，then 可预览或产出一段带品牌开场、逐特性讲解、字幕及 CTA 的视频。
- Given 开发者要接入真实产品，when 实现已有端口并注入编排器，then 无需修改核心领域 schema 或状态机。
- Given 任一外部步骤抛错，when 流水线结束，then CLI 非零退出且任务状态记录失败阶段和错误原因。

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Design Notes

采用 ports-and-adapters：core 只认识结构化输入输出和阶段状态；CLI 负责运行与持久化；Remotion 仅消费稳定 manifest。第一版录屏适配器生成可验证的占位媒体描述，真实 Playwright/浏览器录屏作为后续适配器接入，避免骨架依赖具体产品 URL 与认证方式。

## Verification

**Commands:**
- `pnpm install` -- expected: workspace 依赖安装成功。
- `pnpm typecheck` -- expected: 所有包无 TypeScript 错误。
- `pnpm test` -- expected: schema、状态转换与失败路径测试通过。
- `pnpm demo` -- expected: 在 `output/` 生成一个完成状态的示例任务。
- `pnpm render:demo` -- expected: 从示例 manifest 生成 MP4。
