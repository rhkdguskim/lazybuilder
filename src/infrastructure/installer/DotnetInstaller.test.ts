import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DotnetInstaller } from './DotnetInstaller.js';
import type { InstallStep, InstallScope } from '../../domain/models/InstallPlan.js';
import type { ToolchainKind, RequirementReason } from '../../domain/models/ToolchainRequirement.js';

const IS_WINDOWS = process.platform === 'win32';

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
    source: {
      url: IS_WINDOWS ? 'https://dot.net/v1/dotnet-install.ps1' : 'https://dot.net/v1/dotnet-install.sh',
      signer: 'microsoft',
      channel: '8.0',
    },
    command: { executable: IS_WINDOWS ? 'powershell' : 'bash', args: [] },
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

  it('resolveInstallDir("machine") returns the platform-conventional system path', () => {
    const installer = new DotnetInstaller();
    const dir = installer.resolveInstallDir('machine');
    if (IS_WINDOWS) {
      const expectedRoot = process.env['ProgramFiles'] ?? 'C:\\Program Files';
      expect(dir).toBe(join(expectedRoot, 'dotnet'));
    } else {
      expect(dir).toBe('/usr/local/share/dotnet');
    }
  });

  it('buildPreviewArgs SDK with versionSpec "8.0.x" carries the channel flag for the current platform', () => {
    const installer = new DotnetInstaller();
    const step = makeStep({ kind: 'dotnet-sdk', version: '8.0.x', scope: 'user' });
    const preview = installer.buildPreviewArgs(step);

    if (IS_WINDOWS) {
      expect(preview.executable).toBe('powershell');
      expect(preview.args).toContain('-File');
      expect(preview.args).toContain('-Channel');
      const channelIdx = preview.args.indexOf('-Channel');
      expect(preview.args[channelIdx + 1]).toBe('8.0');
      expect(preview.args).toContain('-NoPath');
      expect(preview.args).toContain('-InstallDir');
      const installDirIdx = preview.args.indexOf('-InstallDir');
      expect(preview.args[installDirIdx + 1]).toBe(installer.resolveInstallDir('user'));
      expect(preview.args).not.toContain('-Runtime');
    } else {
      expect(preview.executable).toBe('bash');
      expect(preview.args).toContain('--channel');
      const channelIdx = preview.args.indexOf('--channel');
      expect(preview.args[channelIdx + 1]).toBe('8.0');
      expect(preview.args).toContain('--no-path');
      expect(preview.args).toContain('--install-dir');
      const installDirIdx = preview.args.indexOf('--install-dir');
      expect(preview.args[installDirIdx + 1]).toBe(installer.resolveInstallDir('user'));
      expect(preview.args).not.toContain('--runtime');
    }
  });

  it('buildPreviewArgs SDK with exact "8.0.405" pins the version (no channel)', () => {
    const installer = new DotnetInstaller();
    const step = makeStep({ kind: 'dotnet-sdk', version: '8.0.405', scope: 'user' });
    const preview = installer.buildPreviewArgs(step);

    if (IS_WINDOWS) {
      expect(preview.executable).toBe('powershell');
      expect(preview.args).toContain('-Version');
      const vIdx = preview.args.indexOf('-Version');
      expect(preview.args[vIdx + 1]).toBe('8.0.405');
      expect(preview.args).not.toContain('-Channel');
    } else {
      expect(preview.executable).toBe('bash');
      expect(preview.args).toContain('--version');
      const vIdx = preview.args.indexOf('--version');
      expect(preview.args[vIdx + 1]).toBe('8.0.405');
      expect(preview.args).not.toContain('--channel');
    }
  });

  it('buildPreviewArgs runtime carries the runtime flag', () => {
    const installer = new DotnetInstaller();
    const step = makeStep({ kind: 'dotnet-runtime', version: '8.0.x', scope: 'user' });
    const preview = installer.buildPreviewArgs(step);

    if (IS_WINDOWS) {
      expect(preview.executable).toBe('powershell');
      expect(preview.args).toContain('-Runtime');
      const rIdx = preview.args.indexOf('-Runtime');
      expect(preview.args[rIdx + 1]).toBe('dotnet');
    } else {
      expect(preview.executable).toBe('bash');
      expect(preview.args).toContain('--runtime');
      const rIdx = preview.args.indexOf('--runtime');
      expect(preview.args[rIdx + 1]).toBe('dotnet');
    }
  });

  it('buildPreviewArgs workload returns dotnet workload install <id>', () => {
    const installer = new DotnetInstaller();
    const step = makeStep({ kind: 'dotnet-workload', version: 'android', scope: 'user' });
    const preview = installer.buildPreviewArgs(step);

    expect(preview.executable).toBe('dotnet');
    expect(preview.args).toEqual(['workload', 'install', 'android']);
  });
});
