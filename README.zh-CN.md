<p align="right">
  <a href="./README.md">English</a> · <strong>简体中文</strong>
</p>

<p align="center">
  <img src="./assets/prod/t3-black-web-apple-touch-180.png" width="96" alt="T3 Kanban 标志">
</p>

<h1 align="center">T3 Kanban</h1>

<p align="center">
  <strong>用任务管理并行 Coding Agent。</strong>
</p>

<p align="center">
  把每个 Agent Thread 变成有目标、有状态、可审查的任务。<br>
  需求明确时交给 Agent 后离开，Inbox 需要你时再回来；需要深度协作时，直接在同一个任务里查看完整对话、思考、工具调用和 Diff。
</p>

<p align="center">
  Web · macOS · Local-first · MIT
</p>

![T3 Kanban 任务看板，展示 Todo、In Progress、In Review、Blocked 和 Done 中的工作](./assets/readme/task-board.png)

## 快速开始

**环境要求：** Node.js `^24.13.1`、pnpm `11.10.0`，以及至少一个已经完成登录的 Coding Agent CLI。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

服务启动后会在终端输出配对 URL。请打开包含令牌的完整链接进入 Web 工作台。

运行 macOS 桌面开发版：

```bash
pnpm dev:desktop
```

开发数据保存在当前仓库已忽略的 `.t3/` 目录，不会读写现有 T3 Code 安装的数据。

## 管理任务，而不是管理一堆会话

在 T3 Kanban 中，Thread 和 Task 是同一份持久工作记录。任务目标、业务状态、Agent 执行、后续讨论和 Review 历史始终放在一起。

### 一个看板管理所有项目

在全局看板查看所有项目，也可以只聚焦单个项目。支持 Board 与 List 两种视角，并可拖动任务在 `Todo`、`In Progress`、`In Review`、`Blocked`、`Done` 之间流转。

### 创建一次，直接开跑

使用 Markdown 描述任务，粘贴或上传图片，选择项目、状态、Agent 和模型，一次提交即可开始执行。离开页面不会中断已经提交的工作。

![包含状态、Agent、模型和附件入口的新建任务弹窗](./assets/readme/create-task.png)

### 需要时随时切回深度协作

任务明确时，交给 Agent 后继续处理其他工作；任务复杂时，打开同一个任务，继续使用完整的 Agent 对话、思考过程、工具调用、审批和代码 Diff，任务目标始终显示在旁边。

这里没有“项目管理工具”和“聊天客户端”之间的交接，也不需要来回复制上下文。

![T3 Kanban 三栏任务工作台，同时展示 Agent 原生对话与任务详情](./assets/readme/task-workbench.png)

### 用邮件式 Inbox 集中 Review

Agent 完成、失败、中断、提出问题或请求审批时，Inbox 会显示该任务的最新结果。已读状态和删除操作会持久化，同一任务不会因为连续对话产生一串重复提醒。

![展示任务最新 Agent 结果的 Inbox](./assets/readme/inbox.png)

### 让 Agent 自己维护任务

当前 Agent 可以读取任务，并随着工作推进更新标题、Markdown 描述或状态。如果你在对话外修改任务，Agent 也能重新读取最新目标，避免继续按过期要求工作。

## 两种工作方式，一套上下文

```text
创建任务 → Agent 执行 → Inbox 提醒 → 回到同一 Thread Review → 更新状态
```

- **派发模式**：把边界清晰的工作交给 Agent，离开页面，收到提醒后再 Review。
- **协作模式**：留在原生对话中查看进展、及时打断、补充要求并继续执行。

## 首次打开未签名的 macOS 构建

当前 macOS 发布包没有 Apple Developer ID 签名与公证。将应用拖入 `/Applications` 后，如果 Gatekeeper 阻止首次打开，请只移除这个 App 的隔离标记：

```bash
xattr -dr com.apple.quarantine "/Applications/T3 Kanban (Alpha).app"
```

然后重新打开应用。该命令会绕过 macOS 对这个 App 的来源检查，请只对从本项目 Releases 页面下载的构建执行。

## 项目状态

T3 Kanban 目前处于 Alpha 阶段，主要面向本地 Web 与 macOS 桌面使用。任务工作流和数据迁移仍在快速迭代，升级前请查看发布说明。

## 基于 T3 Code

T3 Kanban 基于 [T3 Code](https://github.com/pingdotgg/t3code) 构建，复用其 Agent Harness、对话、审批、Diff、工作区与远程连接能力。基础能力请查看上游项目；本仓库重点介绍在此之上新增的任务优先工作流。

## 参与贡献

欢迎提交 Bug 和边界清晰的 Pull Request。开始较大的改动前，请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## License

[MIT](./LICENSE)。本仓库保留 T3 Code 的原始版权与许可证信息。
