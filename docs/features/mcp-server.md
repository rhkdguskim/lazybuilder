# MCP Server — AI 에이전트 1급 표면

> LazyBuilder의 모든 service를 Model Context Protocol 도구로 노출. Claude Code, Cursor, Cline, OpenAI Agents 등이 1급 도구로 사용 가능.

## 1. 목적

### 1.1 한 줄 정의
LazyBuilder의 기존 서비스들을 표준 MCP 프로토콜로 래핑해 AI 에이전트가 자율적으로 빌드 환경을 다룰 수 있게 함.

### 1.2 풀고자 하는 문제
- AI 에이전트가 `lazybuilder --xyz`를 shell exec 하는 건 가능하지만, **도구 카탈로그가 없어** 무엇이 가능한지 학습 못함
- shell exec은 도구 이름·파라미터·반환 스키마가 모델에 노출 안 됨 → 사용 안정성 ↓
- MCP는 표준 — 한 번 만들면 모든 MCP-aware 클라이언트가 즉시 활용

### 1.3 성공의 정의 (MVP)
1. `lazybuilder mcp` 한 줄로 stdio MCP 서버 실행
2. Claude Code config에 등록 → 7개 핵심 도구 가용
3. AI가 도구 카탈로그·스키마 자동 조회 가능
4. 빌드 실행 도구가 실시간 로그를 progress notification으로 스트림

## 2. 범위

### 2.1 MVP (Phase A-1) — 7개 도구

| 도구 | 래핑 대상 | 비고 |
|---|---|---|
| `scan_environment` | `EnvironmentService.scan()` | 캐시: 5분 |
| `scan_projects` | `ProjectScanService.scan()` | cwd 인자 |
| `run_diagnostics` | `DiagnosticsService.analyze()` | 위 둘의 결과 자동 사용 |
| `toolchain_plan` | `ToolchainService.plan()` | 누락 SDK 산출 |
| `toolchain_apply` | `ToolchainService.apply()` | **명시적 동의 필요** |
| `build` | `BuildService.execute()` | progress 스트리밍 |
| `get_metrics` | `BuildIntelligenceService.report()` | days 인자 |

### 2.2 비-MVP (Phase A-2)
- `get_regressions`, `get_flaky` (Phase B와 함께)
- `debug.*` 툴 (Phase D)
- `lsp.*` 메타 툴

## 3. 전송·기동

### 3.1 MVP 전송
- **stdio JSON-RPC** (MCP 표준, Claude Code 기본)
- `lazybuilder mcp` 실행 → stdin/stdout으로 MCP 통신
- 로그는 stderr로만

### 3.2 사용자 등록 (Claude Code 기준)
```jsonc
// ~/.claude/mcp.json
{
  "mcpServers": {
    "lazybuilder": {
      "command": "lazybuilder",
      "args": ["mcp"]
    }
  }
}
```

### 3.3 비-MVP
- HTTP/SSE 전송 (원격 사용 시)
- 인증 (HTTP일 때 필요)

## 4. 도구 명세

### 4.1 `scan_environment`
```jsonc
{
  "name": "scan_environment",
  "description": "Scan the current host for installed build tools (.NET SDKs, MSBuild, VS, C++ toolchain, Windows SDK, CMake, package managers).",
  "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
}
```
**반환**: `EnvironmentSnapshot` (기존 타입 그대로).

### 4.2 `scan_projects`
```jsonc
{
  "name": "scan_projects",
  "inputSchema": {
    "type": "object",
    "properties": {
      "cwd": { "type": "string", "description": "Directory to scan (default: process.cwd())" }
    },
    "additionalProperties": false
  }
}
```
**반환**: `{ projects: ProjectInfo[], solutions: SolutionInfo[] }`.

### 4.3 `run_diagnostics`
```jsonc
{
  "name": "run_diagnostics",
  "description": "Run all diagnostic rules against the current environment + project scan."
}
```
**반환**: `DiagnosticItem[]` (severity, code, suggestedAction 포함).

### 4.4 `toolchain_plan`
```jsonc
{
  "name": "toolchain_plan",
  "description": "Resolve missing .NET SDKs/runtimes/workloads and return a detailed install plan. Does NOT install.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "scope": { "enum": ["user", "machine"], "default": "user" },
      "updateGlobalJson": { "type": "boolean", "default": false }
    }
  }
}
```
**반환**: `InstallPlan`.

