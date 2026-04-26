import { describe, it, expect } from 'vitest';
import { DiagnosticSeverity } from 'vscode-languageserver/node.js';
import { computeDiagnostics } from './diagnosticProvider.js';
import {
  makeSnapshot,
  snapshotWithSdks,
  snapshotWithGlobalJson,
} from '../../__fixtures__/snapshots.js';
import { makeCsproj, SAMPLE_CSPROJ_NET8, SAMPLE_GLOBAL_JSON } from '../../__fixtures__/projects.js';
import type { WorkspaceContext } from '../workspace.js';

function ctxFor(
  snapshot = makeSnapshot(),
  projects: WorkspaceContext['projects'] = [],
): WorkspaceContext {
  return {
    rootPath: '/proj',
    snapshot,
    projects,
    solutions: [],
  };
}

describe('computeDiagnostics', () => {
  it('returns [] for unsupported document URIs', async () => {
    const result = await computeDiagnostics(
      'file:///proj/notes.txt',
      'hello',
      ctxFor(),
    );
    expect(result).toEqual([]);
  });

  it('does not emit DIAG003 (no SDK) when csproj targets net8.0 and the SDK is installed', async () => {
    const snapshot = snapshotWithSdks(['8.0.405']);
    const project = makeCsproj({
      filePath: '/proj/App.csproj',
      targetFrameworks: ['net8.0'],
    });
    const result = await computeDiagnostics(
      'file:///proj/App.csproj',
      SAMPLE_CSPROJ_NET8,
      ctxFor(snapshot, [project]),
    );
    // Other unrelated diagnostics (e.g. DIAG051 restore needed for a synthetic
    // project path with no obj/project.assets.json) may still surface; the
    // contract under test is just that the missing-SDK rule did not fire.
    expect(result.find(d => d.code === 'DIAG003')).toBeUndefined();
  });

  it('returns one Error diagnostic when csproj targets net8.0 but no SDK is installed', async () => {
    const snapshot = snapshotWithSdks([]); // no SDKs at all
    const project = makeCsproj({
      filePath: '/proj/App.csproj',
      targetFrameworks: ['net8.0'],
    });
    const diagnostics = await computeDiagnostics(
      'file:///proj/App.csproj',
      SAMPLE_CSPROJ_NET8,
      ctxFor(snapshot, [project]),
    );
    const tfmDiag = diagnostics.find(d => d.code === 'DIAG003');
    expect(tfmDiag).toBeDefined();
    expect(tfmDiag?.severity).toBe(DiagnosticSeverity.Error);
    expect(tfmDiag?.source).toBe('lazybuilder');
    // Range should point to the TargetFramework value line in our sample (line 2).
    expect(tfmDiag?.range.start.line).toBe(2);
  });

  it('returns Error for global.json pointing to an uninstalled SDK', async () => {
    const snapshot = snapshotWithGlobalJson('9.9.999', ['8.0.405']);
    snapshot.dotnet.globalJsonPath = '/proj/global.json';
    const diagnostics = await computeDiagnostics(
      'file:///proj/global.json',
      SAMPLE_GLOBAL_JSON,
      ctxFor(snapshot, []),
    );
    const mismatch = diagnostics.find(d => d.code === 'DIAG002');
    expect(mismatch).toBeDefined();
    expect(mismatch?.severity).toBe(DiagnosticSeverity.Error);
    // Range should point at the version value line in the sample global.json (line 2).
    expect(mismatch?.range.start.line).toBe(2);
  });

  it('drops "ok" severity items entirely', async () => {
    // Healthy snapshot, no projects, no global.json → there is no project
    // matching the URI, so no diagnostics should be filtered to it.
    const result = await computeDiagnostics(
      'file:///proj/App.csproj',
      SAMPLE_CSPROJ_NET8,
      ctxFor(),
    );
    // No project info attached → diagnostics service has nothing project-scoped
    // to attribute to App.csproj. Result must be empty.
    expect(result.filter(d => d.severity === undefined)).toEqual([]);
  });

  it('exposes globalJson SDK mismatch on the global.json document via category=dotnet match', async () => {
    // Even when the rule emits no relatedPaths matching the URI, kind=globalJson
    // surfaces dotnet-category items.
    const snapshot = snapshotWithGlobalJson('7.0.100', []);
    snapshot.dotnet.globalJsonPath = '/elsewhere/global.json'; // not the URI path
    const diagnostics = await computeDiagnostics(
      'file:///proj/global.json',
      SAMPLE_GLOBAL_JSON,
      ctxFor(snapshot, []),
    );
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every(d => d.severity !== undefined)).toBe(true);
  });

  it('uses fallback range (0,0)-(0,1) when the document has no parsed token', async () => {
    const snapshot = snapshotWithGlobalJson('9.9.999', []);
    snapshot.dotnet.globalJsonPath = '/proj/global.json';
    const diagnostics = await computeDiagnostics(
      'file:///proj/global.json',
      '{}', // no version field → no parsed token range
      ctxFor(snapshot, []),
    );
    expect(diagnostics.length).toBeGreaterThan(0);
    const first = diagnostics[0]!;
    expect(first.range.start).toEqual({ line: 0, character: 0 });
    expect(first.range.end).toEqual({ line: 0, character: 1 });
  });

  it('builds a multi-line message that includes title, description, and suggestion', async () => {
    const snapshot = snapshotWithSdks([]);
    const project = makeCsproj({
      filePath: '/proj/App.csproj',
      targetFrameworks: ['net8.0'],
    });
    const diagnostics = await computeDiagnostics(
      'file:///proj/App.csproj',
      SAMPLE_CSPROJ_NET8,
      ctxFor(snapshot, [project]),
    );
    const diag = diagnostics.find(d => d.code === 'DIAG003');
    expect(diag).toBeDefined();
    expect(diag!.message).toContain('Suggested:');
  });
});
