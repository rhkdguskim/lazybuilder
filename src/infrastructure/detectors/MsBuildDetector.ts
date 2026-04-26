import { runCommand } from '../process/ProcessRunner.js';
import { TIMEOUTS } from '../../config/timeouts.js';
import type { ToolInfo } from '../../domain/models/ToolInfo.js';
import { createToolInfo } from '../../domain/models/ToolInfo.js';
import type { EnvironmentSnapshot, VsInstallation } from '../../domain/models/EnvironmentSnapshot.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const MSBUILD_RELATIVE_PATHS = [
  'MSBuild\\Current\\Bin\\amd64\\MSBuild.exe',
  'MSBuild\\Current\\Bin\\MSBuild.exe',
];

export class MsBuildDetector {
  async detect(vsInstallations?: VsInstallation[]): Promise<Partial<EnvironmentSnapshot>> {
    const instances: ToolInfo[] = [];

    // Detect from VS installations
    if (vsInstallations) {
      for (const vs of vsInstallations) {
        for (const relPath of MSBUILD_RELATIVE_PATHS) {
          const fullPath = join(vs.installPath, relPath);
          if (existsSync(fullPath)) {
            const version = await this.getMsBuildVersion(fullPath);
            instances.push(createToolInfo({
              name: 'msbuild',
              detected: true,
              path: fullPath,
              version,
              source: `Visual Studio ${vs.edition}`,
              architecture: relPath.includes('amd64') ? 'x64' : 'x86',
            }));
          }
        }
      }
    }

    // Detect from PATH
    if (instances.length === 0) {
      const pathResult = await runCommand(
        process.platform === 'win32' ? 'where' : 'which',
        ['msbuild'],
        { timeout: TIMEOUTS.QUICK_PROBE },
      );
      if (pathResult.exitCode === 0) {
        const path = pathResult.stdout.trim().split('\n')[0]!;
        const version = await this.getMsBuildVersion(path);
        instances.push(createToolInfo({
          name: 'msbuild',
          detected: true,
          path,
          version,
          source: 'PATH',
        }));
      }
    }

    return {
      msbuild: {
        instances,
        selectedPath: instances[0]?.path ?? null,
      },
    };
  }

  private async getMsBuildVersion(path: string): Promise<string | null> {
    const result = await runCommand(`"${path}"`, ['/version', '/nologo'], { timeout: TIMEOUTS.TOOL_VERSION });
    if (result.exitCode !== 0) return null;
    const lines = result.stdout.trim().split('\n');
    return lines[lines.length - 1]?.trim() ?? null;
  }
}
