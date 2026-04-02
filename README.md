# restored-src

`restored-src` 是本仓库中用于继续修复、审阅和提交的恢复源码目录。

这份代码并不是官方原始内部仓库，而是基于公开 npm 发布包与 source map 恢复出的 Claude Code `2.1.88` 源码工程，并在此基础上继续补齐缺失文件、构建链和部分运行时实现。

## 目录说明

本目录的职责是承载恢复后的源码本体。

主要内容包括：

- `src/`：恢复后的源码
- `package.json`：源码目录自己的构建与启动脚本
- `RESTORATION_REPORT.md`：当前恢复结果、已补链路与剩余差异

以下内容属于派生产物或依赖目录，不应作为源码主体理解：

- `dist/`
- `node_modules/`
- `vendor/`

## 当前恢复状态

当前这份恢复源码已经从“缺文件、缺资源、无法完整构建”的状态，推进到“可完整构建并可启动 CLI”的状态。

已确认：

- `src/` 缺失相对模块归零
- 技能资源缺失归零
- 可以完整构建出 `dist/`
- 构建产物可直接启动 CLI
- `--help` 与 `--version` 已验证可用

已验证命令：

```bash
node scripts/check-restored-src.js
npm run build:restored
node restored-src/dist/entrypoints/cli.js --help
node restored-src/dist/entrypoints/cli.js --version
```

已验证结果：

- `missing relative modules: 0`
- `missing skill assets: 0`
- `build:restored` 成功
- `--version` 输出 `2.1.88 (Claude Code)`

## 构建与运行

环境要求：

- Node.js `>= 18`

在仓库根目录构建：

```bash
npm run build:restored
```

在 `restored-src/` 目录内构建：

```bash
npm run build
```

在 `restored-src/` 目录内运行构建产物：

```bash
npm run start
npm run help
npm run version
```

也可以直接运行：

```bash
node dist/entrypoints/cli.js
```

## 源码中可确认的能力

以下条目只表示当前源码中可以直接确认存在对应模块、注册项或已补齐链路。

其中只有下面这些事项已经做过实际运行验证：

- `node scripts/check-restored-src.js`
- `npm run build:restored`
- `node restored-src/dist/entrypoints/cli.js --help`
- `node restored-src/dist/entrypoints/cli.js --version`

除上述验证项外，其余能力表示源码层面可以确认存在对应实现或入口，不等于已经完成完整端到端回归。

在核心系统层面，当前源码中可以确认存在：

- REPL 交互界面
- 流式对话与工具调用循环
- 上下文构建
- 权限系统
- Hook 系统
- 会话恢复
- Doctor 诊断
- 自动压缩
- 技能搜索与技能加载
- 会话 transcript 持久化
- 后台会话管理
- 本地 UDS 消息收发
- direct-connect / server 兼容链路

在工具注册表层面，当前源码中可以确认存在：

- `BashTool`
- `FileReadTool`
- `FileEditTool`
- `FileWriteTool`
- `NotebookEditTool`
- `AgentTool`
- `WebFetchTool`
- `WebSearchTool`
- `AskUserQuestionTool`
- `SendMessageTool`
- `SkillTool`
- `TodoWriteTool`

在斜杠命令注册表层面，当前源码中可以确认存在：

- `/help`
- `/clear`
- `/compact`
- `/config`
- `/doctor`
- `/mcp`
- `/memory`
- `/model`
- `/permissions`
- `/plan`
- `/plugin`
- `/resume`
- `/review`
- `/stats`
- `/theme`
- `/upgrade`

此外，当前源码中仍然存在一批受 feature gate、环境变量、用户类型或运行平台影响的分支，例如 assistant、部分 remote/server 能力、部分 swarm/团队协作能力，以及若干平台或环境相关工具。这些路径是否在当前构建里实际生效，仍取决于具体运行环境和开关状态。

## 已补齐的关键链路

除了补齐文件和构建链之外，这份恢复源码还额外替换了一批原本会在运行时直接掉空的实现，主要包括：

- `assistant/*`
- `services/contextCollapse/*`
- `services/compact/reactiveCompact.ts`
- `services/skillSearch/*`
- `services/sessionTranscript/sessionTranscript.ts`
- `cli/bg.ts`
- `utils/udsMessaging.ts`
- `utils/udsClient.ts`
- `utils/attributionHooks.ts`
- `server/*` 中的 direct-connect 兼容主链
- `utils/postCommitAttribution.ts`

这些模块当前已经不再只是占位文件，而是恢复态兼容实现。

## 提交约定

如果本目录用于源码提交，建议以源码和文档为主，而不是将构建产物和依赖目录一并纳入。

通常应提交：

- `src/`
- `README.md`
- `RESTORATION_REPORT.md`
- `package.json`

通常不应提交：

- `dist/`
- `node_modules/`
- `vendor/`

## 边界与未完成项

当前这份恢复源码已经可构建、可运行，但还不能宣称“与原始完整项目完全等价”。

当前仍然存在的主要边界包括：

- 一部分模块仍属于恢复态兼容实现，不保证与原始私有实现完全一致
- 一些 feature-gated 分支没有在当前环境做完整端到端回归
- `server/direct-connect` 代码链已经补通，但当前环境下未完成真实 socket 级回归
- 第三方依赖目录中仍存在为恢复工程加入的兼容修补

更细的差异目前以源码目录自身状态为准，不再依赖额外文档说明。

## 声明

- 本目录仅用于恢复源码研究、工程修复与技术分析
- 不代表官方原始内部仓库
- 请勿将恢复源码、构建产物和依赖目录混同为官方发布版本
