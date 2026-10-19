---
id: 10
type: story
title: "DeepMatch 网站上传图纸匹配供应商功能录屏（首轮验证目标 2）"
parent: epic-desktop-capture
covers: [R5, R6]
after: [12]
risk: medium
---

# DeepMatch 网站上传图纸匹配供应商功能录屏（首轮验证目标 2）

## Description

以 agent 控制 ego-browser 完成 DeepMatch 网站「上传图纸，匹配对应产品供应商」真实页面流程，并以系统级 `screencapture` 录制主显示器；通过独立采集脚本把单步复合动作、录屏引用、匹配完成截图与诊断写入独立 run 目录。复用既有 `actions.json` / `media.file` 与失败无伪成功语义，不新增 ShowCraft CLI 面，不改既有 pipeline、OpenSpec、StartUpOS 或 website 产品代码。

## Acceptance Criteria

Verify: 样本 PDF 经 4321 的 DeepMatch 页面上传后出现匹配完成态，run 目录包含有效 QuickTime/H.264 录屏、通过 `demoActionsSchema` 的单条动作记录、完成态截图与采集说明；连续两次运行的 `actions.json` 字节相同，时间敏感 AI 文本只存在于媒体中；页面、上传/API、录制任一失败均显式失败且不产生成功媒体引用；website 仓库前后状态一致，采集只清理自己启动的进程，3100 与用户常驻 ego lite 实例不受影响；mock 4 文件、`--source` 5 文件及既有 338 测试零回归。

## References

- parent — _bmad-output/initiative-showcraft-release-video-mvp/epic-desktop-capture/epic-desktop-capture.md
- plan — _bmad-output/initiative-showcraft-release-video-mvp/epic-desktop-capture/story-website-demo-capture-plan.md
- contract semantics — openspec/changes/showcraft-release-video-mvp/specs/desktop-demo-capture/spec.md
