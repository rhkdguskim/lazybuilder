# Debugger Phase D-1 MVP — DAP Client + netcoredbg + debug.snapshot

> 풀 명세는 `docs/features/debugger.md`. 이 문서는 **이 사이클에서 실제로 만들 MVP 스코프**.

## 1. MVP에 포함되는 것

### 1.1 DAP 클라이언트 (저수준 인프라)
- JSON-RPC over stdio 트랜스포트 (`Content-Length:` 프레이밍 — DAP 표준)
- 요청/응답/이벤트 핸들링
- Session lifecycle (start, stop, cleanup)
- timeout / cancellation

### 1.2 netcoredbg 통합 (.NET only)
- netcoredbg 설치 자동 감지 (PATH 또는 `~/.lazybuilder/cache/netcoredbg/`)
- 미설치 시 `Toolchain Resolver`에 새 kind `'netcoredbg'` 추가 (winget `Samsung.Netcoredbg`)
- Adapter spawn + initialize/launch handshake
- .NET 8.0 SDK style projects (`.csproj` + dotnet build → dll path 추출)

### 1.3 표준 DAP 매핑 (최소 셋)
- `setBreakpoints`
- `configurationDone`
- `continue`, `pause`
- `next` (step over), `stepIn`, `stepOut`
- `evaluate` (REPL context)
- `stackTrace`
- `scopes`, `variables`
- `threads`
- `terminate`

### 1.4 AI 친화 프리미티브 1개: `debug.snapshot`
유일한 *고수준* 도구. 한 번 호출에:
```jsonc
{
  "stoppedReason": "breakpoint",
  "thread": { "id": 1, "name": "Main" },
  "stack": [
    {
      "frame": 0,
      "file": "Order.cs",
      "line": 42,
      "method": "Order.Validate",
      "sourceSnippet": ["...", "...", "5 lines around 42", "...", "..."],
      "locals": { "items": "[3 items]", "total": 0, "discount": null }
    }
  ],
  "exception": null,
  "breakpoints": [{ "file": "Order.cs", "line": 42 }]
}
```
- maxStackFrames: default 10
- maxLocalsPerFrame: default 20
- sourceContextLines: default 5
- 변수 값은 string 표현 (DAP `Variable.value`), 깊은 트리는 reference로 stub만

### 1.5 MCP 통합 (`debug.*` 툴)
- `debug.start({ project, configuration?, args?, env? }) → { sessionId }`
- `debug.set_breakpoint({ sessionId, file, line, condition? }) → { breakpointId }`
- `debug.continue({ sessionId, threadId? }) → { stopped }`
- `debug.step_over/in/out({ sessionId, threadId? }) → { stopped }`
- `debug.evaluate({ sessionId, expression, frameId? }) → { value, type }`
- `debug.snapshot({ sessionId, ... }) → SnapshotPayload`
- `debug.terminate({ sessionId }) → { ok }`

### 1.6 CLI 진입점 (사람용 검증)
- `lazybuilder debug start <project>` → JSON envelope `DebugSession`
- `lazybuilder debug ...` 다음 명령들은 stdin/stdout JSON 라인 (나중에 TUI로 진화 가능)
- TUI Debug 탭은 **이 사이클에서는 만들지 않음** (D-1.5)

## 2. MVP에서 명시적으로 빼는 것

- TUI Debug 탭 (D-1.5)
- `debug.run_until_exception`, `debug.investigate_test`, `debug.observe`, `debug.trace_path`, `debug.bisect` (D-2)
- vsdbg / cppvsdbg / gdb / lldb 통합 (D-3)
- TTD replay (D-4)
- multi-thread debugging primitives (D-2)
- attach to process (D-1.5)

## 3. 아키텍처

```
src/debug/
├── DebuggerService.ts          # 세션 매니저 + 고수준 동작 (snapshot 등)
├── adapters/
│   ├── DapClient.ts            # JSON-RPC + Content-Length framing
│   └── NetcoredbgAdapter.ts    # netcoredbg launch/path 결정 + DapClient 위에서 동작
├── primitives/
│   └── snapshot.ts             # debug.snapshot 구현
└── session/
    ├── BreakpointStore.ts
    └── ThreadState.ts

src/cli/
└── debugCli.ts                 # lazybuilder debug 서브커맨드

src/mcp/tools/
└── debug.ts                    # MCP debug.* 툴 6개
```

