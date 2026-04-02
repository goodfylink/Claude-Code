# restored-src

[简体中文](./README.md) | [English](./README.en.md)

`restored-src` 是本仓库中的恢复源码目录，用于继续修复、审阅和进行源码级提交。

这并不是官方原始内部仓库，而是基于公开 npm 发布包和 source map 恢复出的 Claude Code `2.1.88` 源码工程，并在此基础上继续补齐缺失文件、修复构建链，以及补上一部分运行时兼容实现。

## 目录概览

这个目录的职责是承载恢复后的源码本体。

主要内容包括：

- `src/`：恢复后的源码
- `package.json`：恢复源码目录自身的构建和运行脚本


## 当前状态

这份恢复源码已经从“缺文件、缺资源、构建链不完整”的状态，推进到了“可以完整构建，并且 CLI 构建产物可以启动”的状态。

已确认事实：

- `src/` 中缺失的相对模块已经归零
- 技能资源缺失已经归零
- 项目可以完整构建出 `dist/`
- 构建产物可以启动 CLI
- `--help` 和 `--version` 已实际验证

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

以下条目只表示当前源码中可以直接确认存在对应模块、注册项，或已经补齐了对应实现链路。

只有下面这些事项做过直接运行验证：

- `node scripts/check-restored-src.js`
- `npm run build:restored`
- `node restored-src/dist/entrypoints/cli.js --help`
- `node restored-src/dist/entrypoints/cli.js --version`

除此之外，本节内容都属于源码层面的确认，不等于已经完成完整的端到端验证。

在核心系统层面，当前源码中可以明确确认存在：

- REPL 交互主链
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
- 本地 UDS 消息链路
- direct-connect / server 兼容链路

在工具注册表层面，当前源码中可以明确确认存在：

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

在斜杠命令注册表层面，当前源码中可以明确确认存在：

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

当前源码中仍然存在一批受 feature gate、环境变量、用户类型或平台条件控制的分支。这包括 assistant 流程、部分 remote/server 行为、部分 swarm 或团队协作能力，以及若干依赖运行环境的工具。这些路径是否在某个构建中实际生效，仍然取决于运行时配置。

## 已修复的关键链路

除了补齐缺失文件和构建链之外，这份恢复源码还将一批原本在运行时会直接掉空的模块替换成了兼容实现，包括：

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

这些模块在当前恢复树里已经不再只是占位文件。

## 提交范围

如果这个目录将用于源码提交，建议提交范围以源码和文档为主，而不是把生成产物和依赖目录一起提交。

通常应包含：

- `src/`
- `README.md`
- `README.en.md`
- `RESTORATION_REPORT.md`
- `package.json`

通常应排除：

- `dist/`
- `node_modules/`
- `vendor/`

## 边界与剩余差异

这份恢复源码现在已经可以构建和运行，但仍然不应被宣称为与原始完整项目完全等价。

当前主要边界包括：

- 一部分模块仍然是恢复阶段加入的兼容实现，而不是原始私有实现
- 一些受 feature gate 控制的分支还没有在当前环境下完成完整的端到端验证
- `server/direct-connect` 代码链已经在源码里补通，但当前环境中尚未完成真实 socket 级回归验证
- 一些第三方依赖目录仍然带有为恢复过程加入的兼容修补

更细的差异应以当前源码树本身的状态为准，而不是依赖外部文档推断。

## 说明

- 这个目录用于源码恢复、工程修复和技术分析
- 它不代表官方原始内部仓库
- 不应将恢复源码、生成产物和依赖目录视为等同于官方发布版本
