# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A **source snapshot** of Anthropic's Claude Code CLI, extracted from a source map exposed in the npm package (2026-03-31). The development environment has been reconstructed with stubs for ~150 missing internal files and ~15 proprietary packages.

## Development Commands

```bash
bun install              # Install dependencies (first time)
bun run build            # Bundle CLI → dist/cli.js (24 MB, ~360ms)
bun run typecheck        # TypeScript check (strict mode relaxed; ~2500 residual errors from stub types)
bun run test             # Run tests (vitest, matches src/**/__tests__/**/*.test.ts)
bun dist/cli.js --help   # Run the built CLI
bun dist/cli.js -v       # Print version

# Build with custom version:
bun build src/entrypoints/cli.tsx --outdir=dist --target=bun \
  --define 'MACRO.VERSION="1.0.0"' \
  --define 'MACRO.BUILD_TIME="2026-03-31"' \
  --define 'MACRO.PACKAGE_URL="claude-code-snapshot"' \
  --define 'MACRO.NATIVE_PACKAGE_URL=""' \
  --define 'MACRO.FEEDBACK_CHANNEL=""' \
  --define 'MACRO.ISSUES_EXPLAINER=""' \
  --define 'MACRO.VERSION_CHANGELOG=""'

# Enable feature flags at runtime (for dev without Bun bundler):
FEATURES=BRIDGE_MODE,VOICE_MODE bun src/entrypoints/cli.tsx

# Regenerate stubs after source changes:
bun scripts/generate-stubs.ts    # Creates missing module stubs from tsc errors
bun scripts/fix-stub-exports.ts  # Adds named exports to stubs from bun build errors
```

## Project Structure

**Runtime:** Bun + TypeScript (strict). **Terminal UI:** React 19 + Ink. **CLI parsing:** Commander.js.

### Reconstructed Environment

| Directory | Purpose |
|---|---|
| `stubs/` | Local package stubs for proprietary Anthropic packages (`@ant/*`, `@anthropic-ai/*`) and native modules (`color-diff-napi`, etc.) |
| `shims/` | Type declarations for `bun:bundle`, `MACRO.*` globals, and internal packages |
| `scripts/` | `generate-stubs.ts` and `fix-stub-exports.ts` for maintaining stubs |

### Core Entry Points

- `src/entrypoints/cli.tsx` — Bootstrap entrypoint. Fast-paths for `--version`, `--dump-system-prompt`, MCP servers, bridge mode, daemon mode, background sessions. Falls through to `src/main.tsx` for full CLI.
- `src/main.tsx` — Full CLI setup (~800K lines). Parallel prefetches (MDM, keychain, GrowthBook) before heavy imports.
- `src/QueryEngine.ts` — LLM API call engine. Streaming, tool-call loops, thinking mode, retries, token counting.
- `src/Tool.ts` — Base types/interfaces for all tools (input schemas, permission models).
- `src/tools.ts` — Tool registry. Conditional imports gated on feature flags and `USER_TYPE`.
- `src/commands.ts` — Command registry (~50 slash commands). Same conditional import pattern.
- `src/bootstrap/state.ts` — Centralized mutable state store for the session.

### Key Subsystems

| Directory | Purpose |
|---|---|
| `src/tools/` | Each tool is a self-contained module with input schema, permission model, and execution logic |
| `src/commands/` | Slash command implementations |
| `src/services/` | External integrations: API client (`api/`), MCP (`mcp/`), OAuth (`oauth/`), LSP (`lsp/`), analytics, compact, policy limits |
| `src/hooks/` | React hooks including the permission system (`toolPermission/`) |
| `src/components/` | ~140 Ink UI components |
| `src/bridge/` | Bidirectional IDE communication (VS Code, JetBrains) via JWT-authenticated messaging |
| `src/coordinator/` | Multi-agent orchestration |
| `src/skills/` | Reusable workflow system executed through SkillTool |
| `src/entrypoints/sdk/` | SDK type schemas (Zod v4). `coreSchemas.ts` and `controlSchemas.ts` are the source of truth for all SDK types. |
| `src/constants/` | Product URLs, API beta headers, tool limits, system prompts |
| `src/utils/` | ~330 utility files |

### Design Patterns

- **Build-time macros:** `MACRO.VERSION`, `MACRO.BUILD_TIME`, `MACRO.PACKAGE_URL` etc. are inlined via `bun build --define`.
- **Feature flags via `bun:bundle`:** `feature('PROACTIVE')`, `feature('KAIROS')`, `feature('BRIDGE_MODE')`, `feature('VOICE_MODE')`, `feature('AGENT_TRIGGERS')`, etc. (~90 flags). Gated modules are conditionally `require()`'d. In dev, all flags default to `false` via `shims/bun-bundle.ts`.
- **Ant-only code:** Some tools/commands are gated on `process.env.USER_TYPE === 'ant'`.
- **Lazy requires:** Circular dependency breaks use `const getFoo = () => require(...)` extensively.
- **Parallel prefetch at startup:** MDM subprocess, keychain reads, and API preconnect fire before heavy module evaluation.
- **Schema validation:** Zod v4. SDK types in `src/entrypoints/sdk/` are generated from Zod schemas via `scripts/generate-sdk-types.ts` (not included).
- **Protocols:** MCP SDK for tool servers, LSP for language intelligence.

### Permission System

`src/hooks/toolPermission/` — Every tool invocation goes through permission checks. Modes: `default`, `plan`, `bypassPermissions`, `auto`.

### Known Limitations

- **~150 stub files** exist in `src/` for modules missing from the source map extraction (marked with "Stub:" comments). These export `any` and will cause runtime errors if their code paths are hit.
- **TypeScript strict mode is relaxed** (`noImplicitAny: false`, `strictNullChecks: false`) because stub types don't match the real signatures.
- **Proprietary packages** (`@ant/*`, `@anthropic-ai/sandbox-runtime`, `@anthropic-ai/mcpb`, etc.) are replaced with empty stubs in `stubs/`.
- **Native modules** (`color-diff-napi`, `modifiers-napi`, `audio-capture-napi`) are stubbed — features requiring them (structured diffs, modifier key detection, voice input) won't work.
