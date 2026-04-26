import type {
  BuildMetric,
  RegressionMetric,
  FlakyMetric,
  BuildIntelligenceReport,
} from '../domain/models/BuildMetric.js';
import { MetricsStore } from '../infrastructure/intelligence/MetricsStore.js';
import { logger, errToLog } from '../infrastructure/logging/Logger.js';

const log = logger.child({ component: 'BuildIntelligenceService' });

const DEFAULT_WINDOW_DAYS = 7;
const EWMA_ALPHA = 0.2;
const MIN_SAMPLES_REGRESSION = 10;
const FLAKY_WINDOW = 10;
const FLAKY_LOWER = 0.1;
const FLAKY_UPPER = 0.9;

export interface ReportOptions {
  days?: number;
  projectId?: string;
}

export interface ExportOptions {
  since?: string; // ISO8601
  days?: number;
}

/**
 * Build Intelligence facade — see `docs/features/build-intelligence.md`.
 *
 * - `record()` persists a single completed-build metric.
 * - `report()` computes regressions + flaky over a trailing window.
 * - `detectRegressions()` / `detectFlaky()` are pure functions exposed for
 *   testability and reuse from MCP/LSP entrypoints.
 * - `exportNdjson()` streams raw lines for downstream pipelines.
 */
export class BuildIntelligenceService {
  private readonly store: MetricsStore;

  constructor(store?: MetricsStore) {
    this.store = store ?? new MetricsStore();
  }

  async record(metric: BuildMetric): Promise<void> {
    try {
      await this.store.append(metric);
    } catch (err) {
      log.warn('failed to append metric', errToLog(err));
    }
  }

  async report(opts: ReportOptions = {}): Promise<BuildIntelligenceReport> {
    const days = opts.days ?? DEFAULT_WINDOW_DAYS;
    const all = await this.store.loadWindow(days);
    const filtered = opts.projectId
      ? all.filter(m => m.projectId === opts.projectId)
      : all;
    const builds = filtered.filter(m => m.kind === 'build');
    const regressions = this.detectRegressions(builds);
    const flaky = this.detectFlaky(builds, days);
    return {
      ok: true,
      windowDays: days,
      totalBuilds: builds.length,
      regressions,
      flaky,
    };
  }

  /**
   * EWMA + 3σ regression detection per spec §4.1.
   *
   * - Group by `(projectId, configuration, platform)`.
   * - Order by timestamp ascending; need n ≥ 10 to evaluate.
   * - Only the latest build of each group is considered the candidate.
   * - For each tracked metric (duration, errors, warnings) the baseline EWMA
   *   and EWMA stddev are computed across the prior n-1 builds; if the latest
   *   observation deviates by more than 3σ a {@link RegressionMetric} is emitted.
   */
  detectRegressions(metrics: BuildMetric[]): RegressionMetric[] {
    const groups = new Map<string, BuildMetric[]>();
    for (const m of metrics) {
      if (m.kind !== 'build') continue;
      const key = `${m.projectId}|${m.configuration}|${m.platform}`;
      let bucket = groups.get(key);
      if (!bucket) {
        bucket = [];
        groups.set(key, bucket);
      }
      bucket.push(m);
    }

    const out: RegressionMetric[] = [];
    for (const bucket of groups.values()) {
      if (bucket.length < MIN_SAMPLES_REGRESSION) continue;
      bucket.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
      const latest = bucket[bucket.length - 1]!;
      const prior = bucket.slice(0, -1);

      const checks: Array<{
        metric: 'duration' | 'errors' | 'warnings';
        observed: number;
        series: number[];
      }> = [
        { metric: 'duration', observed: latest.durationMs, series: prior.map(p => p.durationMs) },
        { metric: 'errors', observed: latest.errorCount, series: prior.map(p => p.errorCount) },
        { metric: 'warnings', observed: latest.warningCount, series: prior.map(p => p.warningCount) },
      ];

      for (const check of checks) {
        const baseline = computeEwmaBaseline(check.series, EWMA_ALPHA);
        if (baseline.n < MIN_SAMPLES_REGRESSION - 1) continue;
        if (baseline.stddev <= 0) continue;
        const deviation = (check.observed - baseline.mean) / baseline.stddev;
        if (deviation > 3) {
          out.push({
            ...latest,
            kind: 'regression',
            metric: check.metric,
            baseline,
            observed: check.observed,
            deviationStddev: round(deviation, 2),
            suspectedCauses: inferSuspectedCauses(latest, prior),
          });
        }
      }
    }
    return out;
  }

