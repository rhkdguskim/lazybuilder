import type { ToolInfo } from '../../domain/models/ToolInfo.js';
import { createToolInfo } from '../../domain/models/ToolInfo.js';
import type { SdkInfo } from '../../domain/models/SdkInfo.js';
import type { EnvironmentSnapshot, VsInstallation } from '../../domain/models/EnvironmentSnapshot.js';
import { runCommand } from '../process/ProcessRunner.js';
import { TIMEOUTS } from '../../config/timeouts.js';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export class CppToolchainDetector {
  async detect(vsInstallations?: VsInstallation[]): Promise<Partial<EnvironmentSnapshot>> {
    if (process.platform !== 'win32') {
      return { cpp: { clExe: null, linkExe: null, libExe: null, rcExe: null, dumpbinExe: null, toolsets: [], vcvarsPath: null, vcEnvironmentActive: false } };
    }

    let clExe: ToolInfo | null = null;
    let linkExe: ToolInfo | null = null;
    let libExe: ToolInfo | null = null;
    let rcExe: ToolInfo | null = null;
    let dumpbinExe: ToolInfo | null = null;
    let vcvarsPath: string | null = null;
    const toolsets: SdkInfo[] = [];

    // Check if VC environment is already active
    const vcEnvironmentActive = !!process.env['VCINSTALLDIR'];

    if (vcEnvironmentActive) {
      clExe = await this.detectToolFromPath('cl');
      linkExe = await this.detectToolFromPath('link');
      libExe = await this.detectToolFromPath('lib');
      rcExe = await this.detectToolFromPath('rc');
      dumpbinExe = await this.detectToolFromPath('dumpbin');
    }

    // Discover from VS installations
    if (vsInstallations) {
      for (const vs of vsInstallations) {
        const vcToolsBase = join(vs.installPath, 'VC', 'Tools', 'MSVC');
        if (existsSync(vcToolsBase)) {
          try {
            const versions = readdirSync(vcToolsBase).filter(d => /^\d+\.\d+/.test(d));
            for (const ver of versions) {
              const binDir = join(vcToolsBase, ver, 'bin', 'Hostx64', 'x64');
              if (existsSync(binDir)) {
                toolsets.push({
                  sdkType: 'msvc-toolset',
                  version: ver,
                  installedPath: join(vcToolsBase, ver),
                  isSelected: false,
                  isRequired: false,
                  status: 'ok',
                });

                if (!clExe?.detected) {
                  const clPath = join(binDir, 'cl.exe');
                  if (existsSync(clPath)) {
                    clExe = createToolInfo({ name: 'cl.exe', detected: true, path: clPath, version: ver, source: `VS ${vs.edition}`, architecture: 'x64' });
                    linkExe = createToolInfo({ name: 'link.exe', detected: existsSync(join(binDir, 'link.exe')), path: join(binDir, 'link.exe'), version: ver, source: `VS ${vs.edition}`, architecture: 'x64' });
                    libExe = createToolInfo({ name: 'lib.exe', detected: existsSync(join(binDir, 'lib.exe')), path: join(binDir, 'lib.exe'), version: ver, source: `VS ${vs.edition}`, architecture: 'x64' });
                    dumpbinExe = createToolInfo({ name: 'dumpbin.exe', detected: existsSync(join(binDir, 'dumpbin.exe')), path: join(binDir, 'dumpbin.exe'), version: ver, source: `VS ${vs.edition}`, architecture: 'x64' });
                  }
                }
              }
            }
          } catch { /* ignore fs errors */ }
        }

        // Find vcvarsall.bat
        const vcvarsCandidate = join(vs.installPath, 'VC', 'Auxiliary', 'Build', 'vcvarsall.bat');
        if (!vcvarsPath && existsSync(vcvarsCandidate)) {
          vcvarsPath = vcvarsCandidate;
        }

        // rc.exe lives in the Windows SDK — handled by WindowsSdkDetector, not here
      }
    }

    return {
      cpp: {
        clExe,
        linkExe,
        libExe,
        rcExe,
        dumpbinExe,
        toolsets,
        vcvarsPath,
        vcEnvironmentActive,
      },
    };
  }

  private async detectToolFromPath(name: string): Promise<ToolInfo> {
    const result = await runCommand('where', [name], { timeout: TIMEOUTS.QUICK_PROBE });
    if (result.exitCode !== 0) {
      return createToolInfo({ name, detected: false });
    }
    const path = result.stdout.trim().split('\n')[0]!;
    return createToolInfo({ name, detected: true, path, source: 'PATH' });
  }
}
