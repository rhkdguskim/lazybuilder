import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BuildMetric } from '../domain/models/BuildMetric.js';

// Mock MetricsStore so the service is fully isolated from the filesystem.
// vi.mock is hoisted; the factory returns a class whose instances expose mock fns.
vi.mock('../infrastructure/intelligence/MetricsStore.js', () => {
  const append = vi.fn(async (_m: BuildMetric) => {});
  const loadWindow = vi.fn(async (_days: number): Promise<BuildMetric[]> => []);
  return {
    MetricsStore: vi.fn().mockImplementation(() => ({
      append,
      loadWindow,
    })),
    // expose the mocks for assertions
    __mocks: { append, loadWindow },
  };
});

// Re-import after mock is registered so the service uses the mocked class.
import { BuildIntelligenceService } from './BuildIntelligenceService.js';
import * as MetricsStoreModule from '../infrastructure/intelligence/MetricsStore.js';

// Helper handles to the mock fns.
const mocks = (MetricsStoreModule as unknown as {
  __mocks: {
    append: ReturnType<typeof vi.fn>;
    loadWindow: ReturnType<typeof vi.fn>;
  };
}).__mocks;

// ---- BuildMetric synthetic builders --------------------------------------

type MetricOverrides = Partial<BuildMetric>;

let metricCounter = 0;
function makeMetric(overrides: MetricOverrides = {}): BuildMetric {
  metricCounter += 1;
  const baseTs = new Date('2026-01-01T00:00:00Z').getTime();
  const ts =
    overrides.ts ?? new Date(baseTs + metricCounter * 60_000).toISOString();
  return {
    schema: 'lazybuilder/metrics/v1',
    ts,
    kind: 'build',
    projectId: 'proj-A',
    projectName: 'AppA',
    configuration: 'Debug',
    platform: 'AnyCPU',
    exitCode: 0,
    status: 'success',
    durationMs: 5000,
    errorCount: 0,
    warningCount: 0,
    gitCommit: 'commit-1',
    toolchainHash: 'tc-1',
    envHash: 'env-1',
    ...overrides,
  };
}

/** Build a series of N stable-with-jitter metrics, then a final outlier metric. */
function seriesWithOutlier(
  priorDurations: number[],
  outlierDuration: number,
  base: MetricOverrides = {},
): BuildMetric[] {
  const out: BuildMetric[] = [];
  for (let i = 0; i < priorDurations.length; i++) {
    out.push(
      makeMetric({
        ...base,
        durationMs: priorDurations[i]!,
        ts: new Date(2026, 0, 1, 0, i, 0).toISOString(),
      }),
    );
  }
  out.push(
    makeMetric({
      ...base,
      durationMs: outlierDuration,
      ts: new Date(2026, 0, 1, 0, priorDurations.length, 0).toISOString(),
    }),
  );
  return out;
}

beforeEach(() => {
  metricCounter = 0;
  mocks.append.mockClear();
  mocks.loadWindow.mockReset();
  mocks.loadWindow.mockResolvedValue([]);
});

// ---- detectRegressions ---------------------------------------------------

