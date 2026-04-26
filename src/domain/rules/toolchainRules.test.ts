import { describe, it, expect } from 'vitest';
import { resolveToolchainRequirements } from './toolchainRules.js';
import {
  makeSnapshot,
  snapshotWithSdks,
  snapshotWithGlobalJson,
} from '../../__fixtures__/snapshots.js';
import { makeCsproj } from '../../__fixtures__/projects.js';

describe('resolveToolchainRequirements', () => {
  it('returns empty array when no projects and no global.json', () => {
    const snap = makeSnapshot();
    const result = resolveToolchainRequirements(snap, []);
    expect(result).toEqual([]);
  });

  it('returns dotnet-sdk requirement from global.json with no SDKs installed', () => {
    const snap = snapshotWithGlobalJson('8.0.405', []);
    const result = resolveToolchainRequirements(snap, []);
    expect(result).toHaveLength(1);
    const req = result[0]!;
    expect(req.kind).toBe('dotnet-sdk');
    expect(req.versionSpec).toBe('8.0.405');
    expect(req.currentlyInstalled).toBe(false);
    expect(req.reason.source).toBe('global.json');
  });

  it('marks currentlyInstalled true when global.json version exactly matches an installed SDK', () => {
    const snap = snapshotWithGlobalJson('8.0.405', ['8.0.405']);
    const result = resolveToolchainRequirements(snap, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.currentlyInstalled).toBe(true);
  });

  it('produces a 8.0.x requirement from a net8.0 csproj when no SDKs installed', () => {
    const snap = snapshotWithSdks([]);
    const projects = [makeCsproj({ name: 'A', targetFrameworks: ['net8.0'] })];
    const result = resolveToolchainRequirements(snap, projects);
    expect(result).toHaveLength(1);
    const req = result[0]!;
    expect(req.kind).toBe('dotnet-sdk');
    expect(req.versionSpec).toBe('8.0.x');
    expect(req.currentlyInstalled).toBe(false);
    expect(req.reason.source).toBe('csproj');
  });

  it('marks net8.0 csproj installed when 8.0.301 SDK satisfies the range', () => {
    const snap = snapshotWithSdks(['8.0.301']);
    const projects = [makeCsproj({ name: 'A', targetFrameworks: ['net8.0'] })];
    const result = resolveToolchainRequirements(snap, projects);
    expect(result).toHaveLength(1);
    expect(result[0]!.currentlyInstalled).toBe(true);
  });

  it('dedupes identical net8.0 requirements across multiple csproj files', () => {
    const snap = snapshotWithSdks([]);
    const projects = [
      makeCsproj({ name: 'A', filePath: '/proj/A.csproj', targetFrameworks: ['net8.0'] }),
      makeCsproj({ name: 'B', filePath: '/proj/B.csproj', targetFrameworks: ['net8.0'] }),
      makeCsproj({ name: 'C', filePath: '/proj/C.csproj', targetFrameworks: ['net8.0'] }),
    ];
    const result = resolveToolchainRequirements(snap, projects);
    expect(result).toHaveLength(1);
    const names = [...result[0]!.reason.affectedProjects].sort();
    expect(names).toEqual(['A', 'B', 'C']);
  });

  it('produces two requirements for a net6.0 + net8.0 project mix', () => {
    const snap = snapshotWithSdks([]);
    const projects = [
      makeCsproj({ name: 'A', targetFrameworks: ['net6.0'] }),
      makeCsproj({ name: 'B', targetFrameworks: ['net8.0'] }),
    ];
    const result = resolveToolchainRequirements(snap, projects);
    expect(result).toHaveLength(2);
    const specs = result.map(r => r.versionSpec).sort();
    expect(specs).toEqual(['6.0.x', '8.0.x']);
    for (const r of result) expect(r.kind).toBe('dotnet-sdk');
  });

  it('produces sdk + workload requirements for net8.0-android', () => {
    const snap = snapshotWithSdks([]);
    const projects = [makeCsproj({ name: 'M', targetFrameworks: ['net8.0-android'] })];
    const result = resolveToolchainRequirements(snap, projects);
    expect(result).toHaveLength(2);
    const sdk = result.find(r => r.kind === 'dotnet-sdk');
    const workload = result.find(r => r.kind === 'dotnet-workload');
    expect(sdk?.versionSpec).toBe('8.0.x');
    expect(workload?.versionSpec).toBe('android');
  });

  it('produces ios workload for net8.0-ios target', () => {
    const snap = snapshotWithSdks([]);
    const projects = [makeCsproj({ name: 'M', targetFrameworks: ['net8.0-ios'] })];
    const result = resolveToolchainRequirements(snap, projects);
    const workload = result.find(r => r.kind === 'dotnet-workload');
    expect(workload).toBeDefined();
    expect(workload!.versionSpec).toBe('ios');
  });

  it('skips netstandard2.0 — no SDK requirement is generated', () => {
    const snap = snapshotWithSdks([]);
    const projects = [makeCsproj({ name: 'L', targetFrameworks: ['netstandard2.0'] })];
    const result = resolveToolchainRequirements(snap, projects);
    expect(result).toEqual([]);
  });

  it('dedupes when global.json and csproj agree on net8 — single SDK, global.json wins reason source', () => {
    const snap = snapshotWithGlobalJson('8.0.x', []);
    const projects = [makeCsproj({ name: 'A', targetFrameworks: ['net8.0'] })];
    const result = resolveToolchainRequirements(snap, projects);
    expect(result).toHaveLength(1);
    expect(result[0]!.kind).toBe('dotnet-sdk');
    expect(result[0]!.versionSpec).toBe('8.0.x');
    expect(result[0]!.reason.source).toBe('global.json');
  });

  it('resolves 8.0.x to the highest installed patch (8.0.405 over 8.0.301)', () => {
    const snap = snapshotWithSdks(['8.0.301', '8.0.405']);
    const projects = [makeCsproj({ name: 'A', targetFrameworks: ['net8.0'] })];
    const result = resolveToolchainRequirements(snap, projects);
    expect(result).toHaveLength(1);
    expect(result[0]!.versionSpec).toBe('8.0.x');
    expect(result[0]!.resolvedVersion).toBe('8.0.405');
  });

  it('returns an exact versionSpec as resolvedVersion verbatim', () => {
    const snap = snapshotWithGlobalJson('8.0.405', []);
    const result = resolveToolchainRequirements(snap, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.versionSpec).toBe('8.0.405');
    expect(result[0]!.resolvedVersion).toBe('8.0.405');
  });
});