### 4.5 `toolchain_apply`
```jsonc
{
  "name": "toolchain_apply",
  "description": "Install missing toolchain components. REQUIRES user confirmation flow — agents should call toolchain_plan first and surface the plan to the user.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "scope": { "enum": ["user", "machine"], "default": "user" },
      "continueOnError": { "type": "boolean", "default": false },
      "updateGlobalJson": { "type": "boolean", "default": false },
      "confirmedSteps": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Step IDs the user has explicitly approved. Required."
      }
    },
    "required": ["confirmedSteps"]
  }
}
```
**반환**: `InstallResult`.

→ **`confirmedSteps` 필수**: AI가 무단 설치 못함. plan을 사용자에게 보여주고 동의받은 step ID만 전달.

### 4.6 `build`
```jsonc
{
  "name": "build",
  "description": "Execute a build for the given project + profile. Streams logs as MCP progress notifications.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "projectPath": { "type": "string" },
      "configuration": { "type": "string", "default": "Debug" },
      "platform": { "type": "string", "default": "x64" },
      "verbosity": { "enum": ["quiet", "minimal", "normal", "detailed", "diagnostic"] },
      "useDevShell": { "type": "boolean" }
    },
    "required": ["projectPath"]
  }
}
```
**반환**: `BuildResult`.
**Progress**: MCP `notifications/progress` — 각 stdout/stderr 라인.

### 4.7 `get_metrics`
```jsonc
{
  "name": "get_metrics",
  "description": "Return build metrics, regressions, and flaky builds from local intelligence storage.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "days": { "type": "number", "default": 7 },
      "projectId": { "type": "string" }
    }
  }
}
```
**반환**: `BuildIntelligenceReport`.

## 5. 권한 모델

| 도구 | 부작용 | 사용자 동의 |
|---|---|---|
| scan_environment | 없음 | 자동 |
| scan_projects | 없음 | 자동 |
| run_diagnostics | 없음 | 자동 |
| toolchain_plan | 없음 (네트워크 fetch는 ps1 캐시 갱신만) | 자동 |
| **toolchain_apply** | 디스크 변경, GB 단위 | **`confirmedSteps` 필수** |
| **build** | 빌드 산출물 생성, 빌드 캐시 변경 | 호출 자체로 OK (사용자가 도구 호출 권한 부여한 시점에 동의) |
| get_metrics | 로컬 파일 read | 자동 |

## 6. 아키텍처

```
src/mcp/
├── server.ts          # @modelcontextprotocol/sdk 서버 부트스트랩
├── tools/
│   ├── scan.ts        # scan_environment, scan_projects
│   ├── diagnostics.ts # run_diagnostics
│   ├── toolchain.ts   # toolchain_plan, toolchain_apply
│   ├── build.ts       # build (with progress streaming)
│   └── metrics.ts     # get_metrics
└── envelope.ts        # JSON envelope helpers (재사용)
```

각 tool 모듈 = MCP 툴 1~2개. 각 툴은 기존 service를 import해 직접 호출 (재사용률 100%).

## 7. 비기능

| 항목 | 목표 |
|---|---|
| 콜드 스타트 (서버 기동) | < 500 ms |
| `scan_environment` 응답 (캐시 있을 때) | < 50 ms |
| `build` progress notification 빈도 | 라인당 즉시 (배치 안 함) |
| stderr 로깅 (stdout 오염 금지) | 필수 |
| 다중 클라이언트 | MVP는 단일 클라이언트만 (한 프로세스 1 세션) |

## 8. 수용 기준 (MVP DoD)

- [ ] `lazybuilder mcp` 실행 → stdio handshake 성공
- [ ] Claude Code에 등록 후 도구 카탈로그 7개 노출 확인
- [ ] `scan_environment` 호출 → 유효한 `EnvironmentSnapshot` JSON 반환
- [ ] `toolchain_plan` 호출 → `InstallPlan` 반환
- [ ] `toolchain_apply` 호출 시 `confirmedSteps` 누락하면 에러
- [ ] `build` 호출 시 progress notification으로 라인별 로그 스트림
- [ ] 서버 종료 시 자식 프로세스(빌드/설치) cleanup

## 9. 사용 예시 (Claude Code)

```
User: "이 솔루션 빌드해줘"
Claude (도구 호출):
  1. scan_projects({ cwd: "..." }) 
     → 솔루션 파일 발견
  2. run_diagnostics()
     → 누락 SDK 발견
  3. toolchain_plan()
     → 사용자에게 plan 제시 → 사용자 OK
  4. toolchain_apply({ confirmedSteps: ["dotnet-sdk-8.0.x"] })
     → 설치 완료
  5. build({ projectPath: "MyApp.sln", configuration: "Release" })
     → 빌드 성공, 로그 스트림
```
