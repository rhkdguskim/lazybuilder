# LSP Server — 빌드 파일 IDE 지원 (모든 에디터)

> `.csproj`, `.sln`, `global.json`, `Directory.Build.props`에 IDE 수준 진단·호버·자동완성·코드 액션 제공. VS Code / Neovim / Helix / JetBrains 등 모든 LSP-aware 에디터에서 동작.

## 1. 목적

### 1.1 한 줄 정의
LazyBuilder의 진단 룰·환경 스냅샷·Toolchain Resolver를 LSP 표면으로 노출해, 사용자가 코드 작성 중 빌드 환경 문제를 인라인으로 보고 클릭 한 번으로 수정할 수 있게 함.

### 1.2 풀고자 하는 문제
- VS 외 에디터에서 `.csproj` / `.sln`에 IDE 지원 거의 없음
- 빌드 파일 문제는 빌드 시점에서야 발견 (이미 늦음)
- "이 TFM 호환되는 SDK 있나?" — 직접 dotnet --list-sdks 확인 필요
- AI 에이전트가 LSP 표준 위에 추가 지능 얹기 좋음

### 1.3 성공의 정의 (MVP)
1. `lazybuilder lsp` 실행 → stdio LSP 서버 동작
2. VS Code · Neovim · Helix에서 `.csproj` / `global.json` 열면 즉시 진단 표시
3. `<TargetFramework>` 호버 시 설치된 SDK 정보 노출
4. AI가 LSP `textDocument/diagnostic` 결과를 직접 받을 수 있음

## 2. 범위

### 2.1 Phase C-1 (MVP, 이 사이클)
- `textDocument/diagnostic` (pull mode)
- `textDocument/hover`
- `workspace/didChangeConfiguration` (재스캔 트리거)
- 지원 파일: `.csproj`, `.fsproj`, `.vbproj`, `.sln`, `global.json`, `Directory.Build.props`

### 2.2 Phase C-2 (다음 sprint)
- `textDocument/completion` — TFM, PlatformToolset, Configuration
- `workspace/symbol` — 솔루션 트리

### 2.3 Phase C-3 (차별화 핵심)
- `textDocument/codeAction`:
  - "Install missing SDK" → Toolchain Resolver
  - "Pin SDK to global.json"
- 커스텀 노티: `lazybuilder/regression`, `lazybuilder/flaky`

### 2.4 Phase C-4 (선택)
- Live build error overlay
- VS Code 확장 (lazybuilder.vsix)

## 3. 도큐먼트 / 진단 매핑

### 3.1 지원 파일 → 룰 매핑

| 파일 패턴 | 적용 룰 (기존) | LSP 진단 위치 |
|---|---|---|
| `*.csproj` `*.fsproj` `*.vbproj` | dotnetRules | TFM 텍스트 노드 라인 |
| `*.vcxproj` | cppRules, msbuildRules | PlatformToolset 라인 |
| `*.sln` | msbuildRules | 1번 라인 (요약) |
| `global.json` | dotnetRules | sdk.version 토큰 |
| `Directory.Build.props` | environmentRules | 1번 라인 |

### 3.2 진단 → LSP severity

| 우리 severity | LSP severity |
|---|---|
| error | 1 (Error) |
| warning | 2 (Warning) |
| ok | (진단 안 만듬) |
| unknown | 3 (Information) |

진단의 `code`, `title`, `description`, `suggestedAction`을 그대로 LSP `Diagnostic.message`에 매핑. `relatedPaths`는 `relatedInformation`.

### 3.3 Hover 정보

| 토큰 | 호버 내용 |
|---|---|
| `<TargetFramework>net8.0</TargetFramework>` | "Resolved: .NET 8.0.405 — installed at ~/.dotnet/sdk/...\nWorkloads detected: maui" |
| `<PlatformToolset>v143</PlatformToolset>` | "MSVC 14.39.33519 — VS 2022 Build Tools 17.9 (installed)" or "NOT installed" |
| global.json `"version": "8.0.405"` | "Pinned SDK 8.0.405. rollForward: latestFeature. Installed: ✓" |
| `.sln` ProjectConfigurationPlatforms entry | "Maps Solution Debug\|x64 → Project Debug\|x64 (project file: ...)" |

## 4. 아키텍처

