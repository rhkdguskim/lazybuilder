# Toolchain Resolver — 자동 환경 셋업 기능 명세

> 누락된 빌드 툴킷을 분석·제안·자동 설치까지 한 번에 처리하는 기능. LazyBuilder를 "빌드 진단 도구"에서 "빌드 환경 자동화 도구"로 격상시키는 핵심 기능.

## 1. 목적

### 1.1 한 줄 정의
프로젝트가 요구하는 빌드 툴체인 중 **이 PC에 누락된 항목**을 자동으로 식별하고, 사용자 동의 1번에 자동 설치해 빌드 가능한 상태로 만든다.

### 1.2 풀고자 하는 문제
- "빌드 안 됨" 1차 원인의 대부분은 누락된 SDK / Build Tools / Workload
- 신규 PC, 신입 개발자 온보딩, CI 머신 셋업에서 **반복되는 수동 작업**
- 어떤 버전을 깔아야 하는지 프로젝트 파일을 직접 읽어야 알 수 있음 (학습 비용)
- AI 에이전트(Claude Code, Cursor 등)가 "빌드 실패 → 환경 셋업"을 자율 수행할 수단이 없음

### 1.3 성공의 정의 (MVP)
1. **빈 .NET 환경의 새 Windows PC**에서 LazyBuilder 한 번 실행 → 어떤 .NET 솔루션도 빌드 가능 상태로 도달
2. 일반 케이스에서 **UAC 프롬프트가 뜨지 않음** (User scope 설치)
3. **side-by-side 안전** — 기존 SDK를 망가뜨리지 않음
4. AI 에이전트가 `--yes`로 동일 흐름을 비대화형 실행 가능
5. `global.json`만 커밋되어 있으면 팀 전원이 동일 환경 재현 가능

## 2. 범위

### 2.1 MVP 범위 (이 문서)
- **OS**: Windows
- **툴체인**: .NET SDK / Runtime / Workload (.NET 6/7/8/9 SxS)
- **권한 모델**: User scope 기본 (`%USERPROFILE%\.dotnet`), Machine scope은 명시적 선택 + UAC
- **설치 소스**: Microsoft 공식 `dotnet-install.ps1` 단일 경로
- **트리거**: 부팅 후 자동 감지 + Diagnostics 탭 액션 + 빌드 직전 게이트 + headless 명령

### 2.2 비-목표 (추후 확장)
- VS Build Tools / Windows SDK 설치 (Phase 2)
- CMake / Ninja / vcpkg 설치 (Phase 2)
- macOS / Linux (Phase 3)
- 사내 미러 / 에어갭 / 조직 정책 화이트리스트 (Phase 4)
- .NET Framework 4.x 자동 설치 (감지·안내만)
- winget 경로 (단일 소스 유지)

## 3. 사용자 경험

### 3.1 핵심 흐름
```
[1] Detect      [2] Propose       [3] Confirm       [4] Auto-install
   분석            제안 카드          OK 1번             실행 + 진행률
   (자동/수동)     (정보 노출)        (체크박스 부분동의)   (스트리밍)
```

### 3.2 트리거
| 트리거 | 시점 | 동작 |
|---|---|---|
| **부팅 자동** | 환경 스캔 종료 후 누락 항목이 있을 때만 | 토스트 배너 "Toolchain setup recommended (3 items)" |
| **빌드 직전 게이트** | Build 탭에서 Enter 누름 + 누락 감지 | "빌드 대신 먼저 설치 제안" 모달 |
| **Diagnostics 액션** | Diagnostics 탭에서 `i` 키 | propose 모달 직접 표시 |
| **수동 명령** | `lazybuilder toolchain plan / apply / sync` | headless JSON 출력 또는 비대화형 설치 |

### 3.3 Propose 카드 (정보 밀도)

