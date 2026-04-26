import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MetricsStore } from './MetricsStore.js';
import type { BuildMetric } from '../../domain/models/BuildMetric.js';

function makeMetric(overrides: Partial<BuildMetric> = {}): BuildMetric {
  return {
    schema: 'lazybuilder/metrics/v1',
    ts: new Date().toISOString(),
    kind: 'build',
    projectId: 'proj-1',
    projectName: 'App',
    configuration: 'Debug',
    platform: 'AnyCPU',
    exitCode: 0,
    status: 'success',
    durationMs: 1234,
    errorCount: 0,
    warningCount: 0,
    gitCommit: null,
    toolchainHash: 'abc',
    envHash: 'def',
    ...overrides,
  };
}

function utcStamp(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

describe('MetricsStore', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'metrics-store-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('append() writes one JSON line to today\'s file', async () => {
    const store = new MetricsStore(tmpDir);
    const ts = '2025-06-15T12:00:00.000Z';
    const metric = makeMetric({ ts });
    await store.append(metric);

    const expectedFile = join(tmpDir, `metrics-${utcStamp(new Date(ts))}.ndjson`);
    expect(existsSync(expectedFile)).toBe(true);
    const raw = readFileSync(expectedFile, 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
    const lines = raw.split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual(metric);
  });

  it('append() creates parent dirs when baseDir does not exist yet', async () => {
    const nested = join(tmpDir, 'nested', 'sub');
    expect(existsSync(nested)).toBe(false);
    const store = new MetricsStore(nested);
    await store.append(makeMetric());
    expect(existsSync(nested)).toBe(true);
    const files = readdirSync(nested);
    expect(files.some(f => /^metrics-\d{8}\.ndjson$/.test(f))).toBe(true);
  });

  it('uses metrics-YYYYMMDD.ndjson UTC naming', async () => {
    const store = new MetricsStore(tmpDir);
    const ts = '2024-01-09T23:30:00.000Z';
    await store.append(makeMetric({ ts }));
    const files = readdirSync(tmpDir);
    expect(files).toContain('metrics-20240109.ndjson');
  });

  it('loadWindow(7) reads metrics across the past 7 days', async () => {
    const store = new MetricsStore(tmpDir);
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const recent = makeMetric({ ts: new Date(now - 1 * dayMs).toISOString(), projectName: 'Recent' });
    const midWindow = makeMetric({ ts: new Date(now - 5 * dayMs).toISOString(), projectName: 'Mid' });
    await store.append(recent);
    await store.append(midWindow);

    const out = await store.loadWindow(7);
    const names = out.map(m => m.projectName).sort();
    expect(names).toEqual(['Mid', 'Recent']);
  });

  it('loadWindow() skips corrupt JSON lines but preserves valid ones', async () => {
    const store = new MetricsStore(tmpDir);
    const ts = new Date().toISOString();
    const valid = makeMetric({ ts, projectName: 'Valid' });
    await store.append(valid);

    // Append a corrupt line into the same file
    const file = join(tmpDir, `metrics-${utcStamp(new Date(ts))}.ndjson`);
    const fs = await import('node:fs/promises');
    await fs.appendFile(file, 'garbage{not-json\n', 'utf-8');
    await store.append(makeMetric({ ts, projectName: 'Valid2' }));

    const out = await store.loadWindow(1);
    const names = out.map(m => m.projectName).sort();
    expect(names).toEqual(['Valid', 'Valid2']);
  });

  it('loadWindow() returns empty array when baseDir does not exist', async () => {
    const ghost = join(tmpDir, 'does-not-exist');
    const store = new MetricsStore(ghost);
    const out = await store.loadWindow(7);
    expect(out).toEqual([]);
  });

  it('loadWindow() filters out metric files older than the window', async () => {
    const store = new MetricsStore(tmpDir);
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const recent = makeMetric({ ts: new Date(now - 1 * dayMs).toISOString(), projectName: 'Recent' });
    const ancient = makeMetric({ ts: new Date(now - 60 * dayMs).toISOString(), projectName: 'Ancient' });
    await store.append(recent);
    await store.append(ancient);

    const out = await store.loadWindow(7);
    const names = out.map(m => m.projectName);
    expect(names).toContain('Recent');
    expect(names).not.toContain('Ancient');
  });
});
