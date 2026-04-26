import { describe, it, expect } from 'vitest';
import {
  CodeActionKind,
  DiagnosticSeverity,
  type Diagnostic,
} from 'vscode-languageserver/node.js';
import { computeCodeActions, type ToolchainApplyArgs } from './codeActionProvider.js';
import {
  makeSnapshot,
  snapshotWithSdks,
  snapshotWithGlobalJson,
} from '../../__fixtures__/snapshots.js';
import { makeCsproj, SAMPLE_CSPROJ_NET8, SAMPLE_GLOBAL_JSON } from '../../__fixtures__/projects.js';
import type { WorkspaceContext } from '../workspace.js';

const FALLBACK_RANGE = {
  start: { line: 0, character: 0 },
  end: { line: 0, character: 1 },
};

function ctxFor(
  snapshot = makeSnapshot(),
  projects: WorkspaceContext['projects'] = [],
  diagnostics: Diagnostic[] = [],
): WorkspaceContext & { diagnostics: Diagnostic[] } {
  return {
    rootPath: '/proj',
    snapshot,
    projects,
    solutions: [],
    diagnostics,
  };
}

function diag003(): Diagnostic {
  return {
    range: FALLBACK_RANGE,
    severity: DiagnosticSeverity.Error,
    code: 'DIAG003',
    source: 'lazybuilder',
    message: 'No SDK for net8.0\n1 project(s) target net8.0 but no .NET 8 SDK is installed.',
  };
}

function diag002(): Diagnostic {
  return {
    range: FALLBACK_RANGE,
    severity: DiagnosticSeverity.Error,
    code: 'DIAG002',
    source: 'lazybuilder',
    message: 'global.json requires SDK 9.9.999\nNot installed.',
  };
}

describe('computeCodeActions', () => {
  it('returns one QuickFix for DIAG003 (csproj net8.0, no SDK installed)', () => {
    const snapshot = snapshotWithSdks([]);
    const project = makeCsproj({
      filePath: '/proj/App.csproj',
      targetFrameworks: ['net8.0'],
    });
    const actions = computeCodeActions(
      'file:///proj/App.csproj',
      SAMPLE_CSPROJ_NET8,
      FALLBACK_RANGE,
      ctxFor(snapshot, [project], [diag003()]),
      [],
    );

    expect(actions).toHaveLength(1);
    const action = actions[0]!;
    expect(action.kind).toBe(CodeActionKind.QuickFix);
    expect(action.title).toBe('Install .NET 8 SDK (no admin, ~280 MB)');
    expect(action.diagnostics).toHaveLength(1);
    expect(action.diagnostics?.[0]?.code).toBe('DIAG003');
    expect(action.command?.command).toBe('lazybuilder.toolchain.apply');
    const args = action.command?.arguments?.[0] as ToolchainApplyArgs;
    expect(args.stepIds).toEqual(['dotnet-sdk-8.0.x']);
    expect(args.scope).toBe('user');
    expect(args.sourceUri).toBe('file:///proj/App.csproj');
  });

  it('returns one QuickFix for DIAG002 (global.json points to uninstalled SDK)', () => {
    const snapshot = snapshotWithGlobalJson('9.9.999', []);
    snapshot.dotnet.globalJsonPath = '/proj/global.json';
    const actions = computeCodeActions(
      'file:///proj/global.json',
      SAMPLE_GLOBAL_JSON,
      FALLBACK_RANGE,
      ctxFor(snapshot, [], [diag002()]),
      [],
    );

    expect(actions).toHaveLength(1);
    const action = actions[0]!;
    expect(action.kind).toBe(CodeActionKind.QuickFix);
    expect(action.title).toBe('Install .NET 9.9.999 SDK (no admin, ~280 MB)');
    expect(action.command?.command).toBe('lazybuilder.toolchain.apply');
    const args = action.command?.arguments?.[0] as ToolchainApplyArgs;
    expect(args.stepIds).toEqual(['dotnet-sdk-9.9.999']);
    expect(args.scope).toBe('user');
    expect(args.sourceUri).toBe('file:///proj/global.json');
  });

  it('returns [] for unsupported document URIs', () => {
    const actions = computeCodeActions(
      'file:///proj/notes.txt',
      'hello',
      FALLBACK_RANGE,
      ctxFor(makeSnapshot(), [], [diag003()]),
      [],
    );
    expect(actions).toEqual([]);
  });

  it('returns [] when diagnostics carry no DIAG002/DIAG003 code', () => {
    const snapshot = snapshotWithSdks([]);
    const project = makeCsproj({
      filePath: '/proj/App.csproj',
      targetFrameworks: ['net8.0'],
    });
    const unrelated: Diagnostic = {
      range: FALLBACK_RANGE,
      severity: DiagnosticSeverity.Warning,
      code: 'DIAG999',
      source: 'lazybuilder',
      message: 'Some other thing',
    };
    const actions = computeCodeActions(
      'file:///proj/App.csproj',
      SAMPLE_CSPROJ_NET8,
      FALLBACK_RANGE,
      ctxFor(snapshot, [project], [unrelated]),
      [],
    );
    expect(actions).toEqual([]);
  });

  it('returns the action when requestedKinds is empty (means all kinds)', () => {
    const snapshot = snapshotWithSdks([]);
    const project = makeCsproj({
      filePath: '/proj/App.csproj',
      targetFrameworks: ['net8.0'],
    });
    const actions = computeCodeActions(
      'file:///proj/App.csproj',
      SAMPLE_CSPROJ_NET8,
      FALLBACK_RANGE,
      ctxFor(snapshot, [project], [diag003()]),
      [],
    );
    expect(actions).toHaveLength(1);
  });

  it('returns [] when requestedKinds excludes QuickFix (e.g. ["refactor"])', () => {
    const snapshot = snapshotWithSdks([]);
    const project = makeCsproj({
      filePath: '/proj/App.csproj',
      targetFrameworks: ['net8.0'],
    });
    const actions = computeCodeActions(
      'file:///proj/App.csproj',
      SAMPLE_CSPROJ_NET8,
      FALLBACK_RANGE,
      ctxFor(snapshot, [project], [diag003()]),
      [CodeActionKind.Refactor],
    );
    expect(actions).toEqual([]);
  });

  it('returns the QuickFix action when requestedKinds includes QuickFix', () => {
    const snapshot = snapshotWithSdks([]);
    const project = makeCsproj({
      filePath: '/proj/App.csproj',
      targetFrameworks: ['net8.0'],
    });
    const actions = computeCodeActions(
      'file:///proj/App.csproj',
      SAMPLE_CSPROJ_NET8,
      FALLBACK_RANGE,
      ctxFor(snapshot, [project], [diag003()]),
      [CodeActionKind.QuickFix],
    );
    expect(actions).toHaveLength(1);
  });
});