```
┌─ .NET Toolchain Setup ─────────────────────────────┐
│ 2 SDKs · 1 workload · 412 MB · ~90 s · no admin    │
├────────────────────────────────────────────────────┤
│ [✓] .NET SDK 8.0.405                  280 MB       │
│     reason: global.json (3 projects use net8.0)    │
│     install scope: user (~/.dotnet)                │
│     source: dot.net (signed: Microsoft)            │
│                                                     │
│ [✓] .NET SDK 6.0.428                  120 MB       │
│     reason: Legacy.csproj uses net6.0              │
│     install scope: user (side-by-side with 8.0)    │
│                                                     │
│ [✓] MAUI workload                      12 MB       │
│     reason: <UseMaui>true</UseMaui> in App.csproj  │
├────────────────────────────────────────────────────┤
│ Update global.json after install: [✓]              │
│  [Enter] Install all  [Space] Toggle               │
│  [s] Switch scope     [g] Toggle global.json       │
│  [Esc] Cancel                                       │
└────────────────────────────────────────────────────┘
```

각 줄이 답해야 할 정보 6가지:
1. **무엇을** — 이름·정확 버전
2. **왜** — 어떤 프로젝트 파일/설정이 요구했는지 (출처 추적)
3. **얼마나** — 다운로드 크기 + 예상 시간
4. **어디서** — 출처 URL + 서명자
5. **어디로** — install scope (user vs machine, 절대 경로)
6. **권한** — admin 필요 여부 (no admin / requires UAC 명시)

### 3.4 진행률 패널

```
Installing .NET toolchain (2/3) ━━━━━━━━━━━━━━━░░  72%

  ✓ .NET SDK 8.0.405          done  (38 s)
  ▶ .NET SDK 6.0.428          downloading 84/120 MB
  ○ MAUI workload             pending

  Install location: C:\Users\you\.dotnet
  [l] Logs   [Esc] Cancel current step
```

- 라이브 로그는 기존 Logs 탭으로 흘림 (재사용)
- 한 단계 실패 시: 이미 성공한 항목 **유지**, 실패한 항목만 재시도 옵션
- Cancel은 현재 다운로드 abort + 부분 설치본 정리

### 3.5 Post-install 시각적 폐쇄

설치 완료 후 자동으로:
1. **재스캔** → Environment / Diagnostics의 빨간 줄이 초록으로
2. **변경 요약 토스트**: "+ .NET 8.0.405, + .NET 6.0.428, + MAUI workload"
3. **PATH 검증** → 누락 시 "Add to user PATH? [Y/n]"
4. **다음 액션 유도**: 빌드 게이트에서 왔다면 "Build now? [Enter]" 자동 포커스
5. **global.json 커밋 안내** (Git 저장소 + 사용자가 옵션 켰을 때)

## 4. 기능 요구사항

### 4.1 Detect — 요구사항 산출

**입력 소스 (우선순위 순)**
1. `global.json` `sdk.version` + `rollForward` — 최우선 진실 공급원
2. `.csproj` / `.fsproj` / `.vbproj` — `<TargetFramework>`, `<TargetFrameworks>`
3. `Directory.Build.props` 상위 디렉토리 탐색 (병합 규칙 준수)
4. 워크로드 추론 룰:
   - `<UseMaui>true</UseMaui>` → `maui`
   - `<TargetFramework>net8.0-android</TargetFramework>` → `android`
   - `<TargetFramework>net8.0-ios</TargetFramework>` → `ios`
   - `<RuntimeIdentifier>browser-wasm</RuntimeIdentifier>` → `wasm-tools`

**출력 = `ToolchainRequirement[]`**

각 항목:
- `kind`: `'dotnet-sdk' | 'dotnet-workload'`
- `versionSpec`: `'8.0.405'` (정확) 또는 `'8.0.x'` (latest feature) 또는 `'>=6.0'` (range)
- `reason`: 출처 파일·설정 (UI 표시용)
- `currentlyInstalled`: 환경 스냅샷에서 이미 만족하는지
- `severity`: `'required' | 'recommended'`

**중복 제거 규칙**
- 여러 csproj가 `net8.0`을 요구해도 SDK 1개만
- global.json이 정확 버전 고정 → 다른 csproj가 `net8.0`만 요구하면 global.json 버전이 우선
- `rollForward: latestFeature` → 8.0.x 중 최신 패치 자동 선택

