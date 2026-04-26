import { describe, it, expect } from 'vitest';
import { resolveToolchainRequirements } from './toolchainRules.js';
import {
  makeSnapshot,
  snapshotWithSdks,
  snapshotWithGlobalJson,
} from '../../__fixtures__/snapshots.js';
import {
  makeCsproj,
  makeVcxproj,
  makeCMakeProject,
} from '../../__fixtures__/projects.js';

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

  describe('C++ (Phase 2)', () => {
    it('produces an msvc-toolset requirement for a cpp-msbuild project with PlatformToolset', () => {
      const snap = makeSnapshot();
      const projects = [makeVcxproj({ name: 'NativeApp', platformToolset: 'v143', windowsSdkVersion: null })];
      const result = resolveToolchainRequirements(snap, projects);

      const msvc = result.find(r => r.kind === 'msvc-toolset');
      expect(msvc).toBeDefined();
      expect(msvc!.versionSpec).toBe('v143');
      expect(msvc!.currentlyInstalled).toBe(false);
      expect(msvc!.reason.source).toBe('csproj');
      expect(msvc!.reason.detail).toContain('PlatformToolset=v143');
      expect(msvc!.reason.affectedProjects).toEqual(['NativeApp']);
    });

    it('produces a windows-sdk requirement when WindowsTargetPlatformVersion is set', () => {
      const snap = makeSnapshot();
      const projects = [makeVcxproj({ platformToolset: null, windowsSdkVersion: '10.0.22621.0' })];
      const result = resolveToolchainRequirements(snap, projects);

      const sdk = result.find(r => r.kind === 'windows-sdk');
      expect(sdk).toBeDefined();
      expect(sdk!.versionSpec).toBe('10.0.22621.0');
      expect(sdk!.reason.detail).toContain('WindowsTargetPlatformVersion=10.0.22621.0');
    });

    it('emits both msvc-toolset and windows-sdk for a typical .vcxproj', () => {
      const snap = makeSnapshot();
      const projects = [makeVcxproj()]; // default v143 + 10.0.22621.0
      const result = resolveToolchainRequirements(snap, projects);

      expect(result.find(r => r.kind === 'msvc-toolset')).toBeDefined();
      expect(result.find(r => r.kind === 'windows-sdk')).toBeDefined();
    });

    it('marks msvc-toolset installed when snapshot.cpp.toolsets has a matching version', () => {
      const snap = makeSnapshot();
      snap.cpp.toolsets = [
        {
          sdkType: 'msvc-toolset',
          version: '14.39.33519',
          installedPath: 'C:/VS/VC/Tools/MSVC/14.39.33519',
          isSelected: false,
          isRequired: false,
          status: 'ok',
        },
      ];
      // Use a versionSpec that overlaps loosely with the installed version.
      const projects = [makeVcxproj({ platformToolset: '14.39', windowsSdkVersion: null })];
      const result = resolveToolchainRequirements(snap, projects);
      const msvc = result.find(r => r.kind === 'msvc-toolset');
      expect(msvc?.currentlyInstalled).toBe(true);
    });

    it('marks windows-sdk installed when snapshot.windowsSdk.versions matches the major.minor.build prefix', () => {
      const snap = makeSnapshot();
      snap.windowsSdk.versions = [
        {
          sdkType: 'windows-sdk',
          version: '10.0.22621.755',
          installedPath: 'C:/Program Files (x86)/Windows Kits/10/Include/10.0.22621.0',
          isSelected: false,
          isRequired: false,
          status: 'ok',
        },
      ];
      const projects = [makeVcxproj({ platformToolset: null, windowsSdkVersion: '10.0.22621.0' })];
      const result = resolveToolchainRequirements(snap, projects);
      const sdk = result.find(r => r.kind === 'windows-sdk');
      expect(sdk?.currentlyInstalled).toBe(true);
    });
  });

  describe('CMake (Phase 2)', () => {
    it('produces a cmake requirement for cmake projects', () => {
      const snap = makeSnapshot();
      const projects = [makeCMakeProject()];
      const result = resolveToolchainRequirements(snap, projects);

      const cmake = result.find(r => r.kind === 'cmake');
      expect(cmake).toBeDefined();
      expect(cmake!.versionSpec).toBe('>=3.20');
      expect(cmake!.severity).toBe('required');
    });

    it('extracts cmake_minimum_required version from riskFlags when present', () => {
      const snap = makeSnapshot();
      const projects = [
        makeCMakeProject({ riskFlags: ['cmake>=3.25'] }),
      ];
      const result = resolveToolchainRequirements(snap, projects);

      const cmake = result.find(r => r.kind === 'cmake');
      expect(cmake?.versionSpec).toBe('>=3.25');
    });

    it('also recommends ninja for cmake projects', () => {
      const snap = makeSnapshot();
      const projects = [makeCMakeProject()];
      const result = resolveToolchainRequirements(snap, projects);

      const ninja = result.find(r => r.kind === 'ninja');
      expect(ninja).toBeDefined();
      expect(ninja!.versionSpec).toBe('latest');
      expect(ninja!.severity).toBe('recommended');
    });

    it('marks cmake installed when snapshot.cmake.detected is true', () => {
      const snap = makeSnapshot();
      snap.cmake = {
        name: 'cmake',
        path: 'C:/cmake/bin/cmake.exe',
        version: '3.28.0',
        detected: true,
        source: 'PATH',
        architecture: 'x64',
        notes: [],
      };
      const projects = [makeCMakeProject()];
      const result = resolveToolchainRequirements(snap, projects);
      const cmake = result.find(r => r.kind === 'cmake');
      expect(cmake?.currentlyInstalled).toBe(true);
    });

    it('marks ninja installed when snapshot.ninja.detected is true', () => {
      const snap = makeSnapshot();
      snap.ninja = {
        name: 'ninja',
        path: 'C:/ninja/ninja.exe',
        version: '1.11.1',
        detected: true,
        source: 'PATH',
        architecture: 'x64',
        notes: [],
      };
      const projects = [makeCMakeProject()];
      const result = resolveToolchainRequirements(snap, projects);
      const ninja = result.find(r => r.kind === 'ninja');
      expect(ninja?.currentlyInstalled).toBe(true);
    });
  });
});
