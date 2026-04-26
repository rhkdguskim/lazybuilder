# Debugger — DAP 클라이언트 + AI 친화 디버그 프리미티브

> AI가 직접 .NET / C++ 애플리케이션을 디버깅하는 첫 도구. Debug Adapter Protocol을 표준 트랜스포트로 사용하고, 그 위에 AI가 한 번의 도구 호출로 의미 있는 작업을 할 수 있는 고수준 프리미티브를 얹음.

> ⚠️ **이 문서는 명세 단계입니다 (구현 미시작).** Phase D는 Phase A/B/C가 안정화된 후 시작.

## 1. 목적

### 1.1 한 줄 정의
LazyBuilder를 DAP 클라이언트로 만들어 vsdbg/netcoredbg/cppvsdbg/gdb 같은 검증된 디버거 엔진을 드라이브하고, AI 에이전트가 자율적으로 디버깅할 수 있는 고수준 도구 표면을 MCP로 제공.

### 1.2 풀고자 하는 문제
- AI 에이전트는 코드를 짜지만 *디버그* 못함 → 런타임 오류는 사람이 IDE 띄워서 처리
- VS Code는 디버거 있지만 AI에 노출 안 됨
- 표준 DAP는 너무 저수준 (continue/step/evaluate 단위) → AI 토큰 효율 끔찍
- 결과: AI가 "왜 이게 죽지?" 질문에 코드만 보고 추측

### 1.3 성공의 정의 (MVP)
1. `lazybuilder debug start <project>` → netcoredbg로 .NET 프로세스 디버그 시작
2. TUI에서 break/continue/step/locals 동작
3. MCP `debug.snapshot()` 한 번 호출에 AI가 추론할 모든 컨텍스트 반환
4. AI가 `debug.investigate_test()` 한 번 호출로 실패 테스트 자동 분석

## 2. 범위

### 2.1 Phase D-1 (MVP)
- DAP 클라이언트 (JSON-RPC over stdio)
- netcoredbg 통합 (.NET, MIT)
- 표준 DAP 매핑: setBreakpoint, continue, step, evaluate, stackTrace, variables
- TUI Debug 탭 (사람용)

### 2.2 Phase D-2 — AI 친화 프리미티브 ★
- `debug.snapshot()` — 현재 시점 전체 상태 응축
- `debug.run_until_exception()`
- `debug.investigate_test()`
- `debug.observe()` / `debug.trace_path()` / `debug.bisect()`

### 2.3 Phase D-3 — 백엔드 확장 + MCP 표면
- vsdbg/cppvsdbg 자동 감지 (사용자 VS 라이선스 활용)
- gdb/lldb DAP 어댑터 (cross-platform native)
- MCP `debug.*` 툴

### 2.4 Phase D-4 (미래)
- TTD replay (Windows Time Travel Debugging)
- AI 주도 bisect / regression auto-debug
- Conditional snapshots (조건 만족 시 자동 캡처)

## 3. 디버거 백엔드 매트릭스

| 타깃 | 엔진 | 라이선스 | 번들 가능 | MVP |
|---|---|---|---|---|
| .NET (managed) | **netcoredbg** | MIT, Samsung | ✓ | ★ |
| .NET (managed) | **vsdbg** | VS family only | ✗ — 자동 감지만 | Phase D-3 |
| C++ (Windows) | **cppvsdbg** | VS family only | ✗ — 자동 감지만 | Phase D-3 |
| C++ (Unix) | **gdb / lldb** + adapter | GPL/Apache | 시스템 패키지 | Phase D-3 |
| Native advanced | **WinDbg + TTD** | MS Tools | ✗ | Phase D-4 |

**라이선스 정책**: 우리 패키지는 netcoredbg만 번들/안내. vsdbg는 사용자 VS/VS Code 설치본을 *발견*만 함.

## 4. 아키텍처

```
┌─────────────────────────┐
│   Consumer Surfaces     │
│  TUI Debug Tab │ MCP    │
└──────────┬──────────────┘
           │
┌──────────▼──────────────┐
│  DebuggerService        │
│  - Session lifecycle    │
│  - State snapshot       │
│  - High-level actions   │
└──────────┬──────────────┘
           │ DAP over stdio (JSON-RPC)
┌──────────▼──────────────┐
│  Debug Adapter Process  │
│  netcoredbg / vsdbg /   │
│  cppvsdbg / gdb         │
└──────────┬──────────────┘
           │ native debug API
┌──────────▼──────────────┐
│  Target .NET / native   │
│  process                │
└─────────────────────────┘
```

