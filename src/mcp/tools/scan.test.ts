import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeSnapshot } from '../../__fixtures__/snapshots.js';
import { makeCsproj } from '../../__fixtures__/projects.js';
import type { EnvironmentSnapshot } from '../../domain/models/EnvironmentSnapshot.js';
import type { ProjectScanResult } from '../../application/ProjectScanService.js';
import type { EnvironmentScanResult } from '../../application/EnvironmentService.js';

const envScanWithDiagnosticsMock =
  vi.fn<() => Promise<EnvironmentScanResult>>();
const projectScanMock = vi.fn<(cwd: string) => Promise<ProjectScanResult>>();

vi.mock('../../application/EnvironmentService.js', () => ({
  EnvironmentService: class {
    scanWithDiagnostics() {
      return envScanWithDiagnosticsMock();
    }
    scan() {
      return envScanWithDiagnosticsMock().then(r => r.snapshot);
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

const { scanTools } = await import('./scan.js');

const scanEnvironment = scanTools.find(t => t.name === 'scan_environment')!;
const scanProjects = scanTools.find(t => t.name === 'scan_projects')!;

interface Envelope<TKind extends string, TData> {
  schema: 'lazybuilder/v1';
  kind: TKind;
  data: TData;
}

function parseEnvelope<TKind extends string = string, TData = unknown>(
  text: string,
): Envelope<TKind, TData> {
  return JSON.parse(text) as Envelope<TKind, TData>;
}

describe('scan_environment tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('declares the expected metadata and schema', () => {
    expect(scanEnvironment.name).toBe('scan_environment');
    expect(scanEnvironment.description.length).toBeGreaterThan(0);
    expect(scanEnvironment.inputSchema.type).toBe('object');
  });

  it('returns text content with EnvironmentSnapshot envelope', async () => {
    const snapshot: EnvironmentSnapshot = makeSnapshot();
    envScanWithDiagnosticsMock.mockResolvedValue({
      snapshot,
      failures: [],
    });

    const result = await scanEnvironment.handler({});
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe('text');

    const env = parseEnvelope(result.content[0]!.text);
    expect(env.schema).toBe('lazybuilder/v1');
    expect(env.kind).toBe('EnvironmentSnapshot');
    expect((env.data as { ok: boolean }).ok).toBe(true);
  });

  it('returns error envelope when EnvironmentService throws', async () => {
    envScanWithDiagnosticsMock.mockRejectedValue(new Error('detect-failed'));

    const result = await scanEnvironment.handler({});
    expect(result.isError).toBe(true);
    const env = parseEnvelope<'Error', { ok: false; error: string }>(
      result.content[0]!.text,
    );
    expect(env.kind).toBe('Error');
    expect(env.data.ok).toBe(false);
    expect(env.data.error).toContain('detect-failed');
  });

  it('passes failures array through into the envelope payload', async () => {
    envScanWithDiagnosticsMock.mockResolvedValue({
      snapshot: makeSnapshot(),
      failures: [
        {
          detector: 'CMake',
          reason: 'timeout',
          message: 'too slow',
          durationMs: 2500,
        },
      ],
    });

    const result = await scanEnvironment.handler({});
    const env = parseEnvelope<
      'EnvironmentSnapshot',
      { ok: boolean; failures: Array<{ detector: string }> }
    >(result.content[0]!.text);
    expect(env.data.failures).toHaveLength(1);
    expect(env.data.failures[0]!.detector).toBe('CMake');
  });
});

describe('scan_projects tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards cwd argument into ProjectScanService.scan', async () => {
    projectScanMock.mockResolvedValue({ projects: [], solutions: [] });
    await scanProjects.handler({ cwd: '/some/path' });
    expect(projectScanMock).toHaveBeenCalledWith('/some/path');
  });

  it('falls back to process.cwd() when no cwd is given', async () => {
    projectScanMock.mockResolvedValue({ projects: [], solutions: [] });
    await scanProjects.handler({});
    expect(projectScanMock).toHaveBeenCalledWith(process.cwd());
  });

  it('returns a ProjectScanResult envelope', async () => {
    const projects = [makeCsproj()];
    projectScanMock.mockResolvedValue({ projects, solutions: [] });
    const result = await scanProjects.handler({ cwd: '/here' });
    const env = parseEnvelope<
      'ProjectScanResult',
      { ok: boolean; cwd: string; projects: unknown[] }
    >(result.content[0]!.text);
    expect(env.kind).toBe('ProjectScanResult');
    expect(env.data.cwd).toBe('/here');
    expect(env.data.projects).toHaveLength(1);
  });

  it('returns error envelope when ProjectScanService rejects', async () => {
    projectScanMock.mockRejectedValue(new Error('boom'));
    const result = await scanProjects.handler({});
    expect(result.isError).toBe(true);
    const env = parseEnvelope<'Error', { ok: boolean; error: string }>(
      result.content[0]!.text,
    );
    expect(env.data.error).toContain('boom');
  });
});
