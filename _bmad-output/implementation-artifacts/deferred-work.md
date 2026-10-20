- source_plan: `_bmad-output/initiative-showcraft-release-video-mvp/epic-desktop-capture/story-website-demo-capture-plan.md`
  summary: 统一 page-flow cleanup 失败与 actions.json 的最终状态。
  evidence: `finish()` 失败时页面结果可能仍为 matched，导致退出失败但 actions 记录 executed。
- source_plan: `_bmad-output/initiative-showcraft-release-video-mvp/epic-desktop-capture/story-website-demo-capture-plan.md`
  summary: 补强 website-demo 端口、dev server 与 screencapture 失败诊断。
  evidence: 当前缺少占用者描述、就绪超时日志尾和录屏退出码/日志摘要。
- source_plan: `_bmad-output/initiative-showcraft-release-video-mvp/epic-desktop-capture/story-website-demo-capture-plan.md`
  summary: 为 assembler 分支和 MOV 拒绝路径补充常规自动化测试。
  evidence: 现有 338 个测试不执行 website-demo assembler 或损坏、过短、缩略图失败的媒体路径。
- source_plan: `_bmad-output/initiative-showcraft-release-video-mvp/epic-desktop-capture/story-website-demo-capture-plan.md`
  summary: 修复 website 只读门禁的失败处理并重议自启 Next 的写盘行为。
  evidence: 收尾 git status 读取失败可被忽略，且 Next 自启可能写入被 git 忽略的 `.next`。
- source_plan: `_bmad-output/initiative-showcraft-release-video-mvp/epic-desktop-capture/story-website-demo-capture-plan.md`
  summary: 清理已提交 BMad manifest 中的历史绝对工作区路径。
  evidence: 既有 `_bmad/render` manifest 含不同历史 worktree 的本机绝对路径，影响可移植性。
- source_plan: `_bmad-output/initiative-showcraft-release-video-mvp/epic-desktop-capture/story-website-demo-capture-plan.md`
  summary: 在具备 Codex desktop computer-use 的 runtime 对驻留修复执行两轮视觉复采。
  evidence: 代码与 dry-run 已验证，但当前 runtime 无桌面 CUA，尚无修复后的新 MOV 逐帧证据。