### 4.2 Propose — Plan 산출

요구사항 → 설치 계획서 (`InstallPlan`).

각 `InstallStep`:
- `id`, `displayName`, `version`
- `sizeBytes` (LTS 채널 메타에서 조회 또는 공식 manifest)
- `estimatedSeconds`
- `scope`: `'user' | 'machine'`
- `needsAdmin`: boolean
- `source`: `{ url, signer, channel }`
- `command`: 실제 실행될 명령 (dry-run 미리보기용)
- `selected`: boolean (체크박스 상태)
- `dependsOn`: 다른 Step ID (예: workload는 SDK 설치 후)

### 4.3 Confirm — 사용자 동의 모델

- **OK 1번 = 모든 선택 항목 실행 동의**
- 부분 동의: 체크박스 토글로 일부만
- 버전 조정: `e` 키로 호환 버전 picker (예: 8.0.405 → 8.0.404 → 8.0.x)
- Scope 토글: `s` 키로 user/machine 전환 (machine은 즉시 "requires admin" 표시)
- 비대화형: `--yes` 플래그로 Plan 그대로 실행 (CI/AI 에이전트)
- **이중 confirmation 없음** — UAC 프롬프트만으로 충분 (machine scope일 때만)

### 4.4 Install — 실행 엔진

**`DotnetInstaller` 책임**
1. `dotnet-install.ps1` 캐시 확보 (`%LOCALAPPDATA%\LazyBuilder\cache\dotnet-install.ps1`)
   - 신규 또는 24시간 이상 된 경우 `https://dot.net/v1/dotnet-install.ps1`에서 재다운로드
   - HTTPS + 응답 본문 비공개 검증
2. 단계별 실행:
   - SDK: `powershell -ExecutionPolicy Bypass -File dotnet-install.ps1 -Version <ver> -InstallDir <dir>`
   - Runtime: `... -Runtime dotnet|aspnetcore|windowsdesktop ...`
   - Workload: `dotnet workload install <id>` (PATH에 dotnet 있은 후)
3. 진행률 파싱 — `dotnet-install.ps1` stdout 라인 기반 (`Extracting...`, `Installation finished`)
4. 실패 시: stderr 캡처 + 종료코드 보존, 다음 단계 실행 여부는 정책에 따름 (기본: stop on first error, `--continue-on-error` 옵션)

**PATH 처리**
- User scope (`%USERPROFILE%\.dotnet`)이 사용자 PATH에 없으면 `setx` 또는 레지스트리 직접 갱신
- 현재 LazyBuilder 프로세스의 자식 spawn에서는 즉시 사용 가능 (env.PATH 주입)
- 새 셸은 재시작 필요 → 안내 토스트

### 4.5 Verify — 사후 검증

설치 후 `EnvironmentService.scan()` 재실행 → 이전 요구사항이 모두 만족되는지 확인.
- 만족 → 초록 표시 + "Build now?"
- 불만족 → 사유 표시 (예: "PATH not picked up yet — restart your terminal")

### 4.6 Sync — 재현성

`lazybuilder toolchain sync`:
1. `global.json` 읽기
2. 현재 환경과 차이 계산
3. 차이가 있으면 자동 install (대화형은 propose 모달, headless는 즉시 실행)

`lazybuilder toolchain doctor`:
- global.json과 실제 설치본 어긋남 진단
- PATH 누락 진단
- side-by-side 충돌 감지

## 5. 데이터 모델

### 5.1 도메인 타입

