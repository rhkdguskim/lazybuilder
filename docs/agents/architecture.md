# Architecture — for agents modifying LazyBuilder itself

Read this before opening a PR against `src/`.

---

## 1. Layers (strict, inward-only deps)

```
┌──────────────────────────────────────────────────────┐
│  ui/        Ink + React + Zustand store              │
│             ↓ depends on                             │
│  application/   services that orchestrate use cases  │
│             ↓ depends on                             │
│  domain/    pure types, enums, diagnostic rules      │
│             ↑ infrastructure depends on              │
│  infrastructure/   process I/O, detectors, parsers,  │
│                    adapters, scanners, updater       │
└──────────────────────────────────────────────────────┘
```

Forbidden imports (CI must enforce, P0):

| from | to | OK? |
|---|---|---|
| `domain/**` | anything outside `domain/` | ❌ never |
| `application/**` | `ui/**` | ❌ never |
| `application/**` | `infrastructure/**` | ⚠️ via interface (port) only |
| `infrastructure/**` | `domain/**` | ✅ |
| `ui/**` | anything | ✅ |

> Today, `application/*Service.ts` imports concrete adapters/detectors. The P0 test-harness PR introduces ports (`src/infrastructure/ports/`) and inverts that dep. Until then, treat the existing imports as legacy and avoid adding new ones.

---

## 2. Module map

```
src/
├── App.tsx                     # Root Ink component, boot orchestration, global keys
├── main.tsx                    # Process bootstrap, alt-screen, flicker-free stdout
│
├── domain/
│   ├── enums.ts                # Severity, BuildSystem, ProjectType, BuildStatus, LogLevel, …
│   ├── models/
│   │   ├── EnvironmentSnapshot.ts
│   │   ├── ProjectInfo.ts      # also SolutionInfo
│   │   ├── BuildProfile.ts
│   │   ├── BuildResult.ts      # also BuildDiagnostic
│   │   ├── DiagnosticItem.ts
│   │   ├── LogEntry.ts
│   │   ├── ToolInfo.ts
│   │   ├── SdkInfo.ts
│   │   └── index.ts
│   └── rules/
│       ├── dotnetRules.ts
│       ├── msbuildRules.ts
│       ├── cppRules.ts
│       ├── cmakeRules.ts
│       ├── restoreRules.ts
│       ├── environmentRules.ts
│       └── index.ts
│
├── config/
│   └── timeouts.ts             # central TIMEOUTS bucket — env-overridable via LAZYBUILDER_TIMEOUT_*
│
├── infrastructure/
│   ├── logging/
│   │   └── Logger.ts           # NDJSON structured logger (trace..fatal), child bindings
│   ├── process/
│   │   ├── ProcessRunner.ts    # spawn + tree-kill, single seam for subprocess I/O
│   │   └── DevShellRunner.ts   # vcvarsall/VsDevCmd .bat wrapping
│   ├── detectors/
│   │   ├── DotnetDetector.ts
│   │   ├── MsBuildDetector.ts
│   │   ├── VisualStudioDetector.ts    # uses vswhere
│   │   ├── CppToolchainDetector.ts
│   │   ├── WindowsSdkDetector.ts
│   │   ├── CMakeDetector.ts
│   │   ├── PackageManagerDetector.ts
│   │   └── index.ts
│   ├── scanners/
│   │   ├── FileScanner.ts             # fast-glob walk
│   │   ├── SolutionFileParser.ts      # .sln text format
│   │   └── ProjectFileParser.ts       # fast-xml-parser
│   ├── adapters/
│   │   ├── BuildAdapter.ts            # interface + ResolvedCommand
│   │   ├── DotnetAdapter.ts
│   │   ├── MsBuildAdapter.ts
│   │   ├── CppMsBuildAdapter.ts       # .vcxproj specifics
│   │   ├── CMakeAdapter.ts
│   │   └── index.ts
│   ├── parsers/
│   │   ├── DotnetOutputParser.ts
│   │   ├── MsBuildOutputParser.ts
│   │   ├── CMakeOutputParser.ts
│   │   └── index.ts
│   └── updater/
│       └── UpdateChecker.ts
│
├── application/
│   ├── EnvironmentService.ts          # 2-phase parallel detection
│   ├── ProjectScanService.ts
│   ├── BuildService.ts                # adapter pick → DevShell? → run → parse → BuildResult
│   └── DiagnosticsService.ts
│
└── ui/
    ├── tabs/                          # 8 tabs (one .tsx each)
    │   └── build/                     # BuildTab decomposed: target list / settings / action bar /
    │                                  # preview / output panel / FieldRow / DiagnosticPreview
    │                                  # plus useBuildTargets + useBuildController hooks
    ├── components/                    # 12 reusable Ink components
    ├── hooks/                         # useTabNavigation, useEnvironmentScan, …
    ├── navigation/                    # pure reducers (only place with real tests today)
    ├── store/useAppStore.ts           # single Zustand store
    ├── utils/                         # text + duration formatters
    └── themes/colors.ts
```

---

## 3. Where to add a thing (cheat sheet)

