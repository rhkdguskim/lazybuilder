/**
 * Build Intelligence — metric data model.
 *
 * Each completed build emits a {@link BuildMetric} record that is appended to
 * a daily ndjson file under `~/.lazybuilder/`. The same shape is reused as a
 * base for derived signals: {@link RegressionMetric} and {@link FlakyMetric}.
 *
 * See `docs/features/build-intelligence.md` §3.1 for the canonical schema.
 */

export type BuildMetricKind = 'build' | 'regression' | 'flaky';

export type BuildMetricStatus = 'success' | 'failure' | 'cancelled';

export interface BuildMetric {
  schema: 'lazybuilder/metrics/v1';
  ts: string;
  kind: BuildMetricKind;

  // identity
  projectId: string;
  projectName: string;
  configuration: string;
  platform: string;

  // outcome
  exitCode: number;
  status: BuildMetricStatus;
  durationMs: number;
  errorCount: number;
  warningCount: number;

  // context (for attribution)
  gitCommit: string | null;
  toolchainHash: string;
  envHash: string;

  // optional
  cacheHit?: boolean;
  hostname?: string;
}

export interface RegressionMetric extends Omit<BuildMetric, 'kind'> {
  kind: 'regression';
  metric: 'duration' | 'errors' | 'warnings';
  baseline: { mean: number; stddev: number; n: number };
  observed: number;
  deviationStddev: number;
  suspectedCauses?: string[];
}

export interface FlakyMetric extends Omit<BuildMetric, 'kind'> {
  kind: 'flaky';
  failureRate: number;
  sampleSize: number;
  windowDays: number;
}

export interface BuildIntelligenceReport {
  ok: boolean;
  windowDays: number;
  totalBuilds: number;
  regressions: RegressionMetric[];
  flaky: FlakyMetric[];
}
