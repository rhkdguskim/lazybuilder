# Recipes — concrete agent workflows

Each recipe is a known-good pattern. Pick one, adapt the args.

---

## R1. "Can this machine build my project?"

**Trigger**: user dropped a `.csproj` / `.sln` in the chat and asked if it builds.

```bash
buildercli diagnose --json --severity warning
```

Parse `data.diagnostics`. Filter:

```ts
const blockers = report.data.diagnostics.filter(d => d.severity === 'error');
const concerns = report.data.diagnostics.filter(d => d.severity === 'warning');
```

If `blockers.length === 0` ⇒ proceed to R2.
If any `blocker.code` matches `*_MISSING` (e.g., `DOTNET_SDK_MISSING`, `WINSDK_MISSING`) ⇒ surface `suggestedAction` to the user.

---

## R2. "What command should I run to build this?"

```bash
buildercli inspect ./src/MyApp/MyApp.csproj --json
```

Read `data.recommendedCommand.displayString`. Show it to the user before executing — never silently run.

```text
Detected: SDK-style C# project (net8.0)
Suggested command: dotnet build MyApp.csproj -c Release
Required tools: dotnet>=8.0
Risk flags: (none)

Proceed? [y/N]
```

---

## R3. "Build it and tell me what broke"

```bash
buildercli build ./MyApp.sln \
  -c Release -p x64 \
  --ndjson-stream \
  --log-level warn
```

Stream parser sketch:

```ts
import { spawn } from 'node:child_process';
import readline from 'node:readline';

const proc = spawn('buildercli', [
  'build', './MyApp.sln',
  '-c', 'Release', '-p', 'x64',
  '--ndjson-stream',
]);

const errors: BuildDiagnostic[] = [];
readline.createInterface({ input: proc.stdout }).on('line', line => {
  const env = JSON.parse(line);
  if (env.kind === 'BuildEvent' && env.data.type === 'diagnostic'
      && env.data.diagnostic.severity === 'error') {
    errors.push(env.data.diagnostic);
  }
  if (env.kind === 'BuildResult') {
    // final envelope — env.data is BuildResult
  }
});

proc.on('exit', code => {
  if (code === 0) console.log('OK');
  else if (code === 3) summarizeErrors(errors);     // top 3, deduped by file:line:code
  else if (code === 2) askUserToInstallTools();
});
```

When summarizing for a human: group by `filePath`, then show first 3 errors per file with full message. Do not dump all.

---

## R4. "Why is the C++ build failing — toolset issue?"

```bash
buildercli inspect ./Native/Native.vcxproj --json
buildercli diagnose --json --severity error
```

Cross-reference:

- `inspect.data.platformToolset` (e.g., `v141_xp`)
- `diagnose.data.env.visualStudio.installations[*].version`
- `diagnose.data.diagnostics[*].code` for `MSBUILD_TOOLSET_MISSING`

If toolset and installed VS major versions don't intersect (toolset map: `v140→14, v141→15, v142→16, v143→17`), tell the user to install the matching VS Build Tools workload.

---

## R5. "Run a Clean Rebuild then Build"

```bash
buildercli build ./MyApp.sln -c Release --target Clean   --json
buildercli build ./MyApp.sln -c Release --target Rebuild --json
```

Two invocations, not chained, so the agent can stop between if step 1 errors.

---

## R6. CI smoke for "does buildercli itself work on this CI runner?"

```yaml
- run: npx buildercli self-check --json
```

Exit 0 means the binary booted, env scan finished, schema honored. Use as a precheck before any build step that depends on `buildercli`.

---

## R7. "Save the user's last good build as a profile"

After a successful R3:

```bash
buildercli profile save my-release \
  --target ./MyApp.sln -c Release -p x64 --parallel
```

Re-run later with:

```bash
buildercli build --profile my-release --ndjson-stream
```

---

## R8. "Detect that this repo is a mixed solution and split build per project"

```bash
buildercli scan projects . --json
```

Loop:

```ts
for (const sln of report.data.solutions.filter(s => s.buildSystem === 'mixed')) {
  for (const p of sln.projects) {
    // run inspect on each, then build per project
  }
}
```

Useful when one giant `.sln` has C# (cross-platform) and C++ (Windows-only) and the agent is on Linux.

---

## R9. Programmatic fallback (today, until headless CLI ships)

When the `buildercli <subcommand>` surface is not yet present:

```ts
// 1) From inside a clone of the repo
import { EnvironmentService }    from './dist/application/EnvironmentService.js';
import { ProjectScanService }    from './dist/application/ProjectScanService.js';
import { DiagnosticsService }    from './dist/application/DiagnosticsService.js';
import { BuildService }          from './dist/application/BuildService.js';

const env       = await new EnvironmentService().scan();
const scan      = await new ProjectScanService().scan(process.cwd());
const items     = new DiagnosticsService().analyze(env, scan.projects);

// agent envelope — wrap before piping back to the model
process.stdout.write(JSON.stringify({
  schema: 'buildercli/v1',
  kind:   'DiagnoseReport',
  data:   { env, projects: scan.projects, solutions: scan.solutions, diagnostics: items },
}));
```

Building programmatically:

```ts
const buildSvc = new BuildService(env);
const project  = scan.projects.find(p => p.path.endsWith('MyApp.csproj'));
if (!project) throw new Error('not found');

const profile = {
  id: 'adhoc', name: 'adhoc',
  targetPath: project.path,
  commandType: project.buildSystem,
  configuration: 'Release', platform: 'x64', verbosity: 'normal',
  extraArgs: [], useDeveloperShell: false, enableBinaryLog: false,
  savedAt: new Date().toISOString(),
};

const result = await buildSvc.execute(project, profile, env, (entry) => {
  process.stdout.write(JSON.stringify({
    schema: 'buildercli/v1', kind: 'BuildLog', data: entry
  }) + '\n');
});

process.stdout.write(JSON.stringify({
  schema: 'buildercli/v1', kind: 'BuildResult', data: result
}) + '\n');
process.exit(result.status === 'success' ? 0 : 3);
```

Until the headless CLI lands, this script is the "tool" an agent calls. Place it under `scripts/agent-driver.mjs` in your wrapping project.

---

## R10. "Verify a fix actually compiles before responding"

Pattern for an agent that just edited C# code:

```text
1. agent edits Foo.cs
2. agent runs:  buildercli build ./MyApp.sln -c Debug --ndjson-stream
3. on exit 0 → respond "fixed"
4. on exit 3 → re-edit using errors[0..3]; loop max 3 attempts
5. on exit 2 → stop, ask human to install tooling
```

Keep loop count bounded. After 3 failed attempts, summarize the last error chain to the human instead of looping.

---

## Anti-patterns

| Don't | Why | Do |
|---|---|---|
| Re-run `scan env` between every command in a session | env is stable for the session | scan once, cache the snapshot |
| Parse build output yourself | parser already extracts file:line:code | use `BuildResult.errors[]` |
| Assume `exit 0` means "no warnings" | warnings are non-fatal | check `warningCount` separately |
| Loop on the same build error > 3 times | rarely converges | escalate to human after 3 attempts |
| Strip ANSI from stderr to use as JSON | stderr is logs, not data | use stdout (`--json`) |
| Pipe a build into the model token by token | wastes context | summarize errors[0..3], drop logs |
