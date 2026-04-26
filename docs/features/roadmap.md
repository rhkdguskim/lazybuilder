# LazyBuilder Roadmap — AI 코딩 시대의 빌드/디버그 인프라

> 단순 "빌드 도구"에서 → "AI가 자율적으로 빌드·진단·디버깅하는 1급 표면"으로의 진화 로드맵.

## 비전

```
AI Agent (Claude / Cursor / Cline / OpenAI / ...)
        ↓ MCP
┌─────────────────────────────────────────────┐
│             LazyBuilder Platform            │
│                                              │
│  Toolchain  Build      Diagnostic   Debug   │
│  Resolver   Service    Engine       Service │
│      ↑          ↑           ↑           ↑   │
│    LSP        Build       Project    DAP    │
│    Server    Intelligence  Scanner   Client │
│                                              │
└─────────────────────────────────────────────┘
        ↓                              ↓
   Editors (VS Code,             Debug Adapters
   Neovim, Helix, JetBrains)     (vsdbg, netcoredbg,
                                  cppvsdbg, gdb)
```

## Phase 매트릭스

| Phase | 기능 | 상태 | 핵심 가치 |
|---|---|---|---|
| 0 | Build TUI + Headless JSON | ✅ shipped | 인간 + AI 양립 표면 |
| 0 | Toolchain Resolver | ✅ shipped (MVP) | 환경 자동 셋업 |
| **A** | **MCP Server** | 🚧 in progress | 모든 기능을 AI 표면으로 노출 |
| **B** | **Build Intelligence** | 🚧 in progress | 회귀·플레이키 자동 감지 |
| **C** | **LSP Server** | 🚧 in progress | 에디터 통합 (빌드 파일 IDE 지원) |
| **D** | **Debugger** | 📋 spec only | DAP + AI 친화 디버그 프리미티브 |

---

## Phase A — MCP Server

**목적**: 이미 만든 모든 service를 AI 에이전트가 호출할 수 있는 1급 도구로 노출.

**MVP 툴 카탈로그**:
- `scan_environment` — `EnvironmentService.scan()` 래핑
- `scan_projects` — `ProjectScanService.scan()` 래핑
- `run_diagnostics` — `DiagnosticsService.analyze()` 래핑
- `toolchain_plan` / `toolchain_apply` — Phase 0 자산 노출
- `build` — `BuildService.execute()` 래핑 (스트리밍 로그)
- `get_metrics` — Phase B의 Build Intelligence 데이터

**전송**: stdio MCP (Claude Code 표준).

**기동**: `lazybuilder mcp` 서브커맨드 → 표준 MCP 핸드셰이크 후 도구 노출.

상세: [`mcp-server.md`](./mcp-server.md)

---

## Phase B — Build Intelligence

**목적**: 빌드 메트릭 수집 + 회귀/플레이키 감지 + 시간 추세 추적.

**MVP**:
- 매 빌드 종료 시 `~/.lazybuilder/metrics.ndjson`에 한 줄 append
- `BuildIntelligenceService.detectRegressions()` — EWMA + 3σ
- `BuildIntelligenceService.detectFlaky()` — 같은 커밋의 success/failure 분산
- 헤드리스 명령:
  - `lazybuilder --metrics-export [--format=json|otel]`
  - `lazybuilder --regressions` — 최근 회귀 목록
  - `lazybuilder --flaky` — 플레이키 빌드 목록

**향후 (Phase B+)**:
- Grafana/Datadog OTLP export
- 의존성 변화 attribution
- 빌드 캐시 hit-rate 추적

상세: [`build-intelligence.md`](./build-intelligence.md)

---

## Phase C — LSP Server

**목적**: 에디터에서 빌드 파일 (`.csproj`, `.sln`, `global.json`, `Directory.Build.props`)에 IDE 수준 지원.

**MVP (Phase C-1)**:
- `textDocument/diagnostic` — 기존 룰 엔진 재활용
- `textDocument/hover` — TFM/SDK/Toolset 호버 정보
- `lazybuilder lsp` 서브커맨드 (stdio JSON-RPC)

**Phase C-2**:
- `textDocument/completion` — TFM, PlatformToolset, Configuration 후보
- `workspace/symbol` — 솔루션 트리

