import { runCommand } from '../process/ProcessRunner.js';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

export type InstallMode = 'git-clone' | 'npm-global' | 'npm-local' | 'unknown';

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  mode: InstallMode;
  packageName: string;
  /** git mode only — kept so the TUI banner can render commit-count */
  behindCount?: number;
  currentCommit?: string;
  remoteCommit?: string;
}

export interface UpdateOutcome {
  success: boolean;
  mode: InstallMode;
  fromVersion: string;
  toVersion?: string;
  manualCommand?: string;
  error?: string;
}

/**
 * Dual-mode update checker:
 *  - git-clone   → git fetch + ff-only pull + npm install + npm run build
 *  - npm-global  → npm view <pkg> version, npm install -g <pkg>@latest
 *  - npm-local   → suggest manual command (project-managed)
 */
export class UpdateChecker {
  private repoDir: string;
  private currentVersion: string;
  private packageName = 'lazybuilder';
  private mode: InstallMode;

  constructor() {
    const thisFile = fileURLToPath(import.meta.url);
    this.repoDir = resolve(dirname(thisFile), '..', '..', '..');

    let version = '0.0.0';
    try {
      const pkg = JSON.parse(readFileSync(resolve(this.repoDir, 'package.json'), 'utf-8')) as {
        version?: string;
        name?: string;
      };
      version = pkg.version ?? '0.0.0';
      if (pkg.name) this.packageName = pkg.name;
    } catch { /* keep defaults */ }
    this.currentVersion = version;

    if (existsSync(resolve(this.repoDir, '.git'))) {
      this.mode = 'git-clone';
    } else if (this.repoDir.includes(`${sep}node_modules${sep}`)) {
      // Heuristic: global installs sit under <prefix>/lib/node_modules; local under <project>/node_modules
      this.mode = this.repoDir.includes(`${sep}lib${sep}node_modules${sep}`) ? 'npm-global' : 'npm-local';
    } else {
      this.mode = 'unknown';
    }
  }

  getInstallMode(): InstallMode { return this.mode; }
  getCurrentVersion(): string { return this.currentVersion; }
  getPackageName(): string { return this.packageName; }

  async check(): Promise<UpdateCheckResult | null> {
    if (this.mode === 'git-clone') return this.checkGit();
    if (this.mode === 'npm-global' || this.mode === 'npm-local') return this.checkNpm();
    return null;
  }

  async performUpdate(): Promise<UpdateOutcome> {
    const fromVersion = this.currentVersion;
    if (this.mode === 'git-clone') return this.updateGit(fromVersion);
    if (this.mode === 'npm-global') return this.updateNpmGlobal(fromVersion);
    if (this.mode === 'npm-local') {
      return {
        success: false,
        mode: this.mode,
        fromVersion,
        manualCommand: `npm install ${this.packageName}@latest`,
        error: 'Installed as a local dependency. Update via your project package manager.',
      };
    }
    return {
      success: false,
      mode: 'unknown',
      fromVersion,
      manualCommand: `npm install -g ${this.packageName}@latest`,
      error: 'Install mode could not be determined.',
    };
  }

  // ───── npm mode ─────

  private async checkNpm(): Promise<UpdateCheckResult | null> {
    const view = await runCommand('npm', ['view', this.packageName, 'version'], { timeout: 10000 });
    if (view.exitCode !== 0) return null;
    const latest = view.stdout.trim();
    if (!/^\d+\.\d+\.\d+/.test(latest)) return null;
    return {
      updateAvailable: this.isNewer(latest, this.currentVersion),
      currentVersion: this.currentVersion,
      latestVersion: latest,
      mode: this.mode,
      packageName: this.packageName,
    };
  }

  private async updateNpmGlobal(fromVersion: string): Promise<UpdateOutcome> {
    const cmd = `npm install -g ${this.packageName}@latest`;
    const result = await runCommand('npm', ['install', '-g', `${this.packageName}@latest`], { timeout: 180000 });
    if (result.exitCode === 0) {
      return { success: true, mode: 'npm-global', fromVersion, toVersion: 'latest' };
    }
    const isPermission = /EACCES|EPERM|permission/i.test(result.stderr);
    return {
      success: false,
      mode: 'npm-global',
      fromVersion,
      manualCommand: isPermission && process.platform !== 'win32' ? `sudo ${cmd}` : cmd,
      error: result.stderr.split('\n').slice(0, 3).join(' ').trim() || 'npm install failed',
    };
  }

  // ───── git mode ─────

  private async checkGit(): Promise<UpdateCheckResult | null> {
    const local = await runCommand('git', ['rev-parse', 'HEAD'], { cwd: this.repoDir, timeout: 5000 });
    if (local.exitCode !== 0) return null;
    const currentCommit = local.stdout.trim().substring(0, 8);

    const fetch = await runCommand('git', ['fetch', 'origin', '--quiet'], { cwd: this.repoDir, timeout: 15000 });
    if (fetch.exitCode !== 0) return null;

    let ref = 'origin/master';
    let remote = await runCommand('git', ['rev-parse', ref], { cwd: this.repoDir, timeout: 5000 });
    if (remote.exitCode !== 0) {
      ref = 'origin/main';
      remote = await runCommand('git', ['rev-parse', ref], { cwd: this.repoDir, timeout: 5000 });
      if (remote.exitCode !== 0) return null;
    }
    const remoteCommit = remote.stdout.trim().substring(0, 8);

    const count = await runCommand('git', ['rev-list', '--count', `HEAD..${ref}`], { cwd: this.repoDir, timeout: 5000 });
    const behind = count.exitCode === 0 ? (parseInt(count.stdout.trim(), 10) || 0) : 0;

    return {
      updateAvailable: behind > 0,
      currentVersion: this.currentVersion,
      latestVersion: this.currentVersion,
      mode: 'git-clone',
      packageName: this.packageName,
      behindCount: behind,
      currentCommit,
      remoteCommit,
    };
  }

  private async updateGit(fromVersion: string): Promise<UpdateOutcome> {
    const manualHint = `cd ${this.repoDir} && git pull --ff-only && npm install && npm run build`;

    const pull = await runCommand('git', ['pull', '--ff-only'], { cwd: this.repoDir, timeout: 60000 });
    if (pull.exitCode !== 0) {
      return { success: false, mode: 'git-clone', fromVersion, manualCommand: manualHint, error: 'git pull failed (working tree dirty?)' };
    }
    const install = await runCommand('npm', ['install'], { cwd: this.repoDir, timeout: 180000 });
    if (install.exitCode !== 0) {
      return { success: false, mode: 'git-clone', fromVersion, manualCommand: manualHint, error: 'npm install failed' };
    }
    const build = await runCommand('npm', ['run', 'build'], { cwd: this.repoDir, timeout: 180000 });
    if (build.exitCode !== 0) {
      return { success: false, mode: 'git-clone', fromVersion, manualCommand: manualHint, error: 'build failed' };
    }
    return { success: true, mode: 'git-clone', fromVersion };
  }

  private isNewer(candidate: string, baseline: string): boolean {
    const a = candidate.split(/[.+-]/).map(n => parseInt(n, 10) || 0);
    const b = baseline.split(/[.+-]/).map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] ?? 0;
      const y = b[i] ?? 0;
      if (x > y) return true;
      if (x < y) return false;
    }
    return false;
  }
}