describe('BuildIntelligenceService.detectRegressions()', () => {
  it('returns [] for empty input', () => {
    const svc = new BuildIntelligenceService();
    expect(svc.detectRegressions([])).toEqual([]);
  });

  it('does not flag when fewer than 10 builds exist in a group', () => {
    const svc = new BuildIntelligenceService();
    const metrics = Array.from({ length: 9 }, (_, i) =>
      makeMetric({ durationMs: 5000 + i * 10 }),
    );
    expect(svc.detectRegressions(metrics)).toEqual([]);
  });

  it('does not flag when all 10 builds are perfectly stable (stddev = 0)', () => {
    const svc = new BuildIntelligenceService();
    const metrics = Array.from({ length: 10 }, () =>
      makeMetric({ durationMs: 5000 }),
    );
    expect(svc.detectRegressions(metrics)).toEqual([]);
  });

  it('flags a regression when the latest duration is >> 3σ above the EWMA baseline', () => {
    const svc = new BuildIntelligenceService();
    // 10 prior builds with mild jitter (~stddev ~50ms) + 1 huge outlier
    const priorDurations = [
      4980, 5020, 4990, 5010, 5000, 4990, 5010, 4995, 5005, 5000,
    ];
    const outlier = 50_000; // 10x the mean — guaranteed > 3σ
    const metrics = seriesWithOutlier(priorDurations, outlier);

    const regressions = svc.detectRegressions(metrics);
    expect(regressions).toHaveLength(1);
    expect(regressions[0]!.metric).toBe('duration');
    expect(regressions[0]!.observed).toBe(outlier);
    expect(regressions[0]!.deviationStddev).toBeGreaterThan(3);
  });

  it('does not flag when the latest duration is only ~0.5σ above the baseline', () => {
    const svc = new BuildIntelligenceService();
    // Same noisy prior series, but the "outlier" is barely off the mean.
    const priorDurations = [
      4980, 5020, 4990, 5010, 5000, 4990, 5010, 4995, 5005, 5000,
    ];
    // Mean ~5000, stddev ~10s of ms → +25ms is well under 3σ.
    const metrics = seriesWithOutlier(priorDurations, 5025);
    expect(svc.detectRegressions(metrics)).toEqual([]);
  });

  it('only flags the affected (projectId, configuration, platform) group', () => {
    const svc = new BuildIntelligenceService();
    const noisyPrior = [4980, 5020, 4990, 5010, 5000, 4990, 5010, 4995, 5005, 5000];

    // Group A: regression
    const groupA = seriesWithOutlier(noisyPrior, 60_000, {
      projectId: 'proj-A',
      configuration: 'Debug',
      platform: 'AnyCPU',
    });
    // Group B: same noisy prior, small change → no regression
    const groupB = seriesWithOutlier(noisyPrior, 5010, {
      projectId: 'proj-B',
      configuration: 'Debug',
      platform: 'AnyCPU',
    });

    const regressions = svc.detectRegressions([...groupA, ...groupB]);
    expect(regressions).toHaveLength(1);
    expect(regressions[0]!.projectId).toBe('proj-A');
  });

  it('does not flag when the outlier is in the middle of the bucket and the latest is normal', () => {
    const svc = new BuildIntelligenceService();
    // Same noisy series, but the spike happens 5 builds ago and the latest is normal.
    const durations = [
      4980, 5020, 4990, 5010, 5000, 60_000, 5010, 4995, 5005, 5000, 5000,
    ];
    const metrics = durations.map((d, i) =>
      makeMetric({
        durationMs: d,
        ts: new Date(2026, 0, 1, 0, i, 0).toISOString(),
      }),
    );
    expect(svc.detectRegressions(metrics)).toEqual([]);
  });

  it('flags regressions on errorCount when the latest spikes >> 3σ above baseline', () => {
    const svc = new BuildIntelligenceService();
    const priorErrors = [0, 1, 0, 1, 0, 1, 0, 1, 0, 0];
    const metrics = priorErrors.map((e, i) =>
      makeMetric({
        durationMs: 5000,
        errorCount: e,
        ts: new Date(2026, 0, 1, 0, i, 0).toISOString(),
      }),
    );
    metrics.push(
      makeMetric({
        durationMs: 5000,
        errorCount: 100,
        ts: new Date(2026, 0, 1, 0, priorErrors.length, 0).toISOString(),
      }),
    );

    const regressions = svc.detectRegressions(metrics);
    expect(regressions.some(r => r.metric === 'errors')).toBe(true);
  });

  it('flags regressions on warningCount when the latest spikes >> 3σ above baseline', () => {
    const svc = new BuildIntelligenceService();
    const priorWarnings = [2, 3, 2, 3, 2, 3, 2, 3, 2, 2];
    const metrics = priorWarnings.map((w, i) =>
      makeMetric({
        durationMs: 5000,
        warningCount: w,
        ts: new Date(2026, 0, 1, 0, i, 0).toISOString(),
      }),
    );
    metrics.push(
      makeMetric({
        durationMs: 5000,
        warningCount: 500,
        ts: new Date(2026, 0, 1, 0, priorWarnings.length, 0).toISOString(),
      }),
    );

    const regressions = svc.detectRegressions(metrics);
    expect(regressions.some(r => r.metric === 'warnings')).toBe(true);
  });

  it('ignores non-build kinds when grouping', () => {
    const svc = new BuildIntelligenceService();
    const noisyPrior = [4980, 5020, 4990, 5010, 5000, 4990, 5010, 4995, 5005, 5000];
    const metrics = seriesWithOutlier(noisyPrior, 60_000);
    // Sneak in a non-build kind that should be filtered out.
    const fake = {
      ...makeMetric({ durationMs: 1 }),
      kind: 'regression' as const,
    } as unknown as BuildMetric;
    const regressions = svc.detectRegressions([...metrics, fake]);
    expect(regressions).toHaveLength(1);
  });
});

