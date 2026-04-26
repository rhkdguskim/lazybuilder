import type { SdkInfo } from '../../domain/models/SdkInfo.js';
import type { EnvironmentSnapshot } from '../../domain/models/EnvironmentSnapshot.js';
import { runCommand } from '../process/ProcessRunner.js';
import { TIMEOUTS } from '../../config/timeouts.js';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
const pf = process.env['ProgramFiles'] ?? 'C:\\Program Files';

// Windows 10/11 SDK paths
const WIN10_SDK_PATHS = [
  join(pf86, 'Windows Kits', '10'),
  join(pf, 'Windows Kits', '10'),
];

// Windows 8.1 SDK paths
const WIN81_SDK_PATHS = [
  join(pf86, 'Windows Kits', '8.1'),
  join(pf, 'Windows Kits', '8.1'),
];

// Windows 8.0 SDK paths
const WIN80_SDK_PATHS = [
  join(pf86, 'Windows Kits', '8.0'),
  join(pf, 'Windows Kits', '8.0'),
];

// Windows 7 SDK (Microsoft SDKs) paths
const WIN7_SDK_PATHS = [
  join(pf86, 'Microsoft SDKs', 'Windows'),
  join(pf, 'Microsoft SDKs', 'Windows'),
];

// Registry keys for SDK discovery
const REGISTRY_KEYS = [
  { key: 'HKLM\\SOFTWARE\\Microsoft\\Windows Kits\\Installed Roots', value: 'KitsRoot10', label: 'Windows 10/11' },
  { key: 'HKLM\\SOFTWARE\\Microsoft\\Windows Kits\\Installed Roots', value: 'KitsRoot81', label: 'Windows 8.1' },
  { key: 'HKLM\\SOFTWARE\\Microsoft\\Windows Kits\\Installed Roots', value: 'KitsRoot', label: 'Windows 8.0' },
  { key: 'HKLM\\SOFTWARE\\Wow6432Node\\Microsoft\\Microsoft SDKs\\Windows', value: 'CurrentInstallFolder', label: 'Windows 7' },
  { key: 'HKLM\\SOFTWARE\\Microsoft\\Microsoft SDKs\\Windows', value: 'CurrentInstallFolder', label: 'Windows 7' },
];