  /**
   * Flaky detection per spec §4.2. Group by full input fingerprint and flag
   * groups with mixed outcomes whose failureRate falls in [0.1, 0.9].
   */
  detectFlaky(metrics: BuildMetric[], windowDays = DEFAULT_WINDOW_DAYS): FlakyMetric[] {
    const groups = new Map<string, BuildMetric[]>();
    for (const m of metrics) {
      if (m.kind !== 'build') continue;
      const key = [
        m.projectId,
        m.configuration,
        m.platform,
        m.gitCommit ?? '',
        m.toolchainHash,
        m.envHash,
      ].join('|');
      let bucket = groups.get(key);
      if (!bucket) {
        bucket = [];
        groups.set(key, bucket);
      }
      bucket.push(m);
    }

    const out: FlakyMetric[] = [];
    for (const bucket of groups.values()) {
      if (bucket.length < 2) continue;
      bucket.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
      const sample = bucket.slice(-FLAKY_WINDOW);
      const failures = sample.filter(m => m.status === 'failure').length;
      const failureRate = failures / sample.length;
      if (failureRate >= FLAKY_LOWER && failureRate <= FLAKY_UPPER) {
        const latest = sample[sample.length - 1]!;
        out.push({
          ...latest,
          kind: 'flaky',
          failureRate: round(failureRate, 3),
          sampleSize: sample.length,
          windowDays,
        });
      }
    }
    return out;
  }

  /** Stream metrics within `since` (ISO8601) or `days` window as ndjson lines. */
  async *exportNdjson(opts: ExportOptions = {}): AsyncIterable<string> {
    const days = opts.days ?? DEFAULT_WINDOW_DAYS;
    const all = await this.store.loadWindow(days);
    const cutoffMs = opts.since ? Date.parse(opts.since) : null;
    for (const m of all) {
      if (cutoffMs != null && Number.isFinite(cutoffMs)) {
        const ts = Date.parse(m.ts);
        if (!Number.isFinite(ts) || ts < cutoffMs) continue;
      }
      yield JSON.stringify(m) + '\n';
    }
  }

  /** Convenience accessor for headless callers that want raw rows. */
  async loadWindow(days: number): Promise<BuildMetric[]> {
    return this.store.loadWindow(days);
  }
}

interface EwmaBaseline {
  mean: number;
  stddev: number;
  n: number;
}

function computeEwmaBaseline(series: number[], alpha: number): EwmaBaseline {
  if (series.length === 0) return { mean: 0, stddev: 0, n: 0 };
  let ewma = series[0]!;
  let ewmaVar = 0;
  for (let i = 1; i < series.length; i++) {
    const x = series[i]!;
    const delta = x - ewma;
    ewmaVar = alpha * delta * delta + (1 - alpha) * ewmaVar;
    ewma = alpha * x + (1 - alpha) * ewma;
  }
  return {
    mean: round(ewma, 4),
    stddev: round(Math.sqrt(ewmaVar), 4),
    n: series.length,
  };
}

function inferSuspectedCauses(latest: BuildMetric, prior: BuildMetric[]): string[] | undefined {
  if (prior.length === 0) return undefined;
  const previous = prior[prior.length - 1]!;
  const causes: string[] = [];
  if ((latest.gitCommit ?? '') !== (previous.gitCommit ?? '')) causes.push('git-commit-change');
  if (latest.toolchainHash !== previous.toolchainHash) causes.push('toolchain-change');
  if (latest.envHash !== previous.envHash) causes.push('env-change');
  return causes.length > 0 ? causes : undefined;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
