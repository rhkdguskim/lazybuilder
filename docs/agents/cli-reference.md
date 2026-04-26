# CLI Reference

## Status legend
- ✅ **shipped** — works against current `dist/`
- 🚧 **planned (P0)** — locked spec, not yet implemented
- 🔭 **future** — design sketch, may change

---

## 1. Invocation forms

```bash
lazybuilder                       # ✅ TUI mode (default when stdin is TTY and no subcommand)
lazybuilder <subcommand> [flags]  # 🚧 Headless mode (P0 — partial today)
lazybuilder --version, -v         # ✅ prints version, exits 0
lazybuilder --help, -h            # ✅ prints summary, exits 0
lazybuilder --check-update        # ✅ JSON envelope `UpdateCheck`, exits 0
lazybuilder --update              # ✅ JSON envelope `UpdateResult`, runs npm/git update
lazybuilder --help <subcommand>   # 🚧 prints subcommand help
```

The bin file is `bin/lazybuilder.js`. The `--version`, `--help`, `--check-update`, `--update` flags are dispatched **before** the TUI is bootstrapped and never enter alt-screen mode.

---

## 2. Global flags (apply to every subcommand)

| Flag | Type | Default | Meaning |
|---|---|---|---|
| `--json` | bool | auto when not TTY | Emit a JSON envelope on stdout |
| `--ndjson-stream` | bool | false | Emit one JSON envelope per line (for builds, scans of large repos) |
| `--no-update-check` | bool | true in agent mode | Skip the GitHub update probe |
| `--cwd <path>` | string | `process.cwd()` | Change working directory before running |
| `--log-level <level>` | enum | `info` | `debug \| info \| warn \| error` — written to stderr only |
| `--no-color` | bool | respects `NO_COLOR` | Strip ANSI colors |
| `--schema <ver>` | string | `v1` | Pin the output envelope schema; mismatch ⇒ exit 5 |
| `--timeout <ms>` | number | per-subcommand | Override default timeout |

Agent mode auto-enables `--json --no-update-check --no-color` when **any** of `CI=1`, `LAZYBUILDER_AGENT=1`, or non-TTY stdout is true.

---

## 3. Subcommands

### 3.1 `scan env`     🚧 planned

Detect installed tools/SDKs/toolchains.

```bash
lazybuilder scan env [--json]
```

| Output kind | `EnvironmentSnapshot` |
|---|---|
| Default exit | 0 (always — even with no tools detected) |
| Typical duration | 1–3s on Windows, < 1s on Linux/macOS |
| Idempotent | Yes |

### 3.2 `scan projects`     🚧 planned

Walk a directory and classify every solution/project found.

```bash
lazybuilder scan projects [PATH] [--depth N] [--json]
```

| Flag | Default | Meaning |
|---|---|---|
| `PATH` | `.` | Root directory to walk |
| `--depth` | unlimited | Max walk depth |
| `--ignore <glob>` | (built-in: `node_modules`, `bin`, `obj`, `dist`, `.git`) | Additional ignore globs (repeatable) |

| Output kind | `ProjectScanReport` (`{projects: ProjectInfo[], solutions: SolutionInfo[]}`) |
|---|---|

### 3.3 `inspect`     🚧 planned

Deep info for a single project file.

```bash
lazybuilder inspect <PATH> [--json]
```

`PATH` may be a `.sln`, `.csproj`, `.vcxproj`, or `CMakeLists.txt`.

| Output kind | `ProjectInfo` (with `recommendedCommand`, `requiredTools[]`, `riskFlags[]`) |
|---|---|

### 3.4 `diagnose`     🚧 planned

Run `scan env` + `scan projects` + diagnostic rules in one shot.

```bash
lazybuilder diagnose [PATH] [--json] [--severity <min>]
```

| Flag | Default | Meaning |
|---|---|---|
| `--severity` | `warning` | Minimum severity to report (`ok \| warning \| error`) |

| Output kind | `DiagnoseReport` (`{env, projects, solutions, diagnostics}`) |
|---|---|
| Exit code | 0 if no errors; 2 if any `severity=error` for a missing required tool |

### 3.5 `build`     🚧 planned

Resolve and execute a build via the right adapter (dotnet / msbuild / cpp-msbuild / cmake).

```bash
lazybuilder build <TARGET> \
  [-c|--configuration Release] \
  [-p|--platform x64] \
  [-v|--verbosity normal] \
  [--target <msbuild-target>]   \
  [--parallel | --no-parallel]  \
  [--restore | --no-restore]    \
  [--binary-log] \
  [--dev-shell | --no-dev-shell] \
  [--profile <name>]            \
  [--ndjson-stream]
```