| Adding … | Touch | Add tests in |
|---|---|---|
| New tool detection (e.g., Bazel) | `infrastructure/detectors/BazelDetector.ts` + `EnvironmentSnapshot` field + `EnvironmentService` | `detectors/__tests__/BazelDetector.test.ts` |
| New project type | `domain/enums.ts` `ProjectType` + `infrastructure/scanners/ProjectFileParser.ts` + an adapter | scanner + adapter tests |
| New build system | `infrastructure/adapters/<Name>Adapter.ts` + register in `BuildService` constructor | adapter test (canHandle + resolveCommand) |
| New diagnostic rule | `domain/rules/<area>Rules.ts` (one new function) + `DiagnosticsService` already calls it | snapshot golden test |
| New parser pattern | `infrastructure/parsers/<system>OutputParser.ts` | log fixture in `tests/fixtures/buildLogs/` |
| New tab | `ui/tabs/<Name>Tab.tsx` + `App.tsx` register + `TabId` enum + store fields | E2E ink-testing-library scenario |
| New CLI subcommand | `src/cli/<name>.ts` (P0 introduces this dir) + `bin/lazybuilder.js` dispatch | CLI integration test |
| New JSON kind | `docs/agents/output-schemas.md` + `domain/models/<Kind>.ts` + emitter in `src/cli/<cmd>.ts` | snapshot test |

---

## 4. The single subprocess seam

`ProcessRunner` (`src/infrastructure/process/ProcessRunner.ts`) is the **only** place that calls `child_process.spawn`. `DevShellRunner` extends it. `runCommand()` is a one-shot helper.

When the test harness lands (P0):

```ts
// src/infrastructure/ports/CommandPort.ts
export interface CommandPort {
  run(cmd: string, args: string[], opts?: RunOpts): Promise<CommandOutput>;
  spawn(cmd: string, args: string[], opts?: RunOpts): RunnerHandle;
}
```

All detectors take a `CommandPort` in their constructor (defaulting to a `NodeCommandPort` that wraps `ProcessRunner`). Tests inject a `FakeCommandPort` that returns canned output for known argv.

Until then: don't add new direct `spawn` calls outside `ProcessRunner`. Adding one will block PR review.

---

## 5. Boot sequence (current)

```
main.tsx
 ├─ alt-screen on, hide cursor
 ├─ install signal handlers (cleanup on exit/SIGINT/SIGTERM/uncaught)
 ├─ create flicker-free Writable wrapping stdout
 └─ render(<App />, { stdout: stableStream, exitOnCtrlC: true })
        │
        └─ App.tsx
             ├─ useEnvironmentScan()  ─┐
             ├─ useProjectScan()       ├─ both run in parallel via Promise.allSettled
             ├─ Background UpdateChecker.check()
             └─ when both scans done → DiagnosticsService.analyze() → setDiagnostics + bootCompleted
```

After `bootCompleted`: tabs appear, all 8 tabs are mounted (`display: none` on inactive ones — this is intentional, prevents re-mount cost on tab switch).

Flicker-free output: `\x1b[H` + content + per-line `\x1b[K` + final `\x1b[0J`. Do not "simplify" this without the E2E PTY harness in place.

---

## 6. State

Single Zustand store: `src/ui/store/useAppStore.ts`. Slices:

- Tab nav (`activeTab`)
- Boot (`bootCompleted`)
- Environment scan (`snapshot`, `envScanStatus`)
- Project scan (`projects`, `solutions`, `projectScanStatus`)
- Diagnostics
- Build (status, result, history, settings, cancel fn)
- Logs (`logEntries`, ring-buffered to 50000)

Rules:

1. Setters are functional and isolated. Never mutate; always `set({...})`.
2. Build settings (target/config/platform/verbosity/parallel/devshell) live in the store so they survive tab switches.
3. `buildCancelFn` is the only function held in the store — it's there so the global `q` handler in `App.tsx` can cancel an in-flight build before exiting.

---

## 7. Test harness (target state)

Today: 1 real test file (`navigation/controls.test.ts`) + 1 stub (`ui/tabs/lazygit-controls.test.tsx` is empty).

Target (5-PR plan, in `agent.md` and the harness-engineering plan):

```
src/infrastructure/ports/        # interfaces — domain-friendly
test-harness/
├── fakes/                       # FakeCommandPort, FakeFileSystemPort, FixedClock, FakeEnv
├── fixtures/
│   ├── envSnapshots/*.json      # vs2019-with-cpp.json, dotnet-only.json, broken.json
│   ├── solutions/*.sln          # mini real-text fixtures
│   ├── csprojs/*.csproj
│   ├── vcxprojs/*.vcxproj
│   ├── buildLogs/*.txt          # captured real build output
│   └── cmd-outputs/             # vswhere.json, dotnet-info.txt, …
├── builders/                    # ProjectInfoBuilder, SnapshotBuilder, LogStreamBuilder
└── e2e/                         # ink-testing-library scenarios + optional PTY tests
```

Levels (see harness engineering plan):

