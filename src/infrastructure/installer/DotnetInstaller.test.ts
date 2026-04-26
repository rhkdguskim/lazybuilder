import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DotnetInstaller } from './DotnetInstaller.js';
import type { InstallStep, InstallScope } from '../../domain/models/InstallPlan.js';
import type { ToolchainKind, RequirementReason } from '../../domain/models/ToolchainRequirement.js';

function makeStep(overrides: Partial<InstallStep> & { kind: ToolchainKind; version: string; scope: InstallScope }): InstallStep {
  const reason: RequirementReason = {
    source: 'csproj',
    filePath: '/proj/App.csproj',
    detail: 'TargetFramework=net8.0',
    affectedProjects: ['App'],
  };
  return {
    id: 'step-1',
    displayName: 'Install',
    needsAdmin: false,
    sizeBytes: null,
    estimatedSeconds: null,
    source: { url: 'https://dot.net/v1/dotnet-install.ps1', signer: 'microsoft', channel: '8.0' },
    command: { executable: 'powershell', args: [] },
    dependsOn: [],
    selected: true,
    reason,
    ...overrides,
  };
}

describe('DotnetInstaller — pure helpers', () => {
  it('resolveInstallDir("user") points under the user home + .dotnet', () => {
    const installer = new DotnetInstaller();
    const dir = installer.resolveInstallDir('user');
    expect(dir).toBe(join(homedir(), '.dotnet'));
    expect(dir.endsWith('.dotnet')).toBe(true);
  });

  it('resolveInstallDir("machine") uses the Program Files path', () => {
    const installer = new DotnetInstaller();
    const dir = installer.resolveInstallDir('machine');
    const expectedRoot = process.env['ProgramFiles'] ?? 'C:\\Program Files';
    expect(dir).toBe(join(expectedRoot, 'dotnet'));
  });

  it('buildPreviewArgs SDK with versionSpec "8.0.x" uses -Channel 8.0 and -NoPath', () => {
    const installer = new DotnetInstaller();
    const step = makeStep({ kind: 'dotnet-sdk', version: '8.0.x', scope: 'user' });
    const preview = installer.buildPreviewArgs(step);

    expect(preview.executable).toBe('powershell');
    expect(preview.args).toContain('-File');
    expect(preview.args).toContain('-Channel');

    const channelIdx = preview.args.indexOf('-Channel');
    expect(preview.args[channelIdx + 1]).toBe('8.0');

    expect(preview.args).toContain('-NoPath');
    expect(preview.args).toContain('-InstallDir');
    const installDirIdx = preview.args.indexOf('-InstallDir');
    expect(preview.args[installDirIdx + 1]).toBe(installer.resolveInstallDir('user'));

    // SDK steps must NOT carry -Runtime
    expect(preview.args).not.toContain('-Runtime');
  });

  it('buildPreviewArgs SDK with exact "8.0.405" uses -Version 8.0.405 (not -Channel)', () => {
    const installer = new DotnetInstaller();
    const step = makeStep({ kind: 'dotnet-sdk', version: '8.0.405', scope: 'user' });
    const preview = installer.buildPreviewArgs(step);

    expect(preview.executable).toBe('powershell');
    expect(preview.args).toContain('-Version');
    const vIdx = preview.args.indexOf('-Version');
    expect(preview.args[vIdx + 1]).toBe('8.0.405');
    expect(preview.args).not.toContain('-Channel');
  });

  it('buildPreviewArgs runtime adds -Runtime dotnet', () => {
    const installer = new DotnetInstaller();
    const step = makeStep({ kind: 'dotnet-runtime', version: '8.0.x', scope: 'user' });
    const preview = installer.buildPreviewArgs(step);

    expect(preview.executable).toBe('powershell');
    expect(preview.args).toContain('-Runtime');
    const rIdx = preview.args.indexOf('-Runtime');
    expect(preview.args[rIdx + 1]).toBe('dotnet');
  });

  it('buildPreviewArgs workload returns dotnet workload install <id>', () => {
    const installer = new DotnetInstaller();
    const step = makeStep({ kind: 'dotnet-workload', version: 'android', scope: 'user' });
    const preview = installer.buildPreviewArgs(step);

    expect(preview.executable).toBe('dotnet');
    expect(preview.args).toEqual(['workload', 'install', 'android']);
  });
});
