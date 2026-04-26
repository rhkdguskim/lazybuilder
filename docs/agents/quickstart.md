# Quickstart — AI invoking LazyBuilder

## In one sentence
LazyBuilder tells an AI agent **what build tools exist on this machine, what projects exist in this directory, and runs builds with structured output**.

## The 3 invocations you will use 90% of the time

```bash
# 1) Probe machine + projects + diagnose gaps
lazybuilder diagnose --json

# 2) Inspect one project (recommend a build command, list deps)
lazybuilder inspect path/to/project.csproj --json

# 3) Execute a build with streaming structured logs
lazybuilder build path/to/project.sln -c Release -p x64 --ndjson-stream
```

> **Status**: the headless subcommand surface is in design (P0 roadmap). Until shipped, use the programmatic fallback at the bottom of this page or in `recipes.md`.

## Auto-detected agent mode

LazyBuilder treats the caller as an agent and switches to non-interactive output when **any** of:

- stdout is not a TTY (e.g., piped, captured by an agent)
- `CI=1` (or `CI=true`)
- `LAZYBUILDER_AGENT=1` (force, even on a real terminal)

In agent mode:

- `--json` is implied
- update check is skipped
- ANSI colors are disabled (`NO_COLOR` is also respected)
- the alternate-screen TUI is not entered

## Reading the output

Every machine-readable output is a single JSON envelope on stdout:

```json
{"schema": "lazybuilder/v1", "kind": "EnvironmentSnapshot", "data": { ... }}
```

For streaming builds (`--ndjson-stream`), each line is an envelope with `kind ∈ {BuildLog, BuildEvent, BuildResult}`.

See [`output-schemas.md`](output-schemas.md) for every `kind`.

## Exit codes — your contract

| Code | Meaning | Agent action |
|---|---|---|
| 0 | OK | Continue |
| 1 | Generic error | Surface stderr; do not retry |
| 2 | Required tool missing | Read `data.missingTools`; suggest install |
| 3 | Build failed (compile errors) | Parse `BuildResult.errors[]`; surface to human |
| 4 | Build cancelled | Inform user; safe to retry |
| 5 | Schema/protocol mismatch | Upgrade lazybuilder version |
| 64 | Usage error (bad flags) | Re-read this doc |

Rule of thumb: `exit ∉ {0, 3}` ⇒ environment problem, not a code problem.

## Decision flow

```
┌─────────────────────────┐
│ Have I scanned env yet? │
└──────────┬──────────────┘
           │ no
           ▼
┌─────────────────────────────┐
│ lazybuilder diagnose --json  │
└──────────┬──────────────────┘
           │
   ┌───────┴────────┐
   │ exit 2?        │── yes ──▶ install missing tool, ask user
   │ severity:err?  │── yes ──▶ surface, ask user
   └───────┬────────┘
           │ no/warnings only
           ▼
┌─────────────────────────────┐
│ lazybuilder inspect <project>│
└──────────┬──────────────────┘
           │
           ▼ recommendedCommand
┌─────────────────────────────────────────────────┐
│ lazybuilder build <target> ... --ndjson-stream   │
└──────────┬──────────────────────────────────────┘
           │
   ┌───────┴────────┐
   │ exit 0?        │── yes ──▶ done
   │ exit 3?        │── yes ──▶ parse errors[], surface
   │ exit 4?        │── yes ──▶ user cancelled
   └────────────────┘
```

## Programmatic fallback (until headless CLI ships)

Until the `scan / inspect / diagnose / build` subcommands land, drive the services directly from a one-shot Node script. The package exposes (today, via `dist/`) the application services:

```ts
// agent-driver.mjs
import { EnvironmentService } from 'lazybuilder/dist/application/EnvironmentService.js';
import { ProjectScanService } from 'lazybuilder/dist/application/ProjectScanService.js';
import { DiagnosticsService } from 'lazybuilder/dist/application/DiagnosticsService.js';

const env = await new EnvironmentService().scan();
const { projects, solutions } = await new ProjectScanService().scan(process.cwd());
const diagnostics = new DiagnosticsService().analyze(env, projects);

process.stdout.write(JSON.stringify({
  schema: 'lazybuilder/v1',
  kind: 'DiagnoseReport',
  data: { env, projects, solutions, diagnostics },
}));
```

> The `lazybuilder` package does not yet declare `exports` for these paths. Either run from inside the cloned repo, or vendor the dist. Recipe in `recipes.md` § "Programmatic fallback".

## Next reads

- Building a CI step? → [`harness-integration.md`](harness-integration.md) § CI integration
- Need exact flag spelling? → [`cli-reference.md`](cli-reference.md)
- Want a copy-pasteable workflow? → [`recipes.md`](recipes.md)
