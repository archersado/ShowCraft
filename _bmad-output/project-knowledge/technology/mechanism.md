# 技术架构：机制

## M-T01：核心层保持确定性与供应商无关

- 目标：使输入校验、状态追踪和失败语义可测试且不受外部服务波动影响。
- 结构承载：`packages/core`、Zod schema、端口接口。
- 运行行为：外部调用集中在 adapters；core 接收统一结果或错误，转成 run 状态与诊断。
- 验证：core 测试覆盖合法输入、空特性、非法输入和适配器失败。[S-001]

## M-T02：文件化 run 产物为可审计原型提供持久性

- 目标：无需数据库或队列即可复现和检查每次生成。
- 结构承载：CLI、单次任务目录、脚本/动作/manifest 文件。
- 运行行为：每阶段写入可读结构化文件；失败不清理之前成功产物。
- 验证：运行 demo 后能从输出目录定位状态、脚本、动作、录屏占位和 manifest。[S-001]

## M-T03：本地自动化与人工审核分离执行责任

- 目标：使演示执行可无人干预，同时保留对外内容的人工质量控制。
- 结构承载：本地 runner、Demo/Capture/TTS adapters、Review Gate、run 目录。
- 运行行为：runner 全自动产生可审核视频与证据；审核状态由独立命令或界面写入，不回传为浏览器自动化权限。
- 验证：自动化完成不等于 `approved`；本地 run 可在没有发布渠道凭据时执行。[S-003]

## M-T04：来源解析受参数化与只读边界约束

- 目标：让 CLI 支持任意 Changelog 地址，同时不把 ShowCraft 变成可任意读取本机文件的工具。
- 结构承载：CLI、Source Resolver、允许的 Markdown 文档、运行时路径策略。
- 运行行为：CLI 接受明确的文件路径或 GitHub URL；resolver 校验扩展名、根目录/URL allowlist，并拒绝 `.env`、凭据和目录路径。
- 验证：合法 StartUpOS release changelog 能读入；传入目录、`.env` 或根目录外未经允许路径时拒绝并给出诊断。[S-004]

## M-T05：预览服务默认仅限本机访问

- 目标：在不引入云部署或发布渠道的前提下提供可点击的审核体验。
- 结构承载：Preview Server、CLI、run 目录、Review Gate。
- 运行行为：视频渲染后启动/复用绑定 `127.0.0.1` 的静态服务，CLI 只输出 loopback HTTP URL；审批决定保存于 run。
- 验证：URL 可在本机打开；局域网 IP 不监听；服务进程退出后不保留对外端口。[S-005]

## M-T06：自动化只执行有代码证据支撑的入口

- 目标：避免 LLM 从发布文案猜测 UI 路径而误操作产品。
- 结构承载：Code Evidence Explorer、Git 提交/diff、置信度策略、browser automation adapter。
- 运行行为：Explorer 为 feature 返回证据包；编排器仅接纳达到阈值的候选动作，其他项降级为旁白或人工补充。
- 验证：run 产物保存 commit/file/symbol 证据；没有证据的动作不触发浏览器操作。[S-006]