// ---- detectFlaky ---------------------------------------------------------

describe('BuildIntelligenceService.detectFlaky()', () => {
  it('does not flag when all builds succeeded', () => {
    const svc = new BuildIntelligenceService();
    const metrics = Array.from({ length: 10 }, () =>
      makeMetric({ status: 'success', exitCode: 0 }),
    );
    expect(svc.detectFlaky(metrics)).toEqual([]);
  });

  it('does not flag when all builds failed (failureRate=1.0 outside [0.1, 0.9])', () => {
    const svc = new BuildIntelligenceService();
    const metrics = Array.from({ length: 10 }, () =>
      makeMetric({ status: 'failure', exitCode: 1 }),
    );
    expect(svc.detectFlaky(metrics)).toEqual([]);
  });

  it('flags as flaky when 5 of 10 same-fingerprint builds fail (rate=0.5)', () => {
    const svc = new BuildIntelligenceService();
    const metrics: BuildMetric[] = [];
    for (let i = 0; i < 10; i++) {
      metrics.push(
        makeMetric({
          status: i < 5 ? 'success' : 'failure',
          exitCode: i < 5 ? 0 : 1,
          ts: new Date(2026, 0, 1, 0, i, 0).toISOString(),
        }),
      );
    }
    const flaky = svc.detectFlaky(metrics);
    expect(flaky).toHaveLength(1);
    expect(flaky[0]!.failureRate).toBe(0.5);
    expect(flaky[0]!.sampleSize).toBe(10);
  });

  it('flags as flaky when 1 of 10 same-fingerprint builds fail (rate=0.1)', () => {
    const svc = new BuildIntelligenceService();
    const metrics: BuildMetric[] = [];
    for (let i = 0; i < 10; i++) {
      metrics.push(
        makeMetric({
          status: i === 0 ? 'failure' : 'success',
          exitCode: i === 0 ? 1 : 0,
          ts: new Date(2026, 0, 1, 0, i, 0).toISOString(),
        }),
      );
    }
    const flaky = svc.detectFlaky(metrics);
    expect(flaky).toHaveLength(1);
    expect(flaky[0]!.failureRate).toBe(0.1);
  });

  it('does not flag mixed outcomes that span DIFFERENT fingerprints', () => {
    const svc = new BuildIntelligenceService();
    // Two builds, different gitCommit → different groups, each group has 1 sample
    const metrics = [
      makeMetric({ status: 'success', gitCommit: 'commit-A' }),
      makeMetric({ status: 'failure', gitCommit: 'commit-B' }),
    ];
    expect(svc.detectFlaky(metrics)).toEqual([]);
  });

  it('does not flag when a fingerprint group has fewer than 2 builds', () => {
    const svc = new BuildIntelligenceService();
    const metrics = [makeMetric({ status: 'failure' })];
    expect(svc.detectFlaky(metrics)).toEqual([]);
  });

  it('echoes the supplied windowDays in the resulting FlakyMetric', () => {
    const svc = new BuildIntelligenceService();
    const metrics: BuildMetric[] = [];
    for (let i = 0; i < 10; i++) {
      metrics.push(
        makeMetric({
          status: i < 5 ? 'success' : 'failure',
          exitCode: i < 5 ? 0 : 1,
          ts: new Date(2026, 0, 1, 0, i, 0).toISOString(),
        }),
      );
    }
    const flaky = svc.detectFlaky(metrics, 14);
    expect(flaky).toHaveLength(1);
    expect(flaky[0]!.windowDays).toBe(14);
  });

  it('separates groups by toolchainHash', () => {
    const svc = new BuildIntelligenceService();
    const metrics: BuildMetric[] = [];
    // Group A: 5 successes
    for (let i = 0; i < 5; i++) {
      metrics.push(
        makeMetric({
          toolchainHash: 'tc-A',
          status: 'success',
          ts: new Date(2026, 0, 1, 0, i, 0).toISOString(),
        }),
      );
    }
    // Group B: 5 failures
    for (let i = 0; i < 5; i++) {
      metrics.push(
        makeMetric({
          toolchainHash: 'tc-B',
          status: 'failure',
          exitCode: 1,
          ts: new Date(2026, 0, 1, 0, 10 + i, 0).toISOString(),
        }),
      );
    }
    expect(svc.detectFlaky(metrics)).toEqual([]);
  });
});