| Flag | Default | Meaning |
|---|---|---|
| `TARGET` | required | Path to `.sln` / `.csproj` / `.vcxproj` / `CMakeLists.txt` |
| `-c, --configuration` | `Debug` | Configuration name |
| `-p, --platform` | `x64` (or `Any CPU` for SDK projects) | Build platform |
| `-v, --verbosity` | `normal` | `quiet \| minimal \| normal \| detailed \| diagnostic` |
| `--target` | `Build` | MSBuild target (`Clean`, `Rebuild`, `Pack`, …) |
| `--parallel` | true | `/m` for MSBuild, `--parallel` for cmake |
| `--restore` | true for first build | `/restore` MSBuild, `dotnet restore` first |
| `--binary-log` | false | Emit `msbuild.binlog` next to project |
| `--dev-shell` | auto for C++/MSBuild | Wrap in vcvarsall/VsDevCmd |
| `--profile` | none | Load a saved profile from `~/.lazybuilder/profiles/<name>.json` |
| `--ndjson-stream` | false | Stream one envelope per stdout line |

| Output kind (final) | `BuildResult` |
|---|---|
| Stream kinds (`--ndjson-stream`) | `BuildLog`, `BuildEvent`, `BuildResult` |
| Exit code | 0 on success, 3 on compile failure, 4 on cancel, 2 if required tool missing |

Cancel: send `SIGINT` once for graceful, twice for hard kill (the second triggers `tree-kill -SIGKILL`).

### 3.6 `self-check`     🚧 planned

Headless health probe for CI and support tickets.

```bash
lazybuilder self-check [--json]
```

Exits 0 if the binary boots, env scan completes, and the schema version is honored. Used as a smoke test in CI matrices.

### 3.7 `profile`     🔭 future

Manage saved build profiles.

```bash
lazybuilder profile list
lazybuilder profile save <name> --target ... -c ...
lazybuilder profile show <name>
lazybuilder profile delete <name>
```

### 3.8 `history`     🔭 future

Read persisted build history.

```bash
lazybuilder history list [--limit N] [--json]
lazybuilder history show <id> [--json]
```

### 3.9 (default, no subcommand) — TUI     ✅ shipped

Full interactive UI. Boots, scans, runs diagnostics, lets the user navigate 8 tabs. See `README.md` § Tabs.

---

## 4. Exit codes (locked)

| Code | Meaning | Set by |
|---|---|---|
| 0 | OK | success path |
| 1 | Generic / unhandled | unhandled exception |
| 2 | Required tool missing | a `requiredTool` couldn't be detected for the target |
| 3 | Build failed | adapter returned non-zero, parser found errors |
| 4 | Build cancelled | SIGINT received, user pressed `Esc` |
| 5 | Schema mismatch | caller passed `--schema vN` and the binary doesn't speak it |
| 64 | Usage error | unknown flag, missing required positional arg |

These are **stable**. Adding a new code is allowed (e.g., 6, 7); reusing or repurposing existing codes is forbidden.

---

## 5. Environment variables

| Var | Effect |
|---|---|
| `LAZYBUILDER_AGENT=1` | Force agent mode (JSON, no update check, no TUI) |
| `LAZYBUILDER_HOME` | Override config dir (default: `~/.lazybuilder`) |
| `LAZYBUILDER_LOG_LEVEL` | Same as `--log-level` |
| `LAZYBUILDER_NO_UPDATE_CHECK=1` | Skip update probe |
| `LAZYBUILDER_SCHEMA` | Default schema version |
| `CI` | Treated as agent mode |
| `NO_COLOR` | Strip ANSI colors |
| `LAZYBUILDER_DEV_SHELL_DEBUG=1` | Print the generated `.bat` on stderr |

---

## 6. stdout / stderr discipline

| Stream | Content |
|---|---|
| stdout | **Only** the JSON envelope (or NDJSON lines, or TUI frames). Never log lines. |
| stderr | Logs (`--log-level`), warnings, the `update available` banner in TUI mode |
| exit | The exit code (see § 4) |

Agents must parse stdout. They may surface stderr to humans but never to schema-aware logic.

---

## 7. Compatibility promise (v1)

For any envelope tagged `lazybuilder/v1`:

- Documented fields will not be removed.
- Documented fields will not change type.
- New fields may be added; agents must ignore unknown fields.
- Enum values may be added; agents must handle unknown values defensively (treat as `unknown` severity, etc.).
- Breaking change ⇒ bump to `lazybuilder/v2`. Both versions ship side by side for at least one minor release.

If you (an agent) detect a v1 envelope missing a documented required field, that is a bug — report with the offending payload.
