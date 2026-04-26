import { runCommand } from '../process/ProcessRunner.js';
import { TIMEOUTS } from '../../config/timeouts.js';
import type { ToolInfo } from '../../domain/models/ToolInfo.js';
import { createToolInfo } from '../../domain/models/ToolInfo.js';
import type { SdkInfo } from '../../domain/models/SdkInfo.js';
import type { EnvironmentSnapshot } from '../../domain/models/EnvironmentSnapshot.js';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

export class DotnetDetector {
  async detect(): Promise<Partial<EnvironmentSnapshot>> {
    const tool = await this.detectTool();
    if (!tool.detected) {
      return { dotnet: { tool, sdks: [], runtimes: [], workloads: [], globalJsonPath: null, globalJsonSdkVersion: null } };
    }

    const [sdks, runtimes, workloads, globalJson] = await Promise.all([
      this.listSdks(),
      this.listRuntimes(),
      this.listWorkloads(),
      this.findGlobalJson(),
    ]);

    return {
      dotnet: {
        tool,
        sdks,
        runtimes,
        workloads,
        globalJsonPath: globalJson.path,
        globalJsonSdkVersion: globalJson.sdkVersion,
      },
    };
  }

  private async detectTool(): Promise<ToolInfo> {
    const result = await runCommand('dotnet', ['--version'], { timeout: TIMEOUTS.TOOL_VERSION });
    if (result.exitCode !== 0) {
      return createToolInfo({ name: 'dotnet', detected: false, notes: ['dotnet not found in PATH'] });
    }

    const version = result.stdout.trim();
    const pathResult = await runCommand(process.platform === 'win32' ? 'where' : 'which', ['dotnet'], { timeout: TIMEOUTS.QUICK_PROBE });
    const path = pathResult.stdout.trim().split('\n')[0] ?? null;

    return createToolInfo({
      name: 'dotnet',
      detected: true,
      version,
      path,
      source: 'PATH',
    });
  }

  private async listSdks(): Promise<SdkInfo[]> {
    const result = await runCommand('dotnet', ['--list-sdks'], { timeout: TIMEOUTS.TOOL_VERSION });
    if (result.exitCode !== 0) return [];

    return result.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\S+)\s+\[(.+)]$/);
        if (!match) return null;
        return {
          sdkType: 'dotnet-sdk' as const,
          version: match[1]!,
          installedPath: match[2]!,
          isSelected: false,
          isRequired: false,
          status: 'ok' as const,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null) as SdkInfo[];
  }

  private async listRuntimes(): Promise<SdkInfo[]> {
    const result = await runCommand('dotnet', ['--list-runtimes'], { timeout: TIMEOUTS.TOOL_VERSION });
    if (result.exitCode !== 0) return [];

    return result.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\S+)\s+(\S+)\s+\[(.+)]$/);
        if (!match) return null;
        return {
          sdkType: 'dotnet-runtime' as const,
          version: `${match[1]} ${match[2]}`,
          installedPath: match[3]!,
          isSelected: false,
          isRequired: false,
          status: 'ok' as const,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null) as SdkInfo[];
  }

  private async listWorkloads(): Promise<string[]> {
    const result = await runCommand('dotnet', ['workload', 'list'], { timeout: TIMEOUTS.TOOL_LIST });
    if (result.exitCode !== 0) return [];

    const lines = result.stdout.split('\n');
    const workloads: string[] = [];
    let pastHeader = false;

    for (const line of lines) {
      if (line.includes('---')) {
        pastHeader = true;
        continue;
      }
      if (pastHeader && line.trim()) {
        const name = line.trim().split(/\s+/)[0];
        if (name && !name.startsWith('Use') && !name.startsWith('There')) {
          workloads.push(name);
        }
      }
    }
    return workloads;
  }

  private async findGlobalJson(): Promise<{ path: string | null; sdkVersion: string | null }> {
    let dir = process.cwd();
    while (true) {
      const candidate = join(dir, 'global.json');
      if (existsSync(candidate)) {
        try {
          const content = JSON.parse(readFileSync(candidate, 'utf-8'));
          return { path: candidate, sdkVersion: content?.sdk?.version ?? null };
        } catch {
          return { path: candidate, sdkVersion: null };
        }
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return { path: null, sdkVersion: null };
  }
}
