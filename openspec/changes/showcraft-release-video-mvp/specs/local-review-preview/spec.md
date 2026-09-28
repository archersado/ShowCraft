# Spec Delta

## Purpose

通过仅本机可访问的 HTTP 预览和明确审核决定，把自动视频生成接入运营团队的人工质量门禁。

## ADDED Requirements

### Requirement: 提供 loopback 审核预览

系统 SHALL 在渲染完成后输出仅绑定 `127.0.0.1` 的 HTTP 视频预览地址，并显示关联 run 的事实来源与基本产物。

#### Scenario: 在本机打开预览

- **WHEN** CLI 成功完成视频渲染
- **THEN** 输出可在本机浏览器打开的 HTTP URL，且服务不监听局域网地址

### Requirement: 记录人工审核决定

系统 SHALL 支持用户将预览 run 标为 `approved` 或 `changes_requested`，并记录审核意见。

#### Scenario: 拒绝不合格视频

- **WHEN** 用户发现功能事实不符、录屏错误、音画不同步或时长不符合规则
- **THEN** 用户可以将 run 标为 `changes_requested` 并保存原因

### Requirement: 阻止未审核交付

系统 MUST NOT 将未获批准的 run 标记为业务交付完成。

#### Scenario: 未批准视频

- **WHEN** run 仍为 `pending_review` 或 `changes_requested`
- **THEN** 系统保持其不可交付状态