```
src/lsp/
├── server.ts             # vscode-languageserver 부트스트랩
├── connection.ts         # stdio JSON-RPC handler
├── workspace.ts          # 워크스페이스 폴더 추적, 환경 스냅샷 캐시
├── parsers/
│   ├── csproj.ts         # XML position-aware parser (line/col)
│   ├── globalJson.ts     # JSON pointer → range mapping
│   └── sln.ts            # sln 텍스트 line mapping
├── providers/
│   ├── diagnosticProvider.ts   # 기존 룰 결과를 Diagnostic[]로 변환
│   ├── hoverProvider.ts        # 토큰 → Hover content
│   └── (future) completionProvider, codeActionProvider
└── notifications/
    └── lazybuilder.ts    # 커스텀 노티 (Phase C-3)
```

### 4.1 환경 스냅샷 캐시
- 워크스페이스 폴더 단위로 5분 TTL
- 사용자가 `dotnet --version` 실행한 흔적 감지 시 재스캔
- `workspace/didChangeConfiguration`로 강제 재스캔 가능

### 4.2 진단 수명주기
1. `textDocument/didOpen` → 즉시 진단 1회
2. `textDocument/didChange` → debounce 300ms 후 재진단
3. `textDocument/diagnostic` (pull) → 최신 결과 반환
4. 환경 스냅샷 갱신 시 → 모든 열린 도큐먼트 publish 진단 갱신

## 5. 기동·등록

### 5.1 서버 기동
```bash
lazybuilder lsp                  # stdio LSP, JSON-RPC over stdin/stdout
```

### 5.2 클라이언트 등록 예시

**VS Code (extensions/lazybuilder/package.json)**:
```json
{
  "contributes": {
    "languages": [
      { "id": "msbuild", "extensions": [".csproj", ".vcxproj", ".fsproj", ".vbproj", ".sln", ".props"] }
    ]
  }
}
```

**Neovim (lspconfig)**:
```lua
require'lspconfig'.lazybuilder.setup{
  cmd = { "lazybuilder", "lsp" },
  filetypes = { "csproj", "sln", "json" },
  root_dir = require'lspconfig.util'.root_pattern("*.sln", "global.json", ".git"),
}
```

**Helix (.helix/languages.toml)**:
```toml
[[language]]
name = "msbuild"
file-types = ["csproj", "vcxproj", "sln"]
language-servers = [{ command = "lazybuilder", args = ["lsp"] }]
```

## 6. 비기능

| 항목 | 목표 |
|---|---|
| 서버 콜드 스타트 | < 500 ms |
| 첫 진단 응답 (캐시 없을 때) | < 2 s |
| 재진단 (캐시 hit) | < 50 ms |
| 메모리 사용 | < 100 MB (수십 프로젝트 워크스페이스) |
| stdio 오염 | stderr만 사용, stdout은 LSP RPC 전용 |

## 7. 통합 지점

- **Phase 0 (existing)**: `DiagnosticsService`, `ProjectScanService`, `EnvironmentService` 그대로 호출
- **Phase A (MCP)**: 별도 트랙 (LSP는 에디터용, MCP는 AI용)
- **Phase B (Build Intelligence)**: 회귀 감지 시 LSP 커스텀 노티로 push
- **Phase D (Debugger)**: 코드 액션 "Debug from this diagnostic"

## 8. 수용 기준 (MVP Phase C-1 DoD)

- [ ] `lazybuilder lsp` 실행 → LSP `initialize` 핸드셰이크 성공
- [ ] VS Code Output 패널에서 LSP 통신 로그 확인 가능
- [ ] `.csproj` 열면 환경 누락 시 빨간 줄 인라인 표시
- [ ] global.json에서 설치되지 않은 SDK 버전 지정 시 진단 표시
- [ ] `<TargetFramework>` 호버 시 설치 SDK 정보 표시
- [ ] LSP 서버가 워크스페이스 변경 시 자동 재스캔
- [ ] stdout 오염 없음 (모든 로그는 stderr / 파일)

## 9. 향후 확장

### 9.1 코드 액션 (Phase C-3) 명세 미리보기
```ts
{
  title: "Install .NET 6 SDK (320 MB, no admin)",
  kind: "quickfix",
  diagnostics: [...],
  command: {
    title: "Install via LazyBuilder",
    command: "lazybuilder.toolchain.apply",
    arguments: [{ stepId: "dotnet-sdk-6.0.x" }]
  }
}
```
클라이언트가 `lazybuilder.toolchain.apply` 명령을 LSP `workspace/executeCommand`로 호출 → 서버가 `ToolchainService.apply()` 실행 → progress 노티로 진행률 push.

### 9.2 커스텀 노티 (Phase B + C-3)
```ts
// lazybuilder/regression
interface RegressionNotification {
  filePath: string;        // 솔루션 파일 등
  message: string;         // "Build duration +47% in last 7 days"
  severity: "warning";
  metric: "duration";
  delta: number;
}
```
클라이언트는 status bar 또는 problems panel에 표시.