export class WindowsSdkDetector {
  async detect(): Promise<Partial<EnvironmentSnapshot>> {
    if (process.platform !== 'win32') {
      return { windowsSdk: { versions: [] } };
    }

    const versions: SdkInfo[] = [];

    // 1. Windows 10/11 SDK (versioned subdirectories in Include/)
    this.scanWin10Kits(WIN10_SDK_PATHS, versions);

    // 2. Windows 8.1 SDK
    this.scanLegacyKit(WIN81_SDK_PATHS, '8.1', versions);

    // 3. Windows 8.0 SDK
    this.scanLegacyKit(WIN80_SDK_PATHS, '8.0', versions);

    // 4. Windows 7 SDK (Microsoft SDKs\Windows\vX.Y)
    this.scanWin7Sdk(WIN7_SDK_PATHS, versions);

    // 5. Registry fallback for anything we missed
    await this.scanRegistry(versions);

    // Sort: newest first
    versions.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));

    return { windowsSdk: { versions } };
  }

  /** Windows 10/11 SDK: Include/<version> directories */
  private scanWin10Kits(paths: string[], versions: SdkInfo[]): void {
    for (const basePath of paths) {
      const includeDir = join(basePath, 'Include');
      if (!existsSync(includeDir)) continue;
      try {
        const dirs = readdirSync(includeDir).filter(d => /^\d+\.\d+\.\d+\.\d+$/.test(d));
        for (const ver of dirs) {
          this.addIfNew(versions, ver, join(basePath, 'Include', ver), 'Windows 10/11 SDK');
        }
      } catch { /* ignore */ }
    }
  }

  /** Windows 8.1/8.0 SDK: flat structure, version from folder name */
  private scanLegacyKit(paths: string[], kitVersion: string, versions: SdkInfo[]): void {
    for (const basePath of paths) {
      if (!existsSync(basePath)) continue;

      // Check for Include directory (indicates SDK is installed)
      const includeDir = join(basePath, 'Include');
      if (existsSync(includeDir)) {
        // 8.1 SDK may have versioned subdirectories or flat structure
        try {
          const subdirs = readdirSync(includeDir).filter(d => /^\d+\.\d+/.test(d));
          if (subdirs.length > 0) {
            for (const ver of subdirs) {
              this.addIfNew(versions, ver, join(includeDir, ver), `Windows ${kitVersion} SDK`);
            }
          } else {
            // Flat structure - just the kit version
            this.addIfNew(versions, kitVersion, basePath, `Windows ${kitVersion} SDK`);
          }
        } catch {
          this.addIfNew(versions, kitVersion, basePath, `Windows ${kitVersion} SDK`);
        }
      }

      // Also check Lib directory as secondary indicator
      const libDir = join(basePath, 'Lib');
      if (existsSync(libDir) && !versions.some(v => v.version === kitVersion)) {
        this.addIfNew(versions, kitVersion, basePath, `Windows ${kitVersion} SDK`);
      }
    }
  }

  /** Windows 7 SDK: Microsoft SDKs\Windows\v7.0, v7.0A, v7.1, v7.1A */
  private scanWin7Sdk(paths: string[], versions: SdkInfo[]): void {
    for (const basePath of paths) {
      if (!existsSync(basePath)) continue;
      try {
        const dirs = readdirSync(basePath).filter(d => /^v\d+\.\d+/i.test(d));
        for (const dir of dirs) {
          const fullPath = join(basePath, dir);
          // Verify it has Include or Lib subdirectory
          if (existsSync(join(fullPath, 'Include')) || existsSync(join(fullPath, 'Lib'))) {
            const version = dir; // e.g., "v7.0A", "v7.1A"
            this.addIfNew(versions, version, fullPath, 'Microsoft Windows SDK');
          }
        }
      } catch { /* ignore */ }
    }
  }

  /** Registry-based discovery for SDKs not found via filesystem */
  private async scanRegistry(versions: SdkInfo[]): Promise<void> {
    for (const { key, value, label } of REGISTRY_KEYS) {
      try {
        const result = await runCommand(
          'reg',
          ['query', key, '/v', value],
          { timeout: TIMEOUTS.QUICK_PROBE },
        );
        if (result.exitCode !== 0) continue;

        const match = result.stdout.match(/REG_SZ\s+(.+)/);
        if (!match) continue;

        const sdkRoot = match[1]!.trim();
        if (!existsSync(sdkRoot)) continue;

        if (label === 'Windows 10/11') {
          // Versioned subdirs
          const includeDir = join(sdkRoot, 'Include');
          if (existsSync(includeDir)) {
            try {
              const dirs = readdirSync(includeDir).filter(d => /^\d+\.\d+\.\d+\.\d+$/.test(d));
              for (const ver of dirs) {
                this.addIfNew(versions, ver, join(includeDir, ver), label);
              }
            } catch { /* ignore */ }
          }
        } else if (label === 'Windows 8.1') {
          this.addIfNew(versions, '8.1', sdkRoot, label);
        } else if (label === 'Windows 8.0') {
          this.addIfNew(versions, '8.0', sdkRoot, label);
        } else if (label === 'Windows 7') {
          // Find version subdirs or use root
          try {
            const dirs = readdirSync(sdkRoot).filter(d => /^v\d+\.\d+/i.test(d));
            for (const dir of dirs) {
              this.addIfNew(versions, dir, join(sdkRoot, dir), label);
            }
          } catch {
            this.addIfNew(versions, '7.x', sdkRoot, label);
          }
        }
      } catch { /* ignore */ }
    }

    // Additional: check individual Windows SDK version registry keys
    await this.scanSdkVersionRegistry(versions);
  }

  /** Check per-version registry entries under Microsoft SDKs\Windows */
  private async scanSdkVersionRegistry(versions: SdkInfo[]): Promise<void> {
    const versionKeys = ['v6.0A', 'v7.0', 'v7.0A', 'v7.1', 'v7.1A', 'v8.0', 'v8.0A', 'v8.1', 'v8.1A', 'v10.0'];
    for (const ver of versionKeys) {
      for (const wow of ['', '\\Wow6432Node']) {
        try {
          const result = await runCommand(
            'reg',
            ['query', `HKLM\\SOFTWARE${wow}\\Microsoft\\Microsoft SDKs\\Windows\\${ver}`, '/v', 'InstallationFolder'],
            { timeout: TIMEOUTS.REGISTRY_PROBE },
          );
          if (result.exitCode !== 0) continue;
          const match = result.stdout.match(/REG_SZ\s+(.+)/);
          if (!match) continue;
          const folder = match[1]!.trim();
          if (existsSync(folder)) {
            this.addIfNew(versions, ver, folder, `Microsoft SDK ${ver}`);
          }
        } catch { /* ignore */ }
      }
    }
  }

  private addIfNew(versions: SdkInfo[], version: string, path: string, _source: string): void {
    if (versions.some(v => v.version === version && v.installedPath === path)) return;
    versions.push({
      sdkType: 'windows-sdk',
      version,
      installedPath: path,
      isSelected: false,
      isRequired: false,
      status: 'ok',
    });
  }
}