// ---- report --------------------------------------------------------------

describe('BuildIntelligenceService.report()', () => {
  it('echoes windowDays and totalBuilds, combines regressions + flaky', async () => {
    const svc = new BuildIntelligenceService();
    const builds = Array.from({ length: 10 }, (_, i) =>
      makeMetric({
        status: i < 5 ? 'success' : 'failure',
        exitCode: i < 5 ? 0 : 1,
        ts: new Date(2026, 0, 1, 0, i, 0).toISOString(),
      }),
    );
    mocks.loadWindow.mockResolvedValue(builds);

    const report = await svc.report({ days: 3 });
    expect(report.ok).toBe(true);
    expect(report.windowDays).toBe(3);
    expect(report.totalBuilds).toBe(builds.length);
    expect(report.flaky.length).toBeGreaterThan(0);
  });

  it('uses the default 7-day window when days is omitted', async () => {
    const svc = new BuildIntelligenceService();
    mocks.loadWindow.mockResolvedValue([]);
    const report = await svc.report();
    expect(report.windowDays).toBe(7);
    expect(mocks.loadWindow).toHaveBeenCalledWith(7);
  });

  it('filters by projectId before computing totalBuilds', async () => {
    const svc = new BuildIntelligenceService();
    const a = makeMetric({ projectId: 'proj-A' });
    const b = makeMetric({ projectId: 'proj-B' });
    const c = makeMetric({ projectId: 'proj-A' });
    mocks.loadWindow.mockResolvedValue([a, b, c]);

    const report = await svc.report({ projectId: 'proj-A' });
    expect(report.totalBuilds).toBe(2);
  });
});

// ---- record / loadWindow / exportNdjson pass-through --------------------

describe('BuildIntelligenceService passthroughs', () => {
  it('record() forwards the exact metric to MetricsStore.append()', async () => {
    const svc = new BuildIntelligenceService();
    const m = makeMetric({ projectName: 'PassThrough' });
    await svc.record(m);
    expect(mocks.append).toHaveBeenCalledTimes(1);
    expect(mocks.append).toHaveBeenCalledWith(m);
  });

  it('record() swallows store errors so callers never see throws', async () => {
    const svc = new BuildIntelligenceService();
    mocks.append.mockRejectedValueOnce(new Error('disk full'));
    await expect(svc.record(makeMetric())).resolves.toBeUndefined();
  });

  it('loadWindow() delegates to MetricsStore.loadWindow with the same days', async () => {
    const svc = new BuildIntelligenceService();
    const m = makeMetric();
    mocks.loadWindow.mockResolvedValue([m]);
    const result = await svc.loadWindow(14);
    expect(mocks.loadWindow).toHaveBeenCalledWith(14);
    expect(result).toEqual([m]);
  });

  it('exportNdjson() yields one JSON line per metric', async () => {
    const svc = new BuildIntelligenceService();
    const a = makeMetric({ projectId: 'a' });
    const b = makeMetric({ projectId: 'b' });
    mocks.loadWindow.mockResolvedValue([a, b]);

    const lines: string[] = [];
    for await (const line of svc.exportNdjson()) {
      lines.push(line);
    }
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(JSON.stringify(a) + '\n');
    expect(lines[1]).toBe(JSON.stringify(b) + '\n');
  });

  it('exportNdjson({ since }) excludes metrics earlier than the cutoff', async () => {
    const svc = new BuildIntelligenceService();
    const oldMetric = makeMetric({
      projectId: 'old',
      ts: '2025-01-01T00:00:00.000Z',
    });
    const newMetric = makeMetric({
      projectId: 'new',
      ts: '2026-06-01T00:00:00.000Z',
    });
    mocks.loadWindow.mockResolvedValue([oldMetric, newMetric]);

    const lines: string[] = [];
    for await (const line of svc.exportNdjson({
      since: '2026-01-01T00:00:00.000Z',
    })) {
      lines.push(line);
    }
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('"projectId":"new"');
  });
});