```
src/debug/
├── DebuggerService.ts        # 세션 매니저 + 고수준 동작
├── adapters/
│   ├── DapClient.ts          # JSON-RPC over stdio
│   ├── NetcoredbgAdapter.ts  # netcoredbg 인자/통신 차이 흡수
│   └── VsdbgAdapter.ts       # (Phase D-3)
├── primitives/
│   ├── snapshot.ts           # debug.snapshot() 구현
│   ├── runUntilException.ts
│   ├── investigateTest.ts
│   ├── observe.ts
│   └── tracePath.ts
└── session/
    ├── BreakpointStore.ts
    ├── ThreadState.ts
    └── EvaluationCache.ts
```

## 5. MCP 툴 표면 (Phase D-3)

### 5.1 Layer 1 — DAP 매핑 (저수준)
| 툴 | 인자 | 반환 |
|---|---|---|
| `debug.start` | { project, configuration?, args?, env? } | { sessionId } |
| `debug.attach` | { pid } | { sessionId } |
| `debug.set_breakpoint` | { sessionId, file, line, condition?, hitCount?, logMessage? } | { breakpointId } |
| `debug.list_breakpoints` | { sessionId } | { breakpoints[] } |
| `debug.remove_breakpoint` | { sessionId, breakpointId } | { ok } |
| `debug.continue` | { sessionId, threadId? } | { stopped? } |
| `debug.step_over/in/out` | { sessionId, threadId? } | { stopped? } |
| `debug.pause` | { sessionId, threadId? } | { ok } |
| `debug.evaluate` | { sessionId, expression, frameId? } | { value, type } |
| `debug.set_variable` | { sessionId, frameId, name, value } | { ok } |
| `debug.terminate` | { sessionId } | { ok } |

### 5.2 Layer 2 — AI 친화 프리미티브 ★ 차별화 핵심

#### `debug.snapshot`
```jsonc
{
  "name": "debug.snapshot",
  "description": "Capture the entire debug state at the current stop point in a single AI-readable JSON.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "sessionId": { "type": "string" },
      "maxStackFrames": { "type": "number", "default": 10 },
      "maxLocalsPerFrame": { "type": "number", "default": 20 },
      "sourceContextLines": { "type": "number", "default": 5 }
    }
  }
}
```
**반환**:
```jsonc
{
  "stoppedReason": "breakpoint" | "exception" | "step" | ...,
  "thread": { "id": 1, "name": "Main" },
  "stack": [
    {
      "frame": 0,
      "file": "Order.cs",
      "line": 42,
      "method": "Order.Validate",
      "sourceSnippet": ["string lines around line 42"],
      "locals": { "items": "[3 items]", "total": 0, "discount": null }
    }
  ],
  "exception": { "type": "NullReferenceException", "message": "...", "stack": "..." } | null,
  "watches": { "this.IsValid": false }
}
```
→ **AI 한 호출 = 추론에 필요한 모든 컨텍스트**.

#### `debug.run_until_exception`
첫 unhandled exception까지 실행 → snapshot 반환.

#### `debug.investigate_test`
입력: `{ filter, framework: "xunit"|"nunit"|"mstest" }`. xunit/nunit/mstest 어댑터 통해 실패 테스트 자동 break + snapshot.

#### `debug.observe`
입력: `{ expression, maxSteps }`. 모든 step에서 expression 평가, 변화 트레이스 반환.

#### `debug.trace_path`
입력: `{ method }`. 메서드 모든 라인에 logpoint(중단 안 하는 로그) 설치 → 실행 → 라인별 통과 + locals 트레이스.

#### `debug.bisect`
입력: `{ low_line, high_line, hypothesis }`. AI 가설 기반 자동 이진 탐색.

### 5.3 Layer 3 — LazyBuilder 통합
| 툴 | 동작 |
|---|---|
| `debug.run_failing_build_target` | 마지막 빌드의 실패 타깃 자동 디버그 시작 |
| `debug.from_diagnostic` | LSP/Diagnostics 항목 → 관련 라인 break + 시작 |
| `debug.regression` | Build Intelligence 회귀 빌드 → 입력으로 디버그 |

## 6. 권한 모델

