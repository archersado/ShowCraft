# Tasks

## 1. 平台与核心领域

- [x] 1.1 初始化 pnpm TypeScript workspace、共享 lint/test/typecheck 脚本和 run 目录忽略规则，并验证 `pnpm typecheck` 可执行
- [x] 1.2 定义 release brief、evidence pack、scene plan、render manifest、run/review 状态的 schema，并验证合法与非法输入单测通过
- [x] 1.3 实现文件化 run 记录与阶段产物持久化（端口编排器在 1.4），并验证失败阶段保留已完成产物和诊断

## 2. 发布来源与代码证据

- [ ] 2.1 实现 CLI `--source`、本地 Markdown/GitHub URL 校验与 StartUpOS release 路径解析，并验证 v0.3.3 changelog 可解析、秘密/目录来源被拒绝
- [ ] 2.2 实现 Changelog section 到 feature 的归一化与来源映射，并验证每个 v0.3.3 feature 可回链原始段落
- [ ] 2.3 实现只读 Git 提交/diff/符号证据检索和置信度输出，并验证感知与 IM 路由得到可追溯入口候选
- [ ] 2.4 实现低置信度门禁与人工补充输出，并验证无证据 feature 不会产生桌面自动化动作

## 3. StartUpOS Desktop 演示与录屏

- [ ] 3.1 建立 StartUpOS Desktop 生命周期 adapter、就绪探测和可诊断的停止逻辑，并验证启动失败不会遗留进程
- [ ] 3.2 实现感知与 IM 路由的首个证据驱动演示路径，并验证动作记录同时引用 changelog 与 commit/code 证据
- [ ] 3.3 接入本地录屏并将媒体引用写入 run，验证元素定位或录制失败时不产生伪成功视频
- [ ] 3.4 为桌面路径加入可重复测试的 mock/fixture 边界，并验证无需真实凭据的回归测试通过

## 4. 中文视频合成

- [ ] 4.1 实现 Edge TTS `zh-CN-XiaoxiaoNeural` adapter 与中文时序输出，并验证中文文本生成可用音轨与字幕时序
- [ ] 4.2 实现 feature 数量驱动的镜头时长与 90 秒系列拆分，并验证 1、3、6 个 feature 的 manifest 行为
- [ ] 4.3 创建 Remotion composition 并消费 manifest，验证 v0.3.3 感知/IM 样本可预览或渲染 MP4

## 5. 本机审核与端到端验收

- [ ] 5.1 实现仅绑定 `127.0.0.1` 的 preview server 与 CLI URL 输出，并验证本机可访问且不监听局域网地址
- [ ] 5.2 实现 approved/changes_requested 审核命令与意见持久化，并验证未批准 run 不可标记业务交付完成
- [ ] 5.3 完成 v0.3.3 感知与 IM 路由端到端 run，验证事实、录屏、音画同步和时长均满足审核门槛
- [ ] 5.4 执行跨模块测试、类型检查和 OpenSpec 严格校验，并验证所有命令成功且 run 产物可追溯
