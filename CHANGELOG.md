# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] — 2026-04-26

First major feature batch beyond the MVP — expansion from "build TUI" into a layered AI-first build/debug platform. All four phases (A–D) of the roadmap shipped or have a usable foothold.

### Added — Toolchain Resolver (Phase 0 + Phase 2)

#### Phase 0 — .NET MVP
- New module: detect missing .NET SDKs/runtimes/workloads from `global.json` + `.csproj` `<TargetFramework>` and propose → confirm → install via `dotnet-install.ps1` (cached 24 h at `~/.lazybuilder/cache/`).
- Side-by-side install (does not overwrite existing SDKs). User scope by default — no UAC prompt for the common path.
- New CLI flags (all emit `lazybuilder/v1` JSON envelopes): `--toolchain-plan`, `--toolchain-apply [--yes]`, `--toolchain-sync`, `--toolchain-doctor`.
- New TUI modal: from the Diagnostics tab, `i` opens the install flow (propose → confirm → progress → auto re-scan).
- Optional `global.json` update opt-in to pin the SDK version after a successful install.

#### Phase 2 — C++ / native toolchains (★ new)
- New `ToolchainKind` values: `msvc-toolset`, `windows-sdk`, `cmake`, `ninja`.
- `VsBuildToolsInstaller` wraps `vs_BuildTools.exe` with workload selection (`Microsoft.VisualStudio.Workload.VCTools` etc.). Machine scope, single UAC via elevated PowerShell.
- `WingetInstaller` drives CMake / Ninja / Windows SDK installs via `winget`.
- Rule engine extended to read `.vcxproj` `<PlatformToolset>` and `<WindowsTargetPlatformVersion>` and `cmake_minimum_required(VERSION ...)` from `CMakeLists.txt`.
- Same CLI flags and MCP tools work transparently for the new kinds.
- Spec: `docs/features/toolchain-phase2.md`.

### Added — MCP Server (Phase A)
- New `lazybuilder mcp` subcommand: stdio Model Context Protocol server.
- 16 tools registered:
  - `scan_environment`, `scan_projects`, `run_diagnostics`
  - `toolchain_plan`, `toolchain_apply` (requires `confirmedSteps[]` for safety)
  - `build`, `get_metrics`
  - 9 `debug.*` tools (see Debugger below)
- Spec: `docs/features/mcp-server.md`. Register example for Claude Code in `~/.claude/mcp.json`.

### Added — Build Intelligence (Phase B)
- Per-build metrics auto-recorded to `~/.lazybuilder/metrics-YYYYMMDD.ndjson` from `BuildService.execute()`.
- Regression detection (EWMA + 3σ on duration / errorCount / warningCount, n ≥ 10 minimum).
- Flaky-build detection (failureRate ∈ [0.1, 0.9] over the last 10 builds with the same fingerprint).
- New CLI flags: `--regressions`, `--flaky`, `--metrics-export [--format=ndjson|json]`.
- MCP tool `get_metrics` returns the same `BuildIntelligenceReport`.
- Spec: `docs/features/build-intelligence.md`.

### Added — LSP Server (Phase C-1 + C-3)
- New `lazybuilder lsp` subcommand: stdio Language Server Protocol.
- **Phase C-1**: `textDocument/diagnostic` (push + pull) and `textDocument/hover` for `.csproj`, `.fsproj`, `.vbproj`, `.vcxproj`, `global.json`.
- **Phase C-3 ★**: `textDocument/codeAction` quick-fixes for `DIAG003` (missing TFM SDK) and `DIAG002` (global.json mismatch). `workspace/executeCommand: lazybuilder.toolchain.apply` runs the resolver from inside the editor with `$/progress` streaming and auto re-publish of diagnostics on completion.
- 5-minute per-folder context cache; `workspace/didChangeConfiguration` invalidates.
- Concurrent `executeCommand` guard (one install in flight at a time).
- Specs: `docs/features/lsp-server.md` + `docs/features/lsp-codeaction.md`.

