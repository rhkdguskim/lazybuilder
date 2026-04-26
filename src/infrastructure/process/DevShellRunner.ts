import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProcessRunner, runCommand } from './ProcessRunner.js';
import type { VsInstallation } from '../../domain/models/EnvironmentSnapshot.js';

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
    // After VsDevCmd/vcvarsall runs, msbuild is in PATH.
    // Use just the exe name to avoid path quoting issues.
    const simpleName = command.includes('\\') || command.includes('/')
      ? command.split(/[\\/]/).pop()!
      : command;

    // Normalize paths in args but preserve MSBuild switches (/p: /t: /m etc.)
    const winArgs = args.map(a => {
      // MSBuild switches start with / followed by a letter — don't touch these
      if (/^\/[a-zA-Z]/.test(a)) return a;
      // Quoted paths like "D:/project/..." — normalize slashes inside quotes
      return a.replace(/\//g, '\\');
    });
    const fullCmd = `${simpleName} ${winArgs.join(' ')}`;

    // Ensure Windows backslashes in path (msys/git-bash may convert)
    const winPath = this.devShellPath.replace(/\//g, '\\');

    let callPart: string;
    if (this.useVsDevCmd) {
      callPart = `call "${winPath}" -arch=${this.arch} -no_logo`;
    } else {
      callPart = `call "${winPath}" ${this.arch}`;
    }

    // Write a temp .bat file to avoid cmd.exe quoting hell
    this.startViaBat(callPart, fullCmd, cwd);
  }

  /** Create a temporary .bat file and execute it — no quoting issues */
  private startViaBat(setupCmd: string, buildCmd: string, cwd?: string): void {
    const batPath = join(tmpdir(), `lazybuilder_${Date.now()}.bat`);
    const batContent = [
      '@echo off',
      'chcp 65001 >nul',
      setupCmd,
      'if %errorlevel% neq 0 exit /b %errorlevel%',
      buildCmd,
      'exit /b %errorlevel%',
    ].join('\r\n');

    writeFileSync(batPath, batContent, 'utf-8');

    // Emit bat content as info for debugging
    this.emit('stdout', `[bat] ${batPath}`);
    this.emit('stdout', `[bat] setup: ${setupCmd}`);
    this.emit('stdout', `[bat] build: ${buildCmd}`);

    const winCwd = cwd?.replace(/\//g, '\\');
    this.child = nodeSpawn('cmd.exe', ['/C', batPath], {
      cwd: winCwd,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    // Cleanup bat file when process exits
    this.child.on('close', () => {
      try { unlinkSync(batPath); } catch { /* ignore */ }
    });

    if (this.child.stdout) {
      this.readLines(this.child.stdout, 'stdout');
    }
    if (this.child.stderr) {
      this.readLines(this.child.stderr, 'stderr');
    }

    this.child.on('error', (err: Error) => this.emit('error', err));
    this.child.on('close', (code: number | null) => this.emit('exit', code ?? 1));
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
