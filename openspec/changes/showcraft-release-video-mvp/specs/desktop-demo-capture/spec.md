# Spec Delta

## Purpose

在本地受控环境中对有代码证据支撑的 StartUpOS Desktop 功能执行演示，并生成可审核的录屏素材与操作记录。

## ADDED Requirements

### Requirement: 仅执行证据充分的演示动作

系统 SHALL 仅为通过置信度门禁的产品入口执行桌面演示动作，并在 run 中保存动作、入口证据和录屏结果。

#### Scenario: 执行感知与 IM 路由演示

- **WHEN** 感知与 IM 路由入口通过证据门禁且桌面应用已就绪
- **THEN** 系统执行对应演示并保存录屏素材和动作记录

### Requirement: 保留失败诊断

系统 SHALL 在桌面启动、元素定位或录制失败时保留已完成产物、失败阶段和可读诊断。

#### Scenario: 桌面入口不可定位

- **WHEN** 自动化无法定位预期产品入口
- **THEN** run 标记为失败且不产生虚假的成功录屏