**Phase C-3 ★ 차별화**:
- `textDocument/codeAction` — "Install missing SDK" → Toolchain Resolver 호출
- `textDocument/codeAction` — "Pin SDK to global.json"
- Build Intelligence push 노티 (커스텀 노티)

**Phase C-4 (선택)**:
- Live build error overlay
- VS Code 확장 (lazybuilder.vsix)

상세: [`lsp-server.md`](./lsp-server.md)

---

## Phase D — Debugger

**목적**: AI가 직접 디버깅하는 첫 도구. DAP 클라이언트 + AI 친화 고수준 프리미티브.

**MVP (Phase D-1)**:
- DAP 클라이언트 (JSON-RPC over stdio)
- netcoredbg 통합 (.NET, MIT 라이선스)
- 표준 DAP 매핑: setBreakpoint / continue / step / evaluate / stackTrace
- TUI Debug 탭

**Phase D-2 ★ 차별화**:
- `debug.snapshot()` — 한 호출에 전체 상태
- `debug.run_until_exception()`
- `debug.investigate_test()`
- `debug.observe()` / `debug.trace_path()`

**Phase D-3**:
- vsdbg/cppvsdbg 자동 감지 (사용자 VS 라이선스 활용)
- gdb/lldb DAP 어댑터 (cross-platform native)
- MCP `debug.*` 툴 표면

**Phase D-4 (미래)**:
- TTD replay (Windows Time Travel Debugging)
- AI 주도 bisect / regression auto-debug

상세: [`debugger.md`](./debugger.md)

---

## 통합 시너지

각 Phase가 **독립 가치 + 결합 시 폭발력**을 갖도록 설계:

```
Phase A (MCP) × Phase B (Intelligence)
  → AI가 "이 솔루션 최근 회귀 있나?" 자율 질의

Phase A (MCP) × Phase C (LSP)
  → AI가 LSP의 진단을 직접 받아 코드 수정

Phase B (Intelligence) × Phase C (LSP)
  → 회귀/플레이키 알림이 에디터 사이드바에 인라인 표시

Phase A (MCP) × Phase D (Debugger)
  → AI가 빌드 → 실패 → 자율 디버그 → 수정 → 재빌드 사이클 수행

Phase 0 (Toolchain) × 모든 Phase
  → "필요한 도구 없음" 진단 어디서 발생하든 즉시 자동 셋업 액션 노출
```

## 출시 일정 (sprint = 1주)

| Sprint | 산출물 |
|---|---|
| 1 (현재) | Phase A/B/C-1 동시 출시 (이 세션) |
| 2 | Phase C-2 — completion, workspace/symbol |
| 3 | Phase C-3 — code actions + Toolchain Resolver 연동 |
| 4 | Phase B+ — OTLP export, dependency attribution |
| 5 | Phase D-1 — DAP 클라이언트 + netcoredbg |
| 6 | Phase D-1 — TUI Debug 탭 |
| 7 | Phase D-2 — AI 친화 프리미티브 |
| 8 | Phase D-3 — MCP debug.* 통합 |
| 9 (선택) | VS Code 확장 패키징 |
| 10 (미래) | Phase D-4 — TTD replay |

## 비-목표 (여전히 적용)

- 코드 편집기 기능 (LSP는 빌드 파일 한정)
- 완전한 IDE 대체
- 원격 빌드 오케스트레이션
- 에이전트 호스팅 (LazyBuilder는 *도구*, 에이전트 자체는 사용자가 가져옴)

## 비-목표 (이번 사이클 한정)

- VS Build Tools / Windows SDK / CMake 자동 설치 (Toolchain Phase 2)
- 에어갭 / 사내 미러 (Toolchain Phase 4)
- Distributed build cache (별도 트랙)
- License compliance scan (별도 트랙)

## 의존성 그래프

```
Phase 0 (existing)
    ↓
Phase B (BuildIntelligenceService)
    ↓
Phase A (MCP) ←—→ Phase C (LSP)
    ↓                    ↓
Phase D (Debugger) ──────┘
```

Phase A/B/C는 **병렬 가능**, Phase D는 A 완료 후 가장 큰 가치.