```ts
// src/domain/models/ToolchainRequirement.ts
export type ToolchainKind = 'dotnet-sdk' | 'dotnet-runtime' | 'dotnet-workload';

export interface ToolchainRequirement {
  id: string;                       // stable hash for dedup
  kind: ToolchainKind;
  versionSpec: string;              // '8.0.405' | '8.0.x' | '>=6.0'
  resolvedVersion: string | null;   // pinned exact version after resolution
  reason: RequirementReason;
  currentlyInstalled: boolean;
  severity: 'required' | 'recommended';
}

export interface RequirementReason {
  source: 'global.json' | 'csproj' | 'directory.build.props' | 'inferred';
  filePath: string | null;
  detail: string;                   // "TargetFramework=net8.0"
  affectedProjects: string[];       // for UI grouping
}

// src/domain/models/InstallPlan.ts
export type InstallScope = 'user' | 'machine';

export interface InstallStep {
  id: string;
  displayName: string;              // ".NET SDK 8.0.405"
  kind: ToolchainKind;
  version: string;
  scope: InstallScope;
  needsAdmin: boolean;
  sizeBytes: number | null;         // null if unknown
  estimatedSeconds: number | null;
  source: { url: string; signer: string; channel: string };
  command: { executable: string; args: string[] };  // dry-run preview
  dependsOn: string[];              // other step IDs
  selected: boolean;
  reason: RequirementReason;
}

export interface InstallPlan {
  steps: InstallStep[];
  totalSizeBytes: number;
  estimatedSeconds: number;
  needsAdmin: boolean;
  updateGlobalJson: boolean;        // user-toggled
}

// src/domain/models/InstallProgress.ts
export type InstallStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled' | 'skipped';

export interface InstallStepProgress {
  stepId: string;
  status: InstallStepStatus;
  bytesDownloaded: number;
  bytesTotal: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  exitCode: number | null;
  errorMessage: string | null;
  logTail: string[];                // last N lines for UI
}

export interface InstallProgress {
  overallStatus: 'idle' | 'running' | 'done' | 'failed' | 'cancelled';
  steps: InstallStepProgress[];
  currentStepId: string | null;
}

// src/domain/models/InstallResult.ts
export interface InstallResult {
  plan: InstallPlan;
  progress: InstallProgress;
  durationMs: number;
  postScanSucceeded: boolean;
  pathUpdated: boolean;
  globalJsonUpdated: boolean;
  unresolvedRequirements: ToolchainRequirement[];
}
```

### 5.2 영속화

- `global.json`은 사용자 동의 시에만 갱신
- 별도 `toolchain.lock` 파일 도입 안 함 (.NET 표준 `global.json` 활용)
- 설치 이력은 기존 `~/.lazybuilder/install.log`에 append (감사 로그)

## 6. 아키텍처

```
UI (ToolchainModal, ToolchainTab?)
  ↓
Application (ToolchainService)
  ├─ plan(snapshot, projects) → InstallPlan
  ├─ apply(plan, onProgress) → AsyncIterator<InstallProgress>
  ├─ sync() → InstallResult
  └─ doctor() → DiagnosticItem[]
  ↓
Domain (toolchainRules)
  ├─ resolveRequirements(snapshot, projects) → ToolchainRequirement[]
  ├─ buildPlan(requirements, options) → InstallPlan
  └─ resolveVersion(spec, available) → string
  ↓
Infrastructure
  ├─ DotnetInstaller (dotnet-install.ps1 wrapper)
  ├─ GlobalJsonParser (read/write global.json)
  ├─ PathManager (read/write user PATH)
  └─ ProcessRunner (existing)
```

## 7. CLI / 헤드리스 표면

### 7.1 새 플래그

| 명령 | 설명 | 출력 |
|---|---|---|
| `lazybuilder --toolchain-plan` | 요구사항 분석 + 계획서 생성, 실행 안 함 | JSON `InstallPlan` |
| `lazybuilder --toolchain-apply [--yes]` | 계획서 실행 (대화형 또는 비대화형) | JSON `InstallResult` |
| `lazybuilder --toolchain-sync` | global.json 기반 자동 동기화 | JSON `InstallResult` |
| `lazybuilder --toolchain-doctor` | 진단만, 설치 안 함 | JSON `DiagnosticItem[]` |

추가 옵션:
- `--scope=user|machine`
- `--continue-on-error`
- `--update-global-json`
- `--dry-run` (실행 명령만 출력)

### 7.2 JSON 출력 예시

