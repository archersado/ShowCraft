# Spec Delta

## Purpose

将经验证的演示素材与中文旁白、字幕组合成时长随特性数量变化的产品介绍视频，供运营团队审阅。

## ADDED Requirements

### Requirement: 生成中文配音与字幕

系统 SHALL 使用 `zh-CN-XiaoxiaoNeural` 作为默认 Edge TTS 音色，为每个镜头生成中文旁白和同步字幕。

#### Scenario: 默认中文音画生成

- **WHEN** 一个镜头拥有中文讲解文本
- **THEN** 输出包含 Xiaoxiao 配音引用与对应字幕时序的渲染清单

### Requirement: 按特性数量编排时长

系统 SHALL 为开场和结尾分配 10–15 秒、为每项特性分配 12–20 秒；预估总时长超过 90 秒时 SHALL 按特性边界拆分系列。

#### Scenario: 多特性视频拆分

- **WHEN** 输入特性的预估总时长超过 90 秒
- **THEN** 输出多个各自不超过 90 秒的视频清单且不拆分单个特性镜头
