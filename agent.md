# agent.md — LazyBuilder for AI Agents

> Entry point for AI tools (Claude Code, Cursor, Codex, Aider, …) operating **on** this repo or **with** this binary.
> For Claude Code auto-loading, symlink or copy this file to `CLAUDE.md`. For OpenAI agentic tooling, use `AGENTS.md`. The content is the canonical source.
>
> **This file is not shipped in the published npm tarball** — it lives at the GitHub repo. Agents driving the installed `lazybuilder-cli` should fetch it from <https://github.com/rhkdguskim/lazybuilder/blob/master/agent.md>. The npm package only contains runtime code (`dist/`, `bin/`, `README.md`, `LICENSE`).

---

## 0. The 30-second mental model

**LazyBuilder** (`lazybuilder` / `lazybuilder`) is a TUI + headless CLI that:

1. **Detects** what is installed on this machine — .NET SDKs, MSBuild, Visual Studio, C++ toolchains, Windows SDK, CMake, Ninja, package managers.
2. **Scans** the current directory for `.sln`, `.csproj`, `.vcxproj`, `CMakeLists.txt` and classifies each project.
3. **Resolves** the right build command for each project (dotnet build / msbuild / cmake --build) including DevShell wrapping (vcvarsall, VsDevCmd) for C++.
4. **Executes** builds with streaming, parses output into structured errors/warnings, returns a `BuildResult`.
5. **Diagnoses** environment gaps (missing SDK, mismatched toolset, restore needed, …) with severity + suggested action.

For an AI agent, LazyBuilder is the **build-environment oracle and build executor** in a C++/C# development loop.

The fastest way to consume LazyBuilder from an AI agent is the **MCP server**: `lazybuilder mcp`. It exposes 7 tools (`scan_environment`, `scan_projects`, `run_diagnostics`, `toolchain_plan`, `toolchain_apply`, `build`, `get_metrics`) on stdio. See `docs/features/mcp-server.md` for details.

For a full vision (Phase A-D: MCP / Build Intelligence / LSP / Debugger), see `docs/features/roadmap.md`.

---

## 1. Three roles AI agents play with LazyBuilder

| Role | Question the agent answers | Subcommand (planned headless) |
|---|---|---|
| **Probe** | "Can this machine build X?" | `lazybuilder diagnose --json` |
| **Plan** | "What command should I run for project Y?" | `lazybuilder inspect Y --json` |
| **Execute** | "Build it and give me structured errors" | `lazybuilder build Z -c Release --ndjson-stream` |

Always invoke **headlessly** when the caller is an AI. The TUI is for humans only.

---

## 2. Status: what exists today vs the agent surface

| Capability | Status | How to use today |
|---|---|---|
| Interactive TUI | ✅ shipped | `lazybuilder` (no args) |
| Environment detection | ✅ shipped (in `EnvironmentService`) | Programmatic — see `docs/agents/recipes.md` § Programmatic fallback |
| Project scan | ✅ shipped (in `ProjectScanService`) | Programmatic |
| Build execution | ✅ shipped (in `BuildService`) | Programmatic |
| Output parsing | ✅ shipped (3 parsers) | Returned in `BuildResult` |
| Headless `scan / inspect / diagnose / build` subcommands | 🚧 **planned (P0)** — see `docs/agents/cli-reference.md` § Headless surface |
| JSON envelope `{schema, kind, data}` | ✅ shipped (toolchain, intelligence, mcp) | See `docs/agents/cli-reference.md` |
| NDJSON build stream | 🚧 planned | Spec in `docs/agents/cli-reference.md` |
| **Toolchain Resolver** (auto-install missing .NET SDK) | ✅ shipped | `lazybuilder --toolchain-plan / --toolchain-apply --yes / --toolchain-sync / --toolchain-doctor` |
| **Build Intelligence** (regression + flaky detection) | ✅ shipped | `lazybuilder --regressions / --flaky / --metrics-export` |
| **MCP Server** (AI tool surface) | ✅ shipped (16 tools) | `lazybuilder mcp` — register in Claude Code mcp.json |
| **LSP Server** (editor integration) | ✅ shipped (Phase C-1+C-3) | `lazybuilder lsp` — diagnostics, hover, codeAction (Install missing SDK) |
| **Toolchain Phase 2** (C++ / VS Build Tools / Windows SDK / CMake) | ✅ shipped | Same `--toolchain-*` flags, new step kinds: `msvc-toolset`, `windows-sdk`, `cmake`, `ninja` |
| **Debugger D-1** (DAP + netcoredbg + `debug.snapshot`) | ✅ shipped | `lazybuilder debug start <proj>` (CLI one-shot) + 9 MCP `debug.*` tools |
| **Debugger D-2** (AI primitives: run_until_exception, investigate_test, observe) | 📋 spec only | Next sprint, see `docs/features/debugger.md` |
| Programmatic ESM API export | 🔭 future | Spec in `docs/agents/architecture.md` § Public API |

