import { describe, it, expect } from 'vitest';
import { WingetInstaller } from './WingetInstaller.js';
import type { InstallStep } from '../../domain/models/InstallPlan.js';
import type { RequirementReason } from '../../domain/models/ToolchainRequirement.js';

function makeReason(): RequirementReason {
  return {
    source: 'inferred',
    filePath: null,
    detail: 'cmake required',
    affectedProjects: ['App'],
  };
}

function makeStep(overrides: Partial<InstallStep> & Pick<InstallStep, 'kind' | 'version'>): InstallStep {
  return {
    id: 'step-x',
    displayName: '',
    scope: 'user',
    needsAdmin: false,
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

describe('WingetInstaller — pure helpers', () => {
  it('buildPreviewArgs(packageId) emits silent + accept-agreements flags', () => {
    const installer = new WingetInstaller();
    const preview = installer.buildPreviewArgs('Kitware.CMake');

    expect(preview.executable).toBe('winget');
    expect(preview.args.slice(0, 2)).toEqual(['install', 'Kitware.CMake']);
    expect(preview.args).toContain('--silent');
    expect(preview.args).toContain('--accept-package-agreements');
    expect(preview.args).toContain('--accept-source-agreements');
    expect(preview.args).not.toContain('--version');
  });

  it('buildPreviewArgs(packageId, version) appends --version <v>', () => {
    const installer = new WingetInstaller();
    const preview = installer.buildPreviewArgs('Kitware.CMake', '3.28.0');

    const idx = preview.args.indexOf('--version');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(preview.args[idx + 1]).toBe('3.28.0');
  });

  it('buildPreviewArgs(step) for cmake derives the Kitware.CMake package id', () => {
    const installer = new WingetInstaller();
    const step = makeStep({ kind: 'cmake', version: '>=3.20' });
    const preview = installer.buildPreviewArgs(step);

    expect(preview.executable).toBe('winget');
    expect(preview.args[1]).toBe('Kitware.CMake');
    expect(preview.args).toContain('--silent');
  });

  it('buildPreviewArgs(step) for ninja derives the Ninja-build.Ninja package id', () => {
    const installer = new WingetInstaller();
    const step = makeStep({ kind: 'ninja', version: 'latest' });
    const preview = installer.buildPreviewArgs(step);

    expect(preview.args[1]).toBe('Ninja-build.Ninja');
  });

  it('buildPreviewArgs(step) for windows-sdk maps version to Microsoft.WindowsSDK.<MajorMinorBuild>', () => {
    const installer = new WingetInstaller();
    const step = makeStep({ kind: 'windows-sdk', version: '10.0.22621.0' });
    const preview = installer.buildPreviewArgs(step);

    expect(preview.args[1]).toBe('Microsoft.WindowsSDK.10.0.22621');
  });

  it('resolvePackageId throws for unsupported kinds (e.g. dotnet-sdk)', () => {
    const installer = new WingetInstaller();
    const step = makeStep({ kind: 'dotnet-sdk', version: '8.0.405' });
    expect(() => installer.resolvePackageId(step)).toThrow(/cannot resolve/i);
  });

  it('run() throws a clear error on non-Windows platforms', async () => {
    if (process.platform === 'win32') return;
    const installer = new WingetInstaller();
    const step = makeStep({ kind: 'cmake', version: '>=3.20' });
    await expect(installer.run({ step })).rejects.toThrow(/Windows/i);
  });

  it('isAvailable() returns false on non-Windows platforms', async () => {
    if (process.platform === 'win32') return;
    const installer = new WingetInstaller();
    expect(await installer.isAvailable()).toBe(false);
  });
});
