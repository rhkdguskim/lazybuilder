import { describe, it, expect } from 'vitest';
import { VsBuildToolsInstaller } from './VsBuildToolsInstaller.js';
import type { InstallStep } from '../../domain/models/InstallPlan.js';
import type { RequirementReason } from '../../domain/models/ToolchainRequirement.js';

function makeReason(): RequirementReason {
  return {
    source: 'csproj',
    filePath: '/proj/App.vcxproj',
    detail: 'PlatformToolset=v143',
    affectedProjects: ['App'],
  };
}

function makeStep(overrides: Partial<InstallStep> = {}): InstallStep {
  return {
    id: 'step-msvc',
    displayName: '',
    kind: 'msvc-toolset',
    version: 'v143',
    scope: 'machine',
    needsAdmin: true,
    sizeBytes: null,
    estimatedSeconds: null,
    source: { url: '', signer: '', channel: '' },
    command: { executable: '', args: [] },
    dependsOn: [],
    selected: false,
    reason: makeReason(),
    ...overrides,
  };
}

describe('VsBuildToolsInstaller — pure helpers', () => {
  it('buildArgs(cpp) emits VCTools workload with quiet/wait/norestart/nocache', () => {
    const installer = new VsBuildToolsInstaller();
    const args = installer.buildArgs('v143', new Set(['cpp']));

    expect(args).toContain('--quiet');
    expect(args).toContain('--wait');
    expect(args).toContain('--norestart');
    expect(args).toContain('--nocache');

    const addIdx = args.indexOf('--add');
    expect(addIdx).toBeGreaterThanOrEqual(0);
    expect(args[addIdx + 1]).toBe('Microsoft.VisualStudio.Workload.VCTools');
  });

  it('buildArgs combines cpp + cmake workloads', () => {
    const installer = new VsBuildToolsInstaller();
    const args = installer.buildArgs('v143', new Set(['cpp', 'cmake']));

    const addedIds = args
      .map((value, idx) => (args[idx - 1] === '--add' ? value : null))
      .filter((v): v is string => v != null);

    expect(addedIds).toContain('Microsoft.VisualStudio.Workload.VCTools');
    expect(addedIds).toContain('Microsoft.VisualStudio.Component.VC.CMake.Project');
  });

  it('buildArgs falls back to VCTools when no project kinds inferred', () => {
    const installer = new VsBuildToolsInstaller();
    const args = installer.buildArgs('v143', new Set());

    const addedIds = args
      .map((value, idx) => (args[idx - 1] === '--add' ? value : null))
      .filter((v): v is string => v != null);

    expect(addedIds).toEqual(['Microsoft.VisualStudio.Workload.VCTools']);
  });

  it('buildPreviewArgs returns the cached vs_BuildTools.exe path as executable', () => {
    const installer = new VsBuildToolsInstaller();
    const step = makeStep();
    const preview = installer.buildPreviewArgs(step);

    expect(preview.executable).toBe(installer.resolveBootstrapPath());
    expect(preview.executable.endsWith('vs_BuildTools.exe')).toBe(true);
    expect(preview.args).toContain('--quiet');
    expect(preview.args).toContain('--add');
  });

  it('resolveBootstrapPath points under ~/.lazybuilder/cache', () => {
    const installer = new VsBuildToolsInstaller();
    const path = installer.resolveBootstrapPath();
    expect(path).toMatch(/[\\/]\.lazybuilder[\\/]cache[\\/]vs_BuildTools\.exe$/);
  });

  it('run() throws a clear error on non-Windows platforms', async () => {
    if (process.platform === 'win32') {
      // Skip on Windows where run() would actually attempt to fetch.
      return;
    }
    const installer = new VsBuildToolsInstaller();
    await expect(
      installer.run({ step: makeStep() }),
    ).rejects.toThrow(/Windows/i);
  });

  it('ensureBootstrap() throws on non-Windows platforms', async () => {
    if (process.platform === 'win32') return;
    const installer = new VsBuildToolsInstaller();
    await expect(installer.ensureBootstrap()).rejects.toThrow(/Windows/i);
  });
});
