import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeSnapshot } from '../../__fixtures__/snapshots.js';
import type { EnvironmentSnapshot } from '../../domain/models/EnvironmentSnapshot.js';
import type { ProjectScanResult } from '../../application/ProjectScanService.js';
import type { BuildResult } from '../../domain/models/BuildResult.js';
import type { ProjectInfo } from '../../domain/models/ProjectInfo.js';
import type { BuildProfile } from '../../domain/models/BuildProfile.js';
import type { LogEntry } from '../../domain/models/LogEntry.js';

const envScanMock = vi.fn<() => Promise<EnvironmentSnapshot>>();
const projectScanMock = vi.fn<(cwd: string) => Promise<ProjectScanResult>>();
const buildExecuteMock = vi.fn<
  (
    project: ProjectInfo,
    profile: BuildProfile,
    snapshot: EnvironmentSnapshot,
    onLog: (e: LogEntry) => void,
  ) => Promise<BuildResult>
>();

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
vi.mock('../../application/BuildService.js', () => ({
  BuildService: class {
    constructor(_snapshot?: EnvironmentSnapshot) {}
    execute(
      project: ProjectInfo,
      profile: BuildProfile,
      snapshot: EnvironmentSnapshot,
      onLog: (e: LogEntry) => void,
    ) {
      return buildExecuteMock(project, profile, snapshot, onLog);
    }
  },
}));

const { buildTools } = await import('./build.js');
const buildTool = buildTools.find(t => t.name === 'build')!;

interface Envelope<K extends string, D> {
  schema: 'lazybuilder/v1';
  kind: K;
  data: D;
}
function parseEnvelope<K extends string = string, D = unknown>(text: string) {
  return JSON.parse(text) as Envelope<K, D>;
}

const OK_BUILD_RESULT: BuildResult = {
  profileId: 'prof-1',
  startTime: new Date(0),
  endTime: new Date(1),
  durationMs: 1,
  exitCode: 0,
  status: 'success',
  errorCount: 0,
  warningCount: 0,
  errors: [],
  warnings: [],
};

const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

beforeEach(() => {
  vi.clearAllMocks();
  envScanMock.mockResolvedValue(makeSnapshot());
  projectScanMock.mockResolvedValue({ projects: [], solutions: [] });
  buildExecuteMock.mockResolvedValue(OK_BUILD_RESULT);
  stderrSpy.mockClear();
});

describe('build tool', () => {
  it('declares projectPath as required', () => {
    expect(buildTool.inputSchema.required).toContain('projectPath');
  });

  it('returns isError when projectPath is missing', async () => {
    const result = await buildTool.handler({});
    expect(result.isError).toBe(true);
    const env = parseEnvelope<'Error', { error: string }>(
      result.content[0]!.text,
    );
    expect(env.data.error).toContain('projectPath');
  });

  it('returns BuildResult envelope on success', async () => {
    const result = await buildTool.handler({
      projectPath: '/proj/Missing.csproj',
      cwd: '/proj',
    });
    const env = parseEnvelope<
      'BuildResult',
      { ok: boolean; result: BuildResult; logLines: unknown[] }
    >(result.content[0]!.text);
    expect(env.kind).toBe('BuildResult');
    expect(env.data.ok).toBe(true);
    expect(env.data.result.status).toBe('success');
  });

  it('stub-builds a minimal ProjectInfo when scan finds none for the path', async () => {
    await buildTool.handler({
      projectPath: '/missing/Nope.csproj',
      cwd: '/missing',
    });
    expect(buildExecuteMock).toHaveBeenCalledTimes(1);
    const project = buildExecuteMock.mock.calls[0]![0];
    expect(project.filePath).toBe('/missing/Nope.csproj');
    expect(project.buildSystem).toBe('dotnet');
  });

  it('infers msbuild build system from .vcxproj path', async () => {
    await buildTool.handler({
      projectPath: '/proj/X.vcxproj',
    });
    const project = buildExecuteMock.mock.calls[0]![0];
    expect(project.buildSystem).toBe('msbuild');
    expect(project.projectType).toBe('cpp-msbuild');
  });

  it('infers cmake build system from CMakeLists.txt path', async () => {
    await buildTool.handler({
      projectPath: '/proj/CMakeLists.txt',
    });
    const project = buildExecuteMock.mock.calls[0]![0];
    expect(project.buildSystem).toBe('cmake');
    expect(project.projectType).toBe('cmake');
  });

  it('falls back to verbosity=minimal for unknown verbosity values', async () => {
    await buildTool.handler({
      projectPath: '/p/A.csproj',
      verbosity: 'super-loud',
    });
    const profile = buildExecuteMock.mock.calls[0]![1];
    expect(profile.verbosity).toBe('minimal');
  });

  it('passes through valid verbosity values', async () => {
    await buildTool.handler({
      projectPath: '/p/A.csproj',
      verbosity: 'detailed',
    });
    const profile = buildExecuteMock.mock.calls[0]![1];
    expect(profile.verbosity).toBe('detailed');
  });

  it('defaults configuration=Debug and platform=x64', async () => {
    await buildTool.handler({ projectPath: '/p/A.csproj' });
    const profile = buildExecuteMock.mock.calls[0]![1];
    expect(profile.configuration).toBe('Debug');
    expect(profile.platform).toBe('x64');
  });

  it('returns error envelope when BuildService throws', async () => {
    buildExecuteMock.mockRejectedValueOnce(new Error('build-failed'));
    const result = await buildTool.handler({
      projectPath: '/p/A.csproj',
    });
    expect(result.isError).toBe(true);
    const env = parseEnvelope<'Error', { error: string }>(
      result.content[0]!.text,
    );
    expect(env.data.error).toContain('build-failed');
  });

  it('captures log entries emitted during build', async () => {
    buildExecuteMock.mockImplementationOnce(async (_p, _pr, _s, onLog) => {
      onLog({
        index: 0,
        timestamp: 1,
        level: 'info',
        text: 'compiling…',
        source: 'stdout',
      });
      return OK_BUILD_RESULT;
    });
    const result = await buildTool.handler({
      projectPath: '/p/A.csproj',
    });
    const env = parseEnvelope<
      'BuildResult',
      { logLines: Array<{ text: string }> }
    >(result.content[0]!.text);
    expect(env.data.logLines).toHaveLength(1);
    expect(env.data.logLines[0]!.text).toBe('compiling…');
  });
});
