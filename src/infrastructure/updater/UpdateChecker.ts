import { runCommand } from '../process/ProcessRunner.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentCommit: string;
  remoteCommit: string;
  behindCount: number;
}

/**
 * Checks if the installed buildercli has updates available on GitHub.
 * Uses git fetch + rev-list to compare local vs remote.
 */
export class UpdateChecker {
  private repoDir: string;

  constructor() {
    // Resolve the project root (where .git lives)
    const thisFile = fileURLToPath(import.meta.url);
    this.repoDir = resolve(dirname(thisFile), '..', '..', '..');
  }

  async check(): Promise<UpdateCheckResult | null> {
    // Verify this is a git repo
    const isGit = await runCommand('git', ['rev-parse', '--git-dir'], { cwd: this.repoDir, timeout: 5000 });
    if (isGit.exitCode !== 0) return null;

    // Get current commit
    const localResult = await runCommand('git', ['rev-parse', 'HEAD'], { cwd: this.repoDir, timeout: 5000 });
    if (localResult.exitCode !== 0) return null;
    const currentCommit = localResult.stdout.trim().substring(0, 8);

    // Fetch remote (quiet, timeout)
    const fetchResult = await runCommand('git', ['fetch', 'origin', '--quiet'], { cwd: this.repoDir, timeout: 15000 });
    if (fetchResult.exitCode !== 0) return null;

    // Get remote HEAD
    const remoteResult = await runCommand('git', ['rev-parse', 'origin/master'], { cwd: this.repoDir, timeout: 5000 });
    if (remoteResult.exitCode !== 0) {
      // Try origin/main
      const mainResult = await runCommand('git', ['rev-parse', 'origin/main'], { cwd: this.repoDir, timeout: 5000 });
      if (mainResult.exitCode !== 0) return null;
      const remoteCommit = mainResult.stdout.trim().substring(0, 8);
      const behind = await this.countBehind('origin/main');
      return { updateAvailable: behind > 0, currentCommit, remoteCommit, behindCount: behind };
    }

    const remoteCommit = remoteResult.stdout.trim().substring(0, 8);

    // Count how many commits behind
    const behind = await this.countBehind('origin/master');

    return {
      updateAvailable: behind > 0,
      currentCommit,
      remoteCommit,
      behindCount: behind,
    };
  }

  async performUpdate(): Promise<boolean> {
    // git pull --ff-only
    const pullResult = await runCommand('git', ['pull', '--ff-only'], { cwd: this.repoDir, timeout: 30000 });
    if (pullResult.exitCode !== 0) return false;

    // npm install (in case dependencies changed)
    const installResult = await runCommand('npm', ['install', '--production'], { cwd: this.repoDir, timeout: 60000 });
    if (installResult.exitCode !== 0) return false;

    // Rebuild
    const buildResult = await runCommand('npm', ['run', 'build'], { cwd: this.repoDir, timeout: 60000 });
    return buildResult.exitCode === 0;
  }

  private async countBehind(remoteBranch: string): Promise<number> {
    const result = await runCommand(
      'git', ['rev-list', '--count', `HEAD..${remoteBranch}`],
      { cwd: this.repoDir, timeout: 5000 },
    );
    if (result.exitCode !== 0) return 0;
    return parseInt(result.stdout.trim(), 10) || 0;
  }
}
