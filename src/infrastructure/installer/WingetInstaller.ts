import { EventEmitter } from 'node:events';
import { runCommand } from '../process/ProcessRunner.js';
import { TIMEOUTS } from '../../config/timeouts.js';
import { logger } from '../logging/Logger.js';
import type { InstallStep } from '../../domain/models/InstallPlan.js';
import type { InstallerRunOptions } from './DotnetInstaller.js';
import { runWithEvents } from './VsBuildToolsInstaller.js';

const log = logger.child({ component: 'WingetInstaller' });

const IS_WINDOWS = process.platform === 'win32';

/** Default winget package IDs for each supported toolchain kind. */
export const WINGET_PACKAGE_FOR_KIND: Record<string, string> = {
  cmake: 'Kitware.CMake',
  ninja: 'Ninja-build.Ninja',
  // windows-sdk uses Microsoft.WindowsSDK.<MajorMinor>; resolved per-step.
};

export interface WingetPreviewArgs {
  executable: 'winget';
  args: string[];
}

/**
 * Installs Windows packages via the Microsoft `winget` package manager.
 * Used for cmake, ninja, and Windows SDK in the Phase 2 toolchain resolver.
 */
export class WingetInstaller extends EventEmitter {
  /** Returns true when `winget --version` resolves cleanly. */
  async isAvailable(): Promise<boolean> {
    if (!IS_WINDOWS) return false;
    const r = await runCommand('winget', ['--version'], {
      timeout: TIMEOUTS.QUICK_PROBE,
    });
    return r.exitCode === 0;
  }

  /**
   * Pure helper: build the argv that will be passed to `winget`.
   * Always includes `--silent` and accepts both source + package agreements
   * so unattended installs don't stall on a TOS prompt.
   *
   * Two call shapes are supported so callers can build a preview either
   * directly from a package id or by handing over an InstallStep (matches
   * the `InstallerLike` contract used by ToolchainService).
   */
  buildPreviewArgs(packageId: string, version?: string): WingetPreviewArgs;
  buildPreviewArgs(step: InstallStep): WingetPreviewArgs;
  buildPreviewArgs(arg: string | InstallStep, version?: string): WingetPreviewArgs {
    let packageId: string;
    let pinnedVersion: string | undefined;

    if (typeof arg === 'string') {
      packageId = arg;
      pinnedVersion = version;
    } else {
      packageId = this.resolvePackageId(arg);
      // For windows-sdk the package id already encodes the major.minor.build
      // tuple; pinning a four-segment "10.0.22621.0" version would fail.
      // For cmake we keep the version optional (winget picks the latest).
      pinnedVersion = undefined;
    }

    const args: string[] = [
      'install',
      packageId,
      '--silent',
      '--accept-package-agreements',
      '--accept-source-agreements',
    ];
    if (pinnedVersion) {
      args.push('--version', pinnedVersion);
    }
    return { executable: 'winget', args };
  }

  /**
   * Pure helper: derive the winget package id from an InstallStep. Windows SDK
   * version like `10.0.22621.0` is mapped to `Microsoft.WindowsSDK.10.0.22621`.
   */
  resolvePackageId(step: InstallStep): string {
    if (step.kind === 'cmake') return WINGET_PACKAGE_FOR_KIND.cmake!;
    if (step.kind === 'ninja') return WINGET_PACKAGE_FOR_KIND.ninja!;
    if (step.kind === 'windows-sdk') {
      const m = step.version.match(/^(\d+\.\d+\.\d+)/);
      const base = m ? m[1] : step.version;
      return `Microsoft.WindowsSDK.${base}`;
    }
    throw new Error(`WingetInstaller cannot resolve package for kind "${step.kind}"`);
  }

  async run(options: InstallerRunOptions): Promise<{ exitCode: number; logTail: string[] }> {
    const { step, signal } = options;
    if (!IS_WINDOWS) {
      throw new Error(
        'winget-based install is only supported on Windows. Install the package manually for now.',
      );
    }

    const available = await this.isAvailable();
    if (!available) {
      throw new Error(
        "winget is not available on PATH. Install 'App Installer' from the Microsoft Store and retry.",
      );
    }

    const packageId = this.resolvePackageId(step);
    const preview = this.buildPreviewArgs(packageId, step.kind === 'ninja' ? undefined : undefined);
    log.info('winget install', { stepId: step.id, packageId });

    return runWithEvents(this, step.id, 'winget', preview.args, signal);
  }
}
