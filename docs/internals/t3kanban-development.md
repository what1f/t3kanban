# t3kanban 开发入口

## 开发基线

- 产品规格：[MVP spec](../../.scratch/lite-multica-mvp/spec.md)，包含 25 条 User Stories、Kaneo 参考图和可交互原型。
- 上游：`https://github.com/pingdotgg/t3code.git`。
- 初始提交：`a3a8cbd60539b4af4de8f96c892dbd07a2b6c041`，2026-08-26。
- Git remote 名为 `upstream`；保留上游历史与 MIT LICENSE。
- 依赖与分包直接沿用当前上游。产品标识为 `t3kanban`，内部包名沿用上游，便于增量修改。

当前产品设计已足够开始开发。以下增量中完成字段、接口和验收细节的落地。

## 实现顺序

### 1. Thread 任务数据

在 `packages/contracts` 和 `apps/server` 的现有 command → event → projection 链路中增加任务内容、业务状态、排序，以及全局状态配置。Task 使用 Thread 的同一标识。任务内容与已发送的历史消息分别保存，编辑内容时保留消息历史。

给旧 Thread 补入全局排序首项作为默认业务状态，内容可从首条用户消息初始化。标题为空时沿用摘要／占位标题策略，满足当前 Thread 非空标题契约。全局状态属于各 Runtime/environment 的数据，项目共享所在环境的状态选项；远程客户端修改同一份数据。

验收：创建、编辑、重开和重连后字段一致；状态与执行进展独立；全局状态删除时任务迁移正确。

### 2. 导航、看板／列表、新建任务

在 `apps/web` 的现有路由与组件上实现 spec 中的侧栏和 Kaneo 样式。两种视角使用同一份 Thread 读模型；点击任务进入现有 Thread 路由。

创建弹窗复用当前 Provider 和启动 turn 的流程，带入项目与状态，创建后自动执行。图片附件复用已有上传／粘贴、存储与 Harness 发送链路，在任务内容与详情中保留展示。

源码核查：初始基线 `packages/contracts/src/orchestration.ts` 的 `ChatAttachment` 包含 `ChatImageAttachment`，与当前 MVP 的图片附件范围一致。

验收：可选标题、纯图片内容、列内创建状态带入、两种视角切换、跨列拖动、项目范围保持；Codex／Claude Code 能读取已提交的图片。

### 3. 邮件式收件箱

从服务端持久事件生成最终结果、审批和提问通知。使用来源事件／turn／request 标识保证重放与重连时唯一；已读和显式删除结果持久化。原生请求继续在现有对话中处理。

当前 T3 的 active／settled／snoozed Thread 聚合可提供参考，邮件记录按 spec 逐条保存。

验收：正常结束、失败、中断、审批和提问均产生通知；重复事件保持唯一；阅读、回复和任务完成后通知保留；重启后已读／删除结果一致。

### 4. Thread 详情整合与端到端验收

保留 T3 对话主体，在右侧增加任务属性与完整任务内容。串联“创建 → 自动执行 → 新通知 → 打开任务 → 继续对话”，验证从看板、列表和收件箱返回原入口。

验收：使用 Codex、Claude Code 各跑一条真实任务；执行中离开页面仍继续；Desktop 与 Web 使用同一数据链路；远程连接后任务和通知可读写。

## 开发环境

使用根 `package.json` 约定的 Node 24 与 pnpm 版本。根目录 `pnpm dev` 启动 server + web，`pnpm dev:desktop` 启动桌面开发环境。开发命令显式设置 `--home-dir ./.t3`，数据与现有 T3 安装隔离；端口与配对地址以启动输出为准。

按改动范围执行定向测试与类型检查。原型为内存演示；真正的交付以服务端持久化、Harness 实际执行和界面验收为准。

### 初始化验证（2026-08-27）

- Web、server、Desktop 及其工作区依赖已按锁文件安装。
- `pnpm exec vp test run scripts/dev-runner.test.ts`：72 项测试通过。
- `pnpm dev --dry-run` 与 `pnpm dev:desktop --dry-run`：开发数据目录均解析到本工程 `.t3/`。
- spec、原型与目标图片的工程内链接已检查。
- 当前执行环境报告 Node 25.9.0，安装和上述检查通过，但会提示上游要求 Node `^24.13.1`；日常开发按声明使用 Node 24。
