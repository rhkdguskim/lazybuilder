# Build Intelligence — 빌드 메트릭 수집·회귀 감지·플레이키 추적

> 매 빌드의 흔적을 데이터로 남기고, 시간 추세에서 회귀(regression)와 플레이키(flaky)를 자동 식별. LSP·MCP·Debugger가 모두 이 데이터를 소비.

## 1. 목적

### 1.1 한 줄 정의
빌드 결과를 시계열 메트릭으로 영속화하고, 통계적 이상(회귀·플레이키)을 자동 감지해 LSP/MCP/디버거가 활용할 수 있도록 노출.

### 1.2 풀고자 하는 문제
- "어제까진 빌드됐는데" 디버깅 시간 낭비
- 같은 커밋이 한 번은 성공, 한 번은 실패 (플레이키) — 원인 파악 어려움
- 빌드 시간 점진적 증가 — 임계점 넘기 전 모름
- AI 에이전트가 "최근 회귀 있나?" 같은 질문에 답할 데이터 없음

### 1.3 성공의 정의 (MVP)
1. 매 빌드 결과가 자동으로 `~/.lazybuilder/metrics.ndjson`에 영속화
2. `lazybuilder --regressions` 실행 1초 안에 최근 1주일 회귀 목록 표시
3. 같은 (project, gitCommit, configuration, platform) 조합에서 결과가 갈리는 경우 플레이키로 식별
4. AI 에이전트(MCP `get_metrics`)가 추세 데이터를 조회 가능

## 2. 범위

### 2.1 MVP
- ndjson 메트릭 영속화 (append-only)
- EWMA + 3σ 기반 회귀 감지 (duration, errorCount, warningCount)
- 같은 입력 차원 → 다른 결과 → 플레이키
- 헤드리스 CLI: `--regressions`, `--flaky`, `--metrics-export`

### 2.2 비-MVP (Phase B+)
- OTLP / Datadog / Grafana export
- 의존성 변화 attribution (어떤 패키지 업데이트가 회귀 원인?)
- 빌드 캐시 hit-rate
- 분산 빌드 메트릭 집계

## 3. 데이터 모델

### 3.1 메트릭 스키마 (`~/.lazybuilder/metrics.ndjson`)

```ts
type BuildMetricKind = 'build' | 'regression' | 'flaky';

interface BuildMetric {
  schema: 'lazybuilder/metrics/v1';
  ts: string;                    // ISO8601
  kind: BuildMetricKind;
  // identity
  projectId: string;             // hash(filePath)
  projectName: string;
  configuration: string;
  platform: string;
  // outcome
  exitCode: number;
  status: 'success' | 'failure' | 'cancelled';
  durationMs: number;
  errorCount: number;
  warningCount: number;
  // context (for attribution)
  gitCommit: string | null;
  toolchainHash: string;         // hash of resolved SDK/toolset/sdk versions
  envHash: string;               // hash of relevant env vars
  // optional
  cacheHit?: boolean;
  hostname?: string;
}

interface RegressionMetric extends Omit<BuildMetric, 'kind'> {
  kind: 'regression';
  metric: 'duration' | 'errors' | 'warnings';
  baseline: { mean: number; stddev: number; n: number };
  observed: number;
  deviationStddev: number;
  suspectedCauses?: string[];    // future: package diff
}

interface FlakyMetric extends Omit<BuildMetric, 'kind'> {
  kind: 'flaky';
  failureRate: number;
  sampleSize: number;
  windowDays: number;
}
```

### 3.2 영속화 규칙
- Append-only — 기존 라인 절대 수정/삭제 안 함
- 매일 새 파일 (`metrics-YYYYMMDD.ndjson`) — 7일 단위 rotation
- 30일 후 자동 archival (`metrics-YYYY-MM.ndjson.gz`)
- 사용자가 `~/.lazybuilder/`를 통째로 지워도 동작 (단순 ndjson append-only이므로)

## 4. 알고리즘

### 4.1 회귀 감지 — EWMA + 3σ

```
EWMA_t = α · x_t + (1-α) · EWMA_{t-1}
σ_t   = sqrt( α · (x_t - EWMA_{t-1})² + (1-α) · σ²_{t-1} )

α = 0.2 (last 5 builds carry ~67% of weight)

회귀 감지: x_t > EWMA_t + 3·σ_t  (duration의 경우)
         x_t < EWMA_t - 3·σ_t   (cacheHit 같은 비율 메트릭은 양방향)
```

