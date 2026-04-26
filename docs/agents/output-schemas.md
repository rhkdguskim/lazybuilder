# Output Schemas (`buildercli/v1`)

Every machine-readable output is a JSON envelope:

```json
{"schema": "buildercli/v1", "kind": "<KindName>", "data": <KindShape>}
```

Streaming outputs (`--ndjson-stream`) emit one envelope per line, ending with a final `BuildResult` (or terminal envelope) — no trailing newline-delimited array.

This page is the contract. Authoritative shapes live in `src/domain/models/*.ts`.

---

## Index of kinds

| Kind | Returned by | Source of truth |
|---|---|---|
| [`EnvironmentSnapshot`](#environmentsnapshot) | `scan env`, `diagnose` | `src/domain/models/EnvironmentSnapshot.ts` |
| [`ProjectScanReport`](#projectscanreport) | `scan projects` | composed from `ProjectInfo`, `SolutionInfo` |
| [`ProjectInfo`](#projectinfo) | `inspect`, embedded | `src/domain/models/ProjectInfo.ts` |
| [`SolutionInfo`](#solutioninfo) | embedded in `ProjectScanReport` | `src/domain/models/ProjectInfo.ts` |
| [`DiagnoseReport`](#diagnosereport) | `diagnose` | composite |
| [`DiagnosticItem`](#diagnosticitem) | embedded | `src/domain/models/DiagnosticItem.ts` |
| [`BuildProfile`](#buildprofile) | `profile show` | `src/domain/models/BuildProfile.ts` |
| [`BuildResult`](#buildresult) | `build` (final) | `src/domain/models/BuildResult.ts` |
| [`BuildLog`](#buildlog) | `build --ndjson-stream` | composed from `LogEntry` |
| [`BuildEvent`](#buildevent) | `build --ndjson-stream` | new |
| [`SelfCheck`](#selfcheck) | `self-check` | new |

---

## EnvironmentSnapshot

Snapshot of all detected build tools at scan time.

```jsonc
{
  "os":          { "name": "Windows" | "Linux" | "macOS", "version": "v22.x.x", "arch": "x64" },
  "shell":       "C:\\Windows\\System32\\cmd.exe",
  "cwd":         "C:\\src\\my-app",
  "hostname":    "DEV-PC",
  "username":    "alice",
  "gitBranch":   "main" | null,

  "dotnet": {
    "sdks":     [{ "version": "8.0.300", "path": "C:\\Program Files\\dotnet\\sdk\\8.0.300" }],
    "runtimes": [{ "name": "Microsoft.NETCore.App", "version": "8.0.5", "path": "..." }],
    "workloads":[{ "id": "wasm-tools", "version": "..." }],
    "globalJsonSdk": "8.0.100" | null,
    "globalJsonPath": "C:\\src\\my-app\\global.json" | null
  },

  "msbuild": {
    "instances":   [{ "version": "17.10.4", "path": "...", "architecture": "x64" }],
    "selectedPath": "C:\\Program Files\\Microsoft Visual Studio\\2022\\..." | null
  },

  "visualStudio": {
    "installations": [{
      "displayName": "Visual Studio Community 2022",
      "edition":     "Community",
      "version":     "17.10.34928.147",
      "installPath": "C:\\Program Files\\Microsoft Visual Studio\\2022\\Community",
      "components":  ["Microsoft.VisualStudio.Workload.NativeDesktop", "..."]
    }]
  },

  "cpp": {
    "clExePath":    "..." | null,
    "linkExePath":  "..." | null,
    "toolsetVersion": "v143" | null,
    "vcvarsPath":   "..." | null,
    "vsDevCmdPath": "..." | null,
    "envActive":    false
  },

  "windowsSdk": {
    "versions": [{ "version": "10.0.22621.0", "installPath": "..." }]
  },

  "cmake":     { "version": "3.29.0", "path": "..." } | null,
  "ninja":     { "version": "1.11.1", "path": "..." } | null,
  "git":       { "version": "2.45.0",  "path": "..." } | null,
  "powershell":{ "version": "7.4.2",   "path": "..." } | null,
  "packageManagers": {
    "nuget":  { "version": "...", "path": "..." } | null,
    "vcpkg":  { "version": "...", "path": "..." } | null,
    "conan":  { "version": "...", "path": "..." } | null
  }
}
```

**Reading rules**:
- `null` means "not detected on this machine". Do not equate with "broken".
- Empty arrays (`installations: []`, `sdks: []`) mean "scanned but found none".
- All paths are absolute and platform-native (backslashes on Windows).

---

## ProjectScanReport

```jsonc
{
  "projects":   [ProjectInfo, ...],
  "solutions":  [SolutionInfo, ...],
  "scannedRoot":"C:\\src\\my-app",
  "scanDurationMs": 412
}
```

---

## ProjectInfo

```jsonc
{
  "name":        "MyApp",
  "path":        "C:\\src\\my-app\\src\\MyApp\\MyApp.csproj",
  "projectType": "dotnet-sdk" | "dotnet-legacy" | "cpp-msbuild" | "cmake" | "mixed",
  "language":    "csharp" | "cpp" | "fsharp" | "vb" | "mixed",
  "buildSystem": "dotnet" | "msbuild" | "cmake",

  "targetFrameworks": ["net8.0"],         // .NET projects
  "platformTargets":  ["AnyCPU", "x64"],

  // C++ MSBuild only
  "platformToolset":            "v143" | null,
  "windowsTargetPlatformVersion":"10.0" | null,
  "characterSet":               "Unicode" | "MultiByte" | null,
  "useDebugLibraries":          true | false | null,

  "configurations": [
    { "configuration": "Debug",   "platform": "x64" },
    { "configuration": "Release", "platform": "x64" }
  ],

  "dependencies": {
    "packageReferences":  [{ "id": "Newtonsoft.Json", "version": "13.0.3" }],
    "projectReferences":  ["..\\Lib\\Lib.csproj"],
    "vcpkgManifest":      "vcpkg.json" | null,
    "conanFile":          "conanfile.txt" | null
  },

  "recommendedCommand": {
    "command":    "dotnet",
    "args":       ["build", "MyApp.csproj", "-c", "Release"],
    "displayString": "dotnet build MyApp.csproj -c Release",
    "requiresDevShell": false
  },

  "requiredTools": ["dotnet>=8.0"] | ["msbuild>=17", "Windows SDK 10"],
  "riskFlags":     ["legacy-framework", "missing-restore"]
}
```

---

## SolutionInfo

```jsonc
{
  "name": "MyApp.sln",
  "path": "C:\\src\\my-app\\MyApp.sln",
  "format": "12.00",
  "projects": [
    { "name": "MyApp", "path": "src\\MyApp\\MyApp.csproj", "guid": "{...}" }
  ],
  "configurationPlatforms": [
    { "configuration": "Debug",   "platform": "x64" },
    { "configuration": "Release", "platform": "x64" }
  ],
  "buildSystem": "dotnet" | "msbuild" | "mixed"
}
```

---

## DiagnoseReport

```jsonc
{
  "env":         EnvironmentSnapshot,
  "projects":    [ProjectInfo],
  "solutions":   [SolutionInfo],
  "diagnostics": [DiagnosticItem]
}
```

---

## DiagnosticItem

```jsonc
{
  "category":  "dotnet" | "msbuild" | "cpp" | "cmake" | "environment",
  "severity":  "ok" | "warning" | "error" | "unknown",
  "code":      "DOTNET_SDK_MISSING",       // stable identifier; OK to filter on
  "title":     "No .NET SDK detected",
  "description":"Required to build .csproj projects.",
  "suggestedAction": "Install .NET SDK 8.0 from https://dot.net",
  "relatedPath":"C:\\src\\my-app\\global.json" | null
}
```

**Code naming**: `<CATEGORY>_<SUBJECT>_<STATE>`. Codes are stable; new ones can be added at any time.

---

## BuildProfile

```jsonc
{
  "id":         "uuid-or-name",
  "name":       "release-x64",
  "targetPath": "C:\\src\\my-app\\MyApp.sln",
  "commandType":"dotnet" | "msbuild" | "cmake",
  "configuration":"Release",
  "platform":   "x64",
  "verbosity":  "normal",
  "extraArgs":  ["/p:WarningLevel=4"],
  "useDeveloperShell": false,
  "enableBinaryLog":   false,
  "savedAt":    "2026-04-01T12:34:56Z"
}
```

---

## BuildResult

Final envelope from `buildercli build`.

```jsonc
{
  "profileId":   "release-x64",
  "startTime":   "2026-04-01T12:00:00.000Z",
  "endTime":     "2026-04-01T12:00:42.314Z",
  "durationMs":  42314,
  "exitCode":    0,
  "status":      "success" | "failure" | "cancelled",
  "errorCount":  0,
  "warningCount":3,
  "errors":   [BuildDiagnostic, ...],
  "warnings": [BuildDiagnostic, ...]
}
```

### BuildDiagnostic

```jsonc
{
  "severity":    "error" | "warning",
  "code":        "CS1002",
  "message":     "; expected",
  "filePath":    "C:\\src\\my-app\\src\\MyApp\\Program.cs" | null,
  "line":        17 | null,
  "column":      23 | null,
  "projectName": "MyApp" | null,
  "stage":       "compile" | "link" | "restore" | "publish" | null
}
```

---

## BuildLog

Streamed line-by-line during `build --ndjson-stream`.

```jsonc
{
  "index":     1234,
  "timestamp": 1712000000123,        // Unix ms
  "level":     "stdout" | "stderr" | "info" | "warning" | "error",
  "text":      "  MyApp -> bin\\Release\\net8.0\\MyApp.dll",
  "source":    "stdout" | "stderr"
}
```

---

## BuildEvent

Streamed during `build --ndjson-stream` for state transitions.

```jsonc
{ "type": "started",      "command": "dotnet build ..." }
{ "type": "phase",        "phase":   "restore" | "compile" | "link" | "publish" }
{ "type": "progress",     "percent": 42, "currentTarget": "MyApp.csproj" }
{ "type": "diagnostic",   "diagnostic": BuildDiagnostic }
{ "type": "cancelled" }
{ "type": "exited",       "exitCode": 0 }
```

Event types may be **added** (agent must ignore unknown types). Existing types' fields are stable.

---

## SelfCheck

```jsonc
{
  "schemaOk":   true,
  "binVersion": "0.1.0",
  "node":       "v20.12.0",
  "platform":   "win32",
  "envScanOk":  true,
  "envScanMs":  812,
  "warnings":   ["update available: 0.2.0"]
}
```

---

## TypeScript reference

The shapes above are emitted from these files (with `.ts → JSON`):

```
src/domain/models/EnvironmentSnapshot.ts
src/domain/models/ProjectInfo.ts
src/domain/models/DiagnosticItem.ts
src/domain/models/BuildProfile.ts
src/domain/models/BuildResult.ts
src/domain/models/LogEntry.ts
src/domain/enums.ts
```

Agents that want compile-time types can import them directly:

```ts
import type { EnvironmentSnapshot } from 'lazybuild/dist/domain/models/EnvironmentSnapshot.js';
import type { BuildResult } from 'lazybuild/dist/domain/models/BuildResult.js';
```
