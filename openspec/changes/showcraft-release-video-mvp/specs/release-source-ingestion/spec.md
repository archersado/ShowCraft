# Spec Delta

## Purpose

让运营团队通过一个明确的本地 Markdown 路径或 GitHub URL 提供版本说明，并得到可追溯、可校验的特性输入。

## ADDED Requirements

### Requirement: 接收并解析发布说明来源

系统 SHALL 接受 `--source` 指定的本地 Markdown 文件路径或 GitHub 文档 URL，并将其解析为包含版本和至少一个特性的结构化 release brief。

#### Scenario: 解析 StartUpOS 版本说明

- **WHEN** 用户传入 StartUpOS `v0.3.3` 的 release changelog 路径
- **THEN** 系统输出带版本标识和分组特性的 release brief

#### Scenario: 拒绝无效来源

- **WHEN** 用户传入目录、非 Markdown 文件、`.env` 文件或不存在的来源
- **THEN** 系统拒绝创建 run 并说明来源校验失败原因

### Requirement: 保留输入可追溯性

系统 SHALL 在每个 run 中保存来源地址、内容摘要和解析出的特性与源段落之间的映射。

#### Scenario: 审核输入事实

- **WHEN** 运营人员查看已生成 run 的详情
- **THEN** 可以看到每项特性对应的发布说明段落