| 도구 | 부작용 | 동의 모델 |
|---|---|---|
| debug.start | 프로세스 spawn | 도구 호출로 OK |
| **debug.attach** | **임의 프로세스 인젝션** | **MCP 권한 명시 opt-in 필수** |
| debug.terminate | 프로세스 kill | 도구 호출로 OK |
| debug.set_variable | 메모리 변경 | 도구 호출로 OK (디버그 세션 중) |
| 외부 노출 attach (포트 listen) | 원격 디버깅 | **불허 — MVP는 로컬 only** |

## 7. AI 사용 시나리오

### 7.1 테스트 실패 자율 분석
```
User: "OrderValidationTests.ValidateAsync_NullItems 실패 원인 알려줘"
AI:
  1. debug.investigate_test({ filter: "ValidateAsync_NullItems", framework: "xunit" })
  2. → snapshot returned: NullReferenceException at Order.cs:42
  3. debug.evaluate({ expression: "this.Items?.Count" })
  4. → null
  5. "원인: Order 생성자에서 Items 검증 안 함. 수정 위치: Order.cs:18"
```

### 7.2 회귀 자동 추적 (Phase B 연동)
```
Build Intelligence: "Engine.vcxproj 1주일간 가끔 깨짐"
AI:
  1. debug.regression({ buildId: "..." })
  2. → 동일 입력 재현, 분기 차이 위치 자동 break
  3. snapshot → DateTime.Now 사용 분기 발견
  4. "타임존 의존 코드. UtcNow로 교체 권장"
```

### 7.3 변수 추적
```
User: "totalPrice가 음수가 됨"
AI:
  1. debug.observe({ expression: "totalPrice", maxSteps: 200 })
  2. → trace: line 87 = 100, line 92 = -50
  3. debug.evaluate({ expression: "discount", frameId: line92 })
  4. "ApplyDiscount이 percentage 아닌 absolute로 들어옴. 단위 불일치."
```

## 8. 비기능

| 항목 | 목표 |
|---|---|
| 디버그 세션 시작 | < 3 s (netcoredbg attach) |
| `debug.snapshot()` 응답 | < 200 ms (10 frames, 20 locals/frame) |
| 메모리 (debugger 별도 프로세스) | < 200 MB |
| 다중 세션 | MVP는 단일 세션, Phase D-2에서 멀티 |
| 세션 lifecycle | MCP 서버/TUI 종료 시 자식 디버거 강제 cleanup |
| Source mapping | PDB/symbol 자동 감지, 빌드 시 portable PDB 권장 |

## 9. 트레이드오프 / 리스크

| 리스크 | 완화 |
|---|---|
| DAP 메시지 폭증 (스텝마다 수십) | 응축 도구(`snapshot`)로 AI에 전달 |
| 디버거 프로세스 좀비 | 명시적 cleanup, parent process 종료 시 child kill |
| 타임아웃 (디버거 멈춤) | DAP 요청마다 timeout, cancel 가능 |
| PDB 없음 → 소스 매핑 실패 | 빌드 단계에서 `<DebugType>portable</DebugType>` 권장 + 누락 진단 |
| AI 무한 step | per-session step budget |
| multi-thread 복잡성 | Layer 1은 single-thread 가정, multi-thread 도구 별도 분리 |
| vsdbg 라이선스 | 번들 금지, 자동 감지만 |
| Production attach 보안 | MCP 권한 모델 — `debug.attach`는 명시적 opt-in 필요 |

## 10. 수용 기준 (Phase D-1 MVP DoD)

- [ ] `lazybuilder debug start <project.csproj>` 실행 → netcoredbg 시작, attach 성공
- [ ] TUI Debug 탭에서 break / continue / step 동작
- [ ] `debug.set_breakpoint` 후 break 발생 시 stack/locals 표시
- [ ] 세션 종료 시 netcoredbg 자식 프로세스 cleanup 확인
- [ ] PDB 누락 시 명확한 에러 메시지

### Phase D-2 추가 DoD
- [ ] `debug.snapshot()` 한 호출에 stack + locals + source snippet 반환
- [ ] `debug.run_until_exception()` 첫 예외 자동 break
- [ ] `debug.investigate_test()` xunit 실패 테스트 자동 분석
- [ ] `debug.observe()` 변수 변화 트레이스

## 11. 출시 일정 (sprint = 1주)

| Sprint | 산출물 |
|---|---|
| 5 | DAP 클라이언트 + netcoredbg 통합 |
| 6 | TUI Debug 탭 |
| 7 | AI 친화 프리미티브 (snapshot, run_until_exception, investigate_test) |
| 8 | MCP debug.* 통합 |
| 9 (선택) | vsdbg 자동 감지, gdb/lldb |
| 10 (미래) | TTD replay |
