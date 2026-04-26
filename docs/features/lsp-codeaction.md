# LSP Phase C-3 — codeAction (Install missing SDK)

> 에디터 안에서 빨간 줄을 클릭 → Toolchain Resolver 호출 → 설치 완료 → 자동 재진단 초록. LazyBuilder의 가장 강력한 단일 데모.

## 1. 목적

기존 LSP Phase C-1(diagnostic + hover)에 **quick-fix code action**을 얹어, 사용자가 에디터를 떠나지 않고 환경 문제를 해결할 수 있게 함.

## 2. 범위 (Phase C-3 MVP)

### 2.1 포함
- `textDocument/codeAction` 프로바이더
- 진단 코드 `DIAG003` (TFM SDK 없음), `DIAG002` (global.json SDK 불일치)에 대해 quick-fix 제공
- `workspace/executeCommand` 핸들러: `lazybuilder.toolchain.apply`
- 명령 실행 중 LSP `$/progress` 노티 (구간 진행률)
- 명령 완료 후 자동 재진단 (`textDocument/publishDiagnostics` refresh)

### 2.2 비-포함 (다음 단계)
- "Pin SDK to global.json" code action — Phase C-3.5
- C++ PlatformToolset code action (B2 완료 후)
- Custom notifications (`lazybuilder/regression`)
- VS Code 확장 패키징

## 3. UX 흐름

```
[에디터 상태]
  .csproj 라인 3에 빨간 줄: "DIAG003: No SDK for net8.0"
  사용자가 라인 3에 커서 → 💡 lightbulb 표시
  
[클릭]
  Quick fix 메뉴:
    → Install .NET 8 SDK (no admin, ~280 MB)
  
[선택 시]
  LSP $/progress 노티 시작
  Toolchain Resolver가 dotnet-install.ps1 실행
  진행률이 에디터 status bar에 표시
  
[완료]
  토스트: "✓ .NET 8 SDK installed"
  자동 재스캔 → 빨간 줄 사라짐
```

## 4. Code Action 명세

### 4.1 Action 모양

```ts
{
  title: "Install .NET 8 SDK (no admin, ~280 MB)",
  kind: "quickfix",
  diagnostics: [<the original DIAG003 diagnostic>],
  command: {
    title: "Install via LazyBuilder",
    command: "lazybuilder.toolchain.apply",
    arguments: [{
      stepIds: ["dotnet-sdk-8.0.x"],
      scope: "user",
      sourceUri: "file:///proj/App.csproj",
    }],
  },
}
```

### 4.2 진단 → action 매핑

| Diagnostic code | Action title 패턴 | confirmedSteps 산출 방법 |
|---|---|---|
| `DIAG003` (No SDK for net8.0) | `Install .NET 8 SDK (no admin, ~280 MB)` | TFM에서 추출한 major.minor → `dotnet-sdk-X.Y.x` |
| `DIAG002` (global.json mismatch) | `Install .NET <version> SDK (no admin, ~280 MB)` | global.json의 `sdk.version` → `dotnet-sdk-<version>` |

### 4.3 확장 가능성

이번 사이클에 만들지는 않지만, 같은 핸들러가 미래에 다음을 지원해야 함:
- `DIAG004` (.NET Framework needs MSBuild) → Install Build Tools (B2 후)
- VS Build Tools workload 누락 → workload action (B2 후)

## 5. executeCommand 핸들러

```ts
// lazybuilder.toolchain.apply
{
  arguments: [{
    stepIds: string[];          // confirmedSteps for ToolchainService
    scope?: 'user' | 'machine'; // default 'user'
    sourceUri?: string;         // for re-publish targeting
  }]
}
```

**동작**:
1. 기존 `ToolchainService.plan()`을 한 번 다시 실행 (snapshot+projects 재사용)
2. `step.id ∈ stepIds`인 step만 `selected: true`로 필터
3. `ToolchainService.apply(plan, {onProgress})` 호출
4. 각 progress 콜백마다 LSP `$/progress` 노티 전송
   - `kind: 'begin'` (시작) / `kind: 'report'` (각 step) / `kind: 'end'` (완료)
5. 완료 후 워크스페이스 컨텍스트 무효화 + 모든 열린 .csproj/global.json 도큐먼트에 `publishDiagnostics` 재발송

**진행률 페이로드**:
```ts
{
  token: <progressToken>,
  value: {
    kind: 'report',
    message: 'Installing .NET 8 SDK 8.0.405 (3/3) — 240 MB / 280 MB',
    percentage: 86,
  }
}
```

## 6. 클라이언트 capability negotiation

```ts
// initialize result에 추가
capabilities: {
  textDocumentSync: TextDocumentSyncKind.Incremental,
  hoverProvider: true,
  diagnosticProvider: { ... },
  codeActionProvider: {
    codeActionKinds: [CodeActionKind.QuickFix],
  },
  executeCommandProvider: {
    commands: ['lazybuilder.toolchain.apply'],
  },
  // window/workDoneProgress already supported via ProposedFeatures.all
}
```

## 7. 아키텍처

```
src/lsp/
├── server.ts                          # add codeAction + executeCommand handlers
├── providers/
│   ├── codeActionProvider.ts          # NEW — diagnostic → CodeAction[]
│   └── ...
└── commands/
    └── toolchainApplyCommand.ts       # NEW — executeCommand handler
```

`commands/toolchainApplyCommand.ts`는 기존 `ToolchainService`를 호출하고 `connection.window.createWorkDoneProgress()` 또는 클라이언트 토큰 기반 progress를 발행.

## 8. 비기능

| 항목 | 목표 |
|---|---|
| codeAction 응답 시간 | < 50 ms (캐시된 ctx 사용) |
| 진행률 업데이트 빈도 | step 단위 + 다운로드 byte progress |
| 동시 실행 | 단일 세션 내 1개 명령만 (큐잉 안 함, 두 번째 호출은 즉시 에러) |
| Cancel | progress token으로 취소 가능 |

## 9. 수용 기준 (DoD)

- [ ] 빈 SDK 환경 + .csproj `net8.0` → `textDocument/codeAction` 호출 시 1개 quick-fix 반환
- [ ] quick-fix 선택 (executeCommand 호출) → ToolchainService.apply 실행
- [ ] 실행 중 `$/progress` 노티가 실제로 흐름
- [ ] 완료 후 `publishDiagnostics`가 빈 배열로 재발송
- [ ] global.json 진단에서도 동일 흐름 동작
- [ ] 같은 명령 동시 호출 시 두 번째는 거부 (에러 응답)
- [ ] LSP capability에 codeActionProvider, executeCommandProvider 노출

## 10. Phase C-3 이후 자연스러운 확장

- "Pin SDK version to global.json" — codeAction
- "Migrate to SDK-style project (legacy → modern)" — refactor codeAction
- VS Build Tools 누락 → C++ codeAction (B2 완료 후)
- 디버거 부착 codeAction (B3 D-1 완료 후)
