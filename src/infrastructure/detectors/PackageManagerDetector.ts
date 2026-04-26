import { runCommand } from '../process/ProcessRunner.js';
import { TIMEOUTS } from '../../config/timeouts.js';
import type { ToolInfo } from '../../domain/models/ToolInfo.js';
import { createToolInfo } from '../../domain/models/ToolInfo.js';
import type { EnvironmentSnapshot } from '../../domain/models/EnvironmentSnapshot.js';

export class PackageManagerDetector {
  async detect(): Promise<Partial<EnvironmentSnapshot>> {
    const [vcpkg, nuget, conan, git, powershell] = await Promise.all([
      this.detectTool('vcpkg', ['version']),
      this.detectTool('nuget', ['help'], /NuGet Version:\s*(\S+)/),
      this.detectTool('conan', ['--version'], /Conan version\s*(\S+)/),
      this.detectGit(),
      this.detectPowershell(),
    ]);

    return {
      packageManagers: { vcpkg, nuget, conan },
      git,
      powershell,
    };
  }

  private async detectTool(name: string, args: string[], versionRegex?: RegExp): Promise<ToolInfo> {
    const result = await runCommand(name, args, { timeout: TIMEOUTS.TOOL_VERSION });
    if (result.exitCode !== 0 && result.exitCode !== -1) {
      // Some tools return non-zero for --version/help but still output version
    }

    const output = result.stdout + '\n' + result.stderr;
    let version: string | null = null;

    if (versionRegex) {
      const match = output.match(versionRegex);
      version = match?.[1] ?? null;
    } else {
      const match = output.match(/(\d+\.\d+\.\d+)/);
      version = match?.[1] ?? null;
    }

    if (result.exitCode === -1 && !version) {
      return createToolInfo({ name, detected: false });
    }

    return createToolInfo({
      name,
      detected: true,
      version,
      source: 'PATH',
    });
  }

  private async detectGit(): Promise<ToolInfo> {
    const result = await runCommand('git', ['--version'], { timeout: TIMEOUTS.QUICK_PROBE });
    if (result.exitCode !== 0) {
      return createToolInfo({ name: 'git', detected: false });
    }
    const match = result.stdout.match(/git version (\S+)/);
    return createToolInfo({
      name: 'git',
      detected: true,
      version: match?.[1] ?? null,
      source: 'PATH',
    });
  }

  private async detectPowershell(): Promise<ToolInfo> {
    // Try pwsh first (PowerShell Core), then powershell
    for (const cmd of ['pwsh', 'powershell']) {
      const result = await runCommand(cmd, ['--version'], { timeout: TIMEOUTS.QUICK_PROBE });
      if (result.exitCode === 0) {
        const match = result.stdout.match(/(\d+\.\d+\.\d+)/);
        return createToolInfo({
          name: cmd,
          detected: true,
          version: match?.[1] ?? null,
          source: 'PATH',
        });
      }
    }
    return createToolInfo({ name: 'powershell', detected: false });
  }
}