> **If a section says "planned", do not assume the flag exists yet.** Use the programmatic fallback in `recipes.md`.

---

## 3. Critical conventions (do not violate)

1. **Layer dependencies flow inward only**: `ui → application → domain` and `infrastructure → domain`. Never `domain → infrastructure`. Never `application → ui`.
2. **All subprocess invocation goes through `ProcessRunner`** (`src/infrastructure/process/ProcessRunner.ts`). Do not call `child_process.spawn` directly outside this file (and `DevShellRunner` which extends it).
3. **JSON outputs are versioned**. Every machine-readable output is wrapped: `{"schema": "lazybuilder/v1", "kind": "...", "data": ...}`. Never break a v1 field; add new ones, then bump on breaking change.
4. **Path handling is Windows-aware**. Inside `DevShellRunner` use backslashes; everywhere else use `node:path`. Do not `import path from 'node:path/win32'` in cross-platform code.
5. **TUI rendering is delicate**. Do not modify `src/main.tsx` flicker-prevention logic without re-running the E2E harness. The `\x1b[H` + per-line `\x1b[K` + final `\x1b[0J` sequence is load-bearing.
6. **No new dependencies** without strong justification — the stack is intentionally small (Ink, React, Zustand, fast-glob, fast-xml-parser, tree-kill, chalk, figures).
7. **Build before `npm link`** — `postinstall` runs `npm run build` for a reason. Never publish or link without `dist/` populated.
8. **Timeouts use `TIMEOUTS`** from `src/config/timeouts.ts`. Never hard-code `{ timeout: <number> }` — pick a named bucket (`QUICK_PROBE`, `TOOL_VERSION`, `TOOL_LIST`, `NETWORK_READ`, `DEVSHELL_INIT`, `GIT_PULL`, `HEAVY_INSTALL`, `DETECTOR_BUDGET`, `REGISTRY_PROBE`) so operators can override via `LAZYBUILDER_TIMEOUT_<KEY>` env vars without recompiling.
9. **Logging goes through the `logger`** in `src/infrastructure/logging/Logger.ts`. Use `logger.child({ component: 'X' })` once per module; never `console.*` outside `bin/lazybuilder.js` (the TUI takes over stdout/stderr). Logs are NDJSON and land in `~/.lazybuilder/logs/lazybuilder-YYYYMMDD.ndjson` by default — see § 9 for env vars.
10. **Detectors must be self-healing**. Wrap any new detector in `EnvironmentService.scanWithDiagnostics()` via `runDetector()` so a single hung tool cannot block boot. Failures surface as `DetectorFailure[]`, not exceptions.

---

## 4. DO NOT touch list