```json
{
  "ok": true,
  "plan": {
    "steps": [
      {
        "id": "dotnet-sdk-8.0.405",
        "displayName": ".NET SDK 8.0.405",
        "kind": "dotnet-sdk",
        "version": "8.0.405",
        "scope": "user",
        "needsAdmin": false,
        "sizeBytes": 280000000,
        "estimatedSeconds": 60,
        "source": {
          "url": "https://dot.net/v1/dotnet-install.ps1",
          "signer": "Microsoft",
          "channel": "8.0/STS"
        },
        "command": {
          "executable": "powershell",
          "args": ["-ExecutionPolicy", "Bypass", "-File",
                   "dotnet-install.ps1", "-Version", "8.0.405",
                   "-InstallDir", "C:\\Users\\you\\.dotnet"]
        },
        "dependsOn": [],
        "selected": true,
        "reason": {
          "source": "global.json",
          "filePath": "C:\\proj\\global.json",
          "detail": "sdk.version=8.0.405",
          "affectedProjects": ["App.csproj", "Lib.csproj", "Tests.csproj"]
        }
      }
    ],
    "totalSizeBytes": 280000000,
    "estimatedSeconds": 60,
    "needsAdmin": false,
    "updateGlobalJson": false
  }
}
```

## 8. 보안·신뢰성

### 8.1 무결성
- `dotnet-install.ps1`은 HTTPS로만 가져옴
- ExecutionPolicy는 `Bypass` 필요 (서명 없음 — Microsoft 공식이지만 unsigned 스크립트)
- 다운로드 후 파일 사이즈·버전 헤더 sanity check

### 8.2 권한
- User scope: 절대 admin 요구 안 함
- Machine scope: UAC 1회만 (이중 confirm 없음)
- LazyBuilder 자체는 비-elevated로 실행 — machine scope 단계만 `Start-Process -Verb RunAs`로 elevated PowerShell 띄움

### 8.3 롤백 / 안전장치
- side-by-side 설치 → 기존 SDK 보존
- 부분 실패 시 성공한 SDK는 유지 (사용자가 명시적으로 uninstall 가능)
- `--dry-run`으로 실행 전 명령 검증
- 모든 설치는 `~/.lazybuilder/install.log`에 append

### 8.4 네트워크
- 프록시: 시스템 프록시 자동 사용 (HTTP_PROXY / HTTPS_PROXY 환경변수)
- 오프라인: 명확한 에러 메시지 + "manual install" 가이드

## 9. 비기능 요구사항

| 항목 | 목표 |
|---|---|
| Plan 생성 시간 | < 200 ms (스캔 결과 메모리 재사용) |
| dotnet-install.ps1 캐시 | 24시간 |
| 진행률 업데이트 빈도 | 100 ms 이내 |
| Cancel 응답 시간 | 1초 이내 (안전 시점까지 대기 후 취소) |
| 설치 실패 시 TUI 살아있음 | 필수 |
| AI 헤드리스 출력 안정성 | 동일 stdin/cwd → 동일 JSON 보장 |

## 10. 수용 기준 (MVP DoD)

- [ ] 빈 .NET 환경에서 `lazybuilder --toolchain-apply --yes` 한 번이면 net8.0 csproj 빌드 가능
- [ ] global.json만 있으면 다른 PC에서 `lazybuilder --toolchain-sync` 한 번에 동일 SDK 셋업
- [ ] User scope 설치 시 UAC 안 뜸
- [ ] 설치 후 자동 재스캔으로 Diagnostics 빨간 줄이 초록으로 전환
- [ ] 부분 실패 시 성공 단계는 유지, 실패 단계 재시도 가능
- [ ] `--toolchain-plan --json`이 안정적인 스키마로 출력 (snapshot test)
- [ ] AI 에이전트가 Plan 받고 OK 토글 → apply 흐름 자율 수행 가능

## 11. 향후 확장 (참고)

- **Phase 2**: VS Build Tools / Windows SDK / CMake / Ninja
- **Phase 3**: macOS (brew) / Linux (apt/dnf) — dotnet-install.sh
- **Phase 4**: 사내 미러 / 에어갭 캐시 번들 / 조직 정책 화이트리스트
- **MCP 서버 노출**: `toolchain.plan`, `toolchain.apply` 툴을 MCP로 게시 → AI 에이전트의 1급 표면