**최소 표본**: n ≥ 10 빌드 이후에만 검사 (cold-start 오인 방지).

### 4.2 플레이키 감지

같은 `(projectId, configuration, platform, gitCommit, toolchainHash, envHash)` 조합에서 최근 N=10 빌드 중 success와 failure가 섞여 있고 failureRate ∈ [0.1, 0.9]이면 flaky.

### 4.3 회귀 원인 attribution (Phase B+)

회귀 감지 시 직전 정상 빌드와 비교:
1. `gitCommit` 변경 여부 → 코드 변경
2. `toolchainHash` 변경 여부 → SDK/toolset 변경
3. `envHash` 변경 여부 → 환경 변수 변화
4. (Phase B+) 의존성 lock 파일 diff → 패키지 업데이트

가장 변경된 차원을 `suspectedCauses`로 표기.

## 5. CLI

### 5.1 새 헤드리스 플래그

| 명령 | 설명 | 출력 |
|---|---|---|
| `lazybuilder --regressions [--days=7]` | 최근 회귀 목록 | JSON `BuildIntelligenceReport.regressions` |
| `lazybuilder --flaky [--days=7]` | 플레이키 빌드 목록 | JSON `BuildIntelligenceReport.flaky` |
| `lazybuilder --metrics-export [--format=ndjson|otel] [--since=ISO8601]` | 메트릭 export | NDJSON 또는 OTLP JSON |

### 5.2 출력 envelope

```jsonc
{
  "schema": "lazybuilder/v1",
  "kind": "BuildIntelligenceReport",
  "data": {
    "ok": true,
    "windowDays": 7,
    "totalBuilds": 47,
    "regressions": [
      {
        "ts": "2026-04-26T11:00:00Z",
        "projectName": "Engine.vcxproj",
        "metric": "duration",
        "observed": 12300,
        "baseline": { "mean": 5800, "stddev": 800, "n": 23 },
        "deviationStddev": 8.1,
        "suspectedCauses": ["toolchain-change"]
      }
    ],
    "flaky": [
      {
        "projectName": "Tests.csproj",
        "failureRate": 0.4,
        "sampleSize": 10,
        "windowDays": 7
      }
    ]
  }
}
```

## 6. 아키텍처

```
BuildService.execute()
       ↓ (on completion)
BuildIntelligenceService.record(BuildMetric)
       ↓
metrics.ndjson (append)

------------- query path -------------

CLI / MCP get_metrics / LSP push
       ↓
BuildIntelligenceService
   - load(window) → BuildMetric[]
   - detectRegressions(metrics) → RegressionMetric[]
   - detectFlaky(metrics) → FlakyMetric[]
   - export(format, range) → string
```

## 7. 통합 지점

- **BuildService**: 빌드 완료 시 `BuildIntelligenceService.record()` 호출 (기존 코드에 1줄 추가)
- **MCP Server (Phase A)**: `get_metrics`, `get_regressions`, `get_flaky` 툴
- **LSP Server (Phase C)**: 회귀 감지 시 솔루션 파일 상단에 `lazybuilder/regression` 커스텀 노티 push
- **Debug Service (Phase D)**: `debug.regression()` 가 회귀 빌드의 입력으로 디버그 세션 시작

## 8. 비기능

| 항목 | 목표 |
|---|---|
| record() 오버헤드 | < 5 ms (단순 fs.appendFile) |
| detectRegressions() | 1주일 데이터 (~수백 라인) < 100 ms |
| 디스크 사용 | 일반 사용자 < 10 MB / 30일 |
| ndjson 손상 시 | 깨진 라인 skip, 나머지 동작 |

## 9. 수용 기준 (MVP DoD)

- [ ] `npm run dev` 실행 + 빌드 1회 → metrics.ndjson에 1줄 추가됨
- [ ] 같은 빌드 30회 후 1번 의도적으로 느리게 만들면 `--regressions`에서 감지
- [ ] 같은 커밋 빌드를 5번 성공 / 5번 실패시키면 `--flaky`에서 감지
- [ ] `--metrics-export --format=ndjson` 안정 스키마 출력
- [ ] MCP `get_metrics({ days: 7 })` 호출 시 동일 데이터 반환
