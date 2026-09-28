# 产品架构：结构

## 产品模块

| 模块 | 输入 | 输出 | 边界 |
|---|---|---|---|
| Changelog Source Resolver | CLI 文档地址、可选版本号 | 目标文档路径或 GitHub URL | StartUpOS 默认规则为 `docs/changes/releases/v<version>/changelog.md` |
| Changelog Sync | 已解析的 GitHub/本地 Markdown 文档 | 归一化 release brief | Markdown section 到 feature 的映射规则 `pending` |
| Code Evidence Explorer | release brief、Git 提交历史与代码 diff | feature-to-entrypoint 证据包、候选操作路径 | 只读 Git；置信度不足时要求人工补充 |
| Release Intake | 同步的 release brief | 经校验的版本特性输入 | 允许人工补充，`inferred` |
| Narrative Planner | release brief | 旁白、镜头与 CTA | 通过文案适配器生成 |
| Demo Orchestrator | 镜头与操作动作 | 阶段状态、录屏请求 | 不认识具体浏览器或产品 |
| Capture Provider | 录屏请求 | 媒体/占位素材描述 | mock 优先，真实录制为后续扩展 |
| Audio & Subtitle Provider | 中文旁白脚本、镜头时序 | AI 配音音轨与字幕轨 | 供应商、音色与术语表 `pending` |
| Edge TTS Adapter | 中文旁白文本、语速与音色配置 | MP3/WAV 音轨与词级/句级时序 | 首选免费服务；离线/网络失败降级 `pending` |
| Render Manifest | 脚本、媒体、音轨、字幕、品牌参数 | Remotion/HyperFrames 兼容清单 | 不直接决定视频平台 |
| Render Studio | manifest | 视频预览或 MP4 | 当前采用 Remotion |
| Review Gate | CLI 返回的视频链接、输入事实 | approved / changes_requested 决定 | 首发必须人工处理 |
| Preview Server | 已渲染视频与任务产物 | `http://127.0.0.1:<port>/runs/<id>/preview` | 仅绑定本机，避免意外外网暴露 |
| CLI | JSON 文件与参数 | 任务目录、退出码 | 骨架不包含 Web 控制台 |

## 核心数据关系

`CLI document path → Source Resolver → Changelog → ReleaseBrief → Code Evidence Explorer → Feature-to-Entrypoint Evidence → ScenePlan/DemoAction → Audio/Subtitles + RenderManifest → Video link → ReviewDecision`

每个对象都归属 `Run`，以支持失败定位和未来重试。[S-001；`Run` 为 inferred]
