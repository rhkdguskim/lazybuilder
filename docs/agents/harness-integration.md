# Harness Integration — LazyBuild as a tool inside an AI dev loop

This page is the answer to: *"how do we make LazyBuild a first-class tool in an AI-driven C++/C# development workflow, at enterprise scale?"*

---

## 1. The mental model

LazyBuild is one of three "compile-time" tools an AI agent needs when developing C++/C#:

```
┌─────────────────────────────────────────────────────────────────┐
│  The AI dev loop                                                │
├─────────────────────────────────────────────────────────────────┤
│  EDIT          ←── code editor / agent edits files              │
│   │                                                             │
│   ▼                                                             │
│  COMPILE       ←── LazyBuild  (this tool) ◀── env oracle, too   │
│   │                                                             │
│   ▼                                                             │
│  TEST          ←── dotnet test / ctest                          │
│   │                                                             │
│   ▼                                                             │
│  REVIEW        ←── lint, code review, security                  │
└─────────────────────────────────────────────────────────────────┘
```

The agent reaches for LazyBuild whenever it needs to **answer a question that depends on the local toolchain or build state**.

LazyBuild does **not**:
- run tests (delegate to `dotnet test`, `vstest`, `ctest`)
- format / lint code
- manage source control
- manage NuGet/vcpkg installation (it can detect, not install)

This narrowness is a feature, not a limitation. It keeps the contract small.

---

## 2. Where LazyBuild plugs in (5 surfaces)

| # | Surface | Who calls it | When |
|---|---|---|---|
| 1 | **Local agent (Claude Code, Cursor)** | the IDE-side agent | Per-edit verify, per-task probe |
| 2 | **PR review bot** | CI, GitHub action | "does this branch build on a clean machine" |
| 3 | **CI build step** | GitHub Actions / Azure DevOps | Every push |
| 4 | **Onboarding bot** | new-engineer setup script | "is my laptop ready" |
| 5 | **Triage agent** | issue-bot | "user reported a build error — reproduce" |

Each surface uses the same headless contract; only the orchestration differs.

---

## 3. Local agent integration (Claude Code, Cursor, Aider)

### 3.1 Tool definition (Claude API tool-use shape)

```jsonc
[
  {
    "name": "lazybuild_diagnose",
    "description": "Probe build environment and project state. Returns a DiagnoseReport with env, projects, solutions, and diagnostics. Call this before suggesting any build command.",
    "input_schema": {
      "type": "object",
      "properties": {
        "path":     { "type": "string", "description": "Repo root (default: cwd)" },
        "severity": { "type": "string", "enum": ["ok","warning","error"], "default": "warning" }
      }
    }
  },
  {
    "name": "lazybuild_inspect",
    "description": "Inspect a single project file (sln/csproj/vcxproj/CMakeLists.txt). Returns ProjectInfo with recommendedCommand.",
    "input_schema": {
      "type": "object",
      "required": ["path"],
      "properties": { "path": { "type": "string" } }
    }
  },
  {
    "name": "lazybuild_build",
    "description": "Execute a build. Returns BuildResult with structured errors/warnings on failure. Stream logs are not returned to the model — only the summary.",
    "input_schema": {
      "type": "object",
      "required": ["target"],
      "properties": {
        "target":         { "type": "string" },
        "configuration":  { "type": "string", "default": "Debug" },
        "platform":       { "type": "string", "default": "x64" },
        "target_msbuild": { "type": "string", "default": "Build", "enum": ["Build","Rebuild","Clean","Pack"] }
      }
    }
  }
]
```

### 3.2 Wrapping rules

The runner that exposes these tools to the model **must**:

1. Run LazyBuild with `BUILDERCLI_AGENT=1`.
2. Capture stdout (envelope) — return as `tool_result`.
3. Discard stderr or attach as `tool_result.stderr` for debugging only — never as primary content.
4. **Truncate `BuildResult.errors[]` to top 5 + count of remaining**. Models do not benefit from 200 errors.
5. Drop `BuildLog` entries entirely — only return `BuildEvent.diagnostic` and final `BuildResult`.
6. Surface the agent's intent to the user *before* running `lazybuild_build`. Builds are observable side effects (touch fs, spawn processes).

### 3.3 Context budget

Per invocation, the model should see at most:

- `EnvironmentSnapshot` — ~2 kB (skip empty arrays)
- `ProjectInfo` — ~1 kB per project
- `BuildResult` — ~3 kB (summary + 5 errors)

If a result is bigger, summarize before returning. Never dump full logs into the model context.

---

## 4. CI integration

### 4.1 GitHub Actions matrix

```yaml
# .github/workflows/build.yml
name: build
on: [push, pull_request]
jobs:
  build:
    strategy:
      matrix:
        os: [windows-latest, ubuntu-latest]
        node: [20, 22]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: ${{ matrix.node }} }
      - run: npm ci
      - run: npm run build
      - run: npm test
      - name: lazybuild self-check
        run: node bin/lazybuild.js self-check --json
      - name: lazybuild diagnose (smoke)
        run: node bin/lazybuild.js diagnose --json > diagnose.json
      - uses: actions/upload-artifact@v4
        with: { name: lazybuild-${{ matrix.os }}-node${{ matrix.node }}, path: diagnose.json }
```