## 4. DAP 메시지 프레이밍 (참고 — 표준)

```
Content-Length: 119\r\n
\r\n
{"seq":1,"type":"request","command":"initialize","arguments":{...}}
```

응답:
```
Content-Length: 87\r\n
\r\n
{"seq":2,"type":"response","request_seq":1,"command":"initialize","success":true,...}
```

이벤트 (e.g., `stopped`):
```
Content-Length: 62\r\n
\r\n
{"seq":3,"type":"event","event":"stopped","body":{"reason":"breakpoint","threadId":1}}
```

## 5. netcoredbg 설치/감지 정책

1. PATH에 `netcoredbg` (or `netcoredbg.exe`) 있으면 사용
2. 없으면 `~/.lazybuilder/cache/netcoredbg/netcoredbg.exe` 확인
3. 둘 다 없으면 ToolchainRequirement 추가 (`kind: 'netcoredbg'`)
4. Toolchain Resolver가 `winget install Samsung.Netcoredbg` 또는 GitHub releases에서 zip 다운로드 → 캐시

이번 사이클에 자동 설치까지 만들지는 옵션 — **detection + 명확한 안내까지가 MVP**, 자동 설치는 nice-to-have.

## 6. 권한 / 보안

- `debug.start` — 도구 호출로 OK
- `debug.attach` — **MVP에 없음**
- 빌드 산출물 (.dll, .pdb) 경로만 launch 인자로 받음. 임의 binary 실행 X
- 세션 id는 random UUID. 외부 노출 X

## 7. 비기능

| 항목 | 목표 |
|---|---|
| netcoredbg 시작 → DAP initialize 완료 | < 3초 |
| `debug.snapshot()` 응답 | < 200 ms (10 frames, 20 locals) |
| Per-session 메모리 | < 200 MB (debugger 별도 프로세스) |
| Lifecycle: lazybuilder 종료 시 자식 cleanup | 필수 |

## 8. 수용 기준 (DoD)

- [ ] netcoredbg 감지 정상 (있으면 path 반환, 없으면 명확한 에러)
- [ ] `lazybuilder debug start <test.csproj>` 실행 → 세션 ID 반환
- [ ] `debug.set_breakpoint` 후 `debug.continue` → break 발생 시 `stopped` 이벤트 수신
- [ ] `debug.snapshot()` 한 호출에 stack + locals + source snippet 반환
- [ ] `debug.terminate` 시 자식 프로세스 cleanup (좀비 0)
- [ ] PDB 누락 시 명확한 에러 메시지
- [ ] MCP `debug.*` 툴 6개가 카탈로그에 노출
- [ ] 단일 세션 강제 (두 번째 start는 명확히 거부)

## 9. AI 사용 시나리오 (D-2가 없어도 데모 가능한 범위)

```
User: "이 테스트 왜 실패해?"
AI:
  1. debug.start({ project: "Tests.csproj", args: ["--filter", "OrderTest_NullItems"] })
  2. (테스트 프레임워크 실행 → exception 발생 → 자동 break or terminated)
     - MVP에선 사용자가 미리 breakpoint 걸거나 exception break 옵션 활용
  3. debug.snapshot()
  4. → AI가 stack + locals 보고 원인 추론
```

D-2 없이도 "AI가 디버그 세션을 통제한다"는 가치는 70% 달성. D-2의 고수준 프리미티브는 토큰 효율과 자율성을 더 높이는 것.

## 10. 향후 자연스러운 확장 (별도 사이클)

- D-1.5: TUI Debug 탭 + `attach` 지원
- D-2: AI 친화 프리미티브 5개 (run_until_exception, investigate_test, observe, trace_path, bisect)
- D-3: vsdbg / cppvsdbg / gdb / lldb 통합
- D-4: TTD replay