### Added — Debugger Phase D-1 MVP (★ new)
- DAP client (`Content-Length:` framed JSON-RPC) — chunk-boundary-safe parser, settle-once promise guard, timeout + cleanup.
- `netcoredbg` adapter — discovery (PATH → `~/.lazybuilder/cache/netcoredbg/`), `--interpreter=vscode` spawn.
- `DebuggerService` — single-session orchestrator with: `start` (`bin/<config>/<tfm>/<dll>` resolution + clear "build first" error), `set_breakpoint`, `continue`, `step_over/in/out`, `pause`, `evaluate`, `terminate`, and AI primitive `debug.snapshot` (stack + locals + source snippet in one call).
- New CLI: `lazybuilder debug start <project>` runs the full one-shot lifecycle.
- 9 MCP `debug.*` tools (see MCP Server).
- Specs: `docs/features/debugger-d1-mvp.md` (MVP scope) + `docs/features/debugger.md` (full roadmap to D-2/D-3/D-4).

### Added — Tests / Stability
- 163 unit tests added in a dedicated stabilization sprint (`8c101be`) covering toolchainRules, ToolchainService, MetricsStore, GlobalJsonManager, DotnetInstaller pure functions, LSP parsers/providers, MCP tool handlers.
- B-track sprint added 88 more tests across LSP codeAction, Toolchain Phase 2 installers, DAP client, DebuggerService, and MCP debug tools.
- Total: **254 passing tests** across 22 files.

### Added — Infrastructure / DX
- Centralized timeout buckets in `src/config/timeouts.ts` with env overrides via `LAZYBUILDER_TIMEOUT_*`.
- Structured NDJSON logger (`src/infrastructure/logging/Logger.ts`) with `trace..fatal` levels, child bindings, and daily-rotated default log file at `~/.lazybuilder/logs/lazybuilder-YYYYMMDD.ndjson`. Env knobs: `LAZYBUILDER_LOG_LEVEL`, `LAZYBUILDER_LOG_FILE`, `LAZYBUILDER_LOG_STDERR`.
- `EnvironmentService.scanWithDiagnostics()` returns per-detector failures (`DetectorFailure[]`) so a single hung tool no longer blocks boot.
- `unhandledRejection` handler routes through the structured logger.
- ESLint 9 flat config + Prettier 3 + new `lint:fix` / `format` / `format:check` scripts.
- `--pretty` global flag indents JSON envelope output for human reading.
- Unknown leading flags are rejected before the TUI bootstraps (no more silent typos).

### Changed
- `EnvironmentService.scan()` preserved for backwards compatibility, now delegates to `scanWithDiagnostics()`.
- `ProcessRunner` instruments spawn / error / exit / timeout via the logger.
- npm tarball is leaner: `agent.md` and `docs/agents/` are no longer published. README links out to GitHub.
- `BuildTab.tsx` decomposed from 848 LOC monolith into `src/ui/tabs/build/` with `useBuildTargets` + `useBuildController` hooks and 7 focused presentational components.
- TUI theme system overhaul: enterprise-grade tokens, unified scrollbars, focus correctness, colorblind-safe palette.
- Persistent UX state across launches: pinned/last-built target, project handoff, build-target search with arrow-key navigation.
- `bin/lazybuilder.js`: `--pretty`, `KNOWN_SUBCOMMANDS` typo guard, plus dispatch for `mcp`, `lsp`, `debug`, `--toolchain-*`, `--regressions`, `--flaky`, `--metrics-export`.

### Repo / CI
- New GitHub Actions workflows: `ci.yml` (typecheck + lint + format check + vitest + build, matrix Node 20/22 × ubuntu/windows/macos, plus a `pack-smoke` job that asserts `agent.md` and `docs/` are excluded from the tarball) and `release.yml` (auto-publishes to npm with provenance on `v*` tags).
- Dependabot enabled for npm and github-actions.
- New issue/PR templates and `CONTRIBUTING.md` + `SECURITY.md`.

### Removed
- Hard-coded timeout literals in detectors / updater / DevShellRunner.
- `console.error` in `main.tsx` — now uses `logger.fatal`.

## [0.1.1] — 2026-04-26

Initial published release. See `git log` for details.