### 4.2 PR-build bot

A Claude/GPT bot that on PR open:

1. Checks out the branch
2. Runs `buildercli diagnose --json` — fails fast if env not ready
3. Runs `buildercli scan projects --json` — produces project map
4. For each changed project (from `git diff --name-only` ∩ `projects[*].path`), runs `buildercli build <project> -c Debug --ndjson-stream`
5. Aggregates `errors[]` across builds
6. Posts a single PR comment with a deduped error table

The bot's "tool" is just a shell script wrapping LazyBuild. **No code is in the bot — the contract is in LazyBuild.**

---

## 5. Onboarding bot

```bash
# scripts/onboarding-check.sh
#!/usr/bin/env bash
set -e
out=$(buildercli diagnose --json --severity error)
errors=$(echo "$out" | jq '.data.diagnostics | map(select(.severity == "error"))')
count=$(echo "$errors" | jq 'length')
if [ "$count" -gt 0 ]; then
  echo "Setup incomplete:"
  echo "$errors" | jq -r '.[] | "  - [\(.code)] \(.title)\n    fix: \(.suggestedAction)"'
  exit 2
fi
echo "✓ Ready to build"
```

This script is what a new engineer runs on day one. The bot wrapping it can offer to **install** missing tools (using a separate package manager — LazyBuild only detects).

---

## 6. Triage agent

When a user files "my build failed":

1. Triage bot asks for `~/.buildercli/logs/last.ndjson` (planned: --debug mode)
2. Re-runs `buildercli build` with the same profile in a clean container
3. Compares `BuildResult.errors[]` between user and clean environment
4. If different → environment-specific bug; surfaces the env diff
5. If same → reproducible code bug; assigns to dev

LazyBuild's structured output makes this comparison **mechanical**, not fuzzy.

---

## 7. The enterprise scaling axis

To make LazyBuild dependable at scale, we need 4 properties on top of the headless CLI:

### 7.1 Versioned schema (already in the contract)
- Every payload tagged `buildercli/v1`. Bots pin a major version. Already specified — see [`output-schemas.md`](output-schemas.md) § Compatibility promise.

### 7.2 Reproducibility
- A `--snapshot` mode that emits **a single self-describing JSON** of env+projects+result. Replayable in a clean container with `--from-snapshot <file>` so support tickets stop being lossy. (🔭 future)

### 7.3 Observability
- `--debug` writes NDJSON to `~/.buildercli/logs/<ts>.ndjson` with PII redaction (PATH, USERNAME, hostname). Single attachment for any bug report. Spec in `architecture.md` § Observability.

### 7.4 Multi-tenant safety
- Profiles & history under `BUILDERCLI_HOME` (defaults to `~/.buildercli`), no global writes outside that dir. Already correct in design — codify in tests.

---

## 8. Agent loop patterns

### Pattern A: "Edit-Verify"
Each edit produces one `lazybuild_build` call. Loop bounded to 3 attempts (see Recipe R10).

### Pattern B: "Explore-Plan-Build"
1. `lazybuild_diagnose` once at session start
2. `lazybuild_inspect` per project the user mentions
3. `lazybuild_build` only after user confirms the plan

This is the default for Claude Code-style agents. Frugal on tool calls.

### Pattern C: "Split-and-Merge"
Mixed solution? Build each project in parallel, merge `BuildResult.errors` by `projectName`. The agent presents one unified table.

### Pattern D: "Cache-and-Diff"
Snapshot env at session start. Re-snapshot when user reports "now it's broken." Diff snapshots — that's usually the answer (PATH changed, SDK uninstalled, …).

---

## 9. What to build next (P0 → P2)

| Priority | Item | Why |
|---|---|---|
| **P0** | Headless `scan / inspect / diagnose / build / self-check` subcommands | Unblocks every surface above |
| **P0** | JSON envelope `{schema,kind,data}` everywhere | Locks the contract |
| **P0** | NDJSON build streaming | Enables real-time agent reactions |
| **P0** | Exit codes locked (`output-schemas.md` § 4) | Bot reliability |
| **P0** | Test harness (Ports & Fakes) | See `architecture.md` § Test harness |
| P1 | `--snapshot` / `--from-snapshot` | Reproducible support |
| P1 | `--debug` NDJSON log | Triage agent input |
| P1 | Profiles disk-backed | R7 |
| P1 | `history` subcommand | Triage |
| P2 | Programmatic ESM exports (`exports` map in `package.json`) | Library use |
| P2 | `lazybuild watch` (auto-rebuild) | Edit-Verify loop without tool re-spawn |
| P2 | MCP server wrapper | Direct tool registration with MCP-aware agents |

P0 set is what turns LazyBuild from a TUI into a tool. Everything else is leverage.

---

## 10. North-star check

If a Claude Code session for a C++/C# repo can:

1. Boot, scan with one `lazybuild_diagnose` call
2. Plan a fix with `lazybuild_inspect`
3. Verify the fix with `lazybuild_build`
4. Loop ≤ 3 times on failure
5. Stay under 5 kB tool-context per round-trip
6. Never freelance a `dotnet`/`msbuild` command directly

… then LazyBuild has done its job as the harness's compile-time oracle. That's the bar.
