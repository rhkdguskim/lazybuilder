import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeSnapshot, snapshotWithSdks } from '../../__fixtures__/snapshots.js';
import { makeCsproj } from '../../__fixtures__/projects.js';
import type { EnvironmentSnapshot } from '../../domain/models/EnvironmentSnapshot.js';
import type { ProjectScanResult } from '../../application/ProjectScanService.js';

const envScanMock = vi.fn<() => Promise<EnvironmentSnapshot>>();
const projectScanMock = vi.fn<(cwd: string) => Promise<ProjectScanResult>>();

vi.mock('../../application/EnvironmentService.js', () => ({
  EnvironmentService: class {
    scan() {
      return envScanMock();
    }
  },
}));

vi.mock('../../application/ProjectScanService.js', () => ({
  ProjectScanService: class {
    scan(cwd: string) {
      return projectScanMock(cwd);
    }
  },
}));

const { diagnosticsTools } = await import('./diagnostics.js');
const runDiagnostics = diagnosticsTools.find(t => t.name === 'run_diagnostics')!;

interface Envelope<K extends string, D> {
  schema: 'lazybuilder/v1';
  kind: K;
  data: D;
}
function parseEnvelope<K extends string = string, D = unknown>(text: string) {
  return JSON.parse(text) as Envelope<K, D>;
}

describe('run_diagnostics tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envScanMock.mockResolvedValue(makeSnapshot());
    projectScanMock.mockResolvedValue({ projects: [], solutions: [] });
  });

  it('declares expected metadata', () => {
    expect(runDiagnostics.name).toBe('run_diagnostics');
    expect(runDiagnostics.inputSchema.type).toBe('object');
  });

  it('returns DiagnosticReport envelope with diagnostics array even when empty', async () => {
    const result = await runDiagnostics.handler({});
    const env = parseEnvelope<
      'DiagnosticReport',
      { ok: boolean; cwd: string; diagnostics: unknown[] }
    >(result.content[0]!.text);
    expect(env.kind).toBe('DiagnosticReport');
    expect(env.data.ok).toBe(true);
    expect(Array.isArray(env.data.diagnostics)).toBe(true);
  });

  it('forwards cwd into ProjectScanService.scan', async () => {
    await runDiagnostics.handler({ cwd: '/x/y' });
    expect(projectScanMock).toHaveBeenCalledWith('/x/y');
  });

  it('returns errors when csproj targets net8.0 with no SDK', async () => {
    envScanMock.mockResolvedValue(snapshotWithSdks([]));
    projectScanMock.mockResolvedValue({
      projects: [
        makeCsproj({ targetFrameworks: ['net8.0'], filePath: '/proj/A.csproj' }),
      ],
      solutions: [],
    });
    const result = await runDiagnostics.handler({ cwd: '/proj' });
    const env = parseEnvelope<
      'DiagnosticReport',
      { diagnostics: Array<{ code: string; severity: string }> }
    >(result.content[0]!.text);
    expect(env.data.diagnostics.some(d => d.code === 'DIAG003')).toBe(true);
  });

  it('returns error envelope when scan rejects', async () => {
    projectScanMock.mockRejectedValue(new Error('scan-fail'));
    const result = await runDiagnostics.handler({ cwd: '/x' });
    expect(result.isError).toBe(true);
    const env = parseEnvelope<'Error', { ok: boolean; error: string }>(
      result.content[0]!.text,
    );
    expect(env.data.error).toContain('scan-fail');
  });
});