| Path | Why |
|---|---|
| `dist/` | Build output, regenerated by `tsc`. Never hand-edit. |
| `package-lock.json` (mass diffs) | Only `npm install` should change it. Inspect carefully on review. |
| `bin/lazybuilder.js` | Hand-written shim that calls into `dist/main.js`. Do not auto-generate. |
| `install.sh` / `install.bat` | User-facing install paths. Coordinate before changing. |
| `src/main.tsx` flicker logic (lines marked "Flicker-free rendering") | Tested empirically across terminals. |

---

## 5. Quick decision tree for agent invocation

```
User intent → AI action
─────────────────────────────────────────────────────────────────
"Will this machine build my .NET 8 app?"
    → lazybuilder diagnose --json
    → filter data.diagnostics where severity ∈ {error, warning}

"Set up the build for this repo"
    → lazybuilder scan projects --json
    → for each project: lazybuilder inspect <path> --json
    → present recommendedCommand to user

"Build the solution in Release x64"
    → lazybuilder build <sln> -c Release -p x64 --ndjson-stream
    → on exit 3: read BuildResult.errors[], surface file:line:code
    → on exit 2: ask user to install missing SDK (data.missingTools)

"Why did my last build fail?"
    → load BuildResult JSON (from --json), present errors[0..3]
    → if BuildResult.errorCount > 0 but errors[] empty → parser blind spot,
      retry with -v detailed and re-parse

"Will this build on Linux/CI?"
    → lazybuilder diagnose --json --platform linux  (planned)
    → today: read snapshot, check os.name + dotnet presence + project type
```

---

## 6. How to read the codebase (agents modifying lazybuilder itself)

| Layer | Path | Touch when |
|---|---|---|
| Pure types & enums | `src/domain/models/`, `src/domain/enums.ts` | Adding a new field to a result/profile shape |
| Diagnostic rules | `src/domain/rules/*.ts` | Adding a new check (env/dotnet/msbuild/cpp/cmake/restore) |
| Process I/O | `src/infrastructure/process/` | NEVER add direct `spawn` calls; extend `ProcessRunner` |
| Detectors | `src/infrastructure/detectors/*Detector.ts` | Supporting a new tool/SDK |
| Scanners & parsers | `src/infrastructure/scanners/`, `src/infrastructure/parsers/` | Supporting a new project file type or build-output format |
| Build adapters | `src/infrastructure/adapters/*Adapter.ts` | Supporting a new build system; one adapter per build system |
| Application services | `src/application/` | Composing detectors/adapters into a use case |
| TUI | `src/ui/` | Visual changes only; logic belongs in `application/` |
| Store | `src/ui/store/useAppStore.ts` | Add fields with a setter; do not mutate inline |

Build / dev / test:

```bash
npm run dev         # tsx, hot dev
npm run build       # tsc → dist/
npm run typecheck   # tsc --noEmit
npm test            # vitest (sparse coverage today — see architecture.md)
npm run lint        # eslint
```

---

## 7. Doc index — read as needed

| File | When to read |
|---|---|
| [`docs/agents/quickstart.md`](docs/agents/quickstart.md) | First time you invoke LazyBuilder as a tool |
| [`docs/agents/cli-reference.md`](docs/agents/cli-reference.md) | Need exact flag, exit code, env var |
| [`docs/agents/output-schemas.md`](docs/agents/output-schemas.md) | Parsing JSON output, building a tool wrapper |
| [`docs/agents/recipes.md`](docs/agents/recipes.md) | Looking for a worked end-to-end example |
| [`docs/agents/harness-integration.md`](docs/agents/harness-integration.md) | Designing a multi-step AI dev loop around LazyBuilder |
| [`docs/agents/architecture.md`](docs/agents/architecture.md) | Modifying LazyBuilder's source code |
| [`docs/requirements.md`](docs/requirements.md) | Original product requirements (Korean, source of truth for product intent) |

---

## 8. Ground truth

When this doc and the code disagree, **the code wins**. The authoritative sources are:

- Shapes: `src/domain/models/*.ts`
- Enums: `src/domain/enums.ts`
- Service contracts: `src/application/*.ts`
- Timeouts: `src/config/timeouts.ts`
- Logger: `src/infrastructure/logging/Logger.ts`
- CLI behavior: `src/main.tsx` + `bin/lazybuilder.js` (today) → `src/cli/` (planned headless)

Update this file and the docs in the **same PR** as any behavior change. PRs that change behavior without doc updates will be rejected by review.

---

## 9. Operator knobs (env vars)

These let an agent or CI runner tune runtime behavior **without** rebuilding the binary. All are optional; defaults are tuned for "fast probe on a developer laptop".

### 9.1 Logging

| Var | Effect | Default |
|---|---|---|
| `LAZYBUILDER_LOG_LEVEL` | `trace \| debug \| info \| warn \| error \| fatal \| silent` | `info` |
| `LAZYBUILDER_LOG_FILE` | Explicit log file path; takes precedence over default location | `~/.lazybuilder/logs/lazybuilder-YYYYMMDD.ndjson` |
| `LAZYBUILDER_LOG_STDERR` | `1` to also mirror logs to stderr (TUI-unfriendly; use only outside the TUI) | off |

Each line is one NDJSON object: `{ ts, level, msg, component, ... }`. Grep / `jq` over the file when triaging.

### 9.2 Per-bucket timeouts

Override any value in `TIMEOUTS` (see `src/config/timeouts.ts`) via `LAZYBUILDER_TIMEOUT_<KEY>`. Useful on slow CI runners or hung-tool probes:

| Env var | Bucket | Default (ms) | Used by |
|---|---|---|---|
| `LAZYBUILDER_TIMEOUT_QUICK_PROBE` | `QUICK_PROBE` | 5 000 | `--version`, `where`/`which`, `git rev-parse` |
| `LAZYBUILDER_TIMEOUT_TOOL_VERSION` | `TOOL_VERSION` | 10 000 | dotnet/msbuild/npm view |
| `LAZYBUILDER_TIMEOUT_TOOL_LIST` | `TOOL_LIST` | 15 000 | `dotnet workload list`, `vswhere` |
| `LAZYBUILDER_TIMEOUT_NETWORK_READ` | `NETWORK_READ` | 15 000 | `git fetch` |
| `LAZYBUILDER_TIMEOUT_DEVSHELL_INIT` | `DEVSHELL_INIT` | 30 000 | vcvarsall / VsDevCmd warm-up |
| `LAZYBUILDER_TIMEOUT_GIT_PULL` | `GIT_PULL` | 60 000 | git-mode self-update |
| `LAZYBUILDER_TIMEOUT_HEAVY_INSTALL` | `HEAVY_INSTALL` | 180 000 | `npm install`, `npm run build` |
| `LAZYBUILDER_TIMEOUT_DETECTOR_BUDGET` | `DETECTOR_BUDGET` | 20 000 | per-detector ceiling in `EnvironmentService` |
| `LAZYBUILDER_TIMEOUT_REGISTRY_PROBE` | `REGISTRY_PROBE` | 3 000 | per-key Windows registry probes |

Invalid (non-numeric or ≤ 0) values are ignored — fallback wins.

### 9.3 Boot resilience contract

`EnvironmentService.scanWithDiagnostics()` runs every detector inside `runDetector(name, fn, DETECTOR_BUDGET)`:

- Each detector has a hard time budget; exceeding it produces `DetectorFailure { reason: 'timeout' }`, never a stuck UI.
- Other detectors continue regardless. Boot is **never** blocked by one bad tool.
- Failures are returned alongside the snapshot:
  ```ts
  const { snapshot, failures } = await new EnvironmentService().scanWithDiagnostics();
  ```
- Surface `failures[]` to the user in the Diagnostics tab (planned) or `diagnose --json` output (planned, P0).

The legacy `scan(): Promise<EnvironmentSnapshot>` is preserved for callers that don't care about partial failures, but new code should prefer `scanWithDiagnostics()`.
