# restored-src

[简体中文](./README.md) | [English](./README.en.md)

`restored-src` is the recovered source tree in this repository, intended for continued repair, review, and source-level submission.

This is not the original internal repository. It is a reconstructed Claude Code `2.1.88` source project recovered from the public npm package and source maps, then extended with additional file restoration, build fixes, and selected runtime compatibility implementations.

## Directory Overview

This directory exists to hold the recovered source tree itself.

Primary contents:

- `src/`: the recovered source code
- `package.json`: build and run scripts for the recovered source tree


## Current Status

This recovered source tree has moved from a state with missing files, missing assets, and an incomplete build chain to a state where it can be fully built and its CLI artifact can start.

Confirmed facts:

- Missing relative modules in `src/` are now zero
- Missing skill assets are now zero
- The project can build a complete `dist/`
- The build artifact can start the CLI
- `--help` and `--version` have been verified

Verified commands:

```bash
node scripts/check-restored-src.js
npm run build:restored
node restored-src/dist/entrypoints/cli.js --help
node restored-src/dist/entrypoints/cli.js --version
```

Verified results:

- `missing relative modules: 0`
- `missing skill assets: 0`
- `build:restored` succeeded
- `--version` outputs `2.1.88 (Claude Code)`

## Build And Run

Requirements:

- Node.js `>= 18`

Build from the repository root:

```bash
npm run build:restored
```

Build from inside `restored-src/`:

```bash
npm run build
```

Run the built artifact from inside `restored-src/`:

```bash
npm run start
npm run help
npm run version
```

Or run it directly:

```bash
node dist/entrypoints/cli.js
```

## Capabilities Confirmed In Source

The items below only mean that the current source tree contains a corresponding module, registration entry, or repaired implementation chain.

Only the following items have been directly runtime-verified:

- `node scripts/check-restored-src.js`
- `npm run build:restored`
- `node restored-src/dist/entrypoints/cli.js --help`
- `node restored-src/dist/entrypoints/cli.js --version`

Everything else in this section is confirmed at the source level, not as a claim of full end-to-end validation.

At the core system level, the current source tree clearly contains:

- REPL interaction flow
- Streaming conversation and tool-call loop
- Context construction
- Permission system
- Hook system
- Session recovery
- Doctor diagnostics
- Automatic compaction
- Skill search and skill loading
- Session transcript persistence
- Background session management
- Local UDS message transport
- direct-connect / server compatibility chain

At the tool registry level, the current source tree clearly contains:

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

At the slash-command registry level, the current source tree clearly contains:

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

The source tree still contains branches controlled by feature gates, environment variables, user type, or platform-specific conditions. That includes areas such as assistant flows, parts of remote/server behavior, some swarm or team features, and several environment-dependent tools. Whether those paths are active in a given build still depends on the runtime configuration.

## Key Repaired Chains

In addition to restoring missing files and the build chain, this recovered source tree also replaces a number of former runtime stubs with compatibility implementations, including:

- `assistant/*`
- `services/contextCollapse/*`
- `services/compact/reactiveCompact.ts`
- `services/skillSearch/*`
- `services/sessionTranscript/sessionTranscript.ts`
- `cli/bg.ts`
- `utils/udsMessaging.ts`
- `utils/udsClient.ts`
- `utils/attributionHooks.ts`
- the direct-connect compatibility path inside `server/*`
- `utils/postCommitAttribution.ts`

These modules are no longer only placeholders in the restored tree.

## Submission Scope

If this directory is being prepared for a source submission, the recommended scope is source and documentation rather than generated output or dependencies.

Usually include:

- `src/`
- `README.md`
- `README.en.md`
- `RESTORATION_REPORT.md`
- `package.json`

Usually exclude:

- `dist/`
- `node_modules/`
- `vendor/`

## Boundaries And Remaining Gaps

This recovered source tree can now build and run, but it should not be claimed to be fully equivalent to the original complete project.

The main remaining boundaries are:

- Some modules are still restoration-time compatibility implementations rather than original private implementations
- Some feature-gated branches have not been fully validated end-to-end in the current environment
- The `server/direct-connect` chain has been restored in code, but not fully regression-tested with real socket-level validation in the current environment
- Some third-party dependency directories still contain compatibility patches added for the restoration process

More detailed differences should be judged from the current source tree state itself rather than assumed from external documentation.

## Notice

- This directory is for source restoration, engineering repair, and technical analysis
- It does not represent the original official internal repository
- The restored source tree, generated artifacts, and dependency directories should not be treated as equivalent to an official release
