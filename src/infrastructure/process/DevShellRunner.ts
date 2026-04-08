import { ProcessRunner, runCommand } from './ProcessRunner.js';
import type { VsInstallation } from '../../domain/models/EnvironmentSnapshot.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Wraps build commands inside a Developer Command Prompt session.
 * Supports both vcvarsall.bat and VsDevCmd.bat.
 *
 * This is critical for:
 * - v141_xp toolset (needs legacy SDK paths)
 * - v141, v142, v143 toolsets (needs INCLUDE/LIB/LIBPATH)
 * - Any C++ build that requires Windows SDK paths
 */
export class DevShellRunner extends ProcessRunner {
  constructor(
    private devShellPath: string,
    private arch: string = 'x64',
    private useVsDevCmd: boolean = false,
  ) {
    super();
  }

  startWithDevShell(command: string, args: string[], cwd?: string): void {
    const fullCmd = `${command} ${args.join(' ')}`;

    let wrappedCommand: string;
    if (this.useVsDevCmd) {
      // VsDevCmd.bat sets up the full VS environment (includes vcvars)
      wrappedCommand = `chcp 65001 >nul && call "${this.devShellPath}" -arch=${this.arch} -no_logo && ${fullCmd}`;
    } else {
      // vcvarsall.bat <arch>
      wrappedCommand = `chcp 65001 >nul && call "${this.devShellPath}" ${this.arch} && ${fullCmd}`;
    }

    this.start({
      command: `cmd /C "${wrappedCommand}"`,
      cwd,
      shell: false,
      forceUtf8: false, // Already handling chcp in the command
    });
  }
}

/**
 * Find the best developer shell script for a given VS installation.
 * Prefers VsDevCmd.bat (more complete) over vcvarsall.bat.
 */
export function findDevShellPath(installation: VsInstallation): {
  path: string;
  isVsDevCmd: boolean;
} | null {
  const installPath = installation.installPath;

  // VsDevCmd.bat - sets up full development environment
  const vsDevCmd = join(installPath, 'Common7', 'Tools', 'VsDevCmd.bat');
  if (existsSync(vsDevCmd)) {
    return { path: vsDevCmd, isVsDevCmd: true };
  }

  // vcvarsall.bat - sets up C++ compilation environment
  const vcvarsall = join(installPath, 'VC', 'Auxiliary', 'Build', 'vcvarsall.bat');
  if (existsSync(vcvarsall)) {
    return { path: vcvarsall, isVsDevCmd: false };
  }

  // VS2017 Community path variant
  const vcvarsall2017 = join(installPath, 'VC', 'Auxiliary', 'Build', 'vcvarsall.bat');
  if (existsSync(vcvarsall2017)) {
    return { path: vcvarsall2017, isVsDevCmd: false };
  }

  return null;
}

/**
 * Find the best VS installation that supports a given platform toolset.
 * e.g., v141 → VS2017, v142 → VS2019, v143 → VS2022
 */
export function findBestInstallation(
  installations: VsInstallation[],
  platformToolset?: string | null,
): VsInstallation | null {
  if (installations.length === 0) return null;

  // If no specific toolset needed, use the latest
  if (!platformToolset) {
    return installations[0]!;
  }

  // Map toolset prefix to VS major version
  const toolsetToMajor: Record<string, number> = {
    v120: 12, // VS2013
    v140: 14, // VS2015
    v141: 15, // VS2017
    v142: 16, // VS2019
    v143: 17, // VS2022
  };

  // Extract base toolset (v141_xp → v141)
  const baseToolset = platformToolset.replace(/_xp$/, '');
  const targetMajor = toolsetToMajor[baseToolset];

  if (targetMajor) {
    // Try exact match first
    const exact = installations.find(i => {
      const major = parseInt(i.version.split('.')[0]!, 10);
      return major === targetMajor;
    });
    if (exact) return exact;
  }

  // Fallback: latest installation (newer VS can build older toolset projects)
  return installations[0]!;
}

/**
 * Captures environment variables set by the developer shell.
 * Returns only the variables that differ from the current environment.
 */
export async function captureDevShellEnv(
  devShellPath: string,
  arch: string = 'x64',
  isVsDevCmd: boolean = false,
): Promise<Record<string, string>> {
  const setupCmd = isVsDevCmd
    ? `call "${devShellPath}" -arch=${arch} -no_logo >nul 2>&1`
    : `call "${devShellPath}" ${arch} >nul 2>&1`;

  const result = await runCommand(
    'cmd',
    ['/C', `${setupCmd} && set`],
    { timeout: 30000 },
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to capture dev shell environment: ${result.stderr}`);
  }

  const env: Record<string, string> = {};
  for (const line of result.stdout.split('\n')) {
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0) {
      const key = line.substring(0, eqIdx);
      const value = line.substring(eqIdx + 1).trim();
      if (process.env[key] !== value) {
        env[key] = value;
      }
    }
  }

  return env;
}
