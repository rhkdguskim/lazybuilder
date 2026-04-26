import { runCommand } from '../process/ProcessRunner.js';
import { TIMEOUTS } from '../../config/timeouts.js';
import type { EnvironmentSnapshot, VsInstallation } from '../../domain/models/EnvironmentSnapshot.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const VSWHERE_PATHS = [
  join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe'),
  join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe'),
];

export class VisualStudioDetector {
  async detect(): Promise<Partial<EnvironmentSnapshot>> {
    if (process.platform !== 'win32') {
      return { visualStudio: { installations: [] } };
    }

    const vswherePath = VSWHERE_PATHS.find(p => existsSync(p));
    if (!vswherePath) {
      return { visualStudio: { installations: [] } };
    }

    const result = await runCommand(
      `"${vswherePath}"`,
      ['-all', '-format', 'json', '-products', '*', '-requires', 'Microsoft.Component.MSBuild'],
      { timeout: TIMEOUTS.TOOL_LIST },
    );

    if (result.exitCode !== 0) {
      return { visualStudio: { installations: [] } };
    }

    try {
      const raw = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
      const installations: VsInstallation[] = raw.map((inst) => {
        const installPath = String(inst['installationPath'] ?? '');
        const components = (inst['packages'] as Array<{ id: string }> | undefined) ?? [];
        const componentIds = new Set(components.map(c => c.id));

        return {
          instanceId: String(inst['instanceId'] ?? ''),
          displayName: String(inst['displayName'] ?? ''),
          version: String(inst['installationVersion'] ?? ''),
          installPath,
          edition: this.extractEdition(String(inst['productId'] ?? '')),
          hasMsBuild: componentIds.has('Microsoft.Component.MSBuild'),
          hasVcTools: componentIds.has('Microsoft.VisualStudio.Component.VC.Tools.x86.x64'),
          hasWindowsSdk: [...componentIds].some(id => id.startsWith('Microsoft.VisualStudio.Component.Windows10SDK') || id.startsWith('Microsoft.VisualStudio.Component.Windows11SDK')),
        };
      });

      return { visualStudio: { installations } };
    } catch {
      return { visualStudio: { installations: [] } };
    }
  }

  private extractEdition(productId: string): string {
    if (productId.includes('Enterprise')) return 'Enterprise';
    if (productId.includes('Professional')) return 'Professional';
    if (productId.includes('Community')) return 'Community';
    if (productId.includes('BuildTools')) return 'BuildTools';
    return 'Unknown';
  }
}