- **L2** Domain rules + parsers (golden tests, instant)
- **L3** Adapters + Detectors (FakeCommandPort)
- **L4** Application services (full path, fake I/O)
- **L5** TUI E2E (ink-testing-library) + 1–2 PTY tests for ANSI regressions

---

## 8. Public API (planned)

Once headless CLI ships, `package.json` will declare:

```jsonc
{
  "exports": {
    ".":             { "import": "./dist/index.js" },
    "./services":    { "import": "./dist/application/index.js" },
    "./models":      { "import": "./dist/domain/models/index.js", "types": "./dist/domain/models/index.d.ts" },
    "./enums":       { "import": "./dist/domain/enums.js",       "types": "./dist/domain/enums.d.ts" }
  }
}
```

`dist/index.ts` will re-export `EnvironmentService`, `ProjectScanService`, `DiagnosticsService`, `BuildService`. This lets bots embed LazyBuilder as a library when CLI roundtrip is too slow.

---

## 9. Observability

### 9.1 Status

| Feature | Status |
|---|---|
| Structured NDJSON logger (`logger` in `src/infrastructure/logging/Logger.ts`) | ✅ shipped |
| Daily-rotated default log file (`~/.lazybuilder/logs/lazybuilder-YYYYMMDD.ndjson`) | ✅ shipped |
| Env-controlled level (`LAZYBUILDER_LOG_LEVEL`) | ✅ shipped |
| Explicit file override (`LAZYBUILDER_LOG_FILE`) | ✅ shipped |
| stderr mirroring (`LAZYBUILDER_LOG_STDERR=1`) | ✅ shipped |
| Instrumented points: `ProcessRunner` spawn/exit/timeout, `EnvironmentService` per-detector failures, `uncaughtException`/`unhandledRejection` | ✅ shipped |
| Adapter / UpdateChecker / Scanner instrumentation | 🚧 next pass |
| PII redaction (PATH, USERNAME, hostname masking) | 🔭 future |
| `--debug` CLI flag wiring | 🔭 future (P1) |

### 9.2 Usage

```ts
import { logger } from '../infrastructure/logging/Logger.js';
const log = logger.child({ component: 'MsBuildDetector' });
log.info('detected msbuild', { path, version });
log.warn('msbuild missing on PATH');
log.error('parse failed', errToLog(err));
```

Each call appends one NDJSON line: `{ ts, level, msg, component: 'MsBuildDetector', ... }`. Defaults are TUI-safe (file-only); set `LAZYBUILDER_LOG_STDERR=1` only when you control stdout/stderr (CI, headless invocation).

### 9.3 Log levels — when to use what

| Level | Use for |
|---|---|
| `trace` | Per-line stream events, very high cardinality |
| `debug` | Spawn arguments, parsed env keys, adapter command resolution |
| `info` | Boot complete, scan result, build result summary |
| `warn` | Detector timeout, parser blind spot, missing optional tool |
| `error` | Recoverable failure that the user should see |
| `fatal` | Process is exiting (`uncaughtException` only) |
| `silent` | Disable all logging (test environments) |

---

## 10. Cross-platform notes

| Concern | Behavior |
|---|---|
| Windows codepage | `ProcessRunner` prepends `chcp 65001 >nul` when `shell=true && forceUtf8=true` |
| Path separators | `node:path` in cross-platform code; `\\` only inside `DevShellRunner` strings |
| `vswhere` | Ships with VS Installer at `%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe` |
| Tree kill | `tree-kill` package (`SIGTERM` then `SIGKILL` fallback) |
| Linux/macOS | Detectors degrade to `null` for VS, `cl.exe`, vcvars; .NET / CMake / Ninja still work |
| Boot on non-TTY | TUI must not enter alt-screen; agent mode short-circuits before `main.tsx` alt-screen calls (P0 work) |

---

## 11. Style & lint

- TypeScript `strict` everywhere. No `any` without an inline `// eslint-disable-next-line` and a comment.
- ESM throughout (`"type": "module"`). Use `.js` import suffixes in source (NodeNext requirement).
- React: function components, hooks. No class components.
- Ink: avoid `useStdout().write` — use `<Text>`/`<Box>`. Direct stdout writes break the flicker-free stream.
- Comments: only when *why* is non-obvious. The flicker logic in `main.tsx` is a good example. Most files should have zero comments.
- **No hard-coded timeouts.** Use a `TIMEOUTS.<bucket>` from `src/config/timeouts.ts`. PR review will reject `{ timeout: 5000 }` in favor of `{ timeout: TIMEOUTS.QUICK_PROBE }`.
- **No `console.*` in src/.** Use `logger.child({ component: '<X>' })` and one of the level methods. Exception: `bin/lazybuilder.js` shim is allowed to write directly to stderr for fatal pre-boot failures.

---

## 12. Versioning

- Binary: SemVer in `package.json`.
- Schema: `lazybuilder/v1` independent of binary version. v1 ships for at least one major; v2 lives alongside v1 for one minor.
- TUI hotkeys are part of the user contract — changing them is a minor bump and must be in CHANGELOG.
